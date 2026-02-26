import { CreateReconciliationJobSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReconciliationJobRequest extends createZodDto(CreateReconciliationJobSchema) {}
