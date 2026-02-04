/**
 * 技术内部枚举常量
 *
 * 这些枚举仅开发者使用，不面向业务用户，不适合做成数据字典。
 */

// =============================================
// 标签可挂载实体类型 (TAGGABLE_ENTITY_TYPE)
// =============================================
export const TAGGABLE_ENTITY_TYPE_LABELS: Record<string, string> = {
    CUSTOMER: '客户',
    SUPPLIER: '供应商',
    LOGISTICS: '物流商',
    CONTRACT: '合同',
    MARKET_INFO: '信息采集',
};

// =============================================
// 情报关联类型 (INTEL_POINT_LINK_TYPE)
// =============================================
export const INTEL_POINT_LINK_TYPE_LABELS: Record<string, string> = {
    MENTIONED: '被提及',
    SUBJECT: '情报主体',
    SOURCE: '情报来源',
};

// =============================================
// 价格录入方式 (PRICE_INPUT_METHOD)
// =============================================
export const PRICE_INPUT_METHOD_LABELS: Record<string, string> = {
    AI_EXTRACTED: '智能采集',
    MANUAL_ENTRY: '手动填报',
    BULK_IMPORT: '批量导入',
};

// =============================================
// 情报视图类型 (INTEL_VIEW_TYPE) - 纯前端 UI 切换
// =============================================
export const INTEL_VIEW_TYPE_LABELS: Record<string, string> = {
    FEED: '情报流',
    DASHBOARD: '仪表盘',
    TIMELINE: '时间线',
    TABLE: '表格',
};

// =============================================
// 匹配模式 (MATCH_MODE)
// =============================================
export const MATCH_MODE_LABELS: Record<string, string> = {
    CONTAINS: '包含',
    EXACT: '精确',
    REGEX: '正则',
};

// =============================================
// AI 模型提供商 (AI_MODEL_PROVIDER)
// =============================================
export const AI_MODEL_PROVIDER_LABELS: Record<string, string> = {
    google: 'Google Gemini',
    openai: 'OpenAI (Compatible)',
};
