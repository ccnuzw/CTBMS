import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CreateDecisionRuleDto,
    CreateDecisionRulePackDto,
    DecisionRulePackDetailDto,
    DecisionRulePackPageDto,
    DecisionRulePackQueryDto,
    UpdateDecisionRuleDto,
    UpdateDecisionRulePackDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/decision-rule-packs';

export const useDecisionRulePacks = (query?: Partial<DecisionRulePackQueryDto>) => {
    return useQuery<DecisionRulePackPageDto>({
        queryKey: ['decision-rule-packs', query],
        queryFn: async () => {
            const res = await apiClient.get<DecisionRulePackPageDto>(API_BASE, {
                params: query,
            });
            return res.data;
        },
    });
};

export const useDecisionRulePackDetail = (id?: string) => {
    return useQuery<DecisionRulePackDetailDto>({
        queryKey: ['decision-rule-pack', id],
        queryFn: async () => {
            const res = await apiClient.get<DecisionRulePackDetailDto>(`${API_BASE}/${id}`);
            return res.data;
        },
        enabled: Boolean(id),
    });
};

export const useCreateDecisionRulePack = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: CreateDecisionRulePackDto) => {
            const res = await apiClient.post<DecisionRulePackDetailDto>(API_BASE, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-packs'] });
        },
    });
};

export const useUpdateDecisionRulePack = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            packId,
            payload,
        }: {
            packId: string;
            payload: UpdateDecisionRulePackDto;
        }) => {
            const res = await apiClient.patch<DecisionRulePackDetailDto>(
                `${API_BASE}/${packId}`,
                payload,
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-packs'] });
            queryClient.invalidateQueries({ queryKey: ['decision-rule-pack', variables.packId] });
        },
    });
};

export const useDeleteDecisionRulePack = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (packId: string) => {
            const res = await apiClient.delete(`${API_BASE}/${packId}`);
            return res.data;
        },
        onSuccess: (_, packId) => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-packs'] });
            queryClient.invalidateQueries({ queryKey: ['decision-rule-pack', packId] });
        },
    });
};

export const useCreateDecisionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            packId,
            payload,
        }: {
            packId: string;
            payload: CreateDecisionRuleDto;
        }) => {
            const res = await apiClient.post(`${API_BASE}/${packId}/rules`, payload);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-pack', variables.packId] });
        },
    });
};

export const useUpdateDecisionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            packId,
            ruleId,
            payload,
        }: {
            packId: string;
            ruleId: string;
            payload: UpdateDecisionRuleDto;
        }) => {
            const res = await apiClient.patch(
                `${API_BASE}/${packId}/rules/${ruleId}`,
                payload,
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-pack', variables.packId] });
        },
    });
};

export const useDeleteDecisionRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            packId,
            ruleId,
        }: {
            packId: string;
            ruleId: string;
        }) => {
            const res = await apiClient.delete(`${API_BASE}/${packId}/rules/${ruleId}`);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['decision-rule-pack', variables.packId] });
        },
    });
};
