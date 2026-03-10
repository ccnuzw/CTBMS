import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { IntelAttachmentResponse } from '@packages/types';
import type { PaginatedResponse } from './knowledge-hooks';

// =============================================
// C类：附件管理
// =============================================

export const useIntelAttachments = (intelId: string) => {
    return useQuery<IntelAttachmentResponse[]>({
        queryKey: ['intel-attachments', intelId],
        queryFn: async () => {
            const res = await apiClient.get<IntelAttachmentResponse[]>(
                `/market-intel/${intelId}/attachments`,
            );
            return res.data;
        },
        enabled: !!intelId,
    });
};

// 附件搜索结果
interface AttachmentSearchResult {
    id: string;
    filename: string;
    mimeType: string;
    ocrText: string | null;
    createdAt: Date;
    intel: {
        id: string;
        category: string;
        location: string;
    };
}

export const useSearchAttachments = (keyword: string, limit = 20) => {
    return useQuery<AttachmentSearchResult[]>({
        queryKey: ['attachment-search', keyword, limit],
        queryFn: async () => {
            const res = await apiClient.get<AttachmentSearchResult[]>(
                `/market-intel/attachments/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
            );
            return res.data;
        },
        enabled: keyword.length >= 2,
    });
};

// =============================================
// B类增强：市场事件 (MarketEvent)
// =============================================

export interface MarketEventResponse {
    id: string;
    sourceText: string;
    sourceStart: number | null;
    sourceEnd: number | null;
    sectionIndex: number | null;
    subject: string;
    action: string;
    content: string;
    impact: string | null;
    impactLevel: string | null;
    sentiment: string | null;
    eventDate: Date | null;
    commodity: string | null;
    regionCode: string | null;
    createdAt: Date;
    eventType: {
        id: string;
        code: string;
        name: string;
        icon?: string;
        color?: string;
        category?: string;
    };
    enterprise?: {
        id: string;
        name: string;
        shortName?: string;
    };
    collectionPoint?: {
        id: string;
        code: string;
        name: string;
        type: string;
    };
    intel: {
        id: string;
        rawContent: string;
        effectiveTime: Date;
        location: string;
    };
}

export interface EventQuery {
    eventTypeId?: string;
    enterpriseId?: string;
    collectionPointId?: string;
    commodity?: string;
    sentiment?: string;
    impactLevel?: string;
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    page?: number;
    pageSize?: number;
}

export interface EventStats {
    total: number;
    todayCount: number;
    weekCount: number;
    typeBreakdown: Array<{
        typeId: string;
        typeName: string;
        icon?: string;
        color?: string;
        count: number;
    }>;
    sentimentBreakdown: Array<{
        sentiment: string;
        count: number;
    }>;
    impactBreakdown: Array<{
        level: string;
        count: number;
    }>;
    commodityStats: Array<{
        commodity: string;
        count: number;
    }>;
    regionStats: Array<{
        region: string;
        count: number;
    }>;
}

export const useMarketEvents = (query?: EventQuery) => {
    return useQuery<PaginatedResponse<MarketEventResponse>>({
        queryKey: ['market-events', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<PaginatedResponse<MarketEventResponse>>(
                `/market-intel/events?${params.toString()}`,
            );
            return res.data;
        },
    });
};

export const useMarketEvent = (id: string) => {
    return useQuery<MarketEventResponse>({
        queryKey: ['market-events', id],
        queryFn: async () => {
            const res = await apiClient.get<MarketEventResponse>(`/market-intel/events/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

export const useEventStats = (query?: {
    startDate?: Date;
    endDate?: Date;
    commodities?: string[];
    regions?: string[];
}) => {
    return useQuery<EventStats>({
        queryKey: ['event-stats', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                if (query.startDate) params.append('startDate', query.startDate.toISOString());
                if (query.endDate) params.append('endDate', query.endDate.toISOString());
                if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
                if (query.regions?.length) params.append('regions', query.regions.join(','));
            }
            const res = await apiClient.get<EventStats>(
                `/market-intel/events/stats?${params.toString()}`,
            );
            return res.data;
        },
        refetchInterval: 60000,
    });
};

export interface FilterOptions {
    commodities: string[];
    regions: string[];
    eventTypes: Array<{ id: string; name: string; code: string }>;
    insightTypes: Array<{ id: string; name: string; category: string }>;
}

export const useFilterOptions = () => {
    return useQuery<FilterOptions>({
        queryKey: ['filter-options'],
        queryFn: async () => {
            const res = await apiClient.get<FilterOptions>('/market-intel/filter-options');
            return res.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes cache
    });
};

export interface TrendData {
    date: string;
    volume: number;
    sentimentScore: number;
}

export const useTrendAnalysis = (query?: {
    startDate?: Date;
    endDate?: Date;
    commodities?: string[];
    regions?: string[];
}) => {
    return useQuery<TrendData[]>({
        queryKey: ['trend-analysis', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                if (query.startDate) params.append('startDate', query.startDate.toISOString());
                if (query.endDate) params.append('endDate', query.endDate.toISOString());
                if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
                if (query.regions?.length) params.append('regions', query.regions.join(','));
            }
            const res = await apiClient.get<TrendData[]>(
                `/market-intel/trend-analysis?${params.toString()}`,
            );
            return res.data;
        },
    });
};
