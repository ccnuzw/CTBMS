import { CreateReconciliationRollbackDrillSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReconciliationRollbackDrillRequest extends createZodDto(
  CreateReconciliationRollbackDrillSchema,
) {}
