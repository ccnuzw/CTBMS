import { CreateInfoSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateInfoRequest extends createZodDto(CreateInfoSchema) { }
