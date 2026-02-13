import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    WorkflowExperimentDto,
    CreateWorkflowExperimentDto,
    UpdateWorkflowExperimentDto,
    WorkflowExperimentQueryDto,
    WorkflowExperimentPageDto,
    ConcludeExperimentDto,
    RecordExperimentMetricsDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const BASE = '/workflow-experiments';

const experimentKeys = {
    all: ['workflow-experiments'] as const,
    lists: () => [...experimentKeys.all, 'list'] as const,
    list: (params: WorkflowExperimentQueryDto) => [...experimentKeys.lists(), params] as const,
    details: () => [...experimentKeys.all, 'detail'] as const,
    detail: (id: string) => [...experimentKeys.details(), id] as const,
};

/** 分页查询实验 */
export const useExperimentList = (params: WorkflowExperimentQueryDto) => {
    return useQuery<WorkflowExperimentPageDto>({
        queryKey: experimentKeys.list(params),
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExperimentPageDto>(BASE, { params });
            return res.data;
        },
    });
};

/** 单条实验详情 */
export const useExperimentDetail = (id: string, enabled = true) => {
    return useQuery<WorkflowExperimentDto>({
        queryKey: experimentKeys.detail(id),
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExperimentDto>(`${BASE}/${id}`);
            return res.data;
        },
        enabled: !!id && enabled,
    });
};

/** 创建实验 */
export const useCreateExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateWorkflowExperimentDto) => {
            const res = await apiClient.post<WorkflowExperimentDto>(BASE, dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 更新实验 */
export const useUpdateExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: UpdateWorkflowExperimentDto }) => {
            const res = await apiClient.put<WorkflowExperimentDto>(`${BASE}/${id}`, dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 删除实验 */
export const useDeleteExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`${BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 启动实验 */
export const useStartExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<WorkflowExperimentDto>(`${BASE}/${id}/start`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 暂停实验 */
export const usePauseExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<WorkflowExperimentDto>(`${BASE}/${id}/pause`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 中止实验 */
export const useAbortExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<WorkflowExperimentDto>(`${BASE}/${id}/abort`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 结论实验 */
export const useConcludeExperiment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: ConcludeExperimentDto }) => {
            const res = await apiClient.post<WorkflowExperimentDto>(
                `${BASE}/${id}/conclude`,
                dto,
            );
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};

/** 流量路由 */
export const useRouteTraffic = () => {
    return useMutation({
        mutationFn: async (experimentId: string) => {
            const res = await apiClient.get<{ variant: 'A' | 'B'; versionId: string }>(
                `${BASE}/${experimentId}/route`,
            );
            return res.data;
        },
    });
};

/** 上报执行指标（含自动止损检查） */
export const useRecordExperimentMetrics = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            experimentId,
            dto,
        }: {
            experimentId: string;
            dto: RecordExperimentMetricsDto;
        }) => {
            const res = await apiClient.post<{
                recorded: boolean;
                autoStopped: boolean;
                reason?: string;
            }>(`${BASE}/${experimentId}/metrics`, dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: experimentKeys.all }),
    });
};
