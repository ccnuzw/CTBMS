import { z } from 'zod';
import {
  DataConnectorOwnerTypeEnum,
  DataConnectorQuickStartTemplateSchema,
  DataConnectorSourceDomainEnum,
} from './parameter-rule';

// ── 模板分类 ──

export const TemplateCategoryEnum = z.enum([
  'TRADING',
  'RISK_MANAGEMENT',
  'ANALYSIS',
  'MONITORING',
  'REPORTING',
  'CUSTOM',
]);

// ── 模板状态 ──

export const TemplateStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

// ── Schemas ──

export const TemplateCatalogSchema = z.object({
  id: z.string().uuid(),
  templateCode: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: TemplateCategoryEnum,
  status: TemplateStatusEnum,
  tags: z.array(z.string()).optional(),
  coverImageUrl: z.string().nullable().optional(),
  dslSnapshot: z.record(z.unknown()),
  nodeCount: z.number().int(),
  edgeCount: z.number().int(),
  usageCount: z.number().int(),
  rating: z.number().nullable().optional(),
  authorUserId: z.string(),
  authorName: z.string().nullable().optional(),
  isOfficial: z.boolean(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateTemplateCatalogSchema = z.object({
  templateCode: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  category: TemplateCategoryEnum,
  tags: z.array(z.string().max(30)).max(10).optional(),
  coverImageUrl: z.string().url().optional(),
  sourceWorkflowDefinitionId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
});

export const UpdateTemplateCatalogSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  category: TemplateCategoryEnum.optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  coverImageUrl: z.string().url().optional(),
});

export const TemplateCatalogQuerySchema = z.object({
  category: TemplateCategoryEnum.optional(),
  status: TemplateStatusEnum.optional(),
  keyword: z.string().max(120).optional(),
  isOfficial: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TemplateCatalogPageSchema = z.object({
  data: z.array(TemplateCatalogSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const CopyTemplateSchema = z.object({
  templateId: z.string().uuid(),
  newName: z.string().min(1).max(120).optional(),
  newWorkflowId: z.string().min(1).max(60).optional(),
});

export const TemplateCatalogQuickstartBusinessTemplateCodeEnum = z.enum([
  'WEEKLY_MARKET_REVIEW',
  'PRICE_ALERT_MONITORING',
  'WEATHER_LOGISTICS_IMPACT',
  'STRATEGY_BACKTEST',
]);

export const TemplateCatalogQuickstartBusinessTemplatesQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
});

export const TemplateCatalogQuickstartConnectorDraftSchema =
  DataConnectorQuickStartTemplateSchema.extend({
    connectorCode: z.string().regex(/^[A-Z0-9_]{3,120}$/),
    connectorName: z.string().min(1).max(120),
    ownerType: DataConnectorOwnerTypeEnum.default('SYSTEM'),
  });

export const TemplateCatalogQuickstartBusinessTemplateSchema = z.object({
  code: TemplateCatalogQuickstartBusinessTemplateCodeEnum,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  category: TemplateCategoryEnum,
  tags: z.array(z.string()).max(12),
  kpiFocus: z.array(z.string()).max(8),
  recommendedConnectors: z.array(DataConnectorSourceDomainEnum).max(12),
  connectorTemplates: z.array(DataConnectorQuickStartTemplateSchema).max(12),
  connectorCreateDrafts: z.array(TemplateCatalogQuickstartConnectorDraftSchema).max(12),
  outputArtifacts: z.array(z.string()).max(8),
});

export const TemplateCatalogQuickstartBusinessTemplatesResponseSchema = z.object({
  templates: z.array(TemplateCatalogQuickstartBusinessTemplateSchema),
  total: z.number().int().min(0),
});

// ── Types ──

export type TemplateCategory = z.infer<typeof TemplateCategoryEnum>;
export type TemplateStatus = z.infer<typeof TemplateStatusEnum>;
export type TemplateCatalogDto = z.infer<typeof TemplateCatalogSchema>;
export type CreateTemplateCatalogDto = z.infer<typeof CreateTemplateCatalogSchema>;
export type UpdateTemplateCatalogDto = z.infer<typeof UpdateTemplateCatalogSchema>;
export type TemplateCatalogQueryDto = z.infer<typeof TemplateCatalogQuerySchema>;
export type TemplateCatalogPageDto = z.infer<typeof TemplateCatalogPageSchema>;
export type CopyTemplateDto = z.infer<typeof CopyTemplateSchema>;
export type TemplateCatalogQuickstartBusinessTemplateCode = z.infer<
  typeof TemplateCatalogQuickstartBusinessTemplateCodeEnum
>;
export type TemplateCatalogQuickstartBusinessTemplatesQueryDto = z.infer<
  typeof TemplateCatalogQuickstartBusinessTemplatesQuerySchema
>;
export type TemplateCatalogQuickstartConnectorDraftDto = z.infer<
  typeof TemplateCatalogQuickstartConnectorDraftSchema
>;
export type TemplateCatalogQuickstartBusinessTemplateDto = z.infer<
  typeof TemplateCatalogQuickstartBusinessTemplateSchema
>;
export type TemplateCatalogQuickstartBusinessTemplatesResponseDto = z.infer<
  typeof TemplateCatalogQuickstartBusinessTemplatesResponseSchema
>;
