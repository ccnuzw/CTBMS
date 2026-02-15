import { z } from 'zod';

// ── 执行统计查询 ──

export const ExecutionAnalyticsQuerySchema = z.object({
  workflowDefinitionId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['HOUR', 'DAY', 'WEEK']).default('DAY'),
});

// ── 成功率/失败率趋势 ──

export const ExecutionTrendPointSchema = z.object({
  timestamp: z.string(),
  total: z.number().int(),
  success: z.number().int(),
  failed: z.number().int(),
  canceled: z.number().int(),
  successRate: z.number(),
});

export const ExecutionTrendSchema = z.object({
  points: z.array(ExecutionTrendPointSchema),
  overall: z.object({
    total: z.number().int(),
    success: z.number().int(),
    failed: z.number().int(),
    canceled: z.number().int(),
    successRate: z.number(),
    avgDurationMs: z.number(),
  }),
});

// ── 耗时分布 ──

export const DurationBucketSchema = z.object({
  label: z.string(),
  minMs: z.number().int(),
  maxMs: z.number().int(),
  count: z.number().int(),
});

// ── 失败分类统计 ──

export const FailureCategoryStatSchema = z.object({
  category: z.string(),
  count: z.number().int(),
  percentage: z.number(),
});

// ── 节点级性能 ──

export const NodePerformanceStatSchema = z.object({
  nodeType: z.string(),
  totalExecutions: z.number().int(),
  successCount: z.number().int(),
  failedCount: z.number().int(),
  successRate: z.number(),
  avgDurationMs: z.number(),
  maxDurationMs: z.number(),
  p95DurationMs: z.number(),
});

// ── 完整分析结果 ──

export const ExecutionAnalyticsSchema = z.object({
  trend: ExecutionTrendSchema,
  durationDistribution: z.array(DurationBucketSchema),
  failureCategories: z.array(FailureCategoryStatSchema),
  nodePerformance: z.array(NodePerformanceStatSchema),
  topSlowNodes: z.array(NodePerformanceStatSchema),
});

// ── Types ──

export type ExecutionAnalyticsQueryDto = z.infer<typeof ExecutionAnalyticsQuerySchema>;
export type ExecutionTrendPointDto = z.infer<typeof ExecutionTrendPointSchema>;
export type ExecutionTrendDto = z.infer<typeof ExecutionTrendSchema>;
export type DurationBucketDto = z.infer<typeof DurationBucketSchema>;
export type FailureCategoryStatDto = z.infer<typeof FailureCategoryStatSchema>;
export type NodePerformanceStatDto = z.infer<typeof NodePerformanceStatSchema>;
export type ExecutionAnalyticsDto = z.infer<typeof ExecutionAnalyticsSchema>;
