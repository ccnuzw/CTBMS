import { PublishAgentProfileSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class PublishAgentProfileRequest extends createZodDto(PublishAgentProfileSchema) {}
