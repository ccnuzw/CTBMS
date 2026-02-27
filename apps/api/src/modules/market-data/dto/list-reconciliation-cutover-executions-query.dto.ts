import { ListReconciliationCutoverExecutionsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationCutoverExecutionsQueryRequest extends createZodDto(
  ListReconciliationCutoverExecutionsQuerySchema,
) {}
