import { z } from 'zod';

// =============================================
// 采集点分配与价格填报枚举
// =============================================

// 注：AllocationRole 已简化移除，采集点分配统一为"负责人"角色
// 保留导出以兼容旧代码，后续可逐步移除
export enum AllocationRole {
  PRIMARY = 'PRIMARY',       // 负责人（统一角色）
}

export const ALLOCATION_ROLE_LABELS: Record<AllocationRole, string> = {
  [AllocationRole.PRIMARY]: '负责人',
};

// 价格录入方式
export enum PriceInputMethod {
  AI_EXTRACTED = 'AI_EXTRACTED',     // 智能采集（AI从日报提取）
  MANUAL_ENTRY = 'MANUAL_ENTRY',     // 手动填报（业务人员录入）
  BULK_IMPORT = 'BULK_IMPORT',       // 批量导入（Excel/CSV）
}

export const PRICE_INPUT_METHOD_LABELS: Record<PriceInputMethod, string> = {
  [PriceInputMethod.AI_EXTRACTED]: '智能采集',
  [PriceInputMethod.MANUAL_ENTRY]: '手动填报',
  [PriceInputMethod.BULK_IMPORT]: '批量导入',
};

// 价格审核状态
export enum PriceReviewStatus {
  PENDING = 'PENDING',           // 待审核
  APPROVED = 'APPROVED',         // 已通过
  REJECTED = 'REJECTED',         // 已拒绝
  AUTO_APPROVED = 'AUTO_APPROVED', // 自动通过
}

export const PRICE_REVIEW_STATUS_LABELS: Record<PriceReviewStatus, string> = {
  [PriceReviewStatus.PENDING]: '待审核',
  [PriceReviewStatus.APPROVED]: '已通过',
  [PriceReviewStatus.REJECTED]: '已拒绝',
  [PriceReviewStatus.AUTO_APPROVED]: '自动通过',
};

// 填报批次状态
export enum SubmissionStatus {
  DRAFT = 'DRAFT',                     // 草稿
  SUBMITTED = 'SUBMITTED',             // 已提交待审核
  PARTIAL_APPROVED = 'PARTIAL_APPROVED', // 部分通过
  APPROVED = 'APPROVED',               // 全部通过
  REJECTED = 'REJECTED',               // 已拒绝
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  [SubmissionStatus.DRAFT]: '草稿',
  [SubmissionStatus.SUBMITTED]: '已提交',
  [SubmissionStatus.PARTIAL_APPROVED]: '部分通过',
  [SubmissionStatus.APPROVED]: '已通过',
  [SubmissionStatus.REJECTED]: '已拒绝',
};

// =============================================
// 采集点分配 Schema
// =============================================

// 创建分配
export const CreateCollectionPointAllocationSchema = z.object({
  userId: z.string().uuid(),
  collectionPointId: z.string().uuid(),
  commodity: z.string().optional(), // [NEW] 负责品种
  remark: z.string().optional(),
});

export type CreateCollectionPointAllocationDto = z.infer<typeof CreateCollectionPointAllocationSchema>;

// 批量分配（一个采集点分配给多人）
export const BatchCreateAllocationSchema = z.object({
  collectionPointId: z.string().uuid(),
  allocations: z.array(z.object({
    userId: z.string().uuid(),
    commodity: z.string().optional(), // [NEW] 负责品种
    remark: z.string().optional(),
  })),
});

export type BatchCreateAllocationDto = z.infer<typeof BatchCreateAllocationSchema>;

// 更新分配
export const UpdateCollectionPointAllocationSchema = z.object({
  commodity: z.string().optional(), // [NEW] 允许更新品种
  remark: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCollectionPointAllocationDto = z.infer<typeof UpdateCollectionPointAllocationSchema>;

// 查询分配
export const QueryCollectionPointAllocationSchema = z.object({
  userId: z.string().uuid().optional(),
  collectionPointId: z.string().uuid().optional(),
  commodity: z.string().optional(), // [NEW] 按品种查询
  isActive: z.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryCollectionPointAllocationDto = z.infer<typeof QueryCollectionPointAllocationSchema>;

// 分配响应
export const CollectionPointAllocationResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  collectionPointId: z.string().uuid(),
  assignedById: z.string().uuid().nullable(),
  assignedAt: z.coerce.date(),
  commodity: z.string().nullable(), // [NEW]
  remark: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  // 关联数据
  user: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    avatar: z.string().nullable(),
  }).optional(),
  collectionPoint: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    type: z.string(),
    regionCode: z.string().nullable(),
  }).optional(),
});

export type CollectionPointAllocationResponse = z.infer<typeof CollectionPointAllocationResponseSchema>;

// =============================================
// 价格填报批次 Schema
// =============================================

// 创建填报批次
export const CreatePriceSubmissionSchema = z.object({
  collectionPointId: z.string().uuid(),
  effectiveDate: z.coerce.date(),
  taskId: z.string().uuid().optional(),
});

export type CreatePriceSubmissionDto = z.infer<typeof CreatePriceSubmissionSchema>;

// 更新填报批次
export const UpdatePriceSubmissionSchema = z.object({
  status: z.nativeEnum(SubmissionStatus).optional(),
});

export type UpdatePriceSubmissionDto = z.infer<typeof UpdatePriceSubmissionSchema>;

// 查询填报批次
export const QueryPriceSubmissionSchema = z.object({
  submittedById: z.string().uuid().optional(),
  collectionPointId: z.string().uuid().optional(),
  status: z.nativeEnum(SubmissionStatus).optional(),
  effectiveDateStart: z.coerce.date().optional(),
  effectiveDateEnd: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryPriceSubmissionDto = z.infer<typeof QueryPriceSubmissionSchema>;

// 填报批次响应
export const PriceSubmissionResponseSchema = z.object({
  id: z.string().uuid(),
  batchCode: z.string(),
  submittedById: z.string().uuid(),
  collectionPointId: z.string().uuid(),
  effectiveDate: z.coerce.date(),
  submittedAt: z.coerce.date().nullable(),
  status: z.nativeEnum(SubmissionStatus),
  itemCount: z.number().int(),
  approvedCount: z.number().int(),
  taskId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  // 关联数据
  submittedBy: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
  }).optional(),
  collectionPoint: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    type: z.string(),
  }).optional(),
  priceData: z.array(z.any()).optional(),
});

export type PriceSubmissionResponse = z.infer<typeof PriceSubmissionResponseSchema>;

// =============================================
// 价格条目提交 Schema
// =============================================

// 提交单条价格
export const SubmitPriceEntrySchema = z.object({
  commodity: z.string().min(1),
  price: z.number().positive(),
  subType: z.string().default('LISTED'),
  sourceType: z.string().default('ENTERPRISE'),
  geoLevel: z.string().default('ENTERPRISE'),
  grade: z.string().optional(),
  moisture: z.number().min(0).max(100).optional(),
  bulkDensity: z.number().int().positive().optional(),
  inventory: z.number().int().min(0).optional(),
  note: z.string().optional(),
});

export type SubmitPriceEntryDto = z.infer<typeof SubmitPriceEntrySchema>;

// 批量提交价格
export const BulkSubmitPriceEntriesSchema = z.object({
  entries: z.array(SubmitPriceEntrySchema),
});

export type BulkSubmitPriceEntriesDto = z.infer<typeof BulkSubmitPriceEntriesSchema>;

// =============================================
// 审核 Schema
// =============================================

// 审核单条价格
export const ReviewPriceDataSchema = z.object({
  status: z.enum([PriceReviewStatus.APPROVED, PriceReviewStatus.REJECTED]),
  note: z.string().optional(),
});

export type ReviewPriceDataDto = z.infer<typeof ReviewPriceDataSchema>;

// 批量审核
export const BatchReviewPriceDataSchema = z.object({
  priceIds: z.array(z.string().uuid()),
  status: z.enum([PriceReviewStatus.APPROVED, PriceReviewStatus.REJECTED]),
  note: z.string().optional(),
});

export type BatchReviewPriceDataDto = z.infer<typeof BatchReviewPriceDataSchema>;

// 审核填报批次
export const ReviewPriceSubmissionSchema = z.object({
  action: z.enum(['approve_all', 'reject_all']),
  note: z.string().optional(),
});

export type ReviewPriceSubmissionDto = z.infer<typeof ReviewPriceSubmissionSchema>;

// =============================================
// 统计 Schema
// =============================================

// 填报统计响应
export const ReportingStatsResponseSchema = z.object({
  todayPending: z.number().int(),
  todayCompleted: z.number().int(),
  weekCompleted: z.number().int(),
  monthCompleted: z.number().int(),
  pendingReview: z.number().int(),
  rejectedCount: z.number().int(),
});

export type ReportingStatsResponse = z.infer<typeof ReportingStatsResponseSchema>;

// 采集点填报状态
export const CollectionPointReportingStatusSchema = z.object({
  collectionPointId: z.string().uuid(),
  collectionPointName: z.string(),
  collectionPointType: z.string(),
  todayReported: z.boolean(),
  lastPrice: z.number().nullable(),
  lastPriceDate: z.coerce.date().nullable(),
  hasPendingTask: z.boolean(),
  taskDeadline: z.coerce.date().nullable(),
});

export type CollectionPointReportingStatus = z.infer<typeof CollectionPointReportingStatusSchema>;

// =============================================
// 分配矩阵 Schema
// =============================================

export const AllocationMatrixQuerySchema = z.object({
  organizationId: z.string().optional(),
  departmentId: z.string().optional(),
  pointType: z.string().optional(),
  keyword: z.string().optional(),
  userKeyword: z.string().optional(),
  pointKeyword: z.string().optional(),
});

export type AllocationMatrixQueryDto = z.infer<typeof AllocationMatrixQuerySchema>;

export const AllocationMatrixResponseSchema = z.object({
  points: z.array(z.object({
    pointId: z.string(),
    pointName: z.string(),
    pointType: z.string(),
    allocatedUserIds: z.array(z.string()),
    isAllocated: z.boolean(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    commodities: z.array(z.string()).optional(), // [NEW] 采集点支持的品种
    allocations: z.array(z.object({             // [NEW] 详细分配信息
      userId: z.string(),
      commodity: z.string().nullable(),
    })).optional(),
  })),
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
    organizationName: z.string().optional(),
    departmentName: z.string().optional(),
    assignedPointCount: z.number().default(0),
    pendingTaskCount: z.number().default(0),
  })),
  stats: z.object({
    totalPoints: z.number(),
    allocatedPoints: z.number(),
    unallocatedPoints: z.number(),
  }),
});

export type AllocationMatrixResponse = z.infer<typeof AllocationMatrixResponseSchema>;
