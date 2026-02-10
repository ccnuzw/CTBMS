import { CreateDecisionRulePackSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateDecisionRulePackRequest extends createZodDto(CreateDecisionRulePackSchema) { }
