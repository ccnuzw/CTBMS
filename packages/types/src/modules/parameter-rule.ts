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
  source: z.string().nullable().optional(),
  changeReason: z.string().nullable().optional(),
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
  source: z.string().max(120).optional(),
  changeReason: z.string().max(500).optional(),
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
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
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
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
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

export type ParameterType = z.infer<typeof ParameterTypeEnum>;
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
