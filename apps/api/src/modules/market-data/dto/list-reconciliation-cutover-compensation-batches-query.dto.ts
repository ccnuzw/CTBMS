import { ListReconciliationCutoverCompensationBatchesQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationCutoverCompensationBatchesQueryRequest extends createZodDto(
  ListReconciliationCutoverCompensationBatchesQuerySchema,
) {}
