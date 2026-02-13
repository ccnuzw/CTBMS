import { createZodDto } from 'nestjs-zod';
import { ExecutionAnalyticsQuerySchema } from '@packages/types';

export class ExecutionAnalyticsQueryRequest extends createZodDto(ExecutionAnalyticsQuerySchema) {}
