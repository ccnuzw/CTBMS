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
import { computePeriodInfo } from './intel-task-schedule.utils';

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
        template: any,
        opts: {
            assigneeIds?: string[];
            overrideDeadline?: Date;
            triggeredById?: string;
            runAt: Date;
        },
    ) {
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
        const periodInfo = computePeriodInfo(template, anchorDate, opts.overrideDeadline);
        const legacyDeadline = new Date(anchorDate);
        legacyDeadline.setHours(legacyDeadline.getHours() + template.deadlineOffset);
        const effectiveDeadline = opts.overrideDeadline || periodInfo.dueAt || legacyDeadline;

        const tasksToCreate = targetAssigneeIds.map(userId => {
            const snapshot = assigneeMap.get(userId);
            return {
                title: this.generateTaskTitle(template.name, periodInfo.periodKey || undefined),
                description: template.description || undefined,
                type: template.taskType,
                priority: template.priority,
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
            };
        });

        await this.taskService.createMany(tasksToCreate as any);

        await this.prisma.intelTaskTemplate.update({
            where: { id: template.id },
            data: { lastRunAt: opts.runAt },
        });

        return { count: tasksToCreate.length, assigneeIds: targetAssigneeIds };
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

    private async resolveAssigneesWithOverride(template: any, assigneeIdsOverride?: string[]) {
        if (assigneeIdsOverride && assigneeIdsOverride.length > 0) {
            return assigneeIdsOverride;
        }
        return this.resolveAssignees(template);
    }

    private generateTaskTitle(templateName: string, periodKey?: string): string {
        const dateStr = periodKey || new Date().toLocaleDateString();
        return `${templateName} [${dateStr}]`;
    }
}
