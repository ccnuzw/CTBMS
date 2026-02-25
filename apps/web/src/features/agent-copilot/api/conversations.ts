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

export type CopilotPromptScope = 'PERSONAL' | 'TEAM';

const scopeToTargetId = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'team-default' : 'personal-default';

const scopeToTargetCode = (scope: CopilotPromptScope) =>
  scope === 'TEAM' ? 'agent-copilot-quick-prompts-team' : 'agent-copilot-quick-prompts-personal';

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
