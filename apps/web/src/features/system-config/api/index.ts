
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BusinessMappingRule, AIModelConfig, CreateMappingRuleDTO, UpdateMappingRuleDTO, PromptTemplate, CreatePromptDTO } from '../types';

// Prompt Hooks
export const usePrompts = () => {
    return useQuery({
        queryKey: ['prompts'],
        queryFn: async () => {
            const res = await fetch(`${PROMPT_API_BASE}`);
            if (!res.ok) throw new Error('Failed to fetch prompts');
            return res.json() as Promise<PromptTemplate[]>;
        },
    });
};

export const useCreatePrompt = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreatePromptDTO) => {
            const res = await fetch(`${PROMPT_API_BASE}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create prompt');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] });
        },
    });
};

export const useUpdatePrompt = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<CreatePromptDTO> }) => {
            const res = await fetch(`${PROMPT_API_BASE}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update prompt');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] });
        },
    });
};

export const useDeletePrompt = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${PROMPT_API_BASE}/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete prompt');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] });
        },
    });
};

export const usePreviewPrompt = () => {
    return useMutation({
        mutationFn: async ({ code, variables }: { code: string; variables: any }) => {
            const res = await fetch(`${PROMPT_API_BASE}/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, variables }),
            });
            if (!res.ok) throw new Error('Failed to preview prompt');
            return res.json() as Promise<{ system: string; user: string }>;
        },
    });
};

export * from '../types'; // Ensure types are re-exported if needed by consumers via import { ... } from './api'


const API_BASE = '/api/config';
const PROMPT_API_BASE = '/api/prompts'; // New Controller

// Rules Hooks
export const useMappingRules = (domain?: string) => {
    return useQuery({
        queryKey: ['mapping-rules', domain],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (domain) params.append('domain', domain);
            const res = await fetch(`${API_BASE}/rules?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch rules');
            const json = await res.json();
            return json as Promise<BusinessMappingRule[]>;
        },
    });
};

export const useCreateMappingRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateMappingRuleDTO) => {
            const res = await fetch(`${API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create rule');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mapping-rules'] });
        },
    });
};

export const useUpdateMappingRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateMappingRuleDTO }) => {
            const res = await fetch(`${API_BASE}/rules/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update rule');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mapping-rules'] });
        },
    });
};

export const useDeleteMappingRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/rules/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete rule');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mapping-rules'] });
        },
    });
};

// AI Config Hooks
export const useAIConfig = (key: string = 'DEFAULT') => {
    return useQuery({
        queryKey: ['ai-config', key],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/ai-models/${key}`);
            // If 404/null, might need handling, but assuming always correct or returns null check
            if (!res.ok) throw new Error('Failed to fetch AI config');
            return res.json() as Promise<AIModelConfig>;
        },
    });
};

export const useUpdateAIConfig = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await fetch(`${API_BASE}/ai-models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to save AI config');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['ai-config', variables.configKey] });
        },
    });
};
