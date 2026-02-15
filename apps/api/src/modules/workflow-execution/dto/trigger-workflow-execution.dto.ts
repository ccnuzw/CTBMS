import { TriggerWorkflowExecutionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class TriggerWorkflowExecutionRequest extends createZodDto(TriggerWorkflowExecutionSchema) { }
