import { CreateParameterSetSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateParameterSetRequest extends createZodDto(CreateParameterSetSchema) {}
