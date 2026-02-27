import { CreateReconciliationM1ReadinessReportSnapshotSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReconciliationM1ReadinessReportSnapshotRequest extends createZodDto(
  CreateReconciliationM1ReadinessReportSnapshotSchema,
) {}
