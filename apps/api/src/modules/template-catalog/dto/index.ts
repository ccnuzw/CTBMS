import { createZodDto } from 'nestjs-zod';
import {
  CreateTemplateCatalogSchema,
  UpdateTemplateCatalogSchema,
  TemplateCatalogQuerySchema,
  CopyTemplateSchema,
  TemplateCatalogQuickstartBusinessTemplatesQuerySchema,
} from '@packages/types';
import { z } from 'zod';

export class CreateTemplateCatalogRequest extends createZodDto(CreateTemplateCatalogSchema) {}
export class UpdateTemplateCatalogRequest extends createZodDto(UpdateTemplateCatalogSchema) {}
export class TemplateCatalogQueryRequest extends createZodDto(TemplateCatalogQuerySchema) {}
export class CopyTemplateRequest extends createZodDto(CopyTemplateSchema) {}
export class TemplateCatalogQuickstartBusinessTemplatesQueryRequest extends createZodDto(
  TemplateCatalogQuickstartBusinessTemplatesQuerySchema,
) {}
const TemplateCatalogQuickstartBusinessTemplateAcceptanceChecklistQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  strictContract: z.coerce.boolean().default(true),
});
export class TemplateCatalogQuickstartBusinessTemplateAcceptanceChecklistQueryRequest extends createZodDto(
  TemplateCatalogQuickstartBusinessTemplateAcceptanceChecklistQuerySchema,
) {}
