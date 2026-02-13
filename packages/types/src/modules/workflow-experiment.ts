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
