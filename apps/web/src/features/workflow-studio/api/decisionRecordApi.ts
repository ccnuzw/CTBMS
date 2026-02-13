import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/utils/request';
import type {
    DecisionRecordDto,
    CreateDecisionRecordDto,
    UpdateDecisionRecordDto,
    DecisionRecordQueryDto,
    DecisionRecordPageDto,
} from '@packages/types';

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
    return useQuery({
        queryKey: decisionRecordKeys.list(params),
        queryFn: () => request.get<DecisionRecordPageDto>(BASE, { params }),
    });
};

/**
 * 查询单条决策记录
 */
export const useDecisionRecordDetail = (id: string, enabled = true) => {
    return useQuery({
        queryKey: decisionRecordKeys.detail(id),
        queryFn: () => request.get<DecisionRecordDto>(`${BASE}/${id}`),
        enabled: !!id && enabled,
    });
};

/**
 * 按执行 ID 查询关联决策记录
 */
export const useDecisionRecordsByExecution = (executionId: string, enabled = true) => {
    return useQuery({
        queryKey: decisionRecordKeys.byExecution(executionId),
        queryFn: () => request.get<DecisionRecordDto[]>(`${BASE}/execution/${executionId}`),
        enabled: !!executionId && enabled,
    });
};

/**
 * 创建决策记录
 */
export const useCreateDecisionRecord = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (dto: CreateDecisionRecordDto) => request.post<DecisionRecordDto>(BASE, dto),
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
        mutationFn: ({ id, dto }: { id: string; dto: UpdateDecisionRecordDto }) =>
            request.put<DecisionRecordDto>(`${BASE}/${id}`, dto),
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
        mutationFn: (id: string) => request.delete(`${BASE}/${id}`),
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
        mutationFn: (id: string) => request.post<DecisionRecordDto>(`${BASE}/${id}/publish`),
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
        mutationFn: ({ id, comment }: { id: string; comment: string }) =>
            request.post<DecisionRecordDto>(`${BASE}/${id}/review`, { comment }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: decisionRecordKeys.all });
        },
    });
};
