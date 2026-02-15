import {
    AgentPromptTemplateDto,
    AgentPromptTemplatePageDto,
    AgentPromptTemplateQueryDto,
    CreateAgentPromptTemplateDto,
    UpdateAgentPromptTemplateDto,
} from '@packages/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';

const API_BASE = '/agent-prompt-templates';

export const useAgentPromptTemplates = (query: AgentPromptTemplateQueryDto) => {
    return useQuery({
        queryKey: ['agent-prompt-templates', query],
        queryFn: async () => {
            const { data } = await apiClient.get<AgentPromptTemplatePageDto>(API_BASE, { params: query });
            return data;
        },
    });
};

export const useAgentPromptTemplate = (id: string) => {
    return useQuery({
        queryKey: ['agent-prompt-template', id],
        queryFn: async () => {
            const { data } = await apiClient.get<AgentPromptTemplateDto>(`${API_BASE}/${id}`);
            return data;
        },
        enabled: !!id,
    });
};

export const useCreateAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: CreateAgentPromptTemplateDto) => {
            const { data } = await apiClient.post<AgentPromptTemplateDto>(API_BASE, payload);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
        },
    });
};

export const useUpdateAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, payload }: { id: string; payload: UpdateAgentPromptTemplateDto }) => {
            const { data } = await apiClient.patch<AgentPromptTemplateDto>(`${API_BASE}/${id}`, payload);
            return data;
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-template', id] });
        },
    });
};

export const useDeleteAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`${API_BASE}/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
        },
    });
};
