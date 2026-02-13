import { createZodDto } from 'nestjs-zod';
import { BatchResetParameterItemsSchema } from '@packages/types';

export class BatchResetParameterItemsRequest extends createZodDto(BatchResetParameterItemsSchema) {}
