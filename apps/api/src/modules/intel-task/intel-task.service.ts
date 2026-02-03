import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQuery,
    IntelTaskStatus,
    IntelTaskPriority,
    IntelTaskType,
    INTEL_TASK_TYPE_LABELS,
} from '@packages/types';

@Injectable()
export class IntelTaskService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建采集任务
     */
    async create(dto: CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string, collectionPointId?: string }) {
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
                isLate: dto.isLate,
                collectionPointId: dto.collectionPointId,
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
    async createMany(tasks: (CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string, collectionPointId?: string, commodity?: string })[]) {
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
                isLate: t.isLate,
                collectionPointId: t.collectionPointId,
                commodity: t.commodity,
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

        const where: any = {};
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
            where.deadline = where.deadline || {};
            if (startDate) where.deadline.gte = startDate;
            if (endDate) where.deadline.lte = endDate;
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
                    in: [IntelTaskStatus.PENDING, IntelTaskStatus.OVERDUE],
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

        return this.prisma.intelTask.update({
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
            },
            include: {
                assignee: {
                    select: { id: true, name: true, avatar: true },
                },
            },
        });
    }

    /**
     * 提交任务 (PENDING -> SUBMITTED)
     */
    async submitTask(id: string, operatorId: string, submissionData?: any) {
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

        return updated;
    }

    /**
     * 记录操作历史
     */
    private async logHistory(taskId: string, operatorId: string, action: string, details: any) {
        // 简单验证用户是否存在，避免外键错误 (生产环境可能不需要查询，直接依靠DB约束)
        // 这里为了安全起见
        return this.prisma.intelTaskHistory.create({
            data: {
                taskId,
                operatorId,
                action,
                details: details || {},
            }
        });
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
