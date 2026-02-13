import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';
import type { DebateRoundTraceDto, DebateTimelineDto } from '@packages/types';

// ────────────────── Query Keys ──────────────────

const DEBATE_TRACE_KEYS = {
    all: ['debate-traces'] as const,
    byExecution: (executionId: string) => [...DEBATE_TRACE_KEYS.all, executionId] as const,
    timeline: (executionId: string) => [...DEBATE_TRACE_KEYS.all, executionId, 'timeline'] as const,
};

// ────────────────── Queries ──────────────────

/**
 * 查询指定执行实例的辩论轨迹
 */
export const useDebateTraces = (
    executionId: string,
    params?: { roundNumber?: number; participantCode?: string; isJudgement?: boolean },
) => {
    return useQuery<DebateRoundTraceDto[]>({
        queryKey: [...DEBATE_TRACE_KEYS.byExecution(executionId), params],
        queryFn: () =>
            apiClient.get(`/debate-traces/${executionId}`, { params }).then((res: { data: DebateRoundTraceDto[] }) => res.data),
        enabled: !!executionId,
    });
};

/**
 * 查询辩论时间线视图
 */
export const useDebateTimeline = (executionId: string) => {
    return useQuery<DebateTimelineDto>({
        queryKey: DEBATE_TRACE_KEYS.timeline(executionId),
        queryFn: () =>
            apiClient.get(`/debate-traces/${executionId}/timeline`).then((res: { data: DebateTimelineDto }) => res.data),
        enabled: !!executionId,
    });
};
