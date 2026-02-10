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
      const params: Record<string, any> = {};
      if (options.includeInactive) {
        params.includeInactive = 'true';
      }

      const { data } = await apiClient.get<DictionaryItem[]>(`/config/dictionaries/${domain}`, {
        params,
      });
      return data;
    },
    enabled: Boolean(domain) && (options.enabled ?? true),
    staleTime: 0, // 暂时禁用缓存以调试
    cacheTime: 60 * 60 * 1000,
    retry: 2,
    initialData: [],
  });
};

export const useDictionaries = (domains: string[], options: UseDictionaryOptions = {}) => {
  const key = (domains || []).slice().sort().join(',');
  return useQuery({
    queryKey: ['dictionaries', key, options.includeInactive ?? false],
    queryFn: async () => {
      const { data } = await apiClient.get<Record<string, DictionaryItem[]>>(
        '/config/dictionaries',
        {
          params: { domains: domains.join(','), includeInactive: options.includeInactive },
        },
      );
      return data;
    },
    enabled: domains.length > 0 && (options.enabled ?? true),
    staleTime: 10 * 60 * 1000, // 字典数据缓存10分钟
    cacheTime: 30 * 60 * 1000, // 30分钟后垃圾回收 (v4 syntax)
  });
};
