
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    BusinessMappingRule,
    AIModelConfig,
    CreateMappingRuleDTO,
    UpdateMappingRuleDTO,
    PromptTemplate,
    CreatePromptDTO,
    CreateDictionaryDomainDTO,
    UpdateDictionaryDomainDTO,
    CreateDictionaryItemDTO,
    UpdateDictionaryItemDTO,
    DictionaryDomainModel,
    DictionaryItemModel,
} from '../types';

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
const DICTIONARY_DOMAIN_API_BASE = '/api/config/dictionary-domains';

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
export const useAIConfigs = (includeInactive: boolean = false) => {
    return useQuery({
        queryKey: ['ai-configs', includeInactive],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (includeInactive) params.append('includeInactive', 'true');
            const res = await fetch(`${API_BASE}/ai-models?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch AI configs');
            return res.json() as Promise<AIModelConfig[]>;
        },
    });
};

export const useAIConfig = (key: string = 'DEFAULT') => {
    return useQuery({
        queryKey: ['ai-config', key],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/ai-models/${key}`);
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
            queryClient.invalidateQueries({ queryKey: ['ai-configs'] });
        },
    });
};

export const useDeleteAIConfig = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (key: string) => {
            const res = await fetch(`${API_BASE}/ai-models/${key}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete AI config');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-configs'] });
        },
    });
};

const AI_API_BASE = '/api/ai';

export const useTestAIConnection = () => {
    return useMutation({
        mutationFn: async (configKey?: string) => {
            const params = new URLSearchParams();
            if (configKey) params.append('configKey', configKey);
            const res = await fetch(`${AI_API_BASE}/test-connection?${params.toString()}`);

            if (!res.ok) throw new Error('Network error during connection test');
            return res.json() as Promise<{
                success: boolean;
                message: string;
                response?: string;
                error?: string;
                apiUrl?: string;
                modelId?: string;
                provider?: string;
            }>;
        },
    });
};

export const useTestAIModel = () => {
    return useMutation({
        mutationFn: async (payload: {
            provider: string;
            modelName: string;
            apiKey?: string;
            apiUrl?: string;
            authType?: 'bearer' | 'api-key' | 'custom' | 'none';
            headers?: Record<string, string>;
            queryParams?: Record<string, string>;
            pathOverrides?: Record<string, string>;
            modelFetchMode?: 'official' | 'manual' | 'custom';
            allowUrlProbe?: boolean;
            timeoutMs?: number;
            maxRetries?: number;
            temperature?: number;
            maxTokens?: number;
            topP?: number;
        }) => {
            const res = await fetch(`${AI_API_BASE}/test-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Network error during model test');
            return res.json() as Promise<{
                success: boolean;
                message: string;
                response?: string;
                error?: string;
                modelId?: string;
                provider?: string;
                apiUrl?: string;
            }>;
        },
    });
};

export const useFetchAIModels = () => {
    return useMutation({
        mutationFn: async ({
            provider,
            apiKey,
            apiUrl,
            configKey,
        }: { provider: string; apiKey?: string; apiUrl?: string; configKey?: string }) => {
            const params = new URLSearchParams();
            params.append('provider', provider);
            if (apiKey) params.append('apiKey', apiKey);
            if (apiUrl) params.append('apiUrl', apiUrl);
            if (configKey) params.append('configKey', configKey);

            const res = await fetch(`${AI_API_BASE}/models?${params.toString()}`);
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to fetch models');
            }
            return res.json() as Promise<{ models: string[]; activeUrl?: string; provider?: string; diagnostics?: Array<{ provider: string; message: string; activeUrl?: string }> }>;
        },
    });
};

// Dictionary Domains Hooks
export const useDictionaryDomains = (includeInactive: boolean = true) => {
    return useQuery({
        queryKey: ['dictionary-domains', includeInactive],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (includeInactive) params.append('includeInactive', 'true');
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch dictionary domains');
            return res.json() as Promise<DictionaryDomainModel[]>;
        },
    });
};

export const useCreateDictionaryDomain = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateDictionaryDomainDTO) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create dictionary domain');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
        },
    });
};

export const useUpdateDictionaryDomain = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ code, data }: { code: string; data: UpdateDictionaryDomainDTO }) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(code)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update dictionary domain');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
        },
    });
};

export const useDeleteDictionaryDomain = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (code: string) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(code)}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete dictionary domain');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
            queryClient.invalidateQueries({ queryKey: ['dictionary-items'] });
        },
    });
};

// Dictionary Items Hooks
export const useDictionaryItems = (domainCode?: string, includeInactive: boolean = true) => {
    return useQuery({
        queryKey: ['dictionary-items', domainCode, includeInactive],
        enabled: Boolean(domainCode),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (includeInactive) params.append('includeInactive', 'true');
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(domainCode || '')}/items?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch dictionary items');
            return res.json() as Promise<DictionaryItemModel[]>;
        },
    });
};

export const useCreateDictionaryItem = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ domainCode, data }: { domainCode: string; data: CreateDictionaryItemDTO }) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(domainCode)}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create dictionary item');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-items', variables.domainCode] });
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
        },
    });
};

export const useUpdateDictionaryItem = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ domainCode, code, data }: { domainCode: string; code: string; data: UpdateDictionaryItemDTO }) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(domainCode)}/items/${encodeURIComponent(code)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update dictionary item');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-items', variables.domainCode] });
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
        },
    });
};

export const useDeleteDictionaryItem = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ domainCode, code }: { domainCode: string; code: string }) => {
            const res = await fetch(`${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(domainCode)}/items/${encodeURIComponent(code)}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete dictionary item');
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['dictionary-items', variables.domainCode] });
            queryClient.invalidateQueries({ queryKey: ['dictionary-domains'] });
        },
    });
};

// 引用检查返回类型
export interface DictionaryItemReferences {
    total: number;
    references: Array<{ table: string; count: number }>;
}

// 引用检查 API 函数（非 Hook，用于 Popconfirm 前调用）
export const checkDictionaryItemReferencesApi = async (
    domainCode: string,
    itemCode: string,
): Promise<DictionaryItemReferences> => {
    const res = await fetch(
        `${DICTIONARY_DOMAIN_API_BASE}/${encodeURIComponent(domainCode)}/items/${encodeURIComponent(itemCode)}/references`,
    );
    if (!res.ok) throw new Error('Failed to check dictionary item references');
    return res.json() as Promise<DictionaryItemReferences>;
};
