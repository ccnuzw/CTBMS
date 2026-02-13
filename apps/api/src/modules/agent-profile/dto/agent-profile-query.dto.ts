import { AgentProfileQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class AgentProfileQueryRequest extends createZodDto(AgentProfileQuerySchema) {}
