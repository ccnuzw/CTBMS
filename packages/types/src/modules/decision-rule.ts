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

// --- [AST Modification] ---
export const DecisionRuleLogicEnum = z.enum(['AND', 'OR']);

// A single leaf node representing one concrete condition
export const DecisionRuleConditionLeafSchema = z.object({
  id: z.string().uuid().optional(), // For React keys or DB tracing
  fieldPath: z.string().min(1, 'fieldPath is required'),
  operator: DecisionRuleOperatorEnum,
  expectedValue: z.unknown().nullable().optional(),
});

// A logical group node that can contain sub-nodes or leaves (Recursive)
export type DecisionRuleConditionNode = {
  logic: z.infer<typeof DecisionRuleLogicEnum>;
  children: Array<DecisionRuleConditionNode | z.infer<typeof DecisionRuleConditionLeafSchema>>;
};

export const DecisionRuleConditionNodeSchema: z.ZodType<DecisionRuleConditionNode> = z.lazy(() =>
  z.object({
    logic: DecisionRuleLogicEnum,
    children: z.array(z.union([DecisionRuleConditionNodeSchema, DecisionRuleConditionLeafSchema])),
  })
);

// The top-level AST structure
export const DecisionRuleConditionASTSchema = z.object({
  root: DecisionRuleConditionNodeSchema.nullable().optional(),
});
// --------------------------

export const DecisionRulePackOwnerTypeEnum = z.enum(['SYSTEM', 'ADMIN', 'USER']);
export const DecisionRuleLayerEnum = z.enum([
  'DEFAULT',
  'INDUSTRY',
  'EXPERIENCE',
  'RUNTIME_OVERRIDE',
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
  applicableScopes: z.array(z.string()).default([]),
  ruleLayer: DecisionRuleLayerEnum.default('DEFAULT'),
  ownerType: DecisionRulePackOwnerTypeEnum.default('USER'),
  ownerUserId: z.string().nullable().optional(),
  templateSource: WorkflowTemplateSourceEnum,
  isActive: z.boolean(),
  version: z.number().int(),
  priority: z.number().int(),
  publishedByUserId: z.string().nullable().optional(),
  publishedAt: z.date().nullable().optional(),
  lastPublishComment: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const DecisionRulePackDetailSchema = DecisionRulePackSchema.extend({
  rules: z.array(DecisionRuleSchema), // Legacy flat mapping (kept for backwards compatibility if needed during migration)
  conditionAST: DecisionRuleConditionASTSchema.optional(), // New AST tree representation
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
  applicableScopes: z.array(z.string().max(120)).max(64).default([]),
  ruleLayer: DecisionRuleLayerEnum.default('DEFAULT'),
  ownerType: DecisionRulePackOwnerTypeEnum.optional(),
  templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  rules: z.array(CreateDecisionRuleSchema).max(200).optional(),           // Legacy
  conditionAST: DecisionRuleConditionASTSchema.nullable().optional(),     // New feature
});

export const UpdateDecisionRulePackSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  applicableScopes: z.array(z.string().max(120)).max(64).optional(),
  ruleLayer: DecisionRuleLayerEnum.optional(),
  ownerType: DecisionRulePackOwnerTypeEnum.optional(),
  isActive: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  conditionAST: DecisionRuleConditionASTSchema.nullable().optional(),
});

export const DecisionRulePackQuerySchema = z.object({
  keyword: z.string().max(120).optional(),
  ruleLayer: DecisionRuleLayerEnum.optional(),
  includePublic: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

export const PublishDecisionRulePackSchema = z.object({
  comment: z.string().max(500).optional(),
});

export const SmartParseRuleASTSchema = z.object({
  naturalLanguage: z.string().min(1).max(2000),
});

export const DecisionRulePackPageSchema = z.object({
  data: z.array(DecisionRulePackSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export type DecisionRuleOperator = z.infer<typeof DecisionRuleOperatorEnum>;
export type DecisionRulePackOwnerType = z.infer<typeof DecisionRulePackOwnerTypeEnum>;
export type DecisionRuleLayer = z.infer<typeof DecisionRuleLayerEnum>;
export type DecisionRuleDto = z.infer<typeof DecisionRuleSchema>;
export type DecisionRulePackDto = z.infer<typeof DecisionRulePackSchema>;
export type DecisionRulePackDetailDto = z.infer<typeof DecisionRulePackDetailSchema>;
export type DecisionRulePackPageDto = z.infer<typeof DecisionRulePackPageSchema>;
export type CreateDecisionRuleDto = z.infer<typeof CreateDecisionRuleSchema>;
export type UpdateDecisionRuleDto = z.infer<typeof UpdateDecisionRuleSchema>;
export type CreateDecisionRulePackDto = z.infer<typeof CreateDecisionRulePackSchema>;
export type UpdateDecisionRulePackDto = z.infer<typeof UpdateDecisionRulePackSchema>;
export type DecisionRulePackQueryDto = z.infer<typeof DecisionRulePackQuerySchema>;
export type PublishDecisionRulePackDto = z.infer<typeof PublishDecisionRulePackSchema>;
export type SmartParseRuleASTDto = z.infer<typeof SmartParseRuleASTSchema>;

// --- [AST Types] ---
export type DecisionRuleLogic = z.infer<typeof DecisionRuleLogicEnum>;
export type DecisionRuleConditionLeafDto = z.infer<typeof DecisionRuleConditionLeafSchema>;
export type DecisionRuleConditionNodeDto = DecisionRuleConditionNode;
export type DecisionRuleConditionASTDto = z.infer<typeof DecisionRuleConditionASTSchema>;
