import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CreateWorkflowDefinitionDto,
  WorkflowDefinitionDto,
  WorkflowDefinitionStatus,
  WorkflowMode,
  WorkflowNodeOnErrorPolicy,
  WorkflowPublishAuditDto,
  WorkflowDsl,
  WorkflowUsageMethod,
  WorkflowValidationResult,
  WorkflowVersionDto,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
  useCreateWorkflowVersion,
  useCreateWorkflowDefinition,
  usePublishWorkflowVersion,
  useTriggerWorkflowExecution,
  useValidateWorkflowDsl,
  useWorkflowDefinitions,
  useWorkflowPublishAudits,
  useWorkflowVersions,
} from '../api';
import {
  useUpdateWorkflowAgentStrictMode,
  useWorkflowAgentStrictMode,
} from '../../system-config/api';
import { useDecisionRulePacks } from '../../workflow-rule-center/api';
import { useParameterSets } from '../../workflow-parameter-center/api';
import { useAgentProfiles } from '../../workflow-agent-center/api';
import { useDataConnectors } from '../../workflow-data-connector/api';
import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { VersionDiffViewer } from './VersionDiffViewer';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface CreateWorkflowDefinitionFormValues extends CreateWorkflowDefinitionDto {
  starterTemplate?: 'QUICK_DECISION' | 'RISK_REVIEW' | 'DEBATE_ANALYSIS';
  defaultTimeoutMs?: number;
  defaultRetryCount?: number;
  defaultRetryBackoffMs?: number;
  defaultOnError?: WorkflowNodeOnErrorPolicy;
  defaultRulePackCode?: string;
  defaultAgentBindings?: string[];
  defaultParamSetBindings?: string[];
  defaultDataConnectorBindings?: string[];
}

const normalizeBindingValues = (value?: string[] | null): string[] | undefined => {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }
  const list = value
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) {
    return undefined;
  }
  return [...new Set(list)];
};

const slugifyWorkflowId = (name?: string): string => {
  const normalized = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\]+/g, '_')
    .replace(/[^\w-]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    return '';
  }
  return normalized.startsWith('wf_') ? normalized : `wf_${normalized}`;
};

const modeOptions: { label: string; value: WorkflowMode }[] = [
  { label: '线性', value: 'LINEAR' },
  { label: '并行', value: 'DAG' },
  { label: '辩论', value: 'DEBATE' },
];

const usageMethodOptions: { label: string; value: WorkflowUsageMethod }[] = [
  { label: '后台自动', value: 'HEADLESS' },
  { label: '人机协同', value: 'COPILOT' },
  { label: '按需触发', value: 'ON_DEMAND' },
];

const starterTemplateOptions: {
  label: string;
  value: NonNullable<CreateWorkflowDefinitionFormValues['starterTemplate']>;
  description: string;
}[] = [
  {
    label: '快速决策（推荐）',
    value: 'QUICK_DECISION',
    description: '手工触发 -> 规则评估 -> 风险闸门 -> 结果输出',
  },
  {
    label: '风控评审',
    value: 'RISK_REVIEW',
    description: '增加数据采集节点，适合规则和风控校验流程',
  },
  {
    label: '多智能体辩论',
    value: 'DEBATE_ANALYSIS',
    description: '上下文构建 -> 辩论 -> 裁判输出 -> 风险闸门',
  },
];

const runtimeOnErrorOptions: { label: string; value: WorkflowNodeOnErrorPolicy }[] = [
  { label: '失败即中断 (FAIL_FAST)', value: 'FAIL_FAST' },
  { label: '失败后继续 (CONTINUE)', value: 'CONTINUE' },
  { label: '失败路由错误分支 (ROUTE_TO_ERROR)', value: 'ROUTE_TO_ERROR' },
];

const definitionStatusColorMap: Record<string, string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  ARCHIVED: 'red',
};

const versionStatusColorMap: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  ARCHIVED: 'orange',
};

const definitionStatusOptions: { label: string; value: WorkflowDefinitionStatus }[] = [
  { label: '草稿', value: 'DRAFT' },
  { label: '启用', value: 'ACTIVE' },
  { label: '归档', value: 'ARCHIVED' },
];

const workflowModeLabelMap: Record<WorkflowMode, string> = {
  LINEAR: '线性',
  DAG: '并行',
  DEBATE: '辩论',
};

const workflowUsageMethodLabelMap: Record<WorkflowUsageMethod, string> = {
  HEADLESS: '后台自动',
  COPILOT: '人机协同',
  ON_DEMAND: '按需触发',
};

const workflowDefinitionStatusLabelMap: Record<WorkflowDefinitionStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '启用',
  ARCHIVED: '归档',
};

const workflowVersionStatusLabelMap: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '归档',
};

const workflowPublishOperationLabelMap: Record<string, string> = {
  PUBLISH: '发布',
};

const getWorkflowVersionStatusLabel = (status?: string | null): string => {
  if (!status) {
    return '-';
  }
  return workflowVersionStatusLabelMap[status] || status;
};

const getWorkflowPublishOperationLabel = (operation?: string | null): string => {
  if (!operation) {
    return '-';
  }
  return workflowPublishOperationLabelMap[operation] || operation;
};

const buildInitialDslSnapshot = (
  values: CreateWorkflowDefinitionFormValues,
  runtimePolicy: {
    timeoutMs: number;
    retryCount: number;
    retryBackoffMs: number;
    onError: WorkflowNodeOnErrorPolicy;
  },
) => {
  const normalizedRulePackCode = values.defaultRulePackCode?.trim();
  const agentBindings = normalizeBindingValues(values.defaultAgentBindings);
  const paramSetBindings = normalizeBindingValues(values.defaultParamSetBindings);
  const dataConnectorBindings = normalizeBindingValues(values.defaultDataConnectorBindings);
  const starterTemplate = values.starterTemplate ?? 'QUICK_DECISION';
  const hasRulePackNode = Boolean(normalizedRulePackCode);
  const riskProfileCode = 'CORN_RISK_BASE';
  let nodes: WorkflowDsl['nodes'] = [];
  let edges: WorkflowDsl['edges'] = [];

  if (starterTemplate === 'DEBATE_ANALYSIS') {
    nodes = [
      {
        id: 'n_trigger',
        type: 'manual-trigger',
        name: '手工触发',
        enabled: true,
        config: {},
        runtimePolicy,
      },
      {
        id: 'n_context',
        type: 'context-builder',
        name: '上下文构建',
        enabled: true,
        config: {},
        runtimePolicy,
      },
      {
        id: 'n_debate',
        type: 'debate-round',
        name: '辩论回合',
        enabled: true,
        config: {
          maxRounds: 3,
          judgePolicy: 'WEIGHTED',
        },
        runtimePolicy,
      },
      {
        id: 'n_judge',
        type: 'judge-agent',
        name: '裁判输出',
        enabled: true,
        config: {
          agentProfileCode: agentBindings?.[0] || undefined,
        },
        runtimePolicy,
      },
      {
        id: 'n_risk_gate',
        type: 'risk-gate',
        name: '风险闸门',
        enabled: true,
        config: {
          riskProfileCode,
          degradeAction: 'HOLD',
        },
        runtimePolicy,
      },
      {
        id: 'n_notify',
        type: 'notify',
        name: '结果输出',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
        runtimePolicy,
      },
    ];
    edges = [
      { id: 'e_trigger_context', from: 'n_trigger', to: 'n_context', edgeType: 'control-edge' },
      { id: 'e_context_debate', from: 'n_context', to: 'n_debate', edgeType: 'data-edge' },
      { id: 'e_debate_judge', from: 'n_debate', to: 'n_judge', edgeType: 'data-edge' },
      { id: 'e_judge_risk', from: 'n_judge', to: 'n_risk_gate', edgeType: 'control-edge' },
      { id: 'e_risk_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
    ];
  } else if (starterTemplate === 'RISK_REVIEW') {
    nodes = [
      {
        id: 'n_trigger',
        type: 'manual-trigger',
        name: '手工触发',
        enabled: true,
        config: {},
        runtimePolicy,
      },
      {
        id: 'n_fetch_data',
        type: 'data-fetch',
        name: '数据采集',
        enabled: true,
        config: {
          dataSourceCode: dataConnectorBindings?.[0] || '',
          lookbackDays: 7,
        },
        runtimePolicy,
      },
      ...(hasRulePackNode
        ? [
          {
            id: 'n_rule_pack',
            type: 'rule-pack-eval',
            name: '规则包评估',
            enabled: true,
            config: {
              rulePackCode: normalizedRulePackCode,
              ruleVersionPolicy: 'LOCKED',
              minHitScore: 60,
            },
            runtimePolicy,
          },
        ]
        : []),
      {
        id: 'n_risk_gate',
        type: 'risk-gate',
        name: '风险闸门',
        enabled: true,
        config: {
          riskProfileCode,
          degradeAction: 'HOLD',
        },
        runtimePolicy,
      },
      {
        id: 'n_notify',
        type: 'notify',
        name: '结果输出',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
        runtimePolicy,
      },
    ];
    edges = hasRulePackNode
      ? [
        { id: 'e_trigger_fetch', from: 'n_trigger', to: 'n_fetch_data', edgeType: 'control-edge' },
        { id: 'e_fetch_rule_pack', from: 'n_fetch_data', to: 'n_rule_pack', edgeType: 'data-edge' },
        { id: 'e_rule_pack_risk_gate', from: 'n_rule_pack', to: 'n_risk_gate', edgeType: 'control-edge' },
        { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
      ]
      : [
        { id: 'e_trigger_fetch', from: 'n_trigger', to: 'n_fetch_data', edgeType: 'control-edge' },
        { id: 'e_fetch_risk_gate', from: 'n_fetch_data', to: 'n_risk_gate', edgeType: 'data-edge' },
        { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
      ];
  } else {
    nodes = [
      {
        id: 'n_trigger',
        type: 'manual-trigger',
        name: '手工触发',
        enabled: true,
        config: {},
        runtimePolicy,
      },
      ...(hasRulePackNode
        ? [
          {
            id: 'n_rule_pack',
            type: 'rule-pack-eval',
            name: '规则包评估',
            enabled: true,
            config: {
              rulePackCode: normalizedRulePackCode,
              ruleVersionPolicy: 'LOCKED',
              minHitScore: 60,
            },
            runtimePolicy,
          },
        ]
        : []),
      {
        id: 'n_risk_gate',
        type: 'risk-gate',
        name: '风险闸门',
        enabled: true,
        config: {
          riskProfileCode,
          degradeAction: 'HOLD',
        },
        runtimePolicy,
      },
      {
        id: 'n_notify',
        type: 'notify',
        name: '结果输出',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
        runtimePolicy,
      },
    ];
    edges = hasRulePackNode
      ? [
        { id: 'e_trigger_rule_pack', from: 'n_trigger', to: 'n_rule_pack', edgeType: 'control-edge' },
        { id: 'e_rule_pack_risk_gate', from: 'n_rule_pack', to: 'n_risk_gate', edgeType: 'control-edge' },
        { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
      ]
      : [
        { id: 'e_trigger_risk_gate', from: 'n_trigger', to: 'n_risk_gate', edgeType: 'control-edge' },
        { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
      ];
  }

  return {
    workflowId: values.workflowId,
    name: values.name,
    mode: values.mode,
    usageMethod: values.usageMethod,
    version: '1.0.0',
    status: 'DRAFT' as const,
    templateSource: 'PRIVATE' as const,
    nodes,
    edges,
    runPolicy: {
      nodeDefaults: runtimePolicy,
    },
    agentBindings,
    paramSetBindings,
    dataConnectorBindings,
  };
};

const isPublished = (version?: number): boolean =>
  Number.isInteger(version) && Number(version) >= 2;

const readBindingCodes = (value: unknown): string[] => {
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
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractRulePackCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] => {
  const ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);
  const deduped = new Set<string>();
  for (const node of dslSnapshot.nodes) {
    if (!ruleNodeTypes.has(node.type)) {
      continue;
    }
    const config = asRecord(node.config);
    const rawCode = config?.rulePackCode;
    if (typeof rawCode !== 'string') {
      continue;
    }
    const normalized = rawCode.trim();
    if (normalized) {
      deduped.add(normalized);
    }
  }
  return [...deduped];
};

const extractAgentCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] => {
  const deduped = new Set(readBindingCodes(dslSnapshot.agentBindings));
  const agentNodeTypes = new Set(['single-agent', 'agent-call', 'agent-group', 'judge-agent']);
  for (const node of dslSnapshot.nodes) {
    if (!agentNodeTypes.has(node.type)) {
      continue;
    }
    const config = asRecord(node.config);
    const rawCode = config?.agentProfileCode;
    if (typeof rawCode !== 'string') {
      continue;
    }
    const normalized = rawCode.trim();
    if (normalized) {
      deduped.add(normalized);
    }
  }
  return [...deduped];
};

const extractParameterSetCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] =>
  readBindingCodes(dslSnapshot.paramSetBindings);

interface WorkflowDependencyGroup {
  rulePacks: string[];
  parameterSets: string[];
  agentProfiles: string[];
}

interface WorkflowDependencyCheckResult {
  unpublished: WorkflowDependencyGroup;
  unavailable: WorkflowDependencyGroup;
}

interface PublishDryRunPreview {
  generatedAt: Date;
  dependencyResult: WorkflowDependencyCheckResult;
  validationResult: WorkflowValidationResult | null;
  blockers: string[];
  readyToPublish: boolean;
}

const hasDependencyIssues = (group: WorkflowDependencyGroup): boolean =>
  group.rulePacks.length > 0 || group.parameterSets.length > 0 || group.agentProfiles.length > 0;

const countDependencyIssues = (group: WorkflowDependencyGroup): number =>
  group.rulePacks.length + group.parameterSets.length + group.agentProfiles.length;

const hasBlockingDependencyIssues = (
  result?: WorkflowDependencyCheckResult | null,
): boolean =>
  Boolean(
    result &&
      (hasDependencyIssues(result.unpublished) || hasDependencyIssues(result.unavailable)),
  );

type DependencyLookupItem = {
  isActive?: boolean;
  version?: number | null;
};

const classifyDependencyCodes = (
  codes: string[],
  lookup: Map<string, DependencyLookupItem>,
): { unpublished: string[]; unavailable: string[] } => {
  const unpublished: string[] = [];
  const unavailable: string[] = [];
  for (const code of codes) {
    const item = lookup.get(code);
    if (!item || !item.isActive) {
      unavailable.push(code);
      continue;
    }
    if (!isPublished(item.version ?? undefined)) {
      unpublished.push(code);
    }
  }
  return { unpublished, unavailable };
};

const checkPublishDependenciesByLookups = (
  dslSnapshot: WorkflowDsl,
  lookups: {
    rulePacks: Map<string, DependencyLookupItem>;
    parameterSets: Map<string, DependencyLookupItem>;
    agentProfiles: Map<string, DependencyLookupItem>;
  },
): WorkflowDependencyCheckResult => {
  const rulePackCodes = extractRulePackCodesFromDsl(dslSnapshot);
  const parameterSetCodes = extractParameterSetCodesFromDsl(dslSnapshot);
  const agentCodes = extractAgentCodesFromDsl(dslSnapshot);

  const rulePackCheck = classifyDependencyCodes(rulePackCodes, lookups.rulePacks);
  const parameterSetCheck = classifyDependencyCodes(parameterSetCodes, lookups.parameterSets);
  const agentProfileCheck = classifyDependencyCodes(agentCodes, lookups.agentProfiles);

  return {
    unpublished: {
      rulePacks: rulePackCheck.unpublished,
      parameterSets: parameterSetCheck.unpublished,
      agentProfiles: agentProfileCheck.unpublished,
    },
    unavailable: {
      rulePacks: rulePackCheck.unavailable,
      parameterSets: parameterSetCheck.unavailable,
      agentProfiles: agentProfileCheck.unavailable,
    },
  };
};

export const WorkflowDefinitionPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateWorkflowDefinitionFormValues>();
  const [createVisible, setCreateVisible] = useState(false);
  const [isWorkflowIdCustomized, setIsWorkflowIdCustomized] = useState(false);
  const [versionVisible, setVersionVisible] = useState(false);
  const [studioVisible, setStudioVisible] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);
  const [studioVersion, setStudioVersion] = useState<WorkflowVersionDto | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinitionDto | null>(null);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [runningVersionId, setRunningVersionId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const [auditWorkflowVersionId, setAuditWorkflowVersionId] = useState<string | undefined>();
  const [auditPublisherInput, setAuditPublisherInput] = useState('');
  const [auditPublisher, setAuditPublisher] = useState<string | undefined>();
  const [auditPublishedAtRange, setAuditPublishedAtRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState<string | undefined>();
  const [selectedMode, setSelectedMode] = useState<WorkflowMode | undefined>();
  const [selectedUsageMethod, setSelectedUsageMethod] = useState<WorkflowUsageMethod | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<WorkflowDefinitionStatus | undefined>();
  const [includePublic, setIncludePublic] = useState(true);
  const [definitionPageNumber, setDefinitionPageNumber] = useState(1);
  const [definitionPageSize, setDefinitionPageSize] = useState(20);
  const [publishWizardVersion, setPublishWizardVersion] = useState<WorkflowVersionDto | null>(null);
  const [publishWizardDependencyResult, setPublishWizardDependencyResult] =
    useState<WorkflowDependencyCheckResult | null>(null);
  const [publishWizardValidationResult, setPublishWizardValidationResult] =
    useState<WorkflowValidationResult | null>(null);
  const [publishWizardValidationLoading, setPublishWizardValidationLoading] = useState(false);
  const [publishWizardDependencyRefreshing, setPublishWizardDependencyRefreshing] = useState(false);
  const [publishWizardDryRunLoading, setPublishWizardDryRunLoading] = useState(false);
  const [publishWizardDryRunPreview, setPublishWizardDryRunPreview] =
    useState<PublishDryRunPreview | null>(null);

  const definitionQuery = useMemo(
    () => ({
      keyword,
      mode: selectedMode,
      usageMethod: selectedUsageMethod,
      status: selectedStatus,
      includePublic,
      page: definitionPageNumber,
      pageSize: definitionPageSize,
    }),
    [
      keyword,
      selectedMode,
      selectedUsageMethod,
      selectedStatus,
      includePublic,
      definitionPageNumber,
      definitionPageSize,
    ],
  );
  const { data: definitionPage, isLoading: isDefinitionLoading } =
    useWorkflowDefinitions(definitionQuery);
  const { data: versions, isLoading: isVersionLoading } = useWorkflowVersions(
    selectedDefinition?.id,
  );
  const { data: publishAuditPage, isLoading: isPublishAuditLoading } = useWorkflowPublishAudits(
    selectedDefinition?.id,
    {
      workflowVersionId: auditWorkflowVersionId,
      publishedByUserId: auditPublisher,
      publishedAtFrom: auditPublishedAtRange?.[0]?.startOf('day').toDate(),
      publishedAtTo: auditPublishedAtRange?.[1]?.endOf('day').toDate(),
      page: auditPage,
      pageSize: auditPageSize,
    },
  );
  const {
    data: rulePackCatalog,
    isLoading: isRulePackLoading,
    refetch: refetchRulePackCatalog,
  } = useDecisionRulePacks({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const {
    data: parameterSetCatalog,
    isLoading: isParameterSetLoading,
    refetch: refetchParameterSetCatalog,
  } = useParameterSets({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const {
    data: agentProfileCatalog,
    isLoading: isAgentProfileLoading,
    refetch: refetchAgentProfileCatalog,
  } = useAgentProfiles({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const { data: dataConnectorCatalog, isLoading: isDataConnectorLoading } = useDataConnectors({
    isActive: true,
    page: 1,
    pageSize: 500,
  });
  const createMutation = useCreateWorkflowDefinition();
  const createVersionMutation = useCreateWorkflowVersion();
  const publishMutation = usePublishWorkflowVersion();
  const triggerExecutionMutation = useTriggerWorkflowExecution();
  const validateDslMutation = useValidateWorkflowDsl();
  const { data: strictModeSetting, isLoading: strictModeLoading } = useWorkflowAgentStrictMode();
  const updateStrictModeMutation = useUpdateWorkflowAgentStrictMode();

  const rulePackOptions = useMemo(
    () =>
      (rulePackCatalog?.data || [])
        .filter((pack) => pack.isActive)
        .map((pack) => ({
          label: `${pack.name} (${pack.rulePackCode})`,
          value: pack.rulePackCode,
        })),
    [rulePackCatalog?.data],
  );

  const dependencyCatalogLoading =
    isRulePackLoading || isParameterSetLoading || isAgentProfileLoading;

  const agentBindingOptions = useMemo(
    () =>
      (agentProfileCatalog?.data || [])
        .filter((item) => item.isActive)
        .map((item) => ({
          label: `${item.agentName} (${item.agentCode})`,
          value: item.agentCode,
        })),
    [agentProfileCatalog?.data],
  );

  const parameterBindingOptions = useMemo(
    () =>
      (parameterSetCatalog?.data || [])
        .filter((item) => item.isActive)
        .map((item) => ({
          label: `${item.name} (${item.setCode})`,
          value: item.setCode,
        })),
    [parameterSetCatalog?.data],
  );

  const dataConnectorBindingOptions = useMemo(
    () =>
      (dataConnectorCatalog?.data || [])
        .filter((item) => item.isActive)
        .map((item) => ({
          label: `${item.connectorName} (${item.connectorCode})`,
          value: item.connectorCode,
        })),
    [dataConnectorCatalog?.data],
  );

  const rulePackCodeMap = useMemo(
    () => new Map((rulePackCatalog?.data || []).map((item) => [item.rulePackCode, item])),
    [rulePackCatalog?.data],
  );
  const parameterSetCodeMap = useMemo(
    () => new Map((parameterSetCatalog?.data || []).map((item) => [item.setCode, item])),
    [parameterSetCatalog?.data],
  );
  const agentProfileCodeMap = useMemo(
    () => new Map((agentProfileCatalog?.data || []).map((item) => [item.agentCode, item])),
    [agentProfileCatalog?.data],
  );

  const checkPublishDependencies = (dslSnapshot: WorkflowDsl): WorkflowDependencyCheckResult =>
    checkPublishDependenciesByLookups(dslSnapshot, {
      rulePacks: rulePackCodeMap as Map<string, DependencyLookupItem>,
      parameterSets: parameterSetCodeMap as Map<string, DependencyLookupItem>,
      agentProfiles: agentProfileCodeMap as Map<string, DependencyLookupItem>,
    });

  const renderDependencySection = (title: string, group: WorkflowDependencyGroup) => {
    if (!hasDependencyIssues(group)) {
      return null;
    }
    const buildKeywordLink = (path: string, code: string): string =>
      `${path}?keyword=${encodeURIComponent(code)}&page=1&pageSize=20`;

    const renderCodeTags = (codes: string[], path: string, label: string) => {
      if (codes.length === 0) {
        return null;
      }
      return (
        <Space size={[4, 4]} wrap>
          <Text type="secondary">{label}:</Text>
          {codes.map((code) => (
            <Tag key={`${path}-${code}`} color="processing">
              <a href={buildKeywordLink(path, code)} target="_blank" rel="noreferrer">
                {code}
              </a>
            </Tag>
          ))}
        </Space>
      );
    };

    return (
      <Space direction="vertical" size={6}>
        <Text strong>{title}</Text>
        {renderCodeTags(group.rulePacks, '/workflow/rules', '规则包')}
        {renderCodeTags(group.parameterSets, '/workflow/parameters', '参数包')}
        {renderCodeTags(group.agentProfiles, '/workflow/agents', '智能体')}
      </Space>
    );
  };

  const renderDependencyQuickActions = (result: WorkflowDependencyCheckResult) => {
    const needRuleCenter =
      result.unpublished.rulePacks.length > 0 || result.unavailable.rulePacks.length > 0;
    const needParameterCenter =
      result.unpublished.parameterSets.length > 0 || result.unavailable.parameterSets.length > 0;
    const needAgentCenter =
      result.unpublished.agentProfiles.length > 0 || result.unavailable.agentProfiles.length > 0;
    if (!needRuleCenter && !needParameterCenter && !needAgentCenter) {
      return null;
    }
    return (
      <Space wrap size={8}>
        {needRuleCenter ? (
          <Button size="small" href="/workflow/rules" target="_blank" rel="noreferrer">
            前往规则中心
          </Button>
        ) : null}
        {needParameterCenter ? (
          <Button size="small" href="/workflow/parameters" target="_blank" rel="noreferrer">
            前往参数中心
          </Button>
        ) : null}
        {needAgentCenter ? (
          <Button size="small" href="/workflow/agents" target="_blank" rel="noreferrer">
            前往智能体中心
          </Button>
        ) : null}
      </Space>
    );
  };

  useEffect(() => {
    setAuditPage(1);
    setAuditPageSize(10);
    setAuditWorkflowVersionId(undefined);
    setAuditPublisherInput('');
    setAuditPublisher(undefined);
    setAuditPublishedAtRange(null);
    setPublishWizardVersion(null);
    setPublishWizardDependencyResult(null);
    setPublishWizardValidationResult(null);
    setPublishWizardValidationLoading(false);
    setPublishWizardDependencyRefreshing(false);
    setPublishWizardDryRunLoading(false);
    setPublishWizardDryRunPreview(null);
  }, [selectedDefinition?.id]);

  useEffect(() => {
    if (!createVisible) {
      setIsWorkflowIdCustomized(false);
    }
  }, [createVisible]);

  const definitionColumns = useMemo<ColumnsType<WorkflowDefinitionDto>>(
    () => [
      {
        title: '流程名称',
        dataIndex: 'name',
        width: 240,
      },
      {
        title: '流程编码',
        dataIndex: 'workflowId',
        width: 220,
      },
      {
        title: '模式',
        dataIndex: 'mode',
        width: 120,
        render: (value: WorkflowMode) => (
          <Tag color="blue">{workflowModeLabelMap[value] || value}</Tag>
        ),
      },
      {
        title: '使用方式',
        dataIndex: 'usageMethod',
        width: 160,
        render: (value: WorkflowUsageMethod) => (
          <Tag>{workflowUsageMethodLabelMap[value] || value}</Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => (
          <Tag color={definitionStatusColorMap[value] ?? 'default'}>
            {workflowDefinitionStatusLabelMap[value as WorkflowDefinitionStatus] || value}
          </Tag>
        ),
      },
      {
        title: '最新版本',
        dataIndex: 'latestVersionCode',
        width: 120,
        render: (value?: string | null) => value || '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 140,
        render: (_: unknown, record: WorkflowDefinitionDto) => (
          <Button
            type="link"
            onClick={() => {
              setSelectedDefinition(record);
              setVersionVisible(true);
            }}
          >
            查看版本
          </Button>
        ),
      },
    ],
    [],
  );

  const versionColumns = useMemo<ColumnsType<WorkflowVersionDto>>(
    () => [
      {
        title: '版本号',
        dataIndex: 'versionCode',
        width: 120,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => (
          <Tag color={versionStatusColorMap[value] ?? 'default'}>
            {getWorkflowVersionStatusLabel(value)}
          </Tag>
        ),
      },
      {
        title: '变更说明',
        dataIndex: 'changelog',
        render: (value?: string | null) => value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '发布时间',
        dataIndex: 'publishedAt',
        width: 180,
        render: (value?: Date | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '依赖状态',
        key: 'dependencyStatus',
        width: 180,
        render: (_: unknown, record: WorkflowVersionDto) => {
          if (record.status !== 'DRAFT') {
            return <Tag>已冻结</Tag>;
          }
          if (dependencyCatalogLoading) {
            return <Tag color="processing">检查中</Tag>;
          }
          const dependencyResult = checkPublishDependencies(record.dslSnapshot);
          const unpublishedCount = countDependencyIssues(dependencyResult.unpublished);
          const unavailableCount = countDependencyIssues(dependencyResult.unavailable);
          if (unpublishedCount === 0 && unavailableCount === 0) {
            return <Tag color="green">可发布</Tag>;
          }
          return (
            <Space size={4} wrap>
              {unpublishedCount > 0 ? <Tag color="orange">待发布 {unpublishedCount}</Tag> : null}
              {unavailableCount > 0 ? <Tag color="red">不可用 {unavailableCount}</Tag> : null}
            </Space>
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 280,
        render: (_: unknown, record: WorkflowVersionDto) => {
          const isPublishing = publishMutation.isPending && publishingVersionId === record.id;
          const isRunning = triggerExecutionMutation.isPending && runningVersionId === record.id;
          const canOpenPublishWizard = record.status === 'DRAFT' && Boolean(selectedDefinition?.id);
          const canRun = record.status === 'PUBLISHED' && Boolean(selectedDefinition?.id);
          return (
            <Space size={4}>
              <Button
                type="link"
                onClick={() => {
                  setStudioVersion(record);
                  setStudioVisible(true);
                }}
              >
                画布编辑
              </Button>
              <Button
                type="link"
                disabled={(versions?.length ?? 0) < 2}
                onClick={() => setDiffVisible(true)}
              >
                版本对比
              </Button>
              <Button
                type="link"
                disabled={!canOpenPublishWizard || dependencyCatalogLoading}
                loading={isPublishing}
                onClick={() => handleOpenPublishWizard(record)}
              >
                发布版本
              </Button>
              <Popconfirm
                title="确认触发运行该版本？"
                onConfirm={() => handleTriggerExecution(record)}
                disabled={!canRun}
              >
                <Button type="link" disabled={!canRun} loading={isRunning}>
                  触发运行
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [
      dependencyCatalogLoading,
      checkPublishDependencies,
      handleOpenPublishWizard,
      handleTriggerExecution,
      publishMutation.isPending,
      publishingVersionId,
      selectedDefinition?.id,
      triggerExecutionMutation.isPending,
      runningVersionId,
      versions?.length,
    ],
  );
  const versionCodeMap = useMemo(
    () => new Map((versions || []).map((item) => [item.id, item.versionCode])),
    [versions],
  );
  const auditVersionOptions = useMemo(
    () =>
      (versions || []).map((item) => ({
        label: item.versionCode,
        value: item.id,
      })),
    [versions],
  );
  const publishAuditColumns = useMemo<ColumnsType<WorkflowPublishAuditDto>>(
    () => [
      {
        title: '发布时间',
        dataIndex: 'publishedAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '发布版本',
        dataIndex: 'workflowVersionId',
        width: 120,
        render: (value: string) => versionCodeMap.get(value) || value.slice(0, 8),
      },
      {
        title: '操作',
        dataIndex: 'operation',
        width: 120,
        render: (value: string) => (
          <Tag color="blue">{getWorkflowPublishOperationLabel(value)}</Tag>
        ),
      },
      {
        title: '发布人',
        dataIndex: 'publishedByUserId',
        width: 150,
        render: (_: unknown, record: WorkflowPublishAuditDto) =>
          record.publishedByUserName || record.publishedByUserId,
      },
      {
        title: '备注',
        dataIndex: 'comment',
        render: (value?: string | null) => value || '-',
      },
      {
        title: '记录时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
    ],
    [versionCodeMap],
  );

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const {
        starterTemplate,
        defaultTimeoutMs,
        defaultRetryCount,
        defaultRetryBackoffMs,
        defaultOnError,
        defaultRulePackCode,
        defaultAgentBindings,
        defaultParamSetBindings,
        defaultDataConnectorBindings,
        ...definitionPayload
      } = values;

      const runtimePolicy = {
        timeoutMs: defaultTimeoutMs ?? 30000,
        retryCount: defaultRetryCount ?? 1,
        retryBackoffMs: defaultRetryBackoffMs ?? 2000,
        onError: defaultOnError ?? 'FAIL_FAST',
      };

      await createMutation.mutateAsync({
        ...definitionPayload,
        templateSource: 'PRIVATE',
        dslSnapshot: buildInitialDslSnapshot(
          {
            ...values,
            starterTemplate,
            defaultRulePackCode,
            defaultAgentBindings,
            defaultParamSetBindings,
            defaultDataConnectorBindings,
          },
          runtimePolicy,
        ),
      });
      message.success('流程创建成功');
      setCreateVisible(false);
      form.resetFields();
    } catch (error) {
      if (error instanceof Error && error.message.includes('out of date')) {
        return;
      }
      message.error(getErrorMessage(error));
    }
  };

  const runPublishValidationCheck = async (
    version: WorkflowVersionDto,
  ): Promise<WorkflowValidationResult | null> => {
    setPublishWizardValidationLoading(true);
    try {
      const result = await validateDslMutation.mutateAsync({
        dslSnapshot: version.dslSnapshot,
        stage: 'PUBLISH',
      });
      setPublishWizardValidationResult(result);
      return result;
    } catch (error) {
      setPublishWizardValidationResult(null);
      message.error(getErrorMessage(error));
      return null;
    } finally {
      setPublishWizardValidationLoading(false);
    }
  };

  const buildPublishBlockers = (
    dependencyResult: WorkflowDependencyCheckResult,
    validationResult: WorkflowValidationResult | null,
  ): string[] => {
    const blockers: string[] = [];
    const unpublishedCount = countDependencyIssues(dependencyResult.unpublished);
    const unavailableCount = countDependencyIssues(dependencyResult.unavailable);
    if (unpublishedCount > 0 || unavailableCount > 0) {
      blockers.push(`依赖未就绪：待发布 ${unpublishedCount} 项，不可用 ${unavailableCount} 项`);
    }
    if (!validationResult?.valid) {
      blockers.push(`发布校验未通过：${validationResult?.issues.length ?? 0} 项`);
    }
    return blockers;
  };

  const publishVersion = async (version: WorkflowVersionDto): Promise<boolean> => {
    if (!selectedDefinition?.id) {
      return false;
    }
    try {
      setPublishingVersionId(version.id);
      await publishMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        payload: { versionId: version.id },
      });
      message.success(`版本 ${version.versionCode} 已发布`);
      return true;
    } catch (error) {
      message.error(getErrorMessage(error));
      return false;
    } finally {
      setPublishingVersionId(null);
    }
  };

  async function handleOpenPublishWizard(version: WorkflowVersionDto) {
    if (!selectedDefinition?.id) {
      return;
    }
    if (dependencyCatalogLoading) {
      message.warning('依赖资源加载中，请稍后再试');
      return;
    }
    const dependencyResult = checkPublishDependencies(version.dslSnapshot);
    setPublishWizardVersion(version);
    setPublishWizardDependencyResult(dependencyResult);
    setPublishWizardValidationResult(null);
    setPublishWizardDryRunPreview(null);
    await runPublishValidationCheck(version);
  }

  const handleRefreshPublishWizardDependencies = async () => {
    if (!publishWizardVersion) {
      return;
    }
    setPublishWizardDependencyRefreshing(true);
    try {
      const [rulePackResult, parameterSetResult, agentProfileResult] = await Promise.all([
        refetchRulePackCatalog(),
        refetchParameterSetCatalog(),
        refetchAgentProfileCatalog(),
      ]);
      const nextDependencyResult = checkPublishDependenciesByLookups(
        publishWizardVersion.dslSnapshot,
        {
          rulePacks: new Map(
            (rulePackResult.data?.data || []).map((item) => [item.rulePackCode, item]),
          ) as Map<string, DependencyLookupItem>,
          parameterSets: new Map(
            (parameterSetResult.data?.data || []).map((item) => [item.setCode, item]),
          ) as Map<string, DependencyLookupItem>,
          agentProfiles: new Map(
            (agentProfileResult.data?.data || []).map((item) => [item.agentCode, item]),
          ) as Map<string, DependencyLookupItem>,
        },
      );
      setPublishWizardDependencyResult(nextDependencyResult);
      setPublishWizardDryRunPreview(null);
      message.success('依赖目录已刷新');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setPublishWizardDependencyRefreshing(false);
    }
  };

  const handleConfirmPublishFromWizard = async () => {
    if (!publishWizardVersion) {
      return;
    }
    const latestDependencyResult = checkPublishDependencies(publishWizardVersion.dslSnapshot);
    setPublishWizardDependencyResult(latestDependencyResult);
    if (hasBlockingDependencyIssues(latestDependencyResult)) {
      message.warning('仍存在依赖阻塞，请先处理后再发布');
      return;
    }
    let latestValidationResult = publishWizardValidationResult;
    if (!latestValidationResult || !latestValidationResult.valid) {
      latestValidationResult = await runPublishValidationCheck(publishWizardVersion);
    }
    if (!latestValidationResult?.valid) {
      message.warning('发布校验未通过，请先按提示修复');
      return;
    }
    const published = await publishVersion(publishWizardVersion);
    if (published) {
      setPublishWizardVersion(null);
      setPublishWizardDependencyResult(null);
      setPublishWizardValidationResult(null);
      setPublishWizardValidationLoading(false);
      setPublishWizardDependencyRefreshing(false);
      setPublishWizardDryRunLoading(false);
      setPublishWizardDryRunPreview(null);
    }
  };

  const handleRunPublishDryRun = async () => {
    if (!publishWizardVersion) {
      return;
    }
    setPublishWizardDryRunLoading(true);
    try {
      const dependencyResult = checkPublishDependencies(publishWizardVersion.dslSnapshot);
      setPublishWizardDependencyResult(dependencyResult);
      const validationResult = await runPublishValidationCheck(publishWizardVersion);
      const blockers = buildPublishBlockers(dependencyResult, validationResult);
      setPublishWizardDryRunPreview({
        generatedAt: new Date(),
        dependencyResult,
        validationResult,
        blockers,
        readyToPublish: blockers.length === 0,
      });
      message.success(blockers.length === 0 ? '预演通过，可直接发布' : '预演完成，存在待修复项');
    } finally {
      setPublishWizardDryRunLoading(false);
    }
  };

  const handleOpenStudioForPublishWizardVersion = () => {
    if (!publishWizardVersion) {
      return;
    }
    const version = publishWizardVersion;
    setPublishWizardVersion(null);
    setPublishWizardDependencyResult(null);
    setPublishWizardValidationResult(null);
    setPublishWizardValidationLoading(false);
    setPublishWizardDependencyRefreshing(false);
    setPublishWizardDryRunLoading(false);
    setPublishWizardDryRunPreview(null);
    setStudioVersion(version);
    setStudioVisible(true);
  };

  const handleCreateDraftVersion = async () => {
    if (!selectedDefinition?.id) {
      return;
    }

    const latestVersion = versions?.[0];
    if (!latestVersion) {
      message.warning('暂无可复制版本');
      return;
    }

    try {
      await createVersionMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        payload: {
          dslSnapshot: latestVersion.dslSnapshot,
          changelog: `基于 ${latestVersion.versionCode} 创建草稿`,
        },
      });
      message.success('草稿版本创建成功');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleSaveStudioDsl = async (dsl: WorkflowDsl) => {
    if (!selectedDefinition?.id || !studioVersion) {
      return;
    }

    try {
      await createVersionMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        payload: {
          dslSnapshot: {
            ...studioVersion.dslSnapshot,
            ...dsl,
          },
          changelog: `Studio 编辑保存（基于 ${studioVersion.versionCode}）`,
        },
      });
      message.success('Studio 保存成功，已生成新的草稿版本');
      setStudioVisible(false);
      setStudioVersion(null);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleValidateLatestForPublish = async () => {
    const latestVersion = versions?.[0];
    if (!latestVersion) {
      message.warning('暂无可校验版本');
      return;
    }

    try {
      const result = await validateDslMutation.mutateAsync({
        dslSnapshot: latestVersion.dslSnapshot,
        stage: 'PUBLISH',
      });
      setValidationResult(result);
      if (result.valid) {
        message.success('发布校验通过');
      } else {
        message.warning(`发布校验未通过，发现 ${result.issues.length} 项问题`);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  async function handleTriggerExecution(version: WorkflowVersionDto) {
    if (!selectedDefinition?.id) {
      return;
    }
    try {
      setRunningVersionId(version.id);
      const execution = await triggerExecutionMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        workflowVersionId: version.id,
      });
      message.success(`运行完成，实例 ID: ${execution.id}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setRunningVersionId(null);
    }
  }

  const handleStudioRun = async (dsl: WorkflowDsl) => {
    if (!selectedDefinition?.id || !studioVersion) {
      return undefined;
    }

    try {
      // 1. Create a Snapshot Version for Debugging
      const newVersion = await createVersionMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        payload: {
          dslSnapshot: {
            ...studioVersion.dslSnapshot,
            ...dsl,
          },
          changelog: `Studio 调试运行快照（基于 ${studioVersion.versionCode}）`,
        },
      });

      // 2. Update Studio Context to use this new version as base for future runs/saves
      setStudioVersion(newVersion);

      // 3. Trigger Execution
      const execution = await triggerExecutionMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        workflowVersionId: newVersion.id,
      });

      message.success(`已发起运行: ${execution.id}`);
      return execution.id;
    } catch (error) {
      message.error(getErrorMessage(error));
      return undefined;
    }
  };

  const handleStudioValidate = async (dsl: WorkflowDsl) => {
    return validateDslMutation.mutateAsync({
      dslSnapshot: dsl,
      stage: 'SAVE',
    });
  };

  const latestDraftVersion = useMemo(
    () => (versions || []).find((item) => item.status === 'DRAFT'),
    [versions],
  );
  const latestDraftDependencyResult =
    latestDraftVersion && !dependencyCatalogLoading
      ? checkPublishDependencies(latestDraftVersion.dslSnapshot)
      : null;
  const latestDraftUnpublishedCount = latestDraftDependencyResult
    ? countDependencyIssues(latestDraftDependencyResult.unpublished)
    : 0;
  const latestDraftUnavailableCount = latestDraftDependencyResult
    ? countDependencyIssues(latestDraftDependencyResult.unavailable)
    : 0;
  const latestDraftHasBlockingIssues =
    latestDraftUnpublishedCount > 0 || latestDraftUnavailableCount > 0;
  const publishWizardHasDependencyBlock = hasBlockingDependencyIssues(
    publishWizardDependencyResult,
  );
  const publishWizardHasValidationBlock = publishWizardValidationResult
    ? !publishWizardValidationResult.valid
    : true;
  const publishWizardCurrentStep = publishWizardHasDependencyBlock
    ? 0
    : publishWizardValidationLoading || publishWizardHasValidationBlock
      ? 1
      : 2;
  const publishWizardUnpublishedCount = publishWizardDependencyResult
    ? countDependencyIssues(publishWizardDependencyResult.unpublished)
    : 0;
  const publishWizardUnavailableCount = publishWizardDependencyResult
    ? countDependencyIssues(publishWizardDependencyResult.unavailable)
    : 0;
  const isPublishWizardPublishing =
    publishMutation.isPending && publishingVersionId === publishWizardVersion?.id;
  const publishWizardPreviewIssueCount =
    publishWizardDryRunPreview?.validationResult?.issues.length ?? 0;
  const strictModeSourceLabel =
    strictModeSetting?.source === 'DB'
      ? '系统配置'
      : strictModeSetting?.source === 'ENV'
        ? '环境变量'
        : '默认值';

  const handleStrictModeChange = async (checked: boolean) => {
    try {
      await updateStrictModeMutation.mutateAsync(checked);
      message.success(
        checked
          ? '已开启严格模式：鉴权失败将直接标记为 FAILED'
          : '已关闭严格模式：鉴权失败将按降级策略继续',
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '保存失败';
      message.error(errorMessage);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={4} style={{ marginBottom: 0 }}>
              工作流定义管理
            </Title>
            <Text type="secondary">第一阶段能力：流程定义、版本快照、版本发布。</Text>
          </div>
          <Space wrap size={12}>
            <Space size={6}>
              <Text type="secondary">Agent 严格模式</Text>
              <Switch
                checked={strictModeSetting?.enabled ?? false}
                loading={strictModeLoading || updateStrictModeMutation.isPending}
                checkedChildren="严格"
                unCheckedChildren="宽松"
                onChange={handleStrictModeChange}
              />
              <Tag color="blue">{strictModeSourceLabel}</Tag>
            </Space>
            <Button type="primary" onClick={() => setCreateVisible(true)}>
              新建流程
            </Button>
          </Space>
        </Space>
        <Space wrap>
          <Input.Search
            allowClear
            style={{ width: 280 }}
            placeholder="关键词（流程名称/编码）"
            value={keywordInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setKeywordInput(nextValue);
              if (!nextValue.trim()) {
                setKeyword(undefined);
                setDefinitionPageNumber(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setKeyword(normalized ? normalized : undefined);
              setDefinitionPageNumber(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按模式筛选"
            options={modeOptions}
            value={selectedMode}
            onChange={(value) => {
              setSelectedMode(value);
              setDefinitionPageNumber(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 200 }}
            placeholder="按使用方式筛选"
            options={usageMethodOptions}
            value={selectedUsageMethod}
            onChange={(value) => {
              setSelectedUsageMethod(value);
              setDefinitionPageNumber(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按状态筛选"
            options={definitionStatusOptions}
            value={selectedStatus}
            onChange={(value) => {
              setSelectedStatus(value);
              setDefinitionPageNumber(1);
            }}
          />
          <Select
            style={{ width: 180 }}
            options={[
              { label: '包含公共模板', value: true },
              { label: '仅私有流程', value: false },
            ]}
            value={includePublic}
            onChange={(value: boolean) => {
              setIncludePublic(value);
              setDefinitionPageNumber(1);
            }}
          />
          <Button
            onClick={() => {
              setKeywordInput('');
              setKeyword(undefined);
              setSelectedMode(undefined);
              setSelectedUsageMethod(undefined);
              setSelectedStatus(undefined);
              setIncludePublic(true);
              setDefinitionPageNumber(1);
              setDefinitionPageSize(20);
            }}
          >
            重置筛选
          </Button>
        </Space>

        <Table
          rowKey="id"
          loading={isDefinitionLoading}
          columns={definitionColumns}
          dataSource={definitionPage?.data || []}
          pagination={{
            current: definitionPage?.page || definitionPageNumber,
            pageSize: definitionPage?.pageSize || definitionPageSize,
            total: definitionPage?.total || 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setDefinitionPageNumber(nextPage);
              setDefinitionPageSize(nextPageSize);
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Space>

      <Drawer
        title="新建流程"
        open={createVisible}
        width={560}
        onClose={() => {
          setCreateVisible(false);
          setIsWorkflowIdCustomized(false);
          form.resetFields();
        }}
        extra={
          <Space>
            <Button
              onClick={() => {
                setCreateVisible(false);
                setIsWorkflowIdCustomized(false);
                form.resetFields();
              }}
            >
              取消
            </Button>
            <Button type="primary" loading={createMutation.isPending} onClick={handleCreate}>
              创建
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            starterTemplate: 'QUICK_DECISION',
            mode: 'LINEAR',
            usageMethod: 'COPILOT',
            defaultTimeoutMs: 30000,
            defaultRetryCount: 1,
            defaultRetryBackoffMs: 2000,
            defaultOnError: 'FAIL_FAST',
          }}
          onValuesChange={(changedValues, allValues) => {
            const changedName = changedValues.name as string | undefined;
            if (changedName !== undefined && !isWorkflowIdCustomized) {
              const generated = slugifyWorkflowId(changedName);
              form.setFieldsValue({ workflowId: generated || undefined });
            }

            const changedWorkflowId = changedValues.workflowId as string | undefined;
            if (changedWorkflowId !== undefined) {
              const generated = slugifyWorkflowId(allValues.name as string | undefined);
              const normalized = changedWorkflowId.trim();
              if (!normalized) {
                setIsWorkflowIdCustomized(false);
              } else {
                setIsWorkflowIdCustomized(Boolean(generated && normalized !== generated));
              }
            }

            const changedStarterTemplate =
              changedValues.starterTemplate as CreateWorkflowDefinitionFormValues['starterTemplate'] | undefined;
            if (changedStarterTemplate === 'DEBATE_ANALYSIS') {
              form.setFieldsValue({ mode: 'DEBATE', usageMethod: 'COPILOT' });
            } else if (changedStarterTemplate === 'RISK_REVIEW') {
              form.setFieldsValue({ mode: 'DAG', usageMethod: 'HEADLESS' });
            } else if (changedStarterTemplate === 'QUICK_DECISION') {
              form.setFieldsValue({ mode: 'LINEAR', usageMethod: 'COPILOT' });
            }
          }}
        >
          <Form.Item
            label="快速起步模板"
            name="starterTemplate"
            rules={[{ required: true, message: '请选择快速起步模板' }]}
            extra="先选业务场景，系统自动生成流程骨架。后续可在画布继续自由调整。"
          >
            <Select
              options={starterTemplateOptions.map((item) => ({
                label: `${item.label} - ${item.description}`,
                value: item.value,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="流程名称"
            name="name"
            rules={[{ required: true, message: '请输入流程名称' }]}
          >
            <Input placeholder="例如: 玉米晨间线性决策" />
          </Form.Item>
          <Form.Item
            label="流程编码"
            name="workflowId"
            rules={[
              { required: true, message: '请输入流程编码' },
              { pattern: /^[a-zA-Z0-9_-]{3,100}$/, message: '仅支持字母、数字、下划线和中划线' },
            ]}
            extra="系统会根据流程名称自动生成编码，你也可以手动覆盖。"
          >
            <Input
              placeholder="例如: wf_corn_morning_linear"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    const generated = slugifyWorkflowId(form.getFieldValue('name'));
                    form.setFieldsValue({ workflowId: generated || undefined });
                    setIsWorkflowIdCustomized(false);
                  }}
                >
                  自动生成
                </Button>
              }
            />
          </Form.Item>
          <Form.Item label="编排模式" name="mode" rules={[{ required: true }]}>
            <Select options={modeOptions} />
          </Form.Item>
          <Form.Item label="使用方式" name="usageMethod" rules={[{ required: true }]}>
            <Select options={usageMethodOptions} />
          </Form.Item>
          <Form.Item
            label="默认规则包（可选）"
            name="defaultRulePackCode"
            extra="选择后将生成 trigger -> rule-pack-eval -> risk-gate -> notify；未选择时为 trigger -> risk-gate -> notify。"
          >
            <Select
              allowClear
              showSearch
              loading={isRulePackLoading}
              options={rulePackOptions}
              optionFilterProp="label"
              placeholder="请选择规则包编码"
            />
          </Form.Item>
          <Form.Item
            label="默认智能体绑定（可选）"
            name="defaultAgentBindings"
            extra="可多选，系统将自动写入流程绑定。"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              loading={isAgentProfileLoading}
              options={agentBindingOptions}
              optionFilterProp="label"
              placeholder="选择智能体（可多选）"
            />
          </Form.Item>
          <Form.Item
            label="默认参数包绑定（可选）"
            name="defaultParamSetBindings"
            extra="可多选，系统将自动写入参数包绑定。"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              loading={isParameterSetLoading}
              options={parameterBindingOptions}
              optionFilterProp="label"
              placeholder="选择参数包（可多选）"
            />
          </Form.Item>
          <Form.Item
            label="默认连接器绑定（可选）"
            name="defaultDataConnectorBindings"
            extra="可多选，便于后续节点直接引用连接器。"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              loading={isDataConnectorLoading}
              options={dataConnectorBindingOptions}
              optionFilterProp="label"
              placeholder="选择数据连接器（可多选）"
            />
          </Form.Item>
          <Collapse
            size="small"
            items={[
              {
                key: 'advanced-runtime',
                label: '高级设置（运行策略与说明）',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={0}>
                    <Form.Item label="默认超时(ms)" name="defaultTimeoutMs" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} min={1000} max={120000} step={1000} />
                    </Form.Item>
                    <Form.Item label="默认重试次数" name="defaultRetryCount" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} min={0} max={5} step={1} />
                    </Form.Item>
                    <Form.Item
                      label="默认重试间隔(ms)"
                      name="defaultRetryBackoffMs"
                      rules={[{ required: true }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={0} max={60000} step={500} />
                    </Form.Item>
                    <Form.Item label="默认异常策略" name="defaultOnError" rules={[{ required: true }]}>
                      <Select options={runtimeOnErrorOptions} />
                    </Form.Item>
                    <Form.Item label="描述" name="description">
                      <TextArea rows={4} placeholder="流程说明（可选）" />
                    </Form.Item>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>

      <Drawer
        title={`版本列表 - ${selectedDefinition?.name || ''}`}
        open={versionVisible}
        width={1400}
        extra={
          <Space>
            <Button
              onClick={handleValidateLatestForPublish}
              loading={validateDslMutation.isPending}
              disabled={!versions?.length}
            >
              校验最新版本
            </Button>
            <Button
              type="primary"
              onClick={handleCreateDraftVersion}
              loading={createVersionMutation.isPending}
              disabled={!versions?.length}
            >
              新建草稿版本
            </Button>
          </Space>
        }
        onClose={() => {
          setVersionVisible(false);
          setSelectedDefinition(null);
          setValidationResult(null);
          setStudioVisible(false);
          setDiffVisible(false);
          setStudioVersion(null);
          setPublishWizardVersion(null);
          setPublishWizardDependencyResult(null);
          setPublishWizardValidationResult(null);
          setPublishWizardValidationLoading(false);
          setPublishWizardDependencyRefreshing(false);
          setPublishWizardDryRunLoading(false);
          setPublishWizardDryRunPreview(null);
          setAuditPage(1);
          setAuditPageSize(10);
        }}
      >
        {validationResult ? (
          <Alert
            style={{ marginBottom: 12 }}
            showIcon
            type={validationResult.valid ? 'success' : 'warning'}
            message={
              validationResult.valid
                ? '发布校验通过'
                : `发布校验未通过（${validationResult.issues.length} 项）`
            }
            description={
              validationResult.valid
                ? undefined
                : validationResult.issues
                  .slice(0, 5)
                  .map((issue) => `${issue.code}: ${issue.message}`)
                  .join('；')
            }
          />
        ) : null}
        {latestDraftVersion ? (
          <Alert
            style={{ marginBottom: 12 }}
            showIcon
            type={
              dependencyCatalogLoading
                ? 'info'
                : latestDraftHasBlockingIssues
                  ? 'warning'
                  : 'success'
            }
            message={
              dependencyCatalogLoading
                ? `草稿版本 ${latestDraftVersion.versionCode} 依赖检查中`
                : latestDraftHasBlockingIssues
                  ? `草稿版本 ${latestDraftVersion.versionCode} 存在依赖阻塞`
                  : `草稿版本 ${latestDraftVersion.versionCode} 依赖已就绪`
            }
            description={
              dependencyCatalogLoading ? (
                '正在加载规则包、参数包与智能体目录。'
              ) : latestDraftHasBlockingIssues ? (
                <Space direction="vertical" size={8}>
                  <Text type="secondary">
                    待发布依赖 {latestDraftUnpublishedCount} 项，不可用依赖 {latestDraftUnavailableCount}{' '}
                    项。
                  </Text>
                  {latestDraftDependencyResult
                    ? renderDependencySection(
                      '未发布依赖（需要 version >= 2）',
                      latestDraftDependencyResult.unpublished,
                    )
                    : null}
                  {latestDraftDependencyResult
                    ? renderDependencySection(
                      '不可用依赖（不存在、未启用或无权限）',
                      latestDraftDependencyResult.unavailable,
                    )
                    : null}
                  {latestDraftDependencyResult
                    ? renderDependencyQuickActions(latestDraftDependencyResult)
                    : null}
                </Space>
              ) : (
                '该草稿版本可直接发起发布。'
              )
            }
          />
        ) : null}
        <Table
          rowKey="id"
          loading={isVersionLoading}
          columns={versionColumns}
          dataSource={versions || []}
          pagination={false}
        />
        <Title level={5} style={{ marginTop: 20 }}>
          发布审计
        </Title>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="按发布版本筛选"
            options={auditVersionOptions}
            value={auditWorkflowVersionId}
            onChange={(value) => {
              setAuditWorkflowVersionId(value);
              setAuditPage(1);
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 220 }}
            placeholder="按发布人筛选"
            value={auditPublisherInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setAuditPublisherInput(nextValue);
              if (!nextValue.trim()) {
                setAuditPublisher(undefined);
                setAuditPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setAuditPublisher(normalized ? normalized : undefined);
              setAuditPage(1);
            }}
          />
          <RangePicker
            value={auditPublishedAtRange}
            onChange={(value) => {
              setAuditPublishedAtRange(value as [Dayjs, Dayjs] | null);
              setAuditPage(1);
            }}
          />
          <Button
            onClick={() => {
              setAuditWorkflowVersionId(undefined);
              setAuditPublisherInput('');
              setAuditPublisher(undefined);
              setAuditPublishedAtRange(null);
              setAuditPage(1);
              setAuditPageSize(10);
            }}
          >
            重置审计筛选
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={isPublishAuditLoading}
          columns={publishAuditColumns}
          dataSource={publishAuditPage?.data || []}
          pagination={{
            current: publishAuditPage?.page || auditPage,
            pageSize: publishAuditPage?.pageSize || auditPageSize,
            total: publishAuditPage?.total || 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setAuditPage(nextPage);
              setAuditPageSize(nextPageSize);
            },
          }}
          scroll={{ x: 900 }}
        />
      </Drawer>

      <Modal
        open={Boolean(publishWizardVersion)}
        width={820}
        title={
          publishWizardVersion
            ? `发布修复向导 - ${publishWizardVersion.versionCode}`
            : '发布修复向导'
        }
        okText="确认发布"
        cancelText="关闭"
        onOk={handleConfirmPublishFromWizard}
        okButtonProps={{
          disabled:
            !publishWizardVersion ||
            publishWizardHasDependencyBlock ||
            publishWizardHasValidationBlock ||
            publishWizardValidationLoading,
        }}
        confirmLoading={isPublishWizardPublishing}
        onCancel={() => {
          setPublishWizardVersion(null);
          setPublishWizardDependencyResult(null);
          setPublishWizardValidationResult(null);
          setPublishWizardValidationLoading(false);
          setPublishWizardDependencyRefreshing(false);
          setPublishWizardDryRunLoading(false);
          setPublishWizardDryRunPreview(null);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setPublishWizardVersion(null);
              setPublishWizardDependencyResult(null);
              setPublishWizardValidationResult(null);
              setPublishWizardValidationLoading(false);
              setPublishWizardDependencyRefreshing(false);
              setPublishWizardDryRunLoading(false);
              setPublishWizardDryRunPreview(null);
            }}
          >
            关闭
          </Button>,
          <Button
            key="dry-run"
            loading={publishWizardDryRunLoading}
            onClick={() => {
              void handleRunPublishDryRun();
            }}
          >
            发布预演
          </Button>,
          <Button
            key="publish"
            type="primary"
            loading={isPublishWizardPublishing}
            disabled={
              !publishWizardVersion ||
              publishWizardHasDependencyBlock ||
              publishWizardHasValidationBlock ||
              publishWizardValidationLoading
            }
            onClick={() => {
              void handleConfirmPublishFromWizard();
            }}
          >
            确认发布
          </Button>,
        ]}
      >
        {publishWizardVersion ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Steps
              size="small"
              current={publishWizardCurrentStep}
              items={[
                {
                  title: '依赖检查',
                  description:
                    publishWizardHasDependencyBlock && publishWizardDependencyResult
                      ? `待发布 ${publishWizardUnpublishedCount}，不可用 ${publishWizardUnavailableCount}`
                      : '依赖就绪',
                },
                {
                  title: '发布校验',
                  description: publishWizardValidationLoading
                    ? '校验中'
                    : publishWizardValidationResult?.valid
                      ? '校验通过'
                      : '需修复校验问题',
                },
                { title: '执行发布', description: '满足条件后发布版本' },
              ]}
            />

            <Alert
              showIcon
              type={publishWizardHasDependencyBlock || publishWizardHasValidationBlock ? 'warning' : 'success'}
              message={
                publishWizardHasDependencyBlock || publishWizardHasValidationBlock
                  ? '发布前仍有阻塞项'
                  : '已满足发布条件，可直接发布'
              }
              description={
                publishWizardHasDependencyBlock
                  ? `依赖阻塞：待发布 ${publishWizardUnpublishedCount} 项，不可用 ${publishWizardUnavailableCount} 项。`
                  : publishWizardHasValidationBlock
                    ? '依赖已就绪，但发布校验仍未通过。'
                    : '依赖与发布校验均通过。'
              }
            />

            <Card
              size="small"
              title="步骤 1：依赖修复"
              extra={
                <Button
                  size="small"
                  loading={publishWizardDependencyRefreshing}
                  onClick={handleRefreshPublishWizardDependencies}
                >
                  刷新依赖目录
                </Button>
              }
            >
              {publishWizardDependencyResult ? (
                <Space direction="vertical" size={8}>
                  {renderDependencySection(
                    '未发布依赖（需要 version >= 2）',
                    publishWizardDependencyResult.unpublished,
                  )}
                  {renderDependencySection(
                    '不可用依赖（不存在、未启用或无权限）',
                    publishWizardDependencyResult.unavailable,
                  )}
                  {renderDependencyQuickActions(publishWizardDependencyResult)}
                  {!hasBlockingDependencyIssues(publishWizardDependencyResult) ? (
                    <Text type="success">依赖已就绪。</Text>
                  ) : null}
                </Space>
              ) : (
                <Text type="secondary">暂无依赖检查结果。</Text>
              )}
            </Card>

            <Card
              size="small"
              title="步骤 2：发布校验"
              extra={
                <Button
                  size="small"
                  loading={publishWizardValidationLoading}
                  onClick={() => {
                    if (publishWizardVersion) {
                      void runPublishValidationCheck(publishWizardVersion);
                    }
                  }}
                >
                  重新校验
                </Button>
              }
            >
              {publishWizardValidationLoading ? (
                <Text type="secondary">正在校验流程结构和发布规则，请稍候...</Text>
              ) : publishWizardValidationResult ? (
                <Space direction="vertical" size={8}>
                  <Alert
                    showIcon
                    type={publishWizardValidationResult.valid ? 'success' : 'warning'}
                    message={
                      publishWizardValidationResult.valid
                        ? '发布校验通过'
                        : `发布校验未通过（${publishWizardValidationResult.issues.length} 项）`
                    }
                  />
                  {!publishWizardValidationResult.valid ? (
                    <Space direction="vertical" size={4}>
                      {publishWizardValidationResult.issues.slice(0, 8).map((issue) => (
                        <Text key={`${issue.code}-${issue.message}`} type="secondary">
                          {issue.code}: {issue.message}
                        </Text>
                      ))}
                    </Space>
                  ) : null}
                </Space>
              ) : (
                <Text type="secondary">尚未进行发布校验。</Text>
              )}
            </Card>

            {publishWizardDryRunPreview ? (
              <Card
                size="small"
                title="预演结果（不发布）"
                extra={
                  publishWizardDryRunPreview.readyToPublish ? null : (
                    <Button size="small" type="link" onClick={handleOpenStudioForPublishWizardVersion}>
                      去画布修复
                    </Button>
                  )
                }
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    showIcon
                    type={publishWizardDryRunPreview.readyToPublish ? 'success' : 'warning'}
                    message={
                      publishWizardDryRunPreview.readyToPublish
                        ? '预演通过：当前版本可发布'
                        : '预演未通过：存在阻塞项'
                    }
                    description={`生成时间：${dayjs(publishWizardDryRunPreview.generatedAt).format('YYYY-MM-DD HH:mm:ss')}`}
                  />
                  {publishWizardDryRunPreview.blockers.length > 0 ? (
                    <Space direction="vertical" size={4}>
                      {publishWizardDryRunPreview.blockers.map((item, index) => (
                        <Text key={`${item}-${index}`} type="secondary">
                          {index + 1}. {item}
                        </Text>
                      ))}
                    </Space>
                  ) : (
                    <Text type="success">无阻塞项，可执行发布。</Text>
                  )}
                  <Text type="secondary">
                    预演摘要：待发布依赖{' '}
                    {countDependencyIssues(publishWizardDryRunPreview.dependencyResult.unpublished)} 项，
                    不可用依赖{' '}
                    {countDependencyIssues(publishWizardDryRunPreview.dependencyResult.unavailable)} 项，
                    校验问题 {publishWizardPreviewIssueCount} 项。
                  </Text>
                </Space>
              </Card>
            ) : null}

            <Divider style={{ margin: 0 }} />
            <Text type="secondary">
              完成以上两步后，点击“确认发布”执行版本发布。若已在其他页面处理依赖，请先刷新依赖目录再发布。
            </Text>
          </Space>
        ) : null}
      </Modal>

      <Drawer
        title={`Workflow Studio - ${studioVersion?.versionCode || ''}`}
        open={studioVisible}
        width="100%"
        destroyOnClose
        onClose={() => {
          setStudioVisible(false);
          setStudioVersion(null);
        }}
      >
        {studioVersion ? (
          <div style={{ height: '78vh' }}>
            <WorkflowCanvas
              initialDsl={studioVersion.dslSnapshot}
              onSave={handleSaveStudioDsl}
              onRun={handleStudioRun}
              onValidate={handleStudioValidate}
              currentVersionId={studioVersion.id}
              currentDefinitionId={selectedDefinition?.id}
            />
          </div>
        ) : null}
      </Drawer>

      <Drawer
        title="版本差异对比"
        open={diffVisible}
        width={1200}
        destroyOnClose
        onClose={() => setDiffVisible(false)}
      >
        {(versions?.length ?? 0) >= 2 ? (
          <VersionDiffViewer versions={versions || []} />
        ) : (
          <Alert type="info" showIcon message="至少需要两个版本才能进行差异对比" />
        )}
      </Drawer>
    </Card>
  );
};
