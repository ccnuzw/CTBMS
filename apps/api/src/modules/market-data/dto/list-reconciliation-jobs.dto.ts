import { ListReconciliationJobsQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ListReconciliationJobsRequest extends createZodDto(
  ListReconciliationJobsQuerySchema,
) {}
