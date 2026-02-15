import { PublishDecisionRulePackSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class PublishDecisionRulePackRequest extends createZodDto(PublishDecisionRulePackSchema) {}
