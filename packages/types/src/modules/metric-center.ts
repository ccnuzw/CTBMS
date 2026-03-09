import { z } from 'zod';

const MetricVariableKeySchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value), {
    message: '变量名仅允许字母、数字、下划线，且以字母或下划线开头',
  });

export const MetricComputeRequestSchema = z.object({
  metricCode: z.string().min(1).max(80),
  metricVersion: z.string().min(1).max(40).optional(),
  variables: z
    .record(MetricVariableKeySchema, z.coerce.number())
    .refine((value) => Object.keys(value).length > 0, {
      message: 'variables 不能为空',
    }),
  dimensions: z.record(z.unknown()).optional(),
  dataTime: z.string().datetime().optional(),
  persistSnapshot: z.boolean().default(true),
  qualityScore: z.coerce.number().min(0).max(1).optional(),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
});

export const MetricComputeResponseSchema = z.object({
  metricCatalogId: z.string().uuid(),
  metricCode: z.string(),
  metricVersion: z.string(),
  value: z.number(),
  dataTime: z.string().datetime(),
  snapshotId: z.string().uuid().optional(),
});

export const MetricSnapshotRunRequestSchema = z.object({
  metricCodes: z.array(z.string().min(1).max(80)).min(1).max(50).optional(),
  dryRun: z.boolean().default(false),
});

export type MetricComputeRequestDto = z.infer<typeof MetricComputeRequestSchema>;
export type MetricComputeResponseDto = z.infer<typeof MetricComputeResponseSchema>;
export type MetricSnapshotRunRequestDto = z.infer<typeof MetricSnapshotRunRequestSchema>;
