import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQuery,
    IntelTaskStatus,
} from '@packages/types';

@Injectable()
export class IntelTaskService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建采集任务
     */
    async create(dto: CreateIntelTaskDto) {
        return this.prisma.intelTask.create({
            data: {
                title: dto.title,
                type: dto.type,
                deadline: dto.deadline,
                assigneeId: dto.assigneeId,
            },
            include: {
                assignee: {
                    select: { id: true, name: true, avatar: true },
                },
            },
        });
    }

    /**
     * 批量创建每日任务
     */
    async createDailyTasks(assigneeIds: string[], type: string, deadline: Date) {
        const taskType = type as any;
        const tasks = assigneeIds.map((assigneeId) => ({
            title: this.getTaskTitle(type),
            type: taskType,
            deadline,
            assigneeId,
        }));

        return this.prisma.intelTask.createMany({ data: tasks });
    }

    /**
     * 查询任务列表 (分页)
     */
    async findAll(query: IntelTaskQuery) {
        const { page, pageSize, assigneeId, status, type } = query;

        const where: any = {};
        if (assigneeId) where.assigneeId = assigneeId;
        if (status) where.status = status;
        if (type) where.type = type;

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
     * 获取用户待办任务
     */
    async getMyTasks(userId: string) {
        return this.prisma.intelTask.findMany({
            where: {
                assigneeId: userId,
                status: IntelTaskStatus.PENDING,
            },
            orderBy: { deadline: 'asc' },
        });
    }

    /**
     * 更新任务状态
     */
    async update(id: string, dto: UpdateIntelTaskDto) {
        const existing = await this.prisma.intelTask.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }

        return this.prisma.intelTask.update({
            where: { id },
            data: {
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
     * 获取任务标题
     */
    private getTaskTitle(type: string): string {
        const titles: Record<string, string> = {
            PRICE_REPORT: '晨间价格上报',
            FIELD_CHECK: '现场确认',
            DOCUMENT_SCAN: '文档采集',
        };
        return titles[type] || '采集任务';
    }
}
