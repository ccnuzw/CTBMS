import { createZodDto } from 'nestjs-zod';
import { GetCalendarSummarySchema } from '@packages/types';

export class GetCalendarSummaryDto extends createZodDto(GetCalendarSummarySchema) { }
