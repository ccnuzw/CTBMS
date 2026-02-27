import { ExecuteReconciliationRollbackSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ExecuteReconciliationRollbackRequest extends createZodDto(
  ExecuteReconciliationRollbackSchema,
) {}
