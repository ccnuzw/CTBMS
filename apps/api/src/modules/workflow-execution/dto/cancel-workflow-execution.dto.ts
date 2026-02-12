import { CancelWorkflowExecutionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CancelWorkflowExecutionRequest extends createZodDto(CancelWorkflowExecutionSchema) { }
