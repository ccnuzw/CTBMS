import { WorkflowExecutionQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class WorkflowExecutionQueryRequest extends createZodDto(WorkflowExecutionQuerySchema) { }
