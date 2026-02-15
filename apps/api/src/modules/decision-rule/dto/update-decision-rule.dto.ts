import { UpdateDecisionRuleSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDecisionRuleRequest extends createZodDto(UpdateDecisionRuleSchema) { }
