import { UpdateDataConnectorSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDataConnectorRequest extends createZodDto(UpdateDataConnectorSchema) {}
