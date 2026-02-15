import { ParameterSetQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ParameterSetQueryRequest extends createZodDto(ParameterSetQuerySchema) {}
