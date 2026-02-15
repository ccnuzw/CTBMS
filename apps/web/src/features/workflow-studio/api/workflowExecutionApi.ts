import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    WorkflowExecutionDto,
    WorkflowExecutionPageDto,
    WorkflowExecutionQueryDto,
    WorkflowExecutionDetailDto,
    WorkflowRuntimeEventQueryDto,
    WorkflowRuntimeEventPageDto,
    CancelWorkflowExecutionDto,
    TriggerWorkflowExecutionDto,
    DebateReplayQueryDto,
    DebateTimelineDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const BASE = '/workflow-executions';

const executionKeys = {
    all: ['workflow-executions'] as const,
    lists: () => [...executionKeys.all, 'list'] as const,
    list: (params: WorkflowExecutionQueryDto) => [...executionKeys.lists(), params] as const,
    details: () => [...executionKeys.all, 'detail'] as const,
    detail: (id: string) => [...executionKeys.details(), id] as const,
    timelines: () => [...executionKeys.all, 'timeline'] as const,
    timeline: (id: string, params?: WorkflowRuntimeEventQueryDto) =>
        [...executionKeys.timelines(), id, params] as const,
    debateTimelines: () => [...executionKeys.all, 'debate-timeline'] as const,
    debateTimeline: (id: string) => [...executionKeys.debateTimelines(), id] as const,
    replays: () => [...executionKeys.all, 'replay'] as const,
    replay: (id: string) => [...executionKeys.replays(), id] as const,
};

/**
 * 分页查询执行记录
 */
export const useWorkflowExecutions = (params: WorkflowExecutionQueryDto) => {
    return useQuery<WorkflowExecutionPageDto>({
        queryKey: executionKeys.list(params),
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExecutionPageDto>(BASE, { params });
            return res.data;
        },
    });
};

/**
 * 查询单条执行详情
 */
export const useWorkflowExecutionDetail = (id?: string) => {
    return useQuery<WorkflowExecutionDetailDto>({
        queryKey: executionKeys.detail(id!),
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExecutionDetailDto>(`${BASE}/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

/**
 * 查询执行时间线 (Events)
 */
export const useWorkflowExecutionTimeline = (
    id: string,
    params?: WorkflowRuntimeEventQueryDto,
    enabled = true
) => {
    return useQuery<WorkflowRuntimeEventPageDto>({
        queryKey: executionKeys.timeline(id, params),
        queryFn: async () => {
            const res = await apiClient.get<WorkflowRuntimeEventPageDto>(
                `${BASE}/${id}/timeline`,
                { params }
            );
            return res.data;
        },
        enabled: !!id && enabled,
    });
};

// useTriggerWorkflowExecution is already exported from './workflow-definitions'

/**
 * 取消执行
 */
export const useCancelWorkflowExecution = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, payload }: { id: string; payload: CancelWorkflowExecutionDto }) => {
            const res = await apiClient.post<WorkflowExecutionDto>(
                `${BASE}/${id}/cancel`,
                payload
            );
            return res.data;
        },
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: executionKeys.all });
            qc.invalidateQueries({ queryKey: executionKeys.detail(id) });
        },
    });
};

/**
 * 重新运行 (Rerun)
 */
export const useRerunWorkflowExecution = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<WorkflowExecutionDetailDto>(`${BASE}/${id}/rerun`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: executionKeys.all }),
    });
};

/**
 * 查询辩论时间线 (Debate Mode Specific)
 */
export const useWorkflowExecutionDebateTimeline = (id: string, enabled = true) => {
    return useQuery<DebateTimelineDto>({
        queryKey: executionKeys.debateTimeline(id),
        queryFn: async () => {
            const res = await apiClient.get<DebateTimelineDto>(
                `${BASE}/${id}/debate-timeline`
            );
            return res.data;
        },
        enabled: !!id && enabled,
    });
};

/**
 * 查询回放数据 (Replay)
 */
export const useWorkflowExecutionReplay = (id: string, enabled = true) => {
    return useQuery<any>({ // Replay DTO type to be confirmed
        queryKey: executionKeys.replay(id),
        queryFn: async () => {
            const res = await apiClient.get<any>(`${BASE}/${id}/replay`);
            return res.data;
        },
        enabled: !!id && enabled,
    });
};
