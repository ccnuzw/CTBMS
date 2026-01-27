import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    IntelTaskQuery,
    IntelTaskResponse,
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    IntelTaskTemplateResponse,
    BatchDistributeTasksDto,
    IntelTaskStatus
} from '@packages/types';

const BASE_URL = '/intel-tasks';

// --- Tasks ---

export const useTasks = (query: IntelTaskQuery) => {
    return useQuery({
        queryKey: ['intel-tasks', query],
        queryFn: async () => {
            // Convert date objects to strings if needed by request utility
            const params = { ...query };
            if (params.startDate) (params as any).startDate = params.startDate.toISOString();
            if (params.endDate) (params as any).endDate = params.endDate.toISOString();
            if ((params as any).periodStart) (params as any).periodStart = (params as any).periodStart.toISOString();
            if ((params as any).periodEnd) (params as any).periodEnd = (params as any).periodEnd.toISOString();
            if ((params as any).dueStart) (params as any).dueStart = (params as any).dueStart.toISOString();
            if ((params as any).dueEnd) (params as any).dueEnd = (params as any).dueEnd.toISOString();
            if ((params as any).metricsStart) (params as any).metricsStart = (params as any).metricsStart.toISOString();
            if ((params as any).metricsEnd) (params as any).metricsEnd = (params as any).metricsEnd.toISOString();

            const { data } = await apiClient.get<{
                data: IntelTaskResponse[];
                total: number;
            }>(BASE_URL, { params });
            return data;
        },
    });
};

export const useTaskMetrics = (query: IntelTaskQuery) => {
    return useQuery({
        queryKey: ['intel-tasks-metrics', query],
        queryFn: async () => {
            const params = { ...query };
            if (params.startDate) (params as any).startDate = params.startDate.toISOString();
            if (params.endDate) (params as any).endDate = params.endDate.toISOString();
            if ((params as any).periodStart) (params as any).periodStart = (params as any).periodStart.toISOString();
            if ((params as any).periodEnd) (params as any).periodEnd = (params as any).periodEnd.toISOString();
            if ((params as any).dueStart) (params as any).dueStart = (params as any).dueStart.toISOString();
            if ((params as any).dueEnd) (params as any).dueEnd = (params as any).dueEnd.toISOString();
            if ((params as any).metricsStart) (params as any).metricsStart = (params as any).metricsStart.toISOString();
            if ((params as any).metricsEnd) (params as any).metricsEnd = (params as any).metricsEnd.toISOString();

            const { data } = await apiClient.get<{
                total: number;
                pending: number;
                completed: number;
                overdue: number;
                late: number;
                completionRate: number;
                overdueRate: number;
                lateRate: number;
            }>(`${BASE_URL}/metrics`, { params });
            return data;
        },
    });
};

export const useTaskMetricsByOrg = (query: IntelTaskQuery) => {
    return useQuery({
        queryKey: ['intel-tasks-metrics-org', query],
        queryFn: async () => {
            const params = { ...query };
            if (params.startDate) (params as any).startDate = params.startDate.toISOString();
            if (params.endDate) (params as any).endDate = params.endDate.toISOString();
            if ((params as any).periodStart) (params as any).periodStart = (params as any).periodStart.toISOString();
            if ((params as any).periodEnd) (params as any).periodEnd = (params as any).periodEnd.toISOString();
            if ((params as any).dueStart) (params as any).dueStart = (params as any).dueStart.toISOString();
            if ((params as any).dueEnd) (params as any).dueEnd = (params as any).dueEnd.toISOString();
            if ((params as any).metricsStart) (params as any).metricsStart = (params as any).metricsStart.toISOString();
            if ((params as any).metricsEnd) (params as any).metricsEnd = (params as any).metricsEnd.toISOString();

            const { data } = await apiClient.get<Array<{
                orgId: string;
                orgName: string;
                total: number;
                pending: number;
                completed: number;
                overdue: number;
                late: number;
                completionRate: number;
                overdueRate: number;
                lateRate: number;
            }>>(`${BASE_URL}/metrics/org`, { params });
            return data;
        },
    });
};

export const useTaskMetricsByDept = (query: IntelTaskQuery) => {
    return useQuery({
        queryKey: ['intel-tasks-metrics-dept', query],
        queryFn: async () => {
            const params = { ...query };
            if (params.startDate) (params as any).startDate = params.startDate.toISOString();
            if (params.endDate) (params as any).endDate = params.endDate.toISOString();
            if ((params as any).periodStart) (params as any).periodStart = (params as any).periodStart.toISOString();
            if ((params as any).periodEnd) (params as any).periodEnd = (params as any).periodEnd.toISOString();
            if ((params as any).dueStart) (params as any).dueStart = (params as any).dueStart.toISOString();
            if ((params as any).dueEnd) (params as any).dueEnd = (params as any).dueEnd.toISOString();
            if ((params as any).metricsStart) (params as any).metricsStart = (params as any).metricsStart.toISOString();
            if ((params as any).metricsEnd) (params as any).metricsEnd = (params as any).metricsEnd.toISOString();

            const { data } = await apiClient.get<Array<{
                deptId: string;
                deptName: string;
                total: number;
                pending: number;
                completed: number;
                overdue: number;
                late: number;
                completionRate: number;
                overdueRate: number;
                lateRate: number;
            }>>(`${BASE_URL}/metrics/dept`, { params });
            return data;
        },
    });
};

export const useMyTasks = (userId: string) => {
    return useQuery({
        queryKey: ['my-intel-tasks', userId],
        queryFn: async () => {
            const { data } = await apiClient.get<IntelTaskResponse[]>(`${BASE_URL}/my`, {
                params: { userId },
            });
            return data;
        },
        enabled: !!userId,
    });
};

export const useCreateTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateIntelTaskDto) => {
            const { data: res } = await apiClient.post<IntelTaskResponse>(BASE_URL, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-intel-tasks'] });
        },
    });
};

export const useUpdateTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateIntelTaskDto }) => {
            const { data: res } = await apiClient.put<IntelTaskResponse>(`${BASE_URL}/${id}`, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-intel-tasks'] });
        },
    });
};

export const useCompleteTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, intelId }: { id: string; intelId?: string }) => {
            const { data: res } = await apiClient.post<IntelTaskResponse>(`${BASE_URL}/${id}/complete`, { intelId });
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-intel-tasks'] });
        },
    });
};

export const useDeleteTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`${BASE_URL}/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
        },
    });
};

// --- Templates ---

export const useTaskTemplates = () => {
    return useQuery({
        queryKey: ['intel-task-templates'],
        queryFn: async () => {
            const { data } = await apiClient.get<IntelTaskTemplateResponse[]>(`${BASE_URL}/templates`);
            return data;
        },
    });
};

export const useCreateTaskTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateIntelTaskTemplateDto) => {
            const { data: res } = await apiClient.post<IntelTaskTemplateResponse>(`${BASE_URL}/templates`, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-task-templates'] });
        },
    });
};

export const useUpdateTaskTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateIntelTaskTemplateDto }) => {
            const { data: res } = await apiClient.put<IntelTaskTemplateResponse>(`${BASE_URL}/templates/${id}`, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-task-templates'] });
        },
    });
};

export const useDeleteTaskTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`${BASE_URL}/templates/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-task-templates'] });
        },
    });
};

export const useDistributeTasks = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: BatchDistributeTasksDto) => {
            const { data: res } = await apiClient.post<{ count: number; message: string }>(`${BASE_URL}/distribute`, data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['intel-task-templates'] });
        },
    });
};
