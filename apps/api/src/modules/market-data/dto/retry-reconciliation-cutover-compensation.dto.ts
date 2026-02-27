import { RetryReconciliationCutoverCompensationSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class RetryReconciliationCutoverCompensationRequest extends createZodDto(
  RetryReconciliationCutoverCompensationSchema,
) {}
