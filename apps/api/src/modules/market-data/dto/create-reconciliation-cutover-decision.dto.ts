import { CreateReconciliationCutoverDecisionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReconciliationCutoverDecisionRequest extends createZodDto(
  CreateReconciliationCutoverDecisionSchema,
) {}
