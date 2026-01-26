import { createZodDto } from 'nestjs-zod';
import { CreateIntelTaskSchema } from '@packages/types';

export class CreateIntelTaskDto extends createZodDto(CreateIntelTaskSchema) { }
