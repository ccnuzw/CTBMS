import { DataConnectorQuickStartTemplateQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class DataConnectorQuickStartTemplateQueryRequest extends createZodDto(
  DataConnectorQuickStartTemplateQuerySchema,
) {}
