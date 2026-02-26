import { CancelReconciliationJobSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CancelReconciliationJobRequest extends createZodDto(CancelReconciliationJobSchema) {}
