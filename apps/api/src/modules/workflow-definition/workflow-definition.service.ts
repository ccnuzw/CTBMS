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
  WorkflowDslAutoFixItemDto,
  WorkflowDefinitionQueryDto,
  WorkflowEdge,
  WorkflowPublishAuditQueryDto,
  WorkflowDsl,
  WorkflowDslSchema,
  WorkflowValidationStage,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { WorkflowDslValidator } from './workflow-dsl-validator';
import { WorkflowDefinitionValidatorService } from './workflow-definition-validator.service';
import { VariableResolver } from '../workflow-execution/engine/variable-resolver';

type WorkflowPreflightAutoFixLevel = 'SAFE' | 'AGGRESSIVE';

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dslValidator: WorkflowDslValidator,
    private readonly variableResolver: VariableResolver,
    private readonly validatorService: WorkflowDefinitionValidatorService,
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

  async getPublishedWorkflows(query: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    keyword?: string;
    orderBy?: 'stars' | 'createdAt';
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.WorkflowDefinitionWhereInput = {
      isPublished: true,
      isActive: true, // Only show active flows in market
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const orderByList: unknown =
      query.orderBy === 'createdAt'
        ? { createdAt: 'desc' }
        : [{ stars: 'desc' }, { createdAt: 'desc' }]; // Default to 'stars'

    const [data, total] = await Promise.all([
      this.prisma.workflowDefinition.findMany({
        where,
        orderBy: orderByList as
          | Prisma.WorkflowDefinitionOrderByWithRelationInput
          | Prisma.WorkflowDefinitionOrderByWithRelationInput[],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          workflowId: true,
          name: true,
          description: true,
          categoryId: true,
          coverImage: true,
          stars: true,
          createdAt: true,
          updatedAt: true,
          ownerUserId: true,
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
    await this.validatorService.ensureParameterSetBindingsValid(
      definition.ownerUserId,
      normalizedDsl,
    );
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

      const publisherExists = await tx.user.findUnique({
        where: { id: ownerUserId },
        select: { id: true },
      });

      if (publisherExists) {
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
      }

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

  preflightDsl(
    dslSnapshot: WorkflowDsl,
    stage: WorkflowValidationStage = 'SAVE',
    autoFixLevel: WorkflowPreflightAutoFixLevel = 'SAFE',
    enabledAutoFixCodes?: string[],
  ) {
    const { dsl, autoFixes } = this.applySmartDefaultsToDsl(
      dslSnapshot,
      autoFixLevel,
      enabledAutoFixCodes,
    );
    const validation = this.dslValidator.validate(dsl, stage);

    return {
      normalizedDsl: dsl,
      validation,
      autoFixLevel,
      autoFixes,
      summary: {
        nodeCount: dsl.nodes.length,
        edgeCount: dsl.edges.length,
        agentBindingCount: (dsl.agentBindings ?? []).length,
        paramSetBindingCount: (dsl.paramSetBindings ?? []).length,
        dataConnectorBindingCount: (dsl.dataConnectorBindings ?? []).length,
      },
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
    const baseDsl = sourceDsl
      ? {
          ...sourceDsl,
          workflowId,
          name,
          mode: sourceDsl.mode,
          usageMethod: sourceDsl.usageMethod ?? usageMethod,
          ownerUserId,
          templateSource,
        }
      : {
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
              timeoutSeconds: 30,
              retryCount: 1,
              retryIntervalSeconds: 2,
              onError: 'FAIL_FAST',
            },
          },
        };

    const { dsl } = this.applySmartDefaultsToDsl(baseDsl as WorkflowDsl, 'AGGRESSIVE');
    return dsl;
  }

  private applySmartDefaultsToDsl(
    sourceDsl: WorkflowDsl,
    autoFixLevel: WorkflowPreflightAutoFixLevel = 'SAFE',
    enabledAutoFixCodes?: string[],
  ): {
    dsl: WorkflowDsl;
    autoFixes: WorkflowDslAutoFixItemDto[];
  } {
    const autoFixes: WorkflowDslAutoFixItemDto[] = [];
    const enabledAutoFixCodeSet = this.toEnabledAutoFixCodeSet(enabledAutoFixCodes);
    const canApplyAutoFix = (code: string) => this.isAutoFixEnabled(code, enabledAutoFixCodeSet);
    const normalizedDsl = canonicalizeWorkflowDsl(sourceDsl);
    const previousNodeDefaults = this.readRecord(normalizedDsl.runPolicy?.nodeDefaults);
    const previousOnError = previousNodeDefaults.onError;
    const completedOnError: 'FAIL_FAST' | 'CONTINUE' | 'ROUTE_TO_ERROR' =
      previousOnError === 'CONTINUE' ||
      previousOnError === 'ROUTE_TO_ERROR' ||
      previousOnError === 'FAIL_FAST'
        ? previousOnError
        : 'FAIL_FAST';
    const completedNodeDefaults = {
      timeoutSeconds:
        typeof previousNodeDefaults.timeoutSeconds === 'number'
          ? previousNodeDefaults.timeoutSeconds
          : 30,
      retryCount:
        typeof previousNodeDefaults.retryCount === 'number' ? previousNodeDefaults.retryCount : 1,
      retryIntervalSeconds:
        typeof previousNodeDefaults.retryIntervalSeconds === 'number'
          ? previousNodeDefaults.retryIntervalSeconds
          : 2,
      onError: completedOnError,
    };
    const rawOnError: 'FAIL_FAST' | 'CONTINUE' | 'ROUTE_TO_ERROR' | undefined =
      previousOnError === 'CONTINUE' ||
      previousOnError === 'ROUTE_TO_ERROR' ||
      previousOnError === 'FAIL_FAST'
        ? previousOnError
        : undefined;
    const rawNodeDefaults: {
      timeoutSeconds?: number;
      retryCount?: number;
      retryIntervalSeconds?: number;
      onError?: 'FAIL_FAST' | 'CONTINUE' | 'ROUTE_TO_ERROR';
    } = {
      timeoutSeconds:
        typeof previousNodeDefaults.timeoutSeconds === 'number'
          ? previousNodeDefaults.timeoutSeconds
          : undefined,
      retryCount:
        typeof previousNodeDefaults.retryCount === 'number'
          ? previousNodeDefaults.retryCount
          : undefined,
      retryIntervalSeconds:
        typeof previousNodeDefaults.retryIntervalSeconds === 'number'
          ? previousNodeDefaults.retryIntervalSeconds
          : undefined,
      onError: rawOnError,
    };
    const shouldAutoFixNodeDefaults =
      JSON.stringify(previousNodeDefaults) !== JSON.stringify(completedNodeDefaults);
    const nodeDefaults =
      shouldAutoFixNodeDefaults && !canApplyAutoFix('AUTO_RUN_POLICY_DEFAULTS')
        ? rawNodeDefaults
        : completedNodeDefaults;

    if (shouldAutoFixNodeDefaults && canApplyAutoFix('AUTO_RUN_POLICY_DEFAULTS')) {
      autoFixes.push({
        code: 'AUTO_RUN_POLICY_DEFAULTS',
        message: '自动补全全局节点运行策略默认值',
        fieldPath: 'runPolicy.nodeDefaults',
        before: previousNodeDefaults,
        after: completedNodeDefaults,
      });
    }

    const agentBindingSet = new Set(this.readStringArray(normalizedDsl.agentBindings));
    const paramSetBindingSet = new Set(this.readStringArray(normalizedDsl.paramSetBindings));
    const connectorBindingSet = new Set(this.readStringArray(normalizedDsl.dataConnectorBindings));
    const previousAgentBindings = [...agentBindingSet];
    const previousParamSetBindings = [...paramSetBindingSet];
    const previousConnectorBindings = [...connectorBindingSet];
    let nodes = normalizedDsl.nodes.map((node) => {
      const nodeType = normalizeWorkflowNodeType(node.type);
      const contract = getWorkflowNodeContract(nodeType);
      const previousConfig = this.readRecord(node.config);
      const config: Record<string, unknown> = contract
        ? { ...contract.defaultConfig, ...previousConfig }
        : { ...previousConfig };
      let nodeChanged = false;

      if (JSON.stringify(previousConfig) !== JSON.stringify(config)) {
        nodeChanged = true;
      }

      if (nodeType === 'risk-gate') {
        const profileCode =
          typeof config.riskProfileCode === 'string' ? config.riskProfileCode.trim() : '';
        if (!profileCode && canApplyAutoFix('AUTO_RISK_PROFILE')) {
          config.riskProfileCode = 'CORN_RISK_BASE';
          nodeChanged = true;
          autoFixes.push({
            code: 'AUTO_RISK_PROFILE',
            message: '风险闸门缺少 riskProfileCode，已自动补全为 CORN_RISK_BASE',
            nodeId: node.id,
            fieldPath: `nodes.${node.id}.config.riskProfileCode`,
            before: previousConfig.riskProfileCode,
            after: 'CORN_RISK_BASE',
          });
        }

        const degradeAction =
          typeof config.degradeAction === 'string' ? config.degradeAction.trim() : '';
        if (!degradeAction && canApplyAutoFix('AUTO_RISK_PROFILE')) {
          config.degradeAction = 'HOLD';
          nodeChanged = true;
        }
      }

      if (nodeType === 'notify') {
        const channels = Array.isArray(config.channels)
          ? config.channels.filter(
              (item): item is string => typeof item === 'string' && item.trim().length > 0,
            )
          : [];
        if (channels.length === 0) {
          const singleChannel = typeof config.channel === 'string' ? config.channel.trim() : '';
          config.channels = singleChannel ? [singleChannel] : ['DASHBOARD'];
          nodeChanged = true;
        } else if (JSON.stringify(channels) !== JSON.stringify(config.channels)) {
          config.channels = channels;
          nodeChanged = true;
        }
      }

      if (nodeType === 'rule-pack-eval') {
        const rulePackCode =
          typeof config.rulePackCode === 'string' ? config.rulePackCode.trim() : '';
        if (!rulePackCode && canApplyAutoFix('AUTO_RULE_PACK_CODE')) {
          const rulePackCodes = this.readStringArray(config.rulePackCodes);
          if (rulePackCodes.length > 0) {
            config.rulePackCode = rulePackCodes[0];
            nodeChanged = true;
            autoFixes.push({
              code: 'AUTO_RULE_PACK_CODE',
              message: '规则节点缺少 rulePackCode，已根据 rulePackCodes 自动补全',
              nodeId: node.id,
              fieldPath: `nodes.${node.id}.config.rulePackCode`,
              before: previousConfig.rulePackCode,
              after: rulePackCodes[0],
            });
          }
        }
      }

      const agentProfileCode =
        typeof config.agentProfileCode === 'string' ? config.agentProfileCode.trim() : '';
      const agentCode = typeof config.agentCode === 'string' ? config.agentCode.trim() : '';
      if (agentProfileCode) {
        agentBindingSet.add(agentProfileCode);
      }
      if (agentCode) {
        agentBindingSet.add(agentCode);
      }
      this.readStringArray(config.agentProfileCodes).forEach((code) => agentBindingSet.add(code));
      this.readStringArray(config.agentCodes).forEach((code) => agentBindingSet.add(code));

      const paramSetCode =
        typeof config.paramSetCode === 'string' ? config.paramSetCode.trim() : '';
      const parameterSetCode =
        typeof config.parameterSetCode === 'string' ? config.parameterSetCode.trim() : '';
      const setCode = typeof config.setCode === 'string' ? config.setCode.trim() : '';
      if (paramSetCode) {
        paramSetBindingSet.add(paramSetCode);
      }
      if (parameterSetCode) {
        paramSetBindingSet.add(parameterSetCode);
      }
      if (setCode) {
        paramSetBindingSet.add(setCode);
      }
      this.readStringArray(config.paramSetCodes).forEach((code) => paramSetBindingSet.add(code));
      this.readStringArray(config.parameterSetCodes).forEach((code) =>
        paramSetBindingSet.add(code),
      );
      this.readStringArray(config.setCodes).forEach((code) => paramSetBindingSet.add(code));

      const dataSourceCode =
        typeof config.dataSourceCode === 'string' ? config.dataSourceCode.trim() : '';
      const connectorCode =
        typeof config.connectorCode === 'string' ? config.connectorCode.trim() : '';
      if (dataSourceCode) {
        connectorBindingSet.add(dataSourceCode);
      }
      if (connectorCode) {
        connectorBindingSet.add(connectorCode);
      }
      this.readStringArray(config.dataSourceCodes).forEach((code) => connectorBindingSet.add(code));
      this.readStringArray(config.connectorCodes).forEach((code) => connectorBindingSet.add(code));

      if (!nodeChanged && nodeType === node.type) {
        return node;
      }

      return {
        ...node,
        type: nodeType,
        config,
      };
    });

    const edges = normalizedDsl.edges.map((edge) => ({ ...edge }));
    if (autoFixLevel === 'AGGRESSIVE') {
      const usedNodeIds = new Set(nodes.map((node) => node.id));
      const usedEdgeIds = new Set(edges.map((edge) => edge.id));
      const triggerNodeTypes = new Set([
        'manual-trigger',
        'cron-trigger',
        'event-trigger',
        'api-trigger',
      ]);
      const outputNodeTypes = new Set(['notify', 'report-generate', 'dashboard-publish']);
      const buildId = (prefix: string, idSet: Set<string>) => {
        let index = 1;
        let nextId = `${prefix}_${index}`;
        while (idSet.has(nextId)) {
          index += 1;
          nextId = `${prefix}_${index}`;
        }
        idSet.add(nextId);
        return nextId;
      };
      const addEdgeIfMissing = (
        from: string | undefined,
        to: string | undefined,
        edgeType: WorkflowEdge['edgeType'],
        code?: string,
        message?: string,
      ) => {
        if (!from || !to || from === to) {
          return;
        }
        if (code && !canApplyAutoFix(code)) {
          return;
        }
        const exists = edges.some((edge) => edge.from === from && edge.to === to);
        if (exists) {
          return;
        }
        edges.push({
          id: buildId('e_auto', usedEdgeIds),
          from,
          to,
          edgeType,
        });
        if (code && message) {
          autoFixes.push({
            code,
            message,
          });
        }
      };

      let triggerNode = nodes.find((node) => triggerNodeTypes.has(node.type));
      if (!triggerNode && canApplyAutoFix('AUTO_TRIGGER_NODE')) {
        triggerNode = {
          id: buildId('n_trigger', usedNodeIds),
          type: 'manual-trigger',
          name: '手工触发',
          enabled: true,
          config: {},
        };
        nodes = [...nodes, triggerNode];
        autoFixes.push({
          code: 'AUTO_TRIGGER_NODE',
          message: '流程缺少触发节点，已自动补全 manual-trigger',
          nodeId: triggerNode.id,
          fieldPath: `nodes.${triggerNode.id}`,
        });
      }

      let riskGateNode = nodes.find((node) => node.type === 'risk-gate');
      if (!riskGateNode && canApplyAutoFix('AUTO_RISK_GATE_NODE')) {
        riskGateNode = {
          id: buildId('n_risk_gate', usedNodeIds),
          type: 'risk-gate',
          name: '风险闸门',
          enabled: true,
          config: {
            riskProfileCode: 'CORN_RISK_BASE',
            degradeAction: 'HOLD',
          },
        };
        nodes = [...nodes, riskGateNode];
        autoFixes.push({
          code: 'AUTO_RISK_GATE_NODE',
          message: '流程缺少 risk-gate 节点，已自动补全',
          nodeId: riskGateNode.id,
          fieldPath: `nodes.${riskGateNode.id}`,
        });
        addEdgeIfMissing(
          triggerNode?.id,
          riskGateNode.id,
          'control-edge',
          'AUTO_TRIGGER_TO_RISK',
          '已自动补全触发节点到风险闸门的连线',
        );
      }

      let outputNode = nodes.find((node) => outputNodeTypes.has(node.type));
      if (!outputNode && canApplyAutoFix('AUTO_OUTPUT_NODE')) {
        outputNode = {
          id: buildId('n_notify', usedNodeIds),
          type: 'notify',
          name: '结果输出',
          enabled: true,
          config: { channels: ['DASHBOARD'] },
        };
        nodes = [...nodes, outputNode];
        autoFixes.push({
          code: 'AUTO_OUTPUT_NODE',
          message: '流程缺少输出节点，已自动补全 notify',
          nodeId: outputNode.id,
          fieldPath: `nodes.${outputNode.id}`,
        });
        addEdgeIfMissing(
          riskGateNode?.id ?? triggerNode?.id,
          outputNode.id,
          'control-edge',
          'AUTO_TO_OUTPUT_EDGE',
          '已自动补全主链路到输出节点的连线',
        );
      }

      if (normalizedDsl.mode === 'DEBATE') {
        let contextNode = nodes.find((node) => node.type === 'context-builder');
        let debateNode = nodes.find((node) => node.type === 'debate-round');
        let judgeNode = nodes.find((node) => node.type === 'judge-agent');

        if (!contextNode && canApplyAutoFix('AUTO_DEBATE_CONTEXT_NODE')) {
          contextNode = {
            id: buildId('n_context_builder', usedNodeIds),
            type: 'context-builder',
            name: '上下文构建',
            enabled: true,
            config: {},
          };
          nodes = [...nodes, contextNode];
          autoFixes.push({
            code: 'AUTO_DEBATE_CONTEXT_NODE',
            message: 'DEBATE 模式缺少 context-builder，已自动补全',
            nodeId: contextNode.id,
            fieldPath: `nodes.${contextNode.id}`,
          });
        }
        if (!debateNode && canApplyAutoFix('AUTO_DEBATE_ROUND_NODE')) {
          debateNode = {
            id: buildId('n_debate_round', usedNodeIds),
            type: 'debate-round',
            name: '辩论回合',
            enabled: true,
            config: {
              maxRounds: 3,
              judgePolicy: 'WEIGHTED',
            },
          };
          nodes = [...nodes, debateNode];
          autoFixes.push({
            code: 'AUTO_DEBATE_ROUND_NODE',
            message: 'DEBATE 模式缺少 debate-round，已自动补全',
            nodeId: debateNode.id,
            fieldPath: `nodes.${debateNode.id}`,
          });
        }
        if (!judgeNode && canApplyAutoFix('AUTO_DEBATE_JUDGE_NODE')) {
          judgeNode = {
            id: buildId('n_judge_agent', usedNodeIds),
            type: 'judge-agent',
            name: '裁判节点',
            enabled: true,
            config: {},
          };
          nodes = [...nodes, judgeNode];
          autoFixes.push({
            code: 'AUTO_DEBATE_JUDGE_NODE',
            message: 'DEBATE 模式缺少 judge-agent，已自动补全',
            nodeId: judgeNode.id,
            fieldPath: `nodes.${judgeNode.id}`,
          });
        }

        addEdgeIfMissing(
          triggerNode?.id,
          contextNode?.id,
          'control-edge',
          'AUTO_DEBATE_CHAIN_EDGES',
          'DEBATE 模式主链路连线已自动补全',
        );
        addEdgeIfMissing(
          contextNode?.id,
          debateNode?.id,
          'data-edge',
          'AUTO_DEBATE_CHAIN_EDGES',
          'DEBATE 模式主链路连线已自动补全',
        );
        addEdgeIfMissing(
          debateNode?.id,
          judgeNode?.id,
          'data-edge',
          'AUTO_DEBATE_CHAIN_EDGES',
          'DEBATE 模式主链路连线已自动补全',
        );
      }

      if (normalizedDsl.mode === 'DAG') {
        let joinNode = nodes.find((node) => node.type === 'join');
        if (!joinNode && canApplyAutoFix('AUTO_DAG_JOIN_NODE')) {
          joinNode = {
            id: buildId('n_join', usedNodeIds),
            type: 'join',
            name: '自动汇聚',
            enabled: true,
            config: { joinPolicy: 'ALL_REQUIRED' },
          };
          nodes = [...nodes, joinNode];
          autoFixes.push({
            code: 'AUTO_DAG_JOIN_NODE',
            message: 'DAG 模式缺少 join 节点，已自动补全',
            nodeId: joinNode.id,
            fieldPath: `nodes.${joinNode.id}`,
          });
        }
        if (joinNode) {
          const upstreamNode =
            nodes.find((node) => triggerNodeTypes.has(node.type) && node.id !== joinNode.id) ||
            nodes.find(
              (node) =>
                !outputNodeTypes.has(node.type) &&
                node.type !== 'join' &&
                node.type !== 'group' &&
                node.id !== joinNode.id,
            );
          const downstreamNode =
            nodes.find((node) => node.type === 'risk-gate' && node.id !== joinNode.id) ||
            nodes.find((node) => outputNodeTypes.has(node.type) && node.id !== joinNode.id);

          addEdgeIfMissing(
            upstreamNode?.id,
            joinNode.id,
            'data-edge',
            'AUTO_DAG_JOIN_EDGES',
            'DAG 模式 join 连线已自动补全',
          );
          addEdgeIfMissing(
            joinNode.id,
            downstreamNode?.id,
            'control-edge',
            'AUTO_DAG_JOIN_EDGES',
            'DAG 模式 join 连线已自动补全',
          );
        }
      }
    }

    const inferredAgentBindings = [...agentBindingSet];
    const inferredParamSetBindings = [...paramSetBindingSet];
    const inferredConnectorBindings = [...connectorBindingSet];
    const shouldFixAgentBindings =
      JSON.stringify(previousAgentBindings) !== JSON.stringify(inferredAgentBindings);
    const shouldFixParamSetBindings =
      JSON.stringify(previousParamSetBindings) !== JSON.stringify(inferredParamSetBindings);
    const shouldFixConnectorBindings =
      JSON.stringify(previousConnectorBindings) !== JSON.stringify(inferredConnectorBindings);
    const nextAgentBindings =
      shouldFixAgentBindings && !canApplyAutoFix('AUTO_AGENT_BINDINGS')
        ? previousAgentBindings
        : inferredAgentBindings;
    const nextParamSetBindings =
      shouldFixParamSetBindings && !canApplyAutoFix('AUTO_PARAM_SET_BINDINGS')
        ? previousParamSetBindings
        : inferredParamSetBindings;
    const nextConnectorBindings =
      shouldFixConnectorBindings && !canApplyAutoFix('AUTO_CONNECTOR_BINDINGS')
        ? previousConnectorBindings
        : inferredConnectorBindings;
    if (shouldFixAgentBindings && canApplyAutoFix('AUTO_AGENT_BINDINGS')) {
      autoFixes.push({
        code: 'AUTO_AGENT_BINDINGS',
        message: '已根据节点配置自动补全 agentBindings',
        fieldPath: 'agentBindings',
        before: previousAgentBindings,
        after: inferredAgentBindings,
      });
    }
    if (shouldFixParamSetBindings && canApplyAutoFix('AUTO_PARAM_SET_BINDINGS')) {
      autoFixes.push({
        code: 'AUTO_PARAM_SET_BINDINGS',
        message: '已根据节点配置自动补全 paramSetBindings',
        fieldPath: 'paramSetBindings',
        before: previousParamSetBindings,
        after: inferredParamSetBindings,
      });
    }
    if (shouldFixConnectorBindings && canApplyAutoFix('AUTO_CONNECTOR_BINDINGS')) {
      autoFixes.push({
        code: 'AUTO_CONNECTOR_BINDINGS',
        message: '已根据节点配置自动补全 dataConnectorBindings',
        fieldPath: 'dataConnectorBindings',
        before: previousConnectorBindings,
        after: inferredConnectorBindings,
      });
    }

    return {
      dsl: {
        ...normalizedDsl,
        nodes,
        edges,
        runPolicy: {
          ...(normalizedDsl.runPolicy ?? {}),
          nodeDefaults,
        },
        agentBindings: nextAgentBindings.length > 0 ? nextAgentBindings : undefined,
        paramSetBindings: nextParamSetBindings.length > 0 ? nextParamSetBindings : undefined,
        dataConnectorBindings: nextConnectorBindings.length > 0 ? nextConnectorBindings : undefined,
      },
      autoFixes,
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const deduped = new Set<string>();
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized);
    }
    return [...deduped];
  }

  private toEnabledAutoFixCodeSet(enabledAutoFixCodes?: string[]): Set<string> | null {
    if (!enabledAutoFixCodes || enabledAutoFixCodes.length === 0) {
      return null;
    }
    return new Set(
      enabledAutoFixCodes
        .filter((code): code is string => typeof code === 'string')
        .map((code) => code.trim())
        .filter(Boolean),
    );
  }

  private isAutoFixEnabled(code: string, enabledAutoFixCodeSet: Set<string> | null): boolean {
    if (!enabledAutoFixCodeSet) {
      return true;
    }
    return enabledAutoFixCodeSet.has(code);
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
