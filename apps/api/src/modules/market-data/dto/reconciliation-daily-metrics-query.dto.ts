import { ReconciliationDailyMetricsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationDailyMetricsQueryRequest extends createZodDto(
  ReconciliationDailyMetricsQuerySchema,
) {}
