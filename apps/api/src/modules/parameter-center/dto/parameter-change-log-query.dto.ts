import { createZodDto } from 'nestjs-zod';
import { ParameterChangeLogQuerySchema } from '@packages/types';

export class ParameterChangeLogQueryRequest extends createZodDto(ParameterChangeLogQuerySchema) {}
