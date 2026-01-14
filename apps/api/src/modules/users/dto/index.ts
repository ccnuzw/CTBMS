import { CreateUserSchema, UpdateUserSchema, AssignRolesSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateUserRequest extends createZodDto(CreateUserSchema) { }
export class UpdateUserRequest extends createZodDto(UpdateUserSchema) { }
export class AssignRolesRequest extends createZodDto(AssignRolesSchema) { }
