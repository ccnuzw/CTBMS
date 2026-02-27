import { ReconciliationM1ReadinessQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ReconciliationM1ReadinessQueryRequest extends createZodDto(
  ReconciliationM1ReadinessQuerySchema,
) {}
