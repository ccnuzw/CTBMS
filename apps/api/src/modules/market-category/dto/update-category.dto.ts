import { UpdateCategorySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateCategoryRequest extends createZodDto(UpdateCategorySchema) { }
