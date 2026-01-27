import { CreateOrganizationSchema, UpdateOrganizationSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateOrganizationRequest extends createZodDto(CreateOrganizationSchema) { }
export class UpdateOrganizationRequest extends createZodDto(UpdateOrganizationSchema) { }
