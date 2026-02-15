import { WorkflowDefinitionQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class WorkflowDefinitionQueryRequest extends createZodDto(WorkflowDefinitionQuerySchema) { }
