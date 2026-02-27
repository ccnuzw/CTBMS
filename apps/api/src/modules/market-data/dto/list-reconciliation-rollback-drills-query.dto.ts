import { ListReconciliationRollbackDrillsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationRollbackDrillsQueryRequest extends createZodDto(
  ListReconciliationRollbackDrillsQuerySchema,
) {}
