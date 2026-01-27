// Re-export types from shared package
export {
    IntelCategory,
    IntelSourceType,
    ContentType,
    ReportType,
    INTEL_CATEGORY_LABELS,
    INTEL_SOURCE_TYPE_LABELS,
    CONTENT_TYPE_LABELS,
    CONTENT_TYPE_DESCRIPTIONS,
    CONTENT_TYPE_SOURCE_OPTIONS,
    REPORT_TYPE_LABELS,
    type AIAnalysisResult,
    type QualityScore,
    type CreateMarketIntelDto,
    type UpdateMarketIntelDto,
    type MarketIntelResponse,
    type MarketIntelQuery,
    type AnalyzeContentDto,
    type UserIntelStats,
    type LeaderboardEntry,
    type MarketIntelStats,
    type ExtractedPricePoint,
    type StructuredEvent,
} from '@packages/types';

// Re-export local types and constants
export {
    INTEL_CATEGORY_GUIDELINES,
    MOCK_TASKS,
    MOCK_USERS,
    MOCK_CARDS,
    LINE_COLORS,
    type Task,
    type UserStats,
    type InfoCard,
    type InfoCardMetadata,
} from './constants';

// 视图状态类型
export type ViewState =
    | 'super_dashboard'
    | 'dashboard'
    | 'workbench'
    | 'search'
    | 'entry'
    | 'market_data'
    | 'feed'
    | 'knowledge_base'
    | 'entity_profile'
    | 'leaderboard';

