import { ReconciliationWindowMetricsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationWindowMetricsQueryRequest extends createZodDto(
  ReconciliationWindowMetricsQuerySchema,
) {}
