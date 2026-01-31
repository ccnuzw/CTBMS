// 情报流模块类型定义

import { ContentType, IntelSourceType, IntelCategory } from '../../types';
export { ContentType, IntelSourceType, IntelCategory };

// 视图类型
export type IntelViewType = 'FEED' | 'DASHBOARD' | 'TIMELINE' | 'TABLE';

// 筛选状态
export interface IntelFilterState {
    // 时间
    timeRange: '1D' | '7D' | '30D' | '90D' | 'YTD' | 'CUSTOM';
    customDateRange?: [Date, Date];

    // 内容类型
    contentTypes: ContentType[];

    // 信源类型
    sourceTypes: IntelSourceType[];

    // 品种
    commodities: string[];

    // 区域
    regions: string[];

    // 采集点
    collectionPointIds: string[];

    // AI可信度范围
    confidenceRange: [number, number];

    // 事件类型
    eventTypeIds: string[];

    // 洞察类型
    insightTypeIds: string[];

    // 处理状态
    status: ('pending' | 'confirmed' | 'flagged' | 'archived')[];

    // 质量评分
    qualityLevel: ('high' | 'medium' | 'low')[];

    // 全文搜索
    keyword?: string;
}

// 默认筛选状态
export const DEFAULT_FILTER_STATE: IntelFilterState = {
    timeRange: '7D',
    contentTypes: [],
    sourceTypes: [],
    commodities: [],
    regions: [],
    collectionPointIds: [],
    confidenceRange: [0, 100],
    eventTypeIds: [],
    insightTypeIds: [],
    status: [],
    qualityLevel: [],
    keyword: undefined,
};

// 筛选模板
export interface FilterPreset {
    id: string;
    name: string;
    description?: string;
    filter: Partial<IntelFilterState>;
    isBuiltIn?: boolean;
    createdAt: Date;
}

// 内置筛选模板
export const BUILT_IN_PRESETS: FilterPreset[] = [
    {
        id: 'today',
        name: '今日新增',
        filter: { timeRange: '1D' },
        isBuiltIn: true,
        createdAt: new Date(),
    },
    {
        id: 'high-value',
        name: '高价值情报',
        filter: { confidenceRange: [80, 100], qualityLevel: ['high'] },
        isBuiltIn: true,
        createdAt: new Date(),
    },
    {
        id: 'pending',
        name: '待处理',
        filter: { status: ['pending'] },
        isBuiltIn: true,
        createdAt: new Date(),
    },
    {
        id: 'first-line',
        name: '市场信息',
        filter: { sourceTypes: ['FIRST_LINE' as IntelSourceType] },
        isBuiltIn: true,
        createdAt: new Date(),
    },
];

// 市场心态类型
export interface MarketSentiment {
    overall: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    score?: number;
    traders?: string;
    processors?: string;
    farmers?: string;
    summary?: string;
}

// 价格点类型
export interface ExtractedPricePoint {
    location: string;
    price: number;
    change: number | null;
    unit?: string;
    commodity?: string;
    grade?: string;
    note?: string;
}

// 后市预判类型
export interface Forecast {
    shortTerm?: string;
    mediumTerm?: string;
    longTerm?: string;
    keyFactors?: string[];
    riskLevel?: 'low' | 'medium' | 'high';
}

// 洞察类型
export interface Insight {
    title: string;
    content: string;
    direction?: 'Bullish' | 'Bearish' | 'Neutral';
    timeframe?: 'short' | 'medium' | 'long';
    confidence?: number;
    factors?: string[];
}

// 情报项（统一类型）
export interface IntelItem {
    id: string;
    intelId?: string;
    type: 'intel' | 'event' | 'insight' | 'research_report';
    contentType: ContentType;
    sourceType: IntelSourceType;
    category: IntelCategory;

    // 基础信息
    title?: string;
    summary?: string;
    rawContent: string;

    // 时间
    effectiveTime: Date;
    createdAt: Date;

    // 地理
    location?: string;
    region?: string[];

    // 采集点关联
    collectionPointId?: string;
    collectionPointName?: string;

    // AI 分析
    confidence?: number;
    events?: any[];
    insights?: Insight[];

    // 新增：AI 分析扩展字段
    pricePoints?: ExtractedPricePoint[];
    marketSentiment?: MarketSentiment;
    forecast?: Forecast;

    // 质量
    qualityScore?: number;

    // Author info
    author?: {
        id: string;
        name: string;
        avatar?: string | null;
        organizationName?: string;
    };

    // 状态
    status: 'pending' | 'confirmed' | 'flagged' | 'archived';

    // 关联
    relatedIntelIds?: string[];

    // 研报数据
    researchReport?: any;
}

// 统计数据
export interface IntelStats {
    total: number;
    todayCount: number;
    weekCount: number;
    highValueCount: number;
    pendingCount: number;
    confirmedCount: number;

    byContentType: Record<ContentType, number>;
    bySourceType: Record<IntelSourceType, number>;
    byCommodity: Record<string, number>;
    byRegion: Record<string, number>;
}

// 关联情报
export interface RelatedIntel {
    id: string;
    title: string;
    contentType: ContentType;
    relationType: 'time' | 'commodity' | 'region' | 'chain' | 'citation';
    similarity?: number;
    createdAt: Date;
}
