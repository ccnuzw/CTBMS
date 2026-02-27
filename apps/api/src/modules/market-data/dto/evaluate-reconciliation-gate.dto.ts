import { EvaluateReconciliationGateSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class EvaluateReconciliationGateRequest extends createZodDto(
  EvaluateReconciliationGateSchema,
) {}
