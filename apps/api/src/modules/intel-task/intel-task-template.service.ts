import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { IntelTaskService } from './intel-task.service';
import {
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    BatchDistributeTasksDto,
    CreateIntelTaskDto,
    IntelTaskType,
    IntelTaskPriority,
    COLLECTION_POINT_TYPE_LABELS,
    CollectionPointType,
    CollectionPointFrequencyType,
    TaskCycleType,
    TaskScheduleMode,
    IntelTaskAssigneeStrategy,
    IntelTaskCompletionPolicy,
    IntelTaskStatus,
    CalendarPreviewTask,
} from '@packages/types';
import {
    CollectionPoint,
    CollectionPointType as PrismaCollectionPointType,
    IntelTaskPriority as PrismaIntelTaskPriority,
    IntelTaskRule,
    IntelTaskTemplate,
    IntelTaskType as PrismaIntelTaskType,
    Prisma,
} from '@prisma/client';

type TemplateRecord = IntelTaskTemplate;
type RuleRecord = IntelTaskRule;

type TaskKeyInput = {
    templateId?: string | null;
    periodKey?: string | null;
    assigneeId?: string | null;
    collectionPointId?: string | null;
    commodity?: string | null;
};

type TaskCreatePayload = CreateIntelTaskDto & {
    createdById?: string;
    templateId?: string;
    ruleId?: string | null;
    collectionPointId?: string | null;
    commodity?: string | null;
    assigneeOrgId?: string;
    assigneeDeptId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    dueAt?: Date;
    periodKey?: string;
    taskGroupId?: string | null;
    formId?: string | null;
    workflowId?: string | null;
};

type RuleScopeQuery = {
    userIds?: string[];
    departmentIds?: string[];
    organizationIds?: string[];
    roleIds?: string[];
    roleCodes?: string[];
    collectionPointIds?: string[];
    collectionPointId?: string;
    targetPointType?: string | string[];
};

type ShiftConfig = {
    dates?: string[];
    weekdays?: number[];
    monthDays?: number[];
    intervalDays?: number | string;
    startDate?: string;
};

type AllocationLike = {
    userId: string;
    commodity?: string | null;
};

type PointScheduleLike = Pick<
    CollectionPoint,
    'dispatchAtMinute' | 'frequencyType' | 'weekdays' | 'monthDays' | 'shiftConfig'
>;

type AllocationWithUser = AllocationLike & {
    user?: {
        id: string;
        name?: string | null;
        department?: { name?: string | null } | null;
        organization?: { name?: string | null } | null;
    };
};

type PointWithAllocations = CollectionPoint & {
    allocations: AllocationWithUser[];
    commodities?: string[] | null;
};

type PreviewAssignee = {
    userId: string;
    userName?: string | null;
    departmentName?: string | null;
    organizationName?: string | null;
    collectionPoints: Array<{
        id: string;
        name: string;
        type: string;
        commodity?: string | null;
        count: number;
    }>;
    taskCount: number;
};

type PreviewResult = {
    totalTasks: number;
    totalAssignees: number;
    assignees: PreviewAssignee[];
    unassignedPoints: Array<{ id: string; name: string; type: string }>;
};
import { GetCalendarPreviewDto, UpdateIntelTaskRuleDto } from './dto';
import { computePeriodInfo, computeNextRunAt } from './intel-task-schedule.utils';

@Injectable()
export class IntelTaskTemplateService {
    constructor(
        private prisma: PrismaService,
        private taskService: IntelTaskService,
        private configService: ConfigService,
    ) { }

    private toPrismaTaskType(value: IntelTaskType) {
        return value as unknown as PrismaIntelTaskType;
    }

    private toPrismaTaskPriority(value: IntelTaskPriority) {
        return value as unknown as PrismaIntelTaskPriority;
    }

    private resolvePointTypes(input?: string | string[]) {
        const values = Array.isArray(input) ? input : input ? [input] : [];
        return values.filter((value): value is PrismaCollectionPointType =>
            Object.values(PrismaCollectionPointType).includes(value as PrismaCollectionPointType),
        );
    }

    private async resolveTaskTypeBinding(taskType: IntelTaskType) {
        const items = await this.configService.getDictionary('INTEL_TASK_TYPE');
        const item = items.find(i => i.code === taskType);
        if (!item) {
            throw new BadRequestException(`任务类型未配置: ${taskType}`);
        }
        const meta = (item.meta || {}) as {
            formKey?: string;
            workflowKey?: string;
            requiresCollectionPoint?: boolean;
            defaultSlaHours?: number;
        };

        if (!meta.formKey || !meta.workflowKey) {
            throw new BadRequestException(`任务类型未绑定表单/流程: ${taskType}`);
        }

        return {
            formKey: meta.formKey,
            workflowKey: meta.workflowKey,
            requiresCollectionPoint: meta.requiresCollectionPoint,
            defaultSlaHours: meta.defaultSlaHours,
        };
    }

    /**
     * 创建任务模板
     */
    async create(dto: CreateIntelTaskTemplateDto & { createdById: string }) {
        const data = { ...dto } as Prisma.IntelTaskTemplateUncheckedCreateInput;
        if (Array.isArray(dto.targetPointTypes)) {
            const normalized = dto.targetPointTypes.filter(Boolean);
            data.targetPointTypes = normalized;
            data.targetPointType = normalized[0] ?? dto.targetPointType ?? null;
        } else if (dto.targetPointType) {
            data.targetPointTypes = [dto.targetPointType];
            data.targetPointType = dto.targetPointType;
        }
        if (dto.taskType === IntelTaskType.COLLECTION) {
            if (!data.scheduleMode) {
                data.scheduleMode = TaskScheduleMode.POINT_DEFAULT as Prisma.IntelTaskTemplateUncheckedCreateInput['scheduleMode'];
            }
        } else {
            data.scheduleMode = TaskScheduleMode.TEMPLATE_OVERRIDE as Prisma.IntelTaskTemplateUncheckedCreateInput['scheduleMode'];
        }
        data.taskType = this.toPrismaTaskType(dto.taskType);
        if (dto.priority) {
            data.priority = this.toPrismaTaskPriority(dto.priority);
        }
        return this.prisma.intelTaskTemplate.create({
            data: {
                ...data,
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
        const data = { ...dto } as Prisma.IntelTaskTemplateUncheckedUpdateInput;
        const hasTargetPointTypes = Object.prototype.hasOwnProperty.call(dto, 'targetPointTypes');
        const hasTargetPointType = Object.prototype.hasOwnProperty.call(dto, 'targetPointType');
        if (hasTargetPointTypes) {
            const normalized = (dto.targetPointTypes || []).filter(Boolean);
            data.targetPointTypes = normalized;
            data.targetPointType = normalized[0] ?? null;
        } else if (hasTargetPointType) {
            if (dto.targetPointType) {
                data.targetPointTypes = [dto.targetPointType];
                data.targetPointType = dto.targetPointType;
            } else {
                data.targetPointTypes = [];
                data.targetPointType = null;
            }
        }
        const taskType = (dto.taskType || existing.taskType) as IntelTaskType;
        if (taskType === IntelTaskType.COLLECTION) {
            if (!data.scheduleMode) {
                data.scheduleMode = (existing.scheduleMode || TaskScheduleMode.POINT_DEFAULT) as Prisma.IntelTaskTemplateUncheckedUpdateInput['scheduleMode'];
            }
        } else {
            data.scheduleMode = TaskScheduleMode.TEMPLATE_OVERRIDE as Prisma.IntelTaskTemplateUncheckedUpdateInput['scheduleMode'];
        }
        if (dto.taskType) {
            data.taskType = this.toPrismaTaskType(dto.taskType);
        }
        if (dto.priority) {
            data.priority = this.toPrismaTaskPriority(dto.priority);
        }
        return this.prisma.intelTaskTemplate.update({
            where: { id },
            data,
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

        if (this.getTemplateTargetPointTypes(template).length > 0) {
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
        template: TemplateRecord,
        opts: {
            assigneeIds?: string[];
            overrideDeadline?: Date;
            triggeredById?: string;
            runAt: Date;
        },
    ) {
        const typeMeta = await this.resolveTaskTypeBinding(template.taskType as IntelTaskType);
        const rules = await this.prisma.intelTaskRule.findMany({
            where: { templateId: template.id, isActive: true },
            orderBy: { createdAt: 'asc' },
        });

        if (rules.length > 0) {
            return this.createTasksFromRules(template, rules, opts, typeMeta);
        }

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

            const usePointSchedule = this.isPointSchedule(template);
            const duePoints = usePointSchedule
                ? points.filter(point => this.isPointDue(point, opts.runAt))
                : points;

            if (duePoints.length === 0) {
                return { count: 0, assigneeIds: [] as string[] };
            }

            const allUserIds = [...new Set(duePoints.flatMap(p => p.allocations.map(a => a.userId)))];
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
            const periodTemplate = usePointSchedule
                ? { ...template, cycleType: TaskCycleType.DAILY }
                : template;
            const periodInfo = computePeriodInfo(periodTemplate, anchorDate, opts.overrideDeadline);
            const legacyDeadline = new Date(anchorDate);
            legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
            const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

            const tasksToCreate: TaskCreatePayload[] = [];
            for (const point of duePoints) {
                for (const allocation of point.allocations) {
                    const snapshot = assigneeMap.get(allocation.userId);

                    // Determine target commodities
                    // If assigned specific commodity, task for that.
                    // If assigned "All" (null), task for ALL point commodities.
                    const commoditiesToTask = allocation.commodity
                        ? [allocation.commodity]
                        : (point.commodities && point.commodities.length > 0 ? point.commodities : [null]);

                    for (const comm of commoditiesToTask) {
                        const typeLabel = COLLECTION_POINT_TYPE_LABELS[point.type as CollectionPointType] || point.type;
                        const pointSuffix = ` [${typeLabel}] [${point.name}]`;
                        const commSuffix = comm ? ` [${comm}]` : '';

                        tasksToCreate.push({
                            title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + pointSuffix + commSuffix,
                            description: template.description || undefined,
                            type: template.taskType as unknown as IntelTaskType,
                            priority: template.priority as unknown as IntelTaskPriority,
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
                            formId: typeMeta.formKey,
                            workflowId: typeMeta.workflowKey,
                        });
                    }
                }
            }

            const filteredTasks = await this.filterDuplicateTasks(tasksToCreate);
            if (filteredTasks.length === 0) {
                return { count: 0, assigneeIds: [] as string[] };
            }

            await this.taskService.createMany(filteredTasks);

            await this.prisma.intelTaskTemplate.update({
                where: { id: template.id },
                data: { lastRunAt: opts.runAt },
            });

            return {
                count: filteredTasks.length,
                assigneeIds: Array.from(new Set(filteredTasks.map(task => task.assigneeId))),
            };
        }

        if (typeMeta.requiresCollectionPoint) {
            throw new BadRequestException('采集类任务必须绑定采集点');
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
        const periodTemplate = template.taskType === IntelTaskType.COLLECTION
            ? { ...template, cycleType: TaskCycleType.DAILY }
            : template;
        const periodInfo = computePeriodInfo(periodTemplate, anchorDate, opts.overrideDeadline);
        const legacyDeadline = new Date(anchorDate);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

        const tasksToCreate = targetAssigneeIds.map(userId => {
            const snapshot = assigneeMap.get(userId);
            return {
                title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                description: template.description || undefined,
                type: template.taskType as unknown as IntelTaskType,
                priority: template.priority as unknown as IntelTaskPriority,
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
                formId: typeMeta.formKey,
                workflowId: typeMeta.workflowKey,
            };
        });

        const filteredTasks = await this.filterDuplicateTasks(tasksToCreate);
        if (filteredTasks.length === 0) {
            return { count: 0, assigneeIds: [] as string[] };
        }

        await this.taskService.createMany(filteredTasks);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: opts.runAt },
        });

        return {
            count: filteredTasks.length,
            assigneeIds: Array.from(new Set(filteredTasks.map(task => task.assigneeId))),
        };
    }

    // --- Helpers ---

    /**
     * 解析分发规则，获取目标用户 ID 列表
     */
    private async resolveAssignees(template: TemplateRecord): Promise<string[]> {
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

    private async resolveAssigneesWithOverride(template: TemplateRecord, assigneeIdsOverride?: string[]) {
        if (assigneeIdsOverride && assigneeIdsOverride.length > 0) {
            return assigneeIdsOverride;
        }
        return this.resolveAssignees(template);
    }

    private buildTaskKey(task: TaskKeyInput) {
        const templateId = task.templateId || 'NO_TEMPLATE';
        const periodKey = task.periodKey || 'NO_PERIOD';
        const assigneeId = task.assigneeId || 'NO_ASSIGNEE';
        const collectionPointId = task.collectionPointId || 'NO_POINT';
        const commodity = task.commodity || 'NO_COMMODITY';
        return `${templateId}|${periodKey}|${assigneeId}|${collectionPointId}|${commodity}`;
    }

    private dedupeTasks<T extends TaskKeyInput>(tasks: T[]) {
        const map = new Map<string, T>();
        for (const task of tasks) {
            const key = this.buildTaskKey(task);
            if (!map.has(key)) {
                map.set(key, task);
            }
        }
        return Array.from(map.values());
    }

    private async filterDuplicateTasks(tasks: TaskCreatePayload[]) {
        if (!tasks.length) return tasks;
        const groups = new Map<string, TaskCreatePayload[]>();
        for (const task of tasks) {
            const key = task.templateId || 'NO_TEMPLATE';
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)?.push(task);
        }

        const filtered: TaskCreatePayload[] = [];
        for (const [templateId, groupTasks] of groups.entries()) {
            const deduped = this.dedupeTasks(groupTasks);

            if (templateId === 'NO_TEMPLATE') {
                filtered.push(...deduped);
                continue;
            }

            const periodKeys = Array.from(new Set(deduped
                .map(t => t.periodKey)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)));
            const assigneeIds = Array.from(new Set(deduped
                .map(t => t.assigneeId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)));
            const pointIds = Array.from(new Set(deduped
                .map(t => t.collectionPointId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)));
            const commodityValues = Array.from(new Set(deduped
                .map(t => t.commodity)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)));
            const needsNullPoint = deduped.some(t => !t.collectionPointId);
            const needsNullCommodity = deduped.some(t => !t.commodity);

            const andFilters: Prisma.IntelTaskWhereInput[] = [];
            if (pointIds.length || needsNullPoint) {
                andFilters.push({
                    OR: [
                        ...(pointIds.length ? [{ collectionPointId: { in: pointIds } }] : []),
                        ...(needsNullPoint ? [{ collectionPointId: null }] : []),
                    ],
                });
            }
            if (commodityValues.length || needsNullCommodity) {
                andFilters.push({
                    OR: [
                        ...(commodityValues.length ? [{ commodity: { in: commodityValues } }] : []),
                        ...(needsNullCommodity ? [{ commodity: null }] : []),
                    ],
                });
            }

            const existing = await this.prisma.intelTask.findMany({
                where: {
                    templateId: templateId,
                    ...(periodKeys.length ? { periodKey: { in: periodKeys } } : {}),
                    ...(assigneeIds.length ? { assigneeId: { in: assigneeIds } } : {}),
                    ...(andFilters.length ? { AND: andFilters } : {}),
                },
                select: {
                    templateId: true,
                    periodKey: true,
                    assigneeId: true,
                    collectionPointId: true,
                    commodity: true,
                },
            });

            const existingKeys = new Set(existing.map(item => this.buildTaskKey(item)));
            for (const task of deduped) {
                const key = this.buildTaskKey(task);
                if (!existingKeys.has(key)) {
                    filtered.push(task);
                }
            }
        }

        return filtered;
    }

    private hashString(value: string) {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    private selectAssigneesByStrategy(
        candidateIds: string[],
        strategy: string,
        seed: string,
        loadMap?: Map<string, number>,
    ) {
        const unique = Array.from(new Set(candidateIds.filter(Boolean)));
        if (unique.length <= 1) return unique;

        if (strategy === IntelTaskAssigneeStrategy.ROTATION) {
            const index = this.hashString(seed) % unique.length;
            return [unique[index]];
        }

        if (strategy === IntelTaskAssigneeStrategy.BALANCED) {
            let selected = unique[0];
            let minLoad = loadMap?.get(selected) ?? 0;
            for (const id of unique) {
                const load = loadMap?.get(id) ?? 0;
                if (load < minLoad) {
                    minLoad = load;
                    selected = id;
                }
            }
            return [selected];
        }

        return unique;
    }

    private async getAssigneeLoadMap(userIds: string[]) {
        if (!userIds.length) return new Map<string, number>();
        const activeStatuses = [
            IntelTaskStatus.PENDING,
            IntelTaskStatus.SUBMITTED,
            IntelTaskStatus.RETURNED,
            IntelTaskStatus.OVERDUE,
        ];
        const rows = await this.prisma.intelTask.groupBy({
            by: ['assigneeId'],
            where: {
                assigneeId: { in: userIds },
                status: { in: activeStatuses },
            },
            _count: { _all: true },
        });
        return new Map(rows.map(row => [row.assigneeId, row._count._all]));
    }

    private async resolveUsersByRole(scopeQuery: RuleScopeQuery) {
        const roleIds = Array.isArray(scopeQuery?.roleIds) ? scopeQuery.roleIds : [];
        const roleCodes = Array.isArray(scopeQuery?.roleCodes) ? scopeQuery.roleCodes : [];

        let resolvedRoleIds = roleIds;
        if (roleCodes.length) {
            const roles = await this.prisma.role.findMany({
                where: { code: { in: roleCodes } },
                select: { id: true },
            });
            resolvedRoleIds = Array.from(new Set([...resolvedRoleIds, ...roles.map(r => r.id)]));
        }

        if (!resolvedRoleIds.length) return [];

        const userRoles = await this.prisma.userRole.findMany({
            where: { roleId: { in: resolvedRoleIds }, user: { status: 'ACTIVE' } },
            select: { userId: true },
        });
        return Array.from(new Set(userRoles.map(item => item.userId)));
    }

    private async resolveUsersByQuery(scopeQuery: RuleScopeQuery) {
        const targetIds = new Set<string>();
        const userIds = Array.isArray(scopeQuery?.userIds) ? scopeQuery.userIds : [];
        userIds.forEach((id: string) => targetIds.add(id));

        const departmentIds = Array.isArray(scopeQuery?.departmentIds) ? scopeQuery.departmentIds : [];
        if (departmentIds.length) {
            const users = await this.prisma.user.findMany({
                where: { departmentId: { in: departmentIds }, status: 'ACTIVE' },
                select: { id: true },
            });
            users.forEach(u => targetIds.add(u.id));
        }

        const organizationIds = Array.isArray(scopeQuery?.organizationIds) ? scopeQuery.organizationIds : [];
        if (organizationIds.length) {
            const users = await this.prisma.user.findMany({
                where: { organizationId: { in: organizationIds }, status: 'ACTIVE' },
                select: { id: true },
            });
            users.forEach(u => targetIds.add(u.id));
        }

        const roleUserIds = await this.resolveUsersByRole(scopeQuery);
        roleUserIds.forEach(id => targetIds.add(id));

        return Array.from(targetIds);
    }

    private async resolvePointsByQuery(scopeQuery: RuleScopeQuery, opts?: { includeUser?: boolean }): Promise<PointWithAllocations[]> {
        const pointIds = Array.isArray(scopeQuery?.collectionPointIds) ? scopeQuery.collectionPointIds : [];
        if (scopeQuery?.collectionPointId) {
            pointIds.push(scopeQuery.collectionPointId);
        }
        const targetPointType = scopeQuery?.targetPointType;
        const resolvedTypes = this.resolvePointTypes(targetPointType);
        const typeFilter = resolvedTypes.length > 1
            ? { in: resolvedTypes }
            : resolvedTypes.length === 1
                ? resolvedTypes[0]
                : undefined;

        if (!pointIds.length && !typeFilter) return [];

        const includeUser = opts?.includeUser ?? false;

        const points = await this.prisma.collectionPoint.findMany({
            where: {
                ...(pointIds.length ? { id: { in: pointIds } } : {}),
                ...(typeFilter ? { type: typeFilter } : {}),
                isActive: true,
            },
            include: {
                allocations: {
                    where: { isActive: true },
                    ...(includeUser
                        ? {
                            include: {
                                user: {
                                    include: {
                                        department: true,
                                        organization: true,
                                    },
                                },
                            },
                        }
                        : { select: { userId: true, commodity: true } }),
                },
            },
        });
        return points as PointWithAllocations[];
    }

    private parseShiftConfig(raw: unknown): ShiftConfig | null {
        if (!raw) return null;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) as ShiftConfig;
            } catch {
                return null;
            }
        }
        return raw as ShiftConfig;
    }

    private computeRuleRunDates(
        rule: Pick<RuleRecord, 'dispatchAtMinute' | 'frequencyType' | 'weekdays' | 'monthDays'>,
        start: Date,
        end: Date,
    ) {
        const dates: Date[] = [];
        const dispatchAt = rule.dispatchAtMinute ?? 0;
        const frequency = rule.frequencyType || TaskCycleType.DAILY;
        if (frequency === TaskCycleType.ONE_TIME) {
            const runAt = new Date(start);
            const hours = Math.floor(dispatchAt / 60);
            const minutes = dispatchAt % 60;
            runAt.setHours(hours, minutes, 0, 0);
            if (runAt >= start && runAt <= end) {
                dates.push(runAt);
            }
            return dates;
        }
        const startDay = new Date(start);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setHours(0, 0, 0, 0);

        for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate() + 1)) {
            const runAt = new Date(day);
            const hours = Math.floor(dispatchAt / 60);
            const minutes = dispatchAt % 60;
            runAt.setHours(hours, minutes, 0, 0);

            if (runAt < start || runAt > end) continue;
            if (this.isRuleDue(rule, runAt)) {
                dates.push(new Date(runAt));
            }
        }

        return dates;
    }

    private async hasPointAllocation(userId: string, scopeQuery: RuleScopeQuery) {
        const pointIds = Array.isArray(scopeQuery?.collectionPointIds) ? scopeQuery.collectionPointIds : [];
        if (scopeQuery?.collectionPointId) {
            pointIds.push(scopeQuery.collectionPointId);
        }
        const targetPointType = scopeQuery?.targetPointType;
        const resolvedTypes = this.resolvePointTypes(targetPointType);
        const typeFilter = resolvedTypes.length > 1
            ? { in: resolvedTypes }
            : resolvedTypes.length === 1
                ? resolvedTypes[0]
                : undefined;

        const allocation = await this.prisma.collectionPointAllocation.findFirst({
            where: {
                userId,
                isActive: true,
                ...(pointIds.length ? { collectionPointId: { in: pointIds } } : {}),
                ...(typeFilter ? { collectionPoint: { type: typeFilter } } : {}),
            },
            select: { id: true },
        });
        return !!allocation;
    }

    private async isAssigneeInRuleScope(
        rule: Pick<RuleRecord, 'scopeType'>,
        scopeQuery: RuleScopeQuery,
        assignee: { id: string; departmentId?: string | null; organizationId?: string | null },
        assigneeRoleIds: string[],
        assigneeRoleCodes: string[],
    ) {
        if (!assignee?.id) return true;

        if (rule.scopeType === 'USER') {
            const userIds = Array.isArray(scopeQuery?.userIds) ? scopeQuery.userIds : [];
            return userIds.includes(assignee.id);
        }
        if (rule.scopeType === 'DEPARTMENT') {
            const departmentIds = Array.isArray(scopeQuery?.departmentIds) ? scopeQuery.departmentIds : [];
            return assignee.departmentId ? departmentIds.includes(assignee.departmentId) : false;
        }
        if (rule.scopeType === 'ORGANIZATION') {
            const organizationIds = Array.isArray(scopeQuery?.organizationIds) ? scopeQuery.organizationIds : [];
            return assignee.organizationId ? organizationIds.includes(assignee.organizationId) : false;
        }
        if (rule.scopeType === 'ROLE') {
            const roleIds = Array.isArray(scopeQuery?.roleIds) ? scopeQuery.roleIds as string[] : [];
            const roleCodes = Array.isArray(scopeQuery?.roleCodes) ? scopeQuery.roleCodes as string[] : [];
            if (roleIds.some((id: string) => assigneeRoleIds.includes(id))) return true;
            if (roleCodes.some((code: string) => assigneeRoleCodes.includes(code))) return true;
            return false;
        }
        if (rule.scopeType === 'POINT') {
            return this.hasPointAllocation(assignee.id, scopeQuery);
        }
        if (rule.scopeType === 'QUERY') {
            const scopeHasPoint = Boolean(
                (Array.isArray(scopeQuery?.collectionPointIds) && scopeQuery.collectionPointIds.length > 0)
                || scopeQuery?.collectionPointId
                || (Array.isArray(scopeQuery?.targetPointType) ? scopeQuery.targetPointType.length > 0 : scopeQuery?.targetPointType),
            );
            if (scopeHasPoint) {
                return this.hasPointAllocation(assignee.id, scopeQuery);
            }
            const userIds = Array.isArray(scopeQuery?.userIds) ? scopeQuery.userIds : [];
            if (userIds.includes(assignee.id)) return true;
            const departmentIds = Array.isArray(scopeQuery?.departmentIds) ? scopeQuery.departmentIds : [];
            if (assignee.departmentId && departmentIds.includes(assignee.departmentId)) return true;
            const organizationIds = Array.isArray(scopeQuery?.organizationIds) ? scopeQuery.organizationIds : [];
            if (assignee.organizationId && organizationIds.includes(assignee.organizationId)) return true;
            const roleIds = Array.isArray(scopeQuery?.roleIds) ? scopeQuery.roleIds as string[] : [];
            const roleCodes = Array.isArray(scopeQuery?.roleCodes) ? scopeQuery.roleCodes as string[] : [];
            if (roleIds.some((id: string) => assigneeRoleIds.includes(id))) return true;
            if (roleCodes.some((code: string) => assigneeRoleCodes.includes(code))) return true;
            return false;
        }

        return true;
    }

    private async createTasksFromRules(
        template: TemplateRecord,
        rules: RuleRecord[],
        opts: { assigneeIds?: string[]; overrideDeadline?: Date; triggeredById?: string; runAt: Date },
        typeMeta: { formKey: string; workflowKey: string; requiresCollectionPoint?: boolean }
    ) {
        const tasksToCreate: TaskCreatePayload[] = [];
        const usePointSchedule = this.isPointSchedule(template);

        for (const rule of rules) {
            const scopeQuery = this.parseScopeQuery(rule.scopeQuery);
            const assigneeStrategy = rule.assigneeStrategy || IntelTaskAssigneeStrategy.POINT_OWNER;
            const completionPolicy = rule.completionPolicy || IntelTaskCompletionPolicy.EACH;

            const scopeHasPoint = Boolean(
                (Array.isArray(scopeQuery.collectionPointIds) && scopeQuery.collectionPointIds.length > 0)
                || scopeQuery.collectionPointId
                || (Array.isArray(scopeQuery.targetPointType) ? scopeQuery.targetPointType.length > 0 : scopeQuery.targetPointType),
            );
            const isPointScope = rule.scopeType === 'POINT' || (rule.scopeType === 'QUERY' && scopeHasPoint);
            const skipRuleSchedule = usePointSchedule && isPointScope;

            if (!skipRuleSchedule && !this.isRuleDue(rule, opts.runAt)) continue;

            const ruleLike = {
                ...template,
                cycleType: skipRuleSchedule ? TaskCycleType.DAILY : rule.frequencyType,
                runAtMinute: skipRuleSchedule ? template.runAtMinute : rule.dispatchAtMinute,
            };
            const anchorDate = opts.overrideDeadline || opts.runAt;
            const periodInfo = computePeriodInfo(ruleLike, anchorDate, opts.overrideDeadline);
            const legacyDeadline = new Date(anchorDate);
            legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
            const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

            let taskGroupId: string | undefined;
            if (rule.grouping || completionPolicy !== IntelTaskCompletionPolicy.EACH) {
                const groupKey = `${template.id}:${rule.id}:${periodInfo.periodKey || anchorDate.toISOString().slice(0, 10)}`;
                const existingGroup = await this.prisma.intelTaskGroup.findFirst({ where: { groupKey } });
                if (existingGroup) {
                    taskGroupId = existingGroup.id;
                } else {
                    const createdGroup = await this.prisma.intelTaskGroup.create({
                        data: {
                            templateId: template.id,
                            ruleId: rule.id,
                            groupKey,
                        },
                    });
                    taskGroupId = createdGroup.id;
                }
            }

            if (isPointScope) {
                if (typeMeta.requiresCollectionPoint !== true) {
                    continue;
                }

                const points = await this.resolvePointsByQuery(scopeQuery);
                const duePoints = usePointSchedule
                    ? points.filter(point => this.isPointDue(point, opts.runAt))
                    : points;
                if (duePoints.length === 0) continue;

                const allUserIds = Array.from(new Set(duePoints.flatMap(point => point.allocations.map(a => a.userId))));
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

                const generalCandidateIds = Array.from(new Set(
                    duePoints.flatMap(point => point.allocations.filter(a => !a.commodity).map(a => a.userId)),
                ));
                const loadMap = assigneeStrategy === IntelTaskAssigneeStrategy.BALANCED
                    ? await this.getAssigneeLoadMap(generalCandidateIds)
                    : undefined;

                for (const point of duePoints) {
                    const allocations = point.allocations || [];
                    const specificAllocations = allocations.filter(a => a.commodity);
                    const generalAllocations = allocations.filter(a => !a.commodity);

                    for (const allocation of specificAllocations) {
                        const snapshot = assigneeMap.get(allocation.userId);
                        const typeLabel = COLLECTION_POINT_TYPE_LABELS[point.type as CollectionPointType] || point.type;
                        const pointSuffix = ` [${typeLabel}] [${point.name}]`;
                        const commSuffix = allocation.commodity ? ` [${allocation.commodity}]` : '';

                        tasksToCreate.push({
                            title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + pointSuffix + commSuffix,
                            description: template.description || undefined,
                            type: template.taskType as unknown as IntelTaskType,
                            priority: template.priority as unknown as IntelTaskPriority,
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
                            ruleId: rule.id,
                            collectionPointId: point.id,
                            commodity: allocation.commodity || undefined,
                            formId: typeMeta.formKey,
                            workflowId: typeMeta.workflowKey,
                            taskGroupId,
                        });
                    }

                    const generalUserIds = Array.from(new Set(generalAllocations.map(a => a.userId)));
                    const selectedGeneralUserIds = this.selectAssigneesByStrategy(
                        generalUserIds,
                        assigneeStrategy,
                        `${template.id}:${rule.id}:${point.id}:${periodInfo.periodKey || anchorDate.toISOString().slice(0, 10)}`,
                        loadMap,
                    );

                    if (!selectedGeneralUserIds.length) continue;

                    const commoditiesToTask = point.commodities && point.commodities.length > 0 ? point.commodities : [null];
                    for (const userId of selectedGeneralUserIds) {
                        const snapshot = assigneeMap.get(userId);
                        for (const comm of commoditiesToTask) {
                            const typeLabel = COLLECTION_POINT_TYPE_LABELS[point.type as CollectionPointType] || point.type;
                            const pointSuffix = ` [${typeLabel}] [${point.name}]`;
                            const commSuffix = comm ? ` [${comm}]` : '';

                            tasksToCreate.push({
                                title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + pointSuffix + commSuffix,
                                description: template.description || undefined,
                                type: template.taskType as unknown as IntelTaskType,
                                priority: template.priority as unknown as IntelTaskPriority,
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
                                collectionPointId: point.id,
                                commodity: comm || undefined,
                                formId: typeMeta.formKey,
                                workflowId: typeMeta.workflowKey,
                                taskGroupId,
                            });
                        }
                    }
                }
                continue;
            }

            if (typeMeta.requiresCollectionPoint) {
                continue;
            }

            let targetAssignees: string[] = [];
            if (rule.scopeType === 'USER') {
                targetAssignees = scopeQuery.userIds || [];
            } else if (rule.scopeType === 'DEPARTMENT') {
                if (scopeQuery.departmentIds && scopeQuery.departmentIds.length) {
                    const users = await this.prisma.user.findMany({
                        where: { departmentId: { in: scopeQuery.departmentIds }, status: 'ACTIVE' },
                        select: { id: true, organizationId: true, departmentId: true },
                    });
                    targetAssignees = users.map(u => u.id);
                }
            } else if (rule.scopeType === 'ORGANIZATION') {
                if (scopeQuery.organizationIds && scopeQuery.organizationIds.length) {
                    const users = await this.prisma.user.findMany({
                        where: { organizationId: { in: scopeQuery.organizationIds }, status: 'ACTIVE' },
                        select: { id: true, organizationId: true, departmentId: true },
                    });
                    targetAssignees = users.map(u => u.id);
                }
            } else if (rule.scopeType === 'ROLE') {
                targetAssignees = await this.resolveUsersByRole(scopeQuery);
            } else if (rule.scopeType === 'QUERY') {
                targetAssignees = await this.resolveUsersByQuery(scopeQuery);
            }

            targetAssignees = Array.from(new Set(targetAssignees.filter(Boolean)));
            if (!targetAssignees.length) continue;

            const loadMap = assigneeStrategy === IntelTaskAssigneeStrategy.BALANCED
                ? await this.getAssigneeLoadMap(targetAssignees)
                : undefined;
            const selectedAssignees = this.selectAssigneesByStrategy(
                targetAssignees,
                assigneeStrategy,
                `${template.id}:${rule.id}:${periodInfo.periodKey || anchorDate.toISOString().slice(0, 10)}`,
                loadMap,
            );

            if (!selectedAssignees.length) continue;

            const assigneeSnapshots = await this.prisma.user.findMany({
                where: { id: { in: selectedAssignees } },
                select: { id: true, organizationId: true, departmentId: true },
            });
            const assigneeMap = new Map(
                assigneeSnapshots.map(item => [
                    item.id,
                    { organizationId: item.organizationId, departmentId: item.departmentId },
                ]),
            );

            for (const userId of selectedAssignees) {
                const snapshot = assigneeMap.get(userId);
                tasksToCreate.push({
                    title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                    description: template.description || undefined,
                    type: template.taskType as unknown as IntelTaskType,
                    priority: template.priority as unknown as IntelTaskPriority,
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
                    ruleId: rule.id,
                    formId: typeMeta.formKey,
                    workflowId: typeMeta.workflowKey,
                    taskGroupId,
                });
            }
        }

        const filteredTasks = await this.filterDuplicateTasks(tasksToCreate);
        if (filteredTasks.length === 0) {
            return { count: 0, assigneeIds: [] as string[] };
        }

        await this.taskService.createMany(filteredTasks);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: opts.runAt },
        });

        return {
            count: filteredTasks.length,
            assigneeIds: Array.from(new Set(filteredTasks.map(task => task.assigneeId))),
        };
    }

    private generateTaskTitle(templateName: string, periodKey?: string): string {
        const dateStr = periodKey || new Date().toLocaleDateString();
        return `${templateName} [${dateStr}]`;
    }

    private isPointSchedule(template: TemplateRecord) {
        return template.taskType === PrismaIntelTaskType.COLLECTION
            && (template.scheduleMode ?? TaskScheduleMode.TEMPLATE_OVERRIDE) === TaskScheduleMode.POINT_DEFAULT;
    }

    private getTemplateTargetPointTypes(template: TemplateRecord): PrismaCollectionPointType[] {
        const types = Array.isArray(template.targetPointTypes)
            ? template.targetPointTypes.filter(Boolean)
            : [];
        if (types.length) return this.resolvePointTypes(types);
        if (template.targetPointType) return this.resolvePointTypes(template.targetPointType);
        return [];
    }

    private getWeekday1(date: Date) {
        const day = date.getDay(); // 0=Sun..6=Sat
        return day === 0 ? 7 : day; // 1=Mon..7=Sun
    }

    private getLastDayOfMonth(date: Date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }

    private isPointDue(point: PointScheduleLike, runAt: Date) {
        const minuteNow = runAt.getHours() * 60 + runAt.getMinutes();
        const dispatchAt = point.dispatchAtMinute ?? 0;
        if (minuteNow < dispatchAt) return false;

        const frequency = point.frequencyType || CollectionPointFrequencyType.DAILY;
        if (frequency === CollectionPointFrequencyType.DAILY) return true;

        if (frequency === CollectionPointFrequencyType.WEEKLY) {
            const weekdays = Array.isArray(point.weekdays) ? point.weekdays : [];
            if (weekdays.length === 0) return true;
            return weekdays.includes(this.getWeekday1(runAt));
        }

        if (frequency === CollectionPointFrequencyType.MONTHLY) {
            const monthDays = Array.isArray(point.monthDays) ? point.monthDays : [];
            const today = runAt.getDate();
            const lastDay = this.getLastDayOfMonth(runAt);
            if (monthDays.length === 0) return true;
            if (monthDays.includes(today)) return true;
            if (monthDays.includes(0) && today === lastDay) return true;
            if (monthDays.some((d: number) => d > lastDay) && today === lastDay) return true;
            return false;
        }

        if (frequency === CollectionPointFrequencyType.CUSTOM) {
            const cfg = this.parseShiftConfig(point.shiftConfig);
            if (!cfg) return true;

            const yyyy = runAt.getFullYear();
            const mm = String(runAt.getMonth() + 1).padStart(2, '0');
            const dd = String(runAt.getDate()).padStart(2, '0');
            const dateKey = `${yyyy}-${mm}-${dd}`;

            if (Array.isArray(cfg.dates) && cfg.dates.includes(dateKey)) {
                return true;
            }

            if (Array.isArray(cfg.weekdays) && cfg.weekdays.length > 0) {
                return cfg.weekdays.includes(this.getWeekday1(runAt));
            }

            if (Array.isArray(cfg.monthDays) && cfg.monthDays.length > 0) {
                const today = runAt.getDate();
                const lastDay = this.getLastDayOfMonth(runAt);
                if (cfg.monthDays.includes(today)) return true;
                if (cfg.monthDays.includes(0) && today === lastDay) return true;
                if (cfg.monthDays.some((d: number) => d > lastDay) && today === lastDay) return true;
                return false;
            }

            if (cfg.intervalDays && cfg.startDate) {
                const start = new Date(cfg.startDate);
                if (!isNaN(start.getTime())) {
                    const diff = Math.floor((runAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
                    if (diff >= 0 && diff % Number(cfg.intervalDays) === 0) {
                        return true;
                    }
                    return false;
                }
            }

            return true;
        }

        return true;
    }

    private parseScopeQuery(scopeQuery: unknown): RuleScopeQuery {
        if (!scopeQuery) return {};
        if (typeof scopeQuery === 'string') {
            try {
                return JSON.parse(scopeQuery) as RuleScopeQuery;
            } catch {
                return {};
            }
        }
        return scopeQuery as RuleScopeQuery;
    }

    private isRuleDue(
        rule: Pick<RuleRecord, 'dispatchAtMinute' | 'frequencyType' | 'weekdays' | 'monthDays'>,
        runAt: Date,
    ) {
        const minuteNow = runAt.getHours() * 60 + runAt.getMinutes();
        const dispatchAt = rule.dispatchAtMinute ?? 0;
        if (minuteNow < dispatchAt) return false;

        const frequency = rule.frequencyType || TaskCycleType.DAILY;
        if (frequency === TaskCycleType.DAILY) return true;

        if (frequency === TaskCycleType.WEEKLY) {
            const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays : [];
            if (weekdays.length === 0) return true;
            return weekdays.includes(this.getWeekday1(runAt));
        }

        if (frequency === TaskCycleType.MONTHLY) {
            const monthDays = Array.isArray(rule.monthDays) ? rule.monthDays : [];
            const today = runAt.getDate();
            const lastDay = this.getLastDayOfMonth(runAt);
            if (monthDays.length === 0) return true;
            if (monthDays.includes(today)) return true;
            if (monthDays.includes(0) && today === lastDay) return true;
            if (monthDays.some((d: number) => d > lastDay) && today === lastDay) return true;
            return false;
        }

        return true;
    }

    /**
     * 按采集点类型批量执行模板 (新增)
     * 为指定类型的所有采集点生成任务，分配给各自的负责人
     */
    async executeTemplateByPointType(templateId: string, triggeredById?: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: templateId },
        });

        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        const targetPointTypes = this.getTemplateTargetPointTypes(template);
        if (targetPointTypes.length === 0) {
            throw new BadRequestException('模板未配置目标采集点类型');
        }

        const typeMeta = await this.resolveTaskTypeBinding(template.taskType as IntelTaskType);

        // 查找该类型的所有活跃采集点及其负责人
        const points = await this.prisma.collectionPoint.findMany({
            where: {
                type: { in: targetPointTypes },
                isActive: true,
            },
            include: {
                allocations: {
                    where: { isActive: true },
                    select: { userId: true, commodity: true },
                },
            },
        });

        const runAt = new Date();
        const usePointSchedule = this.isPointSchedule(template);
        const duePoints = usePointSchedule
            ? points.filter(point => this.isPointDue(point, runAt))
            : points;

        if (duePoints.length === 0) {
            return { count: 0, message: '未找到符合条件的采集点' };
        }

        const periodTemplate = usePointSchedule
            ? { ...template, cycleType: TaskCycleType.DAILY }
            : template;
        const periodInfo = computePeriodInfo(periodTemplate, runAt, undefined);
        const legacyDeadline = new Date(runAt);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = periodInfo.dueAt || legacyDeadline;

        // 获取所有相关用户的组织/部门信息
        const allUserIds = [...new Set(duePoints.flatMap(p => p.allocations.map(a => a.userId)))];
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
        const tasksToCreate: TaskCreatePayload[] = [];
        for (const point of duePoints) {
            for (const allocation of point.allocations) {
                const snapshot = assigneeMap.get(allocation.userId);

                // Determine target commodities
                // If assigned specific commodity, task for that.
                // If assigned "All" (null), task for ALL point commodities.
                const commoditiesToTask = allocation.commodity
                    ? [allocation.commodity]
                    : (point.commodities && point.commodities.length > 0 ? point.commodities : [null]);

                for (const comm of commoditiesToTask) {
                    const typeLabel = COLLECTION_POINT_TYPE_LABELS[point.type as CollectionPointType] || point.type;
                    const pointSuffix = ` [${typeLabel}] [${point.name}]`;
                    const commSuffix = comm ? ` [${comm}]` : '';

                    tasksToCreate.push({
                        title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined) + pointSuffix + commSuffix,
                        description: template.description || undefined,
                        type: template.taskType as unknown as IntelTaskType,
                        priority: template.priority as unknown as IntelTaskPriority,
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
                        formId: typeMeta.formKey,
                        workflowId: typeMeta.workflowKey,
                    });
                }
            }
        }

        const filteredTasks = await this.filterDuplicateTasks(tasksToCreate);
        if (filteredTasks.length === 0) {
            return { count: 0, message: '采集点均未分配负责人或任务已存在' };
        }

        await this.taskService.createMany(filteredTasks);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: runAt },
        });

        return {
            count: filteredTasks.length,
            pointCount: duePoints.length,
            message: `成功为 ${duePoints.length} 个采集点创建 ${filteredTasks.length} 个任务`,
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
        if (this.getTemplateTargetPointTypes(template).length > 0) {
            return this.executeTemplateByPointType(templateId, triggeredById);
        }

        // 否则使用原有逻辑
        return this.distributeTasks({ templateId }, triggeredById);
    }

    // ========================
    // 任务规则管理
    // ========================

    async listRules(templateId: string) {
        return this.prisma.intelTaskRule.findMany({
            where: { templateId },
            orderBy: { createdAt: 'asc' },
        });
    }

    async createRule(dto: { templateId: string } & Record<string, unknown>) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: dto.templateId },
        });
        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }
        const input = dto as Partial<Prisma.IntelTaskRuleUncheckedCreateInput>;
        if (!input.scopeType) {
            throw new BadRequestException('scopeType is required');
        }
        return this.prisma.intelTaskRule.create({
            data: {
                templateId: dto.templateId,
                scopeType: input.scopeType,
                scopeQuery: input.scopeQuery,
                frequencyType: input.frequencyType,
                weekdays: Array.isArray(input.weekdays) ? input.weekdays : [],
                monthDays: Array.isArray(input.monthDays) ? input.monthDays : [],
                dispatchAtMinute: input.dispatchAtMinute ?? 540,
                duePolicy: input.duePolicy,
                assigneeStrategy: input.assigneeStrategy,
                completionPolicy: input.completionPolicy,
                grouping: input.grouping ?? false,
                isActive: input.isActive ?? true,
            },
        });
    }

    async updateRule(id: string, dto: UpdateIntelTaskRuleDto) {
        const existing = await this.prisma.intelTaskRule.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('任务规则不存在');
        }
        const input = dto as Partial<Prisma.IntelTaskRuleUncheckedUpdateInput>;
        return this.prisma.intelTaskRule.update({
            where: { id },
            data: {
                scopeType: input.scopeType ?? undefined,
                scopeQuery: input.scopeQuery ?? undefined,
                frequencyType: input.frequencyType ?? undefined,
                weekdays: input.weekdays ?? undefined,
                monthDays: input.monthDays ?? undefined,
                dispatchAtMinute: input.dispatchAtMinute ?? undefined,
                duePolicy: input.duePolicy ?? undefined,
                assigneeStrategy: input.assigneeStrategy ?? undefined,
                completionPolicy: input.completionPolicy ?? undefined,
                grouping: input.grouping ?? undefined,
                isActive: input.isActive ?? undefined,
            },
        });
    }

    async removeRule(id: string) {
        const existing = await this.prisma.intelTaskRule.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('任务规则不存在');
        }
        return this.prisma.intelTaskRule.delete({ where: { id } });
    }

    private async previewRulesDistribution(template: TemplateRecord, rules: RuleRecord[], previewRunAt: Date) {
        const result: PreviewResult = {
            totalTasks: 0,
            totalAssignees: 0,
            assignees: [],
            unassignedPoints: [],
        };

        const usePointSchedule = this.isPointSchedule(template);
        const assigneeMap = new Map<string, PreviewAssignee>();

        const ensureAssignee = (user: AllocationWithUser['user']) => {
            if (!user) return null;
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
            return assigneeMap.get(user.id);
        };

        for (const rule of rules) {
            const scopeQuery = this.parseScopeQuery(rule.scopeQuery);
            const assigneeStrategy = rule.assigneeStrategy || IntelTaskAssigneeStrategy.POINT_OWNER;

            const scopeHasPoint = Boolean(
                (Array.isArray(scopeQuery.collectionPointIds) && scopeQuery.collectionPointIds.length > 0)
                || scopeQuery.collectionPointId
                || (Array.isArray(scopeQuery.targetPointType) ? scopeQuery.targetPointType.length > 0 : scopeQuery.targetPointType),
            );
            const isPointScope = rule.scopeType === 'POINT' || (rule.scopeType === 'QUERY' && scopeHasPoint);
            const skipRuleSchedule = usePointSchedule && isPointScope;

            if (!skipRuleSchedule && !this.isRuleDue(rule, previewRunAt)) continue;

            if (isPointScope) {
                const points = await this.resolvePointsByQuery(scopeQuery, { includeUser: true }) as PointWithAllocations[];
                const duePoints = usePointSchedule
                    ? points.filter(point => this.isPointDue(point, previewRunAt))
                    : points;

                const generalCandidateIds = Array.from(new Set(
                    duePoints.flatMap(point => point.allocations.filter(a => !a.commodity).map(a => a.userId)),
                ));
                const loadMap = assigneeStrategy === IntelTaskAssigneeStrategy.BALANCED
                    ? await this.getAssigneeLoadMap(generalCandidateIds)
                    : undefined;

                for (const point of duePoints) {
                    if (point.allocations.length === 0) {
                        result.unassignedPoints.push({
                            id: point.id,
                            name: point.name,
                            type: point.type,
                        });
                        continue;
                    }

                    const userMap = new Map<string, AllocationWithUser['user']>();
                    point.allocations.forEach((allocation) => {
                        if (allocation.user) {
                            userMap.set(allocation.userId, allocation.user);
                        }
                    });

                    const specificAllocations = point.allocations.filter(a => a.commodity);
                    for (const allocation of specificAllocations) {
                        const user = userMap.get(allocation.userId);
                        const entry = ensureAssignee(user);
                        if (!entry) continue;
                        entry.collectionPoints.push({
                            id: point.id,
                            name: point.name,
                            type: point.type,
                            commodity: allocation.commodity,
                            count: 1,
                        });
                        entry.taskCount += 1;
                    }

                    const generalAllocations = point.allocations.filter(a => !a.commodity);
                    const generalUserIds = Array.from(new Set(generalAllocations.map(a => a.userId)));
                    const selectedGeneralUserIds = this.selectAssigneesByStrategy(
                        generalUserIds,
                        assigneeStrategy,
                        `${template.id}:${rule.id}:${point.id}:${previewRunAt.toISOString().slice(0, 10)}`,
                        loadMap,
                    );

                    if (!selectedGeneralUserIds.length) continue;

                    const commoditiesCount = point.commodities && point.commodities.length > 0 ? point.commodities.length : 1;
                    for (const userId of selectedGeneralUserIds) {
                        const user = userMap.get(userId);
                        const entry = ensureAssignee(user);
                        if (!entry) continue;
                        entry.collectionPoints.push({
                            id: point.id,
                            name: point.name,
                            type: point.type,
                            commodity: 'All',
                            count: commoditiesCount,
                        });
                        entry.taskCount += commoditiesCount;
                    }
                }
                continue;
            }

            let targetAssignees: string[] = [];
            if (rule.scopeType === 'USER') {
                targetAssignees = scopeQuery.userIds || [];
            } else if (rule.scopeType === 'DEPARTMENT') {
                if (scopeQuery.departmentIds && scopeQuery.departmentIds.length) {
                    const users = await this.prisma.user.findMany({
                        where: { departmentId: { in: scopeQuery.departmentIds }, status: 'ACTIVE' },
                        select: { id: true },
                    });
                    targetAssignees = users.map(user => user.id);
                }
            } else if (rule.scopeType === 'ORGANIZATION') {
                if (scopeQuery.organizationIds && scopeQuery.organizationIds.length) {
                    const users = await this.prisma.user.findMany({
                        where: { organizationId: { in: scopeQuery.organizationIds }, status: 'ACTIVE' },
                        select: { id: true },
                    });
                    targetAssignees = users.map(user => user.id);
                }
            } else if (rule.scopeType === 'ROLE') {
                targetAssignees = await this.resolveUsersByRole(scopeQuery);
            } else if (rule.scopeType === 'QUERY') {
                targetAssignees = await this.resolveUsersByQuery(scopeQuery);
            }

            targetAssignees = Array.from(new Set(targetAssignees.filter(Boolean)));
            if (!targetAssignees.length) continue;

            const loadMap = assigneeStrategy === IntelTaskAssigneeStrategy.BALANCED
                ? await this.getAssigneeLoadMap(targetAssignees)
                : undefined;
            const selectedAssignees = this.selectAssigneesByStrategy(
                targetAssignees,
                assigneeStrategy,
                `${template.id}:${rule.id}:${previewRunAt.toISOString().slice(0, 10)}`,
                loadMap,
            );

            if (!selectedAssignees.length) continue;

            const users = await this.prisma.user.findMany({
                where: { id: { in: selectedAssignees }, status: 'ACTIVE' },
                include: { department: true, organization: true },
            });
            users.forEach(user => {
                const entry = ensureAssignee(user);
                if (entry) {
                    entry.taskCount += 1;
                }
            });
        }

        result.assignees = Array.from(assigneeMap.values());
        result.totalTasks = result.assignees.reduce((sum, item) => sum + (item.taskCount || 0), 0);
        result.totalAssignees = result.assignees.length;

        return result;
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

        const usePointSchedule = this.isPointSchedule(template);
        const result: PreviewResult = {
            totalTasks: 0,
            totalAssignees: 0,
            assignees: [],
            unassignedPoints: [],
        };

        const previewRunAt = new Date();

        const rules = await this.prisma.intelTaskRule.findMany({
            where: { templateId: template.id, isActive: true },
            orderBy: { createdAt: 'asc' },
        });
        if (rules.length > 0) {
            return this.previewRulesDistribution(template, rules, previewRunAt);
        }

        // Case 1: 按采集点类型分发
        const targetPointTypes = this.getTemplateTargetPointTypes(template);
        if (targetPointTypes.length > 0) {
            // 查找该类型的所有活跃采集点
            const points = await this.prisma.collectionPoint.findMany({
                where: {
                    type: { in: targetPointTypes },
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

            const duePoints = usePointSchedule
                ? points.filter(point => this.isPointDue(point, previewRunAt))
                : points;
            const assigneeMap = new Map<string, PreviewAssignee>();

            for (const point of duePoints) {
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
                    if (!assigneeEntry) continue;

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

            const duePoints = usePointSchedule
                ? points.filter(point => this.isPointDue(point, previewRunAt))
                : points;
            const assigneeMap = new Map<string, PreviewAssignee>();

            for (const point of duePoints) {
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
                    if (!assigneeEntry) continue;

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

    /**
     * 获取日历任务预览
     */
    async getCalendarPreview(query: GetCalendarPreviewDto) {
        const { startDate, endDate, assigneeId } = query;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const assigneeSnapshot = assigneeId
            ? await this.prisma.user.findUnique({
                where: { id: assigneeId },
                select: { id: true, departmentId: true, organizationId: true },
            })
            : null;
        let assigneeRoleIds: string[] = [];
        let assigneeRoleCodes: string[] = [];
        if (assigneeId) {
            const roles = await this.prisma.userRole.findMany({
                where: { userId: assigneeId },
                select: { roleId: true, role: { select: { code: true } } },
            });
            assigneeRoleIds = roles.map(r => r.roleId);
            assigneeRoleCodes = roles.map(r => r.role?.code).filter(Boolean) as string[];
        }

        // 1. 获取所有在时间范围内有效的模板
        const templates = await this.prisma.intelTaskTemplate.findMany({
            where: {
                isActive: true,
                activeFrom: { lte: end },
                OR: [
                    { activeUntil: null },
                    { activeUntil: { gte: start } }
                ]
            },
        });

        const previewTasks: CalendarPreviewTask[] = [];

        for (const template of templates) {
            const rules = await this.prisma.intelTaskRule.findMany({
                where: { templateId: template.id, isActive: true },
                orderBy: { createdAt: 'asc' },
            });

            if (rules.length > 0) {
                for (const rule of rules) {
                    const scopeQuery = this.parseScopeQuery(rule.scopeQuery);
                    if (assigneeId && assigneeSnapshot) {
                        const inScope = await this.isAssigneeInRuleScope(
                            rule,
                            scopeQuery,
                            assigneeSnapshot,
                            assigneeRoleIds,
                            assigneeRoleCodes,
                        );
                        if (!inScope) continue;
                    } else if (assigneeId && !assigneeSnapshot) {
                        continue;
                    }

                    const runDates = this.computeRuleRunDates(rule, start, end);
                    for (const runAt of runDates) {
                        if (template.activeFrom && runAt < template.activeFrom) continue;
                        if (template.activeUntil && runAt > template.activeUntil) continue;

                        const ruleLike = {
                            ...template,
                            cycleType: rule.frequencyType,
                            runAtMinute: rule.dispatchAtMinute,
                        };
                        const periodInfo = computePeriodInfo(ruleLike, runAt, undefined);
                        const deadline = new Date(runAt);
                        deadline.setHours(deadline.getHours() + template.deadlineOffset);
                        const effectiveDeadline = periodInfo.dueAt || deadline;

                        previewTasks.push({
                            id: `preview-${template.id}-${rule.id}-${runAt.getTime()}`,
                            title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                            type: template.taskType as unknown as IntelTaskType,
                            priority: template.priority as unknown as IntelTaskPriority,
                            status: 'PREVIEW',
                            deadline: effectiveDeadline,
                            dueAt: effectiveDeadline,
                            isPreview: true,
                            templateId: template.id,
                            assigneeId: assigneeId || undefined,
                        });
                    }
                }
                continue;
            }

            // 2. 检查权限/归属
            let isRelevant = true;

            if (assigneeId) {
                // 判断 assigneeId 是否在这个模板的覆盖范围内
                if (!assigneeSnapshot) {
                    isRelevant = false;
                } else {
                const targetUserIds = await this.resolveAssignees(template);
                if (!targetUserIds.includes(assigneeId)) {
                    isRelevant = false;
                }
                }
            }

            if (!isRelevant) continue;

            // 3. 计算在 start ~ end 之间的所有生成点
            let baseDate = new Date(template.activeFrom);
            if (baseDate < start) {
                // 优化：不要从 activeFrom 开始遍历，而是从 start 附近开始
                baseDate = new Date(start.getTime() - 1);
            } else {
                if (baseDate.getTime() > start.getTime()) {
                    baseDate = new Date(baseDate.getTime() - 1);
                } else {
                    baseDate = new Date(start.getTime() - 1);
                }
            }
            // Ensure baseDate is valid
            if (isNaN(baseDate.getTime())) baseDate = new Date(start.getTime() - 1);

            let simDate = baseDate;
            let loops = 0;
            const MAX_LOOPS = 100;

            while (loops < MAX_LOOPS) {
                const nextRun = computeNextRunAt(template, simDate);

                if (!nextRun) break;
                if (nextRun > end) break;
                if (template.activeUntil && nextRun > template.activeUntil) break;

                // 只有 >= start 的才加入结果
                if (nextRun >= start) {
                    const periodInfo = computePeriodInfo(template, nextRun, undefined);
                    const deadline = new Date(nextRun);
                    deadline.setHours(deadline.getHours() + template.deadlineOffset);
                    const effectiveDeadline = periodInfo.dueAt || deadline;

                    previewTasks.push({
                        id: `preview-${template.id}-${nextRun.getTime()}`,
                        title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                        type: template.taskType as unknown as IntelTaskType,
                        priority: template.priority as unknown as IntelTaskPriority,
                        status: 'PREVIEW',
                        deadline: effectiveDeadline,
                        dueAt: effectiveDeadline,
                        isPreview: true,
                        templateId: template.id,
                        assigneeId: assigneeId || undefined,
                    });

                    if (template.cycleType === 'ONE_TIME') break;
                }

                simDate = nextRun;
                loops++;
            }
        }

        return previewTasks;
    }
}
