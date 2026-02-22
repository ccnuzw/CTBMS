import { Injectable, NotFoundException, BadRequestException , Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { forwardRef, Inject } from '@nestjs/common';
import { IntelTaskStateService } from './intel-task-state.service';
import { isMissingReturnReasonColumnError, buildIntelTaskWhere } from './intel-task.utils';
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
  private readonly logger = new Logger(IntelTaskService.name);
    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        @Inject(forwardRef(() => IntelTaskStateService))
        private readonly stateService: IntelTaskStateService
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
        const where = buildIntelTaskWhere(query, 'list');

        // Date range filter on deadline
        if (startDate || endDate) {
            where.deadline = {};
            if (startDate) where.deadline.gte = startDate;
            if (endDate) where.deadline.lte = endDate;
        }

        let data: Record<string, unknown>[] = [];
        let total = 0;

        try {
            [data, total] = await Promise.all([
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
        } catch (error) {
            if (!isMissingReturnReasonColumnError(error)) {
                throw error;
            }

            [data, total] = await Promise.all([
                this.prisma.intelTask.findMany({
                    where,
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    orderBy: { deadline: 'asc' },
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        requirements: true,
                        attachmentUrls: true,
                        notifyConfig: true,
                        type: true,
                        priority: true,
                        deadline: true,
                        periodStart: true,
                        periodEnd: true,
                        dueAt: true,
                        periodKey: true,
                        assigneeId: true,
                        assigneeOrgId: true,
                        assigneeDeptId: true,
                        createdById: true,
                        templateId: true,
                        ruleId: true,
                        taskGroupId: true,
                        collectionPointId: true,
                        commodity: true,
                        priceSubmissionId: true,
                        status: true,
                        completedAt: true,
                        isLate: true,
                        intelId: true,
                        formId: true,
                        workflowId: true,
                        createdAt: true,
                        updatedAt: true,
                        assignee: {
                            select: { id: true, name: true, avatar: true },
                        },
                        template: {
                            select: { name: true },
                        },
                    },
                }),
                this.prisma.intelTask.count({ where }),
            ]);
        }

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    /**
     * 获取单个任务详情
     */
    async findOne(id: string) {
        const task = await this.prisma.intelTask.findUnique({
            where: { id },
            include: {
                assignee: { select: { id: true, name: true, avatar: true } },
                template: { select: { name: true } },
                collectionPoint: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        commodities: true,
                    }
                }
            },
        });

        if (!task) {
            throw new NotFoundException(`任务 ID ${id} 不存在`);
        }

        return task;
    }

    /**
     * 获取用户待办任务 (Pending & Overdue)
     */
    async getMyTasks(userId: string) {
        try {
            return await this.prisma.intelTask.findMany({
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
        } catch (error) {
            if (!isMissingReturnReasonColumnError(error)) {
                throw error;
            }

            return this.prisma.intelTask.findMany({
                where: {
                    assigneeId: userId,
                    status: {
                        in: [IntelTaskStatus.PENDING, IntelTaskStatus.OVERDUE, IntelTaskStatus.RETURNED],
                    },
                },
                orderBy: { deadline: 'asc' },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    requirements: true,
                    attachmentUrls: true,
                    notifyConfig: true,
                    type: true,
                    priority: true,
                    deadline: true,
                    periodStart: true,
                    periodEnd: true,
                    dueAt: true,
                    periodKey: true,
                    assigneeId: true,
                    assigneeOrgId: true,
                    assigneeDeptId: true,
                    createdById: true,
                    templateId: true,
                    ruleId: true,
                    taskGroupId: true,
                    collectionPointId: true,
                    commodity: true,
                    priceSubmissionId: true,
                    status: true,
                    completedAt: true,
                    isLate: true,
                    intelId: true,
                    formId: true,
                    workflowId: true,
                    createdAt: true,
                    updatedAt: true,
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
            await this.stateService.handleGroupCompletion(id);
        }

        return updated;
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
