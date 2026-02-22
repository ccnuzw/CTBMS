import { Injectable, Logger, NotFoundException, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ConfigService } from "../config/config.service";
import { IntelTaskService } from "./intel-task.service";
import { IntelTaskTemplateService } from "./intel-task-template.service";
import { GetCalendarPreviewDto } from "./dto";
import { computePeriodInfo, computeNextRunAt } from "./intel-task-schedule.utils";
import type { CalendarPreviewTask, IntelTaskPriority as ApiIntelTaskPriority, IntelTaskType as ApiIntelTaskType } from "@packages/types";
import { PreviewAssignee, PreviewResult } from "./intel-task-template.service";

@Injectable()
export class IntelTaskDispatchService {
    private readonly logger = new Logger(IntelTaskDispatchService.name);

    constructor(private readonly prisma: PrismaService, private readonly taskService: IntelTaskService, private readonly configService: ConfigService, @Inject(forwardRef(() => IntelTaskTemplateService)) private readonly templateService: IntelTaskTemplateService) {
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

        const usePointSchedule = this.templateService.isPointSchedule(template);
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
            return this.templateService.previewRulesDistribution(template, rules, previewRunAt);
        }

        const targetPointTypes = this.templateService.getTemplateTargetPointTypes(template);
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
                ? points.filter(point => this.templateService.isPointDue(point, previewRunAt))
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
                ? points.filter(point => this.templateService.isPointDue(point, previewRunAt))
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

        const targetAssigneeIds = await this.templateService.resolveAssignees(template);
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
    async getCalendarPreview(query: GetCalendarPreviewDto): Promise<CalendarPreviewTask[]> {
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
                    const scopeQuery = this.templateService.parseScopeQuery(rule.scopeQuery);
                    if (assigneeId && assigneeSnapshot) {
                        const inScope = await this.templateService.isAssigneeInRuleScope(
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

                    const runDates = this.templateService.computeRuleRunDates(rule, start, end);
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
                            title: this.templateService.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                            type: template.taskType as unknown as ApiIntelTaskType,
                            priority: template.priority as unknown as ApiIntelTaskPriority,
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
                    const targetUserIds = await this.templateService.resolveAssignees(template);
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
                        title: this.templateService.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                        type: template.taskType as unknown as ApiIntelTaskType,
                        priority: template.priority as unknown as ApiIntelTaskPriority,
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
