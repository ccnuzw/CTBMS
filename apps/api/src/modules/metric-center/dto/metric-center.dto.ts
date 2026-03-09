import {
  MetricComputeRequestSchema,
  MetricSnapshotRunRequestSchema,
} from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class MetricComputeRequest extends createZodDto(MetricComputeRequestSchema) {}
export class MetricSnapshotRunRequest extends createZodDto(MetricSnapshotRunRequestSchema) {}
