import { z } from 'zod';

// =============================================
// 枚举定义 (与 Prisma Schema 保持同步)
// =============================================

export enum IntelCategory {
  A_STRUCTURED = 'A_STRUCTURED',
  B_SEMI_STRUCTURED = 'B_SEMI_STRUCTURED',
  C_DOCUMENT = 'C_DOCUMENT',
  D_ENTITY = 'D_ENTITY',
}

export enum IntelSourceType {
  FIRST_LINE = 'FIRST_LINE',
  COMPETITOR = 'COMPETITOR',
  OFFICIAL = 'OFFICIAL',
}

// 枚举标签映射
export const INTEL_CATEGORY_LABELS: Record<IntelCategory, string> = {
  [IntelCategory.A_STRUCTURED]: 'A类：标准化硬数据 (价格/库存)',
  [IntelCategory.B_SEMI_STRUCTURED]: 'B类：半结构化情报 (心态/事件)',
  [IntelCategory.C_DOCUMENT]: 'C类：文档与图表 (研报/政策)',
  [IntelCategory.D_ENTITY]: 'D类：实体档案 (企业画像)',
};

export const INTEL_SOURCE_TYPE_LABELS: Record<IntelSourceType, string> = {
  [IntelSourceType.FIRST_LINE]: '一线采集',
  [IntelSourceType.COMPETITOR]: '竞对情报',
  [IntelSourceType.OFFICIAL]: '官方发布',
};

// =============================================
// AI 分析结果 Schema
// =============================================

export const StructuredEventSchema = z.object({
  subject: z.string().optional(),
  action: z.string().optional(),
  impact: z.string().optional(),
  commodity: z.string().optional(),
  regionCode: z.string().optional(),
  sourceText: z.string().optional(),
  sourceStart: z.number().optional(),
  sourceEnd: z.number().optional(),
});

// 提取的价格点（从日报中批量提取）
export const ExtractedPricePointSchema = z.object({
  location: z.string(),           // 采集点名称（锦州港/梅花味精等）
  price: z.number(),              // 价格
  change: z.number().nullable(),  // 涨跌幅
  unit: z.string().default('元/吨'),
  commodity: z.string().optional(), // 品种（默认从上下文推断）
  grade: z.string().optional(),     // 等级

  // ===== 价格分类 =====
  sourceType: z.enum(['ENTERPRISE', 'REGIONAL', 'PORT']).optional(), // 价格主体类型
  subType: z.enum(['LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER']).optional(), // 价格子类型
  geoLevel: z.enum(['COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE']).optional(), // 地理层级

  // ===== 采集点关联（新增）=====
  collectionPointId: z.string().optional(),    // 匹配到的采集点ID
  collectionPointCode: z.string().optional(),  // 采集点编码

  // ===== 行政区划关联（新增）=====
  regionCode: z.string().optional(),           // 标准行政区划代码（如 210700 锦州市）
  regionName: z.string().optional(),           // 行政区划名称

  // 企业信息（企业价格时填充）
  enterpriseName: z.string().optional(),  // 企业名称
  enterpriseId: z.string().optional(),    // 系统中的企业ID（如果能匹配）

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

// 日报分段（保留原始结构）
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

  // 原文分段（便于检索和展示）
  sections: z.array(ReportSectionSchema).optional(),

  // 提取的事件列表（B类扩展）
  events: z.array(StructuredEventSchema).optional(),
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
    IntelCategory.C_DOCUMENT,
    IntelCategory.D_ENTITY
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
});

// =============================================
// AI 分析请求 Schema
// =============================================

export const AnalyzeContentSchema = z.object({
  content: z.string().optional(),
  category: z.nativeEnum(IntelCategory),
  location: z.string().optional(),
  base64Image: z.string().optional(),
  mimeType: z.string().optional(),
});

// =============================================
// 情报员统计 Schema
// =============================================

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
export const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  userId: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
  role: z.string().nullable(),
  region: z.string().nullable(),
  creditCoefficient: z.number(),
  monthlyPoints: z.number(),
  submissionCount: z.number(),
  accuracyRate: z.number(),
  highValueCount: z.number(),
});

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
  enterpriseId: z.string().optional(),
  enterpriseName: z.string().optional(),

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

  // 企业关联
  enterpriseId: z.string().nullable(),
  enterpriseName: z.string().nullable(),
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

  // 关联
  intelId: z.string().nullable(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PriceDataQuerySchema = z.object({
  sourceType: z.nativeEnum(PriceSourceType).optional(),
  subType: z.nativeEnum(PriceSubType).optional(),
  geoLevel: z.nativeEnum(GeoLevel).optional(),
  commodity: z.string().optional(),
  location: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  enterpriseId: z.string().optional(),
  // 新增：采集点和行政区划查询
  collectionPointId: z.string().optional(),
  regionCode: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreatePriceDataDto = z.infer<typeof CreatePriceDataSchema>;
export type PriceDataResponse = z.infer<typeof PriceDataResponseSchema>;
export type PriceDataQuery = z.infer<typeof PriceDataQuerySchema>;

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
// D类：实体关联 (IntelEntityLink)
// =============================================

export enum IntelEntityLinkType {
  MENTIONED = 'MENTIONED',
  SUBJECT = 'SUBJECT',
  SOURCE = 'SOURCE',
}

export const INTEL_ENTITY_LINK_TYPE_LABELS: Record<IntelEntityLinkType, string> = {
  [IntelEntityLinkType.MENTIONED]: '被提及',
  [IntelEntityLinkType.SUBJECT]: '情报主体',
  [IntelEntityLinkType.SOURCE]: '情报来源',
};

export const CreateIntelEntityLinkSchema = z.object({
  intelId: z.string(),
  enterpriseId: z.string(),
  linkType: z.nativeEnum(IntelEntityLinkType).optional().default(IntelEntityLinkType.MENTIONED),
});

export const IntelEntityLinkResponseSchema = z.object({
  id: z.string(),
  intelId: z.string(),
  enterpriseId: z.string(),
  linkType: z.nativeEnum(IntelEntityLinkType),
  createdAt: z.date(),
  enterprise: z
    .object({
      id: z.string(),
      name: z.string(),
      shortName: z.string().nullable(),
    })
    .optional(),
});

export type CreateIntelEntityLinkDto = z.infer<typeof CreateIntelEntityLinkSchema>;
export type IntelEntityLinkResponse = z.infer<typeof IntelEntityLinkResponseSchema>;

// =============================================
// 任务调度 (IntelTask)
// =============================================

export enum IntelTaskType {
  PRICE_REPORT = 'PRICE_REPORT',
  FIELD_CHECK = 'FIELD_CHECK',
  DOCUMENT_SCAN = 'DOCUMENT_SCAN',
}

export enum IntelTaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
}

export const INTEL_TASK_TYPE_LABELS: Record<IntelTaskType, string> = {
  [IntelTaskType.PRICE_REPORT]: '价格上报',
  [IntelTaskType.FIELD_CHECK]: '现场确认',
  [IntelTaskType.DOCUMENT_SCAN]: '文档采集',
};

export const INTEL_TASK_STATUS_LABELS: Record<IntelTaskStatus, string> = {
  [IntelTaskStatus.PENDING]: '待完成',
  [IntelTaskStatus.COMPLETED]: '已完成',
  [IntelTaskStatus.OVERDUE]: '已超时',
};

export const CreateIntelTaskSchema = z.object({
  title: z.string().min(1, '任务标题不能为空'),
  type: z.nativeEnum(IntelTaskType),
  deadline: z.coerce.date(),
  assigneeId: z.string(),
});

export const UpdateIntelTaskSchema = z.object({
  status: z.nativeEnum(IntelTaskStatus).optional(),
  completedAt: z.coerce.date().optional(),
  intelId: z.string().optional(),
});

export const IntelTaskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.nativeEnum(IntelTaskType),
  deadline: z.date(),
  assigneeId: z.string(),
  status: z.nativeEnum(IntelTaskStatus),
  completedAt: z.date().nullable(),
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
  status: z.nativeEnum(IntelTaskStatus).optional(),
  type: z.nativeEnum(IntelTaskType).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type CreateIntelTaskDto = z.infer<typeof CreateIntelTaskSchema>;
export type UpdateIntelTaskDto = z.infer<typeof UpdateIntelTaskSchema>;
export type IntelTaskResponse = z.infer<typeof IntelTaskResponseSchema>;
export type IntelTaskQuery = z.infer<typeof IntelTaskQuerySchema>;
