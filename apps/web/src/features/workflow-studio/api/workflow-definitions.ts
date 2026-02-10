import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CreateWorkflowDefinitionDto,
    CreateWorkflowVersionDto,
    PublishWorkflowVersionDto,
    ValidateWorkflowDslDto,
    WorkflowDefinitionDto,
    WorkflowDefinitionPageDto,
    WorkflowDefinitionQueryDto,
    WorkflowExecutionDetailDto,
    WorkflowValidationResult,
    WorkflowVersionDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/workflow-definitions';

export const useWorkflowDefinitions = (query?: Partial<WorkflowDefinitionQueryDto>) => {
    return useQuery<WorkflowDefinitionPageDto>({
        queryKey: ['workflow-definitions', query],
        queryFn: async () => {
            const res = await apiClient.get<WorkflowDefinitionPageDto>(API_BASE, {
                params: query,
            });
            return res.data;
        },
    });
};

export const useWorkflowDefinitionDetail = (id?: string) => {
    return useQuery<WorkflowDefinitionDto>({
        queryKey: ['workflow-definition', id],
        queryFn: async () => {
            const res = await apiClient.get<WorkflowDefinitionDto>(`${API_BASE}/${id}`);
            return res.data;
        },
        enabled: Boolean(id),
    });
};

export const useWorkflowVersions = (workflowDefinitionId?: string) => {
    return useQuery<WorkflowVersionDto[]>({
        queryKey: ['workflow-versions', workflowDefinitionId],
        queryFn: async () => {
            const res = await apiClient.get<WorkflowVersionDto[]>(
                `${API_BASE}/${workflowDefinitionId}/versions`,
            );
            return res.data;
        },
        enabled: Boolean(workflowDefinitionId),
    });
};

export const useCreateWorkflowDefinition = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: CreateWorkflowDefinitionDto) => {
            const res = await apiClient.post(`${API_BASE}`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
        },
    });
};

export const useCreateWorkflowVersion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workflowDefinitionId,
            payload,
        }: {
            workflowDefinitionId: string;
            payload: CreateWorkflowVersionDto;
        }) => {
            const res = await apiClient.post(
                `${API_BASE}/${workflowDefinitionId}/versions`,
                payload,
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['workflow-versions', variables.workflowDefinitionId],
            });
            queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
        },
    });
};

export const usePublishWorkflowVersion = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workflowDefinitionId,
            payload,
        }: {
            workflowDefinitionId: string;
            payload: PublishWorkflowVersionDto;
        }) => {
            const res = await apiClient.post(
                `${API_BASE}/${workflowDefinitionId}/publish`,
                payload,
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['workflow-versions', variables.workflowDefinitionId],
            });
            queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
            queryClient.invalidateQueries({
                queryKey: ['workflow-definition', variables.workflowDefinitionId],
            });
        },
    });
};

export const useValidateWorkflowDsl = () => {
    return useMutation({
        mutationFn: async (payload: ValidateWorkflowDslDto) => {
            const res = await apiClient.post<WorkflowValidationResult>(
                `${API_BASE}/validate-dsl`,
                payload,
            );
            return res.data;
        },
    });
};

export const useTriggerWorkflowExecution = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            workflowDefinitionId: string;
            workflowVersionId?: string;
        }) => {
            const res = await apiClient.post<WorkflowExecutionDetailDto>(
                '/workflow-executions/trigger',
                payload,
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
        },
    });
};
