import { AgentPromptTemplateQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class AgentPromptTemplateQueryRequest extends createZodDto(AgentPromptTemplateQuerySchema) { }
