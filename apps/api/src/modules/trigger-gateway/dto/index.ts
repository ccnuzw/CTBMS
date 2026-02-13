import { createZodDto } from 'nestjs-zod';
import {
  CreateTriggerConfigSchema,
  UpdateTriggerConfigSchema,
  TriggerConfigQuerySchema,
  TriggerLogQuerySchema,
} from '@packages/types';

export class CreateTriggerConfigDto extends createZodDto(CreateTriggerConfigSchema) {}
export class UpdateTriggerConfigDto extends createZodDto(UpdateTriggerConfigSchema) {}
export class TriggerConfigQueryDto extends createZodDto(TriggerConfigQuerySchema) {}
export class TriggerLogQueryDto extends createZodDto(TriggerLogQuerySchema) {}
