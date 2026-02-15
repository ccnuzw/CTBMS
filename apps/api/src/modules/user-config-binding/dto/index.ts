import { createZodDto } from 'nestjs-zod';
import {
  CreateUserConfigBindingSchema,
  UpdateUserConfigBindingSchema,
  UserConfigBindingQuerySchema,
} from '@packages/types';

export class CreateUserConfigBindingRequest extends createZodDto(CreateUserConfigBindingSchema) {}
export class UpdateUserConfigBindingRequest extends createZodDto(UpdateUserConfigBindingSchema) {}
export class UserConfigBindingQueryRequest extends createZodDto(UserConfigBindingQuerySchema) {}
