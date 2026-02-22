import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma, IntelTask } from '@prisma/client';
import { IntelTaskStatus, IntelTaskCompletionPolicy } from '@packages/types';

import { IntelTaskService } from './intel-task.service';
import { isMissingReturnReasonColumnError } from './intel-task.utils';

@Injectable()
export class IntelTaskStateService {
    private readonly logger = new Logger(IntelTaskStateService.name);

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => IntelTaskService))
        private readonly intelTaskService: IntelTaskService
    ) {}



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

        let updated: IntelTask;
        try {
            updated = await this.prisma.intelTask.update({
                where: { id },
                data: {
                    status: newStatus,
                    completedAt,
                    isLate,
                    returnReason: approved ? null : reason,
                }
            });
        } catch (error) {
            if (!isMissingReturnReasonColumnError(error)) {
                throw error;
            }
            updated = await this.prisma.intelTask.update({
                where: { id },
                data: {
                    status: newStatus,
                    completedAt,
                    isLate,
                }
            });
        }

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
                        this.logger.warn(`logHistory: 无法找到有效的操作人 ID (operatorId: ${operatorId}, assigneeId: ${task?.assigneeId})`);
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

        const updated = await this.intelTaskService.update(id, {
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
     * 取消任务 (用于无法完成的任务，如重复数据冲突)
     */
    async cancelTask(id: string, operatorId?: string, reason?: string) {
        const task = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!task) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }

        // 只允许取消待办、逾期、已驳回状态的任务
        const allowedStatuses = [IntelTaskStatus.PENDING, IntelTaskStatus.OVERDUE, IntelTaskStatus.RETURNED];
        if (!allowedStatuses.includes(task.status as IntelTaskStatus)) {
            throw new BadRequestException(`任务当前状态 ${task.status} 不允许取消`);
        }

        const updated = await this.prisma.intelTask.update({
            where: { id },
            data: {
                status: IntelTaskStatus.CANCELLED,
            },
            include: {
                assignee: { select: { id: true, name: true, avatar: true } },
            },
        });

        if (operatorId) {
            await this.logHistory(id, operatorId, 'CANCEL', {
                from: task.status,
                to: IntelTaskStatus.CANCELLED,
                reason: reason || '用户主动取消',
            });
        }

        return updated;
    }


}
