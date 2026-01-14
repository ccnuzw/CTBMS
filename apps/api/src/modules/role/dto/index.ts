import { CreateRoleSchema, UpdateRoleSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateRoleRequest extends createZodDto(CreateRoleSchema) { }
export class UpdateRoleRequest extends createZodDto(UpdateRoleSchema) { }
