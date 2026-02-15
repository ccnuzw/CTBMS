import { CreateAgentProfileSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateAgentProfileRequest extends createZodDto(CreateAgentProfileSchema) {}
