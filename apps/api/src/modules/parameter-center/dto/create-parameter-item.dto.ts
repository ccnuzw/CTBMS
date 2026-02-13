import { CreateParameterItemSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateParameterItemRequest extends createZodDto(CreateParameterItemSchema) {}
