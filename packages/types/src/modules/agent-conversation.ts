import { z } from 'zod';
import { ExportFormatEnum, ExportReportSectionEnum } from './report-export.js';

export const ConversationStateEnum = z.enum([
  'INTENT_CAPTURE',
  'SLOT_FILLING',
  'PLAN_PREVIEW',
  'USER_CONFIRM',
  'EXECUTING',
  'RESULT_DELIVERY',
  'DONE',
  'FAILED',
]);

export const ConversationRoleEnum = z.enum(['USER', 'ASSISTANT', 'SYSTEM']);

export const ConversationPlanTypeEnum = z.enum(['RUN_PLAN', 'DEBATE_PLAN']);

export const CreateConversationSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const CreateConversationTurnSchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(4000),
  contextPatch: z.record(z.unknown()).optional(),
});

export const ConfirmConversationPlanSchema = z.object({
  planId: z.string().trim().min(1),
  planVersion: z.coerce.number().int().min(1),
  confirmedPlan: z.record(z.unknown()).optional(),
});

export const ExportConversationResultSchema = z.object({
  workflowExecutionId: z.string().uuid().optional(),
  format: ExportFormatEnum.default('PDF'),
  sections: z
    .array(ExportReportSectionEnum)
    .min(1)
    .default(['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT']),
  title: z.string().trim().max(200).optional(),
  includeRawData: z.boolean().default(false),
});

export const DeliverConversationEmailSchema = z.object({
  exportTaskId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  subject: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
});

export const DeliveryChannelEnum = z.enum(['EMAIL', 'DINGTALK', 'WECOM', 'FEISHU']);
export const DeliveryTemplateCodeEnum = z.enum([
  'DEFAULT',
  'MORNING_BRIEF',
  'WEEKLY_REVIEW',
  'RISK_ALERT',
]);

export const DeliverConversationSchema = z.object({
  exportTaskId: z.string().uuid(),
  channel: DeliveryChannelEnum,
  to: z.array(z.string().email()).optional(),
  target: z.string().trim().max(240).optional(),
  subject: z.string().trim().max(200).optional(),
  content: z.string().trim().max(5000).optional(),
  templateCode: DeliveryTemplateCodeEnum.optional(),
  sendRawFile: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConversationSessionQuerySchema = z.object({
  state: ConversationStateEnum.optional(),
  keyword: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ConversationSubscriptionStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'FAILED', 'ARCHIVED']);
export const BacktestStatusEnum = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);
export const SkillDraftStatusEnum = z.enum([
  'DRAFT',
  'SANDBOX_TESTING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
]);
export const SkillRiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const SkillRuntimeGrantStatusEnum = z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']);
export const ConversationAssetTypeEnum = z.enum([
  'PLAN',
  'EXECUTION',
  'RESULT_SUMMARY',
  'EXPORT_FILE',
  'BACKTEST_SUMMARY',
  'CONFLICT_SUMMARY',
  'SKILL_DRAFT',
  'NOTE',
]);

export const CreateSkillDraftSchema = z.object({
  gapType: z.string().trim().min(1).max(120),
  requiredCapability: z.string().trim().min(1).max(500),
  suggestedSkillCode: z.string().trim().min(1).max(120),
  riskLevel: SkillRiskLevelEnum.optional(),
  sideEffectRisk: z.boolean().optional(),
});

export const SandboxSkillDraftSchema = z.object({
  testCases: z
    .array(
      z.object({
        input: z.record(z.unknown()),
        expectContains: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .min(1)
    .max(20),
});

export const ReviewSkillDraftSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(500).optional(),
});

export const RevokeSkillRuntimeGrantSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const ReuseConversationAssetSchema = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  contextPatch: z.record(z.unknown()).optional(),
});

export const ConversationConflictRecordSchema = z.object({
  conflictId: z.string().uuid(),
  topic: z.string(),
  sources: z.array(z.string()).min(2),
  resolution: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  consistencyScore: z.number().nullable().optional(),
});

export const ConversationConflictsResponseSchema = z.object({
  consistencyScore: z.number(),
  conflicts: z.array(ConversationConflictRecordSchema),
});

export const CreateConversationBacktestSchema = z.object({
  executionId: z.string().uuid().optional(),
  strategySource: z.enum(['LATEST_ACTIONS', 'PLAN_SNAPSHOT']).default('LATEST_ACTIONS'),
  lookbackDays: z.coerce.number().int().min(7).max(730).default(180),
  feeModel: z.object({
    spotFeeBps: z.coerce.number().min(0).max(1000).default(8),
    futuresFeeBps: z.coerce.number().min(0).max(1000).default(3),
  }),
});

export const CreateConversationSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  planVersion: z.coerce.number().int().min(1).optional(),
  cronExpr: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(80).default('Asia/Shanghai'),
  deliveryConfig: z.record(z.unknown()).optional(),
  quietHours: z
    .object({
      start: z.string().trim().min(1),
      end: z.string().trim().min(1),
    })
    .optional(),
});

export const UpdateConversationSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  cronExpr: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  status: ConversationSubscriptionStatusEnum.optional(),
  deliveryConfig: z.record(z.unknown()).optional(),
  quietHours: z
    .object({
      start: z.string().trim().min(1),
      end: z.string().trim().min(1),
    })
    .optional(),
});

export const ResolveConversationScheduleSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
});

export const ConversationSubscriptionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  name: z.string(),
  planSnapshot: z.record(z.unknown()),
  cronExpr: z.string(),
  timezone: z.string(),
  status: ConversationSubscriptionStatusEnum,
  deliveryConfig: z.record(z.unknown()).nullable().optional(),
  quietHours: z.record(z.unknown()).nullable().optional(),
  nextRunAt: z.date().nullable().optional(),
  lastRunAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ConversationSessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable().optional(),
  ownerUserId: z.string().uuid(),
  state: ConversationStateEnum,
  currentIntent: z.string().nullable().optional(),
  currentSlots: z.unknown().nullable().optional(),
  latestPlanType: ConversationPlanTypeEnum.nullable().optional(),
  latestPlanSnapshot: z.unknown().nullable().optional(),
  latestExecutionId: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  startedAt: z.date(),
  endedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ConversationBacktestJobSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  workflowExecutionId: z.string().uuid(),
  status: BacktestStatusEnum,
  inputConfig: z.record(z.unknown()),
  resultSummary: z.record(z.unknown()).nullable().optional(),
  metrics: z.record(z.unknown()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.date(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
});

export const ConversationAssetSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  assetType: ConversationAssetTypeEnum,
  title: z.string(),
  payload: z.record(z.unknown()),
  sourceTurnId: z.string().uuid().nullable().optional(),
  sourceExecutionId: z.string().uuid().nullable().optional(),
  sourcePlanVersion: z.number().int().nullable().optional(),
  tags: z.record(z.unknown()).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SkillRuntimeGrantSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  sessionId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  status: SkillRuntimeGrantStatusEnum,
  maxUseCount: z.number().int(),
  useCount: z.number().int(),
  expiresAt: z.date(),
  revokeReason: z.string().nullable().optional(),
  revokedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ConversationState = z.infer<typeof ConversationStateEnum>;
export type ConversationRole = z.infer<typeof ConversationRoleEnum>;
export type ConversationPlanType = z.infer<typeof ConversationPlanTypeEnum>;
export type CreateConversationSessionDto = z.infer<typeof CreateConversationSessionSchema>;
export type CreateConversationTurnDto = z.infer<typeof CreateConversationTurnSchema>;
export type ConfirmConversationPlanDto = z.infer<typeof ConfirmConversationPlanSchema>;
export type ExportConversationResultDto = z.infer<typeof ExportConversationResultSchema>;
export type DeliverConversationEmailDto = z.infer<typeof DeliverConversationEmailSchema>;
export type DeliverConversationDto = z.infer<typeof DeliverConversationSchema>;
export type ConversationSessionQueryDto = z.infer<typeof ConversationSessionQuerySchema>;
export type ConversationSubscriptionStatus = z.infer<typeof ConversationSubscriptionStatusEnum>;
export type BacktestStatus = z.infer<typeof BacktestStatusEnum>;
export type SkillDraftStatus = z.infer<typeof SkillDraftStatusEnum>;
export type SkillRiskLevel = z.infer<typeof SkillRiskLevelEnum>;
export type SkillRuntimeGrantStatus = z.infer<typeof SkillRuntimeGrantStatusEnum>;
export type ConversationAssetType = z.infer<typeof ConversationAssetTypeEnum>;
export type CreateConversationBacktestDto = z.infer<typeof CreateConversationBacktestSchema>;
export type CreateSkillDraftDto = z.infer<typeof CreateSkillDraftSchema>;
export type SandboxSkillDraftDto = z.infer<typeof SandboxSkillDraftSchema>;
export type ReviewSkillDraftDto = z.infer<typeof ReviewSkillDraftSchema>;
export type RevokeSkillRuntimeGrantDto = z.infer<typeof RevokeSkillRuntimeGrantSchema>;
export type ReuseConversationAssetDto = z.infer<typeof ReuseConversationAssetSchema>;
export type ConversationConflictRecordDto = z.infer<typeof ConversationConflictRecordSchema>;
export type ConversationConflictsResponseDto = z.infer<typeof ConversationConflictsResponseSchema>;
export type CreateConversationSubscriptionDto = z.infer<typeof CreateConversationSubscriptionSchema>;
export type UpdateConversationSubscriptionDto = z.infer<typeof UpdateConversationSubscriptionSchema>;
export type ResolveConversationScheduleDto = z.infer<typeof ResolveConversationScheduleSchema>;
export type ConversationSubscriptionDto = z.infer<typeof ConversationSubscriptionSchema>;
export type ConversationSessionDto = z.infer<typeof ConversationSessionSchema>;
export type ConversationBacktestJobDto = z.infer<typeof ConversationBacktestJobSchema>;
export type ConversationAssetDto = z.infer<typeof ConversationAssetSchema>;
export type SkillRuntimeGrantDto = z.infer<typeof SkillRuntimeGrantSchema>;
