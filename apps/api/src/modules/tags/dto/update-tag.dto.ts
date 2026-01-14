import { UpdateTagSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateTagRequest extends createZodDto(UpdateTagSchema) { }
