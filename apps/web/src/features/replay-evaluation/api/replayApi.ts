import { useQuery, useMutation } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

// ────────────────── Types ──────────────────

interface NodeExecutionSnapshot {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    startedAt: string;
    completedAt: string;
    durationMs: number;
    attempts: number;
    inputSnapshot: Record<string, unknown>;
    outputSnapshot: Record<string, unknown>;
    errorMessage?: string;
    failureCategory?: string;
    skipReason?: string;
}

interface ExecutionReplayBundle {
    version: string;
    execution: {
        id: string;
        workflowDefinitionId: string;
        workflowVersionId: string;
        triggerType: string;
        triggerUserId: string;
        status: string;
        startedAt: string;
        completedAt: string;
        totalDurationMs: number;
        paramSnapshot: Record<string, unknown>;
    };
    timeline: NodeExecutionSnapshot[];
    evidenceBundle: Record<string, unknown>;
    dataLineage: Record<string, unknown>;
    decisionOutput: Record<string, unknown> | null;
    stats: {
        totalNodes: number;
        executedNodes: number;
        successNodes: number;
        failedNodes: number;
        skippedNodes: number;
        totalDurationMs: number;
        avgNodeDurationMs: number;
        maxNodeDurationMs: number;
        maxNodeId?: string;
    };
}

interface ExecutionComparisonResult {
    execA: ExecutionReplayBundle;
    execB: ExecutionReplayBundle;
    diff: {
        statusChanged: boolean;
        durationDiffMs: number;
        durationDiffPercent: number;
        nodesDiff: Array<{
            nodeId: string;
            nodeName: string;
            statusA: string;
            statusB: string;
            durationDiffMs: number;
        }>;
    };
}

// ────────────────── Query Keys ──────────────────

const REPLAY_KEYS = {
    all: ['replay'] as const,
    detail: (executionId: string) => [...REPLAY_KEYS.all, executionId] as const,
    comparison: (execA: string, execB: string) =>
        [...REPLAY_KEYS.all, 'compare', execA, execB] as const,
};

// ────────────────── Queries ──────────────────

/**
 * 获取执行回放包
 */
export const useExecutionReplay = (executionId: string, enabled = true) => {
    return useQuery<ExecutionReplayBundle>({
        queryKey: REPLAY_KEYS.detail(executionId),
        queryFn: () =>
            apiClient
                .get<ExecutionReplayBundle>(`/workflow-executions/${executionId}/replay`)
                .then((res) => res.data),
        enabled: !!executionId && enabled,
    });
};

/**
 * 重跑执行
 */
export const useRerunExecution = () => {
    return useMutation({
        mutationFn: async (executionId: string) => {
            const res = await apiClient.post<{ id: string; status: string }>(
                `/workflow-executions/${executionId}/rerun`,
            );
            return res.data;
        },
    });
};

/**
 * 两次执行对比
 */
export const useExecutionComparison = (execAId: string, execBId: string, enabled = true) => {
    return useQuery<ExecutionComparisonResult>({
        queryKey: REPLAY_KEYS.comparison(execAId, execBId),
        queryFn: async () => {
            const [resA, resB] = await Promise.all([
                apiClient.get<ExecutionReplayBundle>(`/workflow-executions/${execAId}/replay`),
                apiClient.get<ExecutionReplayBundle>(`/workflow-executions/${execBId}/replay`),
            ]);

            const execA = resA.data;
            const execB = resB.data;

            // 客户端侧计算差异
            const durationDiffMs = execB.stats.totalDurationMs - execA.stats.totalDurationMs;
            const durationDiffPercent =
                execA.stats.totalDurationMs > 0
                    ? (durationDiffMs / execA.stats.totalDurationMs) * 100
                    : 0;

            const nodeMapA = new Map(execA.timeline.map((n) => [n.nodeId, n]));
            const allNodeIds = new Set([
                ...execA.timeline.map((n) => n.nodeId),
                ...execB.timeline.map((n) => n.nodeId),
            ]);

            const nodesDiff = Array.from(allNodeIds).map((nodeId) => {
                const a = nodeMapA.get(nodeId);
                const b = execB.timeline.find((n) => n.nodeId === nodeId);
                return {
                    nodeId,
                    nodeName: a?.nodeName ?? b?.nodeName ?? nodeId,
                    statusA: a?.status ?? 'N/A',
                    statusB: b?.status ?? 'N/A',
                    durationDiffMs: (b?.durationMs ?? 0) - (a?.durationMs ?? 0),
                };
            });

            return {
                execA,
                execB,
                diff: {
                    statusChanged: execA.execution.status !== execB.execution.status,
                    durationDiffMs,
                    durationDiffPercent: Math.round(durationDiffPercent * 100) / 100,
                    nodesDiff,
                },
            };
        },
        enabled: !!execAId && !!execBId && enabled,
    });
};
