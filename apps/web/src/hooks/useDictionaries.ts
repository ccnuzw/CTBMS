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
        queryFn: async () => {
            const { data } = await apiClient.get<DictionaryItem[]>(`/config/dictionaries/${domain}`, {
                params: { includeInactive: options.includeInactive },
            });
            return data;
        },
        enabled: Boolean(domain) && (options.enabled ?? true),
        staleTime: 30 * 60 * 1000, // 字典数据缓存30分钟，相对稳定
        cacheTime: 60 * 60 * 1000, // 1小时后垃圾回收 (v4 syntax)
        retry: 3, // 字典查询失败时重试
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000), // 指数退避
        // 初始数据设为空数组，避免 undefined
        initialData: [],
    });
};

export const useDictionaries = (domains: string[], options: UseDictionaryOptions = {}) => {
    const key = (domains || []).slice().sort().join(',');
    return useQuery({
        queryKey: ['dictionaries', key, options.includeInactive ?? false],
        queryFn: async () => {
            const { data } = await apiClient.get<Record<string, DictionaryItem[]>>('/config/dictionaries', {
                params: { domains: domains.join(','), includeInactive: options.includeInactive },
            });
            return data;
        },
        enabled: domains.length > 0 && (options.enabled ?? true),
        staleTime: 10 * 60 * 1000, // 字典数据缓存10分钟
        cacheTime: 30 * 60 * 1000, // 30分钟后垃圾回收 (v4 syntax)
    });
};
