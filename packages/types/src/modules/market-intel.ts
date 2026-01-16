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
});

export const AIAnalysisResultSchema = z.object({
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

export const CreatePriceDataSchema = z.object({
  effectiveDate: z.coerce.date(),
  commodity: z.string().min(1, '品种不能为空'),
  grade: z.string().optional(),
  location: z.string().min(1, '采集点不能为空'),
  region: z.array(z.string()).optional().default([]),
  price: z.number().positive('价格必须为正数'),
  moisture: z.number().min(0).max(100).optional(),
  bulkDensity: z.number().int().positive().optional(),
  toxin: z.number().min(0).optional(),
  freight: z.number().min(0).optional(),
  inventory: z.number().int().min(0).optional(),
  intelId: z.string().optional(),
});

export const PriceDataResponseSchema = z.object({
  id: z.string(),
  effectiveDate: z.date(),
  commodity: z.string(),
  grade: z.string().nullable(),
  location: z.string(),
  region: z.array(z.string()),
  price: z.number(),
  moisture: z.number().nullable(),
  bulkDensity: z.number().nullable(),
  toxin: z.number().nullable(),
  freight: z.number().nullable(),
  inventory: z.number().nullable(),
  foldPrice: z.number().nullable(),
  dayChange: z.number().nullable(),
  yearChange: z.number().nullable(),
  intelId: z.string().nullable(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PriceDataQuerySchema = z.object({
  commodity: z.string().optional(),
  location: z.string().optional(),
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
