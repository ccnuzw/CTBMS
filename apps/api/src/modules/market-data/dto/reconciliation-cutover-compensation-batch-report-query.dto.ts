import { ReconciliationCutoverCompensationBatchReportQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationCutoverCompensationBatchReportQueryRequest extends createZodDto(
  ReconciliationCutoverCompensationBatchReportQuerySchema,
) {}
