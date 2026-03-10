import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import type { PaginatedResponse } from './knowledge-hooks';

// =============================================
// C类增强：市场洞察 (MarketInsight)
// =============================================

export interface MarketInsightResponse {
    id: string;
    sourceText: string;
    sourceStart: number | null;
    sourceEnd: number | null;
    sectionTitle: string | null;
    sectionIndex: number | null;
    title: string;
    content: string;
    direction: string | null;
    timeframe: string | null;
    confidence: number | null;
    factors: string[];
    commodity: string | null;
    regionCode: string | null;
    createdAt: Date;
    insightType: {
        id: string;
        code: string;
        name: string;
        icon?: string;
        color?: string;
        category?: string;
    };
    intel: {
        id: string;
        rawContent: string;
        effectiveTime: Date;
        location: string;
    };
}

export interface InsightQuery {
    insightTypeId?: string;
    direction?: string;
    timeframe?: string;
    commodity?: string;
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    page?: number;
    pageSize?: number;
}

export interface InsightStats {
    total: number;
    todayCount: number;
    weekCount: number;
    avgConfidence: number;
    typeBreakdown: Array<{
        typeId: string;
        typeName: string;
        icon?: string;
        color?: string;
        count: number;
    }>;
    directionBreakdown: Array<{
        direction: string;
        count: number;
    }>;
    timeframeBreakdown: Array<{
        timeframe: string;
        count: number;
    }>;
}

export const useMarketInsights = (query?: InsightQuery) => {
    return useQuery<PaginatedResponse<MarketInsightResponse>>({
        queryKey: ['market-insights', query],
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
            const res = await apiClient.get<PaginatedResponse<MarketInsightResponse>>(
                `/v1/market-intel/insights?${params.toString()}`,
            );
            return res.data;
        },
    });
};

export const useMarketInsight = (id: string) => {
    return useQuery<MarketInsightResponse>({
        queryKey: ['market-insights', id],
        queryFn: async () => {
            const res = await apiClient.get<MarketInsightResponse>(`/v1/market-intel/insights/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

export const useInsightStats = () => {
    return useQuery<InsightStats>({
        queryKey: ['insight-stats'],
        queryFn: async () => {
            const res = await apiClient.get<InsightStats>('/v1/market-intel/insights/stats');
            return res.data;
        },
        refetchInterval: 60000,
    });
};

// =============================================
// 关联内容 (Related Content / Knowledge Graph)
// =============================================

export interface RelatedContentQuery {
    intelId?: string;
    tags?: string[];
    commodities?: string[];
    regionCodes?: string[];
    limit?: number;
}

export interface RelatedContentResponse {
    relatedIntels: Array<{
        id: string;
        category: string;
        rawContent: string;
        summary: string | null;
        effectiveTime: string;
        location: string;
        totalScore: number;
        relationScore: number;
    }>;
    relatedKnowledge: Array<{
        id: string;
        type: string;
        title: string;
        publishAt: string | null;
        commodities: string[];
        region: string[];
        analysis?: { summary?: string };
    }>;
    relatedPrices: Array<{
        id: string;
        commodity: string;
        price: number;
        location: string;
        effectiveDate: string;
        collectionPoint?: { name: string; shortName?: string };
    }>;
    sourceTags: string[];
    sourceCommodities: string[];
    sourceRegions: string[];
}

/**
 * 关联内容 Hook - 基于标签/品种/区域查找关联内容
 */
export const useRelatedContent = (
    query?: Partial<RelatedContentQuery>,
    options?: { enabled?: boolean },
) => {
    return useQuery<RelatedContentResponse>({
        queryKey: ['related-content', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                if (query.intelId) params.append('intelId', query.intelId);
                if (query.tags?.length) params.append('tags', query.tags.join(','));
                if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
                if (query.regionCodes?.length) params.append('regionCodes', query.regionCodes.join(','));
                if (query.limit) params.append('limit', String(query.limit));
            }
            const res = await apiClient.get<RelatedContentResponse>(
                `/v1/market-intel/related-content?${params.toString()}`,
            );
            return res.data;
        },
        enabled:
            options?.enabled ??
            (!!query?.intelId || (query?.tags?.length ?? 0) > 0 || (query?.commodities?.length ?? 0) > 0),
    });
};
