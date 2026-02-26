import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Grid,
  InputNumber,
  Input,
  Modal,
  List,
  Progress,
  Segmented,
  Switch,
  Row,
  Space,
  Timeline,
  Tag,
  Typography,
} from 'antd';
import {
  BulbOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  MailOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SendOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { getApiError } from '../../../api/client';
import { useVirtualUser } from '../../auth/virtual-user';
import {
  CopilotPromptScope,
  CapabilityRoutingPolicy,
  DeliveryChannelProfile,
  useCapabilityRoutingPolicy,
  EphemeralCapabilityPolicy,
  useEphemeralCapabilityPolicy,
  useEphemeralCapabilityPolicyAudits,
  useConfirmConversationPlan,
  useConversationBacktest,
  useConversationConflicts,
  useConversationAssets,
  useConversationSubscriptions,
  useConversationDetail,
  useConversationResult,
  useConversationSessions,
  useCopilotPromptTemplates,
  useCopilotDeliveryProfiles,
  useCreateConversationSubscription,
  useCreateConversationSession,
  useCreateConversationBacktest,
  useCreateSkillDraft,
  useDeliverConversation,
  useExportConversationResult,
  useRunConversationSubscription,
  useSendConversationTurn,
  useReuseConversationAsset,
  useSubmitSkillDraftReview,
  useSandboxSkillDraft,
  useReviewSkillDraft,
  useCapabilityRoutingLogs,
  useCapabilityRoutingSummary,
  useEphemeralCapabilitySummary,
  useEphemeralCapabilityEvolutionPlan,
  useEphemeralPromotionTasks,
  useEphemeralPromotionTaskSummary,
  useApplyEphemeralCapabilityEvolutionPlan,
  useUpdateEphemeralPromotionTask,
  useBatchUpdateEphemeralPromotionTasks,
  useEphemeralPromotionTaskBatches,
  useReplayFailedEphemeralPromotionTaskBatch,
  useRunEphemeralCapabilityHousekeeping,
  useConsumeSkillRuntimeGrant,
  useSkillGovernanceEvents,
  useSkillGovernanceHousekeeping,
  useSkillGovernanceOverview,
  useSkillDraftRuntimeGrants,
  useUpdateConversationSubscription,
  useRevokeSkillRuntimeGrant,
  usePublishSkillDraft,
  useResolveScheduleCommand,
  useUpsertCapabilityRoutingPolicy,
  useUpsertEphemeralCapabilityPolicy,
  useUpsertCopilotPromptTemplates,
  useUpsertCopilotDeliveryProfiles,
} from '../api/conversations';

const { Text, Title, Paragraph } = Typography;

const QUICK_PROMPT_STORAGE_KEY_PREFIX = 'ctbms.agent.copilot.quick-prompts.v1';
const COPILOT_DIAG_STORAGE_KEY = 'ctbms.agent.copilot.diag.v1';
const DEFAULT_VISIBLE_TURN_COUNT = 40;
const LOAD_MORE_TURN_STEP = 40;
const TURN_CONTENT_PREVIEW_LIMIT = 3000;
const RESULT_ANALYSIS_PREVIEW_LIMIT = 4000;
const PROMOTION_BATCH_FAILED_PAGE_SIZE = 8;
const SYSTEM_MESSAGE_COLLAPSE_MIN_LENGTH = 240;
const PROMOTION_FILTERS_STORAGE_KEY = 'agent-copilot-promotion-filters-v1';
const EPHEMERAL_POLICY_AUDIT_STORAGE_KEY = 'agent-copilot-ephemeral-policy-audit-v1';
const ASSISTANT_MESSAGE_COLLAPSE_MIN_LENGTH = 1200;
const SYSTEM_SUMMARY_PREVIEW_LENGTH = 80;
const ASSISTANT_SUMMARY_PREVIEW_LENGTH = 160;
const ASSISTANT_SUMMARY_MAX_HEADINGS = 3;
const ASSISTANT_SUMMARY_MAX_BULLETS = 4;
const SYSTEM_SUMMARY_MAX_KEYS = 5;
const DEFAULT_CAPABILITY_ROUTING_POLICY: CapabilityRoutingPolicy = {
  allowOwnerPool: true,
  allowPublicPool: true,
  preferOwnerFirst: true,
  minOwnerScore: 0,
  minPublicScore: 0.35,
};

const DEFAULT_EPHEMERAL_CAPABILITY_POLICY: EphemeralCapabilityPolicy = {
  draftSemanticReuseThreshold: 0.72,
  publishedSkillReuseThreshold: 0.76,
  runtimeGrantTtlHours: 24,
  runtimeGrantMaxUseCount: 30,
  replayRetryableErrorCodeAllowlist: ['NETWORK_ERROR', 'TIMEOUT', 'FETCH_FAILED', 'HTTP_429', 'HTTP_5XX'],
  replayNonRetryableErrorCodeBlocklist: [
    'CONV_PROMOTION_TASK_NOT_FOUND',
    'CONV_PROMOTION_TASK_ACTION_INVALID',
    'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
    'SKILL_REVIEWER_CONFLICT',
    'SKILL_HIGH_RISK_REVIEW_REQUIRED',
  ],
};

const RETRY_POLICY_PRESET_NETWORK: Pick<
  EphemeralCapabilityPolicy,
  'replayRetryableErrorCodeAllowlist' | 'replayNonRetryableErrorCodeBlocklist'
> = {
  replayRetryableErrorCodeAllowlist: ['NETWORK_ERROR', 'TIMEOUT', 'FETCH_FAILED', 'HTTP_429', 'HTTP_5XX'],
  replayNonRetryableErrorCodeBlocklist: [
    'CONV_PROMOTION_TASK_NOT_FOUND',
    'CONV_PROMOTION_TASK_ACTION_INVALID',
    'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
    'SKILL_REVIEWER_CONFLICT',
    'SKILL_HIGH_RISK_REVIEW_REQUIRED',
  ],
};

const RETRY_POLICY_PRESET_STRICT: Pick<
  EphemeralCapabilityPolicy,
  'replayRetryableErrorCodeAllowlist' | 'replayNonRetryableErrorCodeBlocklist'
> = {
  replayRetryableErrorCodeAllowlist: ['HTTP_429'],
  replayNonRetryableErrorCodeBlocklist: [
    'CONV_PROMOTION_TASK_NOT_FOUND',
    'CONV_PROMOTION_TASK_ACTION_INVALID',
    'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
    'SKILL_REVIEWER_CONFLICT',
    'SKILL_HIGH_RISK_REVIEW_REQUIRED',
    'HTTP_5XX',
    'NETWORK_ERROR',
    'TIMEOUT',
    'FETCH_FAILED',
  ],
};

type QuickPromptTemplate = {
  key: string;
  label: string;
  prompt: string;
};

type LocalConversationTurn = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  structuredPayload?: Record<string, unknown>;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

const isSameQuickPromptTemplates = (
  left: QuickPromptTemplate[],
  right: QuickPromptTemplate[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (item, index) =>
      item.key === right[index]?.key &&
      item.label === right[index]?.label &&
      item.prompt === right[index]?.prompt,
  );
};

const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const summarizeStructuredMessage = (raw: string): string => {
  const text = raw.trim();
  if (!text) {
    return '系统消息';
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const state = typeof parsed.state === 'string' ? parsed.state : null;
    const status = typeof parsed.status === 'string' ? parsed.status : null;
    const message = typeof parsed.message === 'string' ? parsed.message : null;
    const action = typeof parsed.action === 'string' ? parsed.action : null;
    const phase = typeof parsed.phase === 'string' ? parsed.phase : null;
    const parts = [state, status, action, phase, message].filter((item): item is string => Boolean(item));
    if (parts.length) {
      return `系统消息摘要：${parts.slice(0, 3).join(' / ')}`;
    }
    const keys = Object.keys(parsed);
    if (keys.length) {
      return `系统消息摘要：包含 ${keys.slice(0, SYSTEM_SUMMARY_MAX_KEYS).join('、')} 等字段`;
    }
  } catch {
    // ignore
  }
  return `系统消息摘要：${text.slice(0, SYSTEM_SUMMARY_PREVIEW_LENGTH)}${text.length > SYSTEM_SUMMARY_PREVIEW_LENGTH ? '...' : ''}`;
};

const summarizeAssistantMessage = (raw: string): string => {
  const text = raw.trim();
  if (!text) {
    return '助手已生成回复。';
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const headingLines = lines.filter((line) => /^#{1,3}\s+/.test(line)).slice(0, ASSISTANT_SUMMARY_MAX_HEADINGS);
  const bulletLines = lines
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .slice(0, ASSISTANT_SUMMARY_MAX_BULLETS)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''));
  const intro = lines.find((line) => !/^#{1,3}\s+/.test(line)) || '';

  if (headingLines.length || bulletLines.length) {
    const parts: string[] = [];
    if (headingLines.length) {
      parts.push(`主题：${headingLines.map((line) => line.replace(/^#{1,3}\s+/, '')).join(' / ')}`);
    }
    if (bulletLines.length) {
      parts.push(`要点：${bulletLines.join('；')}`);
    }
    return parts.join('\n');
  }

  return `结论摘要：${intro.slice(0, ASSISTANT_SUMMARY_PREVIEW_LENGTH)}${intro.length > ASSISTANT_SUMMARY_PREVIEW_LENGTH ? '...' : ''}`;
};

const appendCopilotDiagEvent = (event: {
  type: string;
  sessionId?: string;
  meta?: Record<string, unknown>;
}) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const raw = window.localStorage.getItem(COPILOT_DIAG_STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    const events = Array.isArray(current) ? current : [];
    events.push({
      ts: new Date().toISOString(),
      type: event.type,
      sessionId: event.sessionId,
      meta: event.meta,
    });
    if (events.length > 80) {
      events.splice(0, events.length - 80);
    }
    window.localStorage.setItem(COPILOT_DIAG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // ignore diagnostics write failure
  }
};

const getOppositeScope = (scope: CopilotPromptScope): CopilotPromptScope =>
  scope === 'PERSONAL' ? 'TEAM' : 'PERSONAL';

const defaultQuickPrompts: QuickPromptTemplate[] = [
  {
    key: 'weekly-review',
    label: '周度复盘',
    prompt: '请结合日报/周报/研报和期货持仓，做过去一周复盘并给风险提示。',
  },
  {
    key: 'forecast-3m',
    label: '三月展望',
    prompt: '请分析最近一周东北玉米价格并给出未来三个月建议，输出Markdown+JSON。',
  },
  {
    key: 'debate-judge',
    label: '辩论裁判',
    prompt: '请就东北玉米未来三个月是否缺口并涨价进行多智能体辩论，并给出裁判结论。',
  },
];

const stateColor: Record<string, string> = {
  INTENT_CAPTURE: 'default',
  SLOT_FILLING: 'processing',
  PLAN_PREVIEW: 'warning',
  USER_CONFIRM: 'warning',
  EXECUTING: 'processing',
  RESULT_DELIVERY: 'success',
  DONE: 'success',
  FAILED: 'error',
};

const sessionStateLabel: Record<string, string> = {
  INTENT_CAPTURE: '待理解',
  SLOT_FILLING: '待补充信息',
  PLAN_PREVIEW: '方案预览',
  USER_CONFIRM: '待确认',
  EXECUTING: '执行中',
  RESULT_DELIVERY: '结果整理中',
  DONE: '已完成',
  FAILED: '执行失败',
};

const planTypeLabel: Record<string, string> = {
  RUN_PLAN: '执行方案',
  DEBATE_PLAN: '多方案讨论',
};

const subscriptionStatusLabel: Record<string, string> = {
  ACTIVE: '已开启',
  PAUSED: '已暂停',
  FAILED: '失败',
  ARCHIVED: '已归档',
};

const deliveryStatusLabel: Record<string, string> = {
  SENT: '已发送',
  FAILED: '发送失败',
};

const backtestStatusLabel: Record<string, string> = {
  QUEUED: '排队中',
  RUNNING: '进行中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

const statusColor: Record<string, string> = {
  ACTIVE: 'success',
  PAUSED: 'default',
  FAILED: 'error',
  ARCHIVED: 'default',
  SENT: 'success',
  EXPIRED: 'default',
  REVOKED: 'default',
};

const channelLabel: Record<string, string> = {
  EMAIL: '邮箱',
  DINGTALK: '钉钉',
  WECOM: '企业微信',
  FEISHU: '飞书',
};

const runtimeGrantStatusLabel: Record<string, string> = {
  ACTIVE: '生效中',
  EXPIRED: '已过期',
  REVOKED: '已撤销',
};

const governanceEventLabel: Record<string, string> = {
  DRAFT_CREATED: '已创建草稿',
  REVIEW_SUBMITTED: '已提交审核',
  REVIEW_APPROVED: '审核通过',
  REVIEW_REJECTED: '审核拒绝',
  PUBLISHED: '已发布',
  RUNTIME_GRANT_CREATED: '已创建试用权限',
  RUNTIME_GRANT_REVOKED: '试用权限已撤销',
  RUNTIME_GRANT_EXPIRED: '试用权限已过期',
  RUNTIME_GRANT_USED: '试用权限已使用',
};

const assetTypeLabel: Record<string, string> = {
  PLAN: '执行方案',
  EXECUTION: '执行记录',
  RESULT_SUMMARY: '结果摘要',
  EXPORT_FILE: '导出文件',
  BACKTEST_SUMMARY: '验证结果',
  CONFLICT_SUMMARY: '一致性检查',
  SKILL_DRAFT: '能力草稿',
};

const capabilityRouteTypeLabel: Record<string, string> = {
  WORKFLOW_REUSE: '工作流复用',
  SKILL_DRAFT_REUSE: '能力草稿复用',
  SKILL_DRAFT_CREATE: '新建能力草稿',
};

const promotionTaskStatusLabel: Record<string, string> = {
  PENDING_REVIEW: '待处理',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  PUBLISHED: '已发布',
};

const promotionBatchActionLabel: Record<string, string> = {
  START_REVIEW: '推进审核中',
  MARK_APPROVED: '标记通过',
  MARK_REJECTED: '标记拒绝',
  MARK_PUBLISHED: '标记已发布',
  SYNC_DRAFT_STATUS: '同步草稿状态',
};

const formatGovernanceEventMessage = (item: {
  eventType: string;
  message: string;
  payload?: Record<string, unknown> | null;
}): string => {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : null;
  if (item.eventType === 'RUNTIME_GRANT_USED') {
    const useCount = Number(payload?.useCount ?? NaN);
    const maxUseCount = Number(payload?.maxUseCount ?? NaN);
    if (Number.isFinite(useCount) && Number.isFinite(maxUseCount)) {
      return `试用权限使用进度：${useCount}/${maxUseCount}`;
    }
  }
  if (item.eventType === 'RUNTIME_GRANT_REVOKED') {
    const reason = typeof payload?.reason === 'string' ? payload.reason : '';
    return reason ? `撤销原因：${reason}` : '已手动撤销试用权限';
  }
  if (item.eventType === 'REVIEW_APPROVED' || item.eventType === 'REVIEW_REJECTED') {
    const comment = typeof payload?.comment === 'string' ? payload.comment : '';
    return comment ? `审核意见：${comment}` : '审核已完成';
  }
  if (item.eventType === 'PUBLISHED') {
    const skillCode = typeof payload?.skillCode === 'string' ? payload.skillCode : '';
    return skillCode ? `已发布并更新能力：${skillCode}` : '已发布到可用能力库';
  }
  return item.message;
};

const formatRoutePolicyDetails = (details?: Record<string, unknown>) => {
  if (!details) {
    return '';
  }
  const capability =
    details.capabilityRoutingPolicy && typeof details.capabilityRoutingPolicy === 'object'
      ? (details.capabilityRoutingPolicy as Record<string, unknown>)
      : null;
  const ephemeral =
    details.ephemeralCapabilityPolicy && typeof details.ephemeralCapabilityPolicy === 'object'
      ? (details.ephemeralCapabilityPolicy as Record<string, unknown>)
      : null;

  const parts: string[] = [];
  if (capability) {
    parts.push(
      `路由策略：私有池${capability.allowOwnerPool ? '开' : '关'}，公共池${capability.allowPublicPool ? '开' : '关'}，私有优先${capability.preferOwnerFirst ? '开' : '关'}`,
    );
  }
  if (ephemeral) {
    parts.push(
      `临时策略：草稿阈值${String(ephemeral.draftSemanticReuseThreshold ?? '-')}, 发布阈值${String(ephemeral.publishedSkillReuseThreshold ?? '-')}, 授权${String(ephemeral.runtimeGrantTtlHours ?? '-')}h/${String(ephemeral.runtimeGrantMaxUseCount ?? '-')}次`,
    );
  }
  return parts.join('；');
};

const copilotErrorMessageByCode: Record<string, string> = {
  CONV_SESSION_NOT_FOUND: '会话不存在或无权限访问，请刷新后重试。',
  CONV_RESULT_NOT_FOUND: '会话结果不可见，请确认任务是否已执行。',
  CONV_PLAN_VERSION_NOT_FOUND: '计划版本已过期，请重新生成计划。',
  CONV_PLAN_ALREADY_CONFIRMED: '该计划已执行，请勿重复提交。',
  CONV_PLAN_ID_MISMATCH: '计划内容已变化，请刷新后确认。',
  CONV_WORKFLOW_NOT_BINDABLE: '未绑定可执行流程，请先选择模板。',
  CONV_EXECUTION_TRIGGER_FAILED: '执行触发失败，请稍后重试。',
  CONV_EXPORT_EXECUTION_NOT_FOUND: '没有可导出的执行结果，请先运行任务。',
  CONV_EXPORT_TASK_NOT_FOUND: '导出任务不存在或无权限访问。',
  CONV_EXPORT_TASK_NOT_READY: '导出任务尚未完成，请稍后再发送邮箱。',
  CONV_DELIVERY_TARGET_REQUIRED: '请补充投递目标信息。',
  CONV_SUB_PLAN_NOT_FOUND: '未找到可订阅计划，请先确认并执行计划。',
  CONV_SUB_NOT_FOUND: '订阅不存在或无权限访问。',
  CONV_BACKTEST_EXECUTION_NOT_FOUND: '未找到可回测的执行实例，请先完成一次执行。',
  CONV_BACKTEST_NOT_FOUND: '回测任务不存在或无权限访问。',
  CONV_BACKTEST_RUN_FAILED: '回测执行失败，请稍后重试。',
  SKILL_DRAFT_NOT_FOUND: '能力草稿不存在或无权限访问。',
  SKILL_RUNTIME_GRANT_NOT_FOUND: '运行时授权不存在或无权限访问。',
  SKILL_RUNTIME_GRANT_INACTIVE: '运行时授权已失效。',
  SKILL_RUNTIME_GRANT_EXPIRED: '运行时授权已过期。',
  SKILL_REVIEWER_CONFLICT: '高风险草稿不能由创建者本人审批通过。',
  SKILL_HIGH_RISK_REVIEW_REQUIRED: '高风险草稿必须由非创建者审批后才能发布。',
  CONV_SCHEDULE_SUB_NOT_FOUND: '未找到可操作订阅，请先创建或指定正确名称。',
  CONV_PROMOTION_TASK_NOT_FOUND: '能力晋升任务不存在，请刷新后重试。',
  CONV_PROMOTION_TASK_PUBLISH_BLOCKED: '草稿尚未发布，请先发布能力后再同步任务状态。',
  CONV_PROMOTION_TASK_ACTION_INVALID: '任务操作无效，请刷新页面后重试。',
  CONV_PROMOTION_BATCH_NOT_FOUND: '能力晋升批次不存在，请刷新后重试。',
  CONV_PROMOTION_BATCH_INVALID: '能力晋升批次数据异常，无法执行失败重放。',
};

export const AgentCopilotPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [input, setInput] = useState('');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU'>('EMAIL');
  const [deliveryTemplateCode, setDeliveryTemplateCode] = useState<
    'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT'
  >('DEFAULT');
  const [deliveryTarget, setDeliveryTarget] = useState('');
  const [sendRawFile, setSendRawFile] = useState(true);
  const [deliveryAdvancedOpen, setDeliveryAdvancedOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [deliveryProfileModalOpen, setDeliveryProfileModalOpen] = useState(false);
  const [routingPolicyModalOpen, setRoutingPolicyModalOpen] = useState(false);
  const [ephemeralPolicyModalOpen, setEphemeralPolicyModalOpen] = useState(false);
  const [deliveryProfileEditor, setDeliveryProfileEditor] = useState('[]');
  const [routingPolicyDraft, setRoutingPolicyDraft] = useState<CapabilityRoutingPolicy>(
    DEFAULT_CAPABILITY_ROUTING_POLICY,
  );
  const [ephemeralPolicyDraft, setEphemeralPolicyDraft] = useState<EphemeralCapabilityPolicy>(
    DEFAULT_EPHEMERAL_CAPABILITY_POLICY,
  );
  const [templateEditor, setTemplateEditor] = useState('');
  const [templateScope, setTemplateScope] = useState<CopilotPromptScope>('PERSONAL');
  const [templateMode, setTemplateMode] = useState<'FORM' | 'JSON'>('FORM');
  const [templateDraft, setTemplateDraft] = useState<QuickPromptTemplate[]>(defaultQuickPrompts);
  const [quickPrompts, setQuickPrompts] = useState<QuickPromptTemplate[]>(defaultQuickPrompts);
  const [subscriptionName, setSubscriptionName] = useState('每周玉米复盘订阅');
  const [subscriptionCronExpr, setSubscriptionCronExpr] = useState('0 0 8 * * 1');
  const [scheduleInstruction, setScheduleInstruction] = useState('每周一9点发到企业微信群ops-group-01');
  const [localTurns, setLocalTurns] = useState<LocalConversationTurn[]>([]);
  const [visibleTurnCount, setVisibleTurnCount] = useState(DEFAULT_VISIBLE_TURN_COUNT);
  const [expandedTurnMap, setExpandedTurnMap] = useState<Record<string, boolean>>({});
  const [expandResultAnalysis, setExpandResultAnalysis] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'progress' | 'result' | 'delivery' | 'schedule' | 'advanced'>(
    'progress',
  );
  const [showAllDeliveryLogs, setShowAllDeliveryLogs] = useState(false);
  const [showAllArtifacts, setShowAllArtifacts] = useState(false);
  const [showAllSubscriptions, setShowAllSubscriptions] = useState(false);
  const [showAllGovernanceEvents, setShowAllGovernanceEvents] = useState(false);
  const [routingSummaryWindow, setRoutingSummaryWindow] = useState<'1h' | '24h' | '7d'>('24h');
  const [promotionTaskStatusFilter, setPromotionTaskStatusFilter] = useState<
    'ALL' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'
  >('ALL');
  const [promotionBatchDrawerOpen, setPromotionBatchDrawerOpen] = useState(false);
  const [selectedPromotionBatchAssetId, setSelectedPromotionBatchAssetId] = useState<string | null>(null);
  const [promotionBatchErrorFilter, setPromotionBatchErrorFilter] = useState<'ALL' | 'RETRYABLE' | 'NON_RETRYABLE'>(
    'ALL',
  );
  const [promotionBatchActionFilter, setPromotionBatchActionFilter] = useState<
    'ALL' | 'START_REVIEW' | 'MARK_APPROVED' | 'MARK_REJECTED' | 'MARK_PUBLISHED' | 'SYNC_DRAFT_STATUS'
  >('ALL');
  const [promotionBatchOutcomeFilter, setPromotionBatchOutcomeFilter] = useState<
    'ALL' | 'HAS_FAILURE' | 'ALL_SUCCESS'
  >('ALL');
  const [promotionBatchFailedPage, setPromotionBatchFailedPage] = useState(1);
  const [promotionBatchCodeFilter, setPromotionBatchCodeFilter] = useState<string>('ALL');
  const [selectedReplayErrorCodes, setSelectedReplayErrorCodes] = useState<string[]>([]);
  const [promotionBatchFlow, setPromotionBatchFlow] = useState<
    'IDLE' | 'SUBMIT_REVIEW' | 'APPROVE' | 'PUBLISH'
  >('IDLE');
  const [ephemeralPolicyAuditHistory, setEphemeralPolicyAuditHistory] = useState<
    Array<{
      id: string;
      savedAt: string;
      retryableAllowlist: string[];
      nonRetryableBlocklist: string[];
      runtimeGrantTtlHours: number;
      runtimeGrantMaxUseCount: number;
    }>
  >([]);
  const [backtestDetailModalOpen, setBacktestDetailModalOpen] = useState(false);
  const [conflictDetailModalOpen, setConflictDetailModalOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);
  const screens = Grid.useBreakpoint();
  const { currentUser } = useVirtualUser();
  const isAdminUser = useMemo(() => {
    const roleNames = Array.isArray(currentUser?.roleNames) ? currentUser.roleNames : [];
    return roleNames.some((role) => ['SUPER_ADMIN', 'ADMIN'].includes(String(role).toUpperCase()));
  }, [currentUser?.roleNames]);
  const compactActionSize = screens.xs ? 'middle' : 'small';

  useEffect(() => {
    if (!activeSessionId || typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(PROMOTION_FILTERS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sessionRecord =
        parsed && typeof parsed === 'object' ? (parsed[activeSessionId] as Record<string, unknown> | undefined) : null;
      if (!sessionRecord || typeof sessionRecord !== 'object') {
        return;
      }
      const taskStatus = String(sessionRecord.promotionTaskStatusFilter || 'ALL');
      const batchAction = String(sessionRecord.promotionBatchActionFilter || 'ALL');
      const batchOutcome = String(sessionRecord.promotionBatchOutcomeFilter || 'ALL');
      if (['ALL', 'PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(taskStatus)) {
        setPromotionTaskStatusFilter(
          taskStatus as 'ALL' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED',
        );
      }
      if (['ALL', 'START_REVIEW', 'MARK_APPROVED', 'MARK_REJECTED', 'MARK_PUBLISHED', 'SYNC_DRAFT_STATUS'].includes(batchAction)) {
        setPromotionBatchActionFilter(
          batchAction as
            | 'ALL'
            | 'START_REVIEW'
            | 'MARK_APPROVED'
            | 'MARK_REJECTED'
            | 'MARK_PUBLISHED'
            | 'SYNC_DRAFT_STATUS',
        );
      }
      if (['ALL', 'HAS_FAILURE', 'ALL_SUCCESS'].includes(batchOutcome)) {
        setPromotionBatchOutcomeFilter(batchOutcome as 'ALL' | 'HAS_FAILURE' | 'ALL_SUCCESS');
      }
    } catch {
      // ignore local state recovery failures
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(PROMOTION_FILTERS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next: Record<string, unknown> = {
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        [activeSessionId]: {
          promotionTaskStatusFilter,
          promotionBatchActionFilter,
          promotionBatchOutcomeFilter,
        },
      };
      window.localStorage.setItem(PROMOTION_FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore local storage write failures
    }
  }, [activeSessionId, promotionTaskStatusFilter, promotionBatchActionFilter, promotionBatchOutcomeFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(EPHEMERAL_POLICY_AUDIT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setEphemeralPolicyAuditHistory(
          parsed.filter((item) => item && typeof item === 'object').slice(0, 20) as Array<{
            id: string;
            savedAt: string;
            retryableAllowlist: string[];
            nonRetryableBlocklist: string[];
            runtimeGrantTtlHours: number;
            runtimeGrantMaxUseCount: number;
          }>,
        );
      }
    } catch {
      // ignore local audit restore failures
    }
  }, []);

  const sessionsQuery = useConversationSessions({ page: 1, pageSize: 50 });
  const detailQuery = useConversationDetail(activeSessionId);
  const resultQuery = useConversationResult(activeSessionId);

  const createSessionMutation = useCreateConversationSession();
  const sendTurnMutation = useSendConversationTurn();
  const confirmPlanMutation = useConfirmConversationPlan();
  const exportMutation = useExportConversationResult();
  const deliverMutation = useDeliverConversation();
  const subscriptionsQuery = useConversationSubscriptions(activeSessionId);
  const createSubscriptionMutation = useCreateConversationSubscription();
  const updateSubscriptionMutation = useUpdateConversationSubscription();
  const runSubscriptionMutation = useRunConversationSubscription();
  const resolveScheduleMutation = useResolveScheduleCommand();
  const createBacktestMutation = useCreateConversationBacktest();
  const createSkillDraftMutation = useCreateSkillDraft();
  const sandboxSkillDraftMutation = useSandboxSkillDraft();
  const submitSkillDraftReviewMutation = useSubmitSkillDraftReview();
  const reviewSkillDraftMutation = useReviewSkillDraft();
  const publishSkillDraftMutation = usePublishSkillDraft();
  const revokeRuntimeGrantMutation = useRevokeSkillRuntimeGrant();
  const consumeRuntimeGrantMutation = useConsumeSkillRuntimeGrant();
  const governanceHousekeepingMutation = useSkillGovernanceHousekeeping();
  const governanceOverviewQuery = useSkillGovernanceOverview();
  const personalPromptTemplateQuery = useCopilotPromptTemplates('PERSONAL');
  const teamPromptTemplateQuery = useCopilotPromptTemplates('TEAM');
  const upsertPromptTemplatesMutation = useUpsertCopilotPromptTemplates();
  const personalDeliveryProfileQuery = useCopilotDeliveryProfiles('PERSONAL');
  const teamDeliveryProfileQuery = useCopilotDeliveryProfiles('TEAM');
  const upsertDeliveryProfilesMutation = useUpsertCopilotDeliveryProfiles();
  const capabilityRoutingPolicyQuery = useCapabilityRoutingPolicy();
  const upsertCapabilityRoutingPolicyMutation = useUpsertCapabilityRoutingPolicy();
  const ephemeralCapabilityPolicyQuery = useEphemeralCapabilityPolicy();
  const ephemeralCapabilityPolicyAuditsQuery = useEphemeralCapabilityPolicyAudits(20);
  const upsertEphemeralCapabilityPolicyMutation = useUpsertEphemeralCapabilityPolicy();

  const activePromptTemplate =
    templateScope === 'PERSONAL' ? personalPromptTemplateQuery.data : teamPromptTemplateQuery.data;
  const oppositePromptTemplate =
    templateScope === 'PERSONAL' ? teamPromptTemplateQuery.data : personalPromptTemplateQuery.data;
  const activeDeliveryProfileBinding =
    templateScope === 'PERSONAL' ? personalDeliveryProfileQuery.data : teamDeliveryProfileQuery.data;

  const latestPlan = useMemo(() => detailQuery.data?.plans?.[0], [detailQuery.data?.plans]);
  const latestAssistantTurn = useMemo(
    () => [...(detailQuery.data?.turns ?? [])].reverse().find((turn) => turn.role === 'ASSISTANT'),
    [detailQuery.data?.turns],
  );
  const sessionList = Array.isArray(sessionsQuery.data?.data) ? sessionsQuery.data.data : [];
  const detailTurns = detailQuery.data?.turns ?? [];
  const allTurns = useMemo(() => {
    if (!localTurns.length) {
      return detailTurns;
    }
    return [...detailTurns, ...localTurns].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [detailTurns, localTurns]);
  const hiddenTurnCount = Math.max(0, allTurns.length - visibleTurnCount);
  const visibleTurns = useMemo(
    () => (hiddenTurnCount > 0 ? allTurns.slice(-visibleTurnCount) : allTurns),
    [allTurns, hiddenTurnCount, visibleTurnCount],
  );
  const latestAssistantPayload = (latestAssistantTurn?.structuredPayload ?? {}) as {
    missingSlots?: string[];
    proposedPlan?: Record<string, unknown> | null;
    reuseResolution?: {
      explicitAssetRefCount?: number;
      followupAssetRefCount?: number;
      semanticAssetRefCount?: number;
      semanticResolution?: {
        selectedAssetId?: string;
        selectedAssetTitle?: string;
        candidateCount?: number;
        ambiguous?: boolean;
        topCandidates?: Array<{
          id: string;
          title: string;
          assetType: string;
          score: number;
        }>;
      };
    };
  };
  const missingSlots = Array.isArray(latestAssistantPayload.missingSlots)
    ? latestAssistantPayload.missingSlots.filter((item): item is string => typeof item === 'string')
    : [];
  const proposedPlanFromTurn = latestAssistantPayload.proposedPlan ?? null;
  const latestReuseResolution = latestAssistantPayload.reuseResolution;
  const latestSemanticCandidates = Array.isArray(latestReuseResolution?.semanticResolution?.topCandidates)
    ? latestReuseResolution.semanticResolution.topCandidates
    : [];
  const latestBacktestJobId = useMemo(() => {
    return [...(detailQuery.data?.turns ?? [])]
      .reverse()
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .find((payload) => payload && typeof payload.backtestJobId === 'string')?.backtestJobId as
      | string
      | undefined;
  }, [detailQuery.data?.turns]);
  const latestSkillDraftId = useMemo(() => {
    return [...(detailQuery.data?.turns ?? [])]
      .reverse()
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .find((payload) => payload && typeof payload.draftId === 'string')?.draftId as string | undefined;
  }, [detailQuery.data?.turns]);
  const governanceEventsQuery = useSkillGovernanceEvents(latestSkillDraftId);
  const capabilityRoutingLogsQuery = useCapabilityRoutingLogs(activeSessionId, {
    limit: 20,
    window: routingSummaryWindow,
  });
  const capabilityRoutingSummaryQuery = useCapabilityRoutingSummary(activeSessionId, {
    limit: 200,
    window: routingSummaryWindow,
  });
  const ephemeralCapabilitySummaryQuery = useEphemeralCapabilitySummary(activeSessionId, {
    window: routingSummaryWindow,
  });
  const ephemeralEvolutionPlanQuery = useEphemeralCapabilityEvolutionPlan(activeSessionId, {
    window: routingSummaryWindow,
  });
  const ephemeralPromotionTasksQuery = useEphemeralPromotionTasks(activeSessionId, {
    window: routingSummaryWindow,
    status: promotionTaskStatusFilter === 'ALL' ? undefined : promotionTaskStatusFilter,
  });
  const ephemeralPromotionTaskSummaryQuery = useEphemeralPromotionTaskSummary(activeSessionId, {
    window: routingSummaryWindow,
  });
  const ephemeralPromotionTaskBatchesQuery = useEphemeralPromotionTaskBatches(activeSessionId, {
    window: routingSummaryWindow,
    action: promotionBatchActionFilter === 'ALL' ? undefined : promotionBatchActionFilter,
    limit: 20,
  });
  const applyEphemeralEvolutionMutation = useApplyEphemeralCapabilityEvolutionPlan();
  const updateEphemeralPromotionTaskMutation = useUpdateEphemeralPromotionTask();
  const batchUpdateEphemeralPromotionTasksMutation = useBatchUpdateEphemeralPromotionTasks();
  const replayFailedPromotionBatchMutation = useReplayFailedEphemeralPromotionTaskBatch();
  const runEphemeralHousekeepingMutation = useRunEphemeralCapabilityHousekeeping();
  const runtimeGrantsQuery = useSkillDraftRuntimeGrants(latestSkillDraftId);
  const backtestQuery = useConversationBacktest(activeSessionId, latestBacktestJobId);
  const conflictsQuery = useConversationConflicts(activeSessionId);
  const assetsQuery = useConversationAssets(activeSessionId);
  const reuseAssetMutation = useReuseConversationAsset();
  const subscriptionList = Array.isArray(subscriptionsQuery.data) ? subscriptionsQuery.data : [];
  const conflictList = Array.isArray(conflictsQuery.data?.conflicts) ? conflictsQuery.data.conflicts : [];
  const governanceEvents = Array.isArray(governanceEventsQuery.data) ? governanceEventsQuery.data : [];
  const capabilityRoutingLogs = Array.isArray(capabilityRoutingLogsQuery.data) ? capabilityRoutingLogsQuery.data : [];
  const capabilityRoutingSummary = capabilityRoutingSummaryQuery.data;
  const ephemeralCapabilitySummary = ephemeralCapabilitySummaryQuery.data;
  const ephemeralEvolutionPlan = ephemeralEvolutionPlanQuery.data;
  const ephemeralPromotionTasks = Array.isArray(ephemeralPromotionTasksQuery.data)
    ? ephemeralPromotionTasksQuery.data
    : [];
  const ephemeralPromotionTaskSummary = ephemeralPromotionTaskSummaryQuery.data;
  const ephemeralPromotionTaskBatches = Array.isArray(ephemeralPromotionTaskBatchesQuery.data)
    ? ephemeralPromotionTaskBatchesQuery.data
    : [];
  const filteredPromotionTaskBatches = useMemo(() => {
    return ephemeralPromotionTaskBatches.filter((item) => {
      if (promotionBatchOutcomeFilter === 'HAS_FAILURE') {
        return item.failedCount > 0;
      }
      if (promotionBatchOutcomeFilter === 'ALL_SUCCESS') {
        return item.failedCount <= 0;
      }
      return true;
    });
  }, [ephemeralPromotionTaskBatches, promotionBatchOutcomeFilter]);
  const selectedPromotionBatch =
    ephemeralPromotionTaskBatches.find((item) => item.batchAssetId === selectedPromotionBatchAssetId) ?? null;
  const isRetryableBatchFailure = (item: { code?: string | null; message?: string | null }) => {
    const code = String(item.code || '').toUpperCase();
    if ((ephemeralCapabilityPolicy.replayNonRetryableErrorCodeBlocklist || []).includes(code)) {
      return false;
    }
    if ((ephemeralCapabilityPolicy.replayRetryableErrorCodeAllowlist || []).includes(code)) {
      return true;
    }
    const text = `${item.code || ''} ${item.message || ''}`;
    return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout|429|5\d{2}/i.test(text);
  };
  const selectedPromotionBatchCodeStats = useMemo(() => {
    if (!selectedPromotionBatch) {
      return [] as Array<{ code: string; count: number }>;
    }
    const mapping = new Map<string, number>();
    for (const row of selectedPromotionBatch.failed) {
      const key = String(row.code || 'UNKNOWN');
      mapping.set(key, (mapping.get(key) ?? 0) + 1);
    }
    return Array.from(mapping.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedPromotionBatch]);
  const selectedPromotionBatchFailedRows = useMemo(() => {
    if (!selectedPromotionBatch) {
      return [] as Array<{ taskAssetId?: string | null; code?: string | null; message: string }>;
    }
    return selectedPromotionBatch.failed.filter((row) => {
      if (promotionBatchCodeFilter !== 'ALL' && String(row.code || 'UNKNOWN') !== promotionBatchCodeFilter) {
        return false;
      }
      if (promotionBatchErrorFilter === 'RETRYABLE') {
        return isRetryableBatchFailure(row);
      }
      if (promotionBatchErrorFilter === 'NON_RETRYABLE') {
        return !isRetryableBatchFailure(row);
      }
      return true;
    });
  }, [selectedPromotionBatch, promotionBatchCodeFilter, promotionBatchErrorFilter]);
  const selectedPromotionBatchFailedPageRows = useMemo(() => {
    const start = (promotionBatchFailedPage - 1) * PROMOTION_BATCH_FAILED_PAGE_SIZE;
    return selectedPromotionBatchFailedRows.slice(start, start + PROMOTION_BATCH_FAILED_PAGE_SIZE);
  }, [selectedPromotionBatchFailedRows, promotionBatchFailedPage]);

  useEffect(() => {
    setPromotionBatchFailedPage(1);
  }, [promotionBatchErrorFilter, promotionBatchCodeFilter, selectedPromotionBatchAssetId]);
  const runtimeGrants = Array.isArray(runtimeGrantsQuery.data) ? runtimeGrantsQuery.data : [];
  const conversationAssets = Array.isArray(assetsQuery.data) ? assetsQuery.data : [];

  const deliveryLogs = useMemo(() => {
    return (detailQuery.data?.turns ?? [])
      .filter((turn) => turn.role === 'ASSISTANT')
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .filter((payload) => payload && typeof payload.deliveryTaskId === 'string')
      .map((payload) => ({
        deliveryTaskId: String(payload?.deliveryTaskId ?? ''),
        channel: String(payload?.channel ?? 'EMAIL'),
        target: typeof payload?.target === 'string' ? payload.target : null,
        status: String(payload?.status ?? 'UNKNOWN'),
        errorMessage: typeof payload?.errorMessage === 'string' ? payload.errorMessage : null,
      }))
      .reverse();
  }, [detailQuery.data?.turns]);
  const activeDeliveryProfiles = useMemo(() => {
    const raw = (activeDeliveryProfileBinding?.metadata as Record<string, unknown> | undefined)?.profiles;
    if (!Array.isArray(raw)) {
      return [] as DeliveryChannelProfile[];
    }
    return raw
      .map((item) => item as Record<string, unknown>)
      .map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : `profile-${index + 1}`,
        channel: (item.channel as DeliveryChannelProfile['channel']) || 'EMAIL',
        target: typeof item.target === 'string' ? item.target : undefined,
        to: Array.isArray(item.to) ? item.to.filter((v) => typeof v === 'string') : undefined,
        templateCode: (item.templateCode as DeliveryChannelProfile['templateCode']) || 'DEFAULT',
        sendRawFile: typeof item.sendRawFile === 'boolean' ? item.sendRawFile : true,
        description: typeof item.description === 'string' ? item.description : undefined,
        isDefault: Boolean(item.isDefault),
      }))
      .filter((item) => ['EMAIL', 'DINGTALK', 'WECOM', 'FEISHU'].includes(item.channel));
  }, [activeDeliveryProfileBinding?.metadata]);
  const activeDeliveryChannelProfile = useMemo(() => {
    return (
      activeDeliveryProfiles.find((item) => item.channel === deliveryChannel && item.isDefault) ||
      activeDeliveryProfiles.find((item) => item.channel === deliveryChannel)
    );
  }, [activeDeliveryProfiles, deliveryChannel]);
  const capabilityRoutingPolicyBinding = capabilityRoutingPolicyQuery.data;
  const ephemeralCapabilityPolicyBinding = ephemeralCapabilityPolicyQuery.data;
  const capabilityRoutingPolicy = useMemo(() => {
    const metadata = capabilityRoutingPolicyBinding?.metadata as Record<string, unknown> | undefined;
    if (!metadata) {
      return DEFAULT_CAPABILITY_ROUTING_POLICY;
    }
    const parseBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
    const parseScore = (value: unknown, fallback: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.min(1, parsed));
    };
    return {
      allowOwnerPool: parseBool(metadata.allowOwnerPool, DEFAULT_CAPABILITY_ROUTING_POLICY.allowOwnerPool),
      allowPublicPool: parseBool(metadata.allowPublicPool, DEFAULT_CAPABILITY_ROUTING_POLICY.allowPublicPool),
      preferOwnerFirst: parseBool(metadata.preferOwnerFirst, DEFAULT_CAPABILITY_ROUTING_POLICY.preferOwnerFirst),
      minOwnerScore: parseScore(metadata.minOwnerScore, DEFAULT_CAPABILITY_ROUTING_POLICY.minOwnerScore),
      minPublicScore: parseScore(metadata.minPublicScore, DEFAULT_CAPABILITY_ROUTING_POLICY.minPublicScore),
    } as CapabilityRoutingPolicy;
  }, [capabilityRoutingPolicyBinding?.metadata]);
  const ephemeralCapabilityPolicy = useMemo(() => {
    const metadata = ephemeralCapabilityPolicyBinding?.metadata as Record<string, unknown> | undefined;
    if (!metadata) {
      return DEFAULT_EPHEMERAL_CAPABILITY_POLICY;
    }
    const parseScore = (value: unknown, fallback: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.min(1, parsed));
    };
    const parseIntValue = (value: unknown, fallback: number, min: number, max: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(min, Math.min(max, Math.round(parsed)));
    };
    const parseStringArray = (value: unknown, fallback: string[]) => {
      if (!Array.isArray(value)) {
        return fallback;
      }
      const normalized = value
        .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
        .filter(Boolean);
      return normalized.length ? Array.from(new Set(normalized)) : fallback;
    };

    return {
      draftSemanticReuseThreshold: parseScore(
        metadata.draftSemanticReuseThreshold,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.draftSemanticReuseThreshold,
      ),
      publishedSkillReuseThreshold: parseScore(
        metadata.publishedSkillReuseThreshold,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.publishedSkillReuseThreshold,
      ),
      runtimeGrantTtlHours: parseIntValue(
        metadata.runtimeGrantTtlHours,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.runtimeGrantTtlHours,
        1,
        168,
      ),
      runtimeGrantMaxUseCount: parseIntValue(
        metadata.runtimeGrantMaxUseCount,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.runtimeGrantMaxUseCount,
        1,
        200,
      ),
      replayRetryableErrorCodeAllowlist: parseStringArray(
        metadata.replayRetryableErrorCodeAllowlist,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.replayRetryableErrorCodeAllowlist,
      ),
      replayNonRetryableErrorCodeBlocklist: parseStringArray(
        metadata.replayNonRetryableErrorCodeBlocklist,
        DEFAULT_EPHEMERAL_CAPABILITY_POLICY.replayNonRetryableErrorCodeBlocklist,
      ),
    } as EphemeralCapabilityPolicy;
  }, [ephemeralCapabilityPolicyBinding?.metadata]);
  const serverEphemeralPolicyAuditHistory = useMemo(() => {
    const rows = Array.isArray(ephemeralCapabilityPolicyAuditsQuery.data)
      ? ephemeralCapabilityPolicyAuditsQuery.data
      : [];
    return rows
      .map((item) => {
        const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {};
        const after =
          metadata.after && typeof metadata.after === 'object' && !Array.isArray(metadata.after)
            ? (metadata.after as Record<string, unknown>)
            : {};
        const toStringArray = (value: unknown): string[] => {
          if (!Array.isArray(value)) {
            return [];
          }
          return value
            .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
            .filter(Boolean);
        };
        const toInt = (value: unknown, fallback: number) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.round(value);
          }
          if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              return Math.round(parsed);
            }
          }
          return fallback;
        };
        const savedAt =
          (typeof metadata.auditedAt === 'string' && metadata.auditedAt) ||
          (typeof item.updatedAt === 'string' ? item.updatedAt : undefined) ||
          (typeof item.createdAt === 'string' ? item.createdAt : undefined) ||
          new Date().toISOString();
        return {
          id: item.id,
          savedAt,
          retryableAllowlist: toStringArray(after.replayRetryableErrorCodeAllowlist),
          nonRetryableBlocklist: toStringArray(after.replayNonRetryableErrorCodeBlocklist),
          runtimeGrantTtlHours: toInt(after.runtimeGrantTtlHours, 24),
          runtimeGrantMaxUseCount: toInt(after.runtimeGrantMaxUseCount, 30),
        };
      })
      .filter((row) => row.retryableAllowlist.length || row.nonRetryableBlocklist.length)
      .slice(0, 20);
  }, [ephemeralCapabilityPolicyAuditsQuery.data]);
  const displayedEphemeralPolicyAuditHistory =
    serverEphemeralPolicyAuditHistory.length > 0 ? serverEphemeralPolicyAuditHistory : ephemeralPolicyAuditHistory;
  const deliveryPreview = useMemo(() => {
    const resolvedTo =
      deliveryChannel === 'EMAIL'
        ? emailTo
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .concat(activeDeliveryChannelProfile?.to ?? [])
          .filter((value, index, arr) => arr.indexOf(value) === index)
        : [];
    const manualTarget = deliveryTarget.trim();
    const resolvedTarget = deliveryChannel === 'EMAIL' ? '' : manualTarget || activeDeliveryChannelProfile?.target || '';
    return {
      resolvedTo,
      resolvedTarget,
      useDefaultTo: deliveryChannel === 'EMAIL' && !emailTo.trim() && Boolean(activeDeliveryChannelProfile?.to?.length),
      useDefaultTarget: deliveryChannel !== 'EMAIL' && !manualTarget && Boolean(activeDeliveryChannelProfile?.target),
    };
  }, [deliveryChannel, emailTo, deliveryTarget, activeDeliveryChannelProfile]);
  const planSnapshot = (latestPlan?.planSnapshot ?? null) as
    | {
      planId?: string;
      skills?: string[];
      estimatedCost?: { token?: number; latencyMs?: number };
    }
    | null;
  const planSkills = Array.isArray(planSnapshot?.skills)
    ? planSnapshot.skills.filter((item): item is string => typeof item === 'string')
    : [];
  const resultAnalysisText = toSafeText(resultQuery.data?.result?.analysis ?? '-');

  const showCopilotError = (error: unknown, fallback: string) => {
    const apiError = getApiError(error);
    const codeMsg = apiError.code ? copilotErrorMessageByCode[apiError.code] : null;
    appendCopilotDiagEvent({
      type: 'error',
      sessionId: activeSessionId,
      meta: { fallback, code: apiError.code, message: apiError.message },
    });
    message.error(codeMsg || apiError.message || fallback);
  };

  const handleExportDiagnostics = () => {
    try {
      const raw = window.localStorage.getItem(COPILOT_DIAG_STORAGE_KEY);
      const payload = raw || '[]';
      const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ctbms-agent-copilot-diag-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('诊断日志已导出');
    } catch {
      message.error('诊断日志导出失败');
    }
  };

  const handleCreateSubscription = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!latestPlan) {
      message.warning('请先提问并等待助手准备好执行方案');
      return;
    }
    try {
      await createSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        name: subscriptionName,
        cronExpr: subscriptionCronExpr,
        planVersion: latestPlan.version,
      });
      message.success('订阅创建成功');
    } catch (error) {
      showCopilotError(error, '订阅创建失败');
    }
  };

  const handleResolveSchedule = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!scheduleInstruction.trim()) {
      message.warning('请输入调度指令');
      return;
    }
    try {
      const result = await resolveScheduleMutation.mutateAsync({
        sessionId: activeSessionId,
        instruction: scheduleInstruction,
      });
      message.success(`调度已解析并执行：${result.data.action}`);
    } catch (error) {
      showCopilotError(error, '调度指令执行失败');
    }
  };

  const handleToggleSubscription = async (
    subscriptionId: string,
    status: 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED',
  ) => {
    if (!activeSessionId) {
      return;
    }
    const nextStatus = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        subscriptionId,
        status: nextStatus,
      });
      message.success(nextStatus === 'ACTIVE' ? '已恢复订阅' : '已暂停订阅');
    } catch (error) {
      showCopilotError(error, '订阅更新失败');
    }
  };

  const handleRunSubscriptionNow = async (subscriptionId: string) => {
    if (!activeSessionId) {
      return;
    }
    try {
      await runSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        subscriptionId,
      });
      message.success('已触发补跑');
    } catch (error) {
      showCopilotError(error, '补跑失败');
    }
  };

  const handleCreateBacktest = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    const executionId = resultQuery.data?.executionId;
    if (!executionId) {
      message.warning('暂无可验证结果，请先等待本轮分析完成');
      return;
    }
    try {
      const created = await createBacktestMutation.mutateAsync({
        sessionId: activeSessionId,
        executionId,
        strategySource: 'LATEST_ACTIONS',
        lookbackDays: 180,
        feeModel: {
          spotFeeBps: 8,
          futuresFeeBps: 3,
        },
      });
      message.success(`回测任务已创建：${created.data.backtestJobId}`);
    } catch (error) {
      showCopilotError(error, '回测创建失败');
    }
  };

  const handleCreateSkillDraft = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await createSkillDraftMutation.mutateAsync({
        sessionId: activeSessionId,
        gapType: 'MISSING_EXTERNAL_DATA_SOURCE',
        requiredCapability: '需要补充外部市场数据抓取能力以提高结论覆盖度',
        suggestedSkillCode: `market_gap_${Date.now()}`,
      });
      message.success(`能力草稿已创建：${result.data.draftId}`);
    } catch (error) {
      showCopilotError(error, '创建能力草稿失败');
    }
  };

  const handleReuseAsset = async (assetId: string, title: string) => {
    if (!activeSessionId) {
      return;
    }
    try {
      await reuseAssetMutation.mutateAsync({
        sessionId: activeSessionId,
        assetId,
        message: `请基于「${title}」继续分析，并输出更新后的结论。`,
      });
      message.success('已基于历史结果继续执行');
    } catch (error) {
      showCopilotError(error, '复用失败');
    }
  };

  const handleSelectSemanticCandidate = async (rank: number) => {
    if (!activeSessionId) {
      return;
    }
    try {
      await sendTurnMutation.mutateAsync({
        sessionId: activeSessionId,
        message: `请用第${rank}个继续输出更新后的结论。`,
      });
      message.success(`已按第${rank}候选继续执行`);
    } catch (error) {
      showCopilotError(error, '候选选择失败');
    }
  };

  const handleSandboxSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可测试的能力草稿');
      return;
    }
    try {
      const result = await sandboxSkillDraftMutation.mutateAsync({
        draftId: latestSkillDraftId,
        testCases: [
          {
            input: { symbol: 'C', date: '2026-02-25', market: 'DCE' },
            expectContains: ['symbol'],
          },
        ],
      });
      message.success(`沙箱测试完成：${result.status}（${result.passedCount}/${result.passedCount + result.failedCount}）`);
    } catch (error) {
      showCopilotError(error, '沙箱测试失败');
    }
  };

  const handleSubmitSkillDraftReview = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可提交的能力草稿');
      return;
    }
    try {
      const result = await submitSkillDraftReviewMutation.mutateAsync(latestSkillDraftId);
      message.success(`已提交审批：${result.status}`);
    } catch (error) {
      showCopilotError(error, '提交审批失败');
    }
  };

  const handleApproveSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可审批的能力草稿');
      return;
    }
    try {
      const result = await reviewSkillDraftMutation.mutateAsync({
        draftId: latestSkillDraftId,
        action: 'APPROVE',
        comment: '自动化验收通过',
      });
      message.success(`审批完成：${result.status}`);
    } catch (error) {
      showCopilotError(error, '审批失败');
    }
  };

  const handlePublishSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可发布的能力草稿');
      return;
    }
    try {
      const result = await publishSkillDraftMutation.mutateAsync(latestSkillDraftId);
      message.success(`发布完成：${result.status}`);
    } catch (error) {
      showCopilotError(error, '发布失败');
    }
  };

  const handleRevokeRuntimeGrant = async (grantId: string) => {
    if (!latestSkillDraftId) {
      return;
    }
    try {
      await revokeRuntimeGrantMutation.mutateAsync({
        draftId: latestSkillDraftId,
        grantId,
        reason: 'manual revoke from copilot',
      });
      message.success('已撤销运行时授权');
    } catch (error) {
      showCopilotError(error, '撤销授权失败');
    }
  };

  const handleConsumeRuntimeGrant = async (grantId: string) => {
    if (!latestSkillDraftId) {
      return;
    }
    try {
      await consumeRuntimeGrantMutation.mutateAsync({
        draftId: latestSkillDraftId,
        grantId,
      });
      message.success('已记录一次运行时授权使用');
    } catch (error) {
      showCopilotError(error, '记录授权使用失败');
    }
  };

  const handleGovernanceHousekeeping = async () => {
    try {
      const result = await governanceHousekeepingMutation.mutateAsync();
      message.success(
        `治理清理完成：过期授权 ${result.expiredGrantCount}，禁用草稿 ${result.disabledDraftCount}`,
      );
    } catch (error) {
      showCopilotError(error, '治理清理失败');
    }
  };

  const handleCreateSession = async () => {
    try {
      const session = await createSessionMutation.mutateAsync({
        title: `会话 ${new Date().toLocaleString('zh-CN')}`,
      });
      setActiveSessionId(session.id);
      message.success('已创建新会话');
    } catch (error) {
      showCopilotError(error, '创建会话失败');
    }
  };

  const createOptimisticTurnPair = (content: string) => {
    const now = new Date().toISOString();
    const userTurnId = `local_user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assistantTurnId = `local_assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setLocalTurns((prev) => [
      ...prev,
      {
        id: userTurnId,
        role: 'USER',
        content,
        createdAt: now,
        pending: true,
      },
      {
        id: assistantTurnId,
        role: 'ASSISTANT',
        content: '我正在理解你的问题并整理结果，请稍候...',
        structuredPayload: {
          retryMessage: content,
          replyOptions: [
            {
              id: 'retry_send',
              label: '重试发送',
              mode: 'SEND',
              value: content,
            },
          ],
        },
        createdAt: now,
        pending: true,
      },
    ]);
    return { userTurnId, assistantTurnId };
  };

  const clearOptimisticTurnPair = (pair: { userTurnId: string; assistantTurnId: string }) => {
    setLocalTurns((prev) => prev.filter((item) => item.id !== pair.userTurnId && item.id !== pair.assistantTurnId));
  };

  const markOptimisticTurnPairFailed = (
    pair: { userTurnId: string; assistantTurnId: string },
    fallbackMessage: string,
  ) => {
    setLocalTurns((prev) =>
      prev.map((item) => {
        if (item.id === pair.userTurnId) {
          return { ...item, pending: false, failed: true };
        }
        if (item.id === pair.assistantTurnId) {
          return {
            ...item,
            pending: false,
            failed: true,
            content: fallbackMessage,
          };
        }
        return item;
      }),
    );
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content) {
      return;
    }
    appendCopilotDiagEvent({
      type: 'turn.send.start',
      sessionId: activeSessionId,
      meta: { inputLength: content.length },
    });

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSessionMutation.mutateAsync({
          title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        });
        targetSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (error) {
        showCopilotError(error, '创建会话失败，请稍后重试');
        return;
      }
    }

    setInput('');
    const optimisticPair = createOptimisticTurnPair(content);

    try {
      await sendTurnMutation.mutateAsync({ sessionId: targetSessionId, message: content });
      clearOptimisticTurnPair(optimisticPair);
      appendCopilotDiagEvent({
        type: 'turn.send.success',
        sessionId: targetSessionId,
      });
    } catch (error) {
      markOptimisticTurnPairFailed(optimisticPair, '发送失败，请点击重试或继续输入你的问题。');
      showCopilotError(error, '发送失败，请稍后重试');
    }
  };

  const handleQuickPromptSend = async (prompt: string) => {
    const content = prompt.trim();
    if (!content) {
      return;
    }
    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSessionMutation.mutateAsync({
          title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        });
        targetSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (error) {
        showCopilotError(error, '创建会话失败，请稍后重试');
        return;
      }
    }

    setInput('');
    const optimisticPair = createOptimisticTurnPair(content);

    try {
      await sendTurnMutation.mutateAsync({ sessionId: targetSessionId, message: content });
      clearOptimisticTurnPair(optimisticPair);
      message.success('已发送快捷问题');
    } catch (error) {
      markOptimisticTurnPairFailed(optimisticPair, '发送失败，请点击重试或直接重新提问。');
      showCopilotError(error, '快捷问题发送失败');
    }
  };

  const handleReplyOptionSelect = async (option: {
    mode?: string;
    value?: string;
    tab?: 'progress' | 'result' | 'delivery' | 'schedule';
  }) => {
    if (option.mode === 'OPEN_TAB' && option.tab) {
      openDetailTab(option.tab);
      return;
    }
    const nextMessage = (option.value || '').trim();
    if (!nextMessage) {
      return;
    }
    setInput('');
    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSessionMutation.mutateAsync({
          title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        });
        targetSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (error) {
        showCopilotError(error, '创建会话失败，请稍后重试');
        return;
      }
    }

    const optimisticPair = createOptimisticTurnPair(nextMessage);
    try {
      await sendTurnMutation.mutateAsync({ sessionId: targetSessionId, message: nextMessage });
      clearOptimisticTurnPair(optimisticPair);
    } catch (error) {
      markOptimisticTurnPairFailed(optimisticPair, '执行建议失败，请重试或换个说法。');
      showCopilotError(error, '执行建议失败');
    }
  };

  const handleConfirmPlan = async () => {
    if (!activeSessionId || !latestPlan || !planSnapshot?.planId) {
      message.warning('当前暂无可执行内容，请先继续提问');
      return;
    }
    try {
      await confirmPlanMutation.mutateAsync({
        sessionId: activeSessionId,
        planId: planSnapshot.planId,
        planVersion: latestPlan.version,
      });
      appendCopilotDiagEvent({
        type: 'plan.confirm.success',
        sessionId: activeSessionId,
        meta: { planId: planSnapshot.planId, planVersion: latestPlan.version },
      });
      message.success('已开始执行，你可以继续补充要求');
    } catch (error) {
      showCopilotError(error, '开始执行失败');
    }
  };

  const artifacts = resultQuery.data?.artifacts ?? [];
  const latestArtifact = artifacts[0];
  const visibleDeliveryLogs = showAllDeliveryLogs ? deliveryLogs : deliveryLogs.slice(0, 3);
  const visibleArtifacts = showAllArtifacts ? artifacts : artifacts.slice(0, 3);
  const visibleSubscriptions = showAllSubscriptions ? subscriptionList : subscriptionList.slice(0, 5);
  const visibleGovernanceEvents = showAllGovernanceEvents ? governanceEvents : governanceEvents.slice(0, 5);
  const currentStatus = String(resultQuery.data?.status ?? detailQuery.data?.state ?? 'INTENT_CAPTURE');
  const statusText = sessionStateLabel[currentStatus] || currentStatus;
  const statusMeta = useMemo(() => {
    if (currentStatus === 'FAILED') {
      return {
        icon: <ExclamationCircleOutlined style={{ color: '#cf1322' }} />,
        tone: '#fff1f0',
      };
    }
    if (['DONE', 'RESULT_DELIVERY'].includes(currentStatus)) {
      return {
        icon: <CheckCircleOutlined style={{ color: '#389e0d' }} />,
        tone: '#f6ffed',
      };
    }
    if (['EXECUTING', 'PLAN_PREVIEW', 'USER_CONFIRM'].includes(currentStatus)) {
      return {
        icon: <SyncOutlined spin style={{ color: '#1677ff' }} />,
        tone: '#e6f4ff',
      };
    }
    return {
      icon: <PlayCircleOutlined style={{ color: '#595959' }} />,
      tone: '#fafafa',
    };
  }, [currentStatus]);
  const nextActionHint = useMemo(() => {
    if (!latestPlan) {
      return '建议下一步：先描述你的问题场景（时间范围、区域、你最关心的目标）。';
    }
    if (!latestPlan.isConfirmed) {
      return '建议下一步：先在“进展”里确认执行，然后等待结果生成。';
    }
    if (resultQuery.data?.status === 'EXECUTING') {
      return '建议下一步：任务执行中，可继续补充要求，我会自动吸收。';
    }
    if (resultQuery.data?.result) {
      return '建议下一步：查看结果后可直接发送报告，或设置定时自动发送。';
    }
    return '建议下一步：查看进展，确认当前阶段。';
  }, [latestPlan, resultQuery.data?.result, resultQuery.data?.status]);
  const openDetailTab = (tab: 'progress' | 'result' | 'delivery' | 'schedule' | 'advanced') => {
    setDetailTab(tab);
    setDetailDrawerOpen(true);
  };
  const executionTimeline = useMemo(() => {
    const state = resultQuery.data?.status ?? detailQuery.data?.state ?? 'INTENT_CAPTURE';
    const delivered = deliveryLogs.some((item) => item.status === 'SENT');
    return [
      {
        key: 'plan',
        label: '计划生成',
        done: Boolean(latestPlan),
      },
      {
        key: 'confirm',
        label: '计划确认',
        done: Boolean(latestPlan?.isConfirmed),
      },
      {
        key: 'execute',
        label: '任务执行',
        done: ['EXECUTING', 'DONE', 'FAILED', 'RESULT_DELIVERY'].includes(String(state)),
      },
      {
        key: 'export',
        label: '导出产物',
        done: artifacts.length > 0,
      },
      {
        key: 'deliver',
        label: '邮件投递',
        done: delivered,
      },
    ];
  }, [resultQuery.data?.status, detailQuery.data?.state, latestPlan, artifacts.length, deliveryLogs]);

  useEffect(() => {
    setLocalTurns([]);
    setVisibleTurnCount(DEFAULT_VISIBLE_TURN_COUNT);
    setExpandedTurnMap({});
    setExpandResultAnalysis(false);
    setShowAllDeliveryLogs(false);
    setShowAllArtifacts(false);
    setShowAllSubscriptions(false);
    setShowAllGovernanceEvents(false);
    appendCopilotDiagEvent({
      type: 'session.changed',
      sessionId: activeSessionId,
    });
  }, [activeSessionId]);

  useEffect(() => {
    appendCopilotDiagEvent({
      type: 'turns.updated',
      sessionId: activeSessionId,
      meta: {
        totalTurns: allTurns.length,
        visibleTurns: Math.min(visibleTurnCount, allTurns.length),
      },
    });
  }, [activeSessionId, allTurns.length, visibleTurnCount]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      appendCopilotDiagEvent({
        type: 'window.error',
        sessionId: activeSessionId,
        meta: {
          message: event.message,
          source: event.filename,
          line: event.lineno,
          col: event.colno,
        },
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendCopilotDiagEvent({
        type: 'window.unhandledrejection',
        sessionId: activeSessionId,
        meta: {
          reason: toSafeText(event.reason),
        },
      });
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!timelineRef.current) {
      return;
    }
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [visibleTurns.length, sendTurnMutation.isSuccess]);

  useEffect(() => {
    const remoteTemplates = (activePromptTemplate?.metadata as Record<string, unknown> | undefined)
      ?.templates;
    if (!Array.isArray(remoteTemplates)) {
      return;
    }
    const normalized = remoteTemplates
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const row = item as Record<string, unknown>;
        const key = typeof row.key === 'string' ? row.key.trim() : '';
        const label = typeof row.label === 'string' ? row.label.trim() : '';
        const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : '';
        if (!key || !label || !prompt) {
          return null;
        }
        return { key, label, prompt };
      })
      .filter((item): item is QuickPromptTemplate => Boolean(item));
    if (normalized.length) {
      setQuickPrompts((prev) => (isSameQuickPromptTemplates(prev, normalized) ? prev : normalized));
    }
  }, [activePromptTemplate]);

  useEffect(() => {
    if (activePromptTemplate?.id) {
      return;
    }
    try {
      const raw = localStorage.getItem(`${QUICK_PROMPT_STORAGE_KEY_PREFIX}.${templateScope}`);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        return;
      }
      const normalized = parsed
        .map((item) => {
          const key = typeof item.key === 'string' ? item.key.trim() : '';
          const label = typeof item.label === 'string' ? item.label.trim() : '';
          const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
          if (!key || !label || !prompt) {
            return null;
          }
          return { key, label, prompt };
        })
        .filter((item): item is QuickPromptTemplate => Boolean(item));
      if (normalized.length) {
        setQuickPrompts((prev) => (isSameQuickPromptTemplates(prev, normalized) ? prev : normalized));
      }
    } catch {
      // ignore invalid cache
    }
  }, [activePromptTemplate?.id, templateScope]);

  useEffect(() => {
    if (!emailModalOpen) {
      return;
    }
    if (activeDeliveryChannelProfile?.templateCode) {
      setDeliveryTemplateCode(activeDeliveryChannelProfile.templateCode);
    }
    if (typeof activeDeliveryChannelProfile?.sendRawFile === 'boolean') {
      setSendRawFile(activeDeliveryChannelProfile.sendRawFile);
    }
  }, [emailModalOpen, activeDeliveryChannelProfile]);

  useEffect(() => {
    setRoutingPolicyDraft(capabilityRoutingPolicy);
  }, [capabilityRoutingPolicy]);

  useEffect(() => {
    setEphemeralPolicyDraft(ephemeralCapabilityPolicy);
  }, [ephemeralCapabilityPolicy]);

  const handleExportPdf = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    const workflowExecutionId = resultQuery.data?.executionId;
    if (!workflowExecutionId) {
      message.warning('当前没有可导出的执行结果');
      return;
    }
    try {
      await exportMutation.mutateAsync({
        sessionId: activeSessionId,
        workflowExecutionId,
        format: 'PDF',
        title: '对话助手分析报告',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
      });
      appendCopilotDiagEvent({
        type: 'result.export.success',
        sessionId: activeSessionId,
        meta: { workflowExecutionId },
      });
      message.success('已触发导出，请稍后刷新结果查看下载链接');
    } catch (error) {
      showCopilotError(error, '导出失败');
    }
  };

  const handleSendDelivery = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!latestArtifact?.exportTaskId) {
      message.warning('请先导出报告');
      return;
    }
    const profile = activeDeliveryChannelProfile;

    const to = deliveryPreview.resolvedTo;
    if (deliveryChannel === 'EMAIL' && !to.length) {
      message.warning(
        isAdminUser
          ? '请补一个接收邮箱，或先在配置中心设置默认邮箱。'
          : '请补一个接收邮箱后再发送。',
      );
      return;
    }
    const resolvedTarget = deliveryChannel === 'EMAIL' ? undefined : deliveryPreview.resolvedTarget || undefined;
    if (deliveryChannel !== 'EMAIL' && !resolvedTarget) {
      message.warning(
        isAdminUser
          ? '请补一个接收位置，或先在配置中心设置默认接收位置。'
          : '请补一个接收位置（例如群ID或机器人标识）后再发送。',
      );
      return;
    }

    try {
      const result = await deliverMutation.mutateAsync({
        sessionId: activeSessionId,
        exportTaskId: latestArtifact.exportTaskId,
        channel: deliveryChannel,
        to,
        target: resolvedTarget,
        templateCode: profile?.templateCode || deliveryTemplateCode,
        sendRawFile: profile?.sendRawFile ?? sendRawFile,
      });
      appendCopilotDiagEvent({
        type: 'delivery.send.result',
        sessionId: activeSessionId,
        meta: {
          channel: deliveryChannel,
          status: result.data.status,
          exportTaskId: latestArtifact.exportTaskId,
        },
      });
      if (result.data.status === 'SENT') {
        message.success('投递已发送');
        setEmailModalOpen(false);
      } else {
        message.warning(result.data.errorMessage || '投递发送失败');
      }
    } catch (error) {
      showCopilotError(error, '投递失败');
    }
  };

  const openTemplateModal = () => {
    setTemplateMode('FORM');
    setTemplateDraft(quickPrompts);
    setTemplateEditor(JSON.stringify(quickPrompts, null, 2));
    setTemplateModalOpen(true);
  };

  const openDeliveryProfileModal = () => {
    setDeliveryProfileEditor(JSON.stringify(activeDeliveryProfiles, null, 2));
    setDeliveryProfileModalOpen(true);
  };

  const openRoutingPolicyModal = () => {
    setRoutingPolicyDraft(capabilityRoutingPolicy);
    setRoutingPolicyModalOpen(true);
  };

  const openEphemeralPolicyModal = () => {
    setEphemeralPolicyDraft(ephemeralCapabilityPolicy);
    setEphemeralPolicyModalOpen(true);
  };

  const handleSaveDeliveryProfiles = async () => {
    try {
      const parsed = JSON.parse(deliveryProfileEditor) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        message.error('配置格式错误，需为数组');
        return;
      }

      const normalized = parsed
        .map((item, index) => ({
          id: typeof item.id === 'string' ? item.id : `profile-${index + 1}`,
          channel: (item.channel as DeliveryChannelProfile['channel']) || 'EMAIL',
          target: typeof item.target === 'string' ? item.target : undefined,
          to: Array.isArray(item.to) ? item.to.filter((v) => typeof v === 'string') : undefined,
          templateCode: (item.templateCode as DeliveryChannelProfile['templateCode']) || 'DEFAULT',
          sendRawFile: typeof item.sendRawFile === 'boolean' ? item.sendRawFile : true,
          description: typeof item.description === 'string' ? item.description : undefined,
          isDefault: Boolean(item.isDefault),
        }))
        .filter((item) => ['EMAIL', 'DINGTALK', 'WECOM', 'FEISHU'].includes(item.channel));

      await upsertDeliveryProfilesMutation.mutateAsync({
        scope: templateScope,
        bindingId: activeDeliveryProfileBinding?.id,
        profiles: normalized,
      });
      message.success('投递配置中心保存成功');
      setDeliveryProfileModalOpen(false);
    } catch {
      message.error('投递配置 JSON 解析失败');
    }
  };

  const handleSaveRoutingPolicy = async () => {
    const policy: CapabilityRoutingPolicy = {
      allowOwnerPool: routingPolicyDraft.allowOwnerPool,
      allowPublicPool: routingPolicyDraft.allowPublicPool,
      preferOwnerFirst: routingPolicyDraft.preferOwnerFirst,
      minOwnerScore: Math.max(0, Math.min(1, routingPolicyDraft.minOwnerScore)),
      minPublicScore: Math.max(0, Math.min(1, routingPolicyDraft.minPublicScore)),
    };

    try {
      await upsertCapabilityRoutingPolicyMutation.mutateAsync({
        bindingId: capabilityRoutingPolicyBinding?.id,
        policy,
      });
      message.success('能力路由策略保存成功');
      setRoutingPolicyModalOpen(false);
    } catch {
      message.error('能力路由策略保存失败');
    }
  };

  const handleSaveEphemeralPolicy = async () => {
    const normalizeCodeList = (list: string[]) =>
      Array.from(
        new Set(
          list
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
        ),
      );
    const policy: EphemeralCapabilityPolicy = {
      draftSemanticReuseThreshold: Math.max(0, Math.min(1, ephemeralPolicyDraft.draftSemanticReuseThreshold)),
      publishedSkillReuseThreshold: Math.max(0, Math.min(1, ephemeralPolicyDraft.publishedSkillReuseThreshold)),
      runtimeGrantTtlHours: Math.max(1, Math.min(168, Math.round(ephemeralPolicyDraft.runtimeGrantTtlHours))),
      runtimeGrantMaxUseCount: Math.max(1, Math.min(200, Math.round(ephemeralPolicyDraft.runtimeGrantMaxUseCount))),
      replayRetryableErrorCodeAllowlist: normalizeCodeList(ephemeralPolicyDraft.replayRetryableErrorCodeAllowlist),
      replayNonRetryableErrorCodeBlocklist: normalizeCodeList(
        ephemeralPolicyDraft.replayNonRetryableErrorCodeBlocklist,
      ),
    };

    try {
      await upsertEphemeralCapabilityPolicyMutation.mutateAsync({
        bindingId: ephemeralCapabilityPolicyBinding?.id,
        policy,
      });
      const nextAudit = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          savedAt: new Date().toISOString(),
          retryableAllowlist: policy.replayRetryableErrorCodeAllowlist,
          nonRetryableBlocklist: policy.replayNonRetryableErrorCodeBlocklist,
          runtimeGrantTtlHours: policy.runtimeGrantTtlHours,
          runtimeGrantMaxUseCount: policy.runtimeGrantMaxUseCount,
        },
        ...ephemeralPolicyAuditHistory,
      ].slice(0, 20);
      setEphemeralPolicyAuditHistory(nextAudit);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(EPHEMERAL_POLICY_AUDIT_STORAGE_KEY, JSON.stringify(nextAudit));
      }
      message.success('临时能力策略保存成功');
      setEphemeralPolicyModalOpen(false);
    } catch {
      message.error('临时能力策略保存失败');
    }
  };

  const handleApplyRetryPolicyPreset = (preset: 'NETWORK' | 'STRICT') => {
    const next = preset === 'NETWORK' ? RETRY_POLICY_PRESET_NETWORK : RETRY_POLICY_PRESET_STRICT;
    setEphemeralPolicyDraft((prev) => ({
      ...prev,
      replayRetryableErrorCodeAllowlist: [...next.replayRetryableErrorCodeAllowlist],
      replayNonRetryableErrorCodeBlocklist: [...next.replayNonRetryableErrorCodeBlocklist],
    }));
    message.success(preset === 'NETWORK' ? '已应用网络波动型模板' : '已应用严格型模板');
  };

  const handleExportRoutingSummary = () => {
    if (!capabilityRoutingSummary) {
      message.warning('暂无可导出的路由汇总数据');
      return;
    }
    const routeTypeLines = capabilityRoutingSummary.stats.routeType
      .map((item) => `- ${capabilityRouteTypeLabel[item.key] || item.key}: ${item.count}`)
      .join('\n');
    const sourceLines = capabilityRoutingSummary.stats.selectedSource
      .map((item) => `- ${item.key}: ${item.count}`)
      .join('\n');
    const trendLines = capabilityRoutingSummary.trend
      .map((item) => `- ${item.bucket}: 总计 ${item.total}，分布 ${JSON.stringify(item.byRouteType)}`)
      .join('\n');

    const markdown = [
      '# 能力路由汇总报告',
      '',
      `- 会话ID: ${activeSessionId ?? '-'}`,
      `- 时间窗口: ${capabilityRoutingSummary.sampleWindow.window}`,
      `- 样本数量: ${capabilityRoutingSummary.sampleWindow.totalLogs}`,
      `- 分析上限: ${capabilityRoutingSummary.sampleWindow.analyzedLimit}`,
      '',
      '## 路由类型分布',
      routeTypeLines || '- 无',
      '',
      '## 来源分布',
      sourceLines || '- 无',
      '',
      '## 生效策略',
      `- 路由策略: ${JSON.stringify(capabilityRoutingSummary.effectivePolicies.capabilityRoutingPolicy)}`,
      `- 临时策略: ${JSON.stringify(capabilityRoutingSummary.effectivePolicies.ephemeralCapabilityPolicy)}`,
      '',
      '## 趋势（按小时）',
      trendLines || '- 无',
      '',
    ].join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `capability-routing-summary-${Date.now()}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    message.success('已导出路由汇总报告');
  };

  const handleRunEphemeralHousekeeping = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await runEphemeralHousekeepingMutation.mutateAsync({ sessionId: activeSessionId });
      message.success(
        `临时能力清理完成：过期授权 ${result.data.expiredGrantCount}，关闭临时授权草稿 ${result.data.disabledDraftCount}`,
      );
    } catch {
      message.error('临时能力清理失败');
    }
  };

  const handleApplyEphemeralEvolution = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await applyEphemeralEvolutionMutation.mutateAsync({
        sessionId: activeSessionId,
        window: routingSummaryWindow,
      });
      message.success(
        `进化方案已执行：过期授权 ${result.data.expiredGrantCount}，关闭草稿 ${result.data.disabledDraftCount}，晋升建议 ${result.data.promoteSuggestionCount}，任务生成 ${result.data.promotionTaskCount ?? 0}`,
      );
    } catch {
      message.error('进化方案执行失败');
    }
  };

  const handleUpdatePromotionTask = async (
    taskAssetId: string,
    action: 'START_REVIEW' | 'MARK_APPROVED' | 'MARK_REJECTED' | 'MARK_PUBLISHED' | 'SYNC_DRAFT_STATUS',
    comment?: string,
    options?: { silent?: boolean },
  ) => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await updateEphemeralPromotionTaskMutation.mutateAsync({
        sessionId: activeSessionId,
        taskAssetId,
        action,
        comment,
      });
      const status = result.data.task?.status || '-';
      if (!options?.silent) {
        message.success(`晋升任务状态已更新：${promotionTaskStatusLabel[status] || status}`);
      }
      return result.data.task;
    } catch (error) {
      if (!options?.silent) {
        showCopilotError(error, '晋升任务更新失败');
      }
      throw error;
    }
  };

  const handleSubmitReviewForTask = async (taskAssetId: string, draftId: string) => {
    try {
      await submitSkillDraftReviewMutation.mutateAsync(draftId);
      await handleUpdatePromotionTask(taskAssetId, 'START_REVIEW', '已提交能力审核');
      message.success('已提交审核，并更新晋升任务状态');
    } catch (error) {
      showCopilotError(error, '提交审核失败');
    }
  };

  const handleApproveForTask = async (taskAssetId: string, draftId: string) => {
    try {
      await reviewSkillDraftMutation.mutateAsync({
        draftId,
        action: 'APPROVE',
        comment: '由晋升任务流程触发审批通过',
      });
      await handleUpdatePromotionTask(taskAssetId, 'MARK_APPROVED', '草稿审批通过');
      message.success('草稿审批通过，并更新晋升任务状态');
    } catch (error) {
      showCopilotError(error, '审批失败');
    }
  };

  const handlePublishForTask = async (taskAssetId: string, draftId: string) => {
    try {
      await publishSkillDraftMutation.mutateAsync(draftId);
      await handleUpdatePromotionTask(taskAssetId, 'MARK_PUBLISHED', '草稿已发布到能力库');
      message.success('已发布能力，并更新晋升任务状态');
    } catch (error) {
      showCopilotError(error, '发布失败');
    }
  };

  const handleBatchSyncPromotionTasks = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await batchUpdateEphemeralPromotionTasksMutation.mutateAsync({
        sessionId: activeSessionId,
        action: 'SYNC_DRAFT_STATUS',
        window: routingSummaryWindow,
        status: promotionTaskStatusFilter === 'ALL' ? undefined : promotionTaskStatusFilter,
        comment: '批量同步草稿状态',
        maxConcurrency: 6,
        maxRetries: 1,
      });
      message.success(
        `批量同步完成：成功 ${result.data.succeededCount}，失败 ${result.data.failedCount}${result.data.batchId ? `，批次 ${result.data.batchId.slice(0, 8)}` : ''}`,
      );
    } catch (error) {
      showCopilotError(error, '批量同步失败');
    }
  };

  const handleBatchMarkReviewing = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await batchUpdateEphemeralPromotionTasksMutation.mutateAsync({
        sessionId: activeSessionId,
        action: 'START_REVIEW',
        window: routingSummaryWindow,
        status: promotionTaskStatusFilter === 'ALL' ? 'PENDING_REVIEW' : promotionTaskStatusFilter,
        comment: '批量推进至审核中',
        maxConcurrency: 6,
        maxRetries: 1,
      });
      message.success(
        `批量推进完成：成功 ${result.data.succeededCount}，失败 ${result.data.failedCount}${result.data.batchId ? `，批次 ${result.data.batchId.slice(0, 8)}` : ''}`,
      );
    } catch (error) {
      showCopilotError(error, '批量推进失败');
    }
  };

  const showBatchFlowResult = (
    title: string,
    succeeded: Array<{ taskAssetId: string; suggestedSkillCode: string }>,
    failed: Array<{ taskAssetId: string; suggestedSkillCode: string; reason: string }>,
  ) => {
    if (!failed.length) {
      message.success(`${title}完成：成功 ${succeeded.length} 条`);
      return;
    }
    const failurePreview = failed
      .slice(0, 8)
      .map((item) => `- ${item.suggestedSkillCode} (${item.taskAssetId}): ${item.reason}`)
      .join('\n');
    modal.info({
      title: `${title}完成（部分失败）`,
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>成功 {succeeded.length} 条，失败 {failed.length} 条。</Text>
          <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
            {failurePreview}
          </Text>
        </Space>
      ),
      width: 760,
    });
  };

  const runPromotionTaskBatchFlow = async (flow: 'SUBMIT_REVIEW' | 'APPROVE' | 'PUBLISH') => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }

    const pickCandidates = () => {
      if (flow === 'SUBMIT_REVIEW') {
        return ephemeralPromotionTasks.filter((item) =>
          ['PENDING_REVIEW', 'IN_REVIEW'].includes(item.status) &&
          ['DRAFT', 'SANDBOX_TESTING'].includes(String(item.draftStatus || '')),
        );
      }
      if (flow === 'APPROVE') {
        return ephemeralPromotionTasks.filter((item) =>
          ['IN_REVIEW', 'APPROVED'].includes(item.status) &&
          ['READY_FOR_REVIEW', 'APPROVED'].includes(String(item.draftStatus || '')),
        );
      }
      return ephemeralPromotionTasks.filter((item) =>
        ['APPROVED', 'PUBLISHED'].includes(item.status) &&
        ['APPROVED', 'PUBLISHED'].includes(String(item.draftStatus || '')),
      );
    };

    const candidates = pickCandidates();
    if (!candidates.length) {
      message.warning('当前筛选范围内没有可执行的晋升任务');
      return;
    }

    const succeeded: Array<{ taskAssetId: string; suggestedSkillCode: string }> = [];
    const failed: Array<{ taskAssetId: string; suggestedSkillCode: string; reason: string }> = [];

    const isRetryablePromotionError = (error: unknown) => {
      const apiError = getApiError(error);
      const text = `${apiError?.message || ''} ${apiError?.code || ''} ${error instanceof Error ? error.message : ''}`;
      return /fetch failed|timeout|temporarily unavailable|network|ECONNRESET|ETIMEDOUT/i.test(text);
    };

    const runWithRetry = async <T,>(operation: () => Promise<T>, retry = 1): Promise<T> => {
      let attempt = 0;
      let lastError: unknown;
      while (attempt <= retry) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          if (attempt >= retry || !isRetryablePromotionError(error)) {
            throw error;
          }
          attempt += 1;
        }
      }
      throw lastError;
    };

    setPromotionBatchFlow(flow);
    try {
      for (const item of candidates) {
        try {
          if (flow === 'SUBMIT_REVIEW') {
            await runWithRetry(() => submitSkillDraftReviewMutation.mutateAsync(item.draftId));
            await runWithRetry(() =>
              handleUpdatePromotionTask(item.taskAssetId, 'START_REVIEW', '批量提交审核后自动标记审核中', {
                silent: true,
              }),
            );
          } else if (flow === 'APPROVE') {
            await runWithRetry(() =>
              reviewSkillDraftMutation.mutateAsync({
                draftId: item.draftId,
                action: 'APPROVE',
                comment: '由晋升任务批处理流程审批通过',
              }),
            );
            await runWithRetry(() =>
              handleUpdatePromotionTask(item.taskAssetId, 'MARK_APPROVED', '批量审批通过', {
                silent: true,
              }),
            );
          } else {
            await runWithRetry(() => publishSkillDraftMutation.mutateAsync(item.draftId));
            await runWithRetry(() =>
              handleUpdatePromotionTask(item.taskAssetId, 'MARK_PUBLISHED', '批量发布能力', {
                silent: true,
              }),
            );
          }
          succeeded.push({
            taskAssetId: item.taskAssetId,
            suggestedSkillCode: item.suggestedSkillCode,
          });
        } catch (error) {
          const apiError = getApiError(error);
          failed.push({
            taskAssetId: item.taskAssetId,
            suggestedSkillCode: item.suggestedSkillCode,
            reason: apiError?.message || (error instanceof Error ? error.message : '执行失败'),
          });
        }
      }

      const titleMap = {
        SUBMIT_REVIEW: '批量提交审核',
        APPROVE: '批量审批通过',
        PUBLISH: '批量发布能力',
      } as const;
      showBatchFlowResult(titleMap[flow], succeeded, failed);
      await Promise.all([
        ephemeralPromotionTasksQuery.refetch(),
        ephemeralPromotionTaskSummaryQuery.refetch(),
        ephemeralPromotionTaskBatchesQuery.refetch(),
        ephemeralEvolutionPlanQuery.refetch(),
      ]);
    } finally {
      setPromotionBatchFlow('IDLE');
    }
  };

  const openPromotionBatchDrawer = (batchAssetId: string) => {
    setSelectedPromotionBatchAssetId(batchAssetId);
    setPromotionBatchErrorFilter('ALL');
    setPromotionBatchCodeFilter('ALL');
    setSelectedReplayErrorCodes([]);
    setPromotionBatchFailedPage(1);
    setPromotionBatchDrawerOpen(true);
  };

  const handleToggleReplayErrorCode = (code: string) => {
    setSelectedReplayErrorCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const handleReplayFailedPromotionBatch = async (
    batchAssetId: string,
    replayMode: 'RETRYABLE_ONLY' | 'ALL_FAILED' = 'RETRYABLE_ONLY',
  ) => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await replayFailedPromotionBatchMutation.mutateAsync({
        sessionId: activeSessionId,
        batchAssetId,
        maxConcurrency: 6,
        maxRetries: 1,
        replayMode,
      });
      const replay = result.data.replayResult;
      message.success(
        `失败项重放完成（${result.data.replayMode === 'RETRYABLE_ONLY' ? '仅可重试' : '全部失败项'}）：选择 ${result.data.selectedReplayCount}，成功 ${replay.succeededCount}，失败 ${replay.failedCount}${replay.batchId ? `，新批次 ${replay.batchId.slice(0, 8)}` : ''}`,
      );
    } catch (error) {
      showCopilotError(error, '重放失败项失败');
    }
  };

  const handleExportPromotionTasks = () => {
    if (!ephemeralPromotionTasks.length) {
      message.warning('暂无可导出的晋升任务');
      return;
    }
    const header = [
      'taskAssetId',
      'suggestedSkillCode',
      'status',
      'draftStatus',
      'hitCount',
      'reason',
      'lastAction',
      'lastActionAt',
      'createdAt',
    ];
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = ephemeralPromotionTasks.map((task) =>
      [
        task.taskAssetId,
        task.suggestedSkillCode,
        task.status,
        task.draftStatus || '',
        task.hitCount,
        task.reason || '',
        task.lastAction || '',
        task.lastActionAt || '',
        task.createdAt,
      ]
        .map((value) => escapeCsv(value))
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `promotion-tasks-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    message.success('已导出晋升任务');
  };

  const handleExportPromotionBatches = () => {
    if (!filteredPromotionTaskBatches.length) {
      message.warning('暂无可导出的批次记录');
      return;
    }
    const header = [
      'batchAssetId',
      'batchId',
      'action',
      'requestedCount',
      'succeededCount',
      'failedCount',
      'maxConcurrency',
      'maxRetries',
      'window',
      'statusFilter',
      'sourceBatchAssetId',
      'createdAt',
    ];
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredPromotionTaskBatches.map((item) =>
      [
        item.batchAssetId,
        item.batchId,
        item.action,
        item.requestedCount,
        item.succeededCount,
        item.failedCount,
        item.maxConcurrency,
        item.maxRetries,
        item.window || '',
        item.statusFilter || '',
        item.sourceBatchAssetId || '',
        item.createdAt,
      ]
        .map((value) => escapeCsv(value))
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `promotion-task-batches-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    message.success('已导出批次记录');
  };

  const handleExportPromotionBatchFailedRows = () => {
    if (!selectedPromotionBatch) {
      message.warning('请先选择批次');
      return;
    }
    if (!selectedPromotionBatchFailedRows.length) {
      message.warning('当前筛选条件下没有失败项');
      return;
    }
    const header = ['taskAssetId', 'errorCode', 'retryable', 'message'];
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = selectedPromotionBatchFailedRows.map((item) =>
      [
        item.taskAssetId || '',
        item.code || 'UNKNOWN',
        isRetryableBatchFailure(item) ? 'YES' : 'NO',
        item.message,
      ]
        .map((value) => escapeCsv(value))
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `promotion-batch-failed-${selectedPromotionBatch.batchId.slice(0, 8)}-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    message.success('已导出失败项');
  };

  const handleReplayBySelectedErrorCode = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!selectedPromotionBatch) {
      message.warning('请先选择批次');
      return;
    }
    if (!selectedReplayErrorCodes.length) {
      message.warning('请先选择至少一个错误码后再执行重放');
      return;
    }
    try {
      const result = await replayFailedPromotionBatchMutation.mutateAsync({
        sessionId: activeSessionId,
        batchAssetId: selectedPromotionBatch.batchAssetId,
        maxConcurrency: 6,
        maxRetries: 1,
        replayMode: 'ALL_FAILED',
        errorCodes: selectedReplayErrorCodes,
      });
      const replay = result.data.replayResult;
      message.success(
        `按错误码重放完成：${selectedReplayErrorCodes.join(', ')}，选择 ${result.data.selectedReplayCount}，成功 ${replay.succeededCount}，失败 ${replay.failedCount}`,
      );
    } catch (error) {
      showCopilotError(error, '按错误码重放失败');
    }
  };

  const normalizeTemplateArray = (input: Array<Record<string, unknown>>) => {
    return input
      .map((item) => {
        const key = typeof item.key === 'string' ? item.key.trim() : '';
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
        if (!key || !label || !prompt) {
          return null;
        }
        return { key, label, prompt };
      })
      .filter((item): item is QuickPromptTemplate => Boolean(item));
  };

  const collectDuplicates = (items: QuickPromptTemplate[], field: 'key' | 'label') => {
    const seen = new Map<string, number>();
    for (const item of items) {
      const value = item[field].trim();
      seen.set(value, (seen.get(value) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  };

  const persistTemplates = async (next: QuickPromptTemplate[]) => {
    setQuickPrompts(next);
    localStorage.setItem(`${QUICK_PROMPT_STORAGE_KEY_PREFIX}.${templateScope}`, JSON.stringify(next));
    try {
      await upsertPromptTemplatesMutation.mutateAsync({
        scope: templateScope,
        bindingId: activePromptTemplate?.id,
        templates: next,
      });
      message.success('模板保存成功（已同步到配置中心）');
    } catch {
      message.warning('模板已本地保存，但配置中心同步失败');
    } finally {
      setTemplateModalOpen(false);
    }
  };

  const handleSaveTemplates = async () => {
    try {
      const next =
        templateMode === 'FORM'
          ? templateDraft.filter((item) => item.key && item.label && item.prompt)
          : normalizeTemplateArray(JSON.parse(templateEditor) as Array<Record<string, unknown>>);

      if (!next.length) {
        message.error('至少保留一个有效模板（含 key/label/prompt）');
        return;
      }

      const duplicateKeys = collectDuplicates(next, 'key');
      if (duplicateKeys.length) {
        message.error(`存在重复 key：${duplicateKeys.join('、')}，请修改后保存`);
        return;
      }

      const duplicateLabels = collectDuplicates(next, 'label');
      if (duplicateLabels.length) {
        modal.confirm({
          title: '检测到重复模板名称',
          content: `重复名称：${duplicateLabels.join('、')}。是否继续保存？`,
          okText: '继续保存',
          cancelText: '返回修改',
          onOk: async () => {
            await persistTemplates(next);
          },
        });
        return;
      }

      await persistTemplates(next);
    } catch {
      message.error('JSON 解析失败，请检查格式');
    }
  };

  const handleTemplateScopeChange = (scope: CopilotPromptScope) => {
    setTemplateScope(scope);
  };

  const handleCopyFromOppositeScope = () => {
    const sourceTemplates = (oppositePromptTemplate?.metadata as Record<string, unknown> | undefined)
      ?.templates;
    if (!Array.isArray(sourceTemplates)) {
      message.warning('来源作用域暂无可复制模板');
      return;
    }

    const normalized = normalizeTemplateArray(sourceTemplates as Array<Record<string, unknown>>);
    if (!normalized.length) {
      message.warning('来源作用域模板无有效数据');
      return;
    }

    setTemplateDraft(normalized);
    setTemplateEditor(JSON.stringify(normalized, null, 2));
    setTemplateMode('FORM');
    message.success(`已从${getOppositeScope(templateScope) === 'PERSONAL' ? '个人' : '团队'}模板复制`);
  };

  const handleAddTemplate = () => {
    const idx = templateDraft.length + 1;
    setTemplateDraft([
      ...templateDraft,
      {
        key: `custom-${Date.now()}-${idx}`,
        label: `模板${idx}`,
        prompt: '',
      },
    ]);
  };

  const handleRemoveTemplate = (key: string) => {
    setTemplateDraft(templateDraft.filter((item) => item.key !== key));
  };

  const handleUpdateTemplate = (key: string, patch: Partial<QuickPromptTemplate>) => {
    setTemplateDraft(
      templateDraft.map((item) => {
        if (item.key !== key) {
          return item;
        }
        const nextLabel = patch.label ?? item.label;
        const nextKey =
          patch.key ??
          item.key ??
          `tmpl-${nextLabel.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '')}`;
        return {
          ...item,
          ...patch,
          key: nextKey,
        };
      }),
    );
  };

  const handleExportTemplates = () => {
    const payload = JSON.stringify(templateMode === 'FORM' ? templateDraft : quickPrompts, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ctbms-agent-copilot-templates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplatesClick = () => {
    templateFileInputRef.current?.click();
  };

  const handleImportTemplatesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        message.error('导入失败：JSON 必须是数组');
        return;
      }

      const normalized = normalizeTemplateArray(parsed);
      if (!normalized.length) {
        message.error('导入失败：未识别到有效模板');
        return;
      }

      setTemplateDraft(normalized);
      setTemplateEditor(JSON.stringify(normalized, null, 2));
      setTemplateMode('FORM');
      message.success(`导入成功，共 ${normalized.length} 个模板`);
    } catch {
      message.error('导入失败：文件不是合法 JSON');
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <BulbOutlined style={{ color: '#1677ff' }} />
            <Title level={4} style={{ margin: 0 }}>
              对话助手
            </Title>
            <Text type="secondary">像聊天一样提问，我会给你结果并协助发送</Text>
          </Space>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportPdf}
              loading={exportMutation.isPending}
              disabled={!resultQuery.data?.executionId}
            >
              导出报告 PDF
            </Button>
            {isAdminUser ? <Button onClick={handleExportDiagnostics}>导出诊断</Button> : null}
            {isAdminUser ? <Button onClick={openTemplateModal}>管理模板</Button> : null}
            {isAdminUser ? <Button onClick={openDeliveryProfileModal}>投递配置中心</Button> : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
              新建会话
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={8} lg={6}>
          <Card title="会话列表" bodyStyle={{ padding: 8 }}>
            {sessionList.length ? (
              <List
                size="small"
                dataSource={sessionList}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      borderRadius: 8,
                      padding: 10,
                      background: item.id === activeSessionId ? '#e6f4ff' : undefined,
                    }}
                    onClick={() => setActiveSessionId(item.id)}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text strong ellipsis>
                        {item.title || '未命名会话'}
                      </Text>
                      <Space>
                        <Tag color={stateColor[item.state] || 'default'}>
                          {sessionStateLabel[item.state] || item.state}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(item.updatedAt).toLocaleString('zh-CN')}
                        </Text>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={16} lg={18}>
          <Card title="对话区" bodyStyle={{ height: 700, display: 'flex', flexDirection: 'column' }}>
            <div ref={timelineRef} style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
              {allTurns.length ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {hiddenTurnCount > 0 ? (
                    <Button size="small" block onClick={() => setVisibleTurnCount((prev) => prev + LOAD_MORE_TURN_STEP)}>
                      加载更早消息（剩余 {hiddenTurnCount} 条）
                    </Button>
                  ) : null}
                  {visibleTurns.map((turn) => {
                    const roleText = toSafeText(turn.role || 'UNKNOWN');
                    const contentText = toSafeText(turn.content);
                    const turnPayload = (turn.structuredPayload ?? {}) as Record<string, unknown>;
                    const turnReplyOptions = Array.isArray(turnPayload.replyOptions)
                      ? turnPayload.replyOptions
                        .map((item) => item as Record<string, unknown>)
                        .map((item) => {
                          const tabValue =
                            item.tab === 'progress' ||
                              item.tab === 'result' ||
                              item.tab === 'delivery' ||
                              item.tab === 'schedule'
                              ? (item.tab as 'progress' | 'result' | 'delivery' | 'schedule')
                              : undefined;
                          return {
                            id:
                              typeof item.id === 'string'
                                ? item.id
                                : `reply_${Math.random().toString(36).slice(2, 8)}`,
                            label: typeof item.label === 'string' ? item.label : '',
                            mode: typeof item.mode === 'string' ? item.mode : 'SEND',
                            value: typeof item.value === 'string' ? item.value : undefined,
                            tab: tabValue,
                          };
                        })
                        .filter((item) => item.label)
                      : [];
                    const fallbackReplyOptions = (() => {
                      if (roleText !== 'ASSISTANT') {
                        return [] as Array<{
                          id: string;
                          label: string;
                          mode: string;
                          value?: string;
                          tab?: 'progress' | 'result' | 'delivery' | 'schedule';
                        }>;
                      }
                      if ((turn as LocalConversationTurn).failed) {
                        const retryMessage =
                          typeof turnPayload.retryMessage === 'string' ? turnPayload.retryMessage.trim() : '';
                        if (retryMessage) {
                          return [
                            {
                              id: 'retry_send',
                              label: '重试发送',
                              mode: 'SEND',
                              value: retryMessage,
                            },
                          ];
                        }
                      }

                      const missing = Array.isArray(turnPayload.missingSlots)
                        ? turnPayload.missingSlots.filter((item): item is string => typeof item === 'string')
                        : [];
                      if (missing.length > 0) {
                        return [
                          {
                            id: 'use_default_continue',
                            label: '用默认值继续',
                            mode: 'SEND',
                            value: '用默认值继续',
                          },
                        ];
                      }

                      const options: Array<{
                        id: string;
                        label: string;
                        mode: string;
                        value?: string;
                        tab?: 'progress' | 'result' | 'delivery' | 'schedule';
                      }> = [];
                      if (currentStatus === 'EXECUTING') {
                        options.push({ id: 'view_progress', label: '查看进展', mode: 'OPEN_TAB', tab: 'progress' });
                      }
                      options.push({ id: 'view_result', label: '查看结果', mode: 'OPEN_TAB', tab: 'result' });
                      if (latestArtifact?.exportTaskId) {
                        options.push({ id: 'send_report', label: '发送报告', mode: 'OPEN_TAB', tab: 'delivery' });
                      }
                      options.push({ id: 'set_schedule', label: '设置定时发送', mode: 'OPEN_TAB', tab: 'schedule' });
                      return options.slice(0, 4);
                    })();
                    const finalReplyOptions = turnReplyOptions.length ? turnReplyOptions : fallbackReplyOptions;
                    const isPendingTurn = Boolean((turn as LocalConversationTurn).pending);
                    const isFailedTurn = Boolean((turn as LocalConversationTurn).failed);
                    const looksLikeStructured =
                      roleText === 'SYSTEM' &&
                      contentText.length > SYSTEM_MESSAGE_COLLAPSE_MIN_LENGTH &&
                      (contentText.trim().startsWith('{') || contentText.trim().startsWith('['));
                    const looksLikeLongAssistantReply =
                      roleText === 'ASSISTANT' && contentText.length > ASSISTANT_MESSAGE_COLLAPSE_MIN_LENGTH;
                    const isLongContent = contentText.length > TURN_CONTENT_PREVIEW_LIMIT;
                    const isExpanded = Boolean(expandedTurnMap[turn.id]);
                    const displayedContent =
                      (isLongContent || looksLikeStructured || looksLikeLongAssistantReply) && !isExpanded
                        ? `${contentText.slice(0, TURN_CONTENT_PREVIEW_LIMIT)}\n...(内容较长，已折叠)`
                        : contentText;

                    return (
                      <div
                        key={turn.id}
                        style={{
                          alignSelf: roleText === 'USER' ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          background: roleText === 'USER' ? '#e6f4ff' : '#fafafa',
                          border: isFailedTurn ? '1px solid #ffccc7' : '1px solid #f0f0f0',
                          borderRadius: 10,
                          padding: '10px 12px',
                          opacity: isPendingTurn ? 0.75 : 1,
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {roleText === 'USER' ? '我' : roleText === 'ASSISTANT' ? '助手' : '系统'}
                        </Text>
                        <div
                          style={{
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.6,
                          }}
                        >
                          {looksLikeStructured && !isExpanded
                            ? summarizeStructuredMessage(contentText)
                            : looksLikeLongAssistantReply && !isExpanded
                              ? summarizeAssistantMessage(contentText)
                              : displayedContent}
                        </div>
                        {isPendingTurn ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            处理中...
                          </Text>
                        ) : null}
                        {isFailedTurn ? (
                          <Text type="danger" style={{ fontSize: 12 }}>
                            发送失败，可重试或改写后继续
                          </Text>
                        ) : null}
                        {isLongContent || looksLikeStructured || looksLikeLongAssistantReply ? (
                          <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, marginTop: 6 }}
                            onClick={() => {
                              setExpandedTurnMap((prev) => ({
                                ...prev,
                                [turn.id]: !prev[turn.id],
                              }));
                            }}
                          >
                            {isExpanded
                              ? '收起'
                              : looksLikeStructured
                                ? '展开系统详情'
                                : looksLikeLongAssistantReply
                                  ? '展开完整回复'
                                  : '展开全文'}
                          </Button>
                        ) : null}
                        {roleText === 'ASSISTANT' && finalReplyOptions.length > 0 && !isPendingTurn ? (
                          <Space wrap style={{ marginTop: 8 }}>
                            {finalReplyOptions.slice(0, 4).map((option) => (
                              <Button
                                key={`${turn.id}_${option.id}`}
                                size={compactActionSize}
                                onClick={() => void handleReplyOptionSelect(option)}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </Space>
                        ) : null}
                      </div>
                    );
                  })}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="在左侧选择会话并开始提问" />
              )}
            </div>

            <Divider style={{ margin: '8px 0' }} />
            <Space wrap style={{ marginBottom: 8 }}>
              {quickPrompts.map((item) => (
                <Button
                  key={item.key}
                  size="small"
                  icon={<MessageOutlined />}
                  loading={sendTurnMutation.isPending || createSessionMutation.isPending}
                  onClick={() => void handleQuickPromptSend(item.prompt)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="直接说你的问题，例如：分析最近一周东北玉米价格并给出三个月建议"
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={sendTurnMutation.isPending}
                onClick={handleSend}
                style={{ height: 'auto', width: 80 }}
              >
                发送
              </Button>
            </Space.Compact>

            <Card size="small" style={{ marginTop: 12, background: statusMeta.tone, borderColor: '#d9d9d9' }}>
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                <Space>
                  {statusMeta.icon}
                  <Text strong>{statusText}</Text>
                </Space>
                <Space wrap>
                  <Tag color={stateColor[currentStatus] || 'default'}>{statusText}</Tag>
                  {isAdminUser && latestPlan ? (
                    <Tag color="blue">{planTypeLabel[latestPlan.planType] || latestPlan.planType}</Tag>
                  ) : null}
                  {isAdminUser && latestPlan ? <Tag>第 {latestPlan.version} 版</Tag> : null}
                </Space>
                <Text type="secondary">
                  {resultQuery.data?.result
                    ? `已生成结论，当前置信度约 ${Math.round((resultQuery.data.result.confidence || 0) * 100)}%。`
                    : latestPlan
                      ? '我已准备好执行，你可以继续补充要求，或直接查看结果。'
                      : '先提问，我会自动理解需求并给出可执行方案。'}
                </Text>
                <Text style={{ fontSize: 13 }}>{nextActionHint}</Text>
                <Space wrap>
                  <Button style={{ minHeight: 36 }} onClick={() => openDetailTab('progress')}>
                    查看进展
                  </Button>
                  <Button style={{ minHeight: 36 }} onClick={() => openDetailTab('result')}>
                    查看结果
                  </Button>
                  <Button style={{ minHeight: 36 }} onClick={() => openDetailTab('delivery')} disabled={!latestArtifact?.exportTaskId}>
                    发送报告
                  </Button>
                  <Button style={{ minHeight: 36 }} onClick={() => openDetailTab('schedule')}>
                    定时发送
                  </Button>
                  {isAdminUser ? (
                    <Button style={{ minHeight: 36 }} onClick={() => openDetailTab('advanced')}>
                      管理工具
                    </Button>
                  ) : null}
                </Space>
              </Space>
            </Card>
          </Card>
        </Col>
      </Row>

      <Drawer
        title="会话详情"
        open={detailDrawerOpen}
        width={screens.md ? 460 : '100%'}
        onClose={() => setDetailDrawerOpen(false)}
        destroyOnClose={false}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Segmented
            block
            value={detailTab}
            options={[
              { label: '进展', value: 'progress' },
              { label: '结果', value: 'result' },
              { label: '发送', value: 'delivery' },
              { label: '定时', value: 'schedule' },
              ...(isAdminUser ? [{ label: '高级', value: 'advanced' as const }] : []),
            ]}
            onChange={(value) => setDetailTab(value as 'progress' | 'result' | 'delivery' | 'schedule' | 'advanced')}
          />

          {detailTab === 'progress' ? (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Text strong>执行进展</Text>
              <Timeline
                items={executionTimeline.map((item) => ({
                  color: item.done ? 'green' : 'gray',
                  children: (
                    <Space>
                      <Text>{item.label}</Text>
                      <Tag color={item.done ? 'success' : 'default'}>{item.done ? '完成' : '待处理'}</Tag>
                    </Space>
                  ),
                }))}
              />
              {latestPlan ? (
                <Card size="small">
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">方案类型</Text>
                    <Text>{planTypeLabel[latestPlan.planType] || latestPlan.planType}</Text>
                    <Text type="secondary">使用的工具</Text>
                    <Space wrap>
                      {planSkills.map((skill) => (
                        <Tag key={skill}>{skill}</Tag>
                      ))}
                    </Space>
                    <Text type="secondary">预计耗时</Text>
                    <Text>{planSnapshot?.estimatedCost?.latencyMs ?? '-'} ms</Text>
                  </Space>
                </Card>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行方案" />
              )}
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={confirmPlanMutation.isPending}
                onClick={handleConfirmPlan}
                disabled={!latestPlan || latestPlan.isConfirmed}
                block
              >
                {latestPlan?.isConfirmed ? '方案已确认' : '确认并开始执行'}
              </Button>
            </Space>
          ) : null}

          {detailTab === 'result' ? (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              {resultQuery.data?.result ? (
                <>
                  <Alert
                    type={resultQuery.data.status === 'FAILED' ? 'error' : 'info'}
                    showIcon
                    message={`当前状态：${sessionStateLabel[resultQuery.data.status] || resultQuery.data.status}`}
                    description={resultQuery.data.error ?? `置信度：${resultQuery.data.result.confidence}`}
                  />
                  <Progress
                    percent={Math.max(0, Math.min(100, Math.round(resultQuery.data.result.confidence * 100)))}
                    size="small"
                    status={resultQuery.data.status === 'FAILED' ? 'exception' : 'active'}
                  />
                  <Text strong>分析结论</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {expandResultAnalysis || resultAnalysisText.length <= RESULT_ANALYSIS_PREVIEW_LIMIT
                      ? resultAnalysisText
                      : `${resultAnalysisText.slice(0, RESULT_ANALYSIS_PREVIEW_LIMIT)}\n...(内容较长，已折叠)`}
                  </Paragraph>
                  {resultAnalysisText.length > RESULT_ANALYSIS_PREVIEW_LIMIT ? (
                    <Button
                      size="small"
                      type="link"
                      style={{ padding: 0, width: 'fit-content' }}
                      onClick={() => setExpandResultAnalysis((prev) => !prev)}
                    >
                      {expandResultAnalysis ? '收起结论' : '展开完整结论'}
                    </Button>
                  ) : null}

                  <Space wrap>
                    <Button
                      icon={<PlayCircleOutlined />}
                      loading={createBacktestMutation.isPending}
                      onClick={handleCreateBacktest}
                      disabled={!resultQuery.data?.executionId}
                    >
                      验证效果
                    </Button>
                    <Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={handleExportPdf}>
                      导出报告 PDF
                    </Button>
                    {latestArtifact?.downloadUrl ? (
                      <Button type="link" href={latestArtifact.downloadUrl} target="_blank" rel="noreferrer">
                        下载最新附件
                      </Button>
                    ) : null}
                  </Space>

                  {backtestQuery.data ? (
                    <Card size="small">
                      <Space direction="vertical" style={{ width: '100%' }} size={6}>
                        <Alert
                          type={
                            backtestQuery.data.status === 'FAILED'
                              ? 'error'
                              : backtestQuery.data.status === 'COMPLETED'
                                ? 'success'
                                : 'info'
                          }
                          showIcon
                          message={`验证状态：${backtestStatusLabel[backtestQuery.data.status] || backtestQuery.data.status}`}
                          description={
                            backtestQuery.data.status === 'COMPLETED'
                              ? `收益 ${backtestQuery.data.summary?.returnPct ?? '-'}%，胜率 ${backtestQuery.data.summary?.winRatePct ?? '-'}%。`
                              : backtestQuery.data.errorMessage || '验证处理中'
                          }
                        />
                        <Button size="small" onClick={() => setBacktestDetailModalOpen(true)}>
                          查看验证详情
                        </Button>
                      </Space>
                    </Card>
                  ) : null}

                  {conflictsQuery.data ? (
                    <Card size="small">
                      <Space direction="vertical" style={{ width: '100%' }} size={6}>
                        <Alert
                          type={conflictList.length > 0 ? 'warning' : 'success'}
                          showIcon
                          message={`一致性：${Math.round(conflictsQuery.data.consistencyScore * 100)}%`}
                          description={
                            conflictList.length > 0
                              ? `检测到 ${conflictList.length} 条来源差异。`
                              : '未检测到显著冲突'
                          }
                        />
                        {conflictList.length > 0 ? (
                          <Button size="small" onClick={() => setConflictDetailModalOpen(true)}>
                            查看一致性详情
                          </Button>
                        ) : null}
                      </Space>
                    </Card>
                  ) : null}
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有结果，先发送问题或确认执行" />
              )}
            </Space>
          ) : null}

          {detailTab === 'delivery' ? (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Text strong>发送报告</Text>
              <Space wrap>
                <Button
                  icon={<MailOutlined />}
                  loading={deliverMutation.isPending}
                  onClick={() => {
                    setDeliveryChannel('EMAIL');
                    setDeliveryTemplateCode('DEFAULT');
                    setDeliveryAdvancedOpen(false);
                    setEmailModalOpen(true);
                  }}
                  disabled={!latestArtifact?.exportTaskId}
                >
                  发到邮箱
                </Button>
                <Button
                  loading={deliverMutation.isPending}
                  onClick={() => {
                    setDeliveryChannel('DINGTALK');
                    setDeliveryTemplateCode('MORNING_BRIEF');
                    setDeliveryAdvancedOpen(false);
                    setEmailModalOpen(true);
                  }}
                  disabled={!latestArtifact?.exportTaskId}
                >
                  发到钉钉
                </Button>
                <Button
                  loading={deliverMutation.isPending}
                  onClick={() => {
                    setDeliveryChannel('WECOM');
                    setDeliveryTemplateCode('WEEKLY_REVIEW');
                    setDeliveryAdvancedOpen(false);
                    setEmailModalOpen(true);
                  }}
                  disabled={!latestArtifact?.exportTaskId}
                >
                  发到企业微信
                </Button>
                <Button
                  loading={deliverMutation.isPending}
                  onClick={() => {
                    setDeliveryChannel('FEISHU');
                    setDeliveryTemplateCode('RISK_ALERT');
                    setDeliveryAdvancedOpen(false);
                    setEmailModalOpen(true);
                  }}
                  disabled={!latestArtifact?.exportTaskId}
                >
                  发到飞书
                </Button>
              </Space>

              <Text strong>最近发送记录</Text>
              <List
                size="small"
                dataSource={visibleDeliveryLogs}
                locale={{ emptyText: '暂无发送记录' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space>
                        <Tag>{channelLabel[item.channel] || item.channel}</Tag>
                        <Tag color={statusColor[item.status] || 'processing'}>
                          {deliveryStatusLabel[item.status] || item.status}
                        </Tag>
                      </Space>
                      {item.target ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          目标：{item.target}
                        </Text>
                      ) : null}
                      {item.errorMessage ? (
                        <Text type="danger" style={{ fontSize: 12 }}>
                          {item.errorMessage}
                        </Text>
                      ) : null}
                    </Space>
                  </List.Item>
                )}
              />
              {deliveryLogs.length > 3 ? (
                <Button type="link" style={{ padding: 0, width: 'fit-content' }} onClick={() => setShowAllDeliveryLogs((v) => !v)}>
                  {showAllDeliveryLogs ? '收起发送记录' : `查看全部发送记录（${deliveryLogs.length}）`}
                </Button>
              ) : null}

              {artifacts.length > 0 ? (
                <>
                  <List
                    size="small"
                    dataSource={visibleArtifacts}
                    renderItem={(item) => (
                      <List.Item
                        actions={
                          item.downloadUrl
                            ? [
                              <a key="download" href={item.downloadUrl} target="_blank" rel="noreferrer">
                                下载
                              </a>,
                            ]
                            : []
                        }
                      >
                        <Space>
                          <Tag>{item.type}</Tag>
                          <Tag color={item.status === 'COMPLETED' ? 'success' : 'processing'}>
                            {item.status === 'COMPLETED' ? '已完成' : item.status}
                          </Tag>
                        </Space>
                      </List.Item>
                    )}
                  />
                  {artifacts.length > 3 ? (
                    <Button type="link" style={{ padding: 0, width: 'fit-content' }} onClick={() => setShowAllArtifacts((v) => !v)}>
                      {showAllArtifacts ? '收起导出记录' : `查看全部导出记录（${artifacts.length}）`}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </Space>
          ) : null}

          {detailTab === 'schedule' ? (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Text strong>定时发送</Text>
              <Input value={subscriptionName} onChange={(e) => setSubscriptionName(e.target.value)} placeholder="任务名称" />
              <Input
                value={subscriptionCronExpr}
                onChange={(e) => setSubscriptionCronExpr(e.target.value)}
                placeholder="执行时间（cron），例如 0 0 8 * * 1"
              />
              <Button
                type="primary"
                onClick={handleCreateSubscription}
                loading={createSubscriptionMutation.isPending}
                disabled={!latestPlan}
                block
              >
                创建定时任务
              </Button>
              <Input.TextArea
                value={scheduleInstruction}
                onChange={(e) => setScheduleInstruction(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="也可以直接说：每周一9点发到企业微信群ops-group-01"
              />
              <Button onClick={handleResolveSchedule} loading={resolveScheduleMutation.isPending} block>
                用自然语言配置
              </Button>

              <List
                size="small"
                dataSource={visibleSubscriptions}
                locale={{ emptyText: '暂无定时任务' }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        key="toggle"
                        size={compactActionSize}
                        loading={updateSubscriptionMutation.isPending}
                        onClick={() =>
                          void handleToggleSubscription(
                            item.id,
                            item.status as 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED',
                          )
                        }
                      >
                        {item.status === 'ACTIVE' ? '暂停' : '恢复'}
                      </Button>,
                      <Button
                        key="rerun"
                        size={compactActionSize}
                        loading={runSubscriptionMutation.isPending}
                        onClick={() => void handleRunSubscriptionNow(item.id)}
                      >
                        立即补跑
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space>
                        <Text strong>{item.name}</Text>
                        <Tag color={statusColor[item.status] || 'default'}>
                          {subscriptionStatusLabel[item.status] || item.status}
                        </Tag>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        时间：{item.cronExpr}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        下次执行：{item.nextRunAt ? new Date(item.nextRunAt).toLocaleString('zh-CN') : '-'}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
              {subscriptionList.length > 5 ? (
                <Button type="link" style={{ padding: 0, width: 'fit-content' }} onClick={() => setShowAllSubscriptions((v) => !v)}>
                  {showAllSubscriptions ? '收起定时任务' : `查看全部定时任务（${subscriptionList.length}）`}
                </Button>
              ) : null}
            </Space>
          ) : null}

          {detailTab === 'advanced' && isAdminUser ? (
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Space wrap>
                <Button onClick={openTemplateModal}>管理快捷模板</Button>
                <Button onClick={openDeliveryProfileModal}>投递配置中心</Button>
                <Button onClick={openRoutingPolicyModal}>能力路由策略</Button>
                <Button onClick={openEphemeralPolicyModal}>临时能力策略</Button>
                <Button onClick={handleExportDiagnostics}>导出诊断</Button>
              </Space>

              <Divider style={{ margin: '4px 0' }} />
              <Text strong>能力草稿与安全管理</Text>
              <Space wrap>
                <Button onClick={handleCreateSkillDraft} loading={createSkillDraftMutation.isPending} icon={<PlusOutlined />}>
                  创建能力草稿
                </Button>
                <Button
                  onClick={handleSandboxSkillDraft}
                  loading={sandboxSkillDraftMutation.isPending}
                  disabled={!latestSkillDraftId}
                >
                  沙箱测试
                </Button>
                <Button
                  onClick={handleSubmitSkillDraftReview}
                  loading={submitSkillDraftReviewMutation.isPending}
                  disabled={!latestSkillDraftId}
                >
                  提交审核
                </Button>
                <Button
                  onClick={handleApproveSkillDraft}
                  loading={reviewSkillDraftMutation.isPending}
                  disabled={!latestSkillDraftId}
                >
                  审核通过
                </Button>
                <Button
                  type="primary"
                  onClick={handlePublishSkillDraft}
                  loading={publishSkillDraftMutation.isPending}
                  disabled={!latestSkillDraftId}
                >
                  发布能力
                </Button>
              </Space>
              {latestSkillDraftId ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前草稿 ID：{latestSkillDraftId}
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  暂无能力草稿
                </Text>
              )}

              {governanceOverviewQuery.data ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Alert
                    type={governanceOverviewQuery.data.highRiskPendingReview > 0 ? 'warning' : 'info'}
                    showIcon
                    message={`安全看板：活跃试用权限 ${governanceOverviewQuery.data.activeRuntimeGrants}，1小时内过期 ${governanceOverviewQuery.data.runtimeGrantsExpiringIn1h}，高风险待审 ${governanceOverviewQuery.data.highRiskPendingReview}`}
                  />
                  <Button
                    size="small"
                    loading={governanceHousekeepingMutation.isPending}
                    onClick={handleGovernanceHousekeeping}
                  >
                    立即清理
                  </Button>
                </Space>
              ) : null}

              {runtimeGrants.length ? (
                <List
                  size="small"
                  dataSource={runtimeGrants}
                  renderItem={(item) => (
                    <List.Item
                      actions={
                        item.status === 'ACTIVE'
                          ? [
                            <Button
                              key="use"
                              size={compactActionSize}
                              loading={consumeRuntimeGrantMutation.isPending}
                              onClick={() => void handleConsumeRuntimeGrant(item.id)}
                            >
                              记录使用
                            </Button>,
                            <Button
                              key="revoke"
                              size={compactActionSize}
                              loading={revokeRuntimeGrantMutation.isPending}
                              onClick={() => void handleRevokeRuntimeGrant(item.id)}
                            >
                              撤销
                            </Button>,
                          ]
                          : []
                      }
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space>
                          <Tag color={statusColor[item.status] || 'default'}>
                            {runtimeGrantStatusLabel[item.status] || item.status}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            使用 {item.useCount}/{item.maxUseCount}
                          </Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          过期：{new Date(item.expiresAt).toLocaleString('zh-CN')}
                        </Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : null}

              {governanceEvents.length ? (
                <>
                  <List
                    size="small"
                    dataSource={visibleGovernanceEvents}
                    renderItem={(item) => (
                      <List.Item>
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Space>
                            <Tag>{governanceEventLabel[item.eventType] || item.eventType}</Tag>
                            <Text>{formatGovernanceEventMessage(item)}</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(item.createdAt).toLocaleString('zh-CN')}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                  {governanceEvents.length > 5 ? (
                    <Button
                      type="link"
                      style={{ padding: 0, width: 'fit-content' }}
                      onClick={() => setShowAllGovernanceEvents((v) => !v)}
                    >
                      {showAllGovernanceEvents ? '收起治理记录' : `查看全部治理记录（${governanceEvents.length}）`}
                    </Button>
                  ) : null}
                </>
              ) : null}

              <Divider style={{ margin: '4px 0' }} />
              <Text strong>能力路由记录</Text>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Segmented
                  size="small"
                  value={routingSummaryWindow}
                  options={[
                    { label: '近1小时', value: '1h' },
                    { label: '近24小时', value: '24h' },
                    { label: '近7天', value: '7d' },
                  ]}
                  onChange={(value) => setRoutingSummaryWindow(value as '1h' | '24h' | '7d')}
                />
                <Button size="small" onClick={handleExportRoutingSummary}>
                  导出汇总报告
                </Button>
              </Space>
              {ephemeralCapabilitySummary ? (
                <Card size="small">
                  <Space direction="vertical" style={{ width: '100%' }} size={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      临时能力概览：草稿 {ephemeralCapabilitySummary.totals.drafts}，授权 {ephemeralCapabilitySummary.totals.runtimeGrants}，24h 内到期 {ephemeralCapabilitySummary.totals.expiringRuntimeGrantsIn24h}，陈旧草稿 {ephemeralCapabilitySummary.totals.staleDrafts}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      热门能力：
                      {ephemeralCapabilitySummary.stats.topSkillCodes
                        .slice(0, 3)
                        .map((item) => `${item.key}(${item.count})`)
                        .join(' / ') || '-'}
                    </Text>
                    <Space>
                      <Button
                        size="small"
                        loading={runEphemeralHousekeepingMutation.isPending}
                        onClick={handleRunEphemeralHousekeeping}
                      >
                        立即清理临时能力
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        loading={applyEphemeralEvolutionMutation.isPending}
                        onClick={handleApplyEphemeralEvolution}
                      >
                        执行进化方案
                      </Button>
                    </Space>
                    {ephemeralEvolutionPlan ? (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          进化建议：晋升候选 {ephemeralEvolutionPlan.recommendations.promoteDraftCandidates.length}，陈旧草稿 {ephemeralEvolutionPlan.recommendations.staleDraftCandidates.length}，过期授权 {ephemeralEvolutionPlan.recommendations.expiredGrantCandidates.length}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          热门候选：
                          {ephemeralEvolutionPlan.recommendations.promoteDraftCandidates
                            .slice(0, 3)
                            .map((item) => `${item.suggestedSkillCode}(${item.hitCount})`)
                            .join(' / ') || '-'}
                        </Text>
                        {ephemeralPromotionTaskSummary ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            任务概览：总计 {ephemeralPromotionTaskSummary.totalTasks}，待处理 {ephemeralPromotionTaskSummary.pendingActionCount}，已关联发布 {ephemeralPromotionTaskSummary.publishedLinkedCount}
                          </Text>
                        ) : null}
                        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                          <Segmented
                            size="small"
                            value={promotionTaskStatusFilter}
                            options={[
                              { label: '全部', value: 'ALL' },
                              { label: '待处理', value: 'PENDING_REVIEW' },
                              { label: '审核中', value: 'IN_REVIEW' },
                              { label: '已通过', value: 'APPROVED' },
                              { label: '已拒绝', value: 'REJECTED' },
                              { label: '已发布', value: 'PUBLISHED' },
                            ]}
                            onChange={(value) =>
                              setPromotionTaskStatusFilter(
                                value as
                                | 'ALL'
                                | 'PENDING_REVIEW'
                                | 'IN_REVIEW'
                                | 'APPROVED'
                                | 'REJECTED'
                                | 'PUBLISHED',
                              )
                            }
                          />
                          <Space wrap>
                            <Button
                              size="small"
                              loading={batchUpdateEphemeralPromotionTasksMutation.isPending}
                              onClick={handleBatchSyncPromotionTasks}
                            >
                              批量同步状态
                            </Button>
                            <Button
                              size="small"
                              loading={batchUpdateEphemeralPromotionTasksMutation.isPending}
                              onClick={handleBatchMarkReviewing}
                            >
                              批量推进审核中
                            </Button>
                            <Button
                              size="small"
                              loading={promotionBatchFlow === 'SUBMIT_REVIEW'}
                              onClick={() => void runPromotionTaskBatchFlow('SUBMIT_REVIEW')}
                            >
                              批量提交审核
                            </Button>
                            <Button
                              size="small"
                              loading={promotionBatchFlow === 'APPROVE'}
                              onClick={() => void runPromotionTaskBatchFlow('APPROVE')}
                            >
                              批量审批通过
                            </Button>
                            <Button
                              size="small"
                              type="primary"
                              loading={promotionBatchFlow === 'PUBLISH'}
                              onClick={() => void runPromotionTaskBatchFlow('PUBLISH')}
                            >
                              批量发布能力
                            </Button>
                            <Button size="small" onClick={handleExportPromotionTasks}>
                              导出任务清单
                            </Button>
                          </Space>
                        </Space>
                        <List
                          size="small"
                          dataSource={ephemeralPromotionTasks.slice(0, 6)}
                          locale={{ emptyText: '暂无晋升任务，执行进化方案后会自动生成' }}
                          renderItem={(task) => (
                            <List.Item
                              actions={[
                                <Button
                                  key="sync"
                                  size="small"
                                  loading={updateEphemeralPromotionTaskMutation.isPending}
                                  onClick={() => void handleUpdatePromotionTask(task.taskAssetId, 'SYNC_DRAFT_STATUS')}
                                >
                                  同步状态
                                </Button>,
                                <Button
                                  key="submit"
                                  size="small"
                                  onClick={() => void handleSubmitReviewForTask(task.taskAssetId, task.draftId)}
                                  loading={submitSkillDraftReviewMutation.isPending}
                                >
                                  提交审核
                                </Button>,
                                <Button
                                  key="approve"
                                  size="small"
                                  onClick={() => void handleApproveForTask(task.taskAssetId, task.draftId)}
                                  loading={reviewSkillDraftMutation.isPending}
                                >
                                  审核通过
                                </Button>,
                                <Button
                                  key="publish"
                                  size="small"
                                  type="primary"
                                  onClick={() => void handlePublishForTask(task.taskAssetId, task.draftId)}
                                  loading={publishSkillDraftMutation.isPending}
                                >
                                  发布能力
                                </Button>,
                              ]}
                            >
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Space wrap>
                                  <Tag color={task.status === 'PUBLISHED' ? 'green' : task.status === 'REJECTED' ? 'red' : 'blue'}>
                                    {promotionTaskStatusLabel[task.status] || task.status}
                                  </Tag>
                                  <Text strong>{task.suggestedSkillCode}</Text>
                                  <Text type="secondary">命中 {task.hitCount}</Text>
                                  <Text type="secondary">草稿状态 {task.draftStatus || '-'}</Text>
                                </Space>
                                {task.reason ? (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {task.reason}
                                  </Text>
                                ) : null}
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {task.lastActionAt
                                    ? `最近操作：${task.lastAction || '-'}（${new Date(task.lastActionAt).toLocaleString('zh-CN')}）`
                                    : `创建时间：${new Date(task.createdAt).toLocaleString('zh-CN')}`}
                                </Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          批次记录（最近20条）
                        </Text>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                          <Space wrap>
                            <Segmented
                              size="small"
                              value={promotionBatchActionFilter}
                              options={[
                                { label: '全部动作', value: 'ALL' },
                                { label: '同步状态', value: 'SYNC_DRAFT_STATUS' },
                                { label: '推进审核', value: 'START_REVIEW' },
                                { label: '标记通过', value: 'MARK_APPROVED' },
                                { label: '标记发布', value: 'MARK_PUBLISHED' },
                              ]}
                              onChange={(value) =>
                                setPromotionBatchActionFilter(
                                  value as
                                  | 'ALL'
                                  | 'START_REVIEW'
                                  | 'MARK_APPROVED'
                                  | 'MARK_REJECTED'
                                  | 'MARK_PUBLISHED'
                                  | 'SYNC_DRAFT_STATUS',
                                )
                              }
                            />
                            <Segmented
                              size="small"
                              value={promotionBatchOutcomeFilter}
                              options={[
                                { label: '全部结果', value: 'ALL' },
                                { label: '有失败', value: 'HAS_FAILURE' },
                                { label: '全成功', value: 'ALL_SUCCESS' },
                              ]}
                              onChange={(value) =>
                                setPromotionBatchOutcomeFilter(value as 'ALL' | 'HAS_FAILURE' | 'ALL_SUCCESS')
                              }
                            />
                          </Space>
                          <Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              当前筛选 {filteredPromotionTaskBatches.length} 条
                            </Text>
                            <Button size="small" onClick={handleExportPromotionBatches}>
                              导出批次清单
                            </Button>
                          </Space>
                        </Space>
                        <List
                          size="small"
                          dataSource={filteredPromotionTaskBatches.slice(0, 6)}
                          locale={{ emptyText: '暂无批次记录' }}
                          renderItem={(batch) => (
                            <List.Item
                              actions={[
                                <Button
                                  key="detail"
                                  size="small"
                                  onClick={() => openPromotionBatchDrawer(batch.batchAssetId)}
                                >
                                  查看详情
                                </Button>,
                                <Button
                                  key="replay"
                                  size="small"
                                  disabled={batch.failedCount <= 0}
                                  loading={replayFailedPromotionBatchMutation.isPending}
                                  onClick={() => void handleReplayFailedPromotionBatch(batch.batchAssetId, 'RETRYABLE_ONLY')}
                                >
                                  重放可重试
                                </Button>,
                                <Button
                                  key="replay-all"
                                  size="small"
                                  disabled={batch.failedCount <= 0}
                                  loading={replayFailedPromotionBatchMutation.isPending}
                                  onClick={() => void handleReplayFailedPromotionBatch(batch.batchAssetId, 'ALL_FAILED')}
                                >
                                  重放全部
                                </Button>,
                              ]}
                            >
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Space wrap>
                                  <Tag>
                                    {promotionBatchActionLabel[batch.action] || batch.action}
                                  </Tag>
                                  <Text type="secondary">并发 {batch.maxConcurrency}</Text>
                                  <Text type="secondary">重试 {batch.maxRetries}</Text>
                                  <Text type="secondary">
                                    成功 {batch.succeededCount} / 失败 {batch.failedCount}
                                  </Text>
                                </Space>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  批次ID：{batch.batchId.slice(0, 8)}，创建于{' '}
                                  {new Date(batch.createdAt).toLocaleString('zh-CN')}
                                </Text>
                                {batch.sourceBatchAssetId ? (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    重放来源批次：{batch.sourceBatchAssetId.slice(0, 8)}
                                  </Text>
                                ) : null}
                              </Space>
                            </List.Item>
                          )}
                        />
                      </>
                    ) : null}
                  </Space>
                </Card>
              ) : null}
              {capabilityRoutingSummary ? (
                <Card size="small">
                  <Space direction="vertical" style={{ width: '100%' }} size={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      最近样本：{capabilityRoutingSummary.sampleWindow.totalLogs} 条（窗口上限 {capabilityRoutingSummary.sampleWindow.analyzedLimit}）
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      类型分布：
                      {capabilityRoutingSummary.stats.routeType
                        .slice(0, 3)
                        .map((item) => `${capabilityRouteTypeLabel[item.key] || item.key} ${item.count}`)
                        .join(' / ') || '-'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      来源分布：
                      {capabilityRoutingSummary.stats.selectedSource
                        .slice(0, 3)
                        .map((item) => `${item.key} ${item.count}`)
                        .join(' / ') || '-'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前生效策略：
                      {formatRoutePolicyDetails({
                        capabilityRoutingPolicy:
                          capabilityRoutingSummary.effectivePolicies.capabilityRoutingPolicy as unknown as Record<
                            string,
                            unknown
                          >,
                        ephemeralCapabilityPolicy:
                          capabilityRoutingSummary.effectivePolicies.ephemeralCapabilityPolicy as unknown as Record<
                            string,
                            unknown
                          >,
                      })}
                    </Text>
                  </Space>
                </Card>
              ) : null}
              <List
                size="small"
                dataSource={capabilityRoutingLogs.slice(0, 8)}
                locale={{ emptyText: '暂无能力路由记录' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space>
                        <Tag>{capabilityRouteTypeLabel[item.routeType] || item.routeType}</Tag>
                        <Text type="secondary">来源：{item.selectedSource || '-'}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        分数：{Number.isFinite(item.selectedScore) ? item.selectedScore.toFixed(3) : '-'}
                      </Text>
                      {item.routePolicyDetails ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatRoutePolicyDetails(item.routePolicyDetails)}
                        </Text>
                      ) : null}
                      {item.reason ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.reason}
                        </Text>
                      ) : null}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />

              <Divider style={{ margin: '4px 0' }} />
              <Text strong>会话结果复用</Text>
              {latestReuseResolution ? (
                <Alert
                  type={latestReuseResolution.semanticResolution?.ambiguous ? 'warning' : 'info'}
                  showIcon
                  message={
                    latestReuseResolution.semanticResolution?.selectedAssetTitle
                      ? `本轮已复用：${latestReuseResolution.semanticResolution.selectedAssetTitle}`
                      : `本轮复用资产 ${latestReuseResolution.explicitAssetRefCount ?? 0} 项`
                  }
                />
              ) : null}
              {latestSemanticCandidates.length > 1 ? (
                <Space wrap>
                  {latestSemanticCandidates.slice(0, 3).map((candidate, index) => (
                    <Button key={candidate.id} size={compactActionSize} onClick={() => void handleSelectSemanticCandidate(index + 1)}>
                      用第{index + 1}个：{candidate.title}
                    </Button>
                  ))}
                </Space>
              ) : null}
              <List
                size="small"
                dataSource={conversationAssets.slice(0, 8)}
                locale={{ emptyText: '暂无可复用资产' }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        key="reuse"
                        size="small"
                        loading={reuseAssetMutation.isPending}
                        onClick={() => void handleReuseAsset(item.id, item.title)}
                      >
                        继续基于此结果
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space>
                        <Tag>{assetTypeLabel[item.assetType] || item.assetType}</Tag>
                        <Text strong>{item.title}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />

              {(missingSlots.length > 0 || proposedPlanFromTurn) && (
                <>
                  <Divider style={{ margin: '4px 0' }} />
                  {missingSlots.length > 0 ? (
                    <Alert type="warning" showIcon message="待补充信息" description={missingSlots.join('、')} />
                  ) : null}
                  {proposedPlanFromTurn ? (
                    <Card size="small">
                      <Space direction="vertical" size={4}>
                        <Text type="secondary">方案 ID</Text>
                        <Text code>{String(proposedPlanFromTurn.planId ?? '-')}</Text>
                        <Text type="secondary">方案类型</Text>
                        <Tag color="blue">{String(proposedPlanFromTurn.planType ?? '-')}</Tag>
                      </Space>
                    </Card>
                  ) : null}
                </>
              )}
            </Space>
          ) : null}
        </Space>
      </Drawer>

      <Drawer
        title="批次失败详情"
        open={promotionBatchDrawerOpen}
        width={720}
        onClose={() => setPromotionBatchDrawerOpen(false)}
      >
        {selectedPromotionBatch ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type="info"
              showIcon
              message={`批次 ${selectedPromotionBatch.batchId.slice(0, 8)} · ${promotionBatchActionLabel[selectedPromotionBatch.action] || selectedPromotionBatch.action}`}
              description={`总计 ${selectedPromotionBatch.requestedCount}，成功 ${selectedPromotionBatch.succeededCount}，失败 ${selectedPromotionBatch.failedCount}，并发 ${selectedPromotionBatch.maxConcurrency}，重试 ${selectedPromotionBatch.maxRetries}`}
            />
            <Space wrap>
              <Text type="secondary">错误类型：</Text>
              <Segmented
                size="small"
                value={promotionBatchErrorFilter}
                options={[
                  { label: '全部', value: 'ALL' },
                  { label: '可重试', value: 'RETRYABLE' },
                  { label: '不可重试', value: 'NON_RETRYABLE' },
                ]}
                onChange={(value) => setPromotionBatchErrorFilter(value as 'ALL' | 'RETRYABLE' | 'NON_RETRYABLE')}
              />
            </Space>
            <Space wrap>
              <Button
                size="small"
                type={promotionBatchCodeFilter === 'ALL' ? 'primary' : 'default'}
                onClick={() => setPromotionBatchCodeFilter('ALL')}
              >
                全部错误码
              </Button>
              {selectedPromotionBatchCodeStats.slice(0, 8).map((item) => (
                <Button
                  key={item.code}
                  size="small"
                  type={promotionBatchCodeFilter === item.code ? 'primary' : 'default'}
                  onClick={() => setPromotionBatchCodeFilter(item.code)}
                >
                  {item.code} ({item.count})
                </Button>
              ))}
            </Space>
            <Space wrap>
              <Text type="secondary">重放错误码：</Text>
              {selectedPromotionBatchCodeStats.slice(0, 12).map((item) => (
                <Button
                  key={`replay-${item.code}`}
                  size="small"
                  type={selectedReplayErrorCodes.includes(item.code) ? 'primary' : 'default'}
                  onClick={() => handleToggleReplayErrorCode(item.code)}
                >
                  {item.code}
                </Button>
              ))}
              <Button size="small" onClick={() => setSelectedReplayErrorCodes([])}>
                清空选择
              </Button>
            </Space>
            <Space wrap>
              <Button size="small" onClick={handleExportPromotionBatchFailedRows}>
                导出当前失败项
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={!selectedReplayErrorCodes.length}
                loading={replayFailedPromotionBatchMutation.isPending}
                onClick={() => void handleReplayBySelectedErrorCode()}
              >
                按错误码重放
              </Button>
            </Space>
            <List
              size="small"
              dataSource={selectedPromotionBatchFailedPageRows}
              locale={{ emptyText: '当前筛选下无失败项' }}
              pagination={{
                current: promotionBatchFailedPage,
                pageSize: PROMOTION_BATCH_FAILED_PAGE_SIZE,
                total: selectedPromotionBatchFailedRows.length,
                onChange: (page) => setPromotionBatchFailedPage(page),
                showSizeChanger: false,
              }}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Space wrap>
                      <Tag>{item.code || 'UNKNOWN'}</Tag>
                      <Text type="secondary">任务 {item.taskAssetId || '-'}</Text>
                      <Tag color={isRetryableBatchFailure(item) ? 'processing' : 'default'}>
                        {isRetryableBatchFailure(item) ? '可重试' : '不可重试'}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.message}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无批次详情" />
        )}
      </Drawer>

      <Modal
        title="验证详情"
        open={backtestDetailModalOpen}
        footer={null}
        onCancel={() => setBacktestDetailModalOpen(false)}
      >
        {backtestQuery.data ? (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Alert
              type={
                backtestQuery.data.status === 'FAILED'
                  ? 'error'
                  : backtestQuery.data.status === 'COMPLETED'
                    ? 'success'
                    : 'info'
              }
              showIcon
              message={`状态：${backtestStatusLabel[backtestQuery.data.status] || backtestQuery.data.status}`}
            />
            {backtestQuery.data.status === 'COMPLETED' ? (
              <Card size="small">
                <Space direction="vertical" size={4}>
                  <Text>收益：{backtestQuery.data.summary?.returnPct ?? '-'}%</Text>
                  <Text>最大回撤：{backtestQuery.data.summary?.maxDrawdownPct ?? '-'}%</Text>
                  <Text>胜率：{backtestQuery.data.summary?.winRatePct ?? '-'}%</Text>
                  <Text>评分：{backtestQuery.data.summary?.score ?? '-'}</Text>
                </Space>
              </Card>
            ) : (
              <Text type="secondary">{backtestQuery.data.errorMessage || '验证处理中'}</Text>
            )}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无验证结果" />
        )}
      </Modal>

      <Modal
        title="一致性详情"
        open={conflictDetailModalOpen}
        footer={null}
        onCancel={() => setConflictDetailModalOpen(false)}
      >
        {conflictList.length ? (
          <List
            size="small"
            dataSource={conflictList}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong>{item.topic}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    来源：{Array.isArray(item.sources) ? item.sources.join(' vs ') : '-'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    处理建议：{item.resolution || '-'} / {item.reason || '-'}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无冲突详情" />
        )}
      </Modal>

      <Modal
        title="发送报告"
        open={emailModalOpen}
        onOk={handleSendDelivery}
        okText={deliveryChannel === 'EMAIL' ? '发送到邮箱' : `发送到${channelLabel[deliveryChannel] || deliveryChannel}`}
        cancelText="取消"
        onCancel={() => {
          setEmailModalOpen(false);
          setDeliveryAdvancedOpen(false);
        }}
        confirmLoading={deliverMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">先选择发送渠道，再补充必要信息。默认会优先使用你的配置中心设置。</Text>
          <Segmented
            value={deliveryChannel}
            options={[
              { label: '邮箱', value: 'EMAIL' },
              { label: '钉钉', value: 'DINGTALK' },
              { label: '企微', value: 'WECOM' },
              { label: '飞书', value: 'FEISHU' },
            ]}
            onChange={(value) => setDeliveryChannel(value as 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU')}
          />
          {activeDeliveryChannelProfile ? (
            <Alert
              type="info"
              showIcon
              message={`已匹配默认配置：${channelLabel[deliveryChannel] || deliveryChannel}`}
              description={
                deliveryChannel === 'EMAIL'
                  ? `默认收件人：${(activeDeliveryChannelProfile.to || []).join('、') || '未配置'}`
                  : `默认接收位置：${activeDeliveryChannelProfile.target || '未配置'}`
              }
            />
          ) : null}
          {!activeDeliveryChannelProfile ? (
            <Alert
              type="warning"
              showIcon
              message="当前渠道暂无默认配置"
              description="你可以先手动填写接收信息，之后再保存为默认配置。"
            />
          ) : null}
          {isAdminUser ? (
            <Button
              type="link"
              style={{ padding: 0, width: 'fit-content' }}
              onClick={() => {
                setEmailModalOpen(false);
                setDeliveryAdvancedOpen(false);
                openDeliveryProfileModal();
              }}
            >
              去配置中心维护默认发送设置
            </Button>
          ) : null}
          <Alert
            type="info"
            showIcon
            message={
              deliveryChannel === 'EMAIL'
                ? `当前将发送给：${deliveryPreview.resolvedTo.length ? deliveryPreview.resolvedTo.join('、') : '未设置'}`
                : `当前将发送到：${deliveryPreview.resolvedTarget || '未设置'}`
            }
            description={
              deliveryChannel === 'EMAIL'
                ? deliveryPreview.useDefaultTo
                  ? '发送策略：未填写收件人时，自动使用默认收件人。'
                  : '发送策略：优先使用你当前输入的收件人。'
                : deliveryPreview.useDefaultTarget
                  ? '发送策略：未填写接收位置时，自动使用默认接收位置。'
                  : '发送策略：优先使用你当前输入的接收位置。'
            }
          />
          {deliveryChannel === 'EMAIL' ? (
            <>
              <Text type="secondary">收件人（可留空，自动使用默认收件人；多个邮箱用英文逗号分隔）</Text>
              <Input
                placeholder="例如：user@example.com,ops@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </>
          ) : (
            <>
              <Text type="secondary">接收位置（可留空，自动使用默认接收位置）</Text>
              <Input
                placeholder="例如：ops-group-01"
                value={deliveryTarget}
                onChange={(e) => setDeliveryTarget(e.target.value)}
              />
            </>
          )}

          <Button type="link" style={{ padding: 0, width: 'fit-content' }} onClick={() => setDeliveryAdvancedOpen((v) => !v)}>
            {deliveryAdvancedOpen ? '收起高级选项' : '展开高级选项'}
          </Button>
          {deliveryAdvancedOpen ? (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Segmented
                value={deliveryTemplateCode}
                options={[
                  { label: '通用模板', value: 'DEFAULT' },
                  { label: '晨报模板', value: 'MORNING_BRIEF' },
                  { label: '周报模板', value: 'WEEKLY_REVIEW' },
                  { label: '风险模板', value: 'RISK_ALERT' },
                ]}
                onChange={(value) =>
                  setDeliveryTemplateCode(value as 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT')
                }
              />
              <Button type={sendRawFile ? 'primary' : 'default'} onClick={() => setSendRawFile((v) => !v)}>
                {sendRawFile ? '当前发送原文件' : '当前发送导出文件'}
              </Button>
            </Space>
          ) : null}
          {!latestArtifact?.exportTaskId ? (
            <Alert type="warning" message="请先导出报告，再发送" showIcon />
          ) : null}
        </Space>
      </Modal>

      <Modal
        title="快捷问题模板管理"
        open={templateModalOpen}
        onOk={handleSaveTemplates}
        onCancel={() => setTemplateModalOpen(false)}
        confirmLoading={upsertPromptTemplatesMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Segmented
              value={templateMode}
              options={[
                { label: '表单编辑', value: 'FORM' },
                { label: 'JSON 编辑', value: 'JSON' },
              ]}
              onChange={(value) => setTemplateMode(value as 'FORM' | 'JSON')}
            />
            <Segmented
              value={templateScope}
              options={[
                { label: '个人模板', value: 'PERSONAL' },
                { label: '团队模板', value: 'TEAM' },
              ]}
              onChange={(value) => handleTemplateScopeChange(value as CopilotPromptScope)}
            />
            <Space>
              <Button onClick={handleCopyFromOppositeScope}>从另一作用域复制</Button>
              <Button icon={<UploadOutlined />} onClick={handleImportTemplatesClick}>
                导入 JSON
              </Button>
              <Button onClick={handleExportTemplates}>导出 JSON</Button>
            </Space>
          </Space>

          <input
            ref={templateFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportTemplatesFile}
          />

          <Alert
            type="info"
            showIcon
            message="JSON 数组格式"
            description='每项需包含 key、label、prompt。示例：[{"key":"k1","label":"周度复盘","prompt":"..."}]'
          />

          {templateMode === 'FORM' ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button onClick={handleAddTemplate} icon={<PlusOutlined />}>
                新增模板
              </Button>
              <List
                size="small"
                dataSource={templateDraft}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="remove" danger size="small" onClick={() => handleRemoveTemplate(item.key)}>
                        删除
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Input
                        value={item.label}
                        placeholder="模板名称"
                        onChange={(e) =>
                          handleUpdateTemplate(item.key, {
                            label: e.target.value,
                          })
                        }
                      />
                      <Input.TextArea
                        value={item.prompt}
                        placeholder="模板提示词"
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        onChange={(e) => handleUpdateTemplate(item.key, { prompt: e.target.value })}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        key: {item.key}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Input.TextArea
              value={templateEditor}
              onChange={(e) => setTemplateEditor(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
          )}
        </Space>
      </Modal>

      <Modal
        title="投递配置中心"
        open={deliveryProfileModalOpen}
        onOk={handleSaveDeliveryProfiles}
        onCancel={() => setDeliveryProfileModalOpen(false)}
        confirmLoading={upsertDeliveryProfilesMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="使用 JSON 管理各渠道默认投递目标与模板"
            description="字段建议：id/channel/isDefault/target/to/templateCode/sendRawFile/description"
          />
          <Input.TextArea
            value={deliveryProfileEditor}
            onChange={(e) => setDeliveryProfileEditor(e.target.value)}
            autoSize={{ minRows: 12, maxRows: 22 }}
          />
        </Space>
      </Modal>

      <Modal
        title="能力路由策略"
        open={routingPolicyModalOpen}
        onOk={handleSaveRoutingPolicy}
        onCancel={() => setRoutingPolicyModalOpen(false)}
        confirmLoading={upsertCapabilityRoutingPolicyMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="用于控制能力复用顺序与命中阈值（普通用户无感）"
            description="建议默认：优先私有池，其次公共池。阈值越高，复用越保守。"
          />
          <Space>
            <Button
              size="small"
              onClick={() => setRoutingPolicyDraft(DEFAULT_CAPABILITY_ROUTING_POLICY)}
            >
              恢复推荐默认值
            </Button>
          </Space>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>启用私有能力池</Text>
                <Switch
                  checked={routingPolicyDraft.allowOwnerPool}
                  onChange={(checked) =>
                    setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      allowOwnerPool: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>启用公共能力池</Text>
                <Switch
                  checked={routingPolicyDraft.allowPublicPool}
                  onChange={(checked) =>
                    setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      allowPublicPool: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>优先使用私有能力</Text>
                <Switch
                  checked={routingPolicyDraft.preferOwnerFirst}
                  onChange={(checked) =>
                    setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      preferOwnerFirst: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>私有池最低命中分</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={routingPolicyDraft.minOwnerScore}
                  onChange={(value) =>
                    setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      minOwnerScore: typeof value === 'number' ? value : prev.minOwnerScore,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>公共池最低命中分</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={routingPolicyDraft.minPublicScore}
                  onChange={(value) =>
                    setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      minPublicScore: typeof value === 'number' ? value : prev.minPublicScore,
                    }))
                  }
                />
              </Space>
            </Space>
          </Card>
        </Space>
      </Modal>

      <Modal
        title="临时能力策略"
        open={ephemeralPolicyModalOpen}
        onOk={handleSaveEphemeralPolicy}
        onCancel={() => setEphemeralPolicyModalOpen(false)}
        confirmLoading={upsertEphemeralCapabilityPolicyMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="控制临时能力复用阈值与运行时授权策略"
            description="建议先保持默认，再根据 UAT 指标逐步微调。"
          />
          <Space>
            <Button
              size="small"
              onClick={() => setEphemeralPolicyDraft(DEFAULT_EPHEMERAL_CAPABILITY_POLICY)}
            >
              恢复推荐默认值
            </Button>
            <Button size="small" onClick={() => handleApplyRetryPolicyPreset('NETWORK')}>
              应用网络波动型
            </Button>
            <Button size="small" onClick={() => handleApplyRetryPolicyPreset('STRICT')}>
              应用严格型
            </Button>
          </Space>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Text strong>策略变更审计（最近20次）</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                当前服务端版本更新时间：
                {ephemeralCapabilityPolicyBinding?.updatedAt
                  ? new Date(ephemeralCapabilityPolicyBinding.updatedAt).toLocaleString('zh-CN')
                  : '-'}
              </Text>
              <List
                size="small"
                dataSource={displayedEphemeralPolicyAuditHistory.slice(0, 6)}
                loading={ephemeralCapabilityPolicyAuditsQuery.isLoading}
                locale={{ emptyText: '暂无审计记录（首次保存策略后自动生成）' }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.savedAt).toLocaleString('zh-CN')} · TTL {item.runtimeGrantTtlHours}h · MaxUse{' '}
                        {item.runtimeGrantMaxUseCount}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        白名单 {item.retryableAllowlist.length} 项 / 黑名单 {item.nonRetryableBlocklist.length} 项
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          </Card>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>草稿语义复用阈值</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={ephemeralPolicyDraft.draftSemanticReuseThreshold}
                  onChange={(value) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      draftSemanticReuseThreshold:
                        typeof value === 'number' ? value : prev.draftSemanticReuseThreshold,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>已发布能力复用阈值</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={ephemeralPolicyDraft.publishedSkillReuseThreshold}
                  onChange={(value) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      publishedSkillReuseThreshold:
                        typeof value === 'number' ? value : prev.publishedSkillReuseThreshold,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>运行时授权时长（小时）</Text>
                <InputNumber
                  min={1}
                  max={168}
                  step={1}
                  value={ephemeralPolicyDraft.runtimeGrantTtlHours}
                  onChange={(value) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      runtimeGrantTtlHours: typeof value === 'number' ? value : prev.runtimeGrantTtlHours,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>运行时授权最大使用次数</Text>
                <InputNumber
                  min={1}
                  max={200}
                  step={1}
                  value={ephemeralPolicyDraft.runtimeGrantMaxUseCount}
                  onChange={(value) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      runtimeGrantMaxUseCount: typeof value === 'number' ? value : prev.runtimeGrantMaxUseCount,
                    }))
                  }
                />
              </Space>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text>可重试错误码白名单（每行一个）</Text>
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  value={ephemeralPolicyDraft.replayRetryableErrorCodeAllowlist.join('\n')}
                  onChange={(e) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      replayRetryableErrorCodeAllowlist: e.target.value
                        .split('\n')
                        .map((item) => item.trim().toUpperCase())
                        .filter(Boolean),
                    }))
                  }
                />
              </Space>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text>不可重试错误码黑名单（每行一个）</Text>
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  value={ephemeralPolicyDraft.replayNonRetryableErrorCodeBlocklist.join('\n')}
                  onChange={(e) =>
                    setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      replayNonRetryableErrorCodeBlocklist: e.target.value
                        .split('\n')
                        .map((item) => item.trim().toUpperCase())
                        .filter(Boolean),
                    }))
                  }
                />
              </Space>
            </Space>
          </Card>
        </Space>
      </Modal>
    </Space>
  );
};
