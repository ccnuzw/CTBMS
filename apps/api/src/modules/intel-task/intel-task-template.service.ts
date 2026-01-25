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

        let targetAssigneeIds: string[] = [];

        // 1. 确定分发对象
        if (dto.assigneeIds && dto.assigneeIds.length > 0) {
            // 优先使用手动指定的 ID
            targetAssigneeIds = dto.assigneeIds;
        } else {
            // 使用模板定义的规则
            targetAssigneeIds = await this.resolveAssignees(template);
        }

        if (targetAssigneeIds.length === 0) {
            return { count: 0, message: '未找到符合条件的分发对象' };
        }

        // 2. 计算截止时间
        let deadline = new Date();
        if (dto.overrideDeadline) {
            deadline = new Date(dto.overrideDeadline);
        } else {
            // 默认：当前时间 + 偏移量
            deadline.setHours(deadline.getHours() + template.deadlineOffset);
        }

        // 3. 生成任务
        const tasksToCreate = targetAssigneeIds.map(userId => ({
            title: this.generateTaskTitle(template.name), // 可以加上日期后缀
            description: template.description || undefined,
            type: template.taskType,
            priority: template.priority,
            deadline: deadline,
            assigneeId: userId,
            createdById: triggeredById,
            templateId: template.id,
        }));

        await this.taskService.createMany(tasksToCreate as any);

        // 4. 更新模板最后运行时间
        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: new Date() },
        });

        return {
            count: tasksToCreate.length,
            message: `成功分发 ${tasksToCreate.length} 个任务`,
            assigneeIds: targetAssigneeIds,
        };
    }

    // --- Helpers ---

    /**
     * 解析分发规则，获取目标用户 ID 列表
     */
    private async resolveAssignees(template: any): Promise<string[]> {
        const { assigneeMode, assigneeIds, departmentIds, organizationIds } = template;

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

        return Array.from(targetIds);
    }

    private generateTaskTitle(templateName: string): string {
        const dateStr = new Date().toLocaleDateString();
        // 如果模板名称中已包含日期格式占位符，可以处理 (简化处理：直接追加日期)
        return `${templateName} [${dateStr}]`;
    }
}
