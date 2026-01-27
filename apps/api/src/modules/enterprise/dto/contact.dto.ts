import { CreateContactSchema, UpdateContactSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateContactDto extends createZodDto(CreateContactSchema) { }
export class UpdateContactDto extends createZodDto(UpdateContactSchema) { }
