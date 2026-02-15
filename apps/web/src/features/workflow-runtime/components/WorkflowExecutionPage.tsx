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
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Empty,
  Divider,
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExecutionFilterBar } from './ExecutionFilterBar';
import { ExecutionSummaryCards } from './ExecutionSummaryCards';

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
  const navigate = useNavigate();
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
        render: (value: string) => (
          <div style={{ whiteSpace: 'nowrap' }}>{getAgentRoleLabel(value)}</div>
        ),
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
        render: (value: string) => (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
        ),
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
        title: '实例',
        dataIndex: 'id',
        width: 180,
        fixed: 'left',
        render: (value: string, record) => (
          <Space direction="vertical" size={2}>
            <Space>
              <Text strong copyable>{value.slice(0, 8)}</Text>
              <Tag style={{ margin: 0 }}>{getTriggerTypeLabel(record.triggerType)}</Tag>
            </Space>
            {record.sourceExecutionId && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                来自: {record.sourceExecutionId.slice(0, 8)}
              </Text>
            )}
          </Space>
        ),
      },
      {
        title: '流程',
        key: 'workflow',
        width: 200,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text ellipsis style={{ maxWidth: 180 }}>
              {record.workflowVersion?.workflowDefinition?.name || record.workflowVersion?.workflowDefinition?.workflowId || '-'}
            </Text>
            <Tag style={{ margin: 0 }}>{record.workflowVersion?.versionCode}</Tag>
          </Space>
        ),
      },
      {
        title: '状态',
        key: 'status',
        width: 120,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Tag color={executionStatusColorMap[record.status] ?? 'default'} style={{ margin: 0 }}>
              {getExecutionStatusLabel(record.status)}
            </Tag>
            {record.status === 'FAILED' && (
              <Tooltip title={`${getFailureCategoryLabel(record.failureCategory)}: ${record.failureCode || '未知错误'}`}>
                <Text type="danger" style={{ fontSize: 12, maxWidth: 110 }} ellipsis>
                  {record.failureCode || getFailureCategoryLabel(record.failureCategory) || '执行失败'}
                </Text>
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: '执行时间',
        key: 'time',
        width: 150,
        render: (_, record) => {
          let durationTx = '-';
          if (record.completedAt && record.startedAt) {
            const diff = dayjs(record.completedAt).diff(dayjs(record.startedAt), 'second');
            durationTx = `${diff}s`;
          } else if (record.startedAt) {
            const diff = dayjs().diff(dayjs(record.startedAt), 'minute');
            durationTx = `运行 ${diff}m`;
          }

          return (
            <Space direction="vertical" size={0}>
              <Text style={{ fontSize: 13 }}>
                {record.startedAt ? dayjs(record.startedAt).format('MM-DD HH:mm') : '-'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {durationTx}
              </Text>
            </Space>
          );
        },
      },
      {
        title: '风控结果',
        key: 'risk',
        width: 240,
        render: (_, record) => {
          const summary = getExecutionRiskGateSummary(record);
          if (!summary) return '-';

          return (
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space>
                {summary.blocked ? <Tag color="error">阻断</Tag> : <Tag color="success">通过</Tag>}
                {summary.riskLevel && (
                  <Tag color={riskLevelColorMap[summary.riskLevel] || 'default'}>
                    {getRiskLevelLabel(summary.riskLevel)}
                  </Tag>
                )}
              </Space>
              {summary.blocked && summary.blockReason ? (
                <Tooltip title={summary.blockReason}>
                  <Text type="secondary" style={{ fontSize: 12, maxWidth: 220 }} ellipsis>
                    原因: {summary.blockReason}
                  </Text>
                </Tooltip>
              ) : summary.degradeAction && summary.degradeAction !== 'REVIEW_ONLY' ? (
                <Text type="warning" style={{ fontSize: 12 }}>
                  降级: {getDegradeActionLabel(summary.degradeAction)}
                </Text>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_, record) => (
          <Space size={0} split={<Divider type="vertical" />}>
            <Typography.Link onClick={() => setSelectedExecutionId(record.id)}>
              详情
            </Typography.Link>
            <Typography.Link
              onClick={() =>
                navigate(`/workflow/replay?executionId=${encodeURIComponent(record.id)}`)
              }
            >
              回放
            </Typography.Link>
            {record.status === 'FAILED' && (
              <Typography.Link
                onClick={() => handleRerun(record.id)}
                disabled={rerunMutation.isPending && rerunningExecutionId === record.id}
              >
                重跑
              </Typography.Link>
            )}
            {(record.status === 'RUNNING' || record.status === 'PENDING') && (
              <Popconfirm
                title="确认取消？"
                onConfirm={() => handleCancel(record.id)}
              >
                <Typography.Link type="danger">取消</Typography.Link>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [
      navigate,
      rerunMutation.isPending,
      rerunningExecutionId,
      cancelMutation.isPending,
      cancelingExecutionId,
    ],
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

        <ExecutionSummaryCards total={executionPage?.total || 0} />

        <ExecutionFilterBar
          versionCodeInput={versionCodeInput}
          setVersionCodeInput={setVersionCodeInput}
          setVersionCode={setVersionCode}
          keywordInput={keywordInput}
          setKeywordInput={setKeywordInput}
          setKeyword={setKeyword}
          selectedWorkflowDefinitionId={selectedWorkflowDefinitionId}
          setSelectedWorkflowDefinitionId={setSelectedWorkflowDefinitionId}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          selectedFailureCategory={selectedFailureCategory}
          setSelectedFailureCategory={setSelectedFailureCategory}
          failureCodeInput={failureCodeInput}
          setFailureCodeInput={setFailureCodeInput}
          setFailureCode={setFailureCode}
          selectedTriggerType={selectedTriggerType}
          setSelectedTriggerType={setSelectedTriggerType}
          selectedRiskLevel={selectedRiskLevel}
          setSelectedRiskLevel={setSelectedRiskLevel}
          selectedDegradeAction={selectedDegradeAction}
          setSelectedDegradeAction={setSelectedDegradeAction}
          selectedRiskGatePresence={selectedRiskGatePresence}
          setSelectedRiskGatePresence={setSelectedRiskGatePresence}
          selectedRiskSummaryPresence={selectedRiskSummaryPresence}
          setSelectedRiskSummaryPresence={setSelectedRiskSummaryPresence}
          startedAtRange={startedAtRange}
          setStartedAtRange={setStartedAtRange}
          onlySoftFailure={onlySoftFailure}
          setOnlySoftFailure={setOnlySoftFailure}
          onlyErrorRoute={onlyErrorRoute}
          setOnlyErrorRoute={setOnlyErrorRoute}
          onlyRiskBlocked={onlyRiskBlocked}
          setOnlyRiskBlocked={setOnlyRiskBlocked}
          riskProfileCodeInput={riskProfileCodeInput}
          setRiskProfileCodeInput={setRiskProfileCodeInput}
          setRiskProfileCode={setRiskProfileCode}
          riskReasonKeywordInput={riskReasonKeywordInput}
          setRiskReasonKeywordInput={setRiskReasonKeywordInput}
          setRiskReasonKeyword={setRiskReasonKeyword}
          workflowDefinitionOptions={workflowDefinitionOptions}
          executionStatusOptions={executionStatusOptions}
          triggerTypeOptions={triggerTypeOptions}
          failureCategoryOptions={failureCategoryOptions}
          riskLevelOptions={riskLevelOptions}
          degradeActionOptions={degradeActionOptions}
          riskGatePresenceOptions={riskGatePresenceOptions}
          riskSummaryPresenceOptions={riskSummaryPresenceOptions}
          onReset={() => {
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
          onPageReset={() => setPage(1)}
        />

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
          scroll={{ x: 1000 }}
        />
      </Space>

      <Drawer
        title={`运行详情 - ${selectedExecutionId?.slice(0, 8) || ''}`}
        width={1400}
        open={Boolean(selectedExecutionId)}
        onClose={() => setSelectedExecutionId(null)}
      >
        <Tabs
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: '概览',
              children: (
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
                    ]}
                  />

                  <Card size="small" title="风控信息">
                    <Descriptions
                      column={2}
                      bordered
                      size="small"
                      items={[
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
                          key: 'blockReason',
                          label: '阻断原因',
                          span: 2,
                          children: riskGateSummary?.blockReason || '-',
                        },
                        {
                          key: 'blockers',
                          label: '阻断项',
                          span: 2,
                          children: riskGateSummary?.blockers.length
                            ? riskGateSummary.blockers.join(', ')
                            : '-',
                        },
                      ]}
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'nodes',
              label: '节点执行',
              children: (
                <Table
                  rowKey="id"
                  loading={isDetailLoading}
                  columns={nodeColumns}
                  dataSource={executionDetail?.nodeExecutions || []}
                  pagination={false}
                />
              ),
            },
            {
              key: 'timeline',
              label: '时间线',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Input.Search
                      allowClear
                      placeholder="按事件类型筛选"
                      value={timelineEventTypeInput}
                      onChange={(e) => {
                        setTimelineEventTypeInput(e.target.value);
                        if (!e.target.value.trim()) {
                          setTimelineEventType(undefined);
                          setTimelinePage(1);
                        }
                      }}
                      onSearch={(value) => {
                        setTimelineEventType(value.trim() || undefined);
                        setTimelinePage(1);
                      }}
                    />
                    <Select
                      allowClear
                      style={{ width: 120 }}
                      placeholder="按级别"
                      options={[{ label: '信息', value: 'INFO' }, { label: '警告', value: 'WARN' }, { label: '错误', value: 'ERROR' }]}
                      value={timelineLevel}
                      onChange={(value) => { setTimelineLevel(value); setTimelinePage(1); }}
                    />
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
                </Space>
              ),
            },
            {
              key: 'debate',
              label: '辩论回放',
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Input placeholder="轮次" style={{ width: 100 }} value={debateRoundNumber ?? ''} onChange={e => {
                      const v = Number(e.target.value);
                      setDebateRoundNumber(Number.isFinite(v) && e.target.value ? v : undefined);
                    }} />
                    <Input placeholder="参与者编码" value={debateParticipantCode} onChange={e => setDebateParticipantCode(e.target.value || undefined)} />
                    <Checkbox checked={debateJudgementOnly} onChange={e => setDebateJudgementOnly(e.target.checked)}>仅裁决</Checkbox>
                  </Space>

                  <Collapse
                    items={debateRoundCollapseItems}
                    defaultActiveKey={debateRoundCollapseItems.slice(0, 1).map((item) => item.key)}
                  />

                  <Table
                    rowKey="id"
                    loading={isDebateTracesLoading}
                    columns={debateTraceColumns}
                    dataSource={debateTraceData}
                    pagination={{ pageSize: 20 }}
                  />
                </Space>
              )
            },
            {
              key: 'bindings',
              label: '绑定快照',
              children: workflowBindingSnapshotJson ? (
                <Card size="small" title="运行绑定快照">
                  <Paragraph copyable={{ text: workflowBindingSnapshotJson }}>
                    <pre>{workflowBindingSnapshotJson}</pre>
                  </Paragraph>
                </Card>
              ) : <Empty description="无绑定数据" />
            }
          ]}
        />
      </Drawer>
    </Card>
  );
};
