import { CreateDataConnectorSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateDataConnectorRequest extends createZodDto(CreateDataConnectorSchema) {}
