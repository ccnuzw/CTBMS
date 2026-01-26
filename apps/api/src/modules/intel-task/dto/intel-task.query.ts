import { createZodDto } from 'nestjs-zod';
import { IntelTaskQuerySchema } from '@packages/types';

export class IntelTaskQueryDto extends createZodDto(IntelTaskQuerySchema) { }
