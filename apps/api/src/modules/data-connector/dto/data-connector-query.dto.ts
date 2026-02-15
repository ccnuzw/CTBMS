import { DataConnectorQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class DataConnectorQueryRequest extends createZodDto(DataConnectorQuerySchema) {}
