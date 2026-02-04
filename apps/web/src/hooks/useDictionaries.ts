import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { DictionaryItem } from '@packages/types';

type UseDictionaryOptions = {
    includeInactive?: boolean;
    enabled?: boolean;
};

export const useDictionary = (domain: string, options: UseDictionaryOptions = {}) => {
    return useQuery({
        queryKey: ['dictionary', domain, options.includeInactive ?? false],
        enabled: Boolean(domain) && (options.enabled ?? true),
        queryFn: async () => {
            const { data } = await apiClient.get<DictionaryItem[]>(`/config/dictionaries/${domain}`, {
                params: { includeInactive: options.includeInactive },
            });
            return data;
        },
    });
};

export const useDictionaries = (domains: string[], options: UseDictionaryOptions = {}) => {
    const key = (domains || []).slice().sort().join(',');
    return useQuery({
        queryKey: ['dictionaries', key, options.includeInactive ?? false],
        enabled: domains.length > 0 && (options.enabled ?? true),
        queryFn: async () => {
            const { data } = await apiClient.get<Record<string, DictionaryItem[]>>('/config/dictionaries', {
                params: { domains: domains.join(','), includeInactive: options.includeInactive },
            });
            return data;
        },
    });
};
