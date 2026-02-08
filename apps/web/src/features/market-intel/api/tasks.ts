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
    IntelTaskStatus,
    GetCalendarPreviewDto,
    CalendarPreviewTask,
    GetCalendarSummaryDto,
    CalendarSummaryResponse,
    CreateIntelTaskRuleDto,
    UpdateIntelTaskRuleDto,
    IntelTaskRuleResponse,
    GetRuleMetricsDto,
    IntelTaskRuleMetricsResponse,
} from '@packages/types';

const BASE_URL = '/intel-tasks';

// --- Tasks ---

export const useTasks = (query: IntelTaskQuery, options?: { enabled?: boolean }) => {
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
        enabled: options?.enabled ?? true,
    });
};

export const useTask = (id?: string) => {
    return useQuery({
        queryKey: ['intel-task', id],
        queryFn: async () => {
            const { data } = await apiClient.get<IntelTaskResponse>(`${BASE_URL}/${id}`);
            return data;
        },
        enabled: !!id,
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

export const useTaskPerformanceMetrics = (query: IntelTaskQuery) => {
    return useQuery({
        queryKey: ['intel-tasks-metrics-performance', query],
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
                groupBy: string;
                id: string;
                name: string;
                total: number;
                pending: number;
                completed: number;
                overdue: number;
                late: number;
                completionRate: number;
                overdueRate: number;
                lateRate: number;
                score: number;
            }>>(`${BASE_URL}/metrics/performance`, { params });
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

export const useSubmitTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, operatorId, data }: { id: string; operatorId: string; data?: any }) => {
            const { data: res } = await apiClient.post<IntelTaskResponse>(`${BASE_URL}/${id}/submit`, { operatorId, data });
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-intel-tasks'] });
        },
    });
};

export const useReviewTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, operatorId, approved, reason }: { id: string; operatorId: string; approved: boolean; reason?: string }) => {
            const { data: res } = await apiClient.post<IntelTaskResponse>(`${BASE_URL}/${id}/review`, { operatorId, approved, reason });
            return res;
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

// --- Task Rules ---

export const useTaskRules = (templateId?: string) => {
    return useQuery({
        queryKey: ['intel-task-rules', templateId],
        queryFn: async () => {
            const { data } = await apiClient.get<IntelTaskRuleResponse[]>(`${BASE_URL}/templates/${templateId}/rules`);
            return data;
        },
        enabled: !!templateId,
    });
};

export const useCreateTaskRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateIntelTaskRuleDto) => {
            const { data: res } = await apiClient.post<IntelTaskRuleResponse>(
                `${BASE_URL}/templates/${data.templateId}/rules`,
                data,
            );
            return res;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['intel-task-rules', variables.templateId] });
        },
    });
};

export const useUpdateTaskRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateIntelTaskRuleDto }) => {
            const { data: res } = await apiClient.put<IntelTaskRuleResponse>(`${BASE_URL}/rules/${id}`, data);
            return res;
        },
        onSuccess: (_, variables) => {
            if (variables?.data?.templateId) {
                queryClient.invalidateQueries({ queryKey: ['intel-task-rules', variables.data.templateId] });
            } else {
                queryClient.invalidateQueries({ queryKey: ['intel-task-rules'] });
            }
        },
    });
};

export const useDeleteTaskRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
            await apiClient.delete(`${BASE_URL}/rules/${id}`);
            return templateId;
        },
        onSuccess: (templateId) => {
            queryClient.invalidateQueries({ queryKey: ['intel-task-rules', templateId] });
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

export const usePreviewDistribution = () => {
    return useMutation({
        mutationFn: async (templateId: string) => {
            const { data } = await apiClient.post<any>(`${BASE_URL}/templates/${templateId}/preview`);
            return data;
        },
    });
};

export const useCalendarPreview = (query: GetCalendarPreviewDto, options?: { enabled?: boolean }) => {
    return useQuery({
        queryKey: ['calendar-preview', query],
        queryFn: async () => {
            // Strictly pick only allowed params to avoid 400 Bad Request from extra fields (page, pageSize, type, etc.)
            const params = {
                startDate: query.startDate instanceof Date ? query.startDate.toISOString() : query.startDate,
                endDate: query.endDate instanceof Date ? query.endDate.toISOString() : query.endDate,
                assigneeId: query.assigneeId || undefined,
                assigneeOrgId: query.assigneeOrgId || undefined,
                assigneeDeptId: query.assigneeDeptId || undefined,
            };

            const { data } = await apiClient.get<CalendarPreviewTask[]>(`${BASE_URL}/calendar-preview`, { params });
            return data;
        },
        enabled: (options?.enabled ?? true) && !!query.startDate && !!query.endDate,
    });
};

export const useCalendarSummary = (query: GetCalendarSummaryDto) => {
    return useQuery({
        queryKey: ['calendar-summary', query],
        queryFn: async () => {
            const params = {
                startDate: query.startDate instanceof Date ? query.startDate.toISOString() : query.startDate,
                endDate: query.endDate instanceof Date ? query.endDate.toISOString() : query.endDate,
                assigneeId: query.assigneeId || undefined,
                assigneeOrgId: query.assigneeOrgId || undefined,
                assigneeDeptId: query.assigneeDeptId || undefined,
                status: query.status || undefined,
                type: query.type || undefined,
                priority: query.priority || undefined,
                includePreview: query.includePreview || undefined,
            };
            const { data } = await apiClient.get<CalendarSummaryResponse>(`${BASE_URL}/calendar-summary`, { params });
            return data;
        },
        enabled: !!query.startDate && !!query.endDate,
    });
};

export const useRuleMetrics = (templateId?: string, query?: GetRuleMetricsDto) => {
    return useQuery({
        queryKey: ['rule-metrics', templateId, query],
        queryFn: async () => {
            if (!templateId) {
                return null;
            }
            const params = {
                startDate: query?.startDate instanceof Date ? query.startDate.toISOString() : query?.startDate,
                endDate: query?.endDate instanceof Date ? query.endDate.toISOString() : query?.endDate,
            };
            const { data } = await apiClient.get<IntelTaskRuleMetricsResponse>(`${BASE_URL}/templates/${templateId}/rule-metrics`, { params });
            return data;
        },
        enabled: !!templateId,
    });
};
