import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    CreateWorkflowDefinitionDto,
    CreateWorkflowVersionDto,
    PublishWorkflowVersionDto,
    UpdateWorkflowDefinitionDto,
    WorkflowDefinitionQueryDto,
    WorkflowDsl,
    WorkflowDslSchema,
    WorkflowValidationStage,
    WorkflowValidationResult,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { WorkflowDslValidator } from './workflow-dsl-validator';

@Injectable()
export class WorkflowDefinitionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly dslValidator: WorkflowDslValidator,
    ) { }

    async create(ownerUserId: string, dto: CreateWorkflowDefinitionDto) {
        const existing = await this.prisma.workflowDefinition.findUnique({
            where: { workflowId: dto.workflowId },
        });

        if (existing) {
            throw new BadRequestException(`workflowId 已存在: ${dto.workflowId}`);
        }

        const normalizedDsl = this.normalizeDslForDefinition(
            dto.dslSnapshot,
            dto.workflowId,
            dto.name,
            dto.mode,
            dto.usageMethod,
            ownerUserId,
            dto.templateSource,
        );
        this.ensureDslValid(normalizedDsl);
        this.ensureRiskGateBindingsValid(normalizedDsl);
        await this.ensureRulePackBindingsValid(ownerUserId, normalizedDsl);

        const created = await this.prisma.$transaction(async (tx) => {
            const definition = await tx.workflowDefinition.create({
                data: {
                    workflowId: dto.workflowId,
                    name: dto.name,
                    description: dto.description ?? null,
                    mode: dto.mode,
                    usageMethod: dto.usageMethod,
                    status: 'DRAFT',
                    ownerUserId,
                    templateSource: dto.templateSource,
                    latestVersionCode: '1.0.0',
                },
            });

            const version = await tx.workflowVersion.create({
                data: {
                    workflowDefinitionId: definition.id,
                    versionCode: '1.0.0',
                    status: 'DRAFT',
                    dslSnapshot: this.toJsonValue(normalizedDsl),
                    changelog: dto.changelog ?? '初始化版本',
                    createdByUserId: ownerUserId,
                },
            });

            return { definition, version };
        });

        return created;
    }

    async findAll(ownerUserId: string, query: WorkflowDefinitionQueryDto) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = this.buildAccessibleWhere(ownerUserId, query, query.includePublic);

        const [data, total] = await Promise.all([
            this.prisma.workflowDefinition.findMany({
                where,
                orderBy: [{ updatedAt: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    versions: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            }),
            this.prisma.workflowDefinition.count({ where }),
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
        const definition = await this.prisma.workflowDefinition.findFirst({
            where: {
                id,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
            include: {
                versions: {
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!definition) {
            throw new NotFoundException('流程不存在或无权限访问');
        }

        return definition;
    }

    async update(ownerUserId: string, id: string, dto: UpdateWorkflowDefinitionDto) {
        await this.ensureEditableDefinition(ownerUserId, id);

        const nextStatus = dto.status;
        const isActive = nextStatus === 'ARCHIVED' ? false : dto.isActive;

        return this.prisma.workflowDefinition.update({
            where: { id },
            data: {
                name: dto.name,
                description: dto.description,
                usageMethod: dto.usageMethod,
                status: nextStatus,
                isActive,
            },
        });
    }

    async remove(ownerUserId: string, id: string) {
        await this.ensureEditableDefinition(ownerUserId, id);

        return this.prisma.workflowDefinition.update({
            where: { id },
            data: {
                status: 'ARCHIVED',
                isActive: false,
            },
        });
    }

    async listVersions(ownerUserId: string, id: string) {
        await this.ensureReadableDefinition(ownerUserId, id);

        return this.prisma.workflowVersion.findMany({
            where: { workflowDefinitionId: id },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createVersion(ownerUserId: string, id: string, dto: CreateWorkflowVersionDto) {
        const definition = await this.ensureEditableDefinition(ownerUserId, id);
        const normalizedDsl = this.normalizeDslForDefinition(
            dto.dslSnapshot,
            definition.workflowId,
            definition.name,
            definition.mode,
            definition.usageMethod,
            definition.ownerUserId,
            definition.templateSource,
        );
        this.ensureDslValid(normalizedDsl);
        this.ensureRiskGateBindingsValid(normalizedDsl);
        await this.ensureRulePackBindingsValid(definition.ownerUserId, normalizedDsl);

        const nextVersionCode = this.nextVersionCode(definition.latestVersionCode);
        const createdVersion = await this.prisma.$transaction(async (tx) => {
            const version = await tx.workflowVersion.create({
                data: {
                    workflowDefinitionId: definition.id,
                    versionCode: nextVersionCode,
                    status: 'DRAFT',
                    dslSnapshot: this.toJsonValue(normalizedDsl),
                    changelog: dto.changelog ?? '保存草稿版本',
                    createdByUserId: ownerUserId,
                },
            });

            await tx.workflowDefinition.update({
                where: { id: definition.id },
                data: { latestVersionCode: nextVersionCode },
            });

            return version;
        });

        return createdVersion;
    }

    async publishVersion(ownerUserId: string, id: string, dto: PublishWorkflowVersionDto) {
        await this.ensureEditableDefinition(ownerUserId, id);

        const targetVersion = await this.prisma.workflowVersion.findFirst({
            where: {
                workflowDefinitionId: id,
                ...(dto.versionId ? { id: dto.versionId } : {}),
                ...(dto.versionCode ? { versionCode: dto.versionCode } : {}),
            },
        });

        if (!targetVersion) {
            throw new NotFoundException('目标版本不存在');
        }

        const parsedDsl = WorkflowDslSchema.safeParse(targetVersion.dslSnapshot);
        if (!parsedDsl.success) {
            throw new BadRequestException({
                message: '目标版本 DSL 快照解析失败',
                issues: parsedDsl.error.issues,
            });
        }

        const publishValidation = this.dslValidator.validate(parsedDsl.data, 'PUBLISH');
        if (!publishValidation.valid) {
            throw new BadRequestException({
                message: '发布校验失败',
                issues: publishValidation.issues,
            });
        }
        this.ensureRiskGateBindingsValid(parsedDsl.data);
        await this.ensureRulePackBindingsValid(ownerUserId, parsedDsl.data);

        return this.prisma.$transaction(async (tx) => {
            await tx.workflowVersion.updateMany({
                where: {
                    workflowDefinitionId: id,
                    status: 'PUBLISHED',
                    id: { not: targetVersion.id },
                },
                data: { status: 'ARCHIVED' },
            });

            const published = await tx.workflowVersion.update({
                where: { id: targetVersion.id },
                data: {
                    status: 'PUBLISHED',
                    publishedAt: new Date(),
                },
            });

            await tx.workflowDefinition.update({
                where: { id },
                data: {
                    status: 'ACTIVE',
                    isActive: true,
                    latestVersionCode: published.versionCode,
                },
            });

            return published;
        });
    }

    validateDsl(
        dslSnapshot: WorkflowDsl,
        stage: WorkflowValidationStage = 'SAVE',
    ): WorkflowValidationResult {
        return this.dslValidator.validate(dslSnapshot, stage);
    }

    private buildAccessibleWhere(
        ownerUserId: string,
        query: WorkflowDefinitionQueryDto,
        includePublic = true,
    ): Prisma.WorkflowDefinitionWhereInput {
        const where: Prisma.WorkflowDefinitionWhereInput = {
            OR: includePublic
                ? [{ ownerUserId }, { templateSource: 'PUBLIC' }]
                : [{ ownerUserId }],
        };

        if (query.mode) {
            where.mode = query.mode;
        }
        if (query.usageMethod) {
            where.usageMethod = query.usageMethod;
        }
        if (query.status) {
            where.status = query.status;
        }

        const keyword = query.keyword?.trim();
        if (keyword) {
            where.AND = [
                {
                    OR: [
                        { name: { contains: keyword, mode: 'insensitive' } },
                        { workflowId: { contains: keyword, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        return where;
    }

    private async ensureReadableDefinition(ownerUserId: string, id: string) {
        const definition = await this.prisma.workflowDefinition.findFirst({
            where: {
                id,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
        });

        if (!definition) {
            throw new NotFoundException('流程不存在或无权限访问');
        }

        return definition;
    }

    private async ensureEditableDefinition(ownerUserId: string, id: string) {
        const definition = await this.prisma.workflowDefinition.findFirst({
            where: {
                id,
                ownerUserId,
            },
        });

        if (!definition) {
            throw new NotFoundException('流程不存在或无权限编辑');
        }

        return definition;
    }

    private ensureDslValid(dslSnapshot: WorkflowDsl): void {
        const validation = this.dslValidator.validate(dslSnapshot, 'SAVE');
        if (!validation.valid) {
            throw new BadRequestException({
                message: 'DSL 校验失败',
                issues: validation.issues,
            });
        }
    }

    private ensureRiskGateBindingsValid(dslSnapshot: WorkflowDsl): void {
        const invalidNodeIds = dslSnapshot.nodes
            .filter((node) => node.type === 'risk-gate')
            .filter((node) => {
                const config = node.config as Record<string, unknown>;
                return typeof config.riskProfileCode !== 'string' || !config.riskProfileCode.trim();
            })
            .map((node) => node.id);

        if (invalidNodeIds.length > 0) {
            throw new BadRequestException(
                `risk-gate 节点缺少 riskProfileCode 配置: ${invalidNodeIds.join(', ')}`,
            );
        }
    }

    private async ensureRulePackBindingsValid(ownerUserId: string, dslSnapshot: WorkflowDsl): Promise<void> {
        const ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);
        const rulePackCodes = Array.from(
            new Set(
                dslSnapshot.nodes
                    .filter((node) => ruleNodeTypes.has(node.type))
                    .map((node) => {
                        const config = node.config as Record<string, unknown>;
                        return typeof config.rulePackCode === 'string' ? config.rulePackCode.trim() : '';
                    }),
            ),
        );
        if (rulePackCodes.length === 0) {
            return;
        }

        const invalidCodes = rulePackCodes.filter((code) => !code);
        if (invalidCodes.length > 0) {
            throw new BadRequestException('规则节点缺少 rulePackCode 配置');
        }

        const packs = await this.prisma.decisionRulePack.findMany({
            where: {
                rulePackCode: { in: rulePackCodes },
                isActive: true,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
            select: { rulePackCode: true },
        });
        const existingCodes = new Set(packs.map((pack) => pack.rulePackCode));
        const missingCodes = rulePackCodes.filter((code) => !existingCodes.has(code));

        if (missingCodes.length > 0) {
            throw new BadRequestException(
                `规则包不存在、已停用或无权限访问: ${missingCodes.join(', ')}`,
            );
        }
    }

    private normalizeDslForDefinition(
        sourceDsl: WorkflowDsl | undefined,
        workflowId: string,
        name: string,
        mode: 'LINEAR' | 'DAG' | 'DEBATE',
        usageMethod: 'HEADLESS' | 'COPILOT' | 'ON_DEMAND',
        ownerUserId: string,
        templateSource: 'PUBLIC' | 'PRIVATE',
    ): WorkflowDsl {
        if (!sourceDsl) {
            return {
                workflowId,
                name,
                mode,
                usageMethod,
                version: '1.0.0',
                status: 'DRAFT',
                ownerUserId,
                templateSource,
                nodes: [
                    {
                        id: 'n_trigger',
                        type: 'manual-trigger',
                        name: '手工触发',
                        enabled: true,
                        config: {},
                    },
                    {
                        id: 'n_risk_gate',
                        type: 'risk-gate',
                        name: '风险闸门',
                        enabled: true,
                        config: {
                            riskProfileCode: 'CORN_RISK_BASE',
                            degradeAction: 'HOLD',
                        },
                    },
                    {
                        id: 'n_notify',
                        type: 'notify',
                        name: '结果输出',
                        enabled: true,
                        config: { channels: ['DASHBOARD'] },
                    },
                ],
                edges: [
                    {
                        id: 'e_trigger_risk_gate',
                        from: 'n_trigger',
                        to: 'n_risk_gate',
                        edgeType: 'control-edge',
                    },
                    {
                        id: 'e_risk_gate_notify',
                        from: 'n_risk_gate',
                        to: 'n_notify',
                        edgeType: 'control-edge',
                    },
                ],
            };
        }

        return {
            ...sourceDsl,
            workflowId,
            name,
            mode,
            usageMethod,
            ownerUserId,
            templateSource,
        };
    }

    private nextVersionCode(latestVersionCode: string | null | undefined): string {
        if (!latestVersionCode || !/^\d+\.\d+\.\d+$/.test(latestVersionCode)) {
            return '1.0.0';
        }

        const [major, minor, patch] = latestVersionCode.split('.').map(Number);
        return `${major}.${minor}.${patch + 1}`;
    }

    private toJsonValue(value: WorkflowDsl): Prisma.InputJsonValue {
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    }
}
