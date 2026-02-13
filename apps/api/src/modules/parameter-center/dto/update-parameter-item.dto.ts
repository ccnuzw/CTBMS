import { UpdateParameterItemSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateParameterItemRequest extends createZodDto(UpdateParameterItemSchema) {}
