import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
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
  useWorkflowExecutionDetail,
  useWorkflowExecutions,
} from '../api';
import { useWorkflowDefinitions } from '../../workflow-studio/api';
import { getErrorMessage } from '../../../api/client';
import { useSearchParams } from 'react-router-dom';

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

const nodeStatusColorMap: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  SKIPPED: 'warning',
};

const executionStatusOptions: { label: string; value: WorkflowExecutionStatus }[] = [
  { label: 'PENDING', value: 'PENDING' },
  { label: 'RUNNING', value: 'RUNNING' },
  { label: 'SUCCESS', value: 'SUCCESS' },
  { label: 'FAILED', value: 'FAILED' },
  { label: 'CANCELED', value: 'CANCELED' },
];

const triggerTypeOptions: { label: string; value: WorkflowTriggerType }[] = [
  { label: 'MANUAL', value: 'MANUAL' },
  { label: 'API', value: 'API' },
  { label: 'SCHEDULE', value: 'SCHEDULE' },
  { label: 'EVENT', value: 'EVENT' },
  { label: 'ON_DEMAND', value: 'ON_DEMAND' },
];

const failureCategoryOptions: { label: string; value: WorkflowFailureCategory }[] = [
  { label: 'VALIDATION', value: 'VALIDATION' },
  { label: 'EXECUTOR', value: 'EXECUTOR' },
  { label: 'TIMEOUT', value: 'TIMEOUT' },
  { label: 'CANCELED', value: 'CANCELED' },
  { label: 'INTERNAL', value: 'INTERNAL' },
];

const runtimeEventLevelColorMap: Record<WorkflowRuntimeEventLevel, string> = {
  INFO: 'default',
  WARN: 'warning',
  ERROR: 'error',
};

const riskLevelOptions: { label: string; value: WorkflowRiskLevel }[] = [
  { label: 'LOW', value: 'LOW' },
  { label: 'MEDIUM', value: 'MEDIUM' },
  { label: 'HIGH', value: 'HIGH' },
  { label: 'EXTREME', value: 'EXTREME' },
];

const degradeActionOptions: { label: string; value: WorkflowRiskDegradeAction }[] = [
  { label: 'HOLD', value: 'HOLD' },
  { label: 'REDUCE', value: 'REDUCE' },
  { label: 'REVIEW_ONLY', value: 'REVIEW_ONLY' },
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
  useEffect(() => {
    setTimelineEventTypeInput('');
    setTimelineEventType(undefined);
    setTimelineLevel(undefined);
    setTimelinePage(1);
    setTimelinePageSize(20);
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
    const bindingSnapshot = toObjectRecord(paramSnapshot?._workflowBindings);
    if (!bindingSnapshot) {
      return null;
    }
    return JSON.stringify(bindingSnapshot, null, 2);
  }, [executionDetail?.paramSnapshot]);

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
          <Tag color={runtimeEventLevelColorMap[value] ?? 'default'}>{value}</Tag>
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
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: WorkflowExecutionStatus) => (
          <Tag color={executionStatusColorMap[value] ?? 'default'}>{value}</Tag>
        ),
      },
      {
        title: '失败分类',
        dataIndex: 'failureCategory',
        width: 130,
        render: (value?: WorkflowFailureCategory | null) => value || '-',
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
                  {summary.riskLevel}
                </Tag>
              ) : null}
              {summary.blocked ? (
                <Tooltip
                  title={
                    [
                      summary.blockReason ? `原因: ${summary.blockReason}` : null,
                      summary.blockers.length ? `阻断项: ${summary.blockers.join(', ')}` : null,
                      summary.degradeAction ? `降级动作: ${summary.degradeAction}` : null,
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
            summary.degradeAction ? `降级动作: ${summary.degradeAction}` : null,
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
          return summary?.degradeAction || '-';
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
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
        render: (value: string) => (
          <Tag color={nodeStatusColorMap[value] ?? 'default'}>{value}</Tag>
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
                children: executionDetail?.triggerType || '-',
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
                    {executionDetail.status}
                  </Tag>
                ) : (
                  '-'
                ),
              },
              {
                key: 'failureCategory',
                label: '失败分类',
                children: executionDetail?.failureCategory || '-',
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
                    {riskGateSummary.riskLevel}
                  </Tag>
                ) : (
                  '-'
                ),
              },
              {
                key: 'degradeAction',
                label: '降级动作',
                children: riskGateSummary?.degradeAction || '-',
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
                  { label: 'INFO', value: 'INFO' },
                  { label: 'WARN', value: 'WARN' },
                  { label: 'ERROR', value: 'ERROR' },
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
