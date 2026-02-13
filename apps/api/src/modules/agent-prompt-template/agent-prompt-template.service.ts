import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    AgentPromptTemplateQueryDto,
    CreateAgentPromptTemplateDto,
    UpdateAgentPromptTemplateDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class AgentPromptTemplateService {
    constructor(private readonly prisma: PrismaService) { }

    async create(ownerUserId: string, dto: CreateAgentPromptTemplateDto) {
        const existing = await this.prisma.agentPromptTemplate.findUnique({
            where: { promptCode: dto.promptCode },
        });
        if (existing) {
            throw new BadRequestException(`promptCode 已存在: ${dto.promptCode}`);
        }

        return this.prisma.agentPromptTemplate.create({
            data: {
                promptCode: dto.promptCode,
                name: dto.name,
                roleType: dto.roleType,
                systemPrompt: dto.systemPrompt,
                userPromptTemplate: dto.userPromptTemplate,
                fewShotExamples: this.toNullableJsonValue(dto.fewShotExamples),
                outputFormat: dto.outputFormat,
                variables: this.toNullableJsonValue(dto.variables),
                ownerUserId,
                templateSource: dto.templateSource,
            },
        });
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
        await this.ensureEditableTemplate(ownerUserId, id);

        const data: Prisma.AgentPromptTemplateUpdateInput = {
            name: dto.name,
            roleType: dto.roleType,
            systemPrompt: dto.systemPrompt,
            userPromptTemplate: dto.userPromptTemplate,
            outputFormat: dto.outputFormat,
            isActive: dto.isActive,
        };

        if (Object.prototype.hasOwnProperty.call(dto, 'fewShotExamples')) {
            data.fewShotExamples = this.toNullableJsonValue(dto.fewShotExamples);
        }
        if (Object.prototype.hasOwnProperty.call(dto, 'variables')) {
            data.variables = this.toNullableJsonValue(dto.variables);
        }

        return this.prisma.agentPromptTemplate.update({
            where: { id },
            data,
        });
    }

    async remove(ownerUserId: string, id: string) {
        await this.ensureEditableTemplate(ownerUserId, id);
        return this.prisma.agentPromptTemplate.update({
            where: { id },
            data: { isActive: false },
        });
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
