import { UpdateParameterSetSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateParameterSetRequest extends createZodDto(UpdateParameterSetSchema) {}
