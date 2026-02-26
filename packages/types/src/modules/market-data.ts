import { z } from 'zod';

export const StandardizationPreviewDatasetEnum = z.enum([
  'PRICE_DATA',
  'FUTURES_QUOTE_SNAPSHOT',
  'MARKET_INTEL',
]);

export const LineageDatasetEnum = z.enum(['SPOT_PRICE', 'FUTURES_QUOTE', 'MARKET_EVENT']);

export const ReconciliationDatasetEnum = z.enum(['SPOT_PRICE', 'FUTURES_QUOTE', 'MARKET_EVENT']);

export const MarketDataTimeRangeSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((value) => new Date(value.from).getTime() <= new Date(value.to).getTime(), {
    message: 'timeRange.from 必须小于或等于 timeRange.to',
    path: ['from'],
  });

export const StandardizationPreviewSchema = z.object({
  dataset: StandardizationPreviewDatasetEnum,
  sampleLimit: z.coerce.number().int().min(1).max(500).default(50),
  mappingVersion: z.string().min(1).max(40).default('v1'),
  filters: z.record(z.unknown()).optional(),
});

export const MarketDataLineageQuerySchema = z.object({
  dataset: LineageDatasetEnum,
  recordId: z.string().min(1).max(64),
});

export const ReconciliationThresholdSchema = z.object({
  maxDiffRate: z.coerce.number().min(0).max(1).default(0.01),
  maxMissingRate: z.coerce.number().min(0).max(1).default(0.005),
});

export const CreateReconciliationJobSchema = z.object({
  dataset: ReconciliationDatasetEnum,
  timeRange: MarketDataTimeRangeSchema,
  dimensions: z.record(z.unknown()).optional(),
  threshold: ReconciliationThresholdSchema.default({
    maxDiffRate: 0.01,
    maxMissingRate: 0.005,
  }),
});

export const CancelReconciliationJobSchema = z.object({
  reason: z.string().trim().min(1).max(200).optional(),
});

export const ReconciliationJobStatusEnum = z.enum([
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
  'CANCELLED',
]);

export const ReconciliationJobSortByEnum = z.enum([
  'createdAt',
  'startedAt',
  'finishedAt',
  'status',
  'dataset',
]);

export const SortOrderEnum = z.enum(['asc', 'desc']);

const BooleanQuerySchema = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

export const ListReconciliationJobsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    dataset: ReconciliationDatasetEnum.optional(),
    status: ReconciliationJobStatusEnum.optional(),
    pass: BooleanQuerySchema.optional(),
    createdAtFrom: z.string().datetime().optional(),
    createdAtTo: z.string().datetime().optional(),
    sortBy: ReconciliationJobSortByEnum.default('createdAt'),
    sortOrder: SortOrderEnum.default('desc'),
  })
  .superRefine((value, ctx) => {
    if (!value.createdAtFrom || !value.createdAtTo) {
      return;
    }
    const from = new Date(value.createdAtFrom).getTime();
    const to = new Date(value.createdAtTo).getTime();
    if (from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'createdAtFrom 必须小于或等于 createdAtTo',
        path: ['createdAtFrom'],
      });
    }
  });

export const MarketDataQuerySchema = z.object({
  dataset: ReconciliationDatasetEnum,
  dimensions: z.record(z.unknown()).optional(),
  timeRange: MarketDataTimeRangeSchema.optional(),
  granularity: z.string().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const AggregateOpEnum = z.enum(['sum', 'avg', 'min', 'max', 'count']);

export const MarketDataAggregateMetricSchema = z.object({
  field: z.string().min(1).max(64),
  op: AggregateOpEnum,
  as: z.string().min(1).max(64).optional(),
});

export const MarketDataAggregateSchema = z.object({
  dataset: ReconciliationDatasetEnum,
  dimensions: z.record(z.unknown()).optional(),
  timeRange: MarketDataTimeRangeSchema.optional(),
  groupBy: z.array(z.string().min(1).max(64)).min(1).max(8),
  metrics: z.array(MarketDataAggregateMetricSchema).min(1).max(16),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

export const StandardSpotRecordSchema = z.object({
  recordId: z.string(),
  commodityCode: z.string(),
  regionCode: z.string(),
  spotPrice: z.number(),
  unit: z.string(),
  dataTime: z.string(),
  sourceType: z.string(),
  sourceRecordId: z.string(),
});

export const StandardFuturesRecordSchema = z.object({
  recordId: z.string(),
  contractCode: z.string(),
  exchangeCode: z.string(),
  closePrice: z.number(),
  dataTime: z.string(),
  sourceType: z.string(),
  sourceRecordId: z.string(),
});

export const StandardEventRecordSchema = z.object({
  recordId: z.string(),
  eventType: z.string(),
  title: z.string(),
  summary: z.string(),
  publishedAt: z.string(),
  sourceType: z.string(),
  sourceRecordId: z.string(),
});

export const ReconciliationSummarySchema = z.object({
  diffRate: z.number(),
  missingRate: z.number(),
  conflictRate: z.number(),
  pass: z.boolean(),
  totalCount: z.number().int(),
  diffCount: z.number().int(),
  missingCount: z.number().int(),
  conflictCount: z.number().int(),
});

export type StandardizationPreviewDataset = z.infer<typeof StandardizationPreviewDatasetEnum>;
export type LineageDataset = z.infer<typeof LineageDatasetEnum>;
export type ReconciliationDataset = z.infer<typeof ReconciliationDatasetEnum>;
export type StandardizationPreviewDto = z.infer<typeof StandardizationPreviewSchema>;
export type MarketDataLineageQueryDto = z.infer<typeof MarketDataLineageQuerySchema>;
export type CreateReconciliationJobDto = z.infer<typeof CreateReconciliationJobSchema>;
export type CancelReconciliationJobDto = z.infer<typeof CancelReconciliationJobSchema>;
export type ReconciliationJobStatus = z.infer<typeof ReconciliationJobStatusEnum>;
export type ReconciliationJobSortBy = z.infer<typeof ReconciliationJobSortByEnum>;
export type SortOrder = z.infer<typeof SortOrderEnum>;
export type ListReconciliationJobsQueryDto = z.infer<typeof ListReconciliationJobsQuerySchema>;
export type MarketDataQueryDto = z.infer<typeof MarketDataQuerySchema>;
export type AggregateOp = z.infer<typeof AggregateOpEnum>;
export type MarketDataAggregateMetricDto = z.infer<typeof MarketDataAggregateMetricSchema>;
export type MarketDataAggregateDto = z.infer<typeof MarketDataAggregateSchema>;
export type ReconciliationSummaryDto = z.infer<typeof ReconciliationSummarySchema>;
export type StandardSpotRecord = z.infer<typeof StandardSpotRecordSchema>;
export type StandardFuturesRecord = z.infer<typeof StandardFuturesRecordSchema>;
export type StandardEventRecord = z.infer<typeof StandardEventRecordSchema>;
