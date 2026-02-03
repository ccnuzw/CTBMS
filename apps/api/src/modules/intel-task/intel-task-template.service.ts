import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { IntelTaskService } from './intel-task.service';
import {
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    BatchDistributeTasksDto,
    IntelTaskType,
    IntelTaskPriority,
} from '@packages/types';
import { computePeriodInfo } from './intel-task-schedule.utils';

@Injectable()
export class IntelTaskTemplateService {
    constructor(
        private prisma: PrismaService,
        private taskService: IntelTaskService
    ) { }

    /**
     * 创建任务模板
     */
    async create(dto: CreateIntelTaskTemplateDto & { createdById: string }) {
        return this.prisma.intelTaskTemplate.create({
            data: {
                ...dto,
            },
        });
    }

    /**
     * 更新任务模板
     */
    async update(id: string, dto: UpdateIntelTaskTemplateDto) {
        const existing = await this.prisma.intelTaskTemplate.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('模板不存在');
        }
        return this.prisma.intelTaskTemplate.update({
            where: { id },
            data: { ...dto },
        });
    }

    /**
     * 获取所有模板
     */
    async findAll() {
        return this.prisma.intelTaskTemplate.findMany({
            orderBy: { updatedAt: 'desc' },
        });
    }

    /**
     * 获取单个模板
     */
    async findOne(id: string) {
        return this.prisma.intelTaskTemplate.findUnique({
            where: { id },
        });
    }

    /**
     * 删除模板
     */
    async remove(id: string) {
        return this.prisma.intelTaskTemplate.delete({
            where: { id },
        });
    }

    /**
     * 执行任务分发 (手动触发或批量分发)
     */
    async distributeTasks(dto: BatchDistributeTasksDto, triggeredById: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: dto.templateId },
        });

        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        if (template.targetPointType) {
            const result = await this.executeTemplateByPointType(template.id, triggeredById);
            return {
                count: result.count,
                message: result.message,
                assigneeIds: [],
            };
        }

        const result = await this.createTasksFromTemplate(template, {
            assigneeIds: dto.assigneeIds,
            overrideDeadline: dto.overrideDeadline ? new Date(dto.overrideDeadline) : undefined,
            triggeredById,
            runAt: new Date(),
        });

        return {
            count: result.count,
            message: `成功分发 ${result.count} 个任务`,
            assigneeIds: result.assigneeIds,
        };
    }

    async createTasksFromTemplate(
        template: any,
        opts: {
            assigneeIds?: string[];
            overrideDeadline?: Date;
            triggeredById?: string;
            runAt: Date;
        },
    ) {
        if (
            template.assigneeMode === 'BY_COLLECTION_POINT' &&
            (template.collectionPointId || (template.collectionPointIds && template.collectionPointIds.length > 0))
        ) {
            const pointIds = template.collectionPointId
                ? [template.collectionPointId]
                : template.collectionPointIds;

            const points = await this.prisma.collectionPoint.findMany({
                where: {
                    id: { in: pointIds },
                    isActive: true,
                },
                include: {
                    allocations: {
                        where: { isActive: true },
                        select: { userId: true, commodity: true },
                    },
                },
            });

            if (points.length === 0) {
                return { count: 0, assigneeIds: [] as string[] };
            }

            const allUserIds = [...new Set(points.flatMap(p => p.allocations.map(a => a.userId)))];
            if (allUserIds.length === 0) {
                return { count: 0, assigneeIds: [] as string[] };
            }

            const assigneeSnapshots = await this.prisma.user.findMany({
                where: { id: { in: allUserIds } },
                select: { id: true, organizationId: true, departmentId: true },
            });
            const assigneeMap = new Map(
                assigneeSnapshots.map(item => [
                    item.id,
                    { organizationId: item.organizationId, departmentId: item.departmentId },
                ]),
            );

            const anchorDate = opts.overrideDeadline || opts.runAt;
            const periodInfo = computePeriodInfo(template, anchorDate, opts.overrideDeadline);
            const legacyDeadline = new Date(anchorDate);
            legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
            const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

            const tasksToCreate: any[] = [];
            for (const point of points) {
                for (const allocation of point.allocations) {
                    const snapshot = assigneeMap.get(allocation.userId);

                    // Determine target commodities
                    // If assigned specific commodity, task for that.
                    // If assigned "All" (null), task for ALL point commodities.
                    const commoditiesToTask = allocation.commodity
                        ? [allocation.commodity]
                        : (point.commodities && point.commodities.length > 0 ? point.commodities : [null]);

                    for (const comm of commoditiesToTask) {
                        const titleSuffix = comm ? ` [${comm}]` : '';
                        tasksToCreate.push({
                            title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + titleSuffix,
                            description: template.description || undefined,
                            type: template.taskType,
                            priority: template.priority,
                            deadline: effectiveDeadline,
                            periodStart: periodInfo.periodStart || undefined,
                            periodEnd: periodInfo.periodEnd || undefined,
                            dueAt: periodInfo.dueAt || undefined,
                            periodKey: periodInfo.periodKey || undefined,
                            assigneeId: allocation.userId,
                            assigneeOrgId: snapshot?.organizationId || undefined,
                            assigneeDeptId: snapshot?.departmentId || undefined,
                            createdById: opts.triggeredById,
                            templateId: template.id,
                            collectionPointId: point.id,
                            commodity: comm || undefined,
                        });
                    }
                }
            }

            if (tasksToCreate.length === 0) {
                return { count: 0, assigneeIds: [] as string[] };
            }

            await this.taskService.createMany(tasksToCreate as any);

            await this.prisma.intelTaskTemplate.update({
                where: { id: template.id },
                data: { lastRunAt: opts.runAt },
            });

            return { count: tasksToCreate.length, assigneeIds: allUserIds };
        }

        const targetAssigneeIds = await this.resolveAssigneesWithOverride(template, opts.assigneeIds);

        if (targetAssigneeIds.length === 0) {
            return { count: 0, assigneeIds: [] as string[] };
        }

        const assigneeSnapshots = await this.prisma.user.findMany({
            where: { id: { in: targetAssigneeIds } },
            select: { id: true, organizationId: true, departmentId: true },
        });
        const assigneeMap = new Map(
            assigneeSnapshots.map(item => [
                item.id,
                { organizationId: item.organizationId, departmentId: item.departmentId },
            ]),
        );

        const anchorDate = opts.overrideDeadline || opts.runAt;
        const periodInfo = computePeriodInfo(template, anchorDate, opts.overrideDeadline);
        const legacyDeadline = new Date(anchorDate);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

        const tasksToCreate = targetAssigneeIds.map(userId => {
            const snapshot = assigneeMap.get(userId);
            return {
                title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                description: template.description || undefined,
                type: template.taskType,
                priority: template.priority,
                deadline: effectiveDeadline,
                periodStart: periodInfo.periodStart || undefined,
                periodEnd: periodInfo.periodEnd || undefined,
                dueAt: periodInfo.dueAt || undefined,
                periodKey: periodInfo.periodKey || undefined,
                assigneeId: userId,
                assigneeOrgId: snapshot?.organizationId || undefined,
                assigneeDeptId: snapshot?.departmentId || undefined,
                createdById: opts.triggeredById,
                templateId: template.id,
            };
        });

        await this.taskService.createMany(tasksToCreate as any);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: opts.runAt },
        });

        return { count: tasksToCreate.length, assigneeIds: targetAssigneeIds };
    }

    // --- Helpers ---

    /**
     * 解析分发规则，获取目标用户 ID 列表
     */
    private async resolveAssignees(template: any): Promise<string[]> {
        const { assigneeMode, assigneeIds, departmentIds, organizationIds, collectionPointId, collectionPointIds } = template;

        // 简单去重集合
        const targetIds = new Set<string>();

        // 1. 手动指定
        if (assigneeIds && assigneeIds.length > 0) {
            assigneeIds.forEach((id: string) => targetIds.add(id));
        }

        // 2. 按部门
        if (assigneeMode === 'BY_DEPARTMENT' && departmentIds && departmentIds.length > 0) {
            const users = await this.prisma.user.findMany({
                where: { departmentId: { in: departmentIds }, status: 'ACTIVE' },
                select: { id: true },
            });
            users.forEach(u => targetIds.add(u.id));
        }

        // 3. 按组织
        if (assigneeMode === 'BY_ORGANIZATION' && organizationIds && organizationIds.length > 0) {
            const users = await this.prisma.user.findMany({
                where: { organizationId: { in: organizationIds }, status: 'ACTIVE' },
                select: { id: true },
            });
            users.forEach(u => targetIds.add(u.id));
        }

        // 4. 全员 (慎用)
        if (assigneeMode === 'ALL_ACTIVE') {
            const users = await this.prisma.user.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true },
            });
            users.forEach(u => targetIds.add(u.id));
        }

        // 5. 按采集点分配 (新增)
        if (assigneeMode === 'BY_COLLECTION_POINT') {
            // 如果指定了单个采集点
            if (collectionPointId) {
                const allocations = await this.prisma.collectionPointAllocation.findMany({
                    where: {
                        collectionPointId,
                        isActive: true,
                    },
                    select: { userId: true },
                });
                allocations.forEach(a => targetIds.add(a.userId));
            }
            // 如果指定了多个采集点
            if (collectionPointIds && collectionPointIds.length > 0) {
                const allocations = await this.prisma.collectionPointAllocation.findMany({
                    where: {
                        collectionPointId: { in: collectionPointIds },
                        isActive: true,
                    },
                    select: { userId: true },
                });
                allocations.forEach(a => targetIds.add(a.userId));
            }
        }

        return Array.from(targetIds);
    }

    private async resolveAssigneesWithOverride(template: any, assigneeIdsOverride?: string[]) {
        if (assigneeIdsOverride && assigneeIdsOverride.length > 0) {
            return assigneeIdsOverride;
        }
        return this.resolveAssignees(template);
    }

    private generateTaskTitle(templateName: string, periodKey?: string): string {
        const dateStr = periodKey || new Date().toLocaleDateString();
        return `${templateName} [${dateStr}]`;
    }

    /**
     * 按采集点类型批量执行模板 (新增)
     * 为指定类型的所有采集点生成任务，分配给各自的负责人
     */
    async executeTemplateByPointType(templateId: string, triggeredById: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: templateId },
        });

        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        if (!template.targetPointType) {
            throw new BadRequestException('模板未配置目标采集点类型');
        }

        // 查找该类型的所有活跃采集点及其负责人
        const points = await this.prisma.collectionPoint.findMany({
            where: {
                type: template.targetPointType,
                isActive: true,
            },
            include: {
                allocations: {
                    where: { isActive: true },
                    select: { userId: true, commodity: true },
                },
            },
        });

        if (points.length === 0) {
            return { count: 0, message: '未找到符合条件的采集点' };
        }

        const runAt = new Date();
        const periodInfo = computePeriodInfo(template, runAt, undefined);
        const legacyDeadline = new Date(runAt);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = periodInfo.dueAt || legacyDeadline;

        // 获取所有相关用户的组织/部门信息
        const allUserIds = [...new Set(points.flatMap(p => p.allocations.map(a => a.userId)))];
        const assigneeSnapshots = await this.prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, organizationId: true, departmentId: true },
        });
        const assigneeMap = new Map(
            assigneeSnapshots.map(item => [
                item.id,
                { organizationId: item.organizationId, departmentId: item.departmentId },
            ]),
        );

        // 为每个采集点的每个负责人创建任务
        const tasksToCreate: any[] = [];
        for (const point of points) {
            for (const allocation of point.allocations) {
                const snapshot = assigneeMap.get(allocation.userId);

                // Determine target commodities
                // If assigned specific commodity, task for that.
                // If assigned "All" (null), task for ALL point commodities.
                const commoditiesToTask = allocation.commodity
                    ? [allocation.commodity]
                    : (point.commodities && point.commodities.length > 0 ? point.commodities : [null]);

                for (const comm of commoditiesToTask) {
                    const titleSuffix = comm ? ` [${comm}]` : '';
                    tasksToCreate.push({
                        title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + titleSuffix,
                        description: template.description || undefined,
                        type: template.taskType,
                        priority: template.priority,
                        deadline: effectiveDeadline,
                        periodStart: periodInfo.periodStart || undefined,
                        periodEnd: periodInfo.periodEnd || undefined,
                        dueAt: periodInfo.dueAt || undefined,
                        periodKey: periodInfo.periodKey || undefined,
                        assigneeId: allocation.userId,
                        assigneeOrgId: snapshot?.organizationId || undefined,
                        assigneeDeptId: snapshot?.departmentId || undefined,
                        createdById: triggeredById,
                        templateId: template.id,
                        collectionPointId: point.id,
                        commodity: comm || undefined,
                    });
                }
            }
        }

        if (tasksToCreate.length === 0) {
            return { count: 0, message: '采集点均未分配负责人' };
        }

        await this.taskService.createMany(tasksToCreate);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: runAt },
        });

        return {
            count: tasksToCreate.length,
            pointCount: points.length,
            message: `成功为 ${points.length} 个采集点创建 ${tasksToCreate.length} 个任务`,
        };
    }

    /**
     * 执行模板 (统一入口)
     * 根据模板配置自动选择执行方式
     */
    async executeTemplate(templateId: string, triggeredById: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: templateId },
        });

        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        // 如果配置了采集点类型，按类型批量生成
        if (template.targetPointType) {
            return this.executeTemplateByPointType(templateId, triggeredById);
        }

        // 否则使用原有逻辑
        return this.distributeTasks({ templateId }, triggeredById);
    }

    /**
     * 预览任务分发
     */
    async previewDistribution(templateId: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: templateId },
        });

        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        const result = {
            totalTasks: 0,
            totalAssignees: 0,
            assignees: [] as any[],
            unassignedPoints: [] as any[],
        };

        // Case 1: 按采集点类型分发
        if (template.targetPointType) {
            // 查找该类型的所有活跃采集点
            const points = await this.prisma.collectionPoint.findMany({
                where: {
                    type: template.targetPointType,
                    isActive: true,
                },
                include: {
                    allocations: {
                        where: { isActive: true },
                        include: {
                            user: {
                                include: {
                                    department: true,
                                    organization: true,
                                }
                            }
                        }
                    },
                },
            });

            const assigneeMap = new Map<string, any>();

            for (const point of points) {
                if (point.allocations.length === 0) {
                    result.unassignedPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                    });
                    continue;
                }

                for (const allocation of point.allocations) {
                    const user = allocation.user;
                    if (!assigneeMap.has(user.id)) {
                        assigneeMap.set(user.id, {
                            userId: user.id,
                            userName: user.name,
                            departmentName: user.department?.name,
                            organizationName: user.organization?.name,
                            collectionPoints: [],
                            taskCount: 0,
                        });
                    }
                    const assigneeEntry = assigneeMap.get(user.id);

                    // Task Count Calculation (Granular)
                    const commoditiesCount = allocation.commodity
                        ? 1
                        : (point.commodities && point.commodities.length > 0 ? point.commodities.length : 1);

                    assigneeEntry.collectionPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                        commodity: allocation.commodity || 'All',
                        count: commoditiesCount
                    });
                    assigneeEntry.taskCount += commoditiesCount;
                }
            }

            result.assignees = Array.from(assigneeMap.values());
            result.totalTasks = result.assignees.reduce((sum, a) => sum + a.taskCount, 0);
            result.totalAssignees = result.assignees.length;

            return result;
        }

        // Case 2: 标准模式分发 (MANUAL, BY_DEPARTMENT, BY_ORGANIZATION)
        if (
            template.assigneeMode === 'BY_COLLECTION_POINT' &&
            (template.collectionPointId || (template.collectionPointIds && template.collectionPointIds.length > 0))
        ) {
            const pointIds = template.collectionPointId
                ? [template.collectionPointId]
                : template.collectionPointIds;

            const points = await this.prisma.collectionPoint.findMany({
                where: {
                    id: { in: pointIds },
                    isActive: true,
                },
                include: {
                    allocations: {
                        where: { isActive: true },
                        include: {
                            user: {
                                include: {
                                    department: true,
                                    organization: true,
                                }
                            }
                        }
                    },
                },
            });

            const assigneeMap = new Map<string, any>();

            for (const point of points) {
                if (point.allocations.length === 0) {
                    result.unassignedPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                    });
                    continue;
                }

                for (const allocation of point.allocations) {
                    const user = allocation.user;
                    if (!assigneeMap.has(user.id)) {
                        assigneeMap.set(user.id, {
                            userId: user.id,
                            userName: user.name,
                            departmentName: user.department?.name,
                            organizationName: user.organization?.name,
                            collectionPoints: [],
                            taskCount: 0,
                        });
                    }
                    const assigneeEntry = assigneeMap.get(user.id);

                    // Task Count Calculation (Granular)
                    const commoditiesCount = allocation.commodity
                        ? 1
                        : (point.commodities && point.commodities.length > 0 ? point.commodities.length : 1);

                    assigneeEntry.collectionPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                        commodity: allocation.commodity || 'All',
                        count: commoditiesCount
                    });
                    assigneeEntry.taskCount += commoditiesCount;
                }
            }

            result.assignees = Array.from(assigneeMap.values());
            result.totalTasks = result.assignees.reduce((sum, a) => sum + a.taskCount, 0);
            result.totalAssignees = result.assignees.length;

            return result;
        }

        const targetAssigneeIds = await this.resolveAssignees(template);

        if (targetAssigneeIds.length > 0) {
            const users = await this.prisma.user.findMany({
                where: { id: { in: targetAssigneeIds } },
                include: {
                    department: true,
                    organization: true,
                },
            });

            result.assignees = users.map(user => ({
                userId: user.id,
                userName: user.name,
                departmentName: user.department?.name,
                organizationName: user.organization?.name,
                collectionPoints: [],
                taskCount: 1, // 标准模式每人一个任务
            }));

            result.totalTasks = result.assignees.length;
            result.totalAssignees = result.assignees.length;
        }

        return result;
    }
}
