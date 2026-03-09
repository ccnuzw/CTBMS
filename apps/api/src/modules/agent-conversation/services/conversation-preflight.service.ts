import { Injectable } from '@nestjs/common';
import type { WorkflowNode } from '@packages/types';
import { WorkflowDslSchema, canonicalizeWorkflowDsl } from '@packages/types';
import { PrismaService } from '../../../prisma';
import { MarketDataService } from '../../market-data';
import { validateConnectorContract } from '../../connector/connector-contract.util';

const LEGACY_DATA_SOURCE_CODE_MAP: Record<string, string> = {
  INTERNAL_DB: 'MARKET_INTEL_INTERNAL_DB',
  VOLATILITY_DB: 'MARKET_EVENT_INTERNAL_DB',
  INTERNAL_MARKET_DB: 'MARKET_INTEL_INTERNAL_DB',
  market_intel_db: 'MARKET_INTEL_INTERNAL_DB',
  inventory_db: 'MARKET_EVENT_INTERNAL_DB',
};

type PreflightScope = 'DATA' | 'PERMISSION' | 'COST';
type PreflightSeverity = 'ERROR' | 'WARN';

type ConnectorReference = {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  connectorCode: string;
  requiredContractFields: string[];
  requestedFields: string[];
};

export type ConversationExecutionPreflightIssue = {
  scope: PreflightScope;
  severity: PreflightSeverity;
  code: string;
  message: string;
  nodeId?: string;
  connectorCode?: string;
  detail?: Record<string, unknown>;
};

export type ConversationExecutionPreflightCheck = {
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  reasonCodes: string[];
};

export type ConversationExecutionPreflightResult = {
  passed: boolean;
  generatedAt: string;
  workflowVersionId: string | null;
  message: string;
  reasonCodes: string[];
  checks: {
    data: ConversationExecutionPreflightCheck & {
      fetchNodeCount: number;
      connectorReferenceCount: number;
      checkedConnectorCount: number;
      governanceDatasetCount: number;
      governanceCheckedDatasetCount: number;
      governanceCompliant: boolean | null;
    };
    permission: ConversationExecutionPreflightCheck & {
      checkedConnectorCount: number;
      userOrganizationId: string | null;
    };
    cost: ConversationExecutionPreflightCheck & {
      estimatedToken: number | null;
      estimatedLatencyMs: number | null;
      maxRounds: number;
      participantCount: number;
      budget: {
        maxToken: number;
        maxLatencyMs: number;
        maxRounds: number;
        maxParticipants: number;
      };
    };
  };
  issues: ConversationExecutionPreflightIssue[];
};

type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';

type ReconciliationGateReason =
  | 'gate_disabled'
  | 'no_reconciliation_job'
  | 'latest_status_not_done'
  | 'latest_summary_not_passed'
  | 'latest_time_invalid'
  | 'latest_outdated'
  | 'gate_passed';

type ReconciliationGateEvaluationResult = {
  enabled: boolean;
  passed: boolean;
  reason: ReconciliationGateReason;
  checkedAt: string;
  maxAgeMinutes?: number;
  ageMinutes?: number;
  latest?: {
    jobId: string;
    status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
    retriedFromJobId: string | null;
    retryCount: number;
    summaryPass?: boolean;
    createdAt: string;
    finishedAt?: string;
    cancelledAt?: string;
    dimensions?: Record<string, unknown>;
    source: 'database' | 'in-memory';
  };
};

type RuntimeSingleWriteGovernanceStatus = {
  compliant: boolean;
  reasonCodes: string[];
  runtime?: {
    reconciliationGate?: {
      enabled: boolean;
      datasets?: StandardDataset[];
      evaluated?: Record<StandardDataset, ReconciliationGateEvaluationResult>;
      allPassed?: boolean;
      checkedAt?: string;
    };
  };
};

const STANDARD_DATASET_BY_TABLE: Record<string, StandardDataset> = {
  PriceData: 'SPOT_PRICE',
  FuturesQuoteSnapshot: 'FUTURES_QUOTE',
  MarketIntel: 'MARKET_EVENT',
  MarketEvent: 'MARKET_EVENT',
  MarketInsight: 'MARKET_EVENT',
  ResearchReport: 'MARKET_EVENT',
};

const STANDARD_RECONCILIATION_DATASETS: StandardDataset[] = [
  'SPOT_PRICE',
  'FUTURES_QUOTE',
  'MARKET_EVENT',
];

const RECONCILIATION_GATE_REASON_LABEL: Record<ReconciliationGateReason, string> = {
  gate_disabled: '门禁已关闭',
  no_reconciliation_job: '缺少对账任务',
  latest_status_not_done: '最新对账任务未完成',
  latest_summary_not_passed: '最新对账结果未通过',
  latest_time_invalid: '最新对账时间无效',
  latest_outdated: '最新对账结果已过期',
  gate_passed: '门禁通过',
};

type RuntimeConnectorRecord = {
  connectorCode: string;
  connectorType: string;
  isActive: boolean;
  endpointConfig: unknown;
  queryTemplates: unknown;
  responseMapping: unknown;
  freshnessPolicy: unknown;
  rateLimitConfig: unknown;
  healthCheckConfig: unknown;
};

type DataGateInput = {
  fetchNodeCount: number;
  connectorReferences: ConnectorReference[];
  connectorMap: Map<string, RuntimeConnectorRecord>;
  issues: ConversationExecutionPreflightIssue[];
};

type PermissionGateInput = {
  userId: string;
  connectorReferences: ConnectorReference[];
  connectorMap: Map<string, RuntimeConnectorRecord>;
  issues: ConversationExecutionPreflightIssue[];
};

type DataGateCheckResult = ConversationExecutionPreflightResult['checks']['data'];

const dataGateUnsupportedReasonCodes = new Set<string>([
  'STANDARDIZED_READ_DISABLED',
  'RECONCILIATION_GATE_DISABLED',
  'COVERAGE_BELOW_TARGET',
  'LEGACY_READ_DETECTED',
  'NON_STANDARD_SOURCE_DETECTED',
]);

@Injectable()
export class ConversationPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketDataService: MarketDataService,
  ) { }

  async runExecutionPreflight(input: {
    userId: string;
    workflowDefinitionId: string;
    planSnapshot: Record<string, unknown>;
    paramSnapshot: Record<string, unknown>;
  }): Promise<ConversationExecutionPreflightResult> {
    const generatedAt = new Date().toISOString();
    const issues: ConversationExecutionPreflightIssue[] = [];

    const costBudget = this.resolveCostBudget();
    const costEvaluation = this.evaluateCostGate(
      input.planSnapshot,
      input.paramSnapshot,
      costBudget,
      issues,
    );

    const definition = await this.prisma.workflowDefinition.findFirst({
      where: {
        id: input.workflowDefinitionId,
        OR: [{ ownerUserId: input.userId }, { templateSource: 'PUBLIC' }],
      },
      select: { id: true },
    });

    if (!definition) {
      issues.push({
        scope: 'DATA',
        severity: 'ERROR',
        code: 'PREFLIGHT_DATA_WORKFLOW_NOT_VISIBLE',
        message: '数据门禁失败：流程不存在或无权限访问',
      });

      return this.buildResult({
        generatedAt,
        workflowVersionId: null,
        issues,
        data: {
          status: 'FAILED',
          reasonCodes: ['PREFLIGHT_DATA_WORKFLOW_NOT_VISIBLE'],
          fetchNodeCount: 0,
          connectorReferenceCount: 0,
          checkedConnectorCount: 0,
          governanceDatasetCount: 0,
          governanceCheckedDatasetCount: 0,
          governanceCompliant: null,
        },
        permission: {
          status: 'SKIPPED',
          reasonCodes: ['PREFLIGHT_PERMISSION_SKIPPED'],
          checkedConnectorCount: 0,
          userOrganizationId: null,
        },
        cost: costEvaluation,
      });
    }

    const preferredWorkflowVersionId = this.pickString(input.planSnapshot.workflowVersionId);
    const version = preferredWorkflowVersionId
      ? await this.prisma.workflowVersion.findFirst({
        where: {
          id: preferredWorkflowVersionId,
          workflowDefinitionId: definition.id,
        },
        select: {
          id: true,
          dslSnapshot: true,
        },
      })
      : await this.prisma.workflowVersion.findFirst({
        where: {
          workflowDefinitionId: definition.id,
          status: 'PUBLISHED',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          dslSnapshot: true,
        },
      });

    if (!version) {
      issues.push({
        scope: 'DATA',
        severity: 'ERROR',
        code: 'PREFLIGHT_DATA_WORKFLOW_VERSION_NOT_FOUND',
        message: '数据门禁失败：未找到可执行流程版本',
      });

      return this.buildResult({
        generatedAt,
        workflowVersionId: null,
        issues,
        data: {
          status: 'FAILED',
          reasonCodes: ['PREFLIGHT_DATA_WORKFLOW_VERSION_NOT_FOUND'],
          fetchNodeCount: 0,
          connectorReferenceCount: 0,
          checkedConnectorCount: 0,
          governanceDatasetCount: 0,
          governanceCheckedDatasetCount: 0,
          governanceCompliant: null,
        },
        permission: {
          status: 'SKIPPED',
          reasonCodes: ['PREFLIGHT_PERMISSION_SKIPPED'],
          checkedConnectorCount: 0,
          userOrganizationId: null,
        },
        cost: costEvaluation,
      });
    }

    const parsedDsl = WorkflowDslSchema.safeParse(version.dslSnapshot);
    if (!parsedDsl.success) {
      issues.push({
        scope: 'DATA',
        severity: 'ERROR',
        code: 'PREFLIGHT_DATA_DSL_INVALID',
        message: '数据门禁失败：流程 DSL 快照解析失败',
        detail: {
          issueCount: parsedDsl.error.issues.length,
        },
      });

      return this.buildResult({
        generatedAt,
        workflowVersionId: version.id,
        issues,
        data: {
          status: 'FAILED',
          reasonCodes: ['PREFLIGHT_DATA_DSL_INVALID'],
          fetchNodeCount: 0,
          connectorReferenceCount: 0,
          checkedConnectorCount: 0,
          governanceDatasetCount: 0,
          governanceCheckedDatasetCount: 0,
          governanceCompliant: null,
        },
        permission: {
          status: 'SKIPPED',
          reasonCodes: ['PREFLIGHT_PERMISSION_SKIPPED'],
          checkedConnectorCount: 0,
          userOrganizationId: null,
        },
        cost: costEvaluation,
      });
    }

    const dsl = canonicalizeWorkflowDsl(parsedDsl.data);
    const fetchNodes = dsl.nodes.filter(
      (node) => node.enabled !== false && this.isFetchNodeType(node.type),
    );
    const connectorReferences = this.collectConnectorReferences(fetchNodes, input.paramSnapshot);

    const connectorCodes = Array.from(
      new Set(connectorReferences.map((item) => item.connectorCode)),
    );

    const connectors =
      connectorCodes.length > 0
        ? await this.prisma.dataConnector.findMany({
          where: {
            connectorCode: { in: connectorCodes },
          },
          select: {
            connectorCode: true,
            connectorType: true,
            isActive: true,
            endpointConfig: true,
            queryTemplates: true,
            responseMapping: true,
            freshnessPolicy: true,
            rateLimitConfig: true,
            healthCheckConfig: true,
          },
        })
        : [];

    const connectorMap = new Map(connectors.map((item) => [item.connectorCode, item]));

    const dataEvaluation = await this.evaluateDataGate({
      fetchNodeCount: fetchNodes.length,
      connectorReferences,
      connectorMap,
      issues,
    });

    const permissionEvaluation = await this.evaluatePermissionGate({
      userId: input.userId,
      connectorReferences,
      connectorMap,
      issues,
    });

    return this.buildResult({
      generatedAt,
      workflowVersionId: version.id,
      issues,
      data: dataEvaluation,
      permission: permissionEvaluation,
      cost: costEvaluation,
    });
  }

  private buildResult(input: {
    generatedAt: string;
    workflowVersionId: string | null;
    issues: ConversationExecutionPreflightIssue[];
    data: ConversationExecutionPreflightResult['checks']['data'];
    permission: ConversationExecutionPreflightResult['checks']['permission'];
    cost: ConversationExecutionPreflightResult['checks']['cost'];
  }): ConversationExecutionPreflightResult {
    const errorIssues = input.issues.filter((item) => item.severity === 'ERROR');
    const reasonCodes = Array.from(new Set(errorIssues.map((item) => item.code)));
    const errorMessages = Array.from(new Set(errorIssues.map((item) => item.message)));
    const passed = errorIssues.length === 0;

    const message = passed
      ? '执行前校验通过（数据/权限/成本）'
      : `执行前校验未通过：${errorMessages.join('；')}`;

    return {
      passed,
      generatedAt: input.generatedAt,
      workflowVersionId: input.workflowVersionId,
      message,
      reasonCodes,
      checks: {
        data: input.data,
        permission: input.permission,
        cost: input.cost,
      },
      issues: input.issues,
    };
  }

  private async evaluateDataGate(input: DataGateInput): Promise<DataGateCheckResult> {
    const reasonCodes = new Set<string>();

    if (input.fetchNodeCount === 0) {
      reasonCodes.add('PREFLIGHT_DATA_NO_FETCH_NODE');
      return {
        status: 'SKIPPED',
        reasonCodes: [...reasonCodes],
        fetchNodeCount: 0,
        connectorReferenceCount: 0,
        checkedConnectorCount: 0,
        governanceDatasetCount: 0,
        governanceCheckedDatasetCount: 0,
        governanceCompliant: null,
      };
    }

    if (input.connectorReferences.length === 0) {
      reasonCodes.add('PREFLIGHT_DATA_NO_CONNECTOR_BINDING');
      input.issues.push({
        scope: 'DATA',
        severity: 'WARN',
        code: 'PREFLIGHT_DATA_NO_CONNECTOR_BINDING',
        message: '数据门禁提示：流程包含采集节点，但未声明 connectorCode/dataSourceCode',
      });
      return {
        status: 'SKIPPED',
        reasonCodes: [...reasonCodes],
        fetchNodeCount: input.fetchNodeCount,
        connectorReferenceCount: 0,
        checkedConnectorCount: 0,
        governanceDatasetCount: 0,
        governanceCheckedDatasetCount: 0,
        governanceCompliant: null,
      };
    }

    let hasError = false;
    const checkedConnectorSet = new Set<string>();

    for (const reference of input.connectorReferences) {
      const connector = input.connectorMap.get(reference.connectorCode);
      if (!connector) {
        hasError = true;
        reasonCodes.add('PREFLIGHT_DATA_CONNECTOR_NOT_FOUND');
        input.issues.push({
          scope: 'DATA',
          severity: 'ERROR',
          code: 'PREFLIGHT_DATA_CONNECTOR_NOT_FOUND',
          message: `数据门禁失败：连接器 ${reference.connectorCode} 不存在`,
          nodeId: reference.nodeId,
          connectorCode: reference.connectorCode,
        });
        continue;
      }

      if (!connector.isActive) {
        hasError = true;
        reasonCodes.add('PREFLIGHT_DATA_CONNECTOR_INACTIVE');
        input.issues.push({
          scope: 'DATA',
          severity: 'ERROR',
          code: 'PREFLIGHT_DATA_CONNECTOR_INACTIVE',
          message: `数据门禁失败：连接器 ${reference.connectorCode} 已停用`,
          nodeId: reference.nodeId,
          connectorCode: reference.connectorCode,
        });
        continue;
      }

      checkedConnectorSet.add(reference.connectorCode);

      const contractValidation = validateConnectorContract(
        {
          connectorCode: connector.connectorCode,
          connectorType: connector.connectorType,
          endpointConfig: this.toRecord(connector.endpointConfig),
          queryTemplates: this.toRecord(connector.queryTemplates),
          responseMapping: this.toRecord(connector.responseMapping),
          freshnessPolicy: this.toRecord(connector.freshnessPolicy),
          rateLimitConfig: this.toRecord(connector.rateLimitConfig),
          healthCheckConfig: this.toRecord(connector.healthCheckConfig),
        },
        {
          additionalRequiredFields: reference.requiredContractFields,
        },
      );

      if (!contractValidation.valid) {
        hasError = true;
        reasonCodes.add('PREFLIGHT_DATA_CONTRACT_INVALID');
        input.issues.push({
          scope: 'DATA',
          severity: 'ERROR',
          code: 'PREFLIGHT_DATA_CONTRACT_INVALID',
          message: `数据门禁失败：连接器 ${reference.connectorCode} 契约缺失字段 ${contractValidation.missingFields.join(', ')}`,
          nodeId: reference.nodeId,
          connectorCode: reference.connectorCode,
          detail: {
            requiredFields: contractValidation.requiredFields,
            missingFields: contractValidation.missingFields,
          },
        });
      }
    }

    const governanceDatasets = this.resolveGovernanceDatasets(
      input.connectorReferences,
      input.connectorMap,
    );

    const governanceEvaluation = await this.evaluateGovernanceGate({
      datasets: governanceDatasets,
      issues: input.issues,
    });

    for (const code of governanceEvaluation.reasonCodes) {
      reasonCodes.add(code);
    }

    if (governanceEvaluation.hasError) {
      hasError = true;
    }

    return {
      status: hasError ? 'FAILED' : 'PASSED',
      reasonCodes: [...reasonCodes],
      fetchNodeCount: input.fetchNodeCount,
      connectorReferenceCount: input.connectorReferences.length,
      checkedConnectorCount: checkedConnectorSet.size,
      governanceDatasetCount: governanceDatasets.length,
      governanceCheckedDatasetCount: governanceEvaluation.checkedDatasetCount,
      governanceCompliant: governanceEvaluation.compliant,
    };
  }

  private async evaluatePermissionGate(
    input: PermissionGateInput,
  ): Promise<ConversationExecutionPreflightResult['checks']['permission']> {
    const reasonCodes = new Set<string>();
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { organizationId: true },
    });
    const organizationId = this.pickString(user?.organizationId) ?? null;

    const referencesByConnector = new Map<string, ConnectorReference[]>();
    for (const reference of input.connectorReferences) {
      const items = referencesByConnector.get(reference.connectorCode) ?? [];
      items.push(reference);
      referencesByConnector.set(reference.connectorCode, items);
    }

    let checkedConnectorCount = 0;
    let hasError = false;

    for (const [connectorCode, references] of referencesByConnector) {
      const connector = input.connectorMap.get(connectorCode);
      if (!connector || !connector.isActive) {
        continue;
      }

      const healthCheckConfig = this.toRecord(connector.healthCheckConfig);
      const permissionScope = this.toRecord(healthCheckConfig.permissionScope);
      if (Object.keys(permissionScope).length === 0) {
        continue;
      }

      checkedConnectorCount += 1;

      const allowedOrgIds = this.toStringArray(permissionScope.orgIds);
      if (allowedOrgIds.length > 0 && !allowedOrgIds.includes('*')) {
        if (!organizationId || !allowedOrgIds.includes(organizationId)) {
          hasError = true;
          reasonCodes.add('PREFLIGHT_PERMISSION_ORG_DENIED');
          input.issues.push({
            scope: 'PERMISSION',
            severity: 'ERROR',
            code: 'PREFLIGHT_PERMISSION_ORG_DENIED',
            message: `权限门禁失败：当前组织无权访问连接器 ${connectorCode}`,
            connectorCode,
            detail: {
              organizationId,
              allowedOrgIds,
            },
          });
        }
      }

      const fieldAllowlist = this.toStringArray(permissionScope.fieldAllowlist);
      if (fieldAllowlist.length > 0 && !fieldAllowlist.includes('*')) {
        const requestedFields = Array.from(
          new Set(references.flatMap((item) => item.requestedFields).filter(Boolean)),
        );
        if (requestedFields.length > 0) {
          const deniedFields = requestedFields.filter((field) => !fieldAllowlist.includes(field));
          if (deniedFields.length > 0) {
            hasError = true;
            reasonCodes.add('PREFLIGHT_PERMISSION_FIELD_DENIED');
            input.issues.push({
              scope: 'PERMISSION',
              severity: 'ERROR',
              code: 'PREFLIGHT_PERMISSION_FIELD_DENIED',
              message: `权限门禁失败：连接器 ${connectorCode} 不允许访问字段 ${deniedFields.join(', ')}`,
              connectorCode,
              detail: {
                deniedFields,
                fieldAllowlist,
              },
            });
          }
        }
      }
    }

    if (checkedConnectorCount === 0) {
      reasonCodes.add('PREFLIGHT_PERMISSION_NOT_CONFIGURED');
      input.issues.push({
        scope: 'PERMISSION',
        severity: 'WARN',
        code: 'PREFLIGHT_PERMISSION_NOT_CONFIGURED',
        message: '权限门禁提示：当前流程未配置可校验的 permissionScope',
      });
      return {
        status: 'SKIPPED',
        reasonCodes: [...reasonCodes],
        checkedConnectorCount,
        userOrganizationId: organizationId,
      };
    }

    return {
      status: hasError ? 'FAILED' : 'PASSED',
      reasonCodes: [...reasonCodes],
      checkedConnectorCount,
      userOrganizationId: organizationId,
    };
  }

  private evaluateCostGate(
    planSnapshot: Record<string, unknown>,
    paramSnapshot: Record<string, unknown>,
    budget: { maxToken: number; maxLatencyMs: number; maxRounds: number; maxParticipants: number },
    issues: ConversationExecutionPreflightIssue[],
  ): ConversationExecutionPreflightResult['checks']['cost'] {
    const reasonCodes = new Set<string>();
    const estimatedCost = this.toRecord(planSnapshot.estimatedCost);

    const participantCount = Array.isArray(paramSnapshot.participants)
      ? paramSnapshot.participants.length
      : 0;
    const maxRounds = this.normalizePositiveInt(paramSnapshot.maxRounds) ?? 3;

    const estimatedTokenFromPlan = this.readNumberOrNull(estimatedCost.token);
    const estimatedLatencyFromPlan = this.readNumberOrNull(estimatedCost.latencyMs);

    const estimatedToken =
      estimatedTokenFromPlan ?? (participantCount > 0 ? participantCount * maxRounds * 2800 : null);
    const estimatedLatencyMs =
      estimatedLatencyFromPlan ??
      (participantCount > 0 ? participantCount * maxRounds * 1800 : null);

    let hasError = false;

    if (estimatedToken !== null && estimatedToken > budget.maxToken) {
      hasError = true;
      reasonCodes.add('PREFLIGHT_COST_TOKEN_EXCEEDED');
      issues.push({
        scope: 'COST',
        severity: 'ERROR',
        code: 'PREFLIGHT_COST_TOKEN_EXCEEDED',
        message: `成本门禁失败：预估 token ${estimatedToken} 超过预算 ${budget.maxToken}`,
      });
    }

    if (estimatedLatencyMs !== null && estimatedLatencyMs > budget.maxLatencyMs) {
      hasError = true;
      reasonCodes.add('PREFLIGHT_COST_LATENCY_EXCEEDED');
      issues.push({
        scope: 'COST',
        severity: 'ERROR',
        code: 'PREFLIGHT_COST_LATENCY_EXCEEDED',
        message: `成本门禁失败：预估时延 ${estimatedLatencyMs}ms 超过预算 ${budget.maxLatencyMs}ms`,
      });
    }

    if (maxRounds > budget.maxRounds) {
      hasError = true;
      reasonCodes.add('PREFLIGHT_COST_ROUNDS_EXCEEDED');
      issues.push({
        scope: 'COST',
        severity: 'ERROR',
        code: 'PREFLIGHT_COST_ROUNDS_EXCEEDED',
        message: `成本门禁失败：回合数 ${maxRounds} 超过上限 ${budget.maxRounds}`,
      });
    }

    if (participantCount > budget.maxParticipants) {
      hasError = true;
      reasonCodes.add('PREFLIGHT_COST_PARTICIPANTS_EXCEEDED');
      issues.push({
        scope: 'COST',
        severity: 'ERROR',
        code: 'PREFLIGHT_COST_PARTICIPANTS_EXCEEDED',
        message: `成本门禁失败：参与智能体数量 ${participantCount} 超过上限 ${budget.maxParticipants}`,
      });
    }

    if (estimatedToken === null || estimatedLatencyMs === null) {
      reasonCodes.add('PREFLIGHT_COST_ESTIMATE_PARTIAL');
      issues.push({
        scope: 'COST',
        severity: 'WARN',
        code: 'PREFLIGHT_COST_ESTIMATE_PARTIAL',
        message: '成本门禁提示：计划缺少完整成本估算，已使用默认估算策略',
      });
    }

    return {
      status: hasError ? 'FAILED' : 'PASSED',
      reasonCodes: [...reasonCodes],
      estimatedToken,
      estimatedLatencyMs,
      maxRounds,
      participantCount,
      budget,
    };
  }

  private collectConnectorReferences(
    fetchNodes: WorkflowNode[],
    paramSnapshot: Record<string, unknown>,
  ): ConnectorReference[] {
    const references: ConnectorReference[] = [];
    const dedupe = new Set<string>();

    for (const node of fetchNodes) {
      const config = this.toRecord(node.config);
      const connectorCodes = this.resolveConnectorCodes(config);
      if (connectorCodes.length === 0) {
        continue;
      }

      const requiredContractFields = this.toStringArray(config.requiredContractFields);
      const requestedFields = this.resolveRequestedFields(config, paramSnapshot);
      for (const connectorCode of connectorCodes) {
        const dedupeKey = `${node.id}::${connectorCode}`;
        if (dedupe.has(dedupeKey)) {
          continue;
        }
        dedupe.add(dedupeKey);
        references.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          connectorCode,
          requiredContractFields,
          requestedFields,
        });
      }
    }

    return references;
  }

  private resolveConnectorCodes(config: Record<string, unknown>): string[] {
    const candidates = [
      this.pickString(config.dataSourceCode),
      this.pickString(config.connectorCode),
      ...this.toStringArray(config.dataSourceCodes),
      ...this.toStringArray(config.connectorCodes),
    ];

    const normalized = new Set<string>();
    for (const item of candidates) {
      const resolved = this.normalizeConnectorCode(item);
      if (resolved) {
        normalized.add(resolved);
      }
    }

    return [...normalized];
  }

  private resolveRequestedFields(
    config: Record<string, unknown>,
    paramSnapshot: Record<string, unknown>,
  ): string[] {
    return Array.from(
      new Set([
        ...this.toStringArray(config.fields),
        ...this.toStringArray(config.metrics),
        ...this.toStringArray(config.columns),
        ...this.toStringArray(config.selectFields),
        ...this.toStringArray(paramSnapshot.fields),
        ...this.toStringArray(paramSnapshot.metrics),
      ]),
    );
  }

  private resolveGovernanceDatasets(
    connectorReferences: ConnectorReference[],
    connectorMap: Map<string, RuntimeConnectorRecord>,
  ): StandardDataset[] {
    const datasetSet = new Set<StandardDataset>();

    for (const reference of connectorReferences) {
      const connector = connectorMap.get(reference.connectorCode);
      if (!connector || !connector.isActive) {
        continue;
      }

      const queryTemplates = this.toRecord(connector.queryTemplates);
      const endpointConfig = this.toRecord(connector.endpointConfig);

      const standardDatasetRaw =
        this.pickString(queryTemplates.standardDataset) ??
        this.pickString(endpointConfig.standardDataset) ??
        this.pickString(queryTemplates.dataset) ??
        this.pickString(endpointConfig.dataset);

      const normalizedStandardDataset = this.normalizeStandardDataset(standardDatasetRaw);
      if (normalizedStandardDataset) {
        datasetSet.add(normalizedStandardDataset);
        continue;
      }

      const tableName = this.pickString(queryTemplates.tableName);
      if (tableName && STANDARD_DATASET_BY_TABLE[tableName]) {
        datasetSet.add(STANDARD_DATASET_BY_TABLE[tableName]);
      }
    }

    return datasetSet.size > 0 ? [...datasetSet] : [...STANDARD_RECONCILIATION_DATASETS];
  }

  private async evaluateGovernanceGate(input: {
    datasets: StandardDataset[];
    issues: ConversationExecutionPreflightIssue[];
  }): Promise<{
    hasError: boolean;
    reasonCodes: string[];
    checkedDatasetCount: number;
    compliant: boolean | null;
  }> {
    if (input.datasets.length === 0) {
      return {
        hasError: false,
        reasonCodes: [],
        checkedDatasetCount: 0,
        compliant: null,
      };
    }

    let governance: RuntimeSingleWriteGovernanceStatus;
    try {
      governance = (await this.marketDataService.reconciliationService.getSingleWriteGovernanceStatus({
        datasets: input.datasets,
      })) as RuntimeSingleWriteGovernanceStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.issues.push({
        scope: 'DATA',
        severity: 'WARN',
        code: 'PREFLIGHT_DATA_GOVERNANCE_CHECK_FAILED',
        message: `数据治理门禁检查异常：${message}`,
      });
      return {
        hasError: false,
        reasonCodes: ['PREFLIGHT_DATA_GOVERNANCE_CHECK_FAILED'],
        checkedDatasetCount: 0,
        compliant: null,
      };
    }

    const reasonCodes = new Set<string>();
    let hasError = false;

    if (!governance.compliant) {
      for (const reasonCode of governance.reasonCodes ?? []) {
        if (dataGateUnsupportedReasonCodes.has(reasonCode)) {
          continue;
        }
        reasonCodes.add(`PREFLIGHT_DATA_GOVERNANCE_${reasonCode}`);
      }

      const reconciliationGate = governance.runtime?.reconciliationGate;
      const evaluated = reconciliationGate?.evaluated;
      if (evaluated) {
        const entries = Object.entries(evaluated) as Array<
          [StandardDataset, ReconciliationGateEvaluationResult]
        >;
        for (const [dataset, evaluation] of entries) {
          if (evaluation.passed) {
            continue;
          }
          hasError = true;
          reasonCodes.add('PREFLIGHT_DATA_RECONCILIATION_GATE_BLOCKED');
          input.issues.push({
            scope: 'DATA',
            severity: 'ERROR',
            code: 'PREFLIGHT_DATA_RECONCILIATION_GATE_BLOCKED',
            message: `数据治理门禁失败：${dataset} 对账门禁未通过（${RECONCILIATION_GATE_REASON_LABEL[evaluation.reason] ?? evaluation.reason}）`,
            detail: {
              dataset,
              reason: evaluation.reason,
              checkedAt: evaluation.checkedAt,
              maxAgeMinutes: evaluation.maxAgeMinutes,
              ageMinutes: evaluation.ageMinutes,
              latestJobId: evaluation.latest?.jobId,
              latestStatus: evaluation.latest?.status,
            },
          });
        }
      }
    }

    return {
      hasError,
      reasonCodes: [...reasonCodes],
      checkedDatasetCount: input.datasets.length,
      compliant: governance.compliant,
    };
  }

  private normalizeStandardDataset(value: string | null): StandardDataset | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    if (normalized === 'SPOT_PRICE') {
      return 'SPOT_PRICE';
    }
    if (normalized === 'FUTURES_QUOTE') {
      return 'FUTURES_QUOTE';
    }
    if (normalized === 'MARKET_EVENT') {
      return 'MARKET_EVENT';
    }

    return null;
  }

  private resolveCostBudget(): {
    maxToken: number;
    maxLatencyMs: number;
    maxRounds: number;
    maxParticipants: number;
  } {
    return {
      maxToken: this.normalizePositiveInt(process.env.CONV_PREFLIGHT_MAX_TOKEN_BUDGET) ?? 60_000,
      maxLatencyMs: this.normalizePositiveInt(process.env.CONV_PREFLIGHT_MAX_LATENCY_MS) ?? 60_000,
      maxRounds: this.normalizePositiveInt(process.env.CONV_PREFLIGHT_MAX_ROUNDS) ?? 8,
      maxParticipants: this.normalizePositiveInt(process.env.CONV_PREFLIGHT_MAX_PARTICIPANTS) ?? 6,
    };
  }

  /**
   * 4.3 运行时预算累计追踪 + 动态降级
   *
   * 查询当日执行次数，超限时自动降级预算参数。
   */
  async trackCostAccumulation(userId: string): Promise<{
    dailyExecutions: number;
    dailyLimit: number;
    isOverDailyLimit: boolean;
    degradedBudget: {
      maxRounds: number;
      maxParticipants: number;
    } | null;
  }> {
    const dailyLimit =
      this.normalizePositiveInt(process.env.CONV_PREFLIGHT_DAILY_EXEC_LIMIT) ?? 50;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailyExecutions = await this.prisma.conversationTurn.count({
      where: {
        role: 'ASSISTANT',
        createdAt: { gte: todayStart },
        session: { ownerUserId: userId },
        structuredPayload: { not: undefined },
      },
    });

    const isOverDailyLimit = dailyExecutions >= dailyLimit;

    // WHY: 超日限额 80% 时开始渐进降级，避免硬断
    const usageRatio = dailyExecutions / dailyLimit;
    let degradedBudget: { maxRounds: number; maxParticipants: number } | null = null;

    if (usageRatio > 0.8) {
      const baseBudget = this.resolveCostBudget();
      const degradeFactor = Math.max(0.3, 1 - (usageRatio - 0.8) * 2.5);
      degradedBudget = {
        maxRounds: Math.max(2, Math.floor(baseBudget.maxRounds * degradeFactor)),
        maxParticipants: Math.max(1, Math.floor(baseBudget.maxParticipants * degradeFactor)),
      };
    }

    return { dailyExecutions, dailyLimit, isOverDailyLimit, degradedBudget };
  }

  private normalizeConnectorCode(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const mapped =
      LEGACY_DATA_SOURCE_CODE_MAP[trimmed] ??
      LEGACY_DATA_SOURCE_CODE_MAP[trimmed.toUpperCase()] ??
      trimmed;
    return mapped.trim() || null;
  }

  private isFetchNodeType(nodeType: string): boolean {
    return (
      nodeType === 'data-fetch' ||
      nodeType === 'futures-data-fetch' ||
      nodeType === 'external-api-fetch' ||
      nodeType.endsWith('-fetch')
    );
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toStringArray(value: unknown): string[] {
    if (typeof value === 'string') {
      return Array.from(
        new Set(
          value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      );
    }
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0),
      ),
    );
  }

  private pickString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
    return null;
  }

  private readNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(2));
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return Number(parsed.toFixed(2));
      }
    }
    return null;
  }
}
