import { AttachTagsSchema, DetachTagSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class AttachTagsRequest extends createZodDto(AttachTagsSchema) { }

export class DetachTagRequest extends createZodDto(DetachTagSchema) { }
