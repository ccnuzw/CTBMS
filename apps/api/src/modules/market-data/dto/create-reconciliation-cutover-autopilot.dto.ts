import { CreateReconciliationCutoverAutopilotSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReconciliationCutoverAutopilotRequest extends createZodDto(
  CreateReconciliationCutoverAutopilotSchema,
) {}
