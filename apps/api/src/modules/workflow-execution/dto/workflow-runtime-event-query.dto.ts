import { WorkflowRuntimeEventQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class WorkflowRuntimeEventQueryRequest extends createZodDto(WorkflowRuntimeEventQuerySchema) { }
