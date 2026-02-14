import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DebateRoundTraceDto,
  NodeExecutionDto,
  WorkflowFailureCategory,
  WorkflowRiskDegradeAction,
  WorkflowRiskLevel,
  WorkflowExecutionStatus,
  WorkflowRuntimeEventLevel,
  WorkflowTriggerType,
} from '@packages/types';
import {
  useCancelWorkflowExecution,
  WorkflowExecutionDetail,
  WorkflowExecutionWithRelations,
  useRerunWorkflowExecution,
  useWorkflowExecutionTimeline,
  useWorkflowExecutionDebateTimeline,
  useWorkflowExecutionDebateTraces,
  useWorkflowExecutionDetail,
  useWorkflowExecutions,
} from '../api';
import { useWorkflowDefinitions } from '../../workflow-studio/api';
import { getAgentRoleLabel, getTemplateSourceLabel } from '../../workflow-agent-center/constants';
import { getErrorMessage } from '../../../api/client';
import { useSearchParams } from 'react-router-dom';

type WorkflowBindingEntity = {
  id: string;
  version: number;
} & Record<string, unknown>;

type WorkflowBindingSnapshot = {
  workflowBindings?: {
    agentBindings?: string[];
    paramSetBindings?: string[];
    dataConnectorBindings?: string[];
  };
  resolvedBindings?: {
    agents?: WorkflowBindingEntity[];
    parameterSets?: WorkflowBindingEntity[];
    dataConnectors?: WorkflowBindingEntity[];
  };
  unresolvedBindings?: {
    agents?: string[];
    parameterSets?: string[];
    dataConnectors?: string[];
  };
};

const getBindingCode = (record: WorkflowBindingEntity): string =>
  readString(record.agentCode) ||
  readString(record.setCode) ||
  readString(record.connectorCode) ||
  '-';

const getBindingType = (record: WorkflowBindingEntity): string => {
  const roleType = readString(record.roleType);
  if (roleType) {
    return getAgentRoleLabel(roleType);
  }
  return readString(record.connectorType) || '-';
};

const getBindingSource = (record: WorkflowBindingEntity): string => {
  const templateSource = readString(record.templateSource);
  if (templateSource) {
    return getTemplateSourceLabel(templateSource);
  }
  return readString(record.ownerType) || '-';
};

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const toObjectRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const getNodeRouteHint = (
  nodeExecution: NodeExecutionDto,
): { label: string; color: string } | null => {
  const outputSnapshot = toObjectRecord(nodeExecution.outputSnapshot);
  if (!outputSnapshot) {
    return null;
  }

  const skipType = outputSnapshot.skipType;
  if (skipType === 'ROUTE_TO_ERROR') {
    return { label: '错误分支跳过', color: 'warning' };
  }

  const meta = toObjectRecord(outputSnapshot._meta);
  if (meta?.onErrorRouting === 'ROUTE_TO_ERROR') {
    return { label: '触发错误分支', color: 'magenta' };
  }

  return null;
};

const getNodeAttempts = (nodeExecution: NodeExecutionDto): number | null => {
  const outputSnapshot = toObjectRecord(nodeExecution.outputSnapshot);
  if (!outputSnapshot) {
    return null;
  }
  const meta = toObjectRecord(outputSnapshot._meta);
  return typeof meta?.attempts === 'number' ? meta.attempts : null;
};

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
};

const readBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
};

const parseBindingSnapshot = (value: unknown): WorkflowBindingSnapshot | null => {
  const record = toObjectRecord(value);
  if (!record) {
    return null;
  }
  return record as WorkflowBindingSnapshot;
};

const normalizeOptionalText = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const parseBooleanParam = (value: string | null): boolean | undefined => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
};

const parsePositiveIntParam = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parseStartedAtRangeParam = (
  startedAtFrom: string | null,
  startedAtTo: string | null,
): [Dayjs, Dayjs] | null => {
  if (!startedAtFrom || !startedAtTo) {
    return null;
  }
  const from = dayjs(startedAtFrom);
  const to = dayjs(startedAtTo);
  if (!from.isValid() || !to.isValid()) {
    return null;
  }
  return [from, to];
};

const parseWorkflowExecutionStatusParam = (
  value: string | null,
): WorkflowExecutionStatus | undefined => {
  if (
    value === 'PENDING' ||
    value === 'RUNNING' ||
    value === 'SUCCESS' ||
    value === 'FAILED' ||
    value === 'CANCELED'
  ) {
    return value;
  }
  return undefined;
};

const parseWorkflowTriggerTypeParam = (value: string | null): WorkflowTriggerType | undefined => {
  if (
    value === 'MANUAL' ||
    value === 'API' ||
    value === 'SCHEDULE' ||
    value === 'EVENT' ||
    value === 'ON_DEMAND'
  ) {
    return value;
  }
  return undefined;
};

const parseWorkflowRiskLevelParam = (value: string | null): WorkflowRiskLevel | undefined => {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'EXTREME') {
    return value;
  }
  return undefined;
};

const runtimeEventLevelLabelMap: Record<WorkflowRuntimeEventLevel, string> = {
  INFO: '信息',
  WARN: '警告',
  ERROR: '错误',
};

const parseWorkflowRiskDegradeActionParam = (
  value: string | null,
): WorkflowRiskDegradeAction | undefined => {
  if (value === 'HOLD' || value === 'REDUCE' || value === 'REVIEW_ONLY') {
    return value;
  }
  return undefined;
};

const parseWorkflowFailureCategoryParam = (
  value: string | null,
): WorkflowFailureCategory | undefined => {
  if (
    value === 'VALIDATION' ||
    value === 'EXECUTOR' ||
    value === 'TIMEOUT' ||
    value === 'CANCELED' ||
    value === 'INTERNAL'
  ) {
    return value;
  }
  return undefined;
};

type RiskGateSummary = {
  summarySchemaVersion: string | null;
  riskLevel: string | null;
  passed: boolean | null;
  blocked: boolean | null;
  blockReason: string | null;
  degradeAction: string | null;
  blockers: string[];
  blockerCount: number | null;
  riskProfileCode: string | null;
  threshold: string | null;
  blockedByRiskLevel: boolean | null;
  hardBlock: boolean | null;
  riskEvaluatedAt: string | null;
};

type RiskGateSummaryConsistency = {
  hasRiskGateNode: boolean;
  hasExecutionSummary: boolean;
  mismatchFields: string[];
};

type WorkflowRuntimeTimelineRow = {
  id: string;
  eventType: string;
  level: WorkflowRuntimeEventLevel;
  message: string;
  occurredAt?: Date | string;
  nodeExecutionId?: string | null;
};

const parseRiskGateSummaryRecord = (
  raw: Record<string, unknown> | null,
): RiskGateSummary | null => {
  if (!raw) {
    return null;
  }

  const meta = toObjectRecord(raw._meta);
  const riskGateMeta = toObjectRecord(meta?.riskGate);
  const blockers = readStringArray(raw.blockers);
  const blockerCount = readNumber(raw.blockerCount);

  return {
    summarySchemaVersion: readString(raw.summarySchemaVersion),
    riskLevel: readString(raw.riskLevel),
    passed: readBoolean(raw.riskGatePassed),
    blocked: readBoolean(raw.riskGateBlocked),
    blockReason: readString(raw.blockReason),
    degradeAction: readString(raw.degradeAction),
    blockers,
    blockerCount: blockerCount ?? blockers.length,
    riskProfileCode: readString(raw.riskProfileCode) ?? readString(riskGateMeta?.riskProfileCode),
    threshold: readString(raw.threshold) ?? readString(riskGateMeta?.threshold),
    blockedByRiskLevel:
      readBoolean(raw.blockedByRiskLevel) ?? readBoolean(riskGateMeta?.blockedByRiskLevel),
    hardBlock: readBoolean(raw.hardBlock) ?? readBoolean(riskGateMeta?.hardBlock),
    riskEvaluatedAt: readString(raw.riskEvaluatedAt),
  };
};

const getRiskGateSummary = (executionDetail?: WorkflowExecutionDetail): RiskGateSummary | null => {
  if (!executionDetail) {
    return null;
  }

  const executionOutput = toObjectRecord(executionDetail.outputSnapshot);
  const riskGateFromExecutionOutput = toObjectRecord(executionOutput?.riskGate);
  if (riskGateFromExecutionOutput) {
    return parseRiskGateSummaryRecord(riskGateFromExecutionOutput);
  }

  if (!executionDetail.nodeExecutions?.length) {
    return null;
  }

  const riskGateNodeExecution = [...executionDetail.nodeExecutions]
    .reverse()
    .find((item) => item.nodeType === 'risk-gate');
  if (!riskGateNodeExecution) {
    return null;
  }

  const outputSnapshot = toObjectRecord(riskGateNodeExecution.outputSnapshot);
  return parseRiskGateSummaryRecord(outputSnapshot);
};

const getExecutionOutputRiskGateSummary = (
  executionDetail?: WorkflowExecutionDetail,
): RiskGateSummary | null => {
  if (!executionDetail) {
    return null;
  }

  const executionOutput = toObjectRecord(executionDetail.outputSnapshot);
  const riskGate = toObjectRecord(executionOutput?.riskGate);
  return parseRiskGateSummaryRecord(riskGate);
};

const getLatestRiskGateNodeSummary = (
  executionDetail?: WorkflowExecutionDetail,
): RiskGateSummary | null => {
  if (!executionDetail?.nodeExecutions?.length) {
    return null;
  }

  const riskGateNodeExecution = [...executionDetail.nodeExecutions]
    .reverse()
    .find((item) => item.nodeType === 'risk-gate');

  if (!riskGateNodeExecution) {
    return null;
  }

  const outputSnapshot = toObjectRecord(riskGateNodeExecution.outputSnapshot);
  return parseRiskGateSummaryRecord(outputSnapshot);
};

const getRiskGateSummaryConsistency = (
  executionDetail?: WorkflowExecutionDetail,
): RiskGateSummaryConsistency => {
  const executionSummary = getExecutionOutputRiskGateSummary(executionDetail);
  const latestNodeSummary = getLatestRiskGateNodeSummary(executionDetail);

  if (!latestNodeSummary) {
    return {
      hasRiskGateNode: false,
      hasExecutionSummary: Boolean(executionSummary),
      mismatchFields: [],
    };
  }

  if (!executionSummary) {
    return {
      hasRiskGateNode: true,
      hasExecutionSummary: false,
      mismatchFields: [],
    };
  }

  const mismatchFields: string[] = [];
  if (executionSummary.riskLevel !== latestNodeSummary.riskLevel) {
    mismatchFields.push('riskLevel');
  }
  if (executionSummary.blocked !== latestNodeSummary.blocked) {
    mismatchFields.push('riskGateBlocked');
  }
  if (executionSummary.degradeAction !== latestNodeSummary.degradeAction) {
    mismatchFields.push('degradeAction');
  }
  if (executionSummary.blockReason !== latestNodeSummary.blockReason) {
    mismatchFields.push('blockReason');
  }

  return {
    hasRiskGateNode: true,
    hasExecutionSummary: true,
    mismatchFields,
  };
};

const getExecutionRiskGateSummary = (
  execution: WorkflowExecutionWithRelations,
): RiskGateSummary | null => {
  const executionOutput = toObjectRecord(execution.outputSnapshot);
  const riskGate = toObjectRecord(executionOutput?.riskGate);
  return parseRiskGateSummaryRecord(riskGate);
};

const buildRiskGateExportPayload = (summary: RiskGateSummary) => {
  return {
    summarySchemaVersion: summary.summarySchemaVersion,
    riskLevel: summary.riskLevel,
    riskGatePassed: summary.passed,
    riskGateBlocked: summary.blocked,
    blockReason: summary.blockReason,
    degradeAction: summary.degradeAction,
    blockers: summary.blockers,
    blockerCount: summary.blockerCount,
    riskProfileCode: summary.riskProfileCode,
    threshold: summary.threshold,
    blockedByRiskLevel: summary.blockedByRiskLevel,
    hardBlock: summary.hardBlock,
    riskEvaluatedAt: summary.riskEvaluatedAt,
  };
};

const riskLevelColorMap: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  EXTREME: 'red',
};

const riskLevelPriorityMap: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  EXTREME: 4,
};

const riskGateMismatchFieldLabelMap: Record<string, string> = {
  riskLevel: '风险等级',
  riskGateBlocked: '阻断标记',
  degradeAction: '降级动作',
  blockReason: '阻断原因',
};

const executionStatusColorMap: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELED: 'warning',
};

const workflowExecutionStatusLabelMap: Record<WorkflowExecutionStatus, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELED: '已取消',
};

const workflowTriggerTypeLabelMap: Record<WorkflowTriggerType, string> = {
  MANUAL: '手动触发',
  API: 'API 触发',
  SCHEDULE: '定时触发',
  EVENT: '事件触发',
  ON_DEMAND: '按需触发',
};

const workflowFailureCategoryLabelMap: Record<WorkflowFailureCategory, string> = {
  VALIDATION: '参数校验',
  EXECUTOR: '执行器异常',
  TIMEOUT: '超时',
  CANCELED: '已取消',
  INTERNAL: '内部错误',
};

const workflowRiskLevelLabelMap: Record<WorkflowRiskLevel, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  EXTREME: '极高',
};

const workflowRiskDegradeActionLabelMap: Record<WorkflowRiskDegradeAction, string> = {
  HOLD: '观望',
  REDUCE: '降仓',
  REVIEW_ONLY: '仅复核',
};

const nodeStatusLabelMap: Record<string, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  SKIPPED: '已跳过',
};

const nodeTypeLabelMap: Record<string, string> = {
  'manual-trigger': '手动触发',
  'cron-trigger': '定时触发',
  'event-trigger': '事件触发',
  'api-trigger': 'API 触发',
  'data-fetch': '数据采集',
  'futures-data-fetch': '期货数据采集',
  'report-fetch': '研报获取',
  'knowledge-fetch': '知识检索',
  'external-api-fetch': '外部 API 获取',
  'formula-calc': '公式计算',
  'feature-calc': '特征工程',
  'quantile-calc': '分位数',
  'rule-eval': '规则评估',
  'rule-pack-eval': '规则包评估',
  'alert-check': '告警检查',
  'agent-call': '智能体调用',
  'single-agent': '单智能体',
  'agent-group': '智能体组',
  'context-builder': '上下文构建',
  'debate-round': '辩论轮次',
  'judge-agent': '裁判智能体',
  'if-else': '条件分支',
  switch: '多路分支',
  'parallel-split': '并行拆分',
  join: '汇聚等待',
  'control-loop': '循环控制',
  'control-delay': '延时等待',
  'subflow-call': '子流程调用',
  'decision-merge': '决策合成',
  'risk-gate': '风控门禁',
  approval: '人工审批',
  notify: '消息通知',
  'report-generate': '报告生成',
  'dashboard-publish': '看板发布',
};

const getExecutionStatusLabel = (status?: WorkflowExecutionStatus | string | null): string => {
  if (!status) {
    return '-';
  }
  return workflowExecutionStatusLabelMap[status as WorkflowExecutionStatus] || status;
};

const getTriggerTypeLabel = (triggerType?: WorkflowTriggerType | string | null): string => {
  if (!triggerType) {
    return '-';
  }
  return workflowTriggerTypeLabelMap[triggerType as WorkflowTriggerType] || triggerType;
};

const getFailureCategoryLabel = (
  failureCategory?: WorkflowFailureCategory | string | null,
): string => {
  if (!failureCategory) {
    return '-';
  }
  return workflowFailureCategoryLabelMap[failureCategory as WorkflowFailureCategory] || failureCategory;
};

const getRiskLevelLabel = (riskLevel?: WorkflowRiskLevel | string | null): string => {
  if (!riskLevel) {
    return '-';
  }
  return workflowRiskLevelLabelMap[riskLevel as WorkflowRiskLevel] || riskLevel;
};

const getDegradeActionLabel = (
  degradeAction?: WorkflowRiskDegradeAction | string | null,
): string => {
  if (!degradeAction) {
    return '-';
  }
  return workflowRiskDegradeActionLabelMap[degradeAction as WorkflowRiskDegradeAction] || degradeAction;
};

const getNodeStatusLabel = (status?: string | null): string => {
  if (!status) {
    return '-';
  }
  return nodeStatusLabelMap[status] || status;
};

const getNodeTypeLabel = (nodeType?: string | null): string => {
  if (!nodeType) {
    return '-';
  }
  return nodeTypeLabelMap[nodeType] || nodeType;
};

const nodeStatusColorMap: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
};

const executionStatusOptions: { label: string; value: WorkflowExecutionStatus }[] = [
  { label: '等待中', value: 'PENDING' },
  { label: '运行中', value: 'RUNNING' },
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELED' },
];

const triggerTypeOptions: { label: string; value: WorkflowTriggerType }[] = [
  { label: '手动触发', value: 'MANUAL' },
  { label: 'API 触发', value: 'API' },
  { label: '定时触发', value: 'SCHEDULE' },
  { label: '事件触发', value: 'EVENT' },
  { label: '按需触发', value: 'ON_DEMAND' },
];

const failureCategoryOptions: { label: string; value: WorkflowFailureCategory }[] = [
  { label: '参数校验', value: 'VALIDATION' },
  { label: '执行器异常', value: 'EXECUTOR' },
  { label: '超时', value: 'TIMEOUT' },
  { label: '已取消', value: 'CANCELED' },
  { label: '内部错误', value: 'INTERNAL' },
];

const runtimeEventLevelColorMap: Record<WorkflowRuntimeEventLevel, string> = {
  INFO: 'default',
  WARN: 'warning',
  ERROR: 'error',
};

const riskLevelOptions: { label: string; value: WorkflowRiskLevel }[] = [
  { label: '低', value: 'LOW' },
  { label: '中', value: 'MEDIUM' },
  { label: '高', value: 'HIGH' },
  { label: '极高', value: 'EXTREME' },
];

const degradeActionOptions: { label: string; value: WorkflowRiskDegradeAction }[] = [
  { label: '观望', value: 'HOLD' },
  { label: '降仓', value: 'REDUCE' },
  { label: '仅复核', value: 'REVIEW_ONLY' },
];

const riskGatePresenceOptions: { label: string; value: boolean }[] = [
  { label: '有风控链路', value: true },
  { label: '无风控链路', value: false },
];

const riskSummaryPresenceOptions: { label: string; value: boolean }[] = [
  { label: '摘要存在', value: true },
  { label: '摘要缺失', value: false },
];

const getRiskGateSortScore = (summary: RiskGateSummary | null): number => {
  if (!summary) {
    return 0;
  }

  const blockedScore = summary.blocked ? 100 : 0;
  const riskLevelScore = summary.riskLevel ? riskLevelPriorityMap[summary.riskLevel] || 0 : 0;
  return blockedScore + riskLevelScore;
};

export const WorkflowExecutionPage: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [selectedWorkflowDefinitionId, setSelectedWorkflowDefinitionId] = useState<
    string | undefined
  >(() => normalizeOptionalText(searchParams.get('workflowDefinitionId')));
  const [selectedStatus, setSelectedStatus] = useState<WorkflowExecutionStatus | undefined>(() =>
    parseWorkflowExecutionStatusParam(searchParams.get('status')),
  );
  const [selectedFailureCategory, setSelectedFailureCategory] = useState<
    WorkflowFailureCategory | undefined
  >(() => parseWorkflowFailureCategoryParam(searchParams.get('failureCategory')));
  const [failureCodeInput, setFailureCodeInput] = useState(
    () => normalizeOptionalText(searchParams.get('failureCode')) || '',
  );
  const [failureCode, setFailureCode] = useState<string | undefined>(() =>
    normalizeOptionalText(searchParams.get('failureCode')),
  );
  const [selectedTriggerType, setSelectedTriggerType] = useState<WorkflowTriggerType | undefined>(
    () => parseWorkflowTriggerTypeParam(searchParams.get('triggerType')),
  );
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<WorkflowRiskLevel | undefined>(() =>
    parseWorkflowRiskLevelParam(searchParams.get('riskLevel')),
  );
  const [selectedDegradeAction, setSelectedDegradeAction] = useState<
    WorkflowRiskDegradeAction | undefined
  >(() => parseWorkflowRiskDegradeActionParam(searchParams.get('degradeAction')));
  const [selectedRiskGatePresence, setSelectedRiskGatePresence] = useState<boolean | undefined>(
    () => parseBooleanParam(searchParams.get('hasRiskGateNode')),
  );
  const [selectedRiskSummaryPresence, setSelectedRiskSummaryPresence] = useState<
    boolean | undefined
  >(() => parseBooleanParam(searchParams.get('hasRiskSummary')));
  const [riskProfileCodeInput, setRiskProfileCodeInput] = useState(
    () => normalizeOptionalText(searchParams.get('riskProfileCode')) || '',
  );
  const [riskProfileCode, setRiskProfileCode] = useState<string | undefined>(() =>
    normalizeOptionalText(searchParams.get('riskProfileCode')),
  );
  const [riskReasonKeywordInput, setRiskReasonKeywordInput] = useState(
    () => normalizeOptionalText(searchParams.get('riskReasonKeyword')) || '',
  );
  const [riskReasonKeyword, setRiskReasonKeyword] = useState<string | undefined>(() =>
    normalizeOptionalText(searchParams.get('riskReasonKeyword')),
  );
  const [versionCodeInput, setVersionCodeInput] = useState(
    () => normalizeOptionalText(searchParams.get('versionCode')) || '',
  );
  const [versionCode, setVersionCode] = useState<string | undefined>(() =>
    normalizeOptionalText(searchParams.get('versionCode')),
  );
  const [keywordInput, setKeywordInput] = useState(
    () => normalizeOptionalText(searchParams.get('keyword')) || '',
  );
  const [keyword, setKeyword] = useState<string | undefined>(() =>
    normalizeOptionalText(searchParams.get('keyword')),
  );
  const [startedAtRange, setStartedAtRange] = useState<[Dayjs, Dayjs] | null>(() =>
    parseStartedAtRangeParam(searchParams.get('startedAtFrom'), searchParams.get('startedAtTo')),
  );
  const [onlySoftFailure, setOnlySoftFailure] = useState(
    () => parseBooleanParam(searchParams.get('hasSoftFailure')) === true,
  );
  const [onlyErrorRoute, setOnlyErrorRoute] = useState(
    () => parseBooleanParam(searchParams.get('hasErrorRoute')) === true,
  );
  const [onlyRiskBlocked, setOnlyRiskBlocked] = useState(
    () => parseBooleanParam(searchParams.get('hasRiskBlocked')) === true,
  );
  const [rerunningExecutionId, setRerunningExecutionId] = useState<string | null>(null);
  const [cancelingExecutionId, setCancelingExecutionId] = useState<string | null>(null);
  const [page, setPage] = useState(() => parsePositiveIntParam(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(() =>
    parsePositiveIntParam(searchParams.get('pageSize'), 20),
  );
  const [timelineEventTypeInput, setTimelineEventTypeInput] = useState('');
  const [timelineEventType, setTimelineEventType] = useState<string | undefined>();
  const [timelineLevel, setTimelineLevel] = useState<WorkflowRuntimeEventLevel | undefined>();
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(20);
  const [debateRoundNumber, setDebateRoundNumber] = useState<number | undefined>();
  const [debateParticipantCode, setDebateParticipantCode] = useState<string | undefined>();
  const [debateParticipantRole, setDebateParticipantRole] = useState<string | undefined>();
  const [debateKeyword, setDebateKeyword] = useState<string | undefined>();
  const [debateJudgementOnly, setDebateJudgementOnly] = useState(false);

  const { data: definitionPage } = useWorkflowDefinitions({
    includePublic: true,
    page: 1,
    pageSize: 200,
  });
  const executionQuery = useMemo(
    () => ({
      workflowDefinitionId: selectedWorkflowDefinitionId,
      versionCode,
      triggerType: selectedTriggerType,
      status: selectedStatus,
      failureCategory: selectedFailureCategory,
      failureCode,
      riskLevel: selectedRiskLevel,
      degradeAction: selectedDegradeAction,
      riskProfileCode,
      riskReasonKeyword,
      hasRiskGateNode: selectedRiskGatePresence,
      hasRiskSummary: selectedRiskSummaryPresence,
      hasSoftFailure: onlySoftFailure ? true : undefined,
      hasErrorRoute: onlyErrorRoute ? true : undefined,
      hasRiskBlocked: onlyRiskBlocked ? true : undefined,
      keyword,
      startedAtFrom: startedAtRange?.[0]?.startOf('day').toISOString(),
      startedAtTo: startedAtRange?.[1]?.endOf('day').toISOString(),
      page,
      pageSize,
    }),
    [
      selectedWorkflowDefinitionId,
      versionCode,
      selectedTriggerType,
      selectedStatus,
      selectedFailureCategory,
      failureCode,
      selectedRiskLevel,
      selectedDegradeAction,
      riskProfileCode,
      riskReasonKeyword,
      selectedRiskGatePresence,
      selectedRiskSummaryPresence,
      onlySoftFailure,
      onlyErrorRoute,
      onlyRiskBlocked,
      keyword,
      startedAtRange,
      page,
      pageSize,
    ],
  );
  const searchParamsText = searchParams.toString();

  useEffect(() => {
    const next = new URLSearchParams();
    const setQuery = (key: string, value?: string | number | boolean) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      next.set(key, String(value));
    };

    setQuery('workflowDefinitionId', selectedWorkflowDefinitionId);
    setQuery('versionCode', versionCode);
    setQuery('triggerType', selectedTriggerType);
    setQuery('status', selectedStatus);
    setQuery('failureCategory', selectedFailureCategory);
    setQuery('failureCode', failureCode);
    setQuery('riskLevel', selectedRiskLevel);
    setQuery('degradeAction', selectedDegradeAction);
    setQuery('riskProfileCode', riskProfileCode);
    setQuery('riskReasonKeyword', riskReasonKeyword);
    if (selectedRiskGatePresence !== undefined) {
      setQuery('hasRiskGateNode', selectedRiskGatePresence);
    }
    if (selectedRiskSummaryPresence !== undefined) {
      setQuery('hasRiskSummary', selectedRiskSummaryPresence);
    }
    if (onlySoftFailure) {
      setQuery('hasSoftFailure', true);
    }
    if (onlyErrorRoute) {
      setQuery('hasErrorRoute', true);
    }
    if (onlyRiskBlocked) {
      setQuery('hasRiskBlocked', true);
    }
    setQuery('keyword', keyword);
    if (startedAtRange) {
      setQuery('startedAtFrom', startedAtRange[0].startOf('day').toISOString());
      setQuery('startedAtTo', startedAtRange[1].endOf('day').toISOString());
    }
    if (page !== 1) {
      setQuery('page', page);
    }
    if (pageSize !== 20) {
      setQuery('pageSize', pageSize);
    }

    const nextText = next.toString();
    if (nextText !== searchParamsText) {
      setSearchParams(next, { replace: true });
    }
  }, [
    selectedWorkflowDefinitionId,
    versionCode,
    selectedTriggerType,
    selectedStatus,
    selectedFailureCategory,
    failureCode,
    selectedRiskLevel,
    selectedDegradeAction,
    riskProfileCode,
    riskReasonKeyword,
    selectedRiskGatePresence,
    selectedRiskSummaryPresence,
    onlySoftFailure,
    onlyErrorRoute,
    onlyRiskBlocked,
    keyword,
    startedAtRange,
    page,
    pageSize,
    searchParamsText,
    setSearchParams,
  ]);

  const { data: executionPage, isLoading } = useWorkflowExecutions(executionQuery);
  const rerunMutation = useRerunWorkflowExecution();
  const cancelMutation = useCancelWorkflowExecution();
  const { data: executionDetail, isLoading: isDetailLoading } = useWorkflowExecutionDetail(
    selectedExecutionId || undefined,
  );
  const { data: executionTimeline, isLoading: isTimelineLoading } = useWorkflowExecutionTimeline(
    selectedExecutionId || undefined,
    {
      eventType: timelineEventType,
      level: timelineLevel,
      page: timelinePage,
      pageSize: timelinePageSize,
    },
  );
  const { data: debateTimeline, isLoading: isDebateTimelineLoading } =
    useWorkflowExecutionDebateTimeline(selectedExecutionId || undefined);
  const { data: debateTraces, isLoading: isDebateTracesLoading } = useWorkflowExecutionDebateTraces(
    selectedExecutionId || undefined,
    {
      roundNumber: debateRoundNumber,
      participantCode: debateParticipantCode,
      participantRole: debateParticipantRole,
      keyword: debateKeyword,
      isJudgement: debateJudgementOnly ? true : undefined,
    },
  );
  useEffect(() => {
    setTimelineEventTypeInput('');
    setTimelineEventType(undefined);
    setTimelineLevel(undefined);
    setTimelinePage(1);
    setTimelinePageSize(20);
    setDebateRoundNumber(undefined);
    setDebateParticipantCode(undefined);
    setDebateParticipantRole(undefined);
    setDebateKeyword(undefined);
    setDebateJudgementOnly(false);
  }, [selectedExecutionId]);
  const riskGateSummary = useMemo(() => getRiskGateSummary(executionDetail), [executionDetail]);
  const executionOutputRiskGateSummary = useMemo(
    () => getExecutionOutputRiskGateSummary(executionDetail),
    [executionDetail],
  );
  const latestRiskGateNodeSummary = useMemo(
    () => getLatestRiskGateNodeSummary(executionDetail),
    [executionDetail],
  );
  const riskGateSummaryConsistency = useMemo(
    () => getRiskGateSummaryConsistency(executionDetail),
    [executionDetail],
  );
  const riskGateMismatchFieldLabels = useMemo(
    () =>
      riskGateSummaryConsistency.mismatchFields.map(
        (field) => riskGateMismatchFieldLabelMap[field] || field,
      ),
    [riskGateSummaryConsistency.mismatchFields],
  );
  const executionOutputRiskGateSummaryJson = useMemo(
    () =>
      executionOutputRiskGateSummary
        ? JSON.stringify(buildRiskGateExportPayload(executionOutputRiskGateSummary), null, 2)
        : null,
    [executionOutputRiskGateSummary],
  );
  const latestRiskGateNodeSummaryJson = useMemo(
    () =>
      latestRiskGateNodeSummary
        ? JSON.stringify(buildRiskGateExportPayload(latestRiskGateNodeSummary), null, 2)
        : null,
    [latestRiskGateNodeSummary],
  );
  const riskGateSummaryJson = useMemo(
    () =>
      riskGateSummary ? JSON.stringify(buildRiskGateExportPayload(riskGateSummary), null, 2) : null,
    [riskGateSummary],
  );
  const workflowBindingSnapshotJson = useMemo(() => {
    const paramSnapshot = toObjectRecord(executionDetail?.paramSnapshot);
    const bindingSnapshot = parseBindingSnapshot(paramSnapshot?._workflowBindings);
    if (!bindingSnapshot) {
      return null;
    }
    return JSON.stringify(bindingSnapshot, null, 2);
  }, [executionDetail?.paramSnapshot]);
  const workflowBindingSnapshot = useMemo(() => {
    const paramSnapshot = toObjectRecord(executionDetail?.paramSnapshot);
    return parseBindingSnapshot(paramSnapshot?._workflowBindings);
  }, [executionDetail?.paramSnapshot]);
  const debateRounds = useMemo(() => debateTimeline?.rounds || [], [debateTimeline?.rounds]);
  const debateTraceData = useMemo(() => debateTraces || [], [debateTraces]);
  const resolvedAgents = useMemo(
    () => (workflowBindingSnapshot?.resolvedBindings?.agents || []) as WorkflowBindingEntity[],
    [workflowBindingSnapshot?.resolvedBindings?.agents],
  );
  const resolvedParameterSets = useMemo(
    () =>
      (workflowBindingSnapshot?.resolvedBindings?.parameterSets || []) as WorkflowBindingEntity[],
    [workflowBindingSnapshot?.resolvedBindings?.parameterSets],
  );
  const resolvedDataConnectors = useMemo(
    () =>
      (workflowBindingSnapshot?.resolvedBindings?.dataConnectors || []) as WorkflowBindingEntity[],
    [workflowBindingSnapshot?.resolvedBindings?.dataConnectors],
  );
  const bindingColumns = useMemo<ColumnsType<WorkflowBindingEntity>>(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 280,
      },
      {
        title: '版本',
        dataIndex: 'version',
        width: 90,
      },
      {
        title: '主键编码',
        key: 'code',
        render: (_, record) => getBindingCode(record),
      },
      {
        title: '类型信息',
        key: 'bindingType',
        width: 160,
        render: (_, record) => getBindingType(record),
      },
      {
        title: '来源',
        key: 'bindingSource',
        width: 120,
        render: (_, record) => getBindingSource(record),
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        render: (_, record) => {
          const code = getBindingCode(record);
          return (
            <Button
              type="link"
              size="small"
              disabled={code === '-'}
              onClick={async () => {
                if (code === '-') {
                  return;
                }
                try {
                  await navigator.clipboard.writeText(code);
                  message.success('绑定编码已复制');
                } catch {
                  message.warning('复制失败，请手动复制');
                }
              }}
            >
              复制编码
            </Button>
          );
        },
      },
    ],
    [message],
  );

  const handleRerun = async (executionId: string) => {
    try {
      setRerunningExecutionId(executionId);
      const rerunExecution = await rerunMutation.mutateAsync(executionId);
      message.success(`重跑成功，实例 ID: ${rerunExecution.id.slice(0, 8)}`);
      setSelectedExecutionId(rerunExecution.id);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setRerunningExecutionId(null);
    }
  };

  const handleCancel = async (executionId: string) => {
    try {
      setCancelingExecutionId(executionId);
      const canceledExecution = await cancelMutation.mutateAsync({
        executionId,
        reason: '页面手动取消',
      });
      message.success(`已取消实例 ${canceledExecution.id.slice(0, 8)}`);
      setSelectedExecutionId(canceledExecution.id);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setCancelingExecutionId(null);
    }
  };

  const workflowDefinitionOptions = useMemo(
    () =>
      (definitionPage?.data || []).map((item) => ({
        label: `${item.name} (${item.workflowId})`,
        value: item.id,
      })),
    [definitionPage?.data],
  );

  const timelineColumns = useMemo<ColumnsType<WorkflowRuntimeTimelineRow>>(
    () => [
      {
        title: '时间',
        dataIndex: 'occurredAt',
        width: 190,
        render: (value?: Date | string) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
      },
      {
        title: '级别',
        dataIndex: 'level',
        width: 100,
        render: (value: WorkflowRuntimeEventLevel) => (
          <Tag color={runtimeEventLevelColorMap[value] ?? 'default'}>
            {runtimeEventLevelLabelMap[value] || value}
          </Tag>
        ),
      },
      {
        title: '事件类型',
        dataIndex: 'eventType',
        width: 220,
      },
      {
        title: '消息',
        dataIndex: 'message',
      },
      {
        title: '节点执行',
        dataIndex: 'nodeExecutionId',
        width: 120,
        render: (value?: string | null) => (value ? value.slice(0, 8) : '-'),
      },
    ],
    [],
  );
  const debateTraceColumns = useMemo<ColumnsType<DebateRoundTraceDto>>(
    () => [
      {
        title: '轮次',
        dataIndex: 'roundNumber',
        width: 80,
      },
      {
        title: '参与者',
        dataIndex: 'participantCode',
        width: 160,
      },
      {
        title: '角色',
        dataIndex: 'participantRole',
        width: 140,
        render: (value: string) => getAgentRoleLabel(value),
      },
      {
        title: '置信度',
        dataIndex: 'confidence',
        width: 100,
        render: (value?: number | null) => (typeof value === 'number' ? value.toFixed(3) : '-'),
      },
      {
        title: '裁决',
        dataIndex: 'isJudgement',
        width: 90,
        render: (value: boolean) => (value ? <Tag color="purple">裁判</Tag> : '-'),
      },
      {
        title: '发言摘要',
        dataIndex: 'statementText',
        render: (value: string) => <Text ellipsis={{ tooltip: value }}>{value}</Text>,
      },
    ],
    [],
  );
  const debateRoundCollapseItems = useMemo(
    () =>
      debateRounds.map((round) => ({
        key: String(round.roundNumber),
        label: `第 ${round.roundNumber} 轮 · 参与者 ${round.roundSummary.participantCount} · 裁决 ${round.roundSummary.hasJudgement ? '是' : '否'
          } · 平均置信度 ${typeof round.roundSummary.avgConfidence === 'number'
            ? round.roundSummary.avgConfidence.toFixed(3)
            : '-'
          }`,
        children: (
          <Table
            rowKey="id"
            columns={debateTraceColumns}
            dataSource={round.entries}
            pagination={false}
            size="small"
          />
        ),
      })),
    [debateRounds, debateTraceColumns],
  );
  const timelineData = useMemo(
    () => executionTimeline?.data || executionDetail?.runtimeEvents || [],
    [executionTimeline?.data, executionDetail?.runtimeEvents],
  );

  const executionColumns = useMemo<ColumnsType<WorkflowExecutionWithRelations>>(
    () => [
      {
        title: '实例 ID',
        dataIndex: 'id',
        width: 220,
        render: (value: string) => value.slice(0, 8),
      },
      {
        title: '流程',
        key: 'workflow',
        width: 260,
        render: (_, record) =>
          record.workflowVersion?.workflowDefinition?.name ||
          record.workflowVersion?.workflowDefinition?.workflowId ||
          '-',
      },
      {
        title: '版本',
        key: 'version',
        width: 120,
        render: (_, record) => record.workflowVersion?.versionCode || '-',
      },
      {
        title: '触发类型',
        dataIndex: 'triggerType',
        width: 120,
        render: (value: string) => <Tag>{getTriggerTypeLabel(value)}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: WorkflowExecutionStatus) => (
          <Tag color={executionStatusColorMap[value] ?? 'default'}>
            {getExecutionStatusLabel(value)}
          </Tag>
        ),
      },
      {
        title: '失败分类',
        dataIndex: 'failureCategory',
        width: 130,
        render: (value?: WorkflowFailureCategory | null) => getFailureCategoryLabel(value),
      },
      {
        title: '失败代码',
        dataIndex: 'failureCode',
        width: 180,
        render: (value?: string | null) => value || '-',
      },
      {
        title: '风控',
        key: 'riskGate',
        width: 180,
        sorter: (recordA, recordB) =>
          getRiskGateSortScore(getExecutionRiskGateSummary(recordA)) -
          getRiskGateSortScore(getExecutionRiskGateSummary(recordB)),
        sortDirections: ['descend', 'ascend'],
        render: (_, record) => {
          const summary = getExecutionRiskGateSummary(record);
          if (!summary) {
            return '-';
          }

          return (
            <Space size={4}>
              {summary.riskLevel ? (
                <Tag color={riskLevelColorMap[summary.riskLevel] || 'default'}>
                  {getRiskLevelLabel(summary.riskLevel)}
                </Tag>
              ) : null}
              {summary.blocked ? (
                <Tooltip
                  title={
                    [
                      summary.blockReason ? `原因: ${summary.blockReason}` : null,
                      summary.blockers.length ? `阻断项: ${summary.blockers.join(', ')}` : null,
                      summary.degradeAction
                        ? `降级动作: ${getDegradeActionLabel(summary.degradeAction)}`
                        : null,
                      summary.threshold ? `阈值: ${summary.threshold}` : null,
                      summary.riskProfileCode ? `风控模板: ${summary.riskProfileCode}` : null,
                      summary.blockedByRiskLevel !== null
                        ? `等级触发: ${summary.blockedByRiskLevel ? '是' : '否'}`
                        : null,
                      summary.hardBlock !== null
                        ? `硬阻断: ${summary.hardBlock ? '是' : '否'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' | ') || '风控阻断'
                  }
                >
                  <Tag color="error">阻断</Tag>
                </Tooltip>
              ) : (
                <Tag color="success">通过</Tag>
              )}
            </Space>
          );
        },
      },
      {
        title: '阻断原因',
        key: 'blockReason',
        width: 260,
        render: (_, record) => {
          const summary = getExecutionRiskGateSummary(record);
          if (!summary?.blocked || !summary.blockReason) {
            return '-';
          }

          const tooltipTitle = [
            `原因: ${summary.blockReason}`,
            summary.blockers.length ? `阻断项: ${summary.blockers.join(', ')}` : null,
            summary.degradeAction
              ? `降级动作: ${getDegradeActionLabel(summary.degradeAction)}`
              : null,
            summary.threshold ? `阈值: ${summary.threshold}` : null,
            summary.riskProfileCode ? `风控模板: ${summary.riskProfileCode}` : null,
          ]
            .filter(Boolean)
            .join(' | ');

          return (
            <Tooltip title={tooltipTitle}>
              <Text style={{ maxWidth: 230 }} ellipsis>
                {summary.blockReason}
              </Text>
            </Tooltip>
          );
        },
      },
      {
        title: '降级动作',
        key: 'degradeAction',
        width: 140,
        render: (_, record) => {
          const summary = getExecutionRiskGateSummary(record);
          return getDegradeActionLabel(summary?.degradeAction);
        },
      },
      {
        title: '开始时间',
        dataIndex: 'startedAt',
        width: 180,
        render: (value?: Date | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '结束时间',
        dataIndex: 'completedAt',
        width: 180,
        render: (value?: Date | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '来源实例',
        dataIndex: 'sourceExecutionId',
        width: 120,
        render: (value?: string | null) => (value ? value.slice(0, 8) : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 280,
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => setSelectedExecutionId(record.id)}>
              查看详情
            </Button>
            <Button
              type="link"
              disabled={record.status !== 'FAILED'}
              loading={rerunMutation.isPending && rerunningExecutionId === record.id}
              onClick={() => handleRerun(record.id)}
            >
              失败重跑
            </Button>
            <Popconfirm
              title="确认取消该执行实例？"
              onConfirm={() => handleCancel(record.id)}
              disabled={record.status !== 'RUNNING' && record.status !== 'PENDING'}
            >
              <Button
                type="link"
                danger
                disabled={record.status !== 'RUNNING' && record.status !== 'PENDING'}
                loading={cancelMutation.isPending && cancelingExecutionId === record.id}
              >
                取消执行
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [rerunMutation.isPending, rerunningExecutionId, cancelMutation.isPending, cancelingExecutionId],
  );

  const nodeColumns = useMemo<ColumnsType<NodeExecutionDto>>(
    () => [
      {
        title: '节点 ID',
        dataIndex: 'nodeId',
        width: 180,
      },
      {
        title: '节点类型',
        dataIndex: 'nodeType',
        width: 180,
        render: (value: string) => getNodeTypeLabel(value),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => (
          <Tag color={nodeStatusColorMap[value] ?? 'default'}>{getNodeStatusLabel(value)}</Tag>
        ),
      },
      {
        title: '耗时(ms)',
        dataIndex: 'durationMs',
        width: 120,
        render: (value?: number | null) => value ?? '-',
      },
      {
        title: '尝试次数',
        key: 'attempts',
        width: 100,
        render: (_, record) => getNodeAttempts(record) ?? '-',
      },
      {
        title: '路径标记',
        key: 'routeHint',
        width: 160,
        render: (_, record) => {
          const hint = getNodeRouteHint(record);
          return hint ? <Tag color={hint.color}>{hint.label}</Tag> : '-';
        },
      },
      {
        title: '错误信息',
        dataIndex: 'errorMessage',
        render: (value?: string | null) => value || '-',
      },
    ],
    [],
  );

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>
            流程运行中心
          </Title>
          <Text type="secondary">查看流程运行实例、节点执行日志和失败原因。</Text>
        </div>

        <Space wrap>
          <Input.Search
            allowClear
            style={{ width: 220 }}
            placeholder="按版本号筛选"
            value={versionCodeInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setVersionCodeInput(nextValue);
              if (!nextValue.trim()) {
                setVersionCode(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setVersionCode(normalized ? normalized : undefined);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 220 }}
            placeholder="按风控模板编码筛选"
            value={riskProfileCodeInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setRiskProfileCodeInput(nextValue);
              if (!nextValue.trim()) {
                setRiskProfileCode(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setRiskProfileCode(normalized ? normalized : undefined);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 240 }}
            placeholder="按风控原因关键词筛选"
            value={riskReasonKeywordInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setRiskReasonKeywordInput(nextValue);
              if (!nextValue.trim()) {
                setRiskReasonKeyword(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setRiskReasonKeyword(normalized ? normalized : undefined);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 280 }}
            placeholder="关键词（流程/版本/实例）"
            value={keywordInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setKeywordInput(nextValue);
              if (!nextValue.trim()) {
                setKeyword(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setKeyword(normalized ? normalized : undefined);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ minWidth: 320 }}
            placeholder="按流程筛选"
            options={workflowDefinitionOptions}
            value={selectedWorkflowDefinitionId}
            onChange={(value) => {
              setSelectedWorkflowDefinitionId(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按状态筛选"
            options={executionStatusOptions}
            value={selectedStatus}
            onChange={(value) => {
              setSelectedStatus(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按失败分类筛选"
            options={failureCategoryOptions}
            value={selectedFailureCategory}
            onChange={(value) => {
              setSelectedFailureCategory(value);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            style={{ width: 220 }}
            placeholder="按失败代码筛选"
            value={failureCodeInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setFailureCodeInput(nextValue);
              if (!nextValue.trim()) {
                setFailureCode(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value.trim();
              setFailureCode(normalized ? normalized : undefined);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 190 }}
            placeholder="按触发类型筛选"
            options={triggerTypeOptions}
            value={selectedTriggerType}
            onChange={(value) => {
              setSelectedTriggerType(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按风险等级筛选"
            options={riskLevelOptions}
            value={selectedRiskLevel}
            onChange={(value) => {
              setSelectedRiskLevel(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按降级动作筛选"
            options={degradeActionOptions}
            value={selectedDegradeAction}
            onChange={(value) => {
              setSelectedDegradeAction(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按风控链路筛选"
            options={riskGatePresenceOptions}
            value={selectedRiskGatePresence}
            onChange={(value) => {
              setSelectedRiskGatePresence(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="按风控摘要筛选"
            options={riskSummaryPresenceOptions}
            value={selectedRiskSummaryPresence}
            onChange={(value) => {
              setSelectedRiskSummaryPresence(value);
              setPage(1);
            }}
          />
          <RangePicker
            showTime
            value={startedAtRange}
            onChange={(value) => {
              setStartedAtRange(value as [Dayjs, Dayjs] | null);
              setPage(1);
            }}
          />
          <Checkbox
            checked={onlySoftFailure}
            onChange={(event) => {
              setOnlySoftFailure(event.target.checked);
              setPage(1);
            }}
          >
            仅软失败
          </Checkbox>
          <Checkbox
            checked={onlyErrorRoute}
            onChange={(event) => {
              setOnlyErrorRoute(event.target.checked);
              setPage(1);
            }}
          >
            仅错误分支
          </Checkbox>
          <Checkbox
            checked={onlyRiskBlocked}
            onChange={(event) => {
              setOnlyRiskBlocked(event.target.checked);
              setPage(1);
            }}
          >
            仅风控阻断
          </Checkbox>
          <Button
            onClick={() => {
              setVersionCodeInput('');
              setVersionCode(undefined);
              setKeywordInput('');
              setKeyword(undefined);
              setSelectedWorkflowDefinitionId(undefined);
              setSelectedStatus(undefined);
              setSelectedFailureCategory(undefined);
              setFailureCodeInput('');
              setFailureCode(undefined);
              setSelectedTriggerType(undefined);
              setSelectedRiskLevel(undefined);
              setSelectedDegradeAction(undefined);
              setSelectedRiskGatePresence(undefined);
              setSelectedRiskSummaryPresence(undefined);
              setStartedAtRange(null);
              setOnlySoftFailure(false);
              setOnlyErrorRoute(false);
              setOnlyRiskBlocked(false);
              setRiskProfileCodeInput('');
              setRiskProfileCode(undefined);
              setRiskReasonKeywordInput('');
              setRiskReasonKeyword(undefined);
              setPage(1);
              setPageSize(20);
            }}
          >
            重置筛选
          </Button>
        </Space>

        <Table
          rowKey="id"
          loading={isLoading}
          columns={executionColumns}
          dataSource={executionPage?.data || []}
          pagination={{
            current: executionPage?.page || page,
            pageSize: executionPage?.pageSize || pageSize,
            total: executionPage?.total || 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          scroll={{ x: 1300 }}
        />
      </Space>

      <Drawer
        title={`运行详情 - ${selectedExecutionId?.slice(0, 8) || ''}`}
        width={1000}
        open={Boolean(selectedExecutionId)}
        onClose={() => setSelectedExecutionId(null)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {riskGateSummaryConsistency.hasRiskGateNode &&
            (!riskGateSummaryConsistency.hasExecutionSummary ||
              riskGateSummaryConsistency.mismatchFields.length) ? (
            <Alert
              type="warning"
              showIcon
              message="风控摘要一致性告警"
              description={
                !riskGateSummaryConsistency.hasExecutionSummary
                  ? '检测到 risk-gate 节点执行记录，但实例 outputSnapshot.riskGate 缺失。'
                  : `实例 outputSnapshot.riskGate 与最新 risk-gate 节点摘要不一致（字段：${riskGateMismatchFieldLabels.join(
                    ', ',
                  )}）。`
              }
            />
          ) : null}
          {riskGateSummaryConsistency.hasRiskGateNode &&
            (!riskGateSummaryConsistency.hasExecutionSummary ||
              riskGateSummaryConsistency.mismatchFields.length) ? (
            <Card size="small" title="风控摘要比对">
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <Text type="secondary">实例摘要（outputSnapshot.riskGate）</Text>
                  <Paragraph
                    copyable={{ text: executionOutputRiskGateSummaryJson || 'null' }}
                    style={{ marginBottom: 0 }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {executionOutputRiskGateSummaryJson || 'null'}
                    </pre>
                  </Paragraph>
                </div>
                <div>
                  <Text type="secondary">节点摘要（最新 risk-gate 输出）</Text>
                  <Paragraph
                    copyable={{ text: latestRiskGateNodeSummaryJson || 'null' }}
                    style={{ marginBottom: 0 }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {latestRiskGateNodeSummaryJson || 'null'}
                    </pre>
                  </Paragraph>
                </div>
              </Space>
            </Card>
          ) : null}
          <Descriptions
            column={2}
            bordered
            size="small"
            items={[
              {
                key: 'workflow',
                label: '流程',
                children: executionDetail?.workflowVersion?.workflowDefinition?.name || '-',
              },
              {
                key: 'version',
                label: '版本',
                children: executionDetail?.workflowVersion?.versionCode || '-',
              },
              {
                key: 'triggerType',
                label: '触发类型',
                children: getTriggerTypeLabel(executionDetail?.triggerType),
              },
              {
                key: 'sourceExecutionId',
                label: '来源实例',
                children: executionDetail?.sourceExecutionId
                  ? executionDetail.sourceExecutionId.slice(0, 8)
                  : '-',
              },
              {
                key: 'status',
                label: '执行状态',
                children: executionDetail?.status ? (
                  <Tag color={executionStatusColorMap[executionDetail.status] ?? 'default'}>
                    {getExecutionStatusLabel(executionDetail.status)}
                  </Tag>
                ) : (
                  '-'
                ),
              },
              {
                key: 'failureCategory',
                label: '失败分类',
                children: getFailureCategoryLabel(executionDetail?.failureCategory),
              },
              {
                key: 'failureCode',
                label: '失败代码',
                children: executionDetail?.failureCode || '-',
              },
              {
                key: 'startedAt',
                label: '开始时间',
                children: executionDetail?.startedAt
                  ? dayjs(executionDetail.startedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-',
              },
              {
                key: 'completedAt',
                label: '结束时间',
                span: 2,
                children: executionDetail?.completedAt
                  ? dayjs(executionDetail.completedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-',
              },
              {
                key: 'errorMessage',
                label: '错误信息',
                span: 2,
                children: executionDetail?.errorMessage || '-',
              },
              {
                key: 'riskGateResult',
                label: '风控结论',
                children: riskGateSummary ? (
                  <Tag color={riskGateSummary.passed ? 'success' : 'error'}>
                    {riskGateSummary.passed ? '通过' : riskGateSummary.blocked ? '阻断' : '待定'}
                  </Tag>
                ) : (
                  '-'
                ),
              },
              {
                key: 'riskLevel',
                label: '风险等级',
                children: riskGateSummary?.riskLevel ? (
                  <Tag color={riskLevelColorMap[riskGateSummary.riskLevel] || 'default'}>
                    {getRiskLevelLabel(riskGateSummary.riskLevel)}
                  </Tag>
                ) : (
                  '-'
                ),
              },
              {
                key: 'degradeAction',
                label: '降级动作',
                children: getDegradeActionLabel(riskGateSummary?.degradeAction),
              },
              {
                key: 'riskProfileCode',
                label: '风控模板',
                children: riskGateSummary?.riskProfileCode || '-',
              },
              {
                key: 'summarySchemaVersion',
                label: '摘要版本',
                children: riskGateSummary?.summarySchemaVersion || '-',
              },
              {
                key: 'threshold',
                label: '风控阈值',
                children: riskGateSummary?.threshold || '-',
              },
              {
                key: 'blockers',
                label: '阻断项',
                children: riskGateSummary?.blockers.length
                  ? riskGateSummary.blockers.join(', ')
                  : '-',
              },
              {
                key: 'blockerCount',
                label: '阻断项数量',
                children: riskGateSummary?.blockerCount ?? '-',
              },
              {
                key: 'riskEvaluatedAt',
                label: '风控评估时间',
                span: 2,
                children: riskGateSummary?.riskEvaluatedAt || '-',
              },
              {
                key: 'blockReason',
                label: '阻断原因',
                span: 2,
                children: riskGateSummary?.blockReason || '-',
              },
            ]}
          />

          {riskGateSummaryJson ? (
            <Card size="small" title="风控摘要 JSON">
              <Paragraph copyable={{ text: riskGateSummaryJson }} style={{ marginBottom: 0 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{riskGateSummaryJson}</pre>
              </Paragraph>
            </Card>
          ) : null}

          {workflowBindingSnapshotJson ? (
            <Card size="small" title="运行绑定快照 (_workflowBindings)">
              {workflowBindingSnapshot ? (
                <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }} size={8}>
                  <div>
                    <Text type="secondary">声明绑定</Text>
                    <div>
                      <Text>
                        智能体：{' '}
                        {(workflowBindingSnapshot.workflowBindings?.agentBindings || []).join(
                          ', ',
                        ) || '-'}
                      </Text>
                    </div>
                    <div>
                      <Text>
                        参数集：{' '}
                        {(workflowBindingSnapshot.workflowBindings?.paramSetBindings || []).join(
                          ', ',
                        ) || '-'}
                      </Text>
                    </div>
                    <div>
                      <Text>
                        数据连接器：{' '}
                        {(
                          workflowBindingSnapshot.workflowBindings?.dataConnectorBindings || []
                        ).join(', ') || '-'}
                      </Text>
                    </div>
                  </div>

                  <div>
                    <Text type="secondary">未解析绑定</Text>
                    <div>
                      {(workflowBindingSnapshot.unresolvedBindings?.agents || []).map((item) => (
                        <Tag key={`ua-${item}`} color="red">
                          智能体:{item}
                        </Tag>
                      ))}
                      {(workflowBindingSnapshot.unresolvedBindings?.parameterSets || []).map(
                        (item) => (
                          <Tag key={`up-${item}`} color="red">
                            参数集:{item}
                          </Tag>
                        ),
                      )}
                      {(workflowBindingSnapshot.unresolvedBindings?.dataConnectors || []).map(
                        (item) => (
                          <Tag key={`uc-${item}`} color="red">
                            连接器:{item}
                          </Tag>
                        ),
                      )}
                      {!(
                        workflowBindingSnapshot.unresolvedBindings?.agents?.length ||
                        workflowBindingSnapshot.unresolvedBindings?.parameterSets?.length ||
                        workflowBindingSnapshot.unresolvedBindings?.dataConnectors?.length
                      ) ? (
                        <Text>-</Text>
                      ) : null}
                    </div>
                  </div>

                  <Space size={12}>
                    <a href="/workflow/agents" target="_blank" rel="noreferrer">
                      打开智能体中心
                    </a>
                    <a href="/workflow/parameters" target="_blank" rel="noreferrer">
                      打开参数中心
                    </a>
                    <a href="/workflow/connectors" target="_blank" rel="noreferrer">
                      打开连接器中心
                    </a>
                  </Space>

                  <div>
                    <Text type="secondary">已解析绑定</Text>
                    <Card size="small" title={`智能体（${resolvedAgents.length}）`}>
                      <Table
                        rowKey={(record) => `${record.id}-${record.version}`}
                        dataSource={resolvedAgents}
                        columns={bindingColumns}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                    <Card size="small" title={`参数集（${resolvedParameterSets.length}）`}>
                      <Table
                        rowKey={(record) => `${record.id}-${record.version}`}
                        dataSource={resolvedParameterSets}
                        columns={bindingColumns}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                    <Card size="small" title={`数据连接器（${resolvedDataConnectors.length}）`}>
                      <Table
                        rowKey={(record) => `${record.id}-${record.version}`}
                        dataSource={resolvedDataConnectors}
                        columns={bindingColumns}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  </div>
                </Space>
              ) : null}
              <Paragraph
                copyable={{ text: workflowBindingSnapshotJson }}
                style={{ marginBottom: 0 }}
              >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {workflowBindingSnapshotJson}
                </pre>
              </Paragraph>
            </Card>
          ) : null}

          <Table
            rowKey="id"
            loading={isDetailLoading}
            columns={nodeColumns}
            dataSource={executionDetail?.nodeExecutions || []}
            pagination={false}
          />

          <Card size="small" title={`辩论回放（${debateRounds.length} 轮）`}>
            <Space wrap style={{ marginBottom: 12 }}>
              <Input
                style={{ width: 140 }}
                placeholder="轮次"
                value={debateRoundNumber ?? ''}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  const parsed = value ? Number(value) : undefined;
                  setDebateRoundNumber(parsed && Number.isFinite(parsed) ? parsed : undefined);
                }}
              />
              <Input
                style={{ width: 200 }}
                placeholder="参与者编码"
                value={debateParticipantCode}
                onChange={(event) =>
                  setDebateParticipantCode(event.target.value.trim() || undefined)
                }
              />
              <Input
                style={{ width: 180 }}
                placeholder="参与者角色"
                value={debateParticipantRole}
                onChange={(event) =>
                  setDebateParticipantRole(event.target.value.trim() || undefined)
                }
              />
              <Input
                style={{ width: 220 }}
                placeholder="关键字（发言/裁决）"
                value={debateKeyword}
                onChange={(event) => setDebateKeyword(event.target.value.trim() || undefined)}
              />
              <Checkbox
                checked={debateJudgementOnly}
                onChange={(event) => setDebateJudgementOnly(event.target.checked)}
              >
                仅裁决
              </Checkbox>
              <Button
                onClick={() => {
                  setDebateRoundNumber(undefined);
                  setDebateParticipantCode(undefined);
                  setDebateParticipantRole(undefined);
                  setDebateKeyword(undefined);
                  setDebateJudgementOnly(false);
                }}
              >
                重置辩论筛选
              </Button>
            </Space>

            <Descriptions
              size="small"
              bordered
              column={3}
              style={{ marginBottom: 12 }}
              items={[
                { key: 'totalRounds', label: '总轮次', children: debateTimeline?.totalRounds ?? 0 },
                { key: 'traceRows', label: '轨迹条数', children: debateTraceData.length },
                {
                  key: 'loading',
                  label: '加载状态',
                  children:
                    isDebateTimelineLoading || isDebateTracesLoading ? (
                      <Tag color="processing">加载中</Tag>
                    ) : (
                      <Tag color="green">就绪</Tag>
                    ),
                },
              ]}
            />

            <Collapse
              items={debateRoundCollapseItems}
              defaultActiveKey={debateRoundCollapseItems.slice(0, 1).map((item) => item.key)}
              style={{ marginBottom: 12 }}
            />

            <Table
              rowKey="id"
              loading={isDebateTracesLoading}
              columns={debateTraceColumns}
              dataSource={debateTraceData}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          </Card>

          <Card size="small" title="运行事件时间线">
            <Space wrap style={{ marginBottom: 12 }}>
              <Input.Search
                allowClear
                style={{ width: 260 }}
                placeholder="按事件类型筛选"
                value={timelineEventTypeInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setTimelineEventTypeInput(nextValue);
                  if (!nextValue.trim()) {
                    setTimelineEventType(undefined);
                    setTimelinePage(1);
                  }
                }}
                onSearch={(value) => {
                  const normalized = value.trim();
                  setTimelineEventType(normalized ? normalized : undefined);
                  setTimelinePage(1);
                }}
              />
              <Select
                allowClear
                style={{ width: 180 }}
                placeholder="按级别筛选"
                options={[
                  { label: '信息', value: 'INFO' },
                  { label: '警告', value: 'WARN' },
                  { label: '错误', value: 'ERROR' },
                ]}
                value={timelineLevel}
                onChange={(value) => {
                  setTimelineLevel(value);
                  setTimelinePage(1);
                }}
              />
              <Button
                onClick={() => {
                  setTimelineEventTypeInput('');
                  setTimelineEventType(undefined);
                  setTimelineLevel(undefined);
                  setTimelinePage(1);
                  setTimelinePageSize(20);
                }}
              >
                重置时间线筛选
              </Button>
            </Space>
            <Table
              rowKey="id"
              loading={isTimelineLoading}
              columns={timelineColumns}
              dataSource={timelineData}
              pagination={{
                current: executionTimeline?.page || timelinePage,
                pageSize: executionTimeline?.pageSize || timelinePageSize,
                total: executionTimeline?.total ?? executionDetail?.runtimeEvents?.length ?? 0,
                showSizeChanger: true,
                onChange: (nextPage, nextPageSize) => {
                  setTimelinePage(nextPage);
                  setTimelinePageSize(nextPageSize);
                },
              }}
              scroll={{ x: 860 }}
            />
          </Card>
        </Space>
      </Drawer>
    </Card>
  );
};
