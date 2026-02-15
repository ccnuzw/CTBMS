import { DecisionRulePackQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class DecisionRulePackQueryRequest extends createZodDto(DecisionRulePackQuerySchema) { }
