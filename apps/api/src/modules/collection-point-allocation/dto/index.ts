import { createZodDto } from 'nestjs-zod';
import {
  CreateCollectionPointAllocationSchema,
  BatchCreateAllocationSchema,
  UpdateCollectionPointAllocationSchema,
  QueryCollectionPointAllocationSchema,
} from '@packages/types';

export class CreateCollectionPointAllocationDto extends createZodDto(CreateCollectionPointAllocationSchema) {}

export class BatchCreateAllocationDto extends createZodDto(BatchCreateAllocationSchema) {}

export class UpdateCollectionPointAllocationDto extends createZodDto(UpdateCollectionPointAllocationSchema) {}

export class QueryCollectionPointAllocationDto extends createZodDto(QueryCollectionPointAllocationSchema) {}
