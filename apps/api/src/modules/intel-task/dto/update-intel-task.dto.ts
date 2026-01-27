import { createZodDto } from 'nestjs-zod';
import { UpdateIntelTaskSchema } from '@packages/types';

export class UpdateIntelTaskDto extends createZodDto(UpdateIntelTaskSchema) { }
