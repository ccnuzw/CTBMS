import { createZodDto } from 'nestjs-zod';
import {
  CreateTemplateCatalogSchema,
  UpdateTemplateCatalogSchema,
  TemplateCatalogQuerySchema,
  CopyTemplateSchema,
  TemplateCatalogQuickstartBusinessTemplatesQuerySchema,
} from '@packages/types';

export class CreateTemplateCatalogRequest extends createZodDto(CreateTemplateCatalogSchema) {}
export class UpdateTemplateCatalogRequest extends createZodDto(UpdateTemplateCatalogSchema) {}
export class TemplateCatalogQueryRequest extends createZodDto(TemplateCatalogQuerySchema) {}
export class CopyTemplateRequest extends createZodDto(CopyTemplateSchema) {}
export class TemplateCatalogQuickstartBusinessTemplatesQueryRequest extends createZodDto(
  TemplateCatalogQuickstartBusinessTemplatesQuerySchema,
) {}
