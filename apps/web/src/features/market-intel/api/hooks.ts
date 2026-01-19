import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    CreateMarketIntelDto,
    UpdateMarketIntelDto,
    MarketIntelResponse,
    MarketIntelQuery,
    MarketIntelStats,
    LeaderboardEntry,
    AnalyzeContentDto,
    AIAnalysisResult,
} from '@packages/types';

// 分页响应类型
interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// =============================================
// 情报列表查询
// =============================================

export const useMarketIntels = (query?: Partial<MarketIntelQuery>) => {
    return useQuery<PaginatedResponse<MarketIntelResponse>>({
        queryKey: ['market-intels', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        params.append(key, String(value));
                    }
                });
            }
            const res = await apiClient.get<PaginatedResponse<MarketIntelResponse>>(
                `/market-intel?${params.toString()}`,
            );
            return res.data;
        },
    });
};

// =============================================
// 情报详情查询
// =============================================

export const useMarketIntel = (id: string) => {
    return useQuery<MarketIntelResponse>({
        queryKey: ['market-intels', id],
        queryFn: async () => {
            const res = await apiClient.get<MarketIntelResponse>(`/market-intel/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

// =============================================
// 创建情报
// =============================================

export const useCreateMarketIntel = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateMarketIntelDto) => {
            const res = await apiClient.post<MarketIntelResponse>('/market-intel', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
            queryClient.invalidateQueries({ queryKey: ['market-intel-stats'] });
        },
    });
};

// =============================================
// 更新情报
// =============================================

export const useUpdateMarketIntel = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateMarketIntelDto }) => {
            const res = await apiClient.put<MarketIntelResponse>(`/market-intel/${id}`, data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
            queryClient.invalidateQueries({ queryKey: ['market-intels', variables.id] });
        },
    });
};

// =============================================
// 删除情报
// =============================================

export const useDeleteMarketIntel = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`/market-intel/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
            queryClient.invalidateQueries({ queryKey: ['market-intel-stats'] });
        },
    });
};

// =============================================
// 统计数据
// =============================================

export const useMarketIntelStats = () => {
    return useQuery<MarketIntelStats>({
        queryKey: ['market-intel-stats'],
        queryFn: async () => {
            const res = await apiClient.get<MarketIntelStats>('/market-intel/stats');
            return res.data;
        },
        refetchInterval: 30000, // 每 30 秒刷新
    });
};

// =============================================
// 排行榜
// =============================================

export const useLeaderboard = (limit = 10) => {
    return useQuery<LeaderboardEntry[]>({
        queryKey: ['market-intel-leaderboard', limit],
        queryFn: async () => {
            const res = await apiClient.get<LeaderboardEntry[]>(`/market-intel/leaderboard?limit=${limit}`);
            return res.data;
        },
    });
};

// =============================================
// AI 分析
// =============================================

export const useAnalyzeContent = () => {
    return useMutation({
        mutationFn: async (data: AnalyzeContentDto) => {
            const res = await apiClient.post<AIAnalysisResult>('/market-intel/analyze', data);
            return res.data;
        },
    });
};

// =============================================
// A类：价格数据
// =============================================

import {
    CreatePriceDataDto,
    PriceDataResponse,
    PriceDataQuery,
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskResponse,
    IntelTaskQuery,
    IntelTaskStatus,
} from '@packages/types';

// 价格趋势数据
interface PriceTrendPoint {
    date: Date;
    price: number;
    change: number | null;
}

// 价格热力地图数据
interface PriceHeatmapPoint {
    location: string;
    region: string[];
    price: number;
    change: number | null;
}

export const usePriceData = (query?: Partial<PriceDataQuery>) => {
    return useQuery<PaginatedResponse<PriceDataResponse>>({
        queryKey: ['price-data', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        // 日期对象转换为 ISO 字符串
                        if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<PaginatedResponse<PriceDataResponse>>(
                `/market-intel/price-data?${params.toString()}`,
            );
            return res.data;
        },
    });
};

export const useCreatePriceData = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreatePriceDataDto) => {
            const res = await apiClient.post<PriceDataResponse>('/market-intel/price-data', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['price-data'] });
        },
    });
};

export const usePriceTrend = (commodity: string, location: string, days = 30) => {
    return useQuery<PriceTrendPoint[]>({
        queryKey: ['price-trend', commodity, location, days],
        queryFn: async () => {
            const res = await apiClient.get<PriceTrendPoint[]>(
                `/market-intel/price-data/trend?commodity=${encodeURIComponent(commodity)}&location=${encodeURIComponent(location)}&days=${days}`,
            );
            return res.data;
        },
        enabled: !!commodity && !!location,
    });
};

export const usePriceHeatmap = (commodity: string, date?: string) => {
    return useQuery<PriceHeatmapPoint[]>({
        queryKey: ['price-heatmap', commodity, date],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('commodity', commodity);
            if (date) params.append('date', date);
            const res = await apiClient.get<PriceHeatmapPoint[]>(
                `/market-intel/price-data/heatmap?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!commodity,
    });
};

// =============================================
// 新增：按采集点查询时间序列
// =============================================

interface CollectionPointPriceData {
    collectionPoint: {
        id: string;
        code: string;
        name: string;
        shortName: string | null;
        type: string;
        regionCode: string | null;
    } | null;
    data: Array<{
        id: string;
        date: Date;
        commodity: string;
        price: number;
        change: number | null;
        sourceType: string;
        subType: string;
        note: string | null;
    }>;
    summary: {
        count: number;
        minPrice: number | null;
        maxPrice: number | null;
        avgPrice: number | null;
    };
}

export const usePriceByCollectionPoint = (
    collectionPointId: string,
    commodity?: string,
    days = 30,
) => {
    return useQuery<CollectionPointPriceData>({
        queryKey: ['price-by-collection-point', collectionPointId, commodity, days],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (commodity) params.append('commodity', commodity);
            params.append('days', String(days));
            const res = await apiClient.get<CollectionPointPriceData>(
                `/market-intel/price-data/by-collection-point/${collectionPointId}?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!collectionPointId,
    });
};

// =============================================
// 新增：按行政区划查询聚合
// =============================================

interface RegionPriceData {
    region: {
        code: string;
        name: string;
        level: string;
        shortName: string | null;
    } | null;
    data: Array<{
        id: string;
        date: Date;
        location: string;
        commodity: string;
        price: number;
        change: number | null;
        sourceType: string;
        collectionPoint: { code: string; name: string; type: string } | null;
    }>;
    trend: Array<{
        date: string;
        avgPrice: number;
        minPrice: number;
        maxPrice: number;
        count: number;
    }>;
    summary: {
        totalRecords: number;
        uniqueLocations: number;
    };
}

export const usePriceByRegion = (regionCode: string, commodity?: string, days = 30) => {
    return useQuery<RegionPriceData>({
        queryKey: ['price-by-region', regionCode, commodity, days],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (commodity) params.append('commodity', commodity);
            params.append('days', String(days));
            const res = await apiClient.get<RegionPriceData>(
                `/market-intel/price-data/by-region/${regionCode}?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!regionCode,
    });
};

// =============================================
// 新增：多采集点对比趋势
// =============================================

interface MultiPointTrendItem {
    point: {
        id: string;
        code: string;
        name: string;
        shortName: string | null;
    };
    data: Array<{
        date: Date;
        price: number;
        change: number | null;
    }>;
}

export const useMultiPointCompare = (
    collectionPointIds: string[],
    commodity: string,
    days = 30,
) => {
    return useQuery<MultiPointTrendItem[]>({
        queryKey: ['multi-point-compare', collectionPointIds, commodity, days],
        queryFn: async () => {
            const res = await apiClient.get<MultiPointTrendItem[]>(
                `/market-intel/price-data/compare?ids=${collectionPointIds.join(',')}&commodity=${encodeURIComponent(commodity)}&days=${days}`,
            );
            return res.data;
        },
        enabled: collectionPointIds.length > 0 && !!commodity,
    });
};

// =============================================
// 新增：获取采集点列表
// =============================================

interface CollectionPointItem {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    type: string;
    regionCode: string | null;
    longitude: number | null;
    latitude: number | null;
    region?: {
        code: string;
        name: string;
    };
}

interface CollectionPointListResponse {
    data: CollectionPointItem[];
    total: number;
}

export const useCollectionPoints = (type?: string, keyword?: string) => {
    return useQuery<CollectionPointListResponse>({
        queryKey: ['collection-points', type, keyword],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (type) params.append('type', type);
            if (keyword) params.append('keyword', keyword);
            params.append('pageSize', '200');
            const res = await apiClient.get<CollectionPointListResponse>(
                `/collection-points?${params.toString()}`,
            );
            return res.data;
        },
    });
};

// =============================================
// 新增：获取行政区划树
// =============================================

interface RegionTreeNode {
    code: string;
    name: string;
    shortName: string | null;
    level: string;
    children: RegionTreeNode[];
}

export const useRegionTree = () => {
    return useQuery<RegionTreeNode[]>({
        queryKey: ['region-tree'],
        queryFn: async () => {
            const res = await apiClient.get<RegionTreeNode[]>('/regions/tree');
            return res.data;
        },
    });
};

// =============================================
// 新增：获取省份列表
// =============================================

interface ProvinceItem {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
}

export const useProvinces = () => {
    return useQuery<ProvinceItem[]>({
        queryKey: ['provinces'],
        queryFn: async () => {
            const res = await apiClient.get<ProvinceItem[]>('/regions/provinces');
            return res.data;
        },
    });
};

// =============================================
// 任务调度
// =============================================

export const useIntelTasks = (query?: Partial<IntelTaskQuery>) => {
    return useQuery<PaginatedResponse<IntelTaskResponse>>({
        queryKey: ['intel-tasks', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        params.append(key, String(value));
                    }
                });
            }
            const res = await apiClient.get<PaginatedResponse<IntelTaskResponse>>(
                `/market-intel/tasks?${params.toString()}`,
            );
            return res.data;
        },
    });
};

export const useMyTasks = (userId: string) => {
    return useQuery<IntelTaskResponse[]>({
        queryKey: ['my-tasks', userId],
        queryFn: async () => {
            const res = await apiClient.get<IntelTaskResponse[]>(
                `/market-intel/tasks/my?userId=${userId}`,
            );
            return res.data;
        },
        enabled: !!userId,
        refetchInterval: 60000, // 每分钟刷新
    });
};

export const useCreateIntelTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateIntelTaskDto) => {
            const res = await apiClient.post<IntelTaskResponse>('/market-intel/tasks', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        },
    });
};

export const useUpdateIntelTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateIntelTaskDto }) => {
            const res = await apiClient.put<IntelTaskResponse>(`/market-intel/tasks/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        },
    });
};

export const useCompleteTask = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, intelId }: { id: string; intelId?: string }) => {
            const res = await apiClient.post<IntelTaskResponse>(
                `/market-intel/tasks/${id}/complete`,
                { intelId },
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intel-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        },
    });
};

// =============================================
// C类：附件管理
// =============================================

import { IntelAttachmentResponse } from '@packages/types';

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
// D类：实体关联
// =============================================

import { IntelEntityLinkResponse } from '@packages/types';

// 企业情报列表
interface EnterpriseIntelItem {
    id: string;
    createdAt: Date;
    linkType: string;
    intel: {
        id: string;
        category: string;
        rawContent: string;
        summary: string | null;
        effectiveTime: Date;
        location: string;
    };
}

// 企业时间线
interface EnterpriseTimelineItem {
    id: string;
    linkType: string;
    createdAt: Date;
    intel: {
        id: string;
        category: string;
        rawContent: string;
        summary: string | null;
        aiAnalysis: any;
        effectiveTime: Date;
        location: string;
        author: { id: string; name: string };
    };
}

export const useIntelEntities = (intelId: string) => {
    return useQuery<IntelEntityLinkResponse[]>({
        queryKey: ['intel-entities', intelId],
        queryFn: async () => {
            const res = await apiClient.get<IntelEntityLinkResponse[]>(
                `/market-intel/${intelId}/entities`,
            );
            return res.data;
        },
        enabled: !!intelId,
    });
};

export const useEnterpriseIntels = (enterpriseId: string, limit = 20) => {
    return useQuery<EnterpriseIntelItem[]>({
        queryKey: ['enterprise-intels', enterpriseId, limit],
        queryFn: async () => {
            const res = await apiClient.get<EnterpriseIntelItem[]>(
                `/market-intel/enterprises/${enterpriseId}/intels?limit=${limit}`,
            );
            return res.data;
        },
        enabled: !!enterpriseId,
    });
};

export const useEnterpriseTimeline = (enterpriseId: string) => {
    return useQuery<EnterpriseTimelineItem[]>({
        queryKey: ['enterprise-timeline', enterpriseId],
        queryFn: async () => {
            const res = await apiClient.get<EnterpriseTimelineItem[]>(
                `/market-intel/enterprises/${enterpriseId}/timeline`,
            );
            return res.data;
        },
        enabled: !!enterpriseId,
    });
};

export const useLinkEntity = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            intelId,
            enterpriseId,
            linkType,
        }: {
            intelId: string;
            enterpriseId: string;
            linkType?: string;
        }) => {
            const res = await apiClient.post<IntelEntityLinkResponse>(
                `/market-intel/${intelId}/entities`,
                { enterpriseId, linkType },
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['intel-entities', variables.intelId] });
            queryClient.invalidateQueries({ queryKey: ['enterprise-intels'] });
        },
    });
};
