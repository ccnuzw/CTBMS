import { z } from 'zod';

// ── 枚举 ──

export const ExperimentStatusEnum = z.enum(['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ABORTED']);

// ── Schemas ──

export const WorkflowExperimentSchema = z.object({
    id: z.string().uuid(),
    experimentCode: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    workflowDefinitionId: z.string().uuid(),
    variantAVersionId: z.string().uuid(),
    variantBVersionId: z.string().uuid(),
    trafficSplitPercent: z.number().int().min(1).max(99),
    status: ExperimentStatusEnum,
    startedAt: z.date().nullable().optional(),
    endedAt: z.date().nullable().optional(),
    maxExecutions: z.number().int().nullable().optional(),
    currentExecutionsA: z.number().int(),
    currentExecutionsB: z.number().int(),
    winnerVariant: z.string().nullable().optional(),
    conclusionSummary: z.string().nullable().optional(),
    metricsSnapshot: z.record(z.unknown()).nullable().optional(),
    autoStopEnabled: z.boolean().optional(),
    badCaseThreshold: z.number().min(0).max(1).optional(),
    createdByUserId: z.string(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateWorkflowExperimentSchema = z.object({
    experimentCode: z.string().min(1).max(60),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    workflowDefinitionId: z.string().uuid(),
    variantAVersionId: z.string().uuid(),
    variantBVersionId: z.string().uuid(),
    trafficSplitPercent: z.number().int().min(1).max(99).default(50),
    maxExecutions: z.number().int().min(1).optional(),
    autoStopEnabled: z.boolean().default(true).optional(),
    badCaseThreshold: z.number().min(0).max(1).default(0.2).optional(),
});

export const UpdateWorkflowExperimentSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    trafficSplitPercent: z.number().int().min(1).max(99).optional(),
    maxExecutions: z.number().int().min(1).optional(),
});

export const WorkflowExperimentQuerySchema = z.object({
    workflowDefinitionId: z.string().uuid().optional(),
    status: ExperimentStatusEnum.optional(),
    keyword: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ConcludeExperimentSchema = z.object({
    winnerVariant: z.enum(['A', 'B']),
    conclusionSummary: z.string().max(5000).optional(),
});

export const WorkflowExperimentPageSchema = z.object({
    data: z.array(WorkflowExperimentSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

// ── ON_DEMAND 触发 ──

export const OnDemandTriggerSchema = z.object({
    workflowDefinitionId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
    experimentId: z.string().uuid().optional(),
    params: z.record(z.unknown()).optional(),
    idempotencyKey: z.string().max(200).optional(),
    callbackUrl: z.string().url().optional(),
});

// ── Types ──

export type ExperimentStatus = z.infer<typeof ExperimentStatusEnum>;
export type WorkflowExperimentDto = z.infer<typeof WorkflowExperimentSchema>;
export type CreateWorkflowExperimentDto = z.infer<typeof CreateWorkflowExperimentSchema>;
export type UpdateWorkflowExperimentDto = z.infer<typeof UpdateWorkflowExperimentSchema>;
export type WorkflowExperimentQueryDto = z.infer<typeof WorkflowExperimentQuerySchema>;
export type ConcludeExperimentDto = z.infer<typeof ConcludeExperimentSchema>;
export type WorkflowExperimentPageDto = z.infer<typeof WorkflowExperimentPageSchema>;
export type OnDemandTriggerDto = z.infer<typeof OnDemandTriggerSchema>;

// ── 指标采集 ──

export const RecordExperimentMetricsSchema = z.object({
    variant: z.enum(['A', 'B']),
    executionId: z.string().uuid(),
    success: z.boolean(),
    durationMs: z.number().int().min(0),
    nodeCount: z.number().int().min(0).optional(),
    failureCategory: z.string().max(100).optional(),
});

export const ExperimentMetricsSnapshotSchema = z.object({
    variantA: z.object({
        totalExecutions: z.number().int(),
        successCount: z.number().int(),
        failureCount: z.number().int(),
        successRate: z.number(),
        avgDurationMs: z.number(),
        p95DurationMs: z.number(),
        badCaseRate: z.number(),
    }),
    variantB: z.object({
        totalExecutions: z.number().int(),
        successCount: z.number().int(),
        failureCount: z.number().int(),
        successRate: z.number(),
        avgDurationMs: z.number(),
        p95DurationMs: z.number(),
        badCaseRate: z.number(),
    }),
    lastUpdatedAt: z.string(),
});

export type RecordExperimentMetricsDto = z.infer<typeof RecordExperimentMetricsSchema>;
export type ExperimentMetricsSnapshot = z.infer<typeof ExperimentMetricsSnapshotSchema>;

// ── ExperimentRun (实验运行明细) ──

export const ExperimentRunSchema = z.object({
    id: z.string().uuid(),
    experimentId: z.string().uuid(),
    workflowExecutionId: z.string().uuid(),
    variant: z.enum(['A', 'B']),
    success: z.boolean(),
    durationMs: z.number().int(),
    nodeCount: z.number().int().nullable().optional(),
    failureCategory: z.string().nullable().optional(),
    action: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    metricsPayload: z.record(z.unknown()).nullable().optional(),
    createdAt: z.date().optional(),
});

export const ExperimentRunQuerySchema = z.object({
    experimentId: z.string().uuid(),
    variant: z.enum(['A', 'B']).optional(),
    success: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ExperimentRunPageSchema = z.object({
    data: z.array(ExperimentRunSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

export const ExperimentEvaluationSchema = z.object({
    experiment: WorkflowExperimentSchema,
    metrics: ExperimentMetricsSnapshotSchema.nullable().optional(),
    recentRuns: z.array(ExperimentRunSchema),
    variantComparison: z.object({
        successRateDelta: z.number(),
        avgDurationDelta: z.number(),
        confidenceDeltaA: z.number().nullable().optional(),
        confidenceDeltaB: z.number().nullable().optional(),
        recommendation: z.string(),
    }).nullable().optional(),
});

export type ExperimentRunDto = z.infer<typeof ExperimentRunSchema>;
export type ExperimentRunQueryDto = z.infer<typeof ExperimentRunQuerySchema>;
export type ExperimentRunPageDto = z.infer<typeof ExperimentRunPageSchema>;
export type ExperimentEvaluationDto = z.infer<typeof ExperimentEvaluationSchema>;
