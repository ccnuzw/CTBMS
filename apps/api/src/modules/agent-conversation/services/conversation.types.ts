/**
 * Shared types for the agent-conversation module.
 * Extracted from AgentConversationService to enable multi-service architecture.
 */
import { Prisma } from '@prisma/client';

// ── Session State Machine ────────────────────────────────────────────────────

export type SessionState =
    | 'INTENT_CAPTURE'
    | 'SLOT_FILLING'
    | 'PLAN_PREVIEW'
    | 'USER_CONFIRM'
    | 'EXECUTING'
    | 'RESULT_DELIVERY'
    | 'DONE'
    | 'FAILED';

// ── Intent ───────────────────────────────────────────────────────────────────

export type IntentCode = 'MARKET_SUMMARY_WITH_FORECAST' | 'DEBATE_MARKET_JUDGEMENT';

// ── Slots ────────────────────────────────────────────────────────────────────

export type SlotMap = {
    timeRange?: string;
    region?: string;
    outputFormat?: string[];
    judgePolicy?: string;
    topic?: string;
    maxRounds?: number;
    participants?: Array<{
        agentCode: string;
        role: string;
        perspective?: string;
        weight?: number;
    }>;
};

// ── Plan ─────────────────────────────────────────────────────────────────────

export type ProposedPlan = {
    planId: string;
    planType: 'RUN_PLAN' | 'DEBATE_PLAN';
    intent: IntentCode;
    workflowDefinitionId: string | null;
    workflowReuseSource?: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC' | 'NONE';
    workflowMatchScore?: number;
    skills: string[];
    paramSnapshot: SlotMap;
    estimatedCost: {
        token: number;
        latencyMs: number;
    };
};

// ── Reply Options ────────────────────────────────────────────────────────────

export type ReplyOption = {
    id: string;
    label: string;
    mode: 'SEND' | 'OPEN_TAB';
    value?: string;
    tab?: 'progress' | 'result' | 'delivery' | 'schedule';
};

// ── Query DTOs ───────────────────────────────────────────────────────────────

export type ConversationSessionQueryDto = {
    state?: SessionState;
    keyword?: string;
    page?: number;
    pageSize?: number;
};

// ── Capability Policies ──────────────────────────────────────────────────────

export type CapabilityRoutingPolicy = {
    allowOwnerPool: boolean;
    allowPublicPool: boolean;
    preferOwnerFirst: boolean;
    minOwnerScore: number;
    minPublicScore: number;
};

export type EphemeralCapabilityPolicy = {
    draftSemanticReuseThreshold: number;
    publishedSkillReuseThreshold: number;
    runtimeGrantTtlHours: number;
    runtimeGrantMaxUseCount: number;
    replayRetryableErrorCodeAllowlist: string[];
    replayNonRetryableErrorCodeBlocklist: string[];
};

// ── Promotion ────────────────────────────────────────────────────────────────

export type PromotionTaskStatus =
    | 'PENDING_REVIEW'
    | 'IN_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'PUBLISHED';

export type PromotionTaskAction =
    | 'START_REVIEW'
    | 'MARK_APPROVED'
    | 'MARK_REJECTED'
    | 'MARK_PUBLISHED'
    | 'SYNC_DRAFT_STATUS';

// ── Constants ────────────────────────────────────────────────────────────────

export const SESSION_DETAIL_TURN_LIMIT = 80;
export const SESSION_DETAIL_PLAN_LIMIT = 20;

// ── Prisma JSON helper type ──────────────────────────────────────────────────

export type PrismaInputJson = Prisma.InputJsonValue;
