import { z } from 'zod';
import { CollectionPointType } from './collection-point';

// =============================================
// 枚举定义 (与 Prisma Schema 保持同步)
// =============================================

export enum IntelCategory {
  A_STRUCTURED = 'A_STRUCTURED',
  B_SEMI_STRUCTURED = 'B_SEMI_STRUCTURED',
  C_DOCUMENT = 'C_DOCUMENT',
}


export enum IntelSourceType {
  FIRST_LINE = 'FIRST_LINE',
  COMPETITOR = 'COMPETITOR',
  OFFICIAL = 'OFFICIAL',
  RESEARCH_INST = 'RESEARCH_INST',  // 第三方研究机构
  MEDIA = 'MEDIA',                   // 媒体报道
  INTERNAL_REPORT = 'INTERNAL_REPORT', // 内部研报
}

// 枚举标签映射
export const INTEL_CATEGORY_LABELS: Record<IntelCategory, string> = {
  [IntelCategory.A_STRUCTURED]: 'AB类：文本采集 (价格/事件/洞察)',
  [IntelCategory.B_SEMI_STRUCTURED]: 'AB类：文本采集 (价格/事件/洞察)',
  [IntelCategory.C_DOCUMENT]: 'C类：文档与图表 (研报/政策)',
};

export const INTEL_SOURCE_TYPE_LABELS: Record<IntelSourceType, string> = {
  [IntelSourceType.FIRST_LINE]: '一线采集',
  [IntelSourceType.COMPETITOR]: '竞对情报',
  [IntelSourceType.OFFICIAL]: '官方发布',
  [IntelSourceType.RESEARCH_INST]: '第三方研究机构',
  [IntelSourceType.MEDIA]: '媒体报道',
  [IntelSourceType.INTERNAL_REPORT]: '内部研报',
};
// ...
// 统一入口：内容类型
export enum ContentType {
  DAILY_REPORT = 'DAILY_REPORT',     // 市场日报（提取价格/事件/洞察）
  RESEARCH_REPORT = 'RESEARCH_REPORT', // 研究报告（含政策类，存入知识库）
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  [ContentType.DAILY_REPORT]: '市场信息',
  [ContentType.RESEARCH_REPORT]: '研究报告',
};

export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentType, string> = {
  [ContentType.DAILY_REPORT]: '价格、事件等日常市场信息 → 提取结构化数据',
  [ContentType.RESEARCH_REPORT]: '周报、月报、政策解读、第三方研报 → 存入知识库档案',
};

// 内容类型对应的可选信源
export const CONTENT_TYPE_SOURCE_OPTIONS: Record<ContentType, IntelSourceType[]> = {
  [ContentType.DAILY_REPORT]: [IntelSourceType.FIRST_LINE, IntelSourceType.COMPETITOR, IntelSourceType.OFFICIAL],
  [ContentType.RESEARCH_REPORT]: [IntelSourceType.INTERNAL_REPORT, IntelSourceType.RESEARCH_INST, IntelSourceType.OFFICIAL],
};

// 智能采集入口可用的内容类型（简化后仅支持市场信息）
export const DATA_ENTRY_CONTENT_TYPES: ContentType[] = [ContentType.DAILY_REPORT];

// 知识库入口可用的内容类型（文档类）
export const KNOWLEDGE_BASE_CONTENT_TYPES: ContentType[] = [
  ContentType.RESEARCH_REPORT,
];

// 研报类型
// 报告内容类型
export enum ReportType {
  POLICY = 'POLICY',       // 政策解读、政策影响分析
  MARKET = 'MARKET',       // 市场行情、价格走势分析
  RESEARCH = 'RESEARCH',   // 深度研究、专题报告
  INDUSTRY = 'INDUSTRY',   // 产业链分析、行业报告
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  [ReportType.POLICY]: '政策研究',
  [ReportType.MARKET]: '市场研究',
  [ReportType.RESEARCH]: '深度研究',
  [ReportType.INDUSTRY]: '行业研究',
};

// 报告发布周期
export enum ReportPeriod {
  DAILY = 'DAILY',         // 日报
  WEEKLY = 'WEEKLY',       // 周报
  MONTHLY = 'MONTHLY',     // 月报
  QUARTERLY = 'QUARTERLY', // 季报
  ANNUAL = 'ANNUAL',       // 年报
  ADHOC = 'ADHOC',         // 不定期/专题
}

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  [ReportPeriod.DAILY]: '日报',
  [ReportPeriod.WEEKLY]: '周报',
  [ReportPeriod.MONTHLY]: '月报',
  [ReportPeriod.QUARTERLY]: '季报',
  [ReportPeriod.ANNUAL]: '年报',
  [ReportPeriod.ADHOC]: '不定期',
};

// 研报审核状态
export enum ReviewStatus {
  PENDING = 'PENDING',     // 待审核
  APPROVED = 'APPROVED',   // 已通过
  REJECTED = 'REJECTED',   // 已拒绝
  ARCHIVED = 'ARCHIVED',   // 已归档
}

// REVIEW_STATUS_LABELS 已移至 apps/web/src/constants/statusEnums.ts


// =============================================
// AI 分析结果 Schema
// =============================================

export const StructuredEventSchema = z.object({
  subject: z.string().optional(),
  action: z.string().optional(),
  content: z.string().optional(), // Add content field
  impact: z.string().optional(),
  commodity: z.string().optional(),
  regionCode: z.string().optional(),
  sourceText: z.string().optional(),
  sourceStart: z.number().optional(),
  sourceEnd: z.number().optional(),

  // 新增：AI 分析扩展字段
  impactLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  eventTypeCode: z.string().optional(),
});

// 提取的价格点（从日报中批量提取）
export const ExtractedPricePointSchema = z.object({
  location: z.string(),           // 采集点名称（锦州港/梅花味精等）
  price: z.number(),              // 价格
  change: z.number().or(z.nan()).nullable(),  // 涨跌幅 (Nan handled)
  unit: z.string().default('元/吨'),
  commodity: z.string().optional(), // 品种（默认从上下文推断）
  grade: z.string().optional(),     // 等级

  // ===== 价格分类 =====
  sourceType: z.enum(['ENTERPRISE', 'REGIONAL', 'PORT']).optional(), // 价格主体类型
  subType: z.enum(['LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER']).optional(), // 价格子类型
  geoLevel: z.enum(['COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE']).optional(), // 地理层级

  // ===== 采集点关联（新增）=====
  collectionPointId: z.string().optional(),    // 匹配到的采集点ID
  collectionPointCode: z.string().optional(),  // 采集点编码

  // ===== 行政区划关联（新增）=====
  regionCode: z.string().optional(),           // 标准行政区划代码（如 210700 锦州市）
  regionName: z.string().optional(),           // 行政区划名称

  // 企业信息（企业价格时填充）
  enterpriseName: z.string().optional(),  // 企业名称
  // [REMOVED] enterpriseId: z.string().optional(),    

  // 地理信息
  province: z.string().optional(),        // 省份
  city: z.string().optional(),            // 城市
  longitude: z.number().optional(),       // 经度
  latitude: z.number().optional(),        // 纬度

  // 附加说明
  note: z.string().optional(),            // 如：平舱价、挂牌价、二等
});

// 市场心态分析（B类核心）
export const MarketSentimentSchema = z.object({
  overall: z.enum(['bullish', 'bearish', 'neutral', 'mixed']), // 整体情绪
  score: z.number().min(-100).max(100).optional(), // 情绪分值
  traders: z.string().optional(),      // 贸易商心态
  processors: z.string().optional(),   // 加工企业心态
  farmers: z.string().optional(),      // 农户/基层心态
  summary: z.string().optional(),      // 心态一句话概述
});

// 后市预判
export const ForecastSchema = z.object({
  shortTerm: z.string().optional(),    // 短期预判（1周内）
  mediumTerm: z.string().optional(),   // 中期预判（1月内）
  longTerm: z.string().optional(),     // 长期预判
  keyFactors: z.array(z.string()).optional(), // 关键影响因素
  riskLevel: z.enum(['low', 'medium', 'high']).optional(), // 风险等级
});

// 市场洞察 (B/C类通用)
export const InsightSchema = z.object({
  title: z.string(),
  content: z.string(),
  direction: z.enum(['Bullish', 'Bearish', 'Neutral']).optional(),
  timeframe: z.enum(['short', 'medium', 'long']).optional(),
  confidence: z.number().min(0).max(100).optional(),
  factors: z.array(z.string()).optional(),
});

export const ReportSectionSchema = z.object({
  title: z.string(),              // 段落标题
  content: z.string(),            // 段落内容
  type: z.enum(['overview', 'price', 'sentiment', 'forecast', 'event', 'other']),
  order: z.number().optional(),   // 段落顺序
});

// 日报元信息
export const DailyReportMetaSchema = z.object({
  reportType: z.enum(['market_daily', 'regional_weekly', 'topic_analysis', 'price_report', 'other']),
  reportDate: z.string().optional(),     // 报告日期 (YYYY-MM-DD)
  region: z.string().optional(),         // 覆盖区域
  commodity: z.string().optional(),      // 主要品种
  marketTrend: z.enum(['up', 'down', 'stable', 'volatile']).optional(), // 整体趋势
  keyChange: z.number().optional(),      // 主要变动值
});

export const AIAnalysisResultSchema = z.object({
  // 基础分析（保持向后兼容）
  summary: z.string(),
  tags: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidenceScore: z.number().min(0).max(100),
  validationMessage: z.string().optional(),
  extractedEffectiveTime: z.string().optional(),
  extractedData: z.record(z.any()).optional(),
  structuredEvent: StructuredEventSchema.optional(),
  entities: z.array(z.string()).optional(),
  ocrText: z.string().optional(),

  // ========== 新增：日报解析扩展 ==========

  // 日报元信息（C类日报专用）
  reportMeta: DailyReportMetaSchema.optional(),

  // A类：批量提取的价格点
  pricePoints: z.array(ExtractedPricePointSchema).optional(),

  // B类：市场心态分析
  marketSentiment: MarketSentimentSchema.optional(),

  // 后市预判
  forecast: ForecastSchema.optional(),

  // 市场洞察列表 (包括 AI 提取和规则引擎匹配)
  insights: z.array(InsightSchema).optional(),

  // 原文分段（便于检索和展示）
  sections: z.array(ReportSectionSchema).optional(),

  // C类增强：研报提取
  reportType: z.nativeEnum(ReportType).optional(), // 自动识别的报告类型
  reportPeriod: z.nativeEnum(ReportPeriod).optional(), // 自动识别的报告周期
  keyPoints: z.array(z.object({
    point: z.string(),
    sentiment: z.string().optional(),
    confidence: z.number().optional(),
  })).optional(),
  prediction: z.record(z.any()).optional(), // 灵活结构
  dataPoints: z.array(z.object({
    metric: z.string(),
    value: z.string(),
    unit: z.string().optional(),
  })).optional(),
  commodities: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),

  // 提取的事件列表（B类扩展）
  events: z.array(StructuredEventSchema).optional(),

  // 上帝视角日志 (God Mode Trace Logs)
  traceLogs: z.array(z.object({
    timestamp: z.number(),
    stage: z.string(),
    message: z.string(),
    level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
    detail: z.any().optional(),
  })).optional(),
});

// =============================================
// 质量评分 Schema
// =============================================

export const QualityScoreSchema = z.object({
  completeness: z.number().min(0).max(100),
  scarcity: z.number().min(0).max(100),
  validation: z.number().min(0).max(100),
  total: z.number().min(0).max(100),
});

// =============================================
// MarketIntel CRUD Schemas
// =============================================

// 创建情报请求
export const CreateMarketIntelSchema = z.object({
  category: z.nativeEnum(IntelCategory),
  contentType: z.nativeEnum(ContentType).optional(),
  sourceType: z.nativeEnum(IntelSourceType),
  effectiveTime: z.coerce.date(),
  location: z.string().min(1, '位置不能为空'),
  region: z.array(z.string()).optional().default([]),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  gpsVerified: z.boolean().optional().default(false),
  rawContent: z.string().min(1, '内容不能为空'),
  summary: z.string().optional(),
  aiAnalysis: AIAnalysisResultSchema.optional(),
  completenessScore: z.number().optional().default(0),
  scarcityScore: z.number().optional().default(0),
  validationScore: z.number().optional().default(0),
  totalScore: z.number().optional().default(0),
  isFlagged: z.boolean().optional().default(false),
});

// 更新情报请求
export const UpdateMarketIntelSchema = CreateMarketIntelSchema.partial();

// 情报响应
export const MarketIntelResponseSchema = z.object({
  id: z.string(),
  category: z.nativeEnum(IntelCategory),
  contentType: z.nativeEnum(ContentType).nullable().optional(),
  sourceType: z.nativeEnum(IntelSourceType),
  effectiveTime: z.date(),
  location: z.string(),
  region: z.array(z.string()),
  gpsLat: z.number().nullable(),
  gpsLng: z.number().nullable(),
  gpsVerified: z.boolean(),
  rawContent: z.string(),
  summary: z.string().nullable(),
  aiAnalysis: AIAnalysisResultSchema.nullable(),
  completenessScore: z.number(),
  scarcityScore: z.number(),
  validationScore: z.number(),
  totalScore: z.number(),
  isFlagged: z.boolean(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // 可选关联
  author: z
    .object({
      id: z.string(),
      name: z.string(),
      avatar: z.string().nullable(),
    })
    .optional(),
});

// 查询参数
export const MarketIntelQuerySchema = z.object({
  category: z.enum([
    IntelCategory.A_STRUCTURED,
    IntelCategory.B_SEMI_STRUCTURED,
    IntelCategory.C_DOCUMENT
  ]).optional(),
  sourceType: z.nativeEnum(IntelSourceType).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  location: z.string().optional(),
  isFlagged: z.coerce.boolean().optional(),
  authorId: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(1000).default(20),
  // 高级筛选参数
  sourceTypes: z.array(z.nativeEnum(IntelSourceType)).optional(),
  regionCodes: z.array(z.string()).optional(),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  processingStatus: z.array(z.string()).optional(), // pending, confirmed, flagged, archived
  qualityLevel: z.array(z.string()).optional(),    // high, medium, low
});

// =============================================
// AI 分析请求 Schema
// =============================================

export const AnalyzeContentSchema = z.object({
  content: z.string().optional(),
  category: z.nativeEnum(IntelCategory),
  contentType: z.nativeEnum(ContentType).optional(), // 明确内容类型
  location: z.string().optional(),
  base64Image: z.string().optional(),
  mimeType: z.string().optional(),
});


// =============================================
// 排行榜相关 Schema
// =============================================

export enum LeaderboardTimeframe {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  userId: z.string(),
  name: z.string(), // 显示名称
  avatar: z.string().nullable(),
  role: z.string().nullable(),
  region: z.string().nullable(),

  // 组织信息
  organizationName: z.string().optional(),
  departmentName: z.string().optional(),

  // 核心指标 (根据 timeframe 动态计算)
  score: z.number(),           // 当前周期得分/积分
  submissionCount: z.number(), // 当前周期提交数
  accuracyRate: z.number(),    // 准确率
  highValueCount: z.number(),  // 高价值引用数

  // 兼容旧字段 (可选)
  creditCoefficient: z.number().optional(),
  monthlyPoints: z.number().optional(),
});


export const UserIntelStatsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  creditCoefficient: z.number(),
  monthlyPoints: z.number(),
  submissionCount: z.number(),
  accuracyRate: z.number(),
  highValueCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});


// 排行榜响应
// (moved up)

// =============================================
// 统计数据 Schema
// =============================================

export const MarketIntelStatsSchema = z.object({
  totalSubmissions: z.number(),
  todaySubmissions: z.number(),
  avgConfidence: z.number(),
  flaggedCount: z.number(),
  categoryBreakdown: z.array(
    z.object({
      category: z.nativeEnum(IntelCategory),
      count: z.number(),
    }),
  ),
  topTags: z.array(
    z.object({
      tag: z.string(),
      count: z.number(),
    }),
  ),
});

// =============================================
// 导出类型
// =============================================

export type StructuredEvent = z.infer<typeof StructuredEventSchema>;
export type AIAnalysisResult = z.infer<typeof AIAnalysisResultSchema>;
export type QualityScore = z.infer<typeof QualityScoreSchema>;

// 新增：日报解析相关类型
export type ExtractedPricePoint = z.infer<typeof ExtractedPricePointSchema>;
export type MarketSentiment = z.infer<typeof MarketSentimentSchema>;
export type Forecast = z.infer<typeof ForecastSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type DailyReportMeta = z.infer<typeof DailyReportMetaSchema>;

export type CreateMarketIntelDto = z.infer<typeof CreateMarketIntelSchema>;
export type UpdateMarketIntelDto = z.infer<typeof UpdateMarketIntelSchema>;
export type MarketIntelResponse = z.infer<typeof MarketIntelResponseSchema>;
export type MarketIntelQuery = z.infer<typeof MarketIntelQuerySchema>;

export type AnalyzeContentDto = z.infer<typeof AnalyzeContentSchema>;

// =============================================
// 文档升级为研报 Schema (Promote to Report)
// =============================================

export const PromoteToReportSchema = z.object({
  reportType: z.nativeEnum(ReportType).default(ReportType.MARKET),
  triggerDeepAnalysis: z.boolean().default(true),
});

export type PromoteToReportDto = z.infer<typeof PromoteToReportSchema>;

export type UserIntelStats = z.infer<typeof UserIntelStatsSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type MarketIntelStats = z.infer<typeof MarketIntelStatsSchema>;

// =============================================
// A类：价格数据 (PriceData)
// =============================================

// 价格主体类型（谁的价格）
export enum PriceSourceType {
  ENTERPRISE = 'ENTERPRISE',    // 企业收购价
  REGIONAL = 'REGIONAL',        // 地域市场价
  PORT = 'PORT',                // 港口价格
}

// 价格子类型（什么性质的价格）
export enum PriceSubType {
  LISTED = 'LISTED',                  // 挂牌价
  TRANSACTION = 'TRANSACTION',        // 成交价
  ARRIVAL = 'ARRIVAL',                // 到港价
  FOB = 'FOB',                        // 平舱价
  STATION = 'STATION',                // 站台价（标准）
  STATION_ORIGIN = 'STATION_ORIGIN',  // 站台价-产区
  STATION_DEST = 'STATION_DEST',      // 站台价-销区
  PURCHASE = 'PURCHASE',              // 收购价
  WHOLESALE = 'WHOLESALE',            // 批发价
  OTHER = 'OTHER',                    // 其他
}

// 地理层级
export enum GeoLevel {
  COUNTRY = 'COUNTRY',        // 国家级
  REGION = 'REGION',          // 大区
  PROVINCE = 'PROVINCE',      // 省级
  CITY = 'CITY',              // 市级
  DISTRICT = 'DISTRICT',      // 区县级
  PORT = 'PORT',              // 港口
  STATION = 'STATION',        // 站台
  ENTERPRISE = 'ENTERPRISE',  // 企业点位
}

// 数据质量标签（用于连续性健康分析）
export enum PriceQualityTag {
  RAW = 'RAW',              // 原始数据
  IMPUTED = 'IMPUTED',      // 补录/估算
  CORRECTED = 'CORRECTED',  // 修正
  LATE = 'LATE',            // 延迟上报
}

// 数据口径：审核范围
export enum PriceReviewScope {
  APPROVED_ONLY = 'APPROVED_ONLY',
  APPROVED_AND_PENDING = 'APPROVED_AND_PENDING',
  ALL = 'ALL',
}

// 数据口径：数据来源范围
export enum PriceSourceScope {
  AI_ONLY = 'AI_ONLY',
  MANUAL_ONLY = 'MANUAL_ONLY',
  ALL = 'ALL',
}

// 标签映射
export const PRICE_SOURCE_TYPE_LABELS: Record<PriceSourceType, string> = {
  [PriceSourceType.ENTERPRISE]: '企业收购价',
  [PriceSourceType.REGIONAL]: '地域市场价',
  [PriceSourceType.PORT]: '港口价格',
};

export const PRICE_SUB_TYPE_LABELS: Record<PriceSubType, string> = {
  [PriceSubType.LISTED]: '挂牌价',
  [PriceSubType.TRANSACTION]: '成交价',
  [PriceSubType.ARRIVAL]: '到港价',
  [PriceSubType.FOB]: '平舱价',
  [PriceSubType.STATION]: '站台价',
  [PriceSubType.STATION_ORIGIN]: '站台价-产区',
  [PriceSubType.STATION_DEST]: '站台价-销区',
  [PriceSubType.PURCHASE]: '收购价',
  [PriceSubType.WHOLESALE]: '批发价',
  [PriceSubType.OTHER]: '其他',
};

export const GEO_LEVEL_LABELS: Record<GeoLevel, string> = {
  [GeoLevel.COUNTRY]: '国家级',
  [GeoLevel.REGION]: '大区',
  [GeoLevel.PROVINCE]: '省级',
  [GeoLevel.CITY]: '市级',
  [GeoLevel.DISTRICT]: '区县级',
  [GeoLevel.PORT]: '港口',
  [GeoLevel.STATION]: '站台',
  [GeoLevel.ENTERPRISE]: '企业点位',
};

export const PRICE_QUALITY_TAG_LABELS: Record<PriceQualityTag, string> = {
  [PriceQualityTag.RAW]: '原始',
  [PriceQualityTag.IMPUTED]: '补录/估算',
  [PriceQualityTag.CORRECTED]: '修正',
  [PriceQualityTag.LATE]: '延迟',
};

export const CreatePriceDataSchema = z.object({
  // 价格分类
  sourceType: z.nativeEnum(PriceSourceType).optional().default(PriceSourceType.REGIONAL),
  subType: z.nativeEnum(PriceSubType).optional().default(PriceSubType.LISTED),

  // 地理维度
  geoLevel: z.nativeEnum(GeoLevel).optional().default(GeoLevel.CITY),
  location: z.string().min(1, '采集点不能为空'),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  region: z.array(z.string()).optional().default([]),
  longitude: z.number().optional(),
  latitude: z.number().optional(),

  // 企业关联
  // [REMOVED] enterpriseId: z.string().optional(),
  // [REMOVED] enterpriseName: z.string().optional(),

  // 采集点关联（新增）
  collectionPointId: z.string().optional(),

  // 行政区划关联（新增）
  regionCode: z.string().optional(),

  // 品种维度
  effectiveDate: z.coerce.date(),
  commodity: z.string().min(1, '品种不能为空'),
  grade: z.string().optional(),

  // 价格指标
  price: z.number().positive('价格必须为正数'),
  moisture: z.number().min(0).max(100).optional(),
  bulkDensity: z.number().int().positive().optional(),
  toxin: z.number().min(0).optional(),
  freight: z.number().min(0).optional(),
  inventory: z.number().int().min(0).optional(),

  // 备注
  note: z.string().optional(),

  // 关联
  intelId: z.string().optional(),
});

export const PriceDataResponseSchema = z.object({
  id: z.string(),

  // 价格分类
  sourceType: z.nativeEnum(PriceSourceType),
  subType: z.nativeEnum(PriceSubType),

  // 地理维度
  geoLevel: z.nativeEnum(GeoLevel),
  location: z.string(),
  province: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  region: z.array(z.string()),
  longitude: z.number().nullable(),
  latitude: z.number().nullable(),

  // 企业关联 [REMOVED]
  enterpriseId: z.string().nullable().optional(),
  enterpriseName: z.string().nullable().optional(),
  enterprise: z.object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
  }).optional(),

  // 采集点关联（新增）
  collectionPointId: z.string().nullable(),
  collectionPoint: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    type: z.string(),
  }).optional(),

  // 行政区划关联（新增）
  regionCode: z.string().nullable(),

  // 品种维度
  effectiveDate: z.date(),
  commodity: z.string(),
  grade: z.string().nullable(),

  // 价格指标
  price: z.number(),
  moisture: z.number().nullable(),
  bulkDensity: z.number().nullable(),
  toxin: z.number().nullable(),
  freight: z.number().nullable(),
  inventory: z.number().nullable(),

  // 计算列
  foldPrice: z.number().nullable(),
  dayChange: z.number().nullable(),
  yearChange: z.number().nullable(),

  // 备注
  note: z.string().nullable(),
  qualityTag: z.nativeEnum(PriceQualityTag).optional(),

  // 关联
  intelId: z.string().nullable(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PriceDataQuerySchema = z.object({
  sourceType: z.nativeEnum(PriceSourceType).optional(),
  subType: z.nativeEnum(PriceSubType).optional(),
  subTypes: z.array(z.nativeEnum(PriceSubType)).optional(),
  geoLevel: z.nativeEnum(GeoLevel).optional(),
  commodity: z.string().optional(),
  location: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  priority: z.number().int().optional(),
  // enterpriseId: z.string().optional(), [REMOVED]
  // 新增：采集点和行政区划查询
  collectionPointId: z.string().optional(),
  collectionPointIds: z.array(z.string()).default([]),
  regionCode: z.string().optional(),
  pointTypes: z.array(z.string()).optional(),
  qualityTags: z.array(z.nativeEnum(PriceQualityTag)).optional(),
  reviewScope: z.nativeEnum(PriceReviewScope).optional(),
  sourceScope: z.nativeEnum(PriceSourceScope).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreatePriceDataDto = z.infer<typeof CreatePriceDataSchema>;
export type PriceDataResponse = z.infer<typeof PriceDataResponseSchema>;
export type PriceDataQuery = z.infer<typeof PriceDataQuerySchema>;

export const PriceContinuityPointSchema = z.object({
  pointId: z.string(),
  pointName: z.string(),
  pointType: z.string(),
  regionLabel: z.string().nullable().optional(),
  coverageRate: z.number(),
  timelinessScore: z.number(),
  anomalyRate: z.number(),
  lateRate: z.number(),
  score: z.number(),
  grade: z.enum(['A', 'B', 'C', 'D']),
  latestDate: z.coerce.date().nullable(),
  recordCount: z.number().int(),
  missingDays: z.number().int(),
});

export const PriceContinuitySummarySchema = z.object({
  overallScore: z.number(),
  coverageRate: z.number(),
  anomalyRate: z.number(),
  lateRate: z.number(),
  expectedDays: z.number().int(),
  pointCount: z.number().int(),
  healthyPoints: z.number().int(),
  riskPoints: z.number().int(),
  startDate: z.coerce.date().nullable(),
  endDate: z.coerce.date().nullable(),
});

export const PriceContinuityHealthResponseSchema = z.object({
  summary: PriceContinuitySummarySchema,
  points: z.array(PriceContinuityPointSchema),
});

export type PriceContinuityPoint = z.infer<typeof PriceContinuityPointSchema>;
export type PriceContinuitySummary = z.infer<typeof PriceContinuitySummarySchema>;
export type PriceContinuityHealthResponse = z.infer<typeof PriceContinuityHealthResponseSchema>;

// =============================================
// A类：预警中心 (Market Alert)
// =============================================

export enum MarketAlertRuleType {
  DAY_CHANGE_ABS = 'DAY_CHANGE_ABS',
  DAY_CHANGE_PCT = 'DAY_CHANGE_PCT',
  DEVIATION_FROM_MEAN_PCT = 'DEVIATION_FROM_MEAN_PCT',
  CONTINUOUS_DAYS = 'CONTINUOUS_DAYS',
}

export enum MarketAlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum MarketAlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  CLOSED = 'CLOSED',
}

export enum MarketAlertAction {
  CREATE = 'CREATE',
  UPDATE_HIT = 'UPDATE_HIT',
  ACK = 'ACK',
  CLOSE = 'CLOSE',
  REOPEN = 'REOPEN',
  AUTO_CLOSE = 'AUTO_CLOSE',
}

export const MarketAlertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(MarketAlertRuleType),
  threshold: z.number().nullable().optional(),
  days: z.number().int().nullable().optional(),
  direction: z.enum(['UP', 'DOWN', 'BOTH']).nullable().optional(),
  severity: z.nativeEnum(MarketAlertSeverity),
  priority: z.number().int(),
  isActive: z.boolean(),
  legacyRuleId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateMarketAlertRuleSchema = z.object({
  name: z.string().min(1, '规则名称不能为空'),
  type: z.nativeEnum(MarketAlertRuleType),
  threshold: z.number().positive().optional(),
  days: z.number().int().min(2).optional(),
  direction: z.enum(['UP', 'DOWN', 'BOTH']).optional().default('BOTH'),
  severity: z.nativeEnum(MarketAlertSeverity).optional().default(MarketAlertSeverity.MEDIUM),
  priority: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const UpdateMarketAlertRuleSchema = CreateMarketAlertRuleSchema.partial();

export const MarketAlertSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  ruleType: z.nativeEnum(MarketAlertRuleType),
  severity: z.nativeEnum(MarketAlertSeverity),
  status: z.nativeEnum(MarketAlertStatus),
  pointId: z.string(),
  pointName: z.string(),
  pointType: z.string(),
  regionLabel: z.string().nullable().optional(),
  commodity: z.string(),
  triggerDate: z.date(),
  firstTriggeredAt: z.date(),
  lastTriggeredAt: z.date(),
  triggerValue: z.number(),
  thresholdValue: z.number(),
  message: z.string(),
  note: z.string().nullable().optional(),
  closedReason: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const MarketAlertStatusLogSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  action: z.nativeEnum(MarketAlertAction),
  fromStatus: z.nativeEnum(MarketAlertStatus).nullable().optional(),
  toStatus: z.nativeEnum(MarketAlertStatus),
  operator: z.string(),
  note: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  meta: z.any().nullable().optional(),
  createdAt: z.date(),
});

export const AlertListResponseSchema = z.object({
  total: z.number().int(),
  data: z.array(MarketAlertSchema),
});

export const EvaluateAlertsResponseSchema = z.object({
  evaluatedAt: z.date(),
  total: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  closed: z.number().int().optional(),
});

export const UpdateAlertStatusRequestSchema = z.object({
  status: z.nativeEnum(MarketAlertStatus),
  note: z.string().optional(),
  reason: z.string().optional(),
  operator: z.string().optional(),
});

export type MarketAlertRule = z.infer<typeof MarketAlertRuleSchema>;
export type CreateMarketAlertRuleDto = z.infer<typeof CreateMarketAlertRuleSchema>;
export type UpdateMarketAlertRuleDto = z.infer<typeof UpdateMarketAlertRuleSchema>;
export type MarketAlert = z.infer<typeof MarketAlertSchema>;
export type MarketAlertStatusLog = z.infer<typeof MarketAlertStatusLogSchema>;
export type AlertListResponse = z.infer<typeof AlertListResponseSchema>;
export type EvaluateAlertsResponse = z.infer<typeof EvaluateAlertsResponseSchema>;
export type UpdateAlertStatusRequest = z.infer<typeof UpdateAlertStatusRequestSchema>;

// =============================================
// C类：附件 (IntelAttachment)
// =============================================

export const CreateIntelAttachmentSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  storagePath: z.string().min(1),
  ocrText: z.string().optional(),
  intelId: z.string(),
});

export const IntelAttachmentResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  storagePath: z.string(),
  ocrText: z.string().nullable(),
  intelId: z.string(),
  createdAt: z.date(),
});

export type CreateIntelAttachmentDto = z.infer<typeof CreateIntelAttachmentSchema>;
export type IntelAttachmentResponse = z.infer<typeof IntelAttachmentResponseSchema>;

// =============================================
// C类增强：研究报告 (ResearchReport)
// =============================================

export const CreateResearchReportSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  reportType: z.nativeEnum(ReportType),
  reportPeriod: z.nativeEnum(ReportPeriod).optional(), // 新增字段
  publishDate: z.coerce.date().optional(),
  source: z.string().optional(),
  summary: z.string().min(1, '摘要不能为空'),

  // JSON 字段结构化验证
  keyPoints: z.array(z.object({
    point: z.string(),
    sentiment: z.string().optional(),
    confidence: z.number().optional(),
  })).optional(),

  prediction: z.object({
    direction: z.string().optional(),
    timeframe: z.string().optional(),
    reasoning: z.string().optional(),
  }).optional(),

  dataPoints: z.array(z.object({
    metric: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    period: z.string().optional(),
  })).optional(),

  commodities: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  timeframe: z.string().optional(),
  intelId: z.string().uuid('关联情报ID无效'),
});

// 手工创建研报 Schema
export const CreateManualResearchReportSchema = CreateResearchReportSchema.omit({ intelId: true }).extend({
  intelId: z.string().optional(),
});

export const UpdateResearchReportSchema = CreateResearchReportSchema.partial().omit({ intelId: true });

export const ResearchReportResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  reportType: z.nativeEnum(ReportType),
  publishDate: z.date().nullable(),
  source: z.string().nullable(),
  summary: z.string(),
  keyPoints: z.any().nullable(),
  prediction: z.any().nullable(),
  dataPoints: z.any().nullable(),
  commodities: z.array(z.string()),
  regions: z.array(z.string()),
  timeframe: z.string().nullable(),

  // 版本管理
  version: z.number().default(1),
  previousVersionId: z.string().nullable(),

  // 审核状态
  reviewStatus: z.nativeEnum(ReviewStatus).default(ReviewStatus.PENDING),
  reviewedById: z.string().nullable(),
  reviewedAt: z.date().nullable(),

  // 阅读统计
  viewCount: z.number().default(0),
  downloadCount: z.number().default(0),

  intelId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ResearchReportQuerySchema = z.object({
  reportType: z.nativeEnum(ReportType).optional(),
  reviewStatus: z.nativeEnum(ReviewStatus).optional(),
  commodity: z.string().optional(),
  region: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  keyword: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreateResearchReportDto = z.infer<typeof CreateResearchReportSchema>;
export type CreateManualResearchReportDto = z.infer<typeof CreateManualResearchReportSchema>;
export type UpdateResearchReportDto = z.infer<typeof UpdateResearchReportSchema>;
export type ResearchReportResponse = z.infer<typeof ResearchReportResponseSchema>;
export type ResearchReportQuery = z.infer<typeof ResearchReportQuerySchema>;


// =============================================
// D类：实体关联 -> [RENAMED] 采集点关联 (IntelPointLink)
// =============================================

export enum IntelPointLinkType {
  MENTIONED = 'MENTIONED',
  SUBJECT = 'SUBJECT',
  SOURCE = 'SOURCE',
}

// INTEL_POINT_LINK_TYPE_LABELS 已移至 apps/web/src/constants/technicalEnums.ts

export const CreateIntelPointLinkSchema = z.object({
  intelId: z.string(),
  collectionPointId: z.string(),
  linkType: z.nativeEnum(IntelPointLinkType).optional().default(IntelPointLinkType.MENTIONED),
});

export const IntelPointLinkResponseSchema = z.object({
  id: z.string(),
  intelId: z.string(),
  collectionPointId: z.string(),
  linkType: z.nativeEnum(IntelPointLinkType),
  createdAt: z.date(),
  collectionPoint: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })
    .optional(),
});

export type CreateIntelPointLinkDto = z.infer<typeof CreateIntelPointLinkSchema>;
export type IntelPointLinkResponse = z.infer<typeof IntelPointLinkResponseSchema>;

// =============================================
// 任务调度 (IntelTask)
// =============================================

// 任务类型枚举（简化，全局复用）
export enum IntelTaskType {
  COLLECTION = 'COLLECTION',   // 采集任务
  REPORT = 'REPORT',           // 报告任务
  RESEARCH = 'RESEARCH',       // 调研任务
  VERIFICATION = 'VERIFICATION', // 核实任务
  OTHER = 'OTHER',             // 其他
}

export enum IntelTaskStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED', // 已提交待审核
  RETURNED = 'RETURNED',   // 已驳回需修改
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED', // 已取消
}

export enum IntelTaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TaskCycleType {
  DAILY = 'DAILY',     // 每日
  WEEKLY = 'WEEKLY',   // 每周
  MONTHLY = 'MONTHLY', // 每月
  ONE_TIME = 'ONE_TIME', // 一次性
}

export enum TaskScheduleMode {
  POINT_DEFAULT = 'POINT_DEFAULT',
  TEMPLATE_OVERRIDE = 'TEMPLATE_OVERRIDE',
}

export const INTEL_TASK_TYPE_LABELS: Record<IntelTaskType, string> = {
  [IntelTaskType.COLLECTION]: '采集任务',
  [IntelTaskType.REPORT]: '报告任务',
  [IntelTaskType.RESEARCH]: '调研任务',
  [IntelTaskType.VERIFICATION]: '核实任务',
  [IntelTaskType.OTHER]: '其他',
};

// INTEL_TASK_STATUS_LABELS 已移至 apps/web/src/constants/statusEnums.ts

export const INTEL_TASK_PRIORITY_LABELS: Record<IntelTaskPriority, string> = {
  [IntelTaskPriority.LOW]: '低',
  [IntelTaskPriority.MEDIUM]: '中',
  [IntelTaskPriority.HIGH]: '高',
  [IntelTaskPriority.URGENT]: '紧急',
};

// TASK_CYCLE_TYPE_LABELS 已移至 apps/web/src/constants/statusEnums.ts

// 任务 Schema
export const CreateIntelTaskSchema = z.object({
  title: z.string().min(1, '任务标题不能为空'),
  description: z.string().optional(),
  requirements: z.string().optional(),
  attachmentUrls: z.array(z.string()).optional(),
  notifyConfig: z.any().optional(),
  type: z.nativeEnum(IntelTaskType),
  priority: z.nativeEnum(IntelTaskPriority).optional().default(IntelTaskPriority.MEDIUM),
  deadline: z.coerce.date(),
  assigneeId: z.string(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  periodKey: z.string().optional(),
  assigneeOrgId: z.string().optional(),
  assigneeDeptId: z.string().optional(),
  isLate: z.boolean().optional(),
  templateId: z.string().optional(),
  collectionPointId: z.string().optional(),
  commodity: z.string().optional(),
  priceSubmissionId: z.string().optional(),
  taskGroupId: z.string().optional(),
  ruleId: z.string().optional(),
  formId: z.string().optional(),
  workflowId: z.string().optional(),
});

export const UpdateIntelTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  attachmentUrls: z.array(z.string()).optional(),
  notifyConfig: z.any().optional(),
  priority: z.nativeEnum(IntelTaskPriority).optional(),
  deadline: z.coerce.date().optional(),
  status: z.nativeEnum(IntelTaskStatus).optional(),
  completedAt: z.coerce.date().optional(),
  intelId: z.string().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  periodKey: z.string().optional(),
  assigneeOrgId: z.string().optional(),
  assigneeDeptId: z.string().optional(),
  isLate: z.boolean().optional(),
  templateId: z.string().optional(),
  collectionPointId: z.string().optional(),
  commodity: z.string().optional(),
  priceSubmissionId: z.string().optional(),
  taskGroupId: z.string().optional(),
  ruleId: z.string().optional(),
  formId: z.string().optional(),
  workflowId: z.string().optional(),
});

export const IntelTaskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  requirements: z.string().nullable(),
  attachmentUrls: z.array(z.string()),
  notifyConfig: z.any().nullable(),
  type: z.nativeEnum(IntelTaskType),
  priority: z.nativeEnum(IntelTaskPriority),
  deadline: z.date(),
  periodStart: z.date().nullable(),
  periodEnd: z.date().nullable(),
  dueAt: z.date().nullable(),
  periodKey: z.string().nullable(),
  assigneeId: z.string(),
  assigneeOrgId: z.string().nullable(),
  assigneeDeptId: z.string().nullable(),
  templateId: z.string().nullable(),
  collectionPointId: z.string().nullable(),
  commodity: z.string().nullable(),
  priceSubmissionId: z.string().nullable(),
  taskGroupId: z.string().nullable(),
  ruleId: z.string().nullable(),
  formId: z.string().nullable(),
  workflowId: z.string().nullable(),
  createdById: z.string().nullable(),
  status: z.nativeEnum(IntelTaskStatus),
  completedAt: z.date().nullable(),
  isLate: z.boolean().default(false),
  intelId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  assignee: z
    .object({
      id: z.string(),
      name: z.string(),
      avatar: z.string().nullable(),
    })
    .optional(),
});

export const IntelTaskQuerySchema = z.object({
  assigneeId: z.string().optional(),
  assigneeOrgId: z.string().optional(),
  assigneeDeptId: z.string().optional(),
  status: z.nativeEnum(IntelTaskStatus).optional(),
  type: z.nativeEnum(IntelTaskType).optional(),
  priority: z.nativeEnum(IntelTaskPriority).optional(),
  groupBy: z.enum(['USER', 'DEPT', 'ORG']).optional(),
  periodKey: z.string().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  dueStart: z.coerce.date().optional(),
  dueEnd: z.coerce.date().optional(),
  metricsStart: z.coerce.date().optional(),
  metricsEnd: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(2000).default(20),
});

// 任务模板 Schema
export const CreateIntelTaskTemplateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空'),
  description: z.string().optional(),
  taskType: z.nativeEnum(IntelTaskType),
  priority: z.nativeEnum(IntelTaskPriority).default(IntelTaskPriority.MEDIUM),
  domain: z.string().optional(),
  scheduleMode: z.nativeEnum(TaskScheduleMode).default(TaskScheduleMode.TEMPLATE_OVERRIDE),

  // 周期配置
  cycleType: z.nativeEnum(TaskCycleType).default(TaskCycleType.ONE_TIME),
  // Legacy cycleConfig (deprecated)
  cycleConfig: z.record(z.any()).optional(),
  deadlineOffset: z.number().min(1).default(24), // 截止时间偏移（小时）
  activeFrom: z.coerce.date().optional(),
  activeUntil: z.coerce.date().optional(),
  timezone: z.string().default('Asia/Shanghai'),
  runAtMinute: z.number().min(0).max(1439).default(540),
  runDayOfWeek: z.number().min(1).max(7).optional(),
  runDayOfMonth: z.number().min(0).max(31).optional(),
  dueAtMinute: z.number().min(0).max(1439).default(1080),
  dueDayOfWeek: z.number().min(1).max(7).optional(),
  dueDayOfMonth: z.number().min(0).max(31).optional(),
  allowLate: z.boolean().default(true),
  maxBackfillPeriods: z.number().min(0).max(365).default(3),

  // 分配规则
  assigneeMode: z.enum(['MANUAL', 'ALL_ACTIVE', 'BY_DEPARTMENT', 'BY_ORGANIZATION', 'BY_COLLECTION_POINT']).default('MANUAL'),
  assigneeIds: z.array(z.string()).default([]),
  departmentIds: z.array(z.string()).default([]),
  organizationIds: z.array(z.string()).default([]),
  collectionPointIds: z.array(z.string()).default([]),
  targetPointTypes: z.array(z.nativeEnum(CollectionPointType)).optional().default([]),
  targetPointType: z.nativeEnum(CollectionPointType).optional(),
  collectionPointId: z.string().optional(),

  isActive: z.boolean().default(true),
});

export const UpdateIntelTaskTemplateSchema = CreateIntelTaskTemplateSchema.partial();

export const IntelTaskTemplateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  taskType: z.nativeEnum(IntelTaskType),
  priority: z.nativeEnum(IntelTaskPriority),
  domain: z.string().nullable(),
  scheduleMode: z.nativeEnum(TaskScheduleMode),
  cycleType: z.nativeEnum(TaskCycleType),
  cycleConfig: z.any().nullable(),
  deadlineOffset: z.number(),
  activeFrom: z.date(),
  activeUntil: z.date().nullable(),
  timezone: z.string(),
  runAtMinute: z.number(),
  runDayOfWeek: z.number().nullable(),
  runDayOfMonth: z.number().nullable(),
  dueAtMinute: z.number(),
  dueDayOfWeek: z.number().nullable(),
  dueDayOfMonth: z.number().nullable(),
  allowLate: z.boolean(),
  maxBackfillPeriods: z.number(),
  assigneeMode: z.string(),
  assigneeIds: z.array(z.string()),
  departmentIds: z.array(z.string()),
  organizationIds: z.array(z.string()),
  collectionPointIds: z.array(z.string()).optional(),
  targetPointTypes: z.array(z.nativeEnum(CollectionPointType)).optional(),
  targetPointType: z.nativeEnum(CollectionPointType).optional(),
  collectionPointId: z.string().optional(),
  isActive: z.boolean(),
  lastRunAt: z.date().nullable(),
  nextRunAt: z.date().nullable(),
  createdById: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// 任务规则枚举（前后端通用）
export enum IntelTaskRuleScopeType {
  POINT = 'POINT',
  USER = 'USER',
  DEPARTMENT = 'DEPARTMENT',
  ORGANIZATION = 'ORGANIZATION',
  ROLE = 'ROLE',
  QUERY = 'QUERY',
}

export enum IntelTaskAssigneeStrategy {
  POINT_OWNER = 'POINT_OWNER',
  ROTATION = 'ROTATION',
  BALANCED = 'BALANCED',
  USER_POOL = 'USER_POOL',
}

export enum IntelTaskCompletionPolicy {
  EACH = 'EACH',
  ANY_ONE = 'ANY_ONE',
  QUORUM = 'QUORUM',
  ALL = 'ALL',
}

// 任务规则 Schema
export const CreateIntelTaskRuleSchema = z.object({
  templateId: z.string(),
  scopeType: z.nativeEnum(IntelTaskRuleScopeType),
  scopeQuery: z.any().optional(),
  frequencyType: z.nativeEnum(TaskCycleType).default(TaskCycleType.DAILY),
  weekdays: z.array(z.number().min(1).max(7)).optional().default([]),
  monthDays: z.array(z.number().min(0).max(31)).optional().default([]),
  dispatchAtMinute: z.number().min(0).max(1439).optional().default(540),
  duePolicy: z.any().optional(),
  assigneeStrategy: z.nativeEnum(IntelTaskAssigneeStrategy).default(IntelTaskAssigneeStrategy.POINT_OWNER),
  completionPolicy: z.nativeEnum(IntelTaskCompletionPolicy).default(IntelTaskCompletionPolicy.EACH),
  grouping: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const UpdateIntelTaskRuleSchema = CreateIntelTaskRuleSchema.partial();

export const IntelTaskRuleResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  scopeType: z.nativeEnum(IntelTaskRuleScopeType),
  scopeQuery: z.any().nullable(),
  frequencyType: z.nativeEnum(TaskCycleType),
  weekdays: z.array(z.number()),
  monthDays: z.array(z.number()),
  dispatchAtMinute: z.number(),
  duePolicy: z.any().nullable(),
  assigneeStrategy: z.nativeEnum(IntelTaskAssigneeStrategy),
  completionPolicy: z.nativeEnum(IntelTaskCompletionPolicy),
  grouping: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const GetRuleMetricsSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const RuleMetricsItemSchema = z.object({
  ruleId: z.string(),
  total: z.number(),
  completed: z.number(),
  pending: z.number(),
  submitted: z.number(),
  returned: z.number(),
  overdue: z.number(),
  late: z.number(),
  lastCreatedAt: z.date().nullable().optional(),
});

export const RuleMetricsDailySchema = z.object({
  ruleId: z.string(),
  date: z.string(),
  total: z.number(),
  completed: z.number(),
  overdue: z.number(),
});

export const IntelTaskRuleMetricsResponseSchema = z.object({
  rangeStart: z.date(),
  rangeEnd: z.date(),
  rules: z.array(RuleMetricsItemSchema),
  daily: z.array(RuleMetricsDailySchema),
});

// 任务组 Schema
export const IntelTaskGroupResponseSchema = z.object({
  id: z.string(),
  templateId: z.string().nullable(),
  ruleId: z.string().nullable(),
  status: z.string(),
  groupKey: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// 批量分发 Schema
export const BatchDistributeTasksSchema = z.object({
  templateId: z.string(),
  assigneeIds: z.array(z.string()).optional(), // 如果不传，则使用模板定义的规则
  overrideDeadline: z.coerce.date().optional(), // 覆盖模板计算的截止时间
});

export type CreateIntelTaskDto = z.infer<typeof CreateIntelTaskSchema>;
export type UpdateIntelTaskDto = z.infer<typeof UpdateIntelTaskSchema>;
export type IntelTaskResponse = z.infer<typeof IntelTaskResponseSchema>;
export type IntelTaskQuery = z.infer<typeof IntelTaskQuerySchema>;

export type CreateIntelTaskTemplateDto = z.infer<typeof CreateIntelTaskTemplateSchema>;
export type UpdateIntelTaskTemplateDto = z.infer<typeof UpdateIntelTaskTemplateSchema>;
export type IntelTaskTemplateResponse = z.infer<typeof IntelTaskTemplateResponseSchema>;
export type BatchDistributeTasksDto = z.infer<typeof BatchDistributeTasksSchema>;
export type CreateIntelTaskRuleDto = z.infer<typeof CreateIntelTaskRuleSchema>;
export type UpdateIntelTaskRuleDto = z.infer<typeof UpdateIntelTaskRuleSchema>;
export type IntelTaskRuleResponse = z.infer<typeof IntelTaskRuleResponseSchema>;
export type IntelTaskGroupResponse = z.infer<typeof IntelTaskGroupResponseSchema>;
export type GetRuleMetricsDto = z.infer<typeof GetRuleMetricsSchema>;
export type IntelTaskRuleMetricsResponse = z.infer<typeof IntelTaskRuleMetricsResponseSchema>;

// =============================================
// 任务分发预览 Schema
// =============================================

export const DistributionPreviewResponseSchema = z.object({
  totalTasks: z.number(),
  totalAssignees: z.number(),
  assignees: z.array(z.object({
    userId: z.string(),
    userName: z.string(),
    departmentName: z.string().optional(),
    organizationName: z.string().optional(),
    collectionPoints: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
    })).optional(),
    taskCount: z.number(),
  })),
  unassignedPoints: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  })).optional(),
});

export type DistributionPreviewResponse = z.infer<typeof DistributionPreviewResponseSchema>;

// =============================================
// 任务历史记录 Schema
// =============================================

export const IntelTaskHistorySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  operatorId: z.string(),
  action: z.string(),
  details: z.any().nullable(),
  createdAt: z.date(),
  operator: z.object({
    id: z.string(),
    name: z.string(),
    avatar: z.string().nullable(),
  }).optional(),
});

export type IntelTaskHistory = z.infer<typeof IntelTaskHistorySchema>;

// =============================================
// 日历任务预览 Schema (Virtual Tasks)
// =============================================

export const GetCalendarPreviewSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  assigneeId: z.string().optional(),
  assigneeOrgId: z.string().optional(),
  assigneeDeptId: z.string().optional(),
});

export const CalendarPreviewTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.nativeEnum(IntelTaskType),
  priority: z.nativeEnum(IntelTaskPriority),
  status: z.string(), // 'PREVIEW'
  deadline: z.date(),
  dueAt: z.date().nullable().optional(),
  isPreview: z.literal(true),
  templateId: z.string(),
  assigneeId: z.string().nullable().optional(),
});

// =============================================
// 日历任务聚合 Schema
// =============================================

export const GetCalendarSummarySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  assigneeId: z.string().optional(),
  assigneeOrgId: z.string().optional(),
  assigneeDeptId: z.string().optional(),
  status: z.nativeEnum(IntelTaskStatus).optional(),
  type: z.nativeEnum(IntelTaskType).optional(),
  priority: z.nativeEnum(IntelTaskPriority).optional(),
  includePreview: z.coerce.boolean().optional(),
});

export const CalendarSummaryItemSchema = z.object({
  date: z.string(),
  total: z.number(),
  completed: z.number(),
  overdue: z.number(),
  urgent: z.number(),
  preview: z.number().optional(),
  byType: z.record(z.number()).optional(),
  byPriority: z.record(z.number()).optional(),
});

export const CalendarSummaryTypeStatSchema = z.object({
  type: z.nativeEnum(IntelTaskType),
  total: z.number(),
  URGENT: z.number(),
  HIGH: z.number(),
  MEDIUM: z.number(),
  LOW: z.number(),
});

export const CalendarSummaryResponseSchema = z.object({
  summary: z.array(CalendarSummaryItemSchema),
  typeStats: z.array(CalendarSummaryTypeStatSchema),
});

export type GetCalendarPreviewDto = z.infer<typeof GetCalendarPreviewSchema>;
export type CalendarPreviewTask = z.infer<typeof CalendarPreviewTaskSchema>;
export type GetCalendarSummaryDto = z.infer<typeof GetCalendarSummarySchema>;
export type CalendarSummaryItem = z.infer<typeof CalendarSummaryItemSchema>;
export type CalendarSummaryTypeStat = z.infer<typeof CalendarSummaryTypeStatSchema>;
export type CalendarSummaryResponse = z.infer<typeof CalendarSummaryResponseSchema>;

// =============================================
// 全景检索：聚合搜索 (Universal Search)
// =============================================

export const UniversalSearchQuerySchema = z.object({
  keyword: z.string().min(1, '搜索关键词不能为空'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  commodities: z.array(z.string()).optional(),
  sourceTypes: z.array(z.nativeEnum(IntelSourceType)).optional(),
  regionCodes: z.array(z.string()).optional(),
  pricePageSize: z.coerce.number().min(1).max(100).default(20),
  intelPageSize: z.coerce.number().min(1).max(50).default(10),
  docPageSize: z.coerce.number().min(1).max(50).default(10),
});

export const UniversalSearchSummarySchema = z.object({
  priceRange: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    avg: z.number().nullable(),
  }),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  topTags: z.array(z.string()),
  entityMentions: z.array(z.string()),
  totalResults: z.number(),
});

export const UniversalSearchResponseSchema = z.object({
  prices: z.object({
    data: z.array(PriceDataResponseSchema),
    total: z.number(),
  }),
  intels: z.object({
    data: z.array(MarketIntelResponseSchema),
    total: z.number(),
  }),
  docs: z.object({
    data: z.array(MarketIntelResponseSchema),
    total: z.number(),
  }),
  summary: UniversalSearchSummarySchema,
});

export type UniversalSearchQuery = z.infer<typeof UniversalSearchQuerySchema>;
export type UniversalSearchSummary = z.infer<typeof UniversalSearchSummarySchema>;
export type UniversalSearchResponse = z.infer<typeof UniversalSearchResponseSchema>;
