import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    IntelTaskQuery,
    IntelTaskStatus,
    IntelTaskPriority,
    IntelTaskType,
    INTEL_TASK_TYPE_LABELS,
    GetCalendarSummaryDto,
    CalendarSummaryResponse,
    CalendarPreviewTask,
} from '@packages/types';
import { Prisma } from '@prisma/client';

@Injectable()
import { buildIntelTaskWhere } from './intel-task.utils';
@Injectable()
export class IntelTaskMetricsService {
    constructor(private prisma: PrismaService) {}



    async getMetrics(query: IntelTaskQuery) {
        const where = buildIntelTaskWhere(query, 'metrics');

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
        const where = buildIntelTaskWhere(
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
        const where = buildIntelTaskWhere(query, 'metrics');
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
        const where = buildIntelTaskWhere(query, 'metrics');
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
        const where = buildIntelTaskWhere(query, 'metrics');

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


}
