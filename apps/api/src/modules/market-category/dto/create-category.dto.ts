import { CreateCategorySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateCategoryRequest extends createZodDto(CreateCategorySchema) { }
