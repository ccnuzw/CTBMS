import { UpdateAgentPromptTemplateSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAgentPromptTemplateRequest extends createZodDto(UpdateAgentPromptTemplateSchema) { }
