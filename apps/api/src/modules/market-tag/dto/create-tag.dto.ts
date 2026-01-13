import { CreateTagSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateTagRequest extends createZodDto(CreateTagSchema) { }
