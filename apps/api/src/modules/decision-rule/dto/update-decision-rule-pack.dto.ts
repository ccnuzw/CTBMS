import { UpdateDecisionRulePackSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class UpdateDecisionRulePackRequest extends createZodDto(UpdateDecisionRulePackSchema) { }
