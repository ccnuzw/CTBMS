import { ReconciliationCutoverExecutionOverviewQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationCutoverExecutionOverviewQueryRequest extends createZodDto(
  ReconciliationCutoverExecutionOverviewQuerySchema,
) {}
