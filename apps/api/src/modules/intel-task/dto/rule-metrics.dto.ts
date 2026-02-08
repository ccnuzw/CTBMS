import { createZodDto } from 'nestjs-zod';
import { GetRuleMetricsSchema } from '@packages/types';

export class GetRuleMetricsDto extends createZodDto(GetRuleMetricsSchema) { }
