import { CreateTagGroupSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateTagGroupRequest extends createZodDto(CreateTagGroupSchema) { }
