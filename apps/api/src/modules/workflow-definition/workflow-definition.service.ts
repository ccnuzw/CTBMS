import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canonicalizeWorkflowDsl,
  CreateWorkflowDefinitionDto,
  CreateWorkflowVersionDto,
  getWorkflowNodeContract,
  normalizeWorkflowNodeType,
  PublishWorkflowVersionDto,
  UpdateWorkflowDefinitionDto,
  ValidateWorkflowNodePreviewDto,
  WorkflowDefinitionQueryDto,
  WorkflowPublishAuditQueryDto,
  WorkflowDsl,
  WorkflowDslSchema,
  WorkflowValidationIssue,
  WorkflowNodePreviewField,
  WorkflowNodePreviewInputField,
  WorkflowNodePreviewResult,
  WorkflowValidationStage,
  WorkflowValidationResult,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { WorkflowDslValidator } from './workflow-dsl-validator';
import {
  VariableResolutionContext,
  VariableResolver,
} from '../workflow-execution/engine/variable-resolver';

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dslValidator: WorkflowDslValidator,
    private readonly variableResolver: VariableResolver,
    private readonly validatorService: import('./workflow-definition-validator.service').WorkflowDefinitionValidatorService,
  ) {}

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
    this.validatorService.ensureDslValid(normalizedDsl);
    this.validatorService.ensureRiskGateBindingsValid(normalizedDsl);
    await this.validatorService.ensureRulePackBindingsValid(ownerUserId, normalizedDsl);
    await this.validatorService.ensureAgentBindingsValid(ownerUserId, normalizedDsl);
    await this.validatorService.ensureParameterSetBindingsValid(ownerUserId, normalizedDsl);
    await this.validatorService.ensureDataConnectorBindingsValid(normalizedDsl);

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
    this.validatorService.ensureDslValid(normalizedDsl);
    this.validatorService.ensureRiskGateBindingsValid(normalizedDsl);
    await this.validatorService.ensureRulePackBindingsValid(definition.ownerUserId, normalizedDsl);
    await this.validatorService.ensureAgentBindingsValid(definition.ownerUserId, normalizedDsl);
    await this.validatorService.ensureParameterSetBindingsValid(definition.ownerUserId, normalizedDsl);
    await this.validatorService.ensureDataConnectorBindingsValid(normalizedDsl);

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
        data: {
          latestVersionCode: nextVersionCode,
          mode: normalizedDsl.mode,
          usageMethod: normalizedDsl.usageMethod,
        },
      });

      return version;
    });

    return createdVersion;
  }

  async publishVersion(ownerUserId: string, id: string, dto: PublishWorkflowVersionDto) {
    const definition = await this.ensureEditableDefinition(ownerUserId, id);

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
    this.validatorService.ensureRiskGateBindingsValid(parsedDsl.data);
    const governanceIssues = await this.validatorService.validateGovernanceForPublish(
      ownerUserId,
      parsedDsl.data,
      definition.id,
    );
    if (governanceIssues.length > 0) {
      throw new BadRequestException({
        message: '发布校验失败',
        issues: governanceIssues,
      });
    }
    await this.validatorService.ensureDataConnectorBindingsValid(parsedDsl.data);

    return this.prisma.$transaction(async (tx) => {
      const archivedPublishedVersions = await tx.workflowVersion.findMany({
        where: {
          workflowDefinitionId: id,
          status: 'PUBLISHED',
          id: { not: targetVersion.id },
        },
        select: {
          id: true,
          versionCode: true,
        },
      });
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

      const nextDraftVersionCode = this.nextVersionCode(
        definition.latestVersionCode ?? published.versionCode,
      );
      const nextDraftDsl = this.bumpDslVersion(parsedDsl.data, nextDraftVersionCode);
      await tx.workflowVersion.create({
        data: {
          workflowDefinitionId: id,
          versionCode: nextDraftVersionCode,
          status: 'DRAFT',
          dslSnapshot: this.toJsonValue(nextDraftDsl),
          changelog: `发布 ${published.versionCode} 后自动创建草稿`,
          createdByUserId: ownerUserId,
        },
      });

      await tx.workflowPublishAudit.create({
        data: {
          workflowDefinitionId: id,
          workflowVersionId: published.id,
          operation: 'PUBLISH',
          publishedByUserId: ownerUserId,
          comment: '发布流程版本',
          snapshot: this.toJsonValue({
            publishedVersionCode: published.versionCode,
            archivedPublishedVersions,
            autoCreatedDraftVersionCode: nextDraftVersionCode,
          }),
          publishedAt: published.publishedAt ?? new Date(),
        },
      });

      await tx.workflowDefinition.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          isActive: true,
          latestVersionCode: nextDraftVersionCode,
        },
      });

      return published;
    });
  }

  async listPublishAudits(ownerUserId: string, id: string, query: WorkflowPublishAuditQueryDto) {
    await this.ensureReadableDefinition(ownerUserId, id);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildPublishAuditWhere(id, query);

    const [data, total] = await Promise.all([
      this.prisma.workflowPublishAudit.findMany({
        where,
        include: {
          publishedByUser: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workflowPublishAudit.count({
        where,
      }),
    ]);

    return {
      data: data.map(({ publishedByUser, ...item }) => ({
        ...item,
        publishedByUserName: publishedByUser?.name,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private buildAccessibleWhere(
    ownerUserId: string,
    query: WorkflowDefinitionQueryDto,
    includePublic = true,
  ): Prisma.WorkflowDefinitionWhereInput {
    const where: Prisma.WorkflowDefinitionWhereInput = {
      OR: includePublic ? [{ ownerUserId }, { templateSource: 'PUBLIC' }] : [{ ownerUserId }],
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

  private buildPublishAuditWhere(
    workflowDefinitionId: string,
    query: WorkflowPublishAuditQueryDto,
  ): Prisma.WorkflowPublishAuditWhereInput {
    const where: Prisma.WorkflowPublishAuditWhereInput = {
      workflowDefinitionId,
    };

    if (query.workflowVersionId) {
      where.workflowVersionId = query.workflowVersionId;
    }

    const publishedByUserId = query.publishedByUserId?.trim();
    if (publishedByUserId) {
      where.publishedByUserId = {
        contains: publishedByUserId,
        mode: 'insensitive',
      };
    }

    if (query.publishedAtFrom || query.publishedAtTo) {
      where.publishedAt = {
        ...(query.publishedAtFrom ? { gte: query.publishedAtFrom } : {}),
        ...(query.publishedAtTo ? { lte: query.publishedAtTo } : {}),
      };
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

  private normalizeDslForDefinition(
    sourceDsl: WorkflowDsl | undefined,
    workflowId: string,
    name: string,
    mode: 'LINEAR' | 'DAG' | 'DEBATE',
    usageMethod: 'HEADLESS' | 'COPILOT' | 'ON_DEMAND',
    ownerUserId: string,
    templateSource: 'PUBLIC' | 'PRIVATE' | 'COPIED',
  ): WorkflowDsl {
    if (!sourceDsl) {
      return canonicalizeWorkflowDsl({
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
        runPolicy: {
          nodeDefaults: {
            timeoutMs: 30000,
            retryCount: 1,
            retryBackoffMs: 2000,
            onError: 'FAIL_FAST',
          },
        },
      });
    }

    return canonicalizeWorkflowDsl({
      ...sourceDsl,
      workflowId,
      name,
      mode: sourceDsl.mode,
      usageMethod: sourceDsl.usageMethod ?? usageMethod,
      ownerUserId,
      templateSource,
    });
  }

  private nextVersionCode(latestVersionCode: string | null | undefined): string {
    if (!latestVersionCode || !/^\d+\.\d+\.\d+$/.test(latestVersionCode)) {
      return '1.0.0';
    }

    const [major, minor, patch] = latestVersionCode.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private bumpDslVersion(dslSnapshot: WorkflowDsl, versionCode: string): WorkflowDsl {
    return {
      ...dslSnapshot,
      version: versionCode,
      status: 'DRAFT',
    };
  }
}
