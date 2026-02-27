import { ReconciliationReadCoverageQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationReadCoverageQueryRequest extends createZodDto(
  ReconciliationReadCoverageQuerySchema,
) {}
