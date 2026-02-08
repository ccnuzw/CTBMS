import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { Prisma } from '@prisma/client';
import {
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQuery,
    IntelTaskStatus,
    IntelTaskPriority,
    IntelTaskType,
    IntelTaskCompletionPolicy,
    INTEL_TASK_TYPE_LABELS,
    GetCalendarSummaryDto,
    CalendarSummaryResponse,
    CalendarPreviewTask,
} from '@packages/types';

@Injectable()
export class IntelTaskService {
    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) { }

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

        return meta;
    }

    /**
     * 创建采集任务
     */
    async create(dto: CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string, collectionPointId?: string, ruleId?: string }) {
        const typeMeta = await this.resolveTaskTypeBinding(dto.type);
        if (typeMeta.requiresCollectionPoint && !dto.collectionPointId) {
            throw new BadRequestException('采集类任务必须绑定采集点');
        }

        return this.prisma.intelTask.create({
            data: {
                title: dto.title,
                description: dto.description,
                requirements: dto.requirements,
                attachmentUrls: dto.attachmentUrls || [],
                notifyConfig: dto.notifyConfig,
                type: dto.type,
                priority: dto.priority || IntelTaskPriority.MEDIUM,
                deadline: dto.deadline,
                periodStart: dto.periodStart,
                periodEnd: dto.periodEnd,
                dueAt: dto.dueAt,
                periodKey: dto.periodKey,
                assigneeId: dto.assigneeId,
                assigneeOrgId: dto.assigneeOrgId,
                assigneeDeptId: dto.assigneeDeptId,
                createdById: dto.createdById,
                templateId: dto.templateId,
                ruleId: dto.ruleId,
                isLate: dto.isLate,
                collectionPointId: dto.collectionPointId,
                commodity: dto.commodity,
                priceSubmissionId: dto.priceSubmissionId,
                taskGroupId: dto.taskGroupId,
                formId: dto.formId || typeMeta.formKey,
                workflowId: dto.workflowId || typeMeta.workflowKey,
            },
            include: {
                assignee: {
                    select: { id: true, name: true, avatar: true },
                },
                collectionPoint: {
                    select: { id: true, code: true, name: true, type: true },
                },
            },
        });
    }

    /**
     * 批量创建任务 (用于直接分发)
     */
    async createMany(tasks: (CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string, collectionPointId?: string, commodity?: string, ruleId?: string })[]) {
        // Prisma createMany 不支持 include，所以如果需要返回完整对象，可能需要循环创建或者 createMany 后再查询
        // 这里为了性能使用 createMany，但无法返回关联对象
        return this.prisma.intelTask.createMany({
            data: tasks.map(t => ({
                title: t.title,
                description: t.description,
                requirements: t.requirements,
                attachmentUrls: t.attachmentUrls || [],
                notifyConfig: t.notifyConfig,
                type: t.type,
                priority: t.priority || IntelTaskPriority.MEDIUM,
                deadline: t.deadline,
                periodStart: t.periodStart,
                periodEnd: t.periodEnd,
                dueAt: t.dueAt,
                periodKey: t.periodKey,
                assigneeId: t.assigneeId,
                assigneeOrgId: t.assigneeOrgId,
                assigneeDeptId: t.assigneeDeptId,
                createdById: t.createdById,
                templateId: t.templateId,
                ruleId: t.ruleId,
                isLate: t.isLate,
                collectionPointId: t.collectionPointId,
                commodity: t.commodity,
                priceSubmissionId: t.priceSubmissionId,
                taskGroupId: t.taskGroupId,
                formId: t.formId,
                workflowId: t.workflowId,
            })),
            skipDuplicates: true,
        });
    }

    /**
     * 查询任务列表 (分页)
     */
    async findAll(query: IntelTaskQuery) {
        const { page, pageSize, startDate, endDate } = query;
        const where = this.buildWhere(query, 'list');

        // Date range filter on deadline
        if (startDate || endDate) {
            where.deadline = {};
            if (startDate) where.deadline.gte = startDate;
            if (endDate) where.deadline.lte = endDate;
        }

        const [data, total] = await Promise.all([
            this.prisma.intelTask.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { deadline: 'asc' },
                include: {
                    assignee: {
                        select: { id: true, name: true, avatar: true },
                    },
                    template: {
                        select: { name: true }, // 显示关联模板名称
                    }
                },
            }),
            this.prisma.intelTask.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async getMetrics(query: IntelTaskQuery) {
        const where = this.buildWhere(query, 'metrics');

        const [total, pending, completed, overdue, late] = await Promise.all([
            this.prisma.intelTask.count({ where }),
            this.prisma.intelTask.count({ where: { ...where, status: IntelTaskStatus.PENDING } }),
            this.prisma.intelTask.count({ where: { ...where, status: IntelTaskStatus.COMPLETED } }),
            this.prisma.intelTask.count({ where: { ...where, status: IntelTaskStatus.OVERDUE } }),
            this.prisma.intelTask.count({ where: { ...where, isLate: true } }),
        ]);

        return {
            total,
            pending,
            completed,
            overdue,
            late,
            completionRate: total ? completed / total : 0,
            overdueRate: total ? overdue / total : 0,
            lateRate: total ? late / total : 0,
        };
    }

    /**
     * 日历任务聚合
     */
    async getCalendarSummary(query: GetCalendarSummaryDto): Promise<CalendarSummaryResponse> {
        const { startDate, endDate, ...filters } = query;
        const where = this.buildWhere(
            {
                ...filters,
                dueStart: startDate,
                dueEnd: endDate,
            } as IntelTaskQuery,
            'list',
        );

        const tasks = await this.prisma.intelTask.findMany({
            where,
            select: {
                deadline: true,
                dueAt: true,
                status: true,
                priority: true,
                type: true,
            },
        });

        const summaryMap = new Map<string, {
            date: string;
            total: number;
            completed: number;
            overdue: number;
            urgent: number;
            preview?: number;
            byType?: Record<string, number>;
            byPriority?: Record<string, number>;
        }>();

        const typeStatsMap = new Map<string, {
            type: IntelTaskType;
            total: number;
            URGENT: number;
            HIGH: number;
            MEDIUM: number;
            LOW: number;
        }>();

        tasks.forEach(task => {
            const dueDate = task.dueAt || task.deadline;
            if (!dueDate) return;
            const dateKey = dueDate.toISOString().slice(0, 10);

            if (!summaryMap.has(dateKey)) {
                summaryMap.set(dateKey, {
                    date: dateKey,
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    urgent: 0,
                    byType: {},
                    byPriority: {},
                });
            }

            const row = summaryMap.get(dateKey)!;
            row.total += 1;
            if (task.status === IntelTaskStatus.COMPLETED) row.completed += 1;
            if (task.status === IntelTaskStatus.OVERDUE) row.overdue += 1;
            if (task.priority === IntelTaskPriority.URGENT) row.urgent += 1;

            const typeKey = String(task.type);
            row.byType = row.byType || {};
            row.byType[typeKey] = (row.byType[typeKey] || 0) + 1;

            const priorityKey = String(task.priority);
            row.byPriority = row.byPriority || {};
            row.byPriority[priorityKey] = (row.byPriority[priorityKey] || 0) + 1;

            if (!typeStatsMap.has(typeKey)) {
                typeStatsMap.set(typeKey, {
                    type: task.type as IntelTaskType,
                    total: 0,
                    URGENT: 0,
                    HIGH: 0,
                    MEDIUM: 0,
                    LOW: 0,
                });
            }
            const typeRow = typeStatsMap.get(typeKey)!;
            typeRow.total += 1;
            switch (task.priority) {
                case IntelTaskPriority.URGENT:
                    typeRow.URGENT += 1;
                    break;
                case IntelTaskPriority.HIGH:
                    typeRow.HIGH += 1;
                    break;
                case IntelTaskPriority.MEDIUM:
                    typeRow.MEDIUM += 1;
                    break;
                case IntelTaskPriority.LOW:
                default:
                    typeRow.LOW += 1;
                    break;
            }
        });

        const typeOrder = Object.keys(INTEL_TASK_TYPE_LABELS);
        const typeStats = Array.from(typeStatsMap.values())
            .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

        return {
            summary: Array.from(summaryMap.values())
                .sort((a, b) => a.date.localeCompare(b.date)),
            typeStats,
        };
    }

    attachPreviewSummary(
        summary: CalendarSummaryResponse,
        previewTasks: CalendarPreviewTask[],
        query: GetCalendarSummaryDto,
    ): CalendarSummaryResponse {
        if (!previewTasks.length) {
            return summary;
        }

        const previewMap = new Map<string, number>();

        previewTasks.forEach(task => {
            if (query.type && task.type !== query.type) return;
            if (query.priority && task.priority !== query.priority) return;
            const dueDate = task.dueAt || task.deadline;
            if (!dueDate) return;
            const dateKey = dueDate.toISOString().slice(0, 10);
            previewMap.set(dateKey, (previewMap.get(dateKey) || 0) + 1);
        });

        if (previewMap.size === 0) {
            return summary;
        }

        const mergedMap = new Map(summary.summary.map(item => [item.date, { ...item }]));

        previewMap.forEach((count, dateKey) => {
            if (mergedMap.has(dateKey)) {
                const item = mergedMap.get(dateKey)!;
                item.preview = (item.preview || 0) + count;
            } else {
                mergedMap.set(dateKey, {
                    date: dateKey,
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    urgent: 0,
                    preview: count,
                });
            }
        });

        return {
            ...summary,
            summary: Array.from(mergedMap.values())
                .sort((a, b) => a.date.localeCompare(b.date)),
        };
    }

    async getOrgMetrics(query: IntelTaskQuery) {
        const where = this.buildWhere(query, 'metrics');
        if (!where.assigneeOrgId) {
            where.assigneeOrgId = { not: null };
        }

        const [totals, statusGroups, lateGroups] = await Promise.all([
            this.prisma.intelTask.groupBy({
                by: ['assigneeOrgId'],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['assigneeOrgId', 'status'],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['assigneeOrgId'],
                where: { ...where, isLate: true },
                _count: { _all: true },
            }),
        ]);

        const orgIds = totals.map(item => item.assigneeOrgId).filter(Boolean) as string[];
        const orgs = await this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
        });
        const orgMap = new Map(orgs.map(org => [org.id, org.name]));

        const statusMap = new Map<string, Record<string, number>>();
        statusGroups.forEach(item => {
            const key = item.assigneeOrgId as string;
            const current = statusMap.get(key) || {};
            current[item.status] = item._count._all;
            statusMap.set(key, current);
        });

        const lateMap = new Map<string, number>();
        lateGroups.forEach(item => {
            lateMap.set(item.assigneeOrgId as string, item._count._all);
        });

        const rows = totals.map(item => {
            const orgId = item.assigneeOrgId as string;
            const total = item._count._all;
            const status = statusMap.get(orgId) || {};
            const pending = status[IntelTaskStatus.PENDING] || 0;
            const completed = status[IntelTaskStatus.COMPLETED] || 0;
            const overdue = status[IntelTaskStatus.OVERDUE] || 0;
            const late = lateMap.get(orgId) || 0;

            return {
                orgId,
                orgName: orgMap.get(orgId) || '未知组织',
                total,
                pending,
                completed,
                overdue,
                late,
                completionRate: total ? completed / total : 0,
                overdueRate: total ? overdue / total : 0,
                lateRate: total ? late / total : 0,
            };
        });

        return rows.sort((a, b) => b.total - a.total);
    }

    async getDeptMetrics(query: IntelTaskQuery) {
        const where = this.buildWhere(query, 'metrics');
        if (!where.assigneeDeptId) {
            where.assigneeDeptId = { not: null };
        }

        const [totals, statusGroups, lateGroups] = await Promise.all([
            this.prisma.intelTask.groupBy({
                by: ['assigneeDeptId'],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['assigneeDeptId', 'status'],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['assigneeDeptId'],
                where: { ...where, isLate: true },
                _count: { _all: true },
            }),
        ]);

        const deptIds = totals.map(item => item.assigneeDeptId).filter(Boolean) as string[];
        const depts = await this.prisma.department.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, name: true },
        });
        const deptMap = new Map(depts.map(dept => [dept.id, dept.name]));

        const statusMap = new Map<string, Record<string, number>>();
        statusGroups.forEach(item => {
            const key = item.assigneeDeptId as string;
            const current = statusMap.get(key) || {};
            current[item.status] = item._count._all;
            statusMap.set(key, current);
        });

        const lateMap = new Map<string, number>();
        lateGroups.forEach(item => {
            lateMap.set(item.assigneeDeptId as string, item._count._all);
        });

        const rows = totals.map(item => {
            const deptId = item.assigneeDeptId as string;
            const total = item._count._all;
            const status = statusMap.get(deptId) || {};
            const pending = status[IntelTaskStatus.PENDING] || 0;
            const completed = status[IntelTaskStatus.COMPLETED] || 0;
            const overdue = status[IntelTaskStatus.OVERDUE] || 0;
            const late = lateMap.get(deptId) || 0;

            return {
                deptId,
                deptName: deptMap.get(deptId) || '未知部门',
                total,
                pending,
                completed,
                overdue,
                late,
                completionRate: total ? completed / total : 0,
                overdueRate: total ? overdue / total : 0,
                lateRate: total ? late / total : 0,
            };
        });

        return rows.sort((a, b) => b.total - a.total);
    }

    /**
     * 绩效评分（按人/部门/组织）
     */
    async getPerformanceMetrics(query: IntelTaskQuery) {
        const groupBy = query.groupBy || 'USER';
        const where = this.buildWhere(query, 'metrics');

        const groupField = groupBy === 'ORG' ? 'assigneeOrgId' : groupBy === 'DEPT' ? 'assigneeDeptId' : 'assigneeId';

        const [totals, statusGroups, lateGroups] = await Promise.all([
            this.prisma.intelTask.groupBy({
                by: [groupField],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: [groupField, 'status'],
                where,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: [groupField],
                where: { ...where, isLate: true },
                _count: { _all: true },
            }),
        ]);

        const statusMap = new Map<string, Record<string, number>>();
        statusGroups.forEach(item => {
            const key = String((item as Record<string, unknown>)[groupField] ?? '');
            if (!key) return;
            const current = statusMap.get(key) || {};
            current[item.status] = item._count._all;
            statusMap.set(key, current);
        });

        const lateMap = new Map<string, number>();
        lateGroups.forEach(item => {
            const key = String((item as Record<string, unknown>)[groupField] ?? '');
            if (!key) return;
            lateMap.set(key, item._count._all);
        });

        let nameMap = new Map<string, string>();
        if (groupBy === 'ORG') {
            const orgIds = totals.map(item => String((item as Record<string, unknown>)[groupField] ?? '')).filter(Boolean);
            const orgs = await this.prisma.organization.findMany({
                where: { id: { in: orgIds } },
                select: { id: true, name: true },
            });
            nameMap = new Map(orgs.map(o => [o.id, o.name]));
        } else if (groupBy === 'DEPT') {
            const deptIds = totals.map(item => String((item as Record<string, unknown>)[groupField] ?? '')).filter(Boolean);
            const depts = await this.prisma.department.findMany({
                where: { id: { in: deptIds } },
                select: { id: true, name: true },
            });
            nameMap = new Map(depts.map(d => [d.id, d.name]));
        } else {
            const userIds = totals.map(item => String((item as Record<string, unknown>)[groupField] ?? '')).filter(Boolean);
            const users = await this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true },
            });
            nameMap = new Map(users.map(u => [u.id, u.name]));
        }

        const rows = totals.map(item => {
            const key = String((item as Record<string, unknown>)[groupField] ?? '');
            const total = item._count._all;
            const status = statusMap.get(key) || {};
            const pending = status[IntelTaskStatus.PENDING] || 0;
            const completed = status[IntelTaskStatus.COMPLETED] || 0;
            const overdue = status[IntelTaskStatus.OVERDUE] || 0;
            const late = lateMap.get(key) || 0;

            const completionRate = total ? completed / total : 0;
            const overdueRate = total ? overdue / total : 0;
            const lateRate = total ? late / total : 0;
            const score = Math.round(completionRate * 60 + (1 - overdueRate) * 20 + (1 - lateRate) * 20);

            return {
                groupBy,
                id: key,
                name: nameMap.get(key) || '未知',
                total,
                pending,
                completed,
                overdue,
                late,
                completionRate,
                overdueRate,
                lateRate,
                score,
            };
        });

        return rows.sort((a, b) => b.score - a.score);
    }

    /**
     * 规则执行监控（按规则统计）
     */
    async getRuleMetrics(templateId: string, query: { startDate?: Date; endDate?: Date }) {
        const rangeEnd = query.endDate ? new Date(query.endDate) : new Date();
        const rangeStart = query.startDate
            ? new Date(query.startDate)
            : new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

        const baseWhere: Prisma.IntelTaskWhereInput = {
            templateId,
            ruleId: { not: null },
            createdAt: { gte: rangeStart, lte: rangeEnd },
        };

        const [totals, statusGroups, lateGroups, lastGroups, tasks] = await Promise.all([
            this.prisma.intelTask.groupBy({
                by: ['ruleId'],
                where: baseWhere,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['ruleId', 'status'],
                where: baseWhere,
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['ruleId'],
                where: { ...baseWhere, isLate: true },
                _count: { _all: true },
            }),
            this.prisma.intelTask.groupBy({
                by: ['ruleId'],
                where: baseWhere,
                _max: { createdAt: true },
            }),
            this.prisma.intelTask.findMany({
                where: baseWhere,
                select: { ruleId: true, createdAt: true, status: true },
            }),
        ]);

        const statusMap = new Map<string, Record<string, number>>();
        statusGroups.forEach(item => {
            const key = String(item.ruleId);
            const current = statusMap.get(key) || {};
            current[item.status] = item._count._all;
            statusMap.set(key, current);
        });

        const lateMap = new Map<string, number>();
        lateGroups.forEach(item => {
            lateMap.set(String(item.ruleId), item._count._all);
        });

        const lastMap = new Map<string, Date | null>();
        lastGroups.forEach(item => {
            lastMap.set(String(item.ruleId), item._max.createdAt || null);
        });

        const rows = totals.map(item => {
            const ruleId = String(item.ruleId);
            const total = item._count._all;
            const status = statusMap.get(ruleId) || {};
            return {
                ruleId,
                total,
                completed: status[IntelTaskStatus.COMPLETED] || 0,
                pending: status[IntelTaskStatus.PENDING] || 0,
                submitted: status[IntelTaskStatus.SUBMITTED] || 0,
                returned: status[IntelTaskStatus.RETURNED] || 0,
                overdue: status[IntelTaskStatus.OVERDUE] || 0,
                late: lateMap.get(ruleId) || 0,
                lastCreatedAt: lastMap.get(ruleId) || null,
            };
        });

        const dailyMap = new Map<string, { ruleId: string; date: string; total: number; completed: number; overdue: number }>();
        tasks.forEach(task => {
            const ruleId = String(task.ruleId);
            const dateKey = task.createdAt.toISOString().slice(0, 10);
            const key = `${ruleId}|${dateKey}`;
            if (!dailyMap.has(key)) {
                dailyMap.set(key, { ruleId, date: dateKey, total: 0, completed: 0, overdue: 0 });
            }
            const row = dailyMap.get(key)!;
            row.total += 1;
            if (task.status === IntelTaskStatus.COMPLETED) row.completed += 1;
            if (task.status === IntelTaskStatus.OVERDUE) row.overdue += 1;
        });

        return {
            rangeStart,
            rangeEnd,
            rules: rows,
            daily: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
        };
    }

    private buildWhere(query: IntelTaskQuery, mode: 'list' | 'metrics') {
        const {
            assigneeId,
            assigneeOrgId,
            assigneeDeptId,
            status,
            type,
            priority,
            periodKey,
            periodStart,
            periodEnd,
            dueStart,
            dueEnd,
            metricsStart,
            metricsEnd,
            startDate,
            endDate,
        } = query;

        const where: Prisma.IntelTaskWhereInput = {};
        if (assigneeId) where.assigneeId = assigneeId;
        if (assigneeOrgId) where.assigneeOrgId = assigneeOrgId;
        if (assigneeDeptId) where.assigneeDeptId = assigneeDeptId;
        if (status) where.status = status;
        if (type) where.type = type;
        if (priority) where.priority = priority;
        if (periodKey) where.periodKey = periodKey;

        if (periodStart || periodEnd) {
            where.periodStart = {};
            if (periodStart) where.periodStart.gte = periodStart;
            if (periodEnd) where.periodStart.lte = periodEnd;
        }

        const rangeStart = mode === 'metrics' ? (metricsStart || undefined) : dueStart;
        const rangeEnd = mode === 'metrics' ? (metricsEnd || undefined) : dueEnd;

        if (rangeStart || rangeEnd) {
            where.OR = [
                {
                    dueAt: {
                        ...(rangeStart ? { gte: rangeStart } : {}),
                        ...(rangeEnd ? { lte: rangeEnd } : {}),
                    },
                },
                {
                    dueAt: null,
                    deadline: {
                        ...(rangeStart ? { gte: rangeStart } : {}),
                        ...(rangeEnd ? { lte: rangeEnd } : {}),
                    },
                },
            ];
        }

        if (startDate || endDate) {
            const deadlineFilter: Prisma.DateTimeFilter = {};
            if (startDate) deadlineFilter.gte = startDate;
            if (endDate) deadlineFilter.lte = endDate;
            where.deadline = deadlineFilter;
        }

        return where;
    }

    /**
     * 获取用户待办任务 (Pending & Overdue)
     */
    async getMyTasks(userId: string) {
        return this.prisma.intelTask.findMany({
            where: {
                assigneeId: userId,
                status: {
                    in: [IntelTaskStatus.PENDING, IntelTaskStatus.OVERDUE, IntelTaskStatus.RETURNED],
                },
            },
            orderBy: { deadline: 'asc' },
            include: {
                template: { select: { name: true } },
                collectionPoint: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        commodities: true,
                        allocations: {
                            where: { userId, isActive: true },
                            select: { commodity: true }
                        }
                    }
                }
            }
        });
    }

    /**
     * 更新任务状态/内容
     */
    async update(id: string, dto: UpdateIntelTaskDto) {
        const existing = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }
        const shouldHandleGroup = dto.status === IntelTaskStatus.COMPLETED && existing.status !== IntelTaskStatus.COMPLETED;

        const updated = await this.prisma.intelTask.update({
            where: { id },
            data: {
                title: dto.title,
                description: dto.description,
                requirements: dto.requirements,
                attachmentUrls: dto.attachmentUrls,
                notifyConfig: dto.notifyConfig,
                priority: dto.priority,
                deadline: dto.deadline,
                status: dto.status,
                completedAt: dto.completedAt,
                intelId: dto.intelId,
                periodStart: dto.periodStart,
                periodEnd: dto.periodEnd,
                dueAt: dto.dueAt,
                periodKey: dto.periodKey,
                assigneeOrgId: dto.assigneeOrgId,
                assigneeDeptId: dto.assigneeDeptId,
                isLate: dto.isLate,
                templateId: dto.templateId,
                ruleId: dto.ruleId,
            },
            include: {
                assignee: {
                    select: { id: true, name: true, avatar: true },
                },
            },
        });

        if (shouldHandleGroup) {
            await this.handleGroupCompletion(id);
        }

        return updated;
    }

    /**
     * 提交任务 (PENDING -> SUBMITTED)
     */
    async submitTask(id: string, operatorId: string, submissionData?: Prisma.InputJsonValue) {
        const task = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!task) throw new NotFoundException(`任务 ID ${id} 不存在`);

        if (task.status !== IntelTaskStatus.PENDING && task.status !== IntelTaskStatus.RETURNED) {
            throw new Error(`任务当前状态 ${task.status} 不允许提交`);
        }

        const updated = await this.prisma.intelTask.update({
            where: { id },
            data: {
                status: IntelTaskStatus.SUBMITTED,
                // 如果有提交数据，可以在这里关联 submissionId 或其他字段
            }
        });

        await this.logHistory(id, operatorId, 'SUBMIT', {
            from: task.status,
            to: IntelTaskStatus.SUBMITTED,
            submissionData
        });

        return updated;
    }

    /**
     * 审核任务 (SUBMITTED -> COMPLETED | RETURNED)
     */
    async reviewTask(id: string, operatorId: string, approved: boolean, reason?: string) {
        const task = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!task) throw new NotFoundException(`任务 ID ${id} 不存在`);

        if (task.status !== IntelTaskStatus.SUBMITTED) {
            throw new Error(`任务当前状态 ${task.status} 不在审核中`);
        }

        const newStatus = approved ? IntelTaskStatus.COMPLETED : IntelTaskStatus.RETURNED;
        const completedAt = approved ? new Date() : null;

        // 计算是否逾期 (仅当通过时计算)
        let isLate = task.isLate;
        if (approved) {
            const dueAt = task.dueAt || task.deadline;
            if (dueAt && completedAt) {
                isLate = completedAt > dueAt;
            }
        }

        const updated = await this.prisma.intelTask.update({
            where: { id },
            data: {
                status: newStatus,
                completedAt,
                isLate,
            }
        });

        await this.logHistory(id, operatorId, approved ? 'APPROVE' : 'REJECT', {
            from: task.status,
            to: newStatus,
            reason
        });

        if (approved) {
            await this.handleGroupCompletion(id, operatorId);
        }

        return updated;
    }

    /**
     * 记录操作历史
     */
    private async logHistory(taskId: string, operatorId: string, action: string, details: Prisma.InputJsonValue) {
        // 验证用户是否存在，避免外键错误
        let validOperatorId = operatorId;

        if (operatorId) {
            const user = await this.prisma.user.findUnique({ where: { id: operatorId } });
            if (!user) {
                // 如果指定的 operatorId 不存在，尝试使用任务的 assigneeId
                const task = await this.prisma.intelTask.findUnique({
                    where: { id: taskId },
                    select: { assigneeId: true }
                });
                validOperatorId = task?.assigneeId || operatorId;

                // 再次验证 assigneeId 是否存在
                if (validOperatorId !== operatorId) {
                    const assignee = await this.prisma.user.findUnique({ where: { id: validOperatorId } });
                    if (!assignee) {
                        // 如果都不存在，跳过记录历史
                        console.warn(`logHistory: 无法找到有效的操作人 ID (operatorId: ${operatorId}, assigneeId: ${task?.assigneeId})`);
                        return null;
                    }
                }
            }
        }

        return this.prisma.intelTaskHistory.create({
            data: {
                taskId,
                operatorId: validOperatorId,
                action,
                details: details || {},
            }
        });
    }

    private parseQuorum(rule: { duePolicy?: Prisma.JsonValue | string | null } | null, total: number) {
        if (!rule) return Math.max(1, Math.ceil(total / 2));
        let policy = rule.duePolicy;
        if (typeof policy === 'string') {
            try {
                policy = JSON.parse(policy);
            } catch {
                policy = {};
            }
        }
        const policyObject = (typeof policy === 'object' && policy !== null)
            ? (policy as { quorum?: unknown; minComplete?: unknown; ratio?: unknown })
            : {};
        const rawQuorum = Number(policyObject.quorum ?? policyObject.minComplete);
        if (!Number.isNaN(rawQuorum) && rawQuorum > 0) {
            return Math.min(total, Math.floor(rawQuorum));
        }
        const ratio = Number(policyObject.ratio);
        if (!Number.isNaN(ratio) && ratio > 0) {
            return Math.min(total, Math.ceil(total * ratio));
        }
        return Math.max(1, Math.ceil(total / 2));
    }

    private async handleGroupCompletion(taskId: string, operatorId?: string) {
        const task = await this.prisma.intelTask.findUnique({
            where: { id: taskId },
            select: { taskGroupId: true },
        });
        if (!task?.taskGroupId) return;

        const group = await this.prisma.intelTaskGroup.findUnique({
            where: { id: task.taskGroupId },
        });
        if (!group?.ruleId) return;

        const rule = await this.prisma.intelTaskRule.findUnique({
            where: { id: group.ruleId },
        });
        if (!rule) return;

        const completionPolicy = rule.completionPolicy || IntelTaskCompletionPolicy.EACH;
        if (completionPolicy === IntelTaskCompletionPolicy.EACH) return;

        const tasks = await this.prisma.intelTask.findMany({
            where: { taskGroupId: group.id },
            select: { id: true, status: true, dueAt: true, deadline: true, assigneeId: true },
        });
        if (!tasks.length) return;

        const completedCount = tasks.filter(t => t.status === IntelTaskStatus.COMPLETED).length;
        const total = tasks.length;

        let shouldCompleteGroup = false;
        let shouldAutoComplete = false;

        if (completionPolicy === IntelTaskCompletionPolicy.ANY_ONE) {
            shouldCompleteGroup = completedCount >= 1;
            shouldAutoComplete = shouldCompleteGroup;
        } else if (completionPolicy === IntelTaskCompletionPolicy.QUORUM) {
            const quorum = this.parseQuorum(rule, total);
            shouldCompleteGroup = completedCount >= quorum;
            shouldAutoComplete = shouldCompleteGroup;
        } else if (completionPolicy === IntelTaskCompletionPolicy.ALL) {
            shouldCompleteGroup = completedCount >= total;
        }

        if (shouldCompleteGroup && group.status !== 'COMPLETED') {
            await this.prisma.intelTaskGroup.update({
                where: { id: group.id },
                data: { status: 'COMPLETED' },
            });
        }

        if (shouldAutoComplete) {
            const now = new Date();
            const pendingTasks = tasks.filter(t => t.status !== IntelTaskStatus.COMPLETED);
            for (const pending of pendingTasks) {
                const dueAt = pending.dueAt || pending.deadline;
                const isLate = dueAt ? now > dueAt : false;
                await this.prisma.intelTask.update({
                    where: { id: pending.id },
                    data: {
                        status: IntelTaskStatus.COMPLETED,
                        completedAt: now,
                        isLate,
                    },
                });
                if (operatorId) {
                    await this.logHistory(pending.id, operatorId, 'AUTO_COMPLETE', {
                        reason: completionPolicy,
                        groupId: group.id,
                    });
                }
            }
        }
    }

    /**
     * 完成任务 (Direct Complete - Admin/System override)
     */
    async complete(id: string, intelId?: string, operatorId?: string) {
        const task = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!task) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }
        const completedAt = new Date();
        const dueAt = task.dueAt || task.deadline;
        const isLate = dueAt ? completedAt > dueAt : false;

        const updated = await this.update(id, {
            status: IntelTaskStatus.COMPLETED,
            completedAt,
            intelId,
            isLate,
        });

        if (operatorId) {
            await this.logHistory(id, operatorId, 'COMPLETE_DIRECT', {
                from: task.status,
                to: IntelTaskStatus.COMPLETED,
                intelId
            });
        }

        await this.handleGroupCompletion(id, operatorId);

        return updated;
    }

    /**
     * 检查并标记超时任务
     */
    async checkOverdueTasks() {
        const now = new Date();

        const overdueTasks = await this.prisma.intelTask.updateMany({
            where: {
                status: IntelTaskStatus.PENDING,
                OR: [
                    { dueAt: { lt: now } },
                    { dueAt: null, deadline: { lt: now } },
                ],
            },
            data: {
                status: IntelTaskStatus.OVERDUE,
            },
        });

        return { count: overdueTasks.count };
    }

    /**
     * 删除任务
     */
    async remove(id: string) {
        const existing = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }
        await this.prisma.intelTask.delete({ where: { id } });
        return { success: true };
    }

    /**
     * 辅助方法：获取任务类型默认标题
     */
    getTaskTypeLabel(type: IntelTaskType): string {
        return INTEL_TASK_TYPE_LABELS[type] || '未知任务';
    }
}
