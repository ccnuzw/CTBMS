/**
 * 动态编排 API Hooks
 *
 * Phase 8: 前端 React Query hooks，对接 Phase 7 新增的 REST 端点。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EphemeralAgentSpec {
    agentCode: string;
    name: string;
    systemPrompt: string;
    outputSchema: Record<string, unknown>;
    requiredDataSources: string[];
    parameterRefs: string[];
    riskLevel: 'LOW' | 'MEDIUM';
}

export interface EphemeralAgent {
    id: string;
    sessionId: string;
    agentCode: string;
    name: string;
    spec: EphemeralAgentSpec;
    status: 'ACTIVE' | 'EXPIRED' | 'PROMOTED';
    ttlHours: number;
    expiresAt: string;
    createdAt: string;
}

export interface EphemeralWorkflowNode {
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
}

export interface EphemeralWorkflowEdge {
    from: string;
    to: string;
    condition?: string;
}

export interface EphemeralWorkflow {
    id: string;
    sessionId: string;
    name: string;
    mode: 'LINEAR' | 'DAG';
    nodes: EphemeralWorkflowNode[];
    edges: EphemeralWorkflowEdge[];
    status: 'ACTIVE' | 'EXPIRED';
    ttlHours: number;
    expiresAt: string;
    createdAt: string;
}

export interface AvailableAgent {
    agentCode: string;
    name: string;
    source: 'EPHEMERAL' | 'PUBLISHED';
}

export interface EphemeralOverrideResult {
    paramOverrides: Record<string, unknown>;
    ruleOverrides: Record<string, unknown>;
    nodeSkips: string[];
    applied: boolean;
}

export interface ReportCard {
    id: string;
    type: 'SUMMARY' | 'FINDING' | 'RISK' | 'ACTION';
    title: string;
    content: string;
    order: number;
    metadata?: Record<string, unknown>;
}

export interface SessionCostSummary {
    ephemeralAgents: { total: number; active: number; expired: number; promoted: number };
    ephemeralWorkflows: { total: number; active: number; expired: number };
    limits: { maxAgentsPerSession: number; maxNodesPerWorkflow: number; defaultTtlHours: number };
}

export interface PromoteResult {
    draftId: string;
    promotionTaskAssetId: string;
    agentCode: string;
}

// ── API Base ──────────────────────────────────────────────────────────────────

const BASE = '/agent-conversations/sessions';

// ── Query Keys ────────────────────────────────────────────────────────────────

export const orchestrationKeys = {
    agents: (sessionId: string) => ['orchestration', 'agents', sessionId] as const,
    availableAgents: (sessionId: string) => ['orchestration', 'availableAgents', sessionId] as const,
    reportCards: (sessionId: string) => ['orchestration', 'reportCards', sessionId] as const,
    costSummary: (sessionId: string) => ['orchestration', 'costSummary', sessionId] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useListEphemeralAgents(sessionId: string | null) {
    return useQuery({
        queryKey: orchestrationKeys.agents(sessionId ?? ''),
        queryFn: () => apiClient.get<EphemeralAgent[]>(`${BASE}/${sessionId}/agents`).then((r) => r.data),
        enabled: Boolean(sessionId),
        staleTime: 10_000,
    });
}

export function useAvailableAgents(sessionId: string | null) {
    return useQuery({
        queryKey: orchestrationKeys.availableAgents(sessionId ?? ''),
        queryFn: () => apiClient.get<AvailableAgent[]>(`${BASE}/${sessionId}/agents/available`).then((r) => r.data),
        enabled: Boolean(sessionId),
        staleTime: 30_000,
    });
}

export function useReportCards(sessionId: string | null) {
    return useQuery({
        queryKey: orchestrationKeys.reportCards(sessionId ?? ''),
        queryFn: () =>
            apiClient.get<{ cards: ReportCard[] }>(`${BASE}/${sessionId}/report-cards`).then((r) => r.data.cards),
        enabled: Boolean(sessionId),
        staleTime: 30_000,
    });
}

export function useSessionCostSummary(sessionId: string | null) {
    return useQuery({
        queryKey: orchestrationKeys.costSummary(sessionId ?? ''),
        queryFn: () => apiClient.get<SessionCostSummary>(`${BASE}/${sessionId}/cost-summary`).then((r) => r.data),
        enabled: Boolean(sessionId),
        staleTime: 15_000,
    });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useGenerateEphemeralAgent(sessionId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (dto: { userInstruction: string; context?: string }) =>
            apiClient.post<EphemeralAgent>(`${BASE}/${sessionId}/agents/generate`, dto).then((r) => r.data),
        onSuccess: () => {
            if (sessionId) {
                qc.invalidateQueries({ queryKey: orchestrationKeys.agents(sessionId) });
                qc.invalidateQueries({ queryKey: orchestrationKeys.availableAgents(sessionId) });
                qc.invalidateQueries({ queryKey: orchestrationKeys.costSummary(sessionId) });
            }
        },
    });
}

export function usePromoteEphemeralAgent(sessionId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (dto: { agentAssetId: string; reviewComment?: string }) =>
            apiClient
                .post<PromoteResult>(`${BASE}/${sessionId}/agents/${dto.agentAssetId}/promote`, {
                    reviewComment: dto.reviewComment,
                })
                .then((r) => r.data),
        onSuccess: () => {
            if (sessionId) {
                qc.invalidateQueries({ queryKey: orchestrationKeys.agents(sessionId) });
                qc.invalidateQueries({ queryKey: orchestrationKeys.costSummary(sessionId) });
            }
        },
    });
}

export function useAssembleEphemeralWorkflow(sessionId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (dto: { userInstruction: string; context?: string }) =>
            apiClient.post<EphemeralWorkflow>(`${BASE}/${sessionId}/workflows/assemble`, dto).then((r) => r.data),
        onSuccess: () => {
            if (sessionId) {
                qc.invalidateQueries({ queryKey: orchestrationKeys.costSummary(sessionId) });
            }
        },
    });
}

export function useApplyEphemeralOverrides(sessionId: string | null) {
    return useMutation({
        mutationFn: (dto: { userMessage: string }) =>
            apiClient.post<EphemeralOverrideResult>(`${BASE}/${sessionId}/overrides`, dto).then((r) => r.data),
    });
}
