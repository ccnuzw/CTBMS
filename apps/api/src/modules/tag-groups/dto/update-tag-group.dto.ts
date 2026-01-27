import { UpdateTagGroupSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateTagGroupRequest extends createZodDto(UpdateTagGroupSchema) { }
