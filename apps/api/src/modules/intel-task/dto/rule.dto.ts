import { createZodDto } from 'nestjs-zod';
import { CreateIntelTaskRuleSchema, UpdateIntelTaskRuleSchema } from '@packages/types';

export class CreateIntelTaskRuleDto extends createZodDto(CreateIntelTaskRuleSchema) { }
export class UpdateIntelTaskRuleDto extends createZodDto(UpdateIntelTaskRuleSchema) { }
