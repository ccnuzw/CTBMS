import { CreateUserDto } from '@packages/types';
import { CreateUserSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateUserRequest extends createZodDto(CreateUserSchema) { }
