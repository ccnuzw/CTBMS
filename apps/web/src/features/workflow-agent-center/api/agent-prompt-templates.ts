import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AgentPromptTemplateDto,
    AgentPromptTemplatePageDto,
    AgentPromptTemplateQueryDto,
    CreateAgentPromptTemplateDto,
    UpdateAgentPromptTemplateDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/agent-prompt-templates';

export const useAgentPromptTemplates = (query?: Partial<AgentPromptTemplateQueryDto>) => {
    return useQuery<AgentPromptTemplatePageDto>({
        queryKey: ['agent-prompt-templates', query],
        queryFn: async () => {
            const res = await apiClient.get<AgentPromptTemplatePageDto>(API_BASE, { params: query });
            return res.data;
        },
    });
};

export const useCreateAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: CreateAgentPromptTemplateDto) => {
            const res = await apiClient.post<AgentPromptTemplateDto>(API_BASE, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
        },
    });
};

export const useUpdateAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            payload,
        }: {
            id: string;
            payload: UpdateAgentPromptTemplateDto;
        }) => {
            const res = await apiClient.patch<AgentPromptTemplateDto>(`${API_BASE}/${id}`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
        },
    });
};

export const useDeleteAgentPromptTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`${API_BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agent-prompt-templates'] });
        },
    });
};
