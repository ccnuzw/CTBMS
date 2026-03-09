import { ReconciliationSingleWriteGovernanceQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';


export class ReconciliationSingleWriteGovernanceQueryRequest extends createZodDto(
  ReconciliationSingleWriteGovernanceQuerySchema,
) {}
