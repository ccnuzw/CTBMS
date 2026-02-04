import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type DictionaryItemSeed = {
    code: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
    parentCode?: string | null;
    meta?: Prisma.InputJsonValue;
};

type DictionaryDomainSeed = {
    code: string;
    name: string;
    description?: string;
    category?: string;           // 分类
    usageHint?: string;          // 用途说明
    usageLocations?: string[];   // 使用位置
    isSystemDomain?: boolean;    // 是否系统域
    items: DictionaryItemSeed[];
};

// =============================================
// 数据字典种子数据
// =============================================
// 仅包含面向业务用户、需要 label/颜色/图标等 UI 属性的字典域
// 状态机类枚举、技术内部枚举、功能专用枚举已移至前端常量文件
// 参见: apps/web/src/constants/
// =============================================
const domains: DictionaryDomainSeed[] = [
    // =============================================
    // 用户/组织相关 (4)
    // =============================================
    {
        code: 'USER_STATUS',
        name: '用户状态',
        category: 'USER_ORG',
        usageHint: '员工在职/离职等状态',
        usageLocations: ['用户管理 - UserEditor', '组织架构 - UserDetailPanel'],
        items: [
            { code: 'ACTIVE', label: '在职', sortOrder: 10, meta: { color: 'success' } },
            { code: 'PROBATION', label: '试用期', sortOrder: 20, meta: { color: 'warning' } },
            { code: 'RESIGNED', label: '离职', sortOrder: 30, meta: { color: 'default' } },
            { code: 'SUSPENDED', label: '停职', sortOrder: 40, meta: { color: 'error' } },
        ],
    },
    {
        code: 'GENDER',
        name: '性别',
        category: 'USER_ORG',
        usageHint: '用户性别选项',
        usageLocations: ['用户表单 - UserFormModal'],
        items: [
            { code: 'MALE', label: '男', sortOrder: 10 },
            { code: 'FEMALE', label: '女', sortOrder: 20 },
            { code: 'OTHER', label: '其他', sortOrder: 30 },
        ],
    },
    {
        code: 'ENTITY_STATUS',
        name: '通用状态',
        category: 'USER_ORG',
        usageHint: '启用/禁用通用状态',
        usageLocations: ['角色管理 - RoleList', '组织管理 - OrgEditor'],
        items: [
            { code: 'ACTIVE', label: '启用', sortOrder: 10, meta: { color: 'success' } },
            { code: 'INACTIVE', label: '禁用', sortOrder: 20, meta: { color: 'default' } },
        ],
    },
    {
        code: 'ORGANIZATION_TYPE',
        name: '组织类型',
        category: 'USER_ORG',
        usageHint: '组织分类（总部/分公司等）',
        usageLocations: ['组织管理 - OrgDeptTree', '组织列表 - OrgList'],
        items: [
            { code: 'HEADQUARTERS', label: '总部', sortOrder: 10, meta: { icon: 'GlobalOutlined', color: 'red' } },
            { code: 'REGION', label: '大区/分公司', sortOrder: 20, meta: { icon: 'ClusterOutlined', color: 'orange' } },
            { code: 'BRANCH', label: '经营部/办事处', sortOrder: 30, meta: { icon: 'ShopOutlined', color: 'blue' } },
            { code: 'SUBSIDIARY', label: '子公司', sortOrder: 40, meta: { icon: 'HomeOutlined', color: 'green' } },
        ],
    },

    // =============================================
    // 标签/客商相关 (4)
    // =============================================
    {
        code: 'TAG_SCOPE',
        name: '标签作用域',
        category: 'TAG_ENTERPRISE',
        usageHint: '标签可应用的实体范围',
        usageLocations: ['标签管理 - GlobalTagList'],
        items: [
            { code: 'GLOBAL', label: '全局', sortOrder: 10, meta: { color: 'blue' } },
            { code: 'CUSTOMER', label: '客户', sortOrder: 20, meta: { color: 'green' } },
            { code: 'SUPPLIER', label: '供应商', sortOrder: 30, meta: { color: 'orange' } },
            { code: 'LOGISTICS', label: '物流商', sortOrder: 40, meta: { color: 'purple' } },
            { code: 'CONTRACT', label: '合同', sortOrder: 50, meta: { color: 'cyan' } },
            { code: 'MARKET_INFO', label: '信息采集', sortOrder: 60, meta: { color: 'magenta' } },
        ],
    },
    {
        code: 'INFO_STATUS',
        name: '信息采集状态',
        category: 'TAG_ENTERPRISE',
        usageHint: '客商信息采集进度',
        usageLocations: ['信息采集列表 - InfoList', '信息编辑器 - InfoEditor'],
        items: [
            { code: 'DRAFT', label: '草稿', sortOrder: 10 },
            { code: 'PUBLISHED', label: '已发布', sortOrder: 20 },
            { code: 'ARCHIVED', label: '已归档', sortOrder: 30 },
        ],
    },
    {
        code: 'ENTERPRISE_TYPE',
        name: '企业类型',
        category: 'TAG_ENTERPRISE',
        usageHint: '客商分类（贸易商/加工厂等）',
        usageLocations: ['客商管理 - EnterpriseDashboard', '360视图 - EnterpriseEditor'],
        items: [
            { code: 'SUPPLIER', label: '供应商', sortOrder: 10 },
            { code: 'CUSTOMER', label: '客户', sortOrder: 20 },
            { code: 'LOGISTICS', label: '物流商', sortOrder: 30 },
            { code: 'GROUP', label: '集团', sortOrder: 40 },
        ],
    },
    {
        code: 'CONTACT_ROLE',
        name: '联系人角色',
        category: 'TAG_ENTERPRISE',
        usageHint: '客商联系人职务',
        usageLocations: ['客商联系人管理 - Enterprise360'],
        items: [
            { code: 'PROCUREMENT', label: '采购决策线', sortOrder: 10, meta: { color: 'blue' } },
            { code: 'EXECUTION', label: '执行运营线', sortOrder: 20, meta: { color: 'orange' } },
            { code: 'FINANCE', label: '财务结算线', sortOrder: 30, meta: { color: 'green' } },
            { code: 'MANAGEMENT', label: '高层管理线', sortOrder: 40, meta: { color: 'purple' } },
        ],
    },

    // =============================================
    // 采集点/地理 (3)
    // =============================================
    {
        code: 'COLLECTION_POINT_TYPE',
        name: '采集点类型',
        category: 'REGION',
        usageHint: '区分采集点业务类型：港口/企业/站台/地域/市场等',
        usageLocations: [
            '采集点管理 - CollectionPointManager',
            '采集点编辑 - CollectionPointEditor',
            '高级选点器 - AdvancedPointSelector',
            '地图组件 - MapComponent',
            '价格报告 - PriceReportingDashboard',
        ],
        items: [
            { code: 'ENTERPRISE', label: '企业', sortOrder: 10, meta: { icon: '🏭', color: 'cyan' } },
            { code: 'PORT', label: '港口', sortOrder: 20, meta: { icon: '⚓', color: 'blue' } },
            { code: 'STATION', label: '站台', sortOrder: 30, meta: { icon: '🚂', color: 'purple' } },
            { code: 'REGION', label: '地域', sortOrder: 40, meta: { icon: '🌍', color: 'orange' } },
            { code: 'MARKET', label: '批发市场', sortOrder: 50, meta: { icon: '🏪', color: 'green' } },
        ],
    },

    {
        code: 'GEO_LEVEL',
        name: '地理层级',
        category: 'REGION',
        usageHint: 'AI地名识别目标层级：行政区划（省/市/区）或业务点位（港口/站台/企业）',
        usageLocations: [
            '逻辑规则配置 - LogicRulesPage',
            'AI地名识别 - AiService',
        ],
        items: [
            // 行政区划 - 用于识别中国行政地名
            { code: 'COUNTRY', label: '国家级', sortOrder: 10, meta: { category: 'ADMIN', level: 1 } },
            { code: 'PROVINCE', label: '省级', sortOrder: 20, meta: { category: 'ADMIN', level: 2 } },
            { code: 'CITY', label: '市级', sortOrder: 30, meta: { category: 'ADMIN', level: 3 } },
            { code: 'DISTRICT', label: '区县级', sortOrder: 40, meta: { category: 'ADMIN', level: 4 } },
            { code: 'TOWN', label: '乡镇/街道', sortOrder: 50, meta: { category: 'ADMIN', level: 5 } },
            // 业务点位 - 用于识别粮食行业特定地点
            { code: 'REGION', label: '大区', sortOrder: 60, meta: { category: 'BUSINESS' } },
            { code: 'PORT', label: '港口', sortOrder: 70, meta: { category: 'BUSINESS' } },
            { code: 'STATION', label: '站台', sortOrder: 80, meta: { category: 'BUSINESS' } },
            { code: 'ENTERPRISE', label: '企业', sortOrder: 90, meta: { category: 'BUSINESS' } },
        ],
    },

    // =============================================
    // 价格相关 (4)
    // =============================================
    {
        code: 'PRICE_SOURCE_TYPE',
        name: '价格来源类型',
        category: 'PRICE',
        usageHint: '一线/竞品/官方等',
        usageLocations: ['价格数据分类 - LogicRulesPage'],
        items: [
            { code: 'ENTERPRISE', label: '企业收购价', sortOrder: 10 },
            { code: 'REGIONAL', label: '地域市场价', sortOrder: 20 },
            { code: 'PORT', label: '港口价格', sortOrder: 30 },
            { code: 'STATION', label: '站台价格', sortOrder: 40, isActive: false, meta: { note: '待确认是否纳入标准枚举' } },
            { code: 'MARKET', label: '市场价格', sortOrder: 50, isActive: false, meta: { note: '待确认是否纳入标准枚举' } },
        ],
    },
    {
        code: 'PRICE_SUB_TYPE',
        name: '价格子类型',
        category: 'PRICE',
        usageHint: '区分价格交易属性：挂牌价/成交价/到港价/平舱价/收购价等',
        usageLocations: [
            '采集点编辑器 - CollectionPointEditor',
            '价格录入表单 - PriceEntryForm',
            '批量录入表格 - BatchPriceEntryTable',
            '行情筛选面板 - FilterPanel',
            '数据明细表格 - DataGrid',
            '逻辑规则配置 - LogicRulesPage',
        ],
        items: [
            { code: 'LISTED', label: '挂牌价', sortOrder: 10 },
            { code: 'TRANSACTION', label: '成交价', sortOrder: 20 },
            { code: 'ARRIVAL', label: '到港价', sortOrder: 30 },
            { code: 'FOB', label: '平舱价', sortOrder: 40 },
            { code: 'STATION', label: '站台价', sortOrder: 50 },
            { code: 'PURCHASE', label: '收购价', sortOrder: 60 },
            { code: 'WHOLESALE', label: '批发价', sortOrder: 70 },
            { code: 'OTHER', label: '其他', sortOrder: 80 },
        ],
    },
    {
        code: 'COMMODITY',
        name: '主营品种',
        category: 'PRICE',
        usageHint: '主要贸易品种：玉米/小麦/大豆/稻谷/高粱/大麦等',
        usageLocations: [
            '采集点编辑器 - CollectionPointEditor',
            '价格录入表单 - PriceEntryForm',
            '行情筛选面板 - FilterPanel',
            '高级筛选器 - AdvancedFilter',
            '驾驶舱 - SuperDashboard',
            '价格监控 - PriceMonitorWidget',
        ],
        items: [
            { code: 'CORN', label: '玉米', sortOrder: 10 },
            { code: 'WHEAT', label: '小麦', sortOrder: 20 },
            { code: 'SOYBEAN', label: '大豆', sortOrder: 30 },
            { code: 'RICE', label: '稻谷', sortOrder: 40 },
            { code: 'SORGHUM', label: '高粱', sortOrder: 50 },
            { code: 'BARLEY', label: '大麦', sortOrder: 60 },
        ],
    },
    {
        code: 'PRICE_MONITOR_LOCATION',
        name: '价格监控位置',
        category: 'PRICE',
        usageHint: '监控点位位置',
        usageLocations: ['价格监控仪表盘 - PriceMonitorWidget'],
        items: [
            { code: 'JINZHOU_PORT', label: '锦州港', sortOrder: 10 },
            { code: 'BAYUQUAN_PORT', label: '鲅鱼圈', sortOrder: 20 },
            { code: 'DEEP_PROCESSING', label: '深加工', sortOrder: 30 },
            { code: 'NATIONAL', label: '全国', sortOrder: 40 },
        ],
    },

    // =============================================
    // 情报/内容相关 (9)
    // =============================================
    {
        code: 'INTEL_CATEGORY',
        name: '情报分类',
        category: 'INTEL',
        usageHint: 'AB/C类情报分类',
        usageLocations: ['情报采集 - IntelFeedList'],
        items: [
            { code: 'A_STRUCTURED', label: 'A类：结构化', sortOrder: 10, meta: { fullLabel: 'AB类：文本采集 (价格/事件/洞察)' } },
            { code: 'B_SEMI_STRUCTURED', label: 'B类：半结构化', sortOrder: 20, meta: { fullLabel: 'AB类：文本采集 (价格/事件/洞察)' } },
            { code: 'C_DOCUMENT', label: 'C类：文档与图表', sortOrder: 30, meta: { fullLabel: 'C类：文档与图表 (研报/政策)' } },
        ],
    },
    {
        code: 'INTEL_SOURCE_TYPE',
        name: '情报来源类型',
        category: 'INTEL',
        usageHint: '情报来源渠道分类：一线采集/竞对情报/官方发布/研究机构/媒体等',
        usageLocations: [
            '情报列表 - IntelFeedList',
            '运营工作台 - OperationalWorkbench',
            '全局搜索 - UniversalSearch',
            '情报卡片 - DailyReportCard/MarketInsightCard/PriceAlertCard',
            '知识库 - DocumentListView/DocumentCardView',
            '关联面板 - RelationPanel',
        ],
        items: [
            { code: 'FIRST_LINE', label: '一线采集', sortOrder: 10, meta: { color: 'blue' } },
            { code: 'COMPETITOR', label: '竞对情报', sortOrder: 20, meta: { color: 'volcano' } },
            { code: 'OFFICIAL', label: '官方发布', sortOrder: 30, meta: { color: 'green' } },
            { code: 'RESEARCH_INST', label: '第三方研究机构', sortOrder: 40, meta: { color: 'purple' } },
            { code: 'MEDIA', label: '媒体报道', sortOrder: 50, meta: { color: 'orange' } },
            { code: 'INTERNAL_REPORT', label: '内部研报', sortOrder: 60, meta: { color: 'geekblue' } },
        ],
    },
    {
        code: 'CONTENT_TYPE',
        name: '内容类型',
        category: 'INTEL',
        usageHint: '日报/研报/政策等',
        usageLocations: ['内容管理 - ContentList'],
        items: [
            { code: 'DAILY_REPORT', label: '市场信息', sortOrder: 10, meta: { color: 'blue' } },
            { code: 'RESEARCH_REPORT', label: '研究报告', sortOrder: 20, meta: { color: 'green' } },
            { code: 'POLICY_DOC', label: '政策文件', sortOrder: 30, meta: { color: 'purple' } },
        ],
    },
    {
        code: 'REPORT_TYPE',
        name: '研报类型',
        category: 'INTEL',
        usageHint: '研究报告主题分类：政策研究/市场研究/深度研究/行业研究',
        usageLocations: [
            '研报列表 - ResearchReportList',
            '研报创建 - ResearchReportCreatePage',
            '文档详情 - DocumentDetailPage',
            '统一分析 - UnifiedAnalytics',
        ],
        items: [
            { code: 'POLICY', label: '政策研究', sortOrder: 10, meta: { color: 'volcano' } },
            { code: 'MARKET', label: '市场研究', sortOrder: 20, meta: { color: 'blue' } },
            { code: 'RESEARCH', label: '深度研究', sortOrder: 30, meta: { color: 'purple' } },
            { code: 'INDUSTRY', label: '行业研究', sortOrder: 40, meta: { color: 'cyan' } },
        ],
    },
    {
        code: 'REPORT_PERIOD',
        name: '研报周期',
        category: 'INTEL',
        usageHint: '日/周/月报等',
        usageLocations: ['研报管理 - ResearchReportForm'],
        items: [
            { code: 'DAILY', label: '日报', sortOrder: 10 },
            { code: 'WEEKLY', label: '周报', sortOrder: 20 },
            { code: 'MONTHLY', label: '月报', sortOrder: 30 },
            { code: 'QUARTERLY', label: '季报', sortOrder: 40 },
            { code: 'ANNUAL', label: '年报', sortOrder: 50 },
            { code: 'ADHOC', label: '不定期', sortOrder: 60 },
        ],
    },
    {
        code: 'INTEL_TASK_TYPE',
        name: '情报任务类型',
        category: 'INTEL',
        usageHint: '情报采集任务类型：日报/周报/研报/价格采集/竞对情报等',
        usageLocations: [
            '任务分配 - IntelTaskPage',
            '模板管理 - TaskTemplateList',
            '我的任务 - MyTaskBoard',
        ],
        items: [
            { code: 'DAILY_REPORT', label: '市场日报', sortOrder: 10 },
            { code: 'WEEKLY_REPORT', label: '周报', sortOrder: 20 },
            { code: 'MONTHLY_REPORT', label: '月报', sortOrder: 30 },
            { code: 'RESEARCH_REPORT', label: '深度研报', sortOrder: 40 },
            { code: 'PRICE_COLLECTION', label: '价格采集', sortOrder: 50 },
            { code: 'INVENTORY_CHECK', label: '库存盘点', sortOrder: 60 },
            { code: 'FIELD_VISIT', label: '实地走访', sortOrder: 70 },
            { code: 'COMPETITOR_INFO', label: '竞对情报', sortOrder: 80 },
            { code: 'POLICY_ANALYSIS', label: '政策解读', sortOrder: 90 },
            { code: 'URGENT_VERIFICATION', label: '紧急核实', sortOrder: 100 },
            { code: 'EXHIBITION_REPORT', label: '会议/展会纪要', sortOrder: 110 },
            { code: 'RESOURCE_UPDATE', label: '客商/档案更新', sortOrder: 120 },
            { code: 'PRICE_REPORT', label: '价格报告', sortOrder: 900, isActive: false, meta: { deprecated: true } },
            { code: 'FIELD_CHECK', label: '现场核查', sortOrder: 910, isActive: false, meta: { deprecated: true } },
            { code: 'DOCUMENT_SCAN', label: '文档扫描', sortOrder: 920, isActive: false, meta: { deprecated: true } },
        ],
    },
    {
        code: 'INTEL_TASK_PRIORITY',
        name: '任务优先级',
        category: 'INTEL',
        usageHint: '低/中/高/紧急',
        usageLocations: ['任务列表 - IntelTaskForm'],
        items: [
            { code: 'LOW', label: '低', sortOrder: 10, meta: { color: 'default' } },
            { code: 'MEDIUM', label: '中', sortOrder: 20, meta: { color: 'blue' } },
            { code: 'HIGH', label: '高', sortOrder: 30, meta: { color: 'orange' } },
            { code: 'URGENT', label: '紧急', sortOrder: 40, meta: { color: 'red' } },
        ],
    },
    {
        code: 'TIME_RANGE',
        name: '时间范围',
        category: 'INTEL',
        usageHint: '情报/内容筛选的时间范围选项：近1天/7天/30天/自定义等',
        usageLocations: [
            '高级筛选器 - AdvancedFilter',
            '行情筛选面板 - FilterPanel',
        ],
        items: [
            { code: '1D', label: '近1天', sortOrder: 10, meta: { days: 1, aliases: ['24H'] } },
            { code: '3D', label: '近3天', sortOrder: 20, meta: { days: 3 } },
            { code: '7D', label: '7天', sortOrder: 30, meta: { days: 7 } },
            { code: '30D', label: '1月', sortOrder: 40, meta: { days: 30 } },
            { code: '90D', label: '3月', sortOrder: 50, meta: { days: 90 } },
            { code: '180D', label: '6月', sortOrder: 55, meta: { days: 180 } },
            { code: '365D', label: '1年', sortOrder: 58, meta: { days: 365 } },
            { code: 'YTD', label: '今年至今', sortOrder: 60, meta: { days: -1 } },
            { code: 'CUSTOM', label: '自定义', sortOrder: 70, meta: { days: 0 } },
            { code: 'ALL', label: '全部', sortOrder: 80, meta: { days: -2 } },
        ],
    },
    {
        code: 'RELATION_TYPE',
        name: '关联类型',
        category: 'INTEL',
        usageHint: '时间/品种/因果关联',
        usageLocations: ['知识图谱 - KnowledgeGraph'],
        items: [
            { code: 'TIME', label: '时间关联', sortOrder: 10, meta: { color: 'blue' } },
            { code: 'COMMODITY', label: '品种关联', sortOrder: 20, meta: { color: 'green' } },
            { code: 'REGION', label: '区域关联', sortOrder: 30, meta: { color: 'purple' } },
            { code: 'CHAIN', label: '因果关联', sortOrder: 40, meta: { color: 'orange' } },
            { code: 'CITATION', label: '引用关联', sortOrder: 50, meta: { color: 'cyan' } },
            { code: 'PRICE_FLUCTUATION', label: '价格异动', sortOrder: 60, meta: { color: 'red' } },
        ],
    },

    // =============================================
    // 市场分析展示 (7)
    // =============================================
    {
        code: 'MARKET_SENTIMENT',
        name: '市场情绪',
        category: 'MARKET',
        usageHint: '情报情感/整体情绪/预测方向（合并原SENTIMENT/MARKET_SENTIMENT_OVERALL/PREDICTION_DIRECTION）',
        usageLocations: ['情绪分析 - SentimentAnalysis', '市场概览 - MarketDashboard', '预测展示 - PredictionCard'],
        items: [
            { code: 'BULLISH', label: '看涨/积极', sortOrder: 10, meta: { color: 'red', aliases: ['positive', 'bullish', 'Bullish'] } },
            { code: 'BEARISH', label: '看跌/消极', sortOrder: 20, meta: { color: 'green', aliases: ['negative', 'bearish', 'Bearish'] } },
            { code: 'NEUTRAL', label: '中性/震荡', sortOrder: 30, meta: { color: 'blue', aliases: ['neutral', 'Neutral'] } },
            { code: 'MIXED', label: '混合/波动', sortOrder: 40, meta: { color: 'orange', aliases: ['mixed'] } },
        ],
    },
    {
        code: 'PREDICTION_TIMEFRAME',
        name: '预测周期',
        category: 'MARKET',
        usageHint: '短/中/长期',
        usageLocations: ['预测展示 - PredictionCard'],
        items: [
            { code: 'SHORT', label: '短期', sortOrder: 10 },
            { code: 'MEDIUM', label: '中期', sortOrder: 20 },
            { code: 'LONG', label: '长期', sortOrder: 30 },
        ],
    },
    {
        code: 'RISK_LEVEL',
        name: '风险等级',
        category: 'MARKET',
        usageHint: '低/中/高风险',
        usageLocations: ['风险评估 - RiskIndicator'],
        items: [
            { code: 'LOW', label: '低', sortOrder: 10, meta: { color: 'green' } },
            { code: 'MEDIUM', label: '中', sortOrder: 20, meta: { color: 'orange' } },
            { code: 'HIGH', label: '高', sortOrder: 30, meta: { color: 'red' } },
        ],
    },
    {
        code: 'MARKET_TREND',
        name: '市场趋势',
        category: 'MARKET',
        usageHint: '上涨/下跌/波动',
        usageLocations: ['趋势分析 - TrendChart'],
        items: [
            { code: 'UP', label: '上涨', sortOrder: 10 },
            { code: 'DOWN', label: '下跌', sortOrder: 20 },
            { code: 'STABLE', label: '稳定', sortOrder: 30 },
            { code: 'VOLATILE', label: '波动', sortOrder: 40 },
        ],
    },
    {
        code: 'QUALITY_LEVEL',
        name: '质量等级',
        category: 'MARKET',
        usageHint: '高/中/低质量',
        usageLocations: ['内容评分 - ContentRating'],
        items: [
            { code: 'HIGH', label: '高质量', sortOrder: 10, meta: { color: 'gold' } },
            { code: 'MEDIUM', label: '中等', sortOrder: 20, meta: { color: 'blue' } },
            { code: 'LOW', label: '低质量', sortOrder: 30, meta: { color: 'default' } },
        ],
    },
];

async function seedDomains() {
    for (const domain of domains) {
        await prisma.dictionaryDomain.upsert({
            where: { code: domain.code },
            update: {
                name: domain.name,
                description: domain.description,
                category: domain.category,
                usageHint: domain.usageHint,
                usageLocations: domain.usageLocations ?? [],
                isSystemDomain: domain.isSystemDomain ?? true,
                isActive: true,
            },
            create: {
                code: domain.code,
                name: domain.name,
                description: domain.description,
                category: domain.category,
                usageHint: domain.usageHint,
                usageLocations: domain.usageLocations ?? [],
                isSystemDomain: domain.isSystemDomain ?? true,
                isActive: true,
            },
        });


        // 获取种子中定义的所有 item codes
        const seedItemCodes = domain.items.map(item => item.code);

        // 删除不在种子列表中的旧字典项
        await prisma.dictionaryItem.deleteMany({
            where: {
                domainCode: domain.code,
                code: { notIn: seedItemCodes },
            },
        });

        for (const item of domain.items) {
            await prisma.dictionaryItem.upsert({
                where: {
                    domainCode_code: {
                        domainCode: domain.code,
                        code: item.code,
                    },
                },
                update: {
                    label: item.label,
                    sortOrder: item.sortOrder ?? 0,
                    isActive: item.isActive ?? true,
                    parentCode: item.parentCode ?? null,
                    meta: item.meta,
                },
                create: {
                    domainCode: domain.code,
                    code: item.code,
                    label: item.label,
                    sortOrder: item.sortOrder ?? 0,
                    isActive: item.isActive ?? true,
                    parentCode: item.parentCode ?? null,
                    meta: item.meta,
                },
            });
        }
    }
}

async function main() {
    console.log('🌱 Seeding dictionaries...');
    await seedDomains();
    console.log('✅ Dictionaries seeded.');
}

main()
    .catch((e) => {
        console.error('❌ Dictionary seed failed.', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
