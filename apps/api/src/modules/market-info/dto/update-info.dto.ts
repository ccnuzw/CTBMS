import { UpdateInfoSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateInfoRequest extends createZodDto(UpdateInfoSchema) { }
