import { DataConnectorHealthCheckSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class DataConnectorHealthCheckRequest extends createZodDto(DataConnectorHealthCheckSchema) {}
