import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { IntelTaskService } from './intel-task.service';
import { IntelTaskTemplateService } from './intel-task-template.service';
import {
    CollectionPointType as PrismaCollectionPointType,
    IntelTaskType as PrismaIntelTaskType,
    Prisma,
} from '@prisma/client';
import { GetCalendarPreviewDto, BatchDistributeTasksDto } from './dto';
import { IntelTaskType, IntelTaskPriority, CollectionPointType, TaskScheduleMode, CollectionPointFrequencyType, CalendarPreviewTask } from '@packages/types';
import { computePeriodInfo, computeNextRunAt } from './intel-task-schedule.utils';
import { IntelTaskAssigneeStrategy, IntelTaskStatus, TaskCycleType, IntelTaskCompletionPolicy, COLLECTION_POINT_TYPE_LABELS } from '@packages/types';
import {
    TaskCreatePayload,
    TaskKeyInput,
    RuleScopeQuery,
    ShiftConfig,
    PointScheduleLike,
    AllocationWithUser,
    PointWithAllocations,
    PreviewAssignee,
    PreviewResult,
    TemplateRecord,
    RuleRecord
} from './intel-task-dispatch.types';

@Injectable()
export class IntelTaskDispatchService {
    private readonly logger = new Logger(IntelTaskDispatchService.name);

    constructor(
        public prisma: PrismaService,
        public configService: ConfigService,
        @Inject(forwardRef(() => IntelTaskService))
        public taskService: IntelTaskService,
        @Inject(forwardRef(() => IntelTaskTemplateService))
        public templateService: IntelTaskTemplateService,
    ) { }



    // --- Helpers ---

    /**
     * 解析分发规则，获取目标用户 ID 列表
     */
    public async resolveAssignees(template: TemplateRecord): Promise<string[]> {
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



    public async resolveAssigneesWithOverride(template: TemplateRecord, assigneeIdsOverride?: string[]) {
        if (assigneeIdsOverride && assigneeIdsOverride.length > 0) {
            return assigneeIdsOverride;
        }
        return this.resolveAssignees(template);
    }



    public buildTaskKey(task: TaskKeyInput) {
        const templateId = task.templateId || 'NO_TEMPLATE';
        const periodKey = task.periodKey || 'NO_PERIOD';
        const assigneeId = task.assigneeId || 'NO_ASSIGNEE';
        const collectionPointId = task.collectionPointId || 'NO_POINT';
        const commodity = task.commodity || 'NO_COMMODITY';
        return `${templateId}|${periodKey}|${assigneeId}|${collectionPointId}|${commodity}`;
    }



    public dedupeTasks<T extends TaskKeyInput>(tasks: T[]) {
        const map = new Map<string, T>();
        for (const task of tasks) {
            const key = this.buildTaskKey(task);
            if (!map.has(key)) {
                map.set(key, task);
            }
        }
        return Array.from(map.values());
    }



    public async filterDuplicateTasks(tasks: TaskCreatePayload[]) {
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



    public hashString(value: string) {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }



    public selectAssigneesByStrategy(
        candidateIds: string[],
        strategy: string,
        seed: string,
        loadMap?: Map<string, number>,
    ) {
        const unique = Array.from(new Set(candidateIds.filter((x): x is string => !!x) as string[]));
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



    public async getAssigneeLoadMap(userIds: string[]) {
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



    public async resolveUsersByRole(scopeQuery: RuleScopeQuery) {
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



    public async resolveUsersByQuery(scopeQuery: RuleScopeQuery) {
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



    public async resolvePointsByQuery(scopeQuery: RuleScopeQuery, opts?: { includeUser?: boolean }): Promise<PointWithAllocations[]> {
        const pointIds = Array.isArray(scopeQuery?.collectionPointIds) ? scopeQuery.collectionPointIds : [];
        if (scopeQuery?.collectionPointId) {
            pointIds.push(scopeQuery.collectionPointId);
        }
        const targetPointType = scopeQuery?.targetPointType;
        const resolvedTypes = this.templateService.resolvePointTypes(targetPointType);
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



    public parseShiftConfig(raw: unknown): ShiftConfig | null {
        if (!raw) return null;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) as ShiftConfig;
            } catch (e) {
                this.logger.warn('Operation failed silently, returning null', e instanceof Error ? e.message : String(e));
                return null;
            }
        }
        return raw as ShiftConfig;
    }



    public computeRuleRunDates(
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



    public async hasPointAllocation(userId: string, scopeQuery: RuleScopeQuery) {
        const pointIds = Array.isArray(scopeQuery?.collectionPointIds) ? scopeQuery.collectionPointIds : [];
        if (scopeQuery?.collectionPointId) {
            pointIds.push(scopeQuery.collectionPointId);
        }
        const targetPointType = scopeQuery?.targetPointType;
        const resolvedTypes = this.templateService.resolvePointTypes(targetPointType);
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



    public async isAssigneeInRuleScope(
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



    public async createTasksFromRules(
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

            targetAssignees = Array.from(new Set(targetAssignees.filter((x): x is string => !!x) as string[]));
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



    public generateTaskTitle(templateName: string, periodKey?: string): string {
        const dateStr = periodKey || new Date().toLocaleDateString();
        return `${templateName} [${dateStr}]`;
    }



    public isPointSchedule(template: TemplateRecord) {
        return template.taskType === PrismaIntelTaskType.COLLECTION
            && (template.scheduleMode ?? TaskScheduleMode.TEMPLATE_OVERRIDE) === TaskScheduleMode.POINT_DEFAULT;
    }



    public getTemplateTargetPointTypes(template: TemplateRecord): PrismaCollectionPointType[] {
        const types = Array.isArray(template.targetPointTypes)
            ? template.targetPointTypes.filter(
                (x): x is PrismaCollectionPointType => typeof x === 'string' && x.length > 0,
            )
            : [];
        if (types.length) return this.templateService.resolvePointTypes(types);
        if (template.targetPointType) return this.templateService.resolvePointTypes(template.targetPointType);
        return [];
    }



    public getWeekday1(date: Date) {
        const day = date.getDay(); // 0=Sun..6=Sat
        return day === 0 ? 7 : day; // 1=Mon..7=Sun
    }



    public getLastDayOfMonth(date: Date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }



    public isPointDue(point: PointScheduleLike, runAt: Date) {
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



    public parseScopeQuery(scopeQuery: unknown): RuleScopeQuery {
        if (!scopeQuery) return {};
        if (typeof scopeQuery === 'string') {
            try {
                return JSON.parse(scopeQuery) as RuleScopeQuery;
            } catch (e) {
                this.logger.warn('Parse failed, returning empty object', e instanceof Error ? e.message : String(e));
                return {};
            }
        }
        return scopeQuery as RuleScopeQuery;
    }



    public isRuleDue(
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

        const typeMeta = await this.templateService.resolveTaskTypeBinding(template.taskType as IntelTaskType);

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



    public async previewRulesDistribution(template: TemplateRecord, rules: RuleRecord[], previewRunAt: Date) {
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

            targetAssignees = Array.from(new Set(targetAssignees.filter((x): x is string => !!x) as string[]));
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

    async distributeTasks(dto: BatchDistributeTasksDto, operatorId: string) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: dto.templateId },
        });
        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }

        if (this.getTemplateTargetPointTypes(template).length > 0) {
            return this.executeTemplateByPointType(template.id, operatorId);
        }

        const rules = await this.prisma.intelTaskRule.findMany({
            where: { templateId: template.id, isActive: true },
            orderBy: { createdAt: 'asc' },
        });
        const runAt = new Date();
        const typeMeta = await this.templateService.resolveTaskTypeBinding(template.taskType as IntelTaskType);

        if (rules.length > 0) {
            return this.createTasksFromRules(
                template,
                rules,
                {
                    assigneeIds: dto.assigneeIds,
                    overrideDeadline: dto.overrideDeadline,
                    triggeredById: operatorId,
                    runAt,
                },
                typeMeta,
            );
        }

        const assigneeIds = Array.from(new Set(
            (await this.resolveAssigneesWithOverride(template, dto.assigneeIds))
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ));
        if (assigneeIds.length === 0) {
            return { count: 0, assigneeIds: [] as string[] };
        }

        const assigneeSnapshots = await this.prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, organizationId: true, departmentId: true },
        });
        const assigneeMap = new Map(
            assigneeSnapshots.map(item => [
                item.id,
                { organizationId: item.organizationId, departmentId: item.departmentId },
            ]),
        );

        const periodInfo = computePeriodInfo(template, runAt, dto.overrideDeadline);
        const legacyDeadline = new Date(runAt);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = dto.overrideDeadline || periodInfo.dueAt || legacyDeadline;

        const tasksToCreate: TaskCreatePayload[] = assigneeIds.map((assigneeId) => {
            const snapshot = assigneeMap.get(assigneeId);
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
                assigneeId,
                assigneeOrgId: snapshot?.organizationId || undefined,
                assigneeDeptId: snapshot?.departmentId || undefined,
                createdById: operatorId,
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
            data: { lastRunAt: runAt },
        });

        return {
            count: filteredTasks.length,
            assigneeIds: Array.from(new Set(filteredTasks.map(task => task.assigneeId))),
        };
    }

    async previewDistribution(templateId: string): Promise<PreviewResult> {
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

        const targetPointTypes = this.getTemplateTargetPointTypes(template);
        if (targetPointTypes.length > 0) {
            const points = await this.resolvePointsByQuery(
                { targetPointType: targetPointTypes },
                { includeUser: true },
            );
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
                    if (!user) continue;
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

                    const commoditiesCount = allocation.commodity
                        ? 1
                        : (point.commodities && point.commodities.length > 0 ? point.commodities.length : 1);

                    assigneeEntry.collectionPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                        commodity: allocation.commodity || 'All',
                        count: commoditiesCount,
                    });
                    assigneeEntry.taskCount += commoditiesCount;
                }
            }

            result.assignees = Array.from(assigneeMap.values());
            result.totalTasks = result.assignees.reduce((sum, item) => sum + item.taskCount, 0);
            result.totalAssignees = result.assignees.length;

            return result;
        }

        if (
            template.assigneeMode === 'BY_COLLECTION_POINT'
            && (template.collectionPointId || (template.collectionPointIds && template.collectionPointIds.length > 0))
        ) {
            const pointIds = template.collectionPointId
                ? [template.collectionPointId]
                : template.collectionPointIds;
            const points = await this.resolvePointsByQuery(
                { collectionPointIds: pointIds },
                { includeUser: true },
            );
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
                    if (!user) continue;
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

                    const commoditiesCount = allocation.commodity
                        ? 1
                        : (point.commodities && point.commodities.length > 0 ? point.commodities.length : 1);

                    assigneeEntry.collectionPoints.push({
                        id: point.id,
                        name: point.name,
                        type: point.type,
                        commodity: allocation.commodity || 'All',
                        count: commoditiesCount,
                    });
                    assigneeEntry.taskCount += commoditiesCount;
                }
            }

            result.assignees = Array.from(assigneeMap.values());
            result.totalTasks = result.assignees.reduce((sum, item) => sum + item.taskCount, 0);
            result.totalAssignees = result.assignees.length;

            return result;
        }

        const targetAssigneeIds = await this.resolveAssignees(template);
        if (targetAssigneeIds.length > 0) {
            const users = await this.prisma.user.findMany({
                where: { id: { in: targetAssigneeIds }, status: 'ACTIVE' },
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
                taskCount: 1,
            }));
            result.totalTasks = result.assignees.length;
            result.totalAssignees = result.assignees.length;
        }

        return result;
    }

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
            assigneeRoleIds = roles.map(item => item.roleId);
            assigneeRoleCodes = roles
                .map(item => item.role?.code)
                .filter((code): code is string => typeof code === 'string' && code.length > 0);
        }

        const templates = await this.prisma.intelTaskTemplate.findMany({
            where: {
                isActive: true,
                activeFrom: { lte: end },
                OR: [{ activeUntil: null }, { activeUntil: { gte: start } }],
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

            let isRelevant = true;
            if (assigneeId) {
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

            let baseDate = new Date(template.activeFrom);
            if (baseDate < start) {
                baseDate = new Date(start.getTime() - 1);
            } else if (baseDate.getTime() > start.getTime()) {
                baseDate = new Date(baseDate.getTime() - 1);
            } else {
                baseDate = new Date(start.getTime() - 1);
            }
            if (isNaN(baseDate.getTime())) {
                baseDate = new Date(start.getTime() - 1);
            }

            let simDate = baseDate;
            let loops = 0;
            const maxLoops = 100;

            while (loops < maxLoops) {
                const nextRunAt = computeNextRunAt(template, simDate);
                if (!nextRunAt) break;
                if (nextRunAt > end) break;
                if (template.activeUntil && nextRunAt > template.activeUntil) break;

                if (nextRunAt >= start) {
                    const periodInfo = computePeriodInfo(template, nextRunAt, undefined);
                    const deadline = new Date(nextRunAt);
                    deadline.setHours(deadline.getHours() + template.deadlineOffset);
                    const effectiveDeadline = periodInfo.dueAt || deadline;

                    previewTasks.push({
                        id: `preview-${template.id}-${nextRunAt.getTime()}`,
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

                    if (template.cycleType === TaskCycleType.ONE_TIME) break;
                }

                simDate = nextRunAt;
                loops += 1;
            }
        }

        return previewTasks;
    }


}
