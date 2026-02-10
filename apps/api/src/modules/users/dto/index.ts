import {
  CreateUserSchema,
  UpdateUserSchema,
  AssignRolesSchema,
  UserQuerySchema,
  BatchAssignUsersSchema,
} from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateUserRequest extends createZodDto(CreateUserSchema) {}
export class UpdateUserRequest extends createZodDto(UpdateUserSchema) {}
export class AssignRolesRequest extends createZodDto(AssignRolesSchema) {}
export class UserQueryRequest extends createZodDto(UserQuerySchema) {}
export class BatchAssignUsersRequest extends createZodDto(BatchAssignUsersSchema) {}
