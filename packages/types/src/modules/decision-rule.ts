import { z } from 'zod';
import { WorkflowTemplateSourceEnum } from './workflow';

export const DecisionRuleOperatorEnum = z.enum([
    'GT',
    'GTE',
    'LT',
    'LTE',
    'EQ',
    'NEQ',
    'IN',
    'NOT_IN',
    'CONTAINS',
    'NOT_CONTAINS',
    'EXISTS',
    'NOT_EXISTS',
    'BETWEEN',
]);

export const DecisionRuleSchema = z.object({
    id: z.string().uuid(),
    rulePackId: z.string().uuid(),
    ruleCode: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    fieldPath: z.string(),
    operator: DecisionRuleOperatorEnum,
    expectedValue: z.unknown().nullable().optional(),
    weight: z.number().int(),
    isActive: z.boolean(),
    priority: z.number().int(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const DecisionRulePackSchema = z.object({
    id: z.string().uuid(),
    rulePackCode: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
    templateSource: WorkflowTemplateSourceEnum,
    isActive: z.boolean(),
    version: z.number().int(),
    priority: z.number().int(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const DecisionRulePackDetailSchema = DecisionRulePackSchema.extend({
    rules: z.array(DecisionRuleSchema),
});

export const CreateDecisionRuleSchema = z.object({
    ruleCode: z.string().regex(/^[a-zA-Z0-9_.-]{2,80}$/, 'ruleCode 格式不正确'),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    fieldPath: z.string().min(1).max(160),
    operator: DecisionRuleOperatorEnum,
    expectedValue: z.unknown().optional(),
    weight: z.coerce.number().int().min(1).max(100).default(1),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
});

export const UpdateDecisionRuleSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    fieldPath: z.string().min(1).max(160).optional(),
    operator: DecisionRuleOperatorEnum.optional(),
    expectedValue: z.unknown().optional(),
    weight: z.coerce.number().int().min(1).max(100).optional(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
});

export const CreateDecisionRulePackSchema = z.object({
    rulePackCode: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/, 'rulePackCode 格式不正确'),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    rules: z.array(CreateDecisionRuleSchema).max(200).optional(),
});

export const UpdateDecisionRulePackSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    isActive: z.boolean().optional(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
});

export const DecisionRulePackQuerySchema = z.object({
    keyword: z.string().max(120).optional(),
    includePublic: z.coerce.boolean().default(true),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const DecisionRulePackPageSchema = z.object({
    data: z.array(DecisionRulePackSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

export type DecisionRuleOperator = z.infer<typeof DecisionRuleOperatorEnum>;
export type DecisionRuleDto = z.infer<typeof DecisionRuleSchema>;
export type DecisionRulePackDto = z.infer<typeof DecisionRulePackSchema>;
export type DecisionRulePackDetailDto = z.infer<typeof DecisionRulePackDetailSchema>;
export type DecisionRulePackPageDto = z.infer<typeof DecisionRulePackPageSchema>;
export type CreateDecisionRuleDto = z.infer<typeof CreateDecisionRuleSchema>;
export type UpdateDecisionRuleDto = z.infer<typeof UpdateDecisionRuleSchema>;
export type CreateDecisionRulePackDto = z.infer<typeof CreateDecisionRulePackSchema>;
export type UpdateDecisionRulePackDto = z.infer<typeof UpdateDecisionRulePackSchema>;
export type DecisionRulePackQueryDto = z.infer<typeof DecisionRulePackQuerySchema>;
