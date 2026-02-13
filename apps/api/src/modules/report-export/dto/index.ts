import { createZodDto } from 'nestjs-zod';
import {
  ExportDebateReportSchema,
  ExportTaskQuerySchema,
} from '@packages/types';

export class ExportDebateReportRequest extends createZodDto(ExportDebateReportSchema) {}
export class ExportTaskQueryRequest extends createZodDto(ExportTaskQuerySchema) {}
