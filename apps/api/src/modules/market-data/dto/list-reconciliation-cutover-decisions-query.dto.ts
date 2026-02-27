import { ListReconciliationCutoverDecisionsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationCutoverDecisionsQueryRequest extends createZodDto(
  ListReconciliationCutoverDecisionsQuerySchema,
) {}
