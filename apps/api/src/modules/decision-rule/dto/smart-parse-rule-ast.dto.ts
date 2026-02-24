import { createZodDto } from 'nestjs-zod';
import { SmartParseRuleASTSchema } from '@packages/types';

export class SmartParseRuleASTRequest extends createZodDto(SmartParseRuleASTSchema) { }
