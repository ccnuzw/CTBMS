import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { MarketIntelResponse, PriceDataResponse } from '@packages/types';

// =============================================
// 情报流查询 (B类聚合)
// =============================================

export interface IntelligenceFeedQuery {
    startDate?: Date;
    endDate?: Date;
    eventTypeIds?: string[];
    insightTypeIds?: string[];
    sentiments?: string[];
    commodities?: string[];
    keyword?: string;
    limit?: number;
    sourceTypes?: string[];
    regionCodes?: string[];
    minScore?: number;
    maxScore?: number;
    processingStatus?: string[];
    qualityLevel?: string[];
    contentTypes?: string[];
}

export const useIntelligenceFeed = (query?: Partial<IntelligenceFeedQuery>) => {
    return useQuery<any[]>({
        queryKey: ['intelligence-feed', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (Array.isArray(value)) {
                            params.append(key, value.join(','));
                        } else if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<any[]>(`/v1/market-intel/feed?${params.toString()}`);
            return res.data;
        },
    });
};

// =============================================
// 仪表盘聚合统计 (Real-time Dashboard)
// =============================================

export interface IntelDashboardStats {
    overview: {
        total: number;
        today: number;
        highValue: number;
        pending: number;
        confirmed: number;
        avgQuality: number;
    };
    trend: Array<{ date: string; daily: number; research: number; policy: number }>;
    sourceDistribution: Array<{ name: string; value: number }>;
    commodityHeat: Array<{ name: string; count: number; change: number }>;
    regionHeat: Array<{ region: string; count: number }>;
}

export const useIntelDashboardStats = (query?: Partial<IntelligenceFeedQuery>) => {
    return useQuery<IntelDashboardStats>({
        queryKey: ['intel-dashboard-stats', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (Array.isArray(value)) {
                            params.append(key, value.join(','));
                        } else if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<IntelDashboardStats>(
                `/v1/market-intel/dashboard/stats?${params.toString()}`,
            );
            return res.data;
        },
    });
};

// =============================================
// AI 智能简报
// =============================================

export const useIntelSmartBriefing = () => {
    return useMutation({
        mutationFn: async (query?: Partial<IntelligenceFeedQuery>) => {
            // Filter logic identical to feed query
            const payload: Record<string, unknown> = {};
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        payload[key] = value;
                    }
                });
            }
            const res = await apiClient.post<{ summary: string }>(
                '/v1/market-intel/dashboard/actions/briefing',
                payload,
            );
            return res.data;
        },
    });
};

// =============================================
// 热门话题
// =============================================

export interface HotTopic {
    topic: string;
    displayTopic?: string;
    count: number;
}

export const useHotTopics = (limit = 20) => {
    return useQuery<HotTopic[]>({
        queryKey: ['hot-topics', limit],
        queryFn: async () => {
            const res = await apiClient.get<HotTopic[]>(`/v1/market-intel/hot-topics?limit=${limit}`);
            return res.data;
        },
        refetchInterval: 60000,
    });
};

// =============================================
// 全景检索：聚合搜索 (Universal Search)
// =============================================

export interface UniversalSearchQuery {
    keyword: string;
    startDate?: Date;
    endDate?: Date;
    sentiment?: 'positive' | 'negative' | 'neutral';
    commodities?: string[];
    sourceTypes?: string[];
    regionCodes?: string[];
    pricePageSize?: number;
    intelPageSize?: number;
    docPageSize?: number;
}

export interface UniversalSearchSummary {
    priceRange: {
        min: number | null;
        max: number | null;
        avg: number | null;
    };
    sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
    topTags: string[];
    entityMentions: string[];
    totalResults: number;
}

export interface UniversalSearchResponse {
    prices: { data: PriceDataResponse[]; total: number };
    intels: { data: MarketIntelResponse[]; total: number };
    docs: { data: MarketIntelResponse[]; total: number };
    summary: UniversalSearchSummary;
}

/**
 * 全景检索 Hook - 一次请求返回三类数据及统计摘要
 */
export const useUniversalSearch = (
    query?: Partial<UniversalSearchQuery>,
    options?: { enabled?: boolean },
) => {
    return useQuery<UniversalSearchResponse>({
        queryKey: ['universal-search', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else if (Array.isArray(value)) {
                            if (value.length > 0) {
                                params.append(key, value.join(','));
                            }
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<UniversalSearchResponse>(
                `/v1/market-intel/universal-search?${params.toString()}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? (!!query?.keyword && query.keyword.length >= 2),
    });
};

// =============================================
// 搜索建议 (Search Suggestions)
// =============================================

export interface SearchSuggestion {
    text: string;
    type: 'collection_point' | 'commodity' | 'tag';
    count?: number;
}

export interface SearchSuggestionsResponse {
    suggestions: SearchSuggestion[];
}

/**
 * 搜索建议 Hook - 提供自动补全功能
 */
export const useSearchSuggestions = (prefix?: string, options?: { enabled?: boolean }) => {
    return useQuery<SearchSuggestionsResponse>({
        queryKey: ['search-suggestions', prefix],
        queryFn: async () => {
            const res = await apiClient.get<SearchSuggestionsResponse>(
                `/v1/market-intel/search-suggestions?prefix=${encodeURIComponent(prefix || '')}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? (!!prefix && prefix.length >= 1),
        staleTime: 30000, // 30秒内不重新请求相同前缀
    });
};

// =============================================
// 全文搜索增强 (Full-Text Search)
// =============================================

export interface FullTextSearchQuery {
    keywords: string;
    category?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
}

export interface FullTextSearchResult extends MarketIntelResponse {
    relevanceScore: number;
    matchedKeywords: string[];
}

export interface FullTextSearchResponse {
    data: FullTextSearchResult[];
    total: number;
    page: number;
    pageSize: number;
    keywords: string[]; // 分词后的关键词列表（供高亮使用）
}

/**
 * 全文搜索 Hook - 支持多关键词、相关性排序、分页
 */
export const useFullTextSearch = (
    query?: Partial<FullTextSearchQuery>,
    options?: { enabled?: boolean },
) => {
    return useQuery<FullTextSearchResponse>({
        queryKey: ['full-text-search', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                if (query.keywords) params.append('keywords', query.keywords);
                if (query.category) params.append('category', query.category);
                if (query.startDate) params.append('startDate', query.startDate.toISOString());
                if (query.endDate) params.append('endDate', query.endDate.toISOString());
                if (query.page) params.append('page', String(query.page));
                if (query.pageSize) params.append('pageSize', String(query.pageSize));
            }
            const res = await apiClient.get<FullTextSearchResponse>(
                `/v1/market-intel/full-text-search?${params.toString()}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? (!!query?.keywords && query.keywords.length >= 2),
    });
};
