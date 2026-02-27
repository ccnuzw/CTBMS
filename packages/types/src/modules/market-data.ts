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

export const ReconciliationGateReasonEnum = z.enum([
  'gate_disabled',
  'no_reconciliation_job',
  'latest_status_not_done',
  'latest_summary_not_passed',
  'latest_time_invalid',
  'latest_outdated',
  'gate_passed',
]);

export const EvaluateReconciliationGateSchema = z.object({
  dataset: ReconciliationDatasetEnum,
  filters: z.record(z.unknown()).optional(),
  maxAgeMinutes: z.coerce.number().int().min(1).max(10080).optional(),
});

export const ReconciliationWindowMetricsQuerySchema = z.object({
  dataset: ReconciliationDatasetEnum,
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const ReconciliationMetricsSnapshotSchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  datasets: z.array(ReconciliationDatasetEnum).min(1).max(3).optional(),
});

export const ReconciliationDailyMetricsQuerySchema = z.object({
  dataset: ReconciliationDatasetEnum,
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export const ReconciliationReadCoverageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  workflowVersionIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  targetCoverageRate: z.coerce.number().min(0).max(1).default(0.9),
});

const ReconciliationDatasetListQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return [trimmed];
  }

  return [value];
}, z.array(ReconciliationDatasetEnum).min(1).max(3));

export const ReconciliationM1ReadinessQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  targetCoverageRate: z.coerce.number().min(0).max(1).default(0.9),
  datasets: ReconciliationDatasetListQuerySchema.optional(),
});

export const ReconciliationM1ReadinessReportFormatEnum = z.enum(['json', 'markdown']);

export const ReconciliationM1ReadinessReportQuerySchema =
  ReconciliationM1ReadinessQuerySchema.extend({
    format: ReconciliationM1ReadinessReportFormatEnum.default('markdown'),
  });

export const CreateReconciliationM1ReadinessReportSnapshotSchema =
  ReconciliationM1ReadinessReportQuerySchema;

export const ListReconciliationM1ReadinessReportSnapshotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  format: ReconciliationM1ReadinessReportFormatEnum.optional(),
});

export const ReconciliationCutoverDecisionStatusEnum = z.enum(['APPROVED', 'REJECTED']);

export const CreateReconciliationCutoverDecisionSchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  targetCoverageRate: z.coerce.number().min(0).max(1).default(0.9),
  datasets: ReconciliationDatasetListQuerySchema.optional(),
  reportFormat: ReconciliationM1ReadinessReportFormatEnum.default('markdown'),
  note: z.string().trim().min(1).max(1000).optional(),
});

export const ListReconciliationCutoverDecisionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: ReconciliationCutoverDecisionStatusEnum.optional(),
});

export const ReconciliationCutoverAutopilotRejectedActionEnum = z.enum(['NONE', 'ROLLBACK']);

export const CreateReconciliationCutoverAutopilotSchema =
  CreateReconciliationCutoverDecisionSchema.extend({
    onRejectedAction: ReconciliationCutoverAutopilotRejectedActionEnum.default('ROLLBACK'),
    disableReconciliationGate: z.boolean().default(true),
    workflowVersionId: z.string().uuid().optional(),
    rollbackReason: z.string().trim().min(1).max(200).optional(),
    dryRun: z.boolean().default(false),
  });

export const ReconciliationCutoverExecutionActionEnum = z.enum([
  'CUTOVER',
  'ROLLBACK',
  'AUTOPILOT',
]);

export const ReconciliationCutoverExecutionStatusEnum = z.enum([
  'SUCCESS',
  'FAILED',
  'PARTIAL',
  'COMPENSATED',
]);

export const ListReconciliationCutoverExecutionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: ReconciliationCutoverExecutionActionEnum.optional(),
  status: ReconciliationCutoverExecutionStatusEnum.optional(),
});

export const RetryReconciliationCutoverCompensationSchema = z.object({
  disableReconciliationGate: z.boolean().default(true),
  workflowVersionId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(1000).optional(),
  reason: z.string().trim().min(1).max(200).optional(),
});

export const ExecuteReconciliationRollbackSchema = z.object({
  datasets: ReconciliationDatasetListQuerySchema.optional(),
  workflowVersionId: z.string().uuid().optional(),
  disableReconciliationGate: z.boolean().default(true),
  note: z.string().trim().min(1).max(1000).optional(),
  reason: z.string().trim().min(1).max(200).optional(),
});

export const ReconciliationCutoverRuntimeStatusQuerySchema = z.object({
  datasets: ReconciliationDatasetListQuerySchema.optional(),
});

export const ReconciliationRollbackDrillStatusEnum = z.enum([
  'PLANNED',
  'RUNNING',
  'PASSED',
  'FAILED',
]);

export const CreateReconciliationRollbackDrillSchema = z
  .object({
    dataset: ReconciliationDatasetEnum,
    workflowVersionId: z.string().uuid().optional(),
    scenario: z.string().trim().min(1).max(80).default('standard_to_legacy'),
    status: ReconciliationRollbackDrillStatusEnum.default('PASSED'),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
    rollbackPath: z.string().trim().min(1).max(80).optional(),
    resultSummary: z.record(z.unknown()).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.startedAt || !value.completedAt) {
      return;
    }
    const startedAt = new Date(value.startedAt).getTime();
    const completedAt = new Date(value.completedAt).getTime();
    if (startedAt > completedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startedAt'],
        message: 'startedAt 必须小于或等于 completedAt',
      });
    }
  });

export const ListReconciliationRollbackDrillsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  dataset: ReconciliationDatasetEnum.optional(),
  status: ReconciliationRollbackDrillStatusEnum.optional(),
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
export type ReconciliationGateReason = z.infer<typeof ReconciliationGateReasonEnum>;
export type EvaluateReconciliationGateDto = z.infer<typeof EvaluateReconciliationGateSchema>;
export type ReconciliationWindowMetricsQueryDto = z.infer<
  typeof ReconciliationWindowMetricsQuerySchema
>;
export type ReconciliationMetricsSnapshotDto = z.infer<typeof ReconciliationMetricsSnapshotSchema>;
export type ReconciliationDailyMetricsQueryDto = z.infer<
  typeof ReconciliationDailyMetricsQuerySchema
>;
export type ReconciliationReadCoverageQueryDto = z.infer<
  typeof ReconciliationReadCoverageQuerySchema
>;
export type ReconciliationM1ReadinessQueryDto = z.infer<
  typeof ReconciliationM1ReadinessQuerySchema
>;
export type ReconciliationM1ReadinessReportFormat = z.infer<
  typeof ReconciliationM1ReadinessReportFormatEnum
>;
export type ReconciliationM1ReadinessReportQueryDto = z.infer<
  typeof ReconciliationM1ReadinessReportQuerySchema
>;
export type CreateReconciliationM1ReadinessReportSnapshotDto = z.infer<
  typeof CreateReconciliationM1ReadinessReportSnapshotSchema
>;
export type ListReconciliationM1ReadinessReportSnapshotsQueryDto = z.infer<
  typeof ListReconciliationM1ReadinessReportSnapshotsQuerySchema
>;
export type ReconciliationCutoverDecisionStatus = z.infer<
  typeof ReconciliationCutoverDecisionStatusEnum
>;
export type CreateReconciliationCutoverDecisionDto = z.infer<
  typeof CreateReconciliationCutoverDecisionSchema
>;
export type ListReconciliationCutoverDecisionsQueryDto = z.infer<
  typeof ListReconciliationCutoverDecisionsQuerySchema
>;
export type ReconciliationCutoverAutopilotRejectedAction = z.infer<
  typeof ReconciliationCutoverAutopilotRejectedActionEnum
>;
export type CreateReconciliationCutoverAutopilotDto = z.infer<
  typeof CreateReconciliationCutoverAutopilotSchema
>;
export type ReconciliationCutoverExecutionAction = z.infer<
  typeof ReconciliationCutoverExecutionActionEnum
>;
export type ReconciliationCutoverExecutionStatus = z.infer<
  typeof ReconciliationCutoverExecutionStatusEnum
>;
export type ListReconciliationCutoverExecutionsQueryDto = z.infer<
  typeof ListReconciliationCutoverExecutionsQuerySchema
>;
export type RetryReconciliationCutoverCompensationDto = z.infer<
  typeof RetryReconciliationCutoverCompensationSchema
>;
export type ExecuteReconciliationRollbackDto = z.infer<typeof ExecuteReconciliationRollbackSchema>;
export type ReconciliationCutoverRuntimeStatusQueryDto = z.infer<
  typeof ReconciliationCutoverRuntimeStatusQuerySchema
>;
export type ReconciliationRollbackDrillStatus = z.infer<
  typeof ReconciliationRollbackDrillStatusEnum
>;
export type CreateReconciliationRollbackDrillDto = z.infer<
  typeof CreateReconciliationRollbackDrillSchema
>;
export type ListReconciliationRollbackDrillsQueryDto = z.infer<
  typeof ListReconciliationRollbackDrillsQuerySchema
>;
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
