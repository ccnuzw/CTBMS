import { UpdateUserSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserRequest extends createZodDto(UpdateUserSchema) { }
