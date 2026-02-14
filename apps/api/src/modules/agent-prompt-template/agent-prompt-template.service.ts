import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    AgentPromptTemplateQueryDto,
    CreateAgentPromptTemplateDto,
    UpdateAgentPromptTemplateDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { OutputSchemaRegistryService } from '../agent-profile';

@Injectable()
export class AgentPromptTemplateService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly outputSchemaRegistryService: OutputSchemaRegistryService,
    ) { }

    async create(ownerUserId: string, dto: CreateAgentPromptTemplateDto) {
        const existing = await this.prisma.agentPromptTemplate.findUnique({
            where: { promptCode: dto.promptCode },
        });
        if (existing) {
            throw new BadRequestException(`promptCode 已存在: ${dto.promptCode}`);
        }

        if (dto.outputSchemaCode) {
            this.ensureOutputSchemaKnown(dto.outputSchemaCode);
        }
        const template = await this.prisma.agentPromptTemplate.create({
            data: {
                promptCode: dto.promptCode,
                name: dto.name,
                roleType: dto.roleType,
                systemPrompt: dto.systemPrompt,
                userPromptTemplate: dto.userPromptTemplate,
                fewShotExamples: this.toNullableJsonValue(dto.fewShotExamples),
                outputFormat: dto.outputFormat,
                variables: this.toNullableJsonValue(dto.variables),
                guardrails: this.toNullableJsonValue(dto.guardrails),
                outputSchemaCode: dto.outputSchemaCode,
                previousVersionId: null,
                ownerUserId,
                templateSource: dto.templateSource,
                version: 1,
            },
        });

        await this.createSnapshot(template);
        return template;
    }

    async findAll(ownerUserId: string, query: AgentPromptTemplateQueryDto) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = this.buildAccessibleWhere(ownerUserId, query);

        const [data, total] = await Promise.all([
            this.prisma.agentPromptTemplate.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ updatedAt: 'desc' }],
            }),
            this.prisma.agentPromptTemplate.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async findOne(ownerUserId: string, id: string) {
        const template = await this.prisma.agentPromptTemplate.findFirst({
            where: {
                id,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
        });

        if (!template) {
            throw new NotFoundException('提示词模板不存在或无权限访问');
        }
        return template;
    }

    async findByCode(ownerUserId: string, promptCode: string) {
        const template = await this.prisma.agentPromptTemplate.findFirst({
            where: {
                promptCode,
                isActive: true,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
        });

        if (!template) {
            throw new NotFoundException(`提示词模板不存在: ${promptCode}`);
        }
        return template;
    }

    async update(ownerUserId: string, id: string, dto: UpdateAgentPromptTemplateDto) {
        const current = await this.ensureEditableTemplate(ownerUserId, id);
        if (dto.outputSchemaCode) {
            this.ensureOutputSchemaKnown(dto.outputSchemaCode);
        }
        const previousSnapshot = await this.prisma.agentPromptTemplateSnapshot.findFirst({
            where: { templateId: id, version: current.version },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        const data: Prisma.AgentPromptTemplateUpdateInput = {
            name: dto.name,
            roleType: dto.roleType,
            systemPrompt: dto.systemPrompt,
            userPromptTemplate: dto.userPromptTemplate,
            outputFormat: dto.outputFormat,
            isActive: dto.isActive,
            version: { increment: 1 },
            previousVersionId: previousSnapshot?.id ?? current.previousVersionId ?? null,
        };

        if (Object.prototype.hasOwnProperty.call(dto, 'fewShotExamples')) {
            data.fewShotExamples = this.toNullableJsonValue(dto.fewShotExamples);
        }
        if (Object.prototype.hasOwnProperty.call(dto, 'variables')) {
            data.variables = this.toNullableJsonValue(dto.variables);
        }
        if (Object.prototype.hasOwnProperty.call(dto, 'guardrails')) {
            data.guardrails = this.toNullableJsonValue(dto.guardrails);
        }
        if (Object.prototype.hasOwnProperty.call(dto, 'outputSchemaCode')) {
            data.outputSchemaCode = dto.outputSchemaCode;
        }

        const updated = await this.prisma.agentPromptTemplate.update({
            where: { id },
            data,
        });

        await this.createSnapshot(updated);
        return updated;
    }

    async remove(ownerUserId: string, id: string) {
        await this.ensureEditableTemplate(ownerUserId, id);
        return this.prisma.agentPromptTemplate.update({
            where: { id },
            data: { isActive: false },
        });
    }

    async getHistory(ownerUserId: string, id: string) {
        await this.findOne(ownerUserId, id); // Ensure access
        return this.prisma.agentPromptTemplateSnapshot.findMany({
            where: { templateId: id },
            orderBy: { version: 'desc' },
        });
    }

    async rollback(ownerUserId: string, id: string, targetVersion: number) {
        const current = await this.ensureEditableTemplate(ownerUserId, id);
        const snapshot = await this.prisma.agentPromptTemplateSnapshot.findFirst({
            where: { templateId: id, version: targetVersion },
        });

        if (!snapshot) {
            throw new NotFoundException(`Snapshot for version ${targetVersion} not found`);
        }

        const snapshotData = snapshot.data as any;
        if (snapshotData.outputSchemaCode) {
            this.ensureOutputSchemaKnown(String(snapshotData.outputSchemaCode));
        }
        const previousSnapshot = await this.prisma.agentPromptTemplateSnapshot.findFirst({
            where: { templateId: id, version: current.version },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });

        // Create new version with reverted data
        const updated = await this.prisma.agentPromptTemplate.update({
            where: { id },
            data: {
                name: snapshotData.name,
                roleType: snapshotData.roleType,
                systemPrompt: snapshotData.systemPrompt,
                userPromptTemplate: snapshotData.userPromptTemplate,
                fewShotExamples: snapshotData.fewShotExamples,
                outputFormat: snapshotData.outputFormat,
                variables: snapshotData.variables,
                guardrails: snapshotData.guardrails,
                outputSchemaCode: snapshotData.outputSchemaCode,
                version: { increment: 1 },
                previousVersionId: previousSnapshot?.id ?? current.previousVersionId ?? null,
            },
        });

        await this.createSnapshot(updated);
        return updated;
    }

    private async createSnapshot(
        template: Prisma.AgentPromptTemplateGetPayload<object>,
        userId?: string,
    ) {
        const data = JSON.parse(JSON.stringify(template)) as Prisma.InputJsonValue;
        await this.prisma.agentPromptTemplateSnapshot.create({
            data: {
                templateId: template.id,
                promptCode: template.promptCode,
                version: template.version,
                data,
                createdByUserId: userId || template.ownerUserId,
            },
        });
    }

    private ensureOutputSchemaKnown(outputSchemaCode: string) {
        if (this.outputSchemaRegistryService.getSchema(outputSchemaCode)) {
            return;
        }
        throw new BadRequestException(`outputSchemaCode 不存在: ${outputSchemaCode}`);
    }

    private buildAccessibleWhere(
        ownerUserId: string,
        query: AgentPromptTemplateQueryDto,
    ): Prisma.AgentPromptTemplateWhereInput {
        const where: Prisma.AgentPromptTemplateWhereInput = {
            OR: query.includePublic ? [{ ownerUserId }, { templateSource: 'PUBLIC' }] : [{ ownerUserId }],
        };

        if (query.isActive !== undefined) {
            where.isActive = query.isActive;
        }

        if (query.roleType) {
            where.roleType = query.roleType;
        }

        const keyword = query.keyword?.trim();
        if (keyword) {
            where.AND = [
                {
                    OR: [
                        { name: { contains: keyword, mode: 'insensitive' } },
                        { promptCode: { contains: keyword, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        return where;
    }

    private async ensureEditableTemplate(ownerUserId: string, id: string) {
        const template = await this.prisma.agentPromptTemplate.findFirst({
            where: {
                id,
                ownerUserId,
            },
        });
        if (!template) {
            throw new NotFoundException('提示词模板不存在或无权限编辑');
        }
        return template;
    }

    private toNullableJsonValue(
        value: unknown,
    ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
        if (value === undefined) {
            return undefined;
        }
        if (value === null) {
            return Prisma.JsonNull;
        }
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    }
}
