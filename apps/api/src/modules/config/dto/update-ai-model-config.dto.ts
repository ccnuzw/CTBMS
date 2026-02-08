import { UpdateAIConfigSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateAIModelConfigDto extends createZodDto(UpdateAIConfigSchema) {}
