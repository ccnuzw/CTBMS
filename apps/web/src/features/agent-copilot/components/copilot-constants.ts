import type { CapabilityRoutingPolicy, EphemeralCapabilityPolicy, CopilotPromptScope } from '../api/conversations';



export const QUICK_PROMPT_STORAGE_KEY_PREFIX = 'ctbms.agent.copilot.quick-prompts.v1';
export const COPILOT_DIAG_STORAGE_KEY = 'ctbms.agent.copilot.diag.v1';
export const DEFAULT_VISIBLE_TURN_COUNT = 40;
export const LOAD_MORE_TURN_STEP = 40;
export const TURN_CONTENT_PREVIEW_LIMIT = 3000;
export const RESULT_ANALYSIS_PREVIEW_LIMIT = 4000;
export const PROMOTION_BATCH_FAILED_PAGE_SIZE = 8;
export const SYSTEM_MESSAGE_COLLAPSE_MIN_LENGTH = 240;
export const PROMOTION_FILTERS_STORAGE_KEY = 'agent-copilot-promotion-filters-v1';
export const EPHEMERAL_POLICY_AUDIT_STORAGE_KEY = 'agent-copilot-ephemeral-policy-audit-v1';
export const ASSISTANT_MESSAGE_COLLAPSE_MIN_LENGTH = 1200;
export const SYSTEM_SUMMARY_PREVIEW_LENGTH = 80;
export const ASSISTANT_SUMMARY_PREVIEW_LENGTH = 160;
export const ASSISTANT_SUMMARY_MAX_HEADINGS = 3;
export const ASSISTANT_SUMMARY_MAX_BULLETS = 4;
export const SYSTEM_SUMMARY_MAX_KEYS = 5;
export const DEFAULT_CAPABILITY_ROUTING_POLICY: CapabilityRoutingPolicy = {
  allowOwnerPool: true,
  allowPublicPool: true,
  preferOwnerFirst: true,
  minOwnerScore: 0,
  minPublicScore: 0.35,
};

export const DEFAULT_EPHEMERAL_CAPABILITY_POLICY: EphemeralCapabilityPolicy = {
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

export const RETRY_POLICY_PRESET_NETWORK: Pick<
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

export const RETRY_POLICY_PRESET_STRICT: Pick<
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

export type QuickPromptTemplate = {
  key: string;
  label: string;
  prompt: string;
};

export type LocalConversationTurn = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  structuredPayload?: Record<string, unknown>;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

export const isSameQuickPromptTemplates = (
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

export const toSafeText = (value: unknown): string => {
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

export const summarizeStructuredMessage = (raw: string): string => {
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

export const summarizeAssistantMessage = (raw: string): string => {
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

export const appendCopilotDiagEvent = (event: {
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

export const getOppositeScope = (scope: CopilotPromptScope): CopilotPromptScope =>
  scope === 'PERSONAL' ? 'TEAM' : 'PERSONAL';

export const defaultQuickPrompts: QuickPromptTemplate[] = [
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

export const stateColor: Record<string, string> = {
  INTENT_CAPTURE: 'default',
  SLOT_FILLING: 'processing',
  PLAN_PREVIEW: 'warning',
  USER_CONFIRM: 'warning',
  EXECUTING: 'processing',
  RESULT_DELIVERY: 'success',
  DONE: 'success',
  FAILED: 'error',
};

export const sessionStateLabel: Record<string, string> = {
  INTENT_CAPTURE: '待理解',
  SLOT_FILLING: '待补充信息',
  PLAN_PREVIEW: '方案预览',
  USER_CONFIRM: '待确认',
  EXECUTING: '执行中',
  RESULT_DELIVERY: '结果整理中',
  DONE: '已完成',
  FAILED: '执行失败',
};

export const planTypeLabel: Record<string, string> = {
  RUN_PLAN: '执行方案',
  DEBATE_PLAN: '多方案讨论',
};

export const subscriptionStatusLabel: Record<string, string> = {
  ACTIVE: '已开启',
  PAUSED: '已暂停',
  FAILED: '失败',
  ARCHIVED: '已归档',
};

export const deliveryStatusLabel: Record<string, string> = {
  SENT: '已发送',
  FAILED: '发送失败',
};

export const backtestStatusLabel: Record<string, string> = {
  QUEUED: '排队中',
  RUNNING: '进行中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

export const statusColor: Record<string, string> = {
  ACTIVE: 'success',
  PAUSED: 'default',
  FAILED: 'error',
  ARCHIVED: 'default',
  SENT: 'success',
  EXPIRED: 'default',
  REVOKED: 'default',
};

export const channelLabel: Record<string, string> = {
  EMAIL: '邮箱',
  DINGTALK: '钉钉',
  WECOM: '企业微信',
  FEISHU: '飞书',
};

export const runtimeGrantStatusLabel: Record<string, string> = {
  ACTIVE: '生效中',
  EXPIRED: '已过期',
  REVOKED: '已撤销',
};

export const governanceEventLabel: Record<string, string> = {
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

export const assetTypeLabel: Record<string, string> = {
  PLAN: '执行方案',
  EXECUTION: '执行记录',
  RESULT_SUMMARY: '结果摘要',
  EXPORT_FILE: '导出文件',
  BACKTEST_SUMMARY: '验证结果',
  CONFLICT_SUMMARY: '一致性检查',
  SKILL_DRAFT: '能力草稿',
};

export const capabilityRouteTypeLabel: Record<string, string> = {
  WORKFLOW_REUSE: '工作流复用',
  SKILL_DRAFT_REUSE: '能力草稿复用',
  SKILL_DRAFT_CREATE: '新建能力草稿',
};

export const promotionTaskStatusLabel: Record<string, string> = {
  PENDING_REVIEW: '待处理',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  PUBLISHED: '已发布',
};

export const promotionBatchActionLabel: Record<string, string> = {
  START_REVIEW: '推进审核中',
  MARK_APPROVED: '标记通过',
  MARK_REJECTED: '标记拒绝',
  MARK_PUBLISHED: '标记已发布',
  SYNC_DRAFT_STATUS: '同步草稿状态',
};

export const formatGovernanceEventMessage = (item: {
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

export const formatRoutePolicyDetails = (details?: Record<string, unknown>) => {
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

export const copilotErrorMessageByCode: Record<string, string> = {
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

