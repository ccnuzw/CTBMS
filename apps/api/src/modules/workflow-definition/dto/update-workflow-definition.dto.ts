import { UpdateWorkflowDefinitionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateWorkflowDefinitionRequest extends createZodDto(UpdateWorkflowDefinitionSchema) { }
