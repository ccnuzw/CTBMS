import { RetryReconciliationCutoverCompensationBatchSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class RetryReconciliationCutoverCompensationBatchRequest extends createZodDto(
  RetryReconciliationCutoverCompensationBatchSchema,
) {}
