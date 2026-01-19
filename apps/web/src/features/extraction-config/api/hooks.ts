import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';

// ===== 事件类型 API =====

export interface EventTypeConfig {
    id: string;
    code: string;
    name: string;
    description?: string;
    category: string;
    icon?: string;
    color?: string;
    isActive: boolean;
    sortOrder: number;
    _count?: {
        events: number;
        extractionRules: number;
    };
}

export const useEventTypes = () => {
    return useQuery({
        queryKey: ['event-types'],
        queryFn: async () => {
            const { data } = await apiClient.get<EventTypeConfig[]>('/extraction-config/event-types');
            return data;
        },
    });
};

export const useCreateEventType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Omit<EventTypeConfig, 'id' | 'isActive' | '_count'>) => {
            const { data: result } = await apiClient.post('/extraction-config/event-types', data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['event-types'] });
        },
    });
};

export const useUpdateEventType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<EventTypeConfig> & { id: string }) => {
            const { data: result } = await apiClient.put(`/extraction-config/event-types/${id}`, data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['event-types'] });
        },
    });
};

export const useDeleteEventType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/extraction-config/event-types/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['event-types'] });
        },
    });
};

// ===== 洞察类型 API =====

export interface InsightTypeConfig {
    id: string;
    code: string;
    name: string;
    description?: string;
    category: string;
    icon?: string;
    color?: string;
    isActive: boolean;
    sortOrder: number;
    _count?: {
        insights: number;
        extractionRules: number;
    };
}

export const useInsightTypes = () => {
    return useQuery({
        queryKey: ['insight-types'],
        queryFn: async () => {
            const { data } = await apiClient.get<InsightTypeConfig[]>('/extraction-config/insight-types');
            return data;
        },
    });
};

export const useCreateInsightType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Omit<InsightTypeConfig, 'id' | 'isActive' | '_count'>) => {
            const { data: result } = await apiClient.post('/extraction-config/insight-types', data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insight-types'] });
        },
    });
};

export const useUpdateInsightType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<InsightTypeConfig> & { id: string }) => {
            const { data: result } = await apiClient.put(`/extraction-config/insight-types/${id}`, data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insight-types'] });
        },
    });
};

export const useDeleteInsightType = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/extraction-config/insight-types/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insight-types'] });
        },
    });
};

// ===== 提取规则 API =====

export interface RuleCondition {
    id: string;
    leftType: 'COLLECTION_POINT' | 'KEYWORD' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    leftValue?: string[];
    connector: 'FOLLOWED_BY' | 'FOLLOWED_CONTAINS' | 'PRECEDED_BY' | 'SAME_SENTENCE' | 'SAME_PARAGRAPH';
    rightType: 'COLLECTION_POINT' | 'KEYWORD' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    rightValue?: string[];
    extractFields?: {
        subject?: 'LEFT' | 'RIGHT';
        action?: 'LEFT' | 'RIGHT';
        value?: 'LEFT' | 'RIGHT';
    };
}

export interface ExtractionRule {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    priority: number;
    targetType: 'EVENT' | 'INSIGHT';
    eventTypeId?: string;
    eventType?: EventTypeConfig;
    insightTypeId?: string;
    insightType?: InsightTypeConfig;
    conditions: RuleCondition[];
    outputConfig?: Record<string, any>;
    commodities: string[];
    regions: string[];
}

export const useExtractionRules = (params?: { targetType?: string; isActive?: boolean }) => {
    return useQuery({
        queryKey: ['extraction-rules', params],
        queryFn: async () => {
            const { data } = await apiClient.get<ExtractionRule[]>('/extraction-config/rules', {
                params,
            });
            return data;
        },
    });
};

export const useCreateExtractionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Omit<ExtractionRule, 'id' | 'eventType' | 'insightType'>) => {
            const { data: result } = await apiClient.post('/extraction-config/rules', data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['extraction-rules'] });
        },
    });
};

export const useUpdateExtractionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<ExtractionRule> & { id: string }) => {
            const { data: result } = await apiClient.put(`/extraction-config/rules/${id}`, data);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['extraction-rules'] });
        },
    });
};

export const useDeleteExtractionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/extraction-config/rules/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['extraction-rules'] });
        },
    });
};

export const useTestExtractionRule = () => {
    return useMutation({
        mutationFn: async ({ id, text }: { id: string; text: string }) => {
            const { data } = await apiClient.post(`/extraction-config/rules/${id}/test`, { text });
            return data;
        },
    });
};

export const useTestConditions = () => {
    return useMutation({
        mutationFn: async ({ conditions, text }: { conditions: RuleCondition[]; text: string }) => {
            const { data } = await apiClient.post('/extraction-config/rules/test-conditions', {
                conditions,
                text,
            });
            return data;
        },
    });
};
