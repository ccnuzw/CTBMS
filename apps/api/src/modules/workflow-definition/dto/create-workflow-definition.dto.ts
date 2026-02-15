import { CreateWorkflowDefinitionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkflowDefinitionRequest extends createZodDto(CreateWorkflowDefinitionSchema) { }
