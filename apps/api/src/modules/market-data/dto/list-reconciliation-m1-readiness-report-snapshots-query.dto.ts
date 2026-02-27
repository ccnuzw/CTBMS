import { ListReconciliationM1ReadinessReportSnapshotsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationM1ReadinessReportSnapshotsQueryRequest extends createZodDto(
  ListReconciliationM1ReadinessReportSnapshotsQuerySchema,
) {}
