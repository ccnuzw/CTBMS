import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import type {
  CreateUserConfigBindingDto,
  UpdateUserConfigBindingDto,
  UserConfigBindingDto,
  UserConfigBindingPageDto,
} from '@packages/types';

export type ConversationState =
  | 'INTENT_CAPTURE'
  | 'SLOT_FILLING'
  | 'PLAN_PREVIEW'
  | 'USER_CONFIRM'
  | 'EXECUTING'
  | 'RESULT_DELIVERY'
  | 'DONE'
  | 'FAILED';

export interface ConversationSession {
  id: string;
  title?: string | null;
  state: ConversationState;
  currentIntent?: string | null;
  latestExecutionId?: string | null;
  updatedAt: string;
}

export interface ConversationTurn {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  structuredPayload?: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationPlan {
  id: string;
  version: number;
  planType: 'RUN_PLAN' | 'DEBATE_PLAN';
  planSnapshot: Record<string, unknown>;
  isConfirmed: boolean;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSession {
  turns: ConversationTurn[];
  plans: ConversationPlan[];
}

export interface ConversationPage {
  data: ConversationSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TurnResponse {
  assistantMessage: string;
  state: ConversationState;
  intent: string;
  missingSlots: string[];
  proposedPlan?: Record<string, unknown> | null;
  confirmRequired: boolean;
  autoExecuted?: boolean;
  executionId?: string;
  reuseResolution?: {
    explicitAssetRefCount?: number;
    followupAssetRefCount?: number;
    semanticAssetRefCount?: number;
    semanticResolution?: {
      requestedType?: string | null;
      candidateCount?: number;
      selectedAssetId?: string;
      selectedAssetTitle?: string;
      selectedScore?: number;
      ambiguous?: boolean;
      topCandidates?: Array<{
        id: string;
        title: string;
        assetType: string;
        score: number;
      }>;
    };
  };
  replyOptions?: Array<{
    id: string;
    label: string;
    mode: 'SEND' | 'OPEN_TAB';
    value?: string;
    tab?: 'progress' | 'result' | 'delivery' | 'schedule';
  }>;
}

export interface ConversationAsset {
  id: string;
  sessionId: string;
  assetType:
    | 'PLAN'
    | 'EXECUTION'
    | 'RESULT_SUMMARY'
    | 'EXPORT_FILE'
    | 'BACKTEST_SUMMARY'
    | 'CONFLICT_SUMMARY'
    | 'SKILL_DRAFT'
    | 'NOTE';
  title: string;
  payload: Record<string, unknown>;
  sourceTurnId?: string | null;
  sourceExecutionId?: string | null;
  sourcePlanVersion?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmResponse {
  accepted: boolean;
  executionId: string;
  status: 'EXECUTING';
  traceId: string;
}

export interface ResultResponse {
  status: 'EXECUTING' | 'DONE' | 'FAILED' | ConversationState;
  result: {
    facts: Array<{ text: string; citations: Array<Record<string, unknown>> }>;
    analysis: string;
    actions: Record<string, unknown>;
    confidence: number;
    dataTimestamp: string;
  } | null;
  artifacts: Array<{
    type: string;
    exportTaskId: string;
    status: string;
    downloadUrl: string | null;
  }>;
  executionId?: string;
  error?: string | null;
}

export interface ExportResponse {
  exportTaskId: string;
  status: string;
  workflowExecutionId: string;
  downloadUrl?: string | null;
}

export type DeliveryChannel = 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU';
export type DeliveryTemplateCode = 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT';

export interface DeliverResponse {
  deliveryTaskId: string;
  channel: DeliveryChannel;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  errorMessage?: string | null;
}

export interface SubscriptionItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED';
  cronExpr: string;
  timezone: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  runs?: Array<{
    id: string;
    status: string;
    triggerMode: string;
    startedAt: string;
    endedAt?: string | null;
    errorMessage?: string | null;
    workflowExecutionId?: string | null;
  }>;
}

export interface BacktestJobSummary {
  backtestJobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface BacktestJobDetail {
  backtestJobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  summary?: {
    returnPct?: number;
    maxDrawdownPct?: number;
    winRatePct?: number;
    score?: number;
  };
  assumptions?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  errorMessage?: string | null;
  completedAt?: string | null;
}

export interface ConversationConflictItem {
  conflictId: string;
  topic: string;
  sources: string[];
  resolution?: string | null;
  reason?: string | null;
  consistencyScore?: number;
}

export interface ConversationConflictsResponse {
  consistencyScore: number;
  conflicts: ConversationConflictItem[];
}

export interface SkillDraftSummary {
  draftId: string;
  status: 'DRAFT' | 'SANDBOX_TESTING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
  reviewRequired?: boolean;
}

export interface SkillDraftSandboxResult {
  testRunId: string;
  status: 'PASSED' | 'FAILED';
  passedCount: number;
  failedCount: number;
}

export interface SkillRuntimeGrant {
  id: string;
  draftId: string;
  sessionId: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  maxUseCount: number;
  useCount: number;
  expiresAt: string;
  revokeReason?: string | null;
  revokedAt?: string | null;
}

export interface SkillGovernanceOverview {
  activeRuntimeGrants: number;
  runtimeGrantsExpiringIn1h: number;
  highRiskPendingReview: number;
  draftStats: Array<{
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    status: 'DRAFT' | 'SANDBOX_TESTING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
    _count: { _all: number };
  }>;
}

export interface SkillGovernanceEvent {
  id: string;
  ownerUserId: string;
  draftId?: string | null;
  runtimeGrantId?: string | null;
  eventType:
    | 'DRAFT_CREATED'
    | 'REVIEW_SUBMITTED'
    | 'REVIEW_APPROVED'
    | 'REVIEW_REJECTED'
    | 'PUBLISHED'
    | 'RUNTIME_GRANT_CREATED'
    | 'RUNTIME_GRANT_USED'
    | 'RUNTIME_GRANT_REVOKED'
    | 'RUNTIME_GRANT_EXPIRED';
  message: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CapabilityRoutingLog {
  id: string;
  title: string;
  routeType: 'WORKFLOW_REUSE' | 'SKILL_DRAFT_REUSE' | 'SKILL_DRAFT_CREATE' | string;
  selectedSource?: string | null;
  selectedScore: number;
  selectedWorkflowDefinitionId?: string | null;
  selectedDraftId?: string | null;
  selectedSkillCode?: string | null;
  routePolicy: string[];
  reason?: string | null;
  routePolicyDetails?: Record<string, unknown>;
  createdAt: string;
}

export interface CapabilityRoutingSummary {
  sampleWindow: {
    window: '1h' | '24h' | '7d';
    totalLogs: number;
    analyzedLimit: number;
  };
  effectivePolicies: {
    capabilityRoutingPolicy: CapabilityRoutingPolicy;
    ephemeralCapabilityPolicy: EphemeralCapabilityPolicy;
  };
  stats: {
    routeType: Array<{ key: string; count: number }>;
    selectedSource: Array<{ key: string; count: number }>;
  };
  trend: Array<{
    bucket: string;
    total: number;
    byRouteType: Record<string, number>;
  }>;
}

export interface EphemeralCapabilitySummary {
  window: '1h' | '24h' | '7d';
  totals: {
    drafts: number;
    runtimeGrants: number;
    expiringRuntimeGrantsIn24h: number;
    staleDrafts: number;
  };
  policy: EphemeralCapabilityPolicy;
  stats: {
    draftStatus: Array<{ key: string; count: number }>;
    grantStatus: Array<{ key: string; count: number }>;
    topSkillCodes: Array<{ key: string; count: number }>;
  };
}

export interface EphemeralCapabilityHousekeepingResult {
  checkedAt: string;
  expiredGrantCount: number;
  disabledDraftCount: number;
  policy: EphemeralCapabilityPolicy;
}

export interface EphemeralCapabilityEvolutionPlan {
  window: '1h' | '24h' | '7d';
  policy: EphemeralCapabilityPolicy;
  recommendations: {
    promoteDraftCandidates: Array<{
      draftId: string;
      suggestedSkillCode: string;
      hitCount: number;
      reason: string;
    }>;
    staleDraftCandidates: Array<{
      draftId: string;
      suggestedSkillCode: string;
      status: string;
      updatedAt: string;
    }>;
    expiredGrantCandidates: Array<{
      grantId: string;
      draftId: string;
      expiresAt: string;
    }>;
  };
  metrics: {
    totalRoutingLogs: number;
    uniqueDraftHits: number;
    uniqueSkillCodeHits: number;
  };
}

export interface EphemeralCapabilityEvolutionApplyResult {
  checkedAt: string;
  window: '1h' | '24h' | '7d';
  expiredGrantCount: number;
  disabledDraftCount: number;
  promoteSuggestionCount: number;
  promotionTaskCount?: number;
}

export interface EphemeralPromotionTaskItem {
  taskAssetId: string;
  title: string;
  draftId: string;
  suggestedSkillCode: string;
  hitCount: number;
  reason?: string | null;
  window?: string | null;
  status: 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
  generatedAt?: string | null;
  lastAction?: string | null;
  lastActionAt?: string | null;
  lastActionBy?: string | null;
  lastComment?: string | null;
  publishedSkillId?: string | null;
  draftStatus?: string | null;
  draftUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EphemeralPromotionTaskUpdateResult {
  task: EphemeralPromotionTaskItem;
}

export interface EphemeralPromotionTaskSummary {
  window: '1h' | '24h' | '7d';
  totalTasks: number;
  pendingActionCount: number;
  publishedLinkedCount: number;
  stats: {
    byStatus: Array<{ key: string; count: number }>;
    byDraftStatus: Array<{ key: string; count: number }>;
  };
}

export interface EphemeralPromotionTaskBatchUpdateResult {
  action: string;
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  succeeded: Array<{ taskAssetId: string; status: string }>;
  failed: Array<{ taskAssetId: string; code?: string; message: string }>;
}

export interface SkillGovernanceHousekeepingResult {
  checkedAt: string;
  expiredGrantCount: number;
  disabledDraftCount: number;
}

export interface ScheduleResolutionResult {
  action: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME' | 'RUN';
  subscriptionId: string;
  status?: string;
  cronExpr?: string;
  timezone?: string;
  nextRunAt?: string | null;
  channel?: DeliveryChannel;
  target?: string | null;
  runId?: string;
}

const COPILOT_PROMPT_BINDING_TYPE = 'AGENT_COPILOT_PROMPTS';
const COPILOT_DELIVERY_PROFILE_BINDING_TYPE = 'AGENT_COPILOT_DELIVERY_PROFILES';
const CAPABILITY_ROUTING_POLICY_BINDING_TYPE = 'AGENT_CAPABILITY_ROUTING_POLICY';
const EPHEMERAL_CAPABILITY_POLICY_BINDING_TYPE = 'AGENT_EPHEMERAL_CAPABILITY_POLICY';

export type CopilotPromptScope = 'PERSONAL' | 'TEAM';

const scopeToTargetId = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'team-default' : 'personal-default';

const scopeToTargetCode = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'agent-copilot-quick-prompts-team' : 'agent-copilot-quick-prompts-personal';

const deliveryProfileScopeToTargetId = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'team-delivery-default' : 'personal-delivery-default';

const deliveryProfileScopeToTargetCode = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'agent-copilot-delivery-profiles-team' : 'agent-copilot-delivery-profiles-personal';

export interface CapabilityRoutingPolicy {
  allowOwnerPool: boolean;
  allowPublicPool: boolean;
  preferOwnerFirst: boolean;
  minOwnerScore: number;
  minPublicScore: number;
}

export interface EphemeralCapabilityPolicy {
  draftSemanticReuseThreshold: number;
  publishedSkillReuseThreshold: number;
  runtimeGrantTtlHours: number;
  runtimeGrantMaxUseCount: number;
}

const capabilityRoutingPolicyTargetId = 'agent-capability-routing-policy-default';
const capabilityRoutingPolicyTargetCode = 'agent-capability-routing-policy-default';
const ephemeralCapabilityPolicyTargetId = 'agent-ephemeral-capability-policy-default';
const ephemeralCapabilityPolicyTargetCode = 'agent-ephemeral-capability-policy-default';

export interface DeliveryChannelProfile {
  id: string;
  channel: DeliveryChannel;
  target?: string;
  to?: string[];
  templateCode?: DeliveryTemplateCode;
  sendRawFile?: boolean;
  description?: string;
  isDefault?: boolean;
}

export const useConversationSessions = (params?: {
  state?: ConversationState;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) =>
  useQuery<ConversationPage>({
    queryKey: ['agent-copilot', 'sessions', params],
    queryFn: async () => {
      const res = await apiClient.get<ConversationPage>('/agent-conversations/sessions', { params });
      return res.data;
    },
  });

export const useConversationDetail = (sessionId?: string) =>
  useQuery<ConversationDetail>({
    queryKey: ['agent-copilot', 'session', sessionId],
    queryFn: async () => {
      const res = await apiClient.get<ConversationDetail>(`/agent-conversations/sessions/${sessionId}`);
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useConversationResult = (sessionId?: string) =>
  useQuery<ResultResponse>({
    queryKey: ['agent-copilot', 'result', sessionId],
    queryFn: async () => {
      const res = await apiClient.get<ResultResponse>(`/agent-conversations/sessions/${sessionId}/result`);
      return res.data;
    },
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const status = (query as { state?: { data?: ResultResponse } })?.state?.data?.status;
      return status === 'EXECUTING' ? 3000 : false;
    },
  });

export const useCreateConversationSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title?: string }) => {
      const res = await apiClient.post<ConversationSession>('/agent-conversations/sessions', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'sessions'] });
    },
  });
};

export const useSendConversationTurn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      message: string;
      contextPatch?: Record<string, unknown>;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<TurnResponse>(
        `/agent-conversations/sessions/${sessionId}/turns`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'sessions'] });
    },
  });
};

export const useConfirmConversationPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      planId: string;
      planVersion: number;
      confirmedPlan?: Record<string, unknown>;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<ConfirmResponse>(
        `/agent-conversations/sessions/${sessionId}/plan/confirm`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'result', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'sessions'] });
    },
  });
};

export const useExportConversationResult = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      workflowExecutionId?: string;
      format: 'PDF' | 'WORD' | 'JSON';
      sections?: Array<'CONCLUSION' | 'EVIDENCE' | 'DEBATE_PROCESS' | 'RISK_ASSESSMENT'>;
      title?: string;
      includeRawData?: boolean;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<ExportResponse>(
        `/agent-conversations/sessions/${sessionId}/export`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'result', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useDeliverConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      exportTaskId: string;
      channel: DeliveryChannel;
      to?: string[];
      target?: string;
      subject?: string;
      content?: string;
      templateCode?: DeliveryTemplateCode;
      sendRawFile?: boolean;
      metadata?: Record<string, unknown>;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<DeliverResponse>(
        `/agent-conversations/sessions/${sessionId}/deliver`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useCopilotPromptTemplates = (scope: CopilotPromptScope) =>
  useQuery<UserConfigBindingDto | null>({
    queryKey: ['agent-copilot', 'prompt-templates', scope],
    queryFn: async () => {
      const res = await apiClient.get<UserConfigBindingPageDto>('/user-config-bindings', {
        params: {
          bindingType: COPILOT_PROMPT_BINDING_TYPE,
          page: 1,
          pageSize: 100,
        },
      });
      const targetId = scopeToTargetId(scope);
      return res.data.data.find((item) => item.targetId === targetId) ?? null;
    },
  });

export const useUpsertCopilotPromptTemplates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      scope: CopilotPromptScope;
      bindingId?: string;
      templates: Array<Record<string, unknown>>;
    }) => {
      if (payload.bindingId) {
        const dto: UpdateUserConfigBindingDto = {
          metadata: { templates: payload.templates },
        };
        const res = await apiClient.put<UserConfigBindingDto>(
          `/user-config-bindings/${payload.bindingId}`,
          dto,
        );
        return res.data;
      }

      const dto: CreateUserConfigBindingDto = {
        bindingType: COPILOT_PROMPT_BINDING_TYPE,
        targetId: scopeToTargetId(payload.scope),
        targetCode: scopeToTargetCode(payload.scope),
        metadata: { templates: payload.templates },
        isActive: true,
        priority: 100,
      };
      const res = await apiClient.post<UserConfigBindingDto>('/user-config-bindings', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'prompt-templates'] });
    },
  });
};

export const useCopilotDeliveryProfiles = (scope: CopilotPromptScope) =>
  useQuery<UserConfigBindingDto | null>({
    queryKey: ['agent-copilot', 'delivery-profiles', scope],
    queryFn: async () => {
      const res = await apiClient.get<UserConfigBindingPageDto>('/user-config-bindings', {
        params: {
          bindingType: COPILOT_DELIVERY_PROFILE_BINDING_TYPE,
          page: 1,
          pageSize: 100,
        },
      });
      const targetId = deliveryProfileScopeToTargetId(scope);
      return res.data.data.find((item) => item.targetId === targetId) ?? null;
    },
  });

export const useUpsertCopilotDeliveryProfiles = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      scope: CopilotPromptScope;
      bindingId?: string;
      profiles: DeliveryChannelProfile[];
    }) => {
      if (payload.bindingId) {
        const dto: UpdateUserConfigBindingDto = {
          metadata: { profiles: payload.profiles },
        };
        const res = await apiClient.put<UserConfigBindingDto>(
          `/user-config-bindings/${payload.bindingId}`,
          dto,
        );
        return res.data;
      }

      const dto: CreateUserConfigBindingDto = {
        bindingType: COPILOT_DELIVERY_PROFILE_BINDING_TYPE,
        targetId: deliveryProfileScopeToTargetId(payload.scope),
        targetCode: deliveryProfileScopeToTargetCode(payload.scope),
        metadata: { profiles: payload.profiles },
        isActive: true,
        priority: 100,
      };
      const res = await apiClient.post<UserConfigBindingDto>('/user-config-bindings', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'delivery-profiles'] });
    },
  });
};

export const useCapabilityRoutingPolicy = () =>
  useQuery<UserConfigBindingDto | null>({
    queryKey: ['agent-copilot', 'capability-routing-policy'],
    queryFn: async () => {
      const res = await apiClient.get<UserConfigBindingPageDto>('/user-config-bindings', {
        params: {
          bindingType: CAPABILITY_ROUTING_POLICY_BINDING_TYPE,
          page: 1,
          pageSize: 20,
        },
      });
      return res.data.data.find((item) => item.targetId === capabilityRoutingPolicyTargetId) ?? null;
    },
  });

export const useUpsertCapabilityRoutingPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { bindingId?: string; policy: CapabilityRoutingPolicy }) => {
      if (payload.bindingId) {
        const dto: UpdateUserConfigBindingDto = {
          metadata: payload.policy as unknown as Record<string, unknown>,
        };
        const res = await apiClient.put<UserConfigBindingDto>(
          `/user-config-bindings/${payload.bindingId}`,
          dto,
        );
        return res.data;
      }

      const dto: CreateUserConfigBindingDto = {
        bindingType: CAPABILITY_ROUTING_POLICY_BINDING_TYPE,
        targetId: capabilityRoutingPolicyTargetId,
        targetCode: capabilityRoutingPolicyTargetCode,
        metadata: payload.policy as unknown as Record<string, unknown>,
        isActive: true,
        priority: 100,
      };
      const res = await apiClient.post<UserConfigBindingDto>('/user-config-bindings', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'capability-routing-policy'] });
    },
  });
};

export const useEphemeralCapabilityPolicy = () =>
  useQuery<UserConfigBindingDto | null>({
    queryKey: ['agent-copilot', 'ephemeral-capability-policy'],
    queryFn: async () => {
      const res = await apiClient.get<UserConfigBindingPageDto>('/user-config-bindings', {
        params: {
          bindingType: EPHEMERAL_CAPABILITY_POLICY_BINDING_TYPE,
          page: 1,
          pageSize: 20,
        },
      });
      return res.data.data.find((item) => item.targetId === ephemeralCapabilityPolicyTargetId) ?? null;
    },
  });

export const useUpsertEphemeralCapabilityPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { bindingId?: string; policy: EphemeralCapabilityPolicy }) => {
      if (payload.bindingId) {
        const dto: UpdateUserConfigBindingDto = {
          metadata: payload.policy as unknown as Record<string, unknown>,
        };
        const res = await apiClient.put<UserConfigBindingDto>(
          `/user-config-bindings/${payload.bindingId}`,
          dto,
        );
        return res.data;
      }

      const dto: CreateUserConfigBindingDto = {
        bindingType: EPHEMERAL_CAPABILITY_POLICY_BINDING_TYPE,
        targetId: ephemeralCapabilityPolicyTargetId,
        targetCode: ephemeralCapabilityPolicyTargetCode,
        metadata: payload.policy as unknown as Record<string, unknown>,
        isActive: true,
        priority: 100,
      };
      const res = await apiClient.post<UserConfigBindingDto>('/user-config-bindings', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-policy'] });
    },
  });
};

export const useConversationSubscriptions = (sessionId?: string) =>
  useQuery<SubscriptionItem[]>({
    queryKey: ['agent-copilot', 'subscriptions', sessionId],
    queryFn: async () => {
      const res = await apiClient.get<SubscriptionItem[]>(
        `/agent-conversations/sessions/${sessionId}/subscriptions`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useCreateConversationSubscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      name: string;
      cronExpr: string;
      timezone?: string;
      planVersion?: number;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<SubscriptionItem>(
        `/agent-conversations/sessions/${sessionId}/subscriptions`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'subscriptions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useUpdateConversationSubscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      subscriptionId: string;
      status?: 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED';
      cronExpr?: string;
      timezone?: string;
      name?: string;
    }) => {
      const { sessionId, subscriptionId, ...body } = payload;
      const res = await apiClient.patch<SubscriptionItem>(
        `/agent-conversations/sessions/${sessionId}/subscriptions/${subscriptionId}`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'subscriptions', sessionId] });
    },
  });
};

export const useRunConversationSubscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { sessionId: string; subscriptionId: string }) => {
      const res = await apiClient.post<{
        runId: string;
        status: string;
        workflowExecutionId?: string;
      }>(
        `/agent-conversations/sessions/${payload.sessionId}/subscriptions/${payload.subscriptionId}/run`,
      );
      return { sessionId: payload.sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'subscriptions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useCreateConversationBacktest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      executionId?: string;
      strategySource?: 'LATEST_ACTIONS' | 'PLAN_SNAPSHOT';
      lookbackDays?: number;
      feeModel: {
        spotFeeBps: number;
        futuresFeeBps: number;
      };
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<BacktestJobSummary>(
        `/agent-conversations/sessions/${sessionId}/backtests`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId, data }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'backtest', sessionId, data.backtestJobId] });
    },
  });
};

export const useConversationBacktest = (sessionId?: string, backtestJobId?: string) =>
  useQuery<BacktestJobDetail>({
    queryKey: ['agent-copilot', 'backtest', sessionId, backtestJobId],
    queryFn: async () => {
      const res = await apiClient.get<BacktestJobDetail>(
        `/agent-conversations/sessions/${sessionId}/backtests/${backtestJobId}`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId && backtestJobId),
    refetchInterval: (query) => {
      const status = (query as { state?: { data?: BacktestJobDetail } })?.state?.data?.status;
      return status === 'RUNNING' || status === 'QUEUED' ? 2000 : false;
    },
  });

export const useConversationConflicts = (sessionId?: string) =>
  useQuery<ConversationConflictsResponse>({
    queryKey: ['agent-copilot', 'conflicts', sessionId],
    queryFn: async () => {
      const res = await apiClient.get<ConversationConflictsResponse>(
        `/agent-conversations/sessions/${sessionId}/conflicts`,
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useConversationAssets = (sessionId?: string) =>
  useQuery<ConversationAsset[]>({
    queryKey: ['agent-copilot', 'assets', sessionId],
    queryFn: async () => {
      const res = await apiClient.get<ConversationAsset[]>(`/agent-conversations/sessions/${sessionId}/assets`);
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useReuseConversationAsset = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      assetId: string;
      message?: string;
      contextPatch?: Record<string, unknown>;
    }) => {
      const { sessionId, assetId, ...body } = payload;
      const res = await apiClient.post<TurnResponse>(
        `/agent-conversations/sessions/${sessionId}/assets/${assetId}/reuse`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'result', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'assets', sessionId] });
    },
  });
};

export const useCreateSkillDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      gapType: string;
      requiredCapability: string;
      suggestedSkillCode: string;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<SkillDraftSummary>(
        `/agent-conversations/sessions/${sessionId}/capability-gap/skill-draft`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useSandboxSkillDraft = () =>
  useMutation({
    mutationFn: async (payload: {
      draftId: string;
      testCases: Array<{ input: Record<string, unknown>; expectContains: string[] }>;
    }) => {
      const res = await apiClient.post<SkillDraftSandboxResult>(
        `/agent-skills/drafts/${payload.draftId}/sandbox-test`,
        {
          testCases: payload.testCases,
        },
      );
      return res.data;
    },
  });

export const useSubmitSkillDraftReview = () =>
  useMutation({
    mutationFn: async (draftId: string) => {
      const res = await apiClient.post<SkillDraftSummary>(`/agent-skills/drafts/${draftId}/submit-review`);
      return res.data;
    },
  });

export const useReviewSkillDraft = () =>
  useMutation({
    mutationFn: async (payload: { draftId: string; action: 'APPROVE' | 'REJECT'; comment?: string }) => {
      const res = await apiClient.post<SkillDraftSummary>(`/agent-skills/drafts/${payload.draftId}/review`, {
        action: payload.action,
        comment: payload.comment,
      });
      return res.data;
    },
  });

export const usePublishSkillDraft = () =>
  useMutation({
    mutationFn: async (draftId: string) => {
      const res = await apiClient.post<SkillDraftSummary>(`/agent-skills/drafts/${draftId}/publish`);
      return res.data;
    },
  });

export const useSkillDraftRuntimeGrants = (draftId?: string) =>
  useQuery<SkillRuntimeGrant[]>({
    queryKey: ['agent-copilot', 'skill-runtime-grants', draftId],
    queryFn: async () => {
      const res = await apiClient.get<SkillRuntimeGrant[]>(`/agent-skills/drafts/${draftId}/runtime-grants`);
      return res.data;
    },
    enabled: Boolean(draftId),
  });

export const useRevokeSkillRuntimeGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { draftId: string; grantId: string; reason?: string }) => {
      const res = await apiClient.post<SkillRuntimeGrant>(`/agent-skills/runtime-grants/${payload.grantId}/revoke`, {
        reason: payload.reason,
      });
      return { draftId: payload.draftId, data: res.data };
    },
    onSuccess: ({ draftId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-runtime-grants', draftId] });
    },
  });
};

export const useConsumeSkillRuntimeGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { draftId: string; grantId: string }) => {
      const res = await apiClient.post<SkillRuntimeGrant>(`/agent-skills/runtime-grants/${payload.grantId}/use`);
      return { draftId: payload.draftId, data: res.data };
    },
    onSuccess: ({ draftId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-runtime-grants', draftId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-governance-overview'] });
    },
  });
};

export const useSkillGovernanceOverview = () =>
  useQuery<SkillGovernanceOverview>({
    queryKey: ['agent-copilot', 'skill-governance-overview'],
    queryFn: async () => {
      const res = await apiClient.get<SkillGovernanceOverview>('/agent-skills/governance/overview');
      return res.data;
    },
  });

export const useSkillGovernanceEvents = (draftId?: string) =>
  useQuery<SkillGovernanceEvent[]>({
    queryKey: ['agent-copilot', 'skill-governance-events', draftId],
    queryFn: async () => {
      const res = await apiClient.get<SkillGovernanceEvent[]>('/agent-skills/governance/events', {
        params: {
          draftId,
          limit: 20,
        },
      });
      return res.data;
    },
    enabled: Boolean(draftId),
  });

export const useSkillGovernanceHousekeeping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<SkillGovernanceHousekeepingResult>(
        '/agent-skills/governance/housekeeping',
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-governance-overview'] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-governance-events'] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'skill-runtime-grants'] });
    },
  });
};

export const useCapabilityRoutingLogs = (
  sessionId?: string,
  query?: { routeType?: string; limit?: number; window?: '1h' | '24h' | '7d' },
) =>
  useQuery<CapabilityRoutingLog[]>({
    queryKey: [
      'agent-copilot',
      'capability-routing-logs',
      sessionId,
      query?.routeType,
      query?.limit,
      query?.window,
    ],
    queryFn: async () => {
      const res = await apiClient.get<CapabilityRoutingLog[]>(
        `/agent-conversations/sessions/${sessionId}/capability-routing-logs`,
        {
          params: {
            routeType: query?.routeType,
            limit: query?.limit,
            window: query?.window,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useCapabilityRoutingSummary = (
  sessionId?: string,
  query?: { limit?: number; window?: '1h' | '24h' | '7d' },
) =>
  useQuery<CapabilityRoutingSummary>({
    queryKey: ['agent-copilot', 'capability-routing-summary', sessionId, query?.limit, query?.window],
    queryFn: async () => {
      const res = await apiClient.get<CapabilityRoutingSummary>(
        `/agent-conversations/sessions/${sessionId}/capability-routing-summary`,
        {
          params: {
            limit: query?.limit,
            window: query?.window,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useEphemeralCapabilitySummary = (
  sessionId?: string,
  query?: { window?: '1h' | '24h' | '7d' },
) =>
  useQuery<EphemeralCapabilitySummary>({
    queryKey: ['agent-copilot', 'ephemeral-capability-summary', sessionId, query?.window],
    queryFn: async () => {
      const res = await apiClient.get<EphemeralCapabilitySummary>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/summary`,
        {
          params: {
            window: query?.window,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useRunEphemeralCapabilityHousekeeping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { sessionId: string }) => {
      const res = await apiClient.post<EphemeralCapabilityHousekeepingResult>(
        `/agent-conversations/sessions/${payload.sessionId}/ephemeral-capabilities/housekeeping`,
      );
      return { sessionId: payload.sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-summary', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'capability-routing-logs', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useEphemeralCapabilityEvolutionPlan = (
  sessionId?: string,
  query?: { window?: '1h' | '24h' | '7d' },
) =>
  useQuery<EphemeralCapabilityEvolutionPlan>({
    queryKey: ['agent-copilot', 'ephemeral-capability-evolution-plan', sessionId, query?.window],
    queryFn: async () => {
      const res = await apiClient.get<EphemeralCapabilityEvolutionPlan>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/evolution-plan`,
        {
          params: {
            window: query?.window,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useApplyEphemeralCapabilityEvolutionPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { sessionId: string; window?: '1h' | '24h' | '7d' }) => {
      const res = await apiClient.post<EphemeralCapabilityEvolutionApplyResult>(
        `/agent-conversations/sessions/${payload.sessionId}/ephemeral-capabilities/evolution-apply`,
        undefined,
        {
          params: {
            window: payload.window,
          },
        },
      );
      return { sessionId: payload.sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-summary', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-evolution-plan', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'capability-routing-logs', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useEphemeralPromotionTasks = (
  sessionId?: string,
  query?: { window?: '1h' | '24h' | '7d'; status?: string },
) =>
  useQuery<EphemeralPromotionTaskItem[]>({
    queryKey: ['agent-copilot', 'ephemeral-promotion-tasks', sessionId, query?.window, query?.status],
    queryFn: async () => {
      const res = await apiClient.get<EphemeralPromotionTaskItem[]>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/promotion-tasks`,
        {
          params: {
            window: query?.window,
            status: query?.status,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useEphemeralPromotionTaskSummary = (
  sessionId?: string,
  query?: { window?: '1h' | '24h' | '7d' },
) =>
  useQuery<EphemeralPromotionTaskSummary>({
    queryKey: ['agent-copilot', 'ephemeral-promotion-task-summary', sessionId, query?.window],
    queryFn: async () => {
      const res = await apiClient.get<EphemeralPromotionTaskSummary>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/promotion-tasks/summary`,
        {
          params: {
            window: query?.window,
          },
        },
      );
      return res.data;
    },
    enabled: Boolean(sessionId),
  });

export const useUpdateEphemeralPromotionTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      taskAssetId: string;
      action: 'START_REVIEW' | 'MARK_APPROVED' | 'MARK_REJECTED' | 'MARK_PUBLISHED' | 'SYNC_DRAFT_STATUS';
      comment?: string;
    }) => {
      const { sessionId, taskAssetId, action, comment } = payload;
      const res = await apiClient.patch<EphemeralPromotionTaskUpdateResult>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/promotion-tasks/${taskAssetId}`,
        {
          action,
          comment,
        },
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-promotion-tasks', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-evolution-plan', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'assets', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useBatchUpdateEphemeralPromotionTasks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sessionId: string;
      action: 'START_REVIEW' | 'MARK_APPROVED' | 'MARK_REJECTED' | 'MARK_PUBLISHED' | 'SYNC_DRAFT_STATUS';
      comment?: string;
      taskAssetIds?: string[];
      window?: '1h' | '24h' | '7d';
      status?: string;
    }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<EphemeralPromotionTaskBatchUpdateResult>(
        `/agent-conversations/sessions/${sessionId}/ephemeral-capabilities/promotion-tasks/batch`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-promotion-tasks', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-promotion-task-summary', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'ephemeral-capability-evolution-plan', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'assets', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
    },
  });
};

export const useResolveScheduleCommand = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { sessionId: string; instruction: string }) => {
      const { sessionId, ...body } = payload;
      const res = await apiClient.post<ScheduleResolutionResult>(
        `/agent-conversations/sessions/${sessionId}/schedules/resolve`,
        body,
      );
      return { sessionId, data: res.data };
    },
    onSuccess: ({ sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'result', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['agent-copilot', 'subscriptions', sessionId] });
    },
  });
};
