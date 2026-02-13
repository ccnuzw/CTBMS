import { z } from 'zod';

// ── 枚举 ──

export const DecisionActionEnum = z.enum(['BUY', 'SELL', 'HOLD', 'REDUCE', 'REVIEW_ONLY']);

// ── Schema ──

export const DecisionRecordSchema = z.object({
    id: z.string().uuid(),
    workflowExecutionId: z.string().uuid(),
    workflowDefinitionId: z.string().uuid().nullable().optional(),
    action: DecisionActionEnum,
    confidence: z.number().min(0).max(100).nullable().optional(),
    riskLevel: z.string().nullable().optional(),
    targetWindow: z.string().nullable().optional(),
    reasoningSummary: z.string().nullable().optional(),
    evidenceSummary: z.record(z.unknown()).nullable().optional(),
    paramSnapshot: z.record(z.unknown()).nullable().optional(),
    outputSnapshot: z.record(z.unknown()).nullable().optional(),
    traceId: z.string().nullable().optional(),
    isPublished: z.boolean(),
    publishedAt: z.date().nullable().optional(),
    reviewedByUserId: z.string().nullable().optional(),
    reviewComment: z.string().nullable().optional(),
    createdByUserId: z.string(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateDecisionRecordSchema = z.object({
    workflowExecutionId: z.string().uuid(),
    workflowDefinitionId: z.string().uuid().optional(),
    action: DecisionActionEnum,
    confidence: z.number().min(0).max(100).optional(),
    riskLevel: z.string().max(30).optional(),
    targetWindow: z.string().max(60).optional(),
    reasoningSummary: z.string().max(5000).optional(),
    evidenceSummary: z.record(z.unknown()).optional(),
    paramSnapshot: z.record(z.unknown()).optional(),
    outputSnapshot: z.record(z.unknown()).optional(),
    traceId: z.string().max(120).optional(),
});

export const UpdateDecisionRecordSchema = z.object({
    action: DecisionActionEnum.optional(),
    confidence: z.number().min(0).max(100).optional(),
    riskLevel: z.string().max(30).optional(),
    targetWindow: z.string().max(60).optional(),
    reasoningSummary: z.string().max(5000).optional(),
    isPublished: z.boolean().optional(),
    reviewComment: z.string().max(2000).optional(),
});

export const DecisionRecordQuerySchema = z.object({
    workflowExecutionId: z.string().uuid().optional(),
    workflowDefinitionId: z.string().uuid().optional(),
    action: DecisionActionEnum.optional(),
    riskLevel: z.string().optional(),
    isPublished: z.preprocess(
        (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
        z.boolean().optional(),
    ),
    keyword: z.string().max(120).optional(),
    createdAtFrom: z.coerce.date().optional(),
    createdAtTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const DecisionRecordPageSchema = z.object({
    data: z.array(DecisionRecordSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

// ── Types ──

export type DecisionAction = z.infer<typeof DecisionActionEnum>;
export type DecisionRecordDto = z.infer<typeof DecisionRecordSchema>;
export type CreateDecisionRecordDto = z.infer<typeof CreateDecisionRecordSchema>;
export type UpdateDecisionRecordDto = z.infer<typeof UpdateDecisionRecordSchema>;
export type DecisionRecordQueryDto = z.infer<typeof DecisionRecordQuerySchema>;
export type DecisionRecordPageDto = z.infer<typeof DecisionRecordPageSchema>;
