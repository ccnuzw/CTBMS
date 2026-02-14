import { z } from 'zod';
import { WorkflowTemplateSourceEnum } from './workflow';

export const ParameterTypeEnum = z.enum([
  'number',
  'string',
  'boolean',
  'enum',
  'json',
  'expression',
]);
export const ParameterOwnerTypeEnum = z.enum(['SYSTEM', 'ADMIN', 'USER']);
export const ParameterScopeLevelEnum = z.enum([
  'PUBLIC_TEMPLATE',
  'USER_TEMPLATE',
  'GLOBAL',
  'COMMODITY',
  'REGION',
  'ROUTE',
  'STRATEGY',
  'SESSION',
]);

export const ParameterSetSchema = z.object({
  id: z.string().uuid(),
  setCode: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  templateSource: WorkflowTemplateSourceEnum,
  isActive: z.boolean(),
  version: z.number().int(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const ParameterItemSchema = z.object({
  id: z.string().uuid(),
  parameterSetId: z.string().uuid(),
  paramCode: z.string(),
  paramName: z.string(),
  paramType: ParameterTypeEnum,
  unit: z.string().nullable().optional(),
  value: z.unknown().nullable().optional(),
  defaultValue: z.unknown().nullable().optional(),
  minValue: z.unknown().nullable().optional(),
  maxValue: z.unknown().nullable().optional(),
  scopeLevel: ParameterScopeLevelEnum,
  scopeValue: z.string().nullable().optional(),
  inheritedFrom: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  changeReason: z.string().nullable().optional(),
  ownerType: ParameterOwnerTypeEnum.default('USER'),
  ownerUserId: z.string().nullable().optional(),
  itemSource: WorkflowTemplateSourceEnum,
  version: z.number().int(),
  effectiveFrom: z.date().nullable().optional(),
  effectiveTo: z.date().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const ParameterSetDetailSchema = ParameterSetSchema.extend({
  items: z.array(ParameterItemSchema),
});

export const CreateParameterSetSchema = z.object({
  setCode: z.string().regex(/^[A-Z0-9_]{3,100}$/),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
});

export const UpdateParameterSetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const CreateParameterItemSchema = z.object({
  paramCode: z.string().regex(/^[a-zA-Z0-9_.-]{2,120}$/),
  paramName: z.string().min(1).max(120),
  paramType: ParameterTypeEnum,
  unit: z.string().max(20).optional(),
  value: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
  minValue: z.unknown().optional(),
  maxValue: z.unknown().optional(),
  scopeLevel: ParameterScopeLevelEnum,
  scopeValue: z.string().max(120).optional(),
  inheritedFrom: z.string().max(120).optional(),
  source: z.string().max(120).optional(),
  changeReason: z.string().max(500).optional(),
  ownerType: ParameterOwnerTypeEnum.optional(),
  ownerUserId: z.string().max(120).optional(),
  itemSource: WorkflowTemplateSourceEnum.optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

export const UpdateParameterItemSchema = CreateParameterItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const ParameterSetQuerySchema = z.object({
  keyword: z.string().max(120).optional(),
  includePublic: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

export const PublishParameterSetSchema = z.object({
  comment: z.string().max(500).optional(),
});

export const ParameterSetPageSchema = z.object({
  data: z.array(ParameterSetSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const ResolveParameterSetSchema = z.object({
  commodity: z.string().max(64).optional(),
  region: z.string().max(64).optional(),
  route: z.string().max(64).optional(),
  strategy: z.string().max(64).optional(),
  sessionOverrides: z.record(z.unknown()).optional(),
});

export const ResolvedParameterItemSchema = z.object({
  paramCode: z.string(),
  value: z.unknown(),
  sourceScope: ParameterScopeLevelEnum,
});

export const ResolveParameterSetResultSchema = z.object({
  parameterSetId: z.string().uuid(),
  resolved: z.array(ResolvedParameterItemSchema),
});

export const DataConnectorTypeEnum = z.enum([
  'INTERNAL_DB',
  'REST_API',
  'GRAPHQL',
  'FILE_IMPORT',
  'WEBHOOK',
]);
export const DataConnectorOwnerTypeEnum = z.enum(['SYSTEM', 'ADMIN']);

export const DataConnectorSchema = z.object({
  id: z.string().uuid(),
  connectorCode: z.string(),
  connectorName: z.string(),
  connectorType: DataConnectorTypeEnum,
  category: z.string(),
  endpointConfig: z.record(z.unknown()).nullable().optional(),
  queryTemplates: z.record(z.unknown()).nullable().optional(),
  responseMapping: z.record(z.unknown()).nullable().optional(),
  freshnessPolicy: z.record(z.unknown()).nullable().optional(),
  rateLimitConfig: z.record(z.unknown()).nullable().optional(),
  healthCheckConfig: z.record(z.unknown()).nullable().optional(),
  fallbackConnectorCode: z.string().nullable().optional(),
  ownerType: DataConnectorOwnerTypeEnum,
  isActive: z.boolean(),
  version: z.number().int(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateDataConnectorSchema = z.object({
  connectorCode: z.string().regex(/^[A-Z0-9_]{3,120}$/),
  connectorName: z.string().min(1).max(120),
  connectorType: DataConnectorTypeEnum,
  category: z.string().min(1).max(60),
  endpointConfig: z.record(z.unknown()).optional(),
  queryTemplates: z.record(z.unknown()).optional(),
  responseMapping: z.record(z.unknown()).optional(),
  freshnessPolicy: z.record(z.unknown()).optional(),
  rateLimitConfig: z.record(z.unknown()).optional(),
  healthCheckConfig: z.record(z.unknown()).optional(),
  fallbackConnectorCode: z
    .string()
    .regex(/^[A-Z0-9_]{3,120}$/)
    .optional(),
  ownerType: DataConnectorOwnerTypeEnum.default('SYSTEM'),
});

export const UpdateDataConnectorSchema = z.object({
  connectorName: z.string().min(1).max(120).optional(),
  connectorType: DataConnectorTypeEnum.optional(),
  category: z.string().min(1).max(60).optional(),
  endpointConfig: z.record(z.unknown()).optional(),
  queryTemplates: z.record(z.unknown()).optional(),
  responseMapping: z.record(z.unknown()).optional(),
  freshnessPolicy: z.record(z.unknown()).optional(),
  rateLimitConfig: z.record(z.unknown()).optional(),
  healthCheckConfig: z.record(z.unknown()).optional(),
  fallbackConnectorCode: z
    .string()
    .regex(/^[A-Z0-9_]{3,120}$/)
    .optional()
    .nullable(),
  ownerType: DataConnectorOwnerTypeEnum.optional(),
  isActive: z.boolean().optional(),
});

export const DataConnectorQuerySchema = z.object({
  keyword: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  connectorType: DataConnectorTypeEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

export const DataConnectorPageSchema = z.object({
  data: z.array(DataConnectorSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const DataConnectorHealthCheckSchema = z.object({
  timeoutMs: z.coerce.number().int().min(100).max(10000).default(3000),
});

export const DataConnectorHealthCheckResultSchema = z.object({
  connectorId: z.string().uuid(),
  connectorCode: z.string(),
  healthy: z.boolean(),
  latencyMs: z.number().int(),
  checkedAt: z.string(),
  message: z.string().optional(),
});

// ── 参数变更审计 ──

export const ParameterChangeOperationEnum = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESET_TO_DEFAULT',
  'BATCH_RESET',
  'PUBLISH',
]);

export const ParameterChangeLogSchema = z.object({
  id: z.string().uuid(),
  parameterSetId: z.string().uuid(),
  parameterItemId: z.string().uuid().nullable().optional(),
  operation: ParameterChangeOperationEnum,
  fieldPath: z.string().nullable().optional(),
  oldValue: z.unknown().nullable().optional(),
  newValue: z.unknown().nullable().optional(),
  changeReason: z.string().nullable().optional(),
  changedByUserId: z.string(),
  createdAt: z.date().optional(),
});

export const ParameterChangeLogQuerySchema = z.object({
  parameterSetId: z.string().uuid().optional(),
  parameterItemId: z.string().uuid().optional(),
  operation: ParameterChangeOperationEnum.optional(),
  changedByUserId: z.string().optional(),
  createdAtFrom: z.coerce.date().optional(),
  createdAtTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const ParameterChangeLogPageSchema = z.object({
  data: z.array(ParameterChangeLogSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

// ── 参数覆盖 Diff ──

export const ParameterOverrideDiffItemSchema = z.object({
  paramCode: z.string(),
  paramName: z.string(),
  scopeLevel: ParameterScopeLevelEnum,
  templateDefault: z.unknown().nullable().optional(),
  currentValue: z.unknown().nullable().optional(),
  isOverridden: z.boolean(),
  overrideSource: z.string().nullable().optional(),
});

export const ParameterOverrideDiffSchema = z.object({
  parameterSetId: z.string().uuid(),
  items: z.array(ParameterOverrideDiffItemSchema),
  overriddenCount: z.number().int(),
  totalCount: z.number().int(),
});

// ── 批量重置请求 ──

export const BatchResetParameterItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(200).optional(),
  scopeLevel: ParameterScopeLevelEnum.optional(),
  scopeValue: z.string().max(120).optional(),
  reason: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  const hasItemIds = Boolean(value.itemIds && value.itemIds.length > 0);
  const hasScope = Boolean(value.scopeLevel);
  if (!hasItemIds && !hasScope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'itemIds 与 scopeLevel 至少提供一个',
      path: ['itemIds'],
    });
  }
});

export const ParameterImpactWorkflowSchema = z.object({
  workflowDefinitionId: z.string().uuid(),
  workflowCode: z.string(),
  workflowName: z.string(),
  workflowVersionId: z.string().uuid(),
  versionCode: z.string(),
});

export const ParameterImpactAgentSchema = z.object({
  id: z.string().uuid(),
  agentCode: z.string(),
  agentName: z.string(),
  roleType: z.string(),
});

export const ParameterImpactPreviewSchema = z.object({
  parameterSetId: z.string().uuid(),
  setCode: z.string(),
  workflowCount: z.number().int(),
  agentCount: z.number().int(),
  workflows: z.array(ParameterImpactWorkflowSchema),
  agents: z.array(ParameterImpactAgentSchema),
});

export type ParameterChangeOperation = z.infer<typeof ParameterChangeOperationEnum>;
export type ParameterChangeLogDto = z.infer<typeof ParameterChangeLogSchema>;
export type ParameterChangeLogQueryDto = z.infer<typeof ParameterChangeLogQuerySchema>;
export type ParameterChangeLogPageDto = z.infer<typeof ParameterChangeLogPageSchema>;
export type ParameterOverrideDiffItemDto = z.infer<typeof ParameterOverrideDiffItemSchema>;
export type ParameterOverrideDiffDto = z.infer<typeof ParameterOverrideDiffSchema>;
export type BatchResetParameterItemsDto = z.infer<typeof BatchResetParameterItemsSchema>;
export type ParameterImpactWorkflowDto = z.infer<typeof ParameterImpactWorkflowSchema>;
export type ParameterImpactAgentDto = z.infer<typeof ParameterImpactAgentSchema>;
export type ParameterImpactPreviewDto = z.infer<typeof ParameterImpactPreviewSchema>;

export type ParameterType = z.infer<typeof ParameterTypeEnum>;
export type ParameterOwnerType = z.infer<typeof ParameterOwnerTypeEnum>;
export type ParameterScopeLevel = z.infer<typeof ParameterScopeLevelEnum>;
export type ParameterSetDto = z.infer<typeof ParameterSetSchema>;
export type ParameterItemDto = z.infer<typeof ParameterItemSchema>;
export type ParameterSetDetailDto = z.infer<typeof ParameterSetDetailSchema>;
export type CreateParameterSetDto = z.infer<typeof CreateParameterSetSchema>;
export type UpdateParameterSetDto = z.infer<typeof UpdateParameterSetSchema>;
export type CreateParameterItemDto = z.infer<typeof CreateParameterItemSchema>;
export type UpdateParameterItemDto = z.infer<typeof UpdateParameterItemSchema>;
export type ParameterSetQueryDto = z.infer<typeof ParameterSetQuerySchema>;
export type ParameterSetPageDto = z.infer<typeof ParameterSetPageSchema>;
export type PublishParameterSetDto = z.infer<typeof PublishParameterSetSchema>;
export type ResolveParameterSetDto = z.infer<typeof ResolveParameterSetSchema>;
export type ResolveParameterSetResultDto = z.infer<typeof ResolveParameterSetResultSchema>;
export type DataConnectorType = z.infer<typeof DataConnectorTypeEnum>;
export type DataConnectorOwnerType = z.infer<typeof DataConnectorOwnerTypeEnum>;
export type DataConnectorDto = z.infer<typeof DataConnectorSchema>;
export type CreateDataConnectorDto = z.infer<typeof CreateDataConnectorSchema>;
export type UpdateDataConnectorDto = z.infer<typeof UpdateDataConnectorSchema>;
export type DataConnectorQueryDto = z.infer<typeof DataConnectorQuerySchema>;
export type DataConnectorPageDto = z.infer<typeof DataConnectorPageSchema>;
export type DataConnectorHealthCheckDto = z.infer<typeof DataConnectorHealthCheckSchema>;
export type DataConnectorHealthCheckResultDto = z.infer<
  typeof DataConnectorHealthCheckResultSchema
>;
