import { ReconciliationM1ReadinessReportQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationM1ReadinessReportQueryRequest extends createZodDto(
  ReconciliationM1ReadinessReportQuerySchema,
) {}
