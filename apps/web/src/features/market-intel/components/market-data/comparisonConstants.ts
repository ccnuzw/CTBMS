import type { PriceReviewScope, PriceSourceScope, PriceSubType } from '@packages/types';

// =============================================
// Fallback 映射
// =============================================

export const POINT_TYPE_LABELS_FALLBACK: Record<string, string> = {
    PORT: '港口',
    ENTERPRISE: '企业',
    MARKET: '市场',
    REGION: '地域',
    STATION: '站台',
};

export const COMMODITY_LABELS_FALLBACK: Record<string, string> = {
    CORN: '玉米',
    WHEAT: '小麦',
    SOYBEAN: '大豆',
    RICE: '稻谷',
    SORGHUM: '高粱',
    BARLEY: '大麦',
};

// =============================================
// 类型定义
// =============================================

export type SortMetric = 'changePct' | 'volatility' | 'periodChangePct';

export type GroupMode = 'all' | 'type' | 'region';

export type ViewMode = 'list' | 'range';
export type DistributionMode = 'box' | 'band';

export interface ComparisonPanelProps {
    commodity: string;
    startDate?: Date;
    endDate?: Date;
    selectedPointIds: string[];
    selectedProvince?: string;
    pointTypeFilter?: string[];
    subTypes?: PriceSubType[];
    reviewScope?: PriceReviewScope;
    sourceScope?: PriceSourceScope;
    onFocusPoint?: (id: string) => void;
    onDrilldownPoint?: (id: string) => void;
    onDrilldownRegion?: (regionName: string, level: 'province' | 'city' | 'district') => void;
}

export interface RankingItem {
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
    isAnomaly: boolean;
    baselineDiff: number | null;
    baselineDiffPct: number | null;
}

export interface DistributionItem {
    id: string;
    name: string;
    min: number;
    max: number;
    q1: number;
    median: number;
    q3: number;
    avg: number;
}
