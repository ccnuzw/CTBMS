import { z } from 'zod';
import { WorkflowTriggerTypeEnum } from './workflow';

// ── 枚举 ──

export const TriggerConfigStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ERROR']);

export const CronTriggerStateEnum = z.enum(['IDLE', 'SCHEDULED', 'RUNNING', 'PAUSED']);

export const TriggerLogStatusEnum = z.enum(['SUCCESS', 'FAILED', 'SKIPPED', 'TIMEOUT']);

export const ApiAuthMethodEnum = z.enum(['NONE', 'API_KEY', 'BEARER_TOKEN', 'HMAC']);

export const EventFilterMatchModeEnum = z.enum(['ALL', 'ANY']);

// ── Cron 触发器配置 ──

export const CronTriggerConfigSchema = z.object({
  cronExpression: z.string().min(1, 'cron 表达式不能为空').max(120),
  timezone: z.string().max(60).default('Asia/Shanghai'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  maxConcurrent: z.coerce.number().int().min(1).max(10).default(1),
  catchUpMissed: z.boolean().default(false),
});

// ── API 触发器配置 ──

export const ApiTriggerConfigSchema = z.object({
  authMethod: ApiAuthMethodEnum.default('API_KEY'),
  apiKey: z.string().max(256).optional(),
  allowedIps: z.array(z.string().max(45)).max(50).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(1000).default(60),
  payloadSchema: z.record(z.unknown()).optional(),
});

// ── 事件触发器配置 ──

export const EventFilterRuleSchema = z.object({
  field: z.string().min(1).max(200),
  operator: z.enum(['EQ', 'NEQ', 'CONTAINS', 'NOT_CONTAINS', 'GT', 'LT', 'IN', 'REGEX']),
  value: z.unknown(),
});

export const EventTriggerConfigSchema = z.object({
  eventSource: z.string().min(1).max(200),
  eventType: z.string().min(1).max(200),
  filterRules: z.array(EventFilterRuleSchema).max(20).default([]),
  matchMode: EventFilterMatchModeEnum.default('ALL'),
  debounceMs: z.coerce.number().int().min(0).max(300000).default(0),
});

// ── 触发器配置 ──

export const TriggerConfigSchema = z.object({
  id: z.string().uuid(),
  workflowDefinitionId: z.string().uuid(),
  triggerType: WorkflowTriggerTypeEnum,
  name: z.string(),
  description: z.string().nullable().optional(),
  status: TriggerConfigStatusEnum,
  cronConfig: CronTriggerConfigSchema.nullable().optional(),
  apiConfig: ApiTriggerConfigSchema.nullable().optional(),
  eventConfig: EventTriggerConfigSchema.nullable().optional(),
  paramOverrides: z.record(z.unknown()).nullable().optional(),
  lastTriggeredAt: z.date().nullable().optional(),
  nextFireAt: z.date().nullable().optional(),
  cronState: CronTriggerStateEnum.nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// ── 触发日志 ──

export const TriggerLogSchema = z.object({
  id: z.string().uuid(),
  triggerConfigId: z.string().uuid(),
  workflowExecutionId: z.string().uuid().nullable().optional(),
  triggerType: WorkflowTriggerTypeEnum,
  status: TriggerLogStatusEnum,
  payload: z.record(z.unknown()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  triggeredAt: z.date(),
  createdAt: z.date().optional(),
});

// ── CRUD DTOs ──

export const CreateTriggerConfigSchema = z.object({
  workflowDefinitionId: z.string().uuid(),
  triggerType: WorkflowTriggerTypeEnum,
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  cronConfig: CronTriggerConfigSchema.optional(),
  apiConfig: ApiTriggerConfigSchema.optional(),
  eventConfig: EventTriggerConfigSchema.optional(),
  paramOverrides: z.record(z.unknown()).optional(),
});

export const UpdateTriggerConfigSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  status: TriggerConfigStatusEnum.optional(),
  cronConfig: CronTriggerConfigSchema.optional(),
  apiConfig: ApiTriggerConfigSchema.optional(),
  eventConfig: EventTriggerConfigSchema.optional(),
  paramOverrides: z.record(z.unknown()).optional(),
});

export const TriggerConfigQuerySchema = z.object({
  workflowDefinitionId: z.string().uuid().optional(),
  triggerType: WorkflowTriggerTypeEnum.optional(),
  status: TriggerConfigStatusEnum.optional(),
  keyword: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const TriggerLogQuerySchema = z.object({
  triggerConfigId: z.string().uuid().optional(),
  triggerType: WorkflowTriggerTypeEnum.optional(),
  status: TriggerLogStatusEnum.optional(),
  triggeredAtFrom: z.coerce.date().optional(),
  triggeredAtTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ── 分页响应 ──

export const TriggerConfigPageSchema = z.object({
  data: z.array(TriggerConfigSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const TriggerLogPageSchema = z.object({
  data: z.array(TriggerLogSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

// ── Types ──

export type TriggerConfigStatus = z.infer<typeof TriggerConfigStatusEnum>;
export type CronTriggerState = z.infer<typeof CronTriggerStateEnum>;
export type TriggerLogStatus = z.infer<typeof TriggerLogStatusEnum>;
export type ApiAuthMethod = z.infer<typeof ApiAuthMethodEnum>;
export type EventFilterMatchMode = z.infer<typeof EventFilterMatchModeEnum>;

export type CronTriggerConfig = z.infer<typeof CronTriggerConfigSchema>;
export type ApiTriggerConfig = z.infer<typeof ApiTriggerConfigSchema>;
export type EventFilterRule = z.infer<typeof EventFilterRuleSchema>;
export type EventTriggerConfig = z.infer<typeof EventTriggerConfigSchema>;

export type TriggerConfigDto = z.infer<typeof TriggerConfigSchema>;
export type TriggerLogDto = z.infer<typeof TriggerLogSchema>;
export type CreateTriggerConfigDto = z.infer<typeof CreateTriggerConfigSchema>;
export type UpdateTriggerConfigDto = z.infer<typeof UpdateTriggerConfigSchema>;
export type TriggerConfigQueryDto = z.infer<typeof TriggerConfigQuerySchema>;
export type TriggerLogQueryDto = z.infer<typeof TriggerLogQuerySchema>;
export type TriggerConfigPageDto = z.infer<typeof TriggerConfigPageSchema>;
export type TriggerLogPageDto = z.infer<typeof TriggerLogPageSchema>;
