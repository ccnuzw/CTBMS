import { ReconciliationMetricsSnapshotSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationMetricsSnapshotRequest extends createZodDto(
  ReconciliationMetricsSnapshotSchema,
) {}
