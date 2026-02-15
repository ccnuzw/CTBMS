import { z } from 'zod';
import {
  normalizeWorkflowNodeType,
  WORKFLOW_CANONICAL_NODE_TYPES,
  type WorkflowCanonicalNodeType,
} from './workflow';

export type WorkflowNodeFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

export interface WorkflowNodePortField {
  name: string;
  type: WorkflowNodeFieldType;
  required?: boolean;
}

export const WorkflowNodeParamOverrideModeEnum = z.enum(['INHERIT', 'PRIVATE_OVERRIDE']);

export const WorkflowNodeParamOverrideSchema = z
  .object({
    paramOverrideMode: WorkflowNodeParamOverrideModeEnum.optional(),
    paramOverrides: z.record(z.unknown()).optional(),
  })
  .partial();

export type WorkflowNodeParamOverrideMode = z.infer<typeof WorkflowNodeParamOverrideModeEnum>;

export interface WorkflowNodeContract {
  nodeType: WorkflowCanonicalNodeType;
  inputsSchema: WorkflowNodePortField[];
  outputsSchema: WorkflowNodePortField[];
  defaultConfig: Record<string, unknown>;
  configSchema?: z.ZodType<Record<string, unknown>>;
}

const withParamOverride = (shape: z.ZodRawShape) => {
  return z.object(shape).merge(WorkflowNodeParamOverrideSchema).passthrough();
};

const WORKFLOW_NODE_CONTRACT_MAP: Record<WorkflowCanonicalNodeType, WorkflowNodeContract> = {
  'manual-trigger': {
    nodeType: 'manual-trigger',
    inputsSchema: [],
    outputsSchema: [{ name: 'triggerUser', type: 'string' }],
    defaultConfig: {},
    configSchema: withParamOverride({}),
  },
  'cron-trigger': {
    nodeType: 'cron-trigger',
    inputsSchema: [],
    outputsSchema: [{ name: 'triggerTime', type: 'string' }],
    defaultConfig: { cronExpression: '0 9 * * 1-5' },
    configSchema: withParamOverride({
      cronExpression: z.string().min(1).optional(),
    }),
  },
  'event-trigger': {
    nodeType: 'event-trigger',
    inputsSchema: [],
    outputsSchema: [{ name: 'event', type: 'object' }],
    defaultConfig: { eventType: '', topic: '' },
    configSchema: withParamOverride({
      eventType: z.string().optional(),
      topic: z.string().optional(),
    }),
  },
  'api-trigger': {
    nodeType: 'api-trigger',
    inputsSchema: [],
    outputsSchema: [{ name: 'payload', type: 'object' }],
    defaultConfig: { rateLimitQpm: 60 },
    configSchema: withParamOverride({
      rateLimitQpm: z.number().int().positive().optional(),
    }),
  },
  'data-fetch': {
    nodeType: 'data-fetch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'data', type: 'array' }],
    defaultConfig: { dataSourceCode: '', timeRangeType: 'LAST_N_DAYS', lookbackDays: 7 },
    configSchema: withParamOverride({
      dataSourceCode: z.string().optional(),
      timeRangeType: z.string().optional(),
      lookbackDays: z.number().int().min(1).optional(),
    }),
  },
  'futures-data-fetch': {
    nodeType: 'futures-data-fetch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'data', type: 'array' }, { name: 'metadata', type: 'object' }],
    defaultConfig: {
      exchange: 'DCE',
      symbol: 'c2501',
      contractType: 'FUTURES',
      dataType: 'KLINE',
      interval: '1d',
      lookbackDays: 30,
      useMockData: true,
    },
    configSchema: withParamOverride({
      exchange: z.string().optional(),
      symbol: z.string().optional(),
      contractType: z.enum(['FUTURES', 'OPTION', 'SPOT']).optional(),
      dataType: z.enum(['KLINE', 'TICK', 'DEPTH', 'FUNDING_RATE']).optional(),
      interval: z.string().optional(),
      lookbackDays: z.number().int().min(1).optional(),
      connectorCode: z.string().optional(),
      useMockData: z.boolean().optional(),
    }),
  },
  'report-fetch': {
    nodeType: 'report-fetch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'reports', type: 'array' }],
    defaultConfig: { category: 'daily', limit: 1 },
    configSchema: withParamOverride({
      category: z.string().optional(),
      limit: z.number().int().min(1).optional(),
    }),
  },
  'knowledge-fetch': {
    nodeType: 'knowledge-fetch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'documents', type: 'array' }],
    defaultConfig: { topK: 5 },
    configSchema: withParamOverride({
      topK: z.number().int().min(1).optional(),
    }),
  },
  'external-api-fetch': {
    nodeType: 'external-api-fetch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'response', type: 'object' }],
    defaultConfig: { url: '', method: 'GET' },
    configSchema: withParamOverride({
      url: z.string().optional(),
      method: z.string().optional(),
    }),
  },
  'formula-calc': {
    nodeType: 'formula-calc',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'result', type: 'number' }],
    defaultConfig: {
      expression: '',
      precision: 2,
      roundingMode: 'HALF_UP',
      nullPolicy: 'FAIL',
    },
    configSchema: withParamOverride({
      expression: z.string().optional(),
      precision: z.number().int().min(0).max(12).optional(),
      roundingMode: z.string().optional(),
      nullPolicy: z.string().optional(),
    }),
  },
  'feature-calc': {
    nodeType: 'feature-calc',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'feature', type: 'number' }],
    defaultConfig: { featureType: 'change_rate', dataKey: 'data' },
    configSchema: withParamOverride({
      featureType: z.string().optional(),
      dataKey: z.string().optional(),
    }),
  },
  'quantile-calc': {
    nodeType: 'quantile-calc',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'quantiles', type: 'array' }],
    defaultConfig: { quantileType: 'percentile', percentiles: [25, 50, 75, 90, 95] },
    configSchema: withParamOverride({
      quantileType: z.string().optional(),
      percentiles: z.array(z.number()).optional(),
    }),
  },
  'rule-eval': {
    nodeType: 'rule-eval',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'hit', type: 'boolean' }],
    defaultConfig: { ruleCode: '', operator: 'EQ', value: '' },
    configSchema: withParamOverride({
      ruleSource: z.string().optional(),
      ruleCode: z.string().optional(),
      rulePackCode: z.string().optional(),
      rulePackCodes: z.array(z.string()).optional(),
      includeLayeredPacks: z.boolean().optional(),
      ruleLayers: z.array(z.string()).optional(),
      fieldPath: z.string().optional(),
      operator: z.string().optional(),
      value: z.unknown().optional(),
    }),
  },
  'rule-pack-eval': {
    nodeType: 'rule-pack-eval',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'ruleSummary', type: 'object' }],
    defaultConfig: { rulePackCode: '', ruleVersionPolicy: 'LOCKED', minHitScore: 60 },
    configSchema: withParamOverride({
      ruleSource: z.string().optional(),
      rulePackCode: z.string().optional(),
      rulePackCodes: z.array(z.string()).optional(),
      includeLayeredPacks: z.boolean().optional(),
      ruleLayers: z.array(z.string()).optional(),
      applicableScope: z.string().optional(),
      applicableScopes: z.array(z.string()).optional(),
      ruleVersionPolicy: z.string().optional(),
      minHitScore: z.number().optional(),
    }),
  },
  'alert-check': {
    nodeType: 'alert-check',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'alertTriggered', type: 'boolean' }],
    defaultConfig: { alertType: '', threshold: 0 },
    configSchema: withParamOverride({
      ruleSource: z.string().optional(),
      alertRuleId: z.string().optional(),
      alertType: z.string().optional(),
      fieldPath: z.string().optional(),
      operator: z.string().optional(),
      value: z.unknown().optional(),
      threshold: z.number().optional(),
      minHitScore: z.number().optional(),
    }),
  },
  'agent-call': {
    nodeType: 'agent-call',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [
      { name: 'response', type: 'string' },
      { name: 'reasoning', type: 'string' },
    ],
    defaultConfig: { agentCode: '' },
    configSchema: withParamOverride({
      agentCode: z.string().optional(),
      agentProfileCode: z.string().optional(),
    }),
  },
  'agent-group': {
    nodeType: 'agent-group',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'groupResult', type: 'object' }],
    defaultConfig: { agents: [] },
    configSchema: withParamOverride({
      agents: z.array(z.string()).optional(),
      agentProfileCode: z.string().optional(),
    }),
  },
  'context-builder': {
    nodeType: 'context-builder',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'context', type: 'object' }],
    defaultConfig: {},
    configSchema: withParamOverride({
      sources: z.array(z.string()).optional(),
      format: z.string().optional(),
      maxTokens: z.number().optional(),
    }),
  },
  'debate-round': {
    nodeType: 'debate-round',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [
      { name: 'conclusion', type: 'string' },
      { name: 'transcript', type: 'array' },
    ],
    defaultConfig: { participants: [], maxRounds: 3, judgePolicy: 'WEIGHTED' },
    configSchema: withParamOverride({
      participants: z
        .array(
          z.object({
            agentCode: z.string(),
            role: z.string().optional(),
            perspective: z.string().optional(),
            weight: z.number().optional(),
          }),
        )
        .optional(),
      maxRounds: z.number().int().min(1).optional(),
      judgePolicy: z.string().optional(),
    }),
  },
  'judge-agent': {
    nodeType: 'judge-agent',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'judgement', type: 'object' }],
    defaultConfig: { agentCode: 'JUDGE_V1' },
    configSchema: withParamOverride({
      agentCode: z.string().optional(),
      agentProfileCode: z.string().optional(),
    }),
  },
  'if-else': {
    nodeType: 'if-else',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [
      { name: 'true', type: 'object' },
      { name: 'false', type: 'object' },
    ],
    defaultConfig: {},
    configSchema: withParamOverride({
      condition: z.unknown().optional(),
    }),
  },
  switch: {
    nodeType: 'switch',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'branches', type: 'object' }],
    defaultConfig: { cases: [] },
    configSchema: withParamOverride({
      cases: z.array(z.unknown()).optional(),
    }),
  },
  'parallel-split': {
    nodeType: 'parallel-split',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'branches', type: 'object' }],
    defaultConfig: {},
    configSchema: withParamOverride({}),
  },
  join: {
    nodeType: 'join',
    inputsSchema: [{ name: 'branches', type: 'object' }],
    outputsSchema: [{ name: 'output', type: 'object' }],
    defaultConfig: { joinMode: 'ALL' },
    configSchema: withParamOverride({
      joinMode: z.string().optional(),
      joinPolicy: z.string().optional(),
      quorumBranches: z.number().int().min(1).optional(),
    }),
  },
  'control-loop': {
    nodeType: 'control-loop',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'output', type: 'object' }],
    defaultConfig: { maxLoops: 10 },
    configSchema: withParamOverride({
      maxLoops: z.number().int().min(1).optional(),
    }),
  },
  'control-delay': {
    nodeType: 'control-delay',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'output', type: 'object' }],
    defaultConfig: { delaySeconds: 60 },
    configSchema: withParamOverride({
      delaySeconds: z.number().min(0).optional(),
    }),
  },
  'decision-merge': {
    nodeType: 'decision-merge',
    inputsSchema: [{ name: 'branches', type: 'object' }],
    outputsSchema: [{ name: 'decision', type: 'object' }],
    defaultConfig: { strategy: 'WEIGHTED_SUM', threshold: 0.8 },
    configSchema: withParamOverride({
      strategy: z.string().optional(),
      decisionPolicy: z.string().optional(),
      threshold: z.number().optional(),
    }),
  },
  'risk-gate': {
    nodeType: 'risk-gate',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'risk', type: 'object' }],
    defaultConfig: {},
    configSchema: withParamOverride({
      riskProfileCode: z.string().optional(),
      riskGrade: z.string().optional(),
      action: z.string().optional(),
      scoreThreshold: z.number().optional(),
    }),
  },
  approval: {
    nodeType: 'approval',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'approval', type: 'object' }],
    defaultConfig: { approverRole: 'RISK_MANAGER', timeoutAction: 'REJECT' },
    configSchema: withParamOverride({
      approverRole: z.string().optional(),
      timeoutAction: z.string().optional(),
    }),
  },
  notify: {
    nodeType: 'notify',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'notification', type: 'object' }],
    defaultConfig: { channel: 'EMAIL' },
    configSchema: withParamOverride({
      channel: z.string().optional(),
      channels: z.array(z.string()).optional(),
      templateId: z.string().optional(),
      messageTemplateCode: z.string().optional(),
    }),
  },
  'report-generate': {
    nodeType: 'report-generate',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'report', type: 'object' }],
    defaultConfig: { format: 'PDF' },
    configSchema: withParamOverride({
      format: z.string().optional(),
    }),
  },
  'dashboard-publish': {
    nodeType: 'dashboard-publish',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'published', type: 'boolean' }],
    defaultConfig: {},
    configSchema: withParamOverride({}),
  },
  group: {
    nodeType: 'group',
    inputsSchema: [],
    outputsSchema: [],
    defaultConfig: {
      width: 300,
      height: 200,
      label: 'Group',
      workflowDefinitionId: '',
      versionId: '',
      collapsed: false,
    },
    configSchema: withParamOverride({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      label: z.string().optional(),
      workflowDefinitionId: z.string().optional(),
      versionId: z.string().optional(),
      collapsed: z.boolean().optional(),
    }),
  },
  'subflow-call': {
    nodeType: 'subflow-call',
    inputsSchema: [{ name: 'input', type: 'object' }],
    outputsSchema: [{ name: 'output', type: 'object' }],
    defaultConfig: {
      workflowDefinitionId: '',
      workflowVersionId: '',
      outputKeyPrefix: '',
    },
    configSchema: withParamOverride({
      workflowDefinitionId: z.string().optional(),
      workflowVersionId: z.string().optional(),
      outputKeyPrefix: z.string().optional(),
    }),
  },
};

export const WORKFLOW_NODE_CONTRACTS = WORKFLOW_NODE_CONTRACT_MAP;

export const WORKFLOW_LEGACY_NODE_TYPE_MAP = {
  trigger: 'manual-trigger',
  'on-demand-trigger': 'api-trigger',
  compute: 'formula-calc',
  'mock-fetch': 'data-fetch',
  'debate-topic': 'context-builder',
  'debate-agent-a': 'debate-round',
  'debate-agent-b': 'debate-round',
  'debate-judge': 'judge-agent',
} as const;

const CANONICAL_NODE_TYPE_SET = new Set<string>(WORKFLOW_CANONICAL_NODE_TYPES);

export const resolveWorkflowNodeContractType = (
  nodeType: string,
): WorkflowCanonicalNodeType | undefined => {
  const normalized = normalizeWorkflowNodeType(nodeType);
  const canonical =
    WORKFLOW_LEGACY_NODE_TYPE_MAP[normalized as keyof typeof WORKFLOW_LEGACY_NODE_TYPE_MAP] ??
    normalized;
  if (!CANONICAL_NODE_TYPE_SET.has(canonical)) {
    return undefined;
  }
  return canonical as WorkflowCanonicalNodeType;
};

export const getWorkflowNodeContract = (nodeType: string): WorkflowNodeContract | undefined => {
  const canonical = resolveWorkflowNodeContractType(nodeType);
  if (!canonical) {
    return undefined;
  }
  return WORKFLOW_NODE_CONTRACT_MAP[canonical];
};

export const isSupportedWorkflowNodeType = (nodeType: string): boolean => {
  return Boolean(resolveWorkflowNodeContractType(nodeType));
};

export interface WorkflowNodeConfigValidationResult {
  valid: boolean;
  normalizedConfig?: Record<string, unknown>;
  issues: string[];
}

export const validateWorkflowNodeConfig = (
  nodeType: string,
  config: unknown,
): WorkflowNodeConfigValidationResult => {
  const contract = getWorkflowNodeContract(nodeType);
  if (!contract) {
    return {
      valid: false,
      issues: [`节点类型不受支持: ${nodeType}`],
    };
  }

  const objectConfig = config ?? {};
  if (!objectConfig || typeof objectConfig !== 'object' || Array.isArray(objectConfig)) {
    return {
      valid: false,
      issues: [`节点 ${nodeType} 的 config 必须是对象`],
    };
  }

  if (!contract.configSchema) {
    return {
      valid: true,
      normalizedConfig: objectConfig as Record<string, unknown>,
      issues: [],
    };
  }

  const parsed = contract.configSchema.safeParse(objectConfig);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'config';
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return {
    valid: true,
    normalizedConfig: parsed.data as Record<string, unknown>,
    issues: [],
  };
};
