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
    async create(dto: CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string }) {
        return this.prisma.intelTask.create({
            data: {
                title: dto.title,
                description: dto.description,
                type: dto.type,
                priority: dto.priority || IntelTaskPriority.MEDIUM,
                deadline: dto.deadline,
                assigneeId: dto.assigneeId,
                createdById: dto.createdById,
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
     * 批量创建任务 (用于直接分发)
     */
    async createMany(tasks: (CreateIntelTaskDto & { createdById?: string, templateId?: string, description?: string })[]) {
        // Prisma createMany 不支持 include，所以如果需要返回完整对象，可能需要循环创建或者 createMany 后再查询
        // 这里为了性能使用 createMany，但无法返回关联对象
        return this.prisma.intelTask.createMany({
            data: tasks.map(t => ({
                title: t.title,
                description: t.description,
                type: t.type,
                priority: t.priority || IntelTaskPriority.MEDIUM,
                deadline: t.deadline,
                assigneeId: t.assigneeId,
                createdById: t.createdById,
                templateId: t.templateId,
            })),
        });
    }

    /**
     * 查询任务列表 (分页)
     */
    async findAll(query: IntelTaskQuery) {
        const { page, pageSize, assigneeId, status, type, priority, startDate, endDate } = query;

        const where: any = {};
        if (assigneeId) where.assigneeId = assigneeId;
        if (status) where.status = status;
        if (type) where.type = type;
        if (priority) where.priority = priority;

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
                template: { select: { name: true } }
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
                priority: dto.priority,
                deadline: dto.deadline,
                status: dto.status,
                completedAt: dto.completedAt,
                intelId: dto.intelId,
            },
            include: {
                assignee: {
                    select: { id: true, name: true, avatar: true },
                },
            },
        });
    }

    /**
     * 完成任务
     */
    async complete(id: string, intelId?: string) {
        return this.update(id, {
            status: IntelTaskStatus.COMPLETED,
            completedAt: new Date(),
            intelId,
        });
    }

    /**
     * 检查并标记超时任务
     */
    async checkOverdueTasks() {
        const now = new Date();

        const overdueTasks = await this.prisma.intelTask.updateMany({
            where: {
                status: IntelTaskStatus.PENDING,
                deadline: { lt: now },
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
