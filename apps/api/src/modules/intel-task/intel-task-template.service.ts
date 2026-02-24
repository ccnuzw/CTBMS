import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { IntelTaskService } from './intel-task.service';
import {
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    IntelTaskType,
    IntelTaskPriority,
    TaskScheduleMode,
} from '@packages/types';
import {
    CollectionPointType as PrismaCollectionPointType,
    IntelTaskPriority as PrismaIntelTaskPriority,
    IntelTaskTemplate,
    IntelTaskType as PrismaIntelTaskType,
    Prisma,
} from '@prisma/client';
import { CreateIntelTaskRuleDto, UpdateIntelTaskRuleDto } from './dto';
import { IntelTaskDispatchService } from './intel-task-dispatch.service';

@Injectable()
export class IntelTaskTemplateService {
    constructor(
        public prisma: PrismaService,
        public taskService: IntelTaskService,
        public configService: ConfigService,
        @Inject(forwardRef(() => IntelTaskDispatchService))
        public dispatchService: IntelTaskDispatchService,
    ) { }

    public toPrismaTaskType(value: IntelTaskType) {
        return value as unknown as PrismaIntelTaskType;
    }

    public toPrismaTaskPriority(value: IntelTaskPriority) {
        return value as unknown as PrismaIntelTaskPriority;
    }

    public resolvePointTypes(input?: string | string[]) {
        const values = Array.isArray(input) ? input : input ? [input] : [];
        return values.filter((value): value is PrismaCollectionPointType =>
            Object.values(PrismaCollectionPointType).includes(value as PrismaCollectionPointType),
        );
    }

    public async resolveTaskTypeBinding(taskType: IntelTaskType) {
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

        return {
            formKey: meta.formKey,
            workflowKey: meta.workflowKey,
            requiresCollectionPoint: meta.requiresCollectionPoint,
            defaultSlaHours: meta.defaultSlaHours,
        };
    }

    /**
     * 创建任务模板
     */
    async create(dto: CreateIntelTaskTemplateDto & { createdById: string }) {
        const data = { ...dto } as Prisma.IntelTaskTemplateUncheckedCreateInput;
        if (Array.isArray(dto.targetPointTypes)) {
            const normalized = dto.targetPointTypes.filter(Boolean);
            data.targetPointTypes = normalized;
            data.targetPointType = normalized[0] ?? dto.targetPointType ?? null;
        } else if (dto.targetPointType) {
            data.targetPointTypes = [dto.targetPointType];
            data.targetPointType = dto.targetPointType;
        }
        if (dto.taskType === IntelTaskType.COLLECTION) {
            if (!data.scheduleMode) {
                data.scheduleMode = TaskScheduleMode.POINT_DEFAULT as Prisma.IntelTaskTemplateUncheckedCreateInput['scheduleMode'];
            }
        } else {
            data.scheduleMode = TaskScheduleMode.TEMPLATE_OVERRIDE as Prisma.IntelTaskTemplateUncheckedCreateInput['scheduleMode'];
        }
        data.taskType = this.toPrismaTaskType(dto.taskType);
        if (dto.priority) {
            data.priority = this.toPrismaTaskPriority(dto.priority);
        }
        return this.prisma.intelTaskTemplate.create({
            data: {
                ...data,
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
        const data = { ...dto } as Prisma.IntelTaskTemplateUncheckedUpdateInput;
        const hasTargetPointTypes = Object.prototype.hasOwnProperty.call(dto, 'targetPointTypes');
        const hasTargetPointType = Object.prototype.hasOwnProperty.call(dto, 'targetPointType');
        if (hasTargetPointTypes) {
            const normalized = (dto.targetPointTypes || []).filter(Boolean);
            data.targetPointTypes = normalized;
            data.targetPointType = normalized[0] ?? null;
        } else if (hasTargetPointType) {
            if (dto.targetPointType) {
                data.targetPointTypes = [dto.targetPointType];
                data.targetPointType = dto.targetPointType;
            } else {
                data.targetPointTypes = [];
                data.targetPointType = null;
            }
        }
        const taskType = (dto.taskType || existing.taskType) as IntelTaskType;
        if (taskType === IntelTaskType.COLLECTION) {
            if (!data.scheduleMode) {
                data.scheduleMode = (existing.scheduleMode || TaskScheduleMode.POINT_DEFAULT) as Prisma.IntelTaskTemplateUncheckedUpdateInput['scheduleMode'];
            }
        } else {
            data.scheduleMode = TaskScheduleMode.TEMPLATE_OVERRIDE as Prisma.IntelTaskTemplateUncheckedUpdateInput['scheduleMode'];
        }
        if (dto.taskType) {
            data.taskType = this.toPrismaTaskType(dto.taskType);
        }
        if (dto.priority) {
            data.priority = this.toPrismaTaskPriority(dto.priority);
        }
        return this.prisma.intelTaskTemplate.update({
            where: { id },
            data,
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

    // ========================
    // 任务规则管理
    // ========================

    async listRules(templateId: string) {
        return this.prisma.intelTaskRule.findMany({
            where: { templateId },
            orderBy: { createdAt: 'asc' },
        });
    }

    async createRule(dto: { templateId: string } & CreateIntelTaskRuleDto) {
        const template = await this.prisma.intelTaskTemplate.findUnique({
            where: { id: dto.templateId },
        });
        if (!template) {
            throw new NotFoundException('任务模板不存在');
        }
        const input = dto as Partial<Prisma.IntelTaskRuleUncheckedCreateInput>;
        if (!input.scopeType) {
            throw new BadRequestException('scopeType is required');
        }
        return this.prisma.intelTaskRule.create({
            data: {
                templateId: dto.templateId,
                scopeType: input.scopeType,
                scopeQuery: input.scopeQuery,
                frequencyType: input.frequencyType,
                weekdays: Array.isArray(input.weekdays) ? input.weekdays : [],
                monthDays: Array.isArray(input.monthDays) ? input.monthDays : [],
                dispatchAtMinute: input.dispatchAtMinute ?? 540,
                duePolicy: input.duePolicy,
                assigneeStrategy: input.assigneeStrategy,
                completionPolicy: input.completionPolicy,
                grouping: input.grouping ?? false,
                isActive: input.isActive ?? true,
            },
        });
    }

    async updateRule(id: string, dto: UpdateIntelTaskRuleDto) {
        const existing = await this.prisma.intelTaskRule.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('任务规则不存在');
        }
        const input = dto as Partial<Prisma.IntelTaskRuleUncheckedUpdateInput>;
        return this.prisma.intelTaskRule.update({
            where: { id },
            data: {
                scopeType: input.scopeType ?? undefined,
                scopeQuery: input.scopeQuery ?? undefined,
                frequencyType: input.frequencyType ?? undefined,
                weekdays: input.weekdays ?? undefined,
                monthDays: input.monthDays ?? undefined,
                dispatchAtMinute: input.dispatchAtMinute ?? undefined,
                duePolicy: input.duePolicy ?? undefined,
                assigneeStrategy: input.assigneeStrategy ?? undefined,
                completionPolicy: input.completionPolicy ?? undefined,
                grouping: input.grouping ?? undefined,
                isActive: input.isActive ?? undefined,
            },
        });
    }

    async removeRule(id: string) {
        const existing = await this.prisma.intelTaskRule.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('任务规则不存在');
        }
        return this.prisma.intelTaskRule.delete({ where: { id } });
    }

    async createTasksFromTemplate(
        template: IntelTaskTemplate,
        opts: { assigneeIds?: string[]; overrideDeadline?: Date; triggeredById?: string; runAt: Date },
    ) {
        const rules = await this.prisma.intelTaskRule.findMany({
            where: { templateId: template.id, isActive: true },
            orderBy: { createdAt: 'asc' },
        });
        if (rules.length === 0) {
            return { count: 0, assigneeIds: [] as string[] };
        }

        const typeMeta = await this.resolveTaskTypeBinding(template.taskType as unknown as IntelTaskType);
        return this.dispatchService.createTasksFromRules(template, rules, opts, typeMeta);
    }
}
