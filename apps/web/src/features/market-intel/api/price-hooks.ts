import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { CreatePriceDataDto, PriceDataResponse, PriceDataQuery } from '@packages/types';
import type { PaginatedResponse } from './knowledge-hooks';

// =============================================
// 价格子类型规范化
// =============================================

const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, string> = {
    STATION_ORIGIN: 'STATION',
    STATION_DEST: 'STATION',
};

const normalizePriceSubTypeCode = (code: string) =>
    LEGACY_PRICE_SUBTYPE_TO_CANONICAL[code] || code;

const normalizePriceSubTypeList = (codes?: string[]) =>
    Array.from(new Set((codes || []).map((code) => normalizePriceSubTypeCode(code))));

// =============================================
// A类：价格数据
// =============================================

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

interface UsePriceDataOptions {
    enabled?: boolean;
}

type PriceDataQueryWithQuality = Partial<PriceDataQuery> & { qualityTags?: string[] };

export const usePriceData = (query?: PriceDataQueryWithQuality, options?: UsePriceDataOptions) => {
    return useQuery<PaginatedResponse<PriceDataResponse>>({
        queryKey: ['price-data', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            const normalizedSubTypes = normalizePriceSubTypeList(
                Array.isArray(query?.subTypes) ? query.subTypes.map((item) => String(item)) : [],
            );
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (key === 'subTypes' && normalizedSubTypes.length > 0) {
                            params.append(key, normalizedSubTypes.join(','));
                            return;
                        }
                        // 日期对象转换为 ISO 字符串
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
            const res = await apiClient.get<PaginatedResponse<PriceDataResponse>>(
                `/v1/market-intel/price-data?${params.toString()}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? true,
        keepPreviousData: true,
    });
};

// =============================================
// 价格连续性健康度
// =============================================

interface PriceContinuityHealthQuery extends Partial<PriceDataQuery> {
    days?: number;
}

interface PriceContinuityHealthPoint {
    pointId: string;
    pointName: string;
    pointType: string;
    regionLabel?: string | null;
    coverageRate: number;
    timelinessScore: number;
    anomalyRate: number;
    lateRate: number;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D';
    latestDate: Date | null;
    recordCount: number;
    missingDays: number;
}

interface PriceContinuityHealthResponse {
    summary: {
        overallScore: number;
        coverageRate: number;
        anomalyRate: number;
        lateRate: number;
        expectedDays: number;
        pointCount: number;
        healthyPoints: number;
        riskPoints: number;
        startDate: Date | null;
        endDate: Date | null;
    };
    points: PriceContinuityHealthPoint[];
}

export const usePriceContinuityHealth = (
    query?: PriceContinuityHealthQuery,
    options?: UsePriceDataOptions,
) => {
    return useQuery<PriceContinuityHealthResponse>({
        queryKey: ['price-continuity-health', query],
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
            const res = await apiClient.get<PriceContinuityHealthResponse>(
                `/v1/market-intel/price-data/continuity-health?${params.toString()}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? true,
    });
};

// =============================================
// 价格预警规则与实例
// =============================================

type AlertRuleType =
    | 'DAY_CHANGE_ABS'
    | 'DAY_CHANGE_PCT'
    | 'DEVIATION_FROM_MEAN_PCT'
    | 'CONTINUOUS_DAYS';
type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';

export interface MarketAlertRule {
    id: string;
    name: string;
    type: AlertRuleType;
    threshold?: number;
    days?: number;
    direction?: 'UP' | 'DOWN' | 'BOTH';
    severity: AlertSeverity;
    isActive: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface MarketAlert {
    id: string;
    ruleId: string;
    ruleName: string;
    ruleType: AlertRuleType;
    severity: AlertSeverity;
    status: AlertStatus;
    note?: string;
    pointId: string;
    pointName: string;
    pointType: string;
    regionLabel: string | null;
    commodity: string;
    date: Date;
    value: number;
    threshold: number;
    message: string;
    updatedAt?: Date;
}

interface AlertListResponse {
    total: number;
    data: MarketAlert[];
}

export interface AlertStatusLog {
    id: string;
    instanceId: string;
    action: 'CREATE' | 'UPDATE_HIT' | 'ACK' | 'CLOSE' | 'REOPEN' | 'AUTO_CLOSE';
    fromStatus?: AlertStatus | null;
    toStatus: AlertStatus;
    operator: string;
    note?: string | null;
    reason?: string | null;
    meta?: Record<string, unknown> | null;
    createdAt: Date;
}

export interface EvaluateAlertsResponse {
    evaluatedAt: Date;
    total: number;
    created: number;
    updated: number;
    closed?: number;
}

interface AlertQuery extends Partial<PriceDataQuery> {
    days?: number;
    severity?: AlertSeverity;
    status?: AlertStatus;
    limit?: number;
    refresh?: boolean;
}

export const useAlertRules = () => {
    return useQuery<MarketAlertRule[]>({
        queryKey: ['alert-rules'],
        queryFn: async () => {
            const res = await apiClient.get<MarketAlertRule[]>('/v1/market-intel/alerts/rules');
            return res.data;
        },
    });
};

export const useCreateAlertRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Omit<MarketAlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
            const res = await apiClient.post<MarketAlertRule[]>('/v1/market-intel/alerts/rules', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
};

export const useUpdateAlertRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            payload,
        }: {
            id: string;
            payload: Partial<Omit<MarketAlertRule, 'id' | 'createdAt' | 'updatedAt'>>;
        }) => {
            const res = await apiClient.patch<MarketAlertRule[]>(
                `/v1/market-intel/alerts/rules/${id}`,
                payload,
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
};

export const useDeleteAlertRule = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<{ success: boolean }>(`/v1/market-intel/alerts/rules/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
};

export const useAlerts = (query?: AlertQuery) => {
    return useQuery<AlertListResponse>({
        queryKey: ['alerts', query],
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
            const res = await apiClient.get<AlertListResponse>(
                `/v1/market-intel/alerts?${params.toString()}`,
            );
            return res.data;
        },
    });
};

export const useEvaluateAlerts = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (query?: Omit<AlertQuery, 'status' | 'refresh'>) => {
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
            const suffix = params.toString();
            const res = await apiClient.post<EvaluateAlertsResponse>(
                `/v1/market-intel/alerts/actions/evaluate${suffix ? `?${suffix}` : ''}`,
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
};

export const useAlertLogs = (id?: string) => {
    return useQuery<AlertStatusLog[]>({
        queryKey: ['alerts', 'logs', id],
        enabled: !!id,
        queryFn: async () => {
            const res = await apiClient.get<AlertStatusLog[]>(`/v1/market-intel/alerts/${id}/logs`);
            return res.data;
        },
    });
};

export const useUpdateAlertStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            status,
            note,
            reason,
            operator,
        }: {
            id: string;
            status: AlertStatus;
            note?: string;
            reason?: string;
            operator?: string;
        }) => {
            const res = await apiClient.patch(`/v1/market-intel/alerts/${id}/status`, {
                status,
                note,
                reason,
                operator,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
            queryClient.invalidateQueries({ queryKey: ['alerts', 'logs'] });
        },
    });
};

// =============================================
// 创建价格数据
// =============================================

export const useCreatePriceData = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreatePriceDataDto) => {
            const res = await apiClient.post<PriceDataResponse>('/v1/market-intel/price-data', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['price-data'] });
        },
    });
};

// =============================================
// 价格趋势与热力图
// =============================================

export const usePriceTrend = (commodity: string, location: string, days = 30) => {
    return useQuery<PriceTrendPoint[]>({
        queryKey: ['price-trend', commodity, location, days],
        queryFn: async () => {
            const res = await apiClient.get<PriceTrendPoint[]>(
                `/v1/market-intel/price-data/trend?commodity=${encodeURIComponent(commodity)}&location=${encodeURIComponent(location)}&days=${days}`,
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
                `/v1/market-intel/price-data/heatmap?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!commodity,
    });
};

// =============================================
// 按采集点查询时间序列
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
    daysOrParams:
        | number
        | {
            startDate?: Date;
            endDate?: Date;
            days?: number;
            subTypes?: string[];
            reviewScope?: string;
            sourceScope?: string;
        } = 30,
) => {
    const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
    const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
    return useQuery<CollectionPointPriceData>({
        queryKey: [
            'price-by-collection-point',
            collectionPointId,
            commodity,
            paramsValue?.days,
            paramsValue?.startDate?.toISOString(),
            paramsValue?.endDate?.toISOString(),
            normalizedSubTypes.join(','),
            paramsValue?.reviewScope,
            paramsValue?.sourceScope,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (commodity) params.append('commodity', commodity);
            if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
            if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
            if (paramsValue?.days) params.append('days', String(paramsValue.days));
            if (normalizedSubTypes.length > 0) {
                params.append('subTypes', normalizedSubTypes.join(','));
            }
            if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
            if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
            const res = await apiClient.get<CollectionPointPriceData>(
                `/v1/market-intel/price-data/by-collection-point/${collectionPointId}?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!collectionPointId,
    });
};

// =============================================
// 按行政区划查询聚合
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

export const usePriceByRegion = (
    regionCode: string,
    commodity?: string,
    daysOrParams:
        | number
        | {
            startDate?: Date;
            endDate?: Date;
            days?: number;
            subTypes?: string[];
            reviewScope?: string;
            sourceScope?: string;
            includeData?: boolean;
        } = 30,
) => {
    const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
    const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
    return useQuery<RegionPriceData>({
        queryKey: [
            'price-by-region',
            regionCode,
            commodity,
            paramsValue?.days,
            paramsValue?.startDate?.toISOString(),
            paramsValue?.endDate?.toISOString(),
            normalizedSubTypes.join(','),
            paramsValue?.reviewScope,
            paramsValue?.sourceScope,
            paramsValue?.includeData,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (commodity) params.append('commodity', commodity);
            if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
            if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
            if (paramsValue?.days) params.append('days', String(paramsValue.days));
            if (normalizedSubTypes.length > 0) {
                params.append('subTypes', normalizedSubTypes.join(','));
            }
            if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
            if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
            if (paramsValue?.includeData !== undefined) {
                params.append('includeData', String(paramsValue.includeData));
            }
            const res = await apiClient.get<RegionPriceData>(
                `/v1/market-intel/price-data/by-region/${regionCode}?${params.toString()}`,
            );
            return res.data;
        },
        enabled: !!regionCode,
        keepPreviousData: true,
    });
};

// =============================================
// 多采集点对比趋势
// =============================================

interface MultiPointTrendItem {
    point: {
        id: string;
        code: string;
        name: string;
        shortName: string | null;
        type?: string;
        regionCode?: string | null;
        region?: { code: string; name: string; shortName: string | null } | null;
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
    daysOrParams:
        | number
        | {
            startDate?: Date;
            endDate?: Date;
            days?: number;
            subTypes?: string[];
            reviewScope?: string;
            sourceScope?: string;
        } = 30,
) => {
    const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
    const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
    return useQuery<MultiPointTrendItem[]>({
        queryKey: [
            'multi-point-compare',
            collectionPointIds,
            commodity,
            paramsValue?.days,
            paramsValue?.startDate?.toISOString(),
            paramsValue?.endDate?.toISOString(),
            normalizedSubTypes.join(','),
            paramsValue?.reviewScope,
            paramsValue?.sourceScope,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('ids', collectionPointIds.join(','));
            params.append('commodity', commodity);
            if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
            if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
            if (paramsValue?.days) params.append('days', String(paramsValue.days));
            if (normalizedSubTypes.length > 0) {
                params.append('subTypes', normalizedSubTypes.join(','));
            }
            if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
            if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
            const res = await apiClient.get<MultiPointTrendItem[]>(
                `/v1/market-intel/price-data/compare?${params.toString()}`,
            );
            return res.data;
        },
        enabled: collectionPointIds.length > 0 && !!commodity,
        keepPreviousData: true,
    });
};

// =============================================
// 价格对比分析
// =============================================

interface CompareRankingItem {
    id: string;
    name: string;
    code: string;
    type?: string;
    regionLabel: string;
    price: number;
    change: number;
    changePct: number;
    periodChange: number;
    periodChangePct: number;
    volatility: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    basePrice: number;
    indexPrice: number;
    indexChange: number;
    samples: number;
    missingDays: number | null;
}

interface CompareDistributionItem {
    id: string;
    name: string;
    min: number;
    max: number;
    q1: number;
    median: number;
    q3: number;
    avg: number;
}

interface CompareRegionItem {
    region: string;
    avgPrice: number;
    count: number;
    minPrice: number;
    maxPrice: number;
    q1: number;
    median: number;
    q3: number;
    std: number;
    volatility: number;
    missingRate: number;
    latestTs: number;
    hasPrev: boolean;
    delta: number;
    deltaPct: number;
}

interface PriceCompareAnalyticsResponse {
    ranking: CompareRankingItem[];
    distribution: CompareDistributionItem[];
    meta: {
        meanLatestPrice: number | null;
        expectedDays: number | null;
        selectedPointCount: number;
    };
    latestRegionAvg: number | null;
    quality: {
        totalSamples: number;
        latestDate: Date | null;
        missingDays: number | null;
    };
    regions: {
        list: CompareRegionItem[];
        overallAvg: number | null;
        minAvg: number;
        maxAvg: number;
        rangeMin: number;
        rangeMax: number;
        windowLabel: string;
        expectedDays: number;
    };
}

interface PriceCompareAnalyticsQuery {
    collectionPointIds: string[];
    commodity?: string;
    startDate?: Date;
    endDate?: Date;
    days?: number;
    subTypes?: string[];
    regionCode?: string;
    pointTypes?: string[];
    reviewScope?: string;
    sourceScope?: string;
    regionLevel?: 'province' | 'city' | 'district';
    regionWindow?: '7' | '30' | '90' | 'all';
}

export const usePriceCompareAnalytics = (
    query: PriceCompareAnalyticsQuery,
    options?: UsePriceDataOptions,
) => {
    const normalizedSubTypes = normalizePriceSubTypeList(query.subTypes);
    const normalizedPointTypes = query.pointTypes || [];
    return useQuery<PriceCompareAnalyticsResponse>({
        queryKey: [
            'price-compare-analytics',
            query.collectionPointIds,
            query.commodity,
            query.days,
            query.startDate?.toISOString(),
            query.endDate?.toISOString(),
            normalizedSubTypes.join(','),
            query.regionCode,
            normalizedPointTypes.join(','),
            query.reviewScope,
            query.sourceScope,
            query.regionLevel,
            query.regionWindow,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query.collectionPointIds.length > 0) {
                params.append('ids', query.collectionPointIds.join(','));
            }
            if (query.commodity) params.append('commodity', query.commodity);
            if (query.startDate) params.append('startDate', query.startDate.toISOString());
            if (query.endDate) params.append('endDate', query.endDate.toISOString());
            if (query.days) params.append('days', String(query.days));
            if (normalizedSubTypes.length > 0) params.append('subTypes', normalizedSubTypes.join(','));
            if (query.regionCode) params.append('regionCode', query.regionCode);
            if (normalizedPointTypes.length > 0)
                params.append('pointTypes', normalizedPointTypes.join(','));
            if (query.reviewScope) params.append('reviewScope', query.reviewScope);
            if (query.sourceScope) params.append('sourceScope', query.sourceScope);
            if (query.regionLevel) params.append('regionLevel', query.regionLevel);
            if (query.regionWindow) params.append('regionWindow', query.regionWindow);
            const res = await apiClient.get<PriceCompareAnalyticsResponse>(
                `/v1/market-intel/price-data/compare-analytics?${params.toString()}`,
            );
            return res.data;
        },
        enabled: (options?.enabled ?? true) && query.collectionPointIds.length > 0 && !!query.commodity,
        keepPreviousData: true,
    });
};

// =============================================
// 采集点列表与行政区划
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
    page: number;
    pageSize: number;
    totalPages: number;
}

interface UseCollectionPointsOptions {
    enabled?: boolean;
}

interface CollectionPointListQuery {
    type?: string;
    types?: string[];
    regionCode?: string;
    keyword?: string;
    isActive?: boolean;
    allocationStatus?: 'ALLOCATED' | 'UNALLOCATED';
    page?: number;
    pageSize?: number;
}

const normalizeCollectionPointListQuery = (
    queryOrType?: CollectionPointListQuery | string,
    keyword?: string,
): CollectionPointListQuery => {
    if (typeof queryOrType === 'string') {
        return {
            type: queryOrType || undefined,
            keyword: keyword || undefined,
        };
    }
    return queryOrType || {};
};

export const useCollectionPoints = (
    queryOrType?: CollectionPointListQuery | string,
    keyword?: string,
    options?: UseCollectionPointsOptions,
) => {
    const query = normalizeCollectionPointListQuery(queryOrType, keyword);
    const normalizedTypes = query.types || [];
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    return useQuery<CollectionPointListResponse>({
        queryKey: [
            'collection-points-lite',
            query.type,
            normalizedTypes.join(','),
            query.regionCode,
            query.keyword,
            query.isActive,
            query.allocationStatus,
            page,
            pageSize,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query.type) params.append('type', query.type);
            if (normalizedTypes.length > 0) params.append('types', normalizedTypes.join(','));
            if (query.regionCode) params.append('regionCode', query.regionCode);
            if (query.keyword) params.append('keyword', query.keyword);
            if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
            if (query.allocationStatus) params.append('allocationStatus', query.allocationStatus);
            params.append('page', String(page));
            params.append('pageSize', String(pageSize));
            const res = await apiClient.get<CollectionPointListResponse>(
                `/collection-points?${params.toString()}`,
            );
            return res.data;
        },
        enabled: options?.enabled ?? true,
        staleTime: 2 * 60 * 1000,
        keepPreviousData: true,
    });
};

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
        staleTime: 10 * 60 * 1000,
    });
};
