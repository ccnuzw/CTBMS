import { createZodDto } from 'nestjs-zod';
import { GetCalendarPreviewSchema } from '@packages/types';

export class GetCalendarPreviewDto extends createZodDto(GetCalendarPreviewSchema) { }
