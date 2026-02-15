import { PublishParameterSetSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class PublishParameterSetRequest extends createZodDto(PublishParameterSetSchema) {}
