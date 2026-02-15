import { UpdateAgentProfileSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAgentProfileRequest extends createZodDto(UpdateAgentProfileSchema) {}
