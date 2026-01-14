import { CreateDepartmentSchema, UpdateDepartmentSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateDepartmentRequest extends createZodDto(CreateDepartmentSchema) { }
export class UpdateDepartmentRequest extends createZodDto(UpdateDepartmentSchema) { }
