import { CreateAIConfigSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateAIModelConfigDto extends createZodDto(CreateAIConfigSchema) {}
