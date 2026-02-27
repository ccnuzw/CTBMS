import { ReconciliationCutoverRuntimeStatusQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationCutoverRuntimeStatusQueryRequest extends createZodDto(
  ReconciliationCutoverRuntimeStatusQuerySchema,
) {}
