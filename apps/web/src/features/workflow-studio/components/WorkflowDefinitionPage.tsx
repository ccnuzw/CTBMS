import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
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
import { useDecisionRulePacks } from '../../workflow-rule-center/api';
import { useParameterSets } from '../../workflow-parameter-center/api';
import { useAgentProfiles } from '../../workflow-agent-center/api';
import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { VersionDiffViewer } from './VersionDiffViewer';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface CreateWorkflowDefinitionFormValues extends CreateWorkflowDefinitionDto {
  defaultTimeoutMs?: number;
  defaultRetryCount?: number;
  defaultRetryBackoffMs?: number;
  defaultOnError?: WorkflowNodeOnErrorPolicy;
  defaultRulePackCode?: string;
  defaultAgentBindingsText?: string;
  defaultParamSetBindingsText?: string;
  defaultDataConnectorBindingsText?: string;
}

const parseBindingInput = (value?: string): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) {
    return undefined;
  }
  return [...new Set(list)];
};

const modeOptions: { label: string; value: WorkflowMode }[] = [
  { label: '线性 (LINEAR)', value: 'LINEAR' },
  { label: '并行 (DAG)', value: 'DAG' },
  { label: '辩论 (DEBATE)', value: 'DEBATE' },
];

const usageMethodOptions: { label: string; value: WorkflowUsageMethod }[] = [
  { label: '后台自动 (HEADLESS)', value: 'HEADLESS' },
  { label: '人机协同 (COPILOT)', value: 'COPILOT' },
  { label: '按需触发 (ON_DEMAND)', value: 'ON_DEMAND' },
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
  { label: 'DRAFT', value: 'DRAFT' },
  { label: 'ACTIVE', value: 'ACTIVE' },
  { label: 'ARCHIVED', value: 'ARCHIVED' },
];

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
  const agentBindings = parseBindingInput(values.defaultAgentBindingsText);
  const paramSetBindings = parseBindingInput(values.defaultParamSetBindingsText);
  const dataConnectorBindings = parseBindingInput(values.defaultDataConnectorBindingsText);
  const hasRulePackNode = Boolean(normalizedRulePackCode);
  const riskProfileCode = 'CORN_RISK_BASE';
  const nodes = [
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
  const edges = hasRulePackNode
    ? [
      {
        id: 'e_trigger_rule_pack',
        from: 'n_trigger',
        to: 'n_rule_pack',
        edgeType: 'control-edge' as const,
      },
      {
        id: 'e_rule_pack_risk_gate',
        from: 'n_rule_pack',
        to: 'n_risk_gate',
        edgeType: 'control-edge' as const,
      },
      {
        id: 'e_risk_gate_notify',
        from: 'n_risk_gate',
        to: 'n_notify',
        edgeType: 'control-edge' as const,
      },
    ]
    : [
      {
        id: 'e_trigger_risk_gate',
        from: 'n_trigger',
        to: 'n_risk_gate',
        edgeType: 'control-edge' as const,
      },
      {
        id: 'e_risk_gate_notify',
        from: 'n_risk_gate',
        to: 'n_notify',
        edgeType: 'control-edge' as const,
      },
    ];

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

const hasDependencyIssues = (group: WorkflowDependencyGroup): boolean =>
  group.rulePacks.length > 0 || group.parameterSets.length > 0 || group.agentProfiles.length > 0;

const countDependencyIssues = (group: WorkflowDependencyGroup): number =>
  group.rulePacks.length + group.parameterSets.length + group.agentProfiles.length;

export const WorkflowDefinitionPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateWorkflowDefinitionFormValues>();
  const [createVisible, setCreateVisible] = useState(false);
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
  const { data: rulePackCatalog, isLoading: isRulePackLoading } = useDecisionRulePacks({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const { data: parameterSetCatalog, isLoading: isParameterSetLoading } = useParameterSets({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const { data: agentProfileCatalog, isLoading: isAgentProfileLoading } = useAgentProfiles({
    includePublic: true,
    page: 1,
    pageSize: 500,
  });
  const createMutation = useCreateWorkflowDefinition();
  const createVersionMutation = useCreateWorkflowVersion();
  const publishMutation = usePublishWorkflowVersion();
  const triggerExecutionMutation = useTriggerWorkflowExecution();
  const validateDslMutation = useValidateWorkflowDsl();

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

  const checkPublishDependencies = (dslSnapshot: WorkflowDsl): WorkflowDependencyCheckResult => {
    const rulePackCodes = extractRulePackCodesFromDsl(dslSnapshot);
    const parameterSetCodes = extractParameterSetCodesFromDsl(dslSnapshot);
    const agentCodes = extractAgentCodesFromDsl(dslSnapshot);

    const unpublished: WorkflowDependencyGroup = {
      rulePacks: [],
      parameterSets: [],
      agentProfiles: [],
    };
    const unavailable: WorkflowDependencyGroup = {
      rulePacks: [],
      parameterSets: [],
      agentProfiles: [],
    };

    for (const code of rulePackCodes) {
      const item = rulePackCodeMap.get(code);
      if (!item || !item.isActive) {
        unavailable.rulePacks.push(code);
        continue;
      }
      if (!isPublished(item.version)) {
        unpublished.rulePacks.push(code);
      }
    }

    for (const code of parameterSetCodes) {
      const item = parameterSetCodeMap.get(code);
      if (!item || !item.isActive) {
        unavailable.parameterSets.push(code);
        continue;
      }
      if (!isPublished(item.version)) {
        unpublished.parameterSets.push(code);
      }
    }

    for (const code of agentCodes) {
      const item = agentProfileCodeMap.get(code);
      if (!item || !item.isActive) {
        unavailable.agentProfiles.push(code);
        continue;
      }
      if (!isPublished(item.version)) {
        unpublished.agentProfiles.push(code);
      }
    }

    return { unpublished, unavailable };
  };

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
        {renderCodeTags(group.agentProfiles, '/workflow/agents', 'Agent')}
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
            前往 Agent 中心
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
  }, [selectedDefinition?.id]);

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
        render: (value: WorkflowMode) => <Tag color="blue">{value}</Tag>,
      },
      {
        title: '使用方式',
        dataIndex: 'usageMethod',
        width: 160,
        render: (value: WorkflowUsageMethod) => <Tag>{value}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => (
          <Tag color={definitionStatusColorMap[value] ?? 'default'}>{value}</Tag>
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
          <Tag color={versionStatusColorMap[value] ?? 'default'}>{value}</Tag>
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
          const canPublishBase = record.status === 'DRAFT' && Boolean(selectedDefinition?.id);
          const dependencyResult = dependencyCatalogLoading
            ? null
            : checkPublishDependencies(record.dslSnapshot);
          const hasBlockingDependencyIssues = Boolean(
            dependencyResult &&
            (hasDependencyIssues(dependencyResult.unpublished) ||
              hasDependencyIssues(dependencyResult.unavailable)),
          );
          const canPublish = canPublishBase && !hasBlockingDependencyIssues;
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
                Studio
              </Button>
              <Button
                type="link"
                disabled={(versions?.length ?? 0) < 2}
                onClick={() => setDiffVisible(true)}
              >
                版本对比
              </Button>
              <Popconfirm
                title="确认发布该版本？"
                onConfirm={() => handlePublish(record)}
                disabled={!canPublish}
              >
                <Button type="link" disabled={!canPublish} loading={isPublishing}>
                  发布版本
                </Button>
              </Popconfirm>
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
      publishMutation.isPending,
      publishingVersionId,
      rulePackCodeMap,
      parameterSetCodeMap,
      agentProfileCodeMap,
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
        render: (value: string) => <Tag color="blue">{value}</Tag>,
      },
      {
        title: '发布人',
        dataIndex: 'publishedByUserId',
        width: 150,
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
        defaultTimeoutMs,
        defaultRetryCount,
        defaultRetryBackoffMs,
        defaultOnError,
        defaultRulePackCode,
        defaultAgentBindingsText,
        defaultParamSetBindingsText,
        defaultDataConnectorBindingsText,
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
            defaultRulePackCode,
            defaultAgentBindingsText,
            defaultParamSetBindingsText,
            defaultDataConnectorBindingsText,
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

  const handlePublish = async (version: WorkflowVersionDto) => {
    if (!selectedDefinition?.id) {
      return;
    }
    if (dependencyCatalogLoading) {
      message.warning('依赖资源加载中，请稍后再试');
      return;
    }
    const dependencyResult = checkPublishDependencies(version.dslSnapshot);
    if (
      hasDependencyIssues(dependencyResult.unpublished) ||
      hasDependencyIssues(dependencyResult.unavailable)
    ) {
      Modal.warning({
        title: '发布前检查未通过',
        width: 720,
        okText: '我知道了',
        content: (
          <Space direction="vertical" size={12}>
            <Text type="secondary">
              当前版本引用了未发布或不可用依赖，请先在对应中心完成发布/启用后再发布工作流。
            </Text>
            {renderDependencySection(
              '未发布依赖（需要 version >= 2）',
              dependencyResult.unpublished,
            )}
            {renderDependencySection(
              '不可用依赖（不存在、未启用或无权限）',
              dependencyResult.unavailable,
            )}
            {renderDependencyQuickActions(dependencyResult)}
          </Space>
        ),
      });
      return;
    }
    try {
      setPublishingVersionId(version.id);
      await publishMutation.mutateAsync({
        workflowDefinitionId: selectedDefinition.id,
        payload: { versionId: version.id },
      });
      message.success(`版本 ${version.versionCode} 已发布`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setPublishingVersionId(null);
    }
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

  const handleTriggerExecution = async (version: WorkflowVersionDto) => {
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
  };

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
          <Button type="primary" onClick={() => setCreateVisible(true)}>
            新建流程
          </Button>
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
          form.resetFields();
        }}
        extra={
          <Space>
            <Button
              onClick={() => {
                setCreateVisible(false);
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
            mode: 'LINEAR',
            usageMethod: 'COPILOT',
            defaultTimeoutMs: 30000,
            defaultRetryCount: 1,
            defaultRetryBackoffMs: 2000,
            defaultOnError: 'FAIL_FAST',
          }}
        >
          <Form.Item
            label="流程编码"
            name="workflowId"
            rules={[
              { required: true, message: '请输入流程编码' },
              { pattern: /^[a-zA-Z0-9_-]{3,100}$/, message: '仅支持字母、数字、下划线和中划线' },
            ]}
          >
            <Input placeholder="例如: wf_corn_morning_linear" />
          </Form.Item>
          <Form.Item
            label="流程名称"
            name="name"
            rules={[{ required: true, message: '请输入流程名称' }]}
          >
            <Input placeholder="例如: 玉米晨间线性决策" />
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
            label="默认 Agent 绑定（可选）"
            name="defaultAgentBindingsText"
            extra="多个编码用逗号分隔，例如 MARKET_ANALYST_V1,RISK_OFFICER_V1"
          >
            <Input placeholder="AGENT_CODE_1,AGENT_CODE_2" />
          </Form.Item>
          <Form.Item
            label="默认参数包绑定（可选）"
            name="defaultParamSetBindingsText"
            extra="多个编码用逗号分隔，例如 BASELINE_SET,VOLATILE_SET"
          >
            <Input placeholder="SET_CODE_1,SET_CODE_2" />
          </Form.Item>
          <Form.Item
            label="默认连接器绑定（可选）"
            name="defaultDataConnectorBindingsText"
            extra="多个编码用逗号分隔，例如 INTERNAL_PRICE_DATA,EXTERNAL_FUTURES_API"
          >
            <Input placeholder="CONNECTOR_CODE_1,CONNECTOR_CODE_2" />
          </Form.Item>
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
        </Form>
      </Drawer>

      <Drawer
        title={`版本列表 - ${selectedDefinition?.name || ''}`}
        open={versionVisible}
        width={920}
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
                '正在加载规则包、参数包与 Agent 目录。'
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

      <Drawer
        title={`Workflow Studio - ${studioVersion?.versionCode || ''}`}
        open={studioVisible}
        width="92vw"
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
