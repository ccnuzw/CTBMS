import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    DecisionRecordDto,
    CreateDecisionRecordDto,
    UpdateDecisionRecordDto,
    DecisionRecordQueryDto,
    DecisionRecordPageDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const BASE = '/decision-records';

const decisionRecordKeys = {
    all: ['decision-records'] as const,
    lists: () => [...decisionRecordKeys.all, 'list'] as const,
    list: (params: DecisionRecordQueryDto) => [...decisionRecordKeys.lists(), params] as const,
    details: () => [...decisionRecordKeys.all, 'detail'] as const,
    detail: (id: string) => [...decisionRecordKeys.details(), id] as const,
    byExecution: (executionId: string) =>
        [...decisionRecordKeys.all, 'execution', executionId] as const,
};

/**
 * 分页查询决策记录
 */
export const useDecisionRecordList = (params: DecisionRecordQueryDto) => {
    return useQuery<DecisionRecordPageDto>({
        queryKey: decisionRecordKeys.list(params),
        queryFn: async () => {
            const res = await apiClient.get<DecisionRecordPageDto>(BASE, { params });
            return res.data;
        },
    });
};

/**
 * 查询单条决策记录
 */
export const useDecisionRecordDetail = (id: string, enabled = true) => {
    return useQuery<DecisionRecordDto>({
        queryKey: decisionRecordKeys.detail(id),
        queryFn: async () => {
            const res = await apiClient.get<DecisionRecordDto>(`${BASE}/${id}`);
            return res.data;
        },
        enabled: !!id && enabled,
    });
};

/**
 * 按执行 ID 查询关联决策记录
 */
export const useDecisionRecordsByExecution = (executionId: string, enabled = true) => {
    return useQuery<DecisionRecordDto[]>({
        queryKey: decisionRecordKeys.byExecution(executionId),
        queryFn: async () => {
            const res = await apiClient.get<DecisionRecordDto[]>(
                `${BASE}/execution/${executionId}`,
            );
            return res.data;
        },
        enabled: !!executionId && enabled,
    });
};

/**
 * 创建决策记录
 */
export const useCreateDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateDecisionRecordDto) => {
            const res = await apiClient.post<DecisionRecordDto>(BASE, dto);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};

/**
 * 更新决策记录
 */
export const useUpdateDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: UpdateDecisionRecordDto }) => {
            const res = await apiClient.put<DecisionRecordDto>(`${BASE}/${id}`, dto);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};

/**
 * 删除决策记录
 */
export const useDeleteDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`${BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};

/**
 * 发布决策记录
 */
export const usePublishDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<DecisionRecordDto>(`${BASE}/${id}/publish`);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};

/**
 * 审核决策记录
 */
export const useReviewDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
            const res = await apiClient.post<DecisionRecordDto>(`${BASE}/${id}/review`, {
                comment,
            });
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};
