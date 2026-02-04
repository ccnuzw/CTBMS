/**
 * 功能专用枚举常量
 *
 * 这些枚举仅在特定功能模块中使用，使用范围狭窄，不适合做成通用数据字典。
 */

// =============================================
// 任务分配方式 (ASSIGNEE_MODE)
// =============================================
export const ASSIGNEE_MODE_LABELS: Record<string, string> = {
    BY_COLLECTION_POINT: '按采集点分配',
    MANUAL: '手动指定',
    ALL_ACTIVE: '全员',
    BY_DEPARTMENT: '按部门',
    BY_ORGANIZATION: '按组织',
};

// =============================================
// 采集点选择方式 (POINT_SELECTION_MODE)
// =============================================
export const POINT_SELECTION_MODE_LABELS: Record<string, string> = {
    TYPE: '按采集点类型',
    SPECIFIC: '指定采集点',
};

// =============================================
// 采集点范围 (POINT_SCOPE)
// =============================================
export const POINT_SCOPE_LABELS: Record<string, string> = {
    TYPE: '按类型',
    POINTS: '按采集点',
};

// =============================================
// 分配中心视图模式 (ALLOCATION_MODE)
// =============================================
export const ALLOCATION_MODE_LABELS: Record<string, string> = {
    BY_USER: '按员工分配',
    POINT_COVERAGE: '按采集点分配',
};

// =============================================
// 情感筛选器 (SENTIMENT_FILTER)
// =============================================
export const SENTIMENT_FILTER_LABELS: Record<string, string> = {
    ALL: '全部',
    positive: '利好',
    negative: '利空',
};

// =============================================
// 业务规则域 (LOGIC_RULE_DOMAIN)
// =============================================
export const LOGIC_RULE_DOMAIN_LABELS: Record<string, string> = {
    PRICE_SOURCE_TYPE: '价格来源 (Source)',
    PRICE_SUB_TYPE: '价格类型 (SubType)',
    SENTIMENT: '情感倾向 (Sentiment)',
    GEO_LEVEL: '地理层级 (Geo)',
};

// =============================================
// 驾驶舱区域筛选 (SUPER_DASHBOARD_REGION)
// =============================================
export const SUPER_DASHBOARD_REGION_LABELS: Record<string, string> = {
    ALL: '全国全域',
    辽宁: '辽宁产区',
    吉林: '吉林产区',
    南方: '南方销区',
};

// =============================================
// AI 报告类型 (AI_REPORT_TYPE) - 建议合并到 REPORT_TYPE
// =============================================
export const AI_REPORT_TYPE_LABELS: Record<string, string> = {
    market_daily: '市场日报',
    regional_weekly: '区域周报',
    topic_analysis: '专题分析',
    price_report: '价格报告',
    other: '其他',
};
