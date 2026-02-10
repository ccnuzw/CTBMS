import { CreateDecisionRuleSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateDecisionRuleRequest extends createZodDto(CreateDecisionRuleSchema) { }
