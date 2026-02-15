import { ResolveParameterSetSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ResolveParameterSetRequest extends createZodDto(ResolveParameterSetSchema) {}
