import { CreateAgentPromptTemplateSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateAgentPromptTemplateRequest extends createZodDto(CreateAgentPromptTemplateSchema) { }
