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

export const ConversationSessionQuerySchema = z.object({
  state: ConversationStateEnum.optional(),
  keyword: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ConversationSubscriptionStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'FAILED', 'ARCHIVED']);

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

export type ConversationState = z.infer<typeof ConversationStateEnum>;
export type ConversationRole = z.infer<typeof ConversationRoleEnum>;
export type ConversationPlanType = z.infer<typeof ConversationPlanTypeEnum>;
export type CreateConversationSessionDto = z.infer<typeof CreateConversationSessionSchema>;
export type CreateConversationTurnDto = z.infer<typeof CreateConversationTurnSchema>;
export type ConfirmConversationPlanDto = z.infer<typeof ConfirmConversationPlanSchema>;
export type ExportConversationResultDto = z.infer<typeof ExportConversationResultSchema>;
export type DeliverConversationEmailDto = z.infer<typeof DeliverConversationEmailSchema>;
export type ConversationSessionQueryDto = z.infer<typeof ConversationSessionQuerySchema>;
export type ConversationSubscriptionStatus = z.infer<typeof ConversationSubscriptionStatusEnum>;
export type CreateConversationSubscriptionDto = z.infer<typeof CreateConversationSubscriptionSchema>;
export type UpdateConversationSubscriptionDto = z.infer<typeof UpdateConversationSubscriptionSchema>;
export type ConversationSubscriptionDto = z.infer<typeof ConversationSubscriptionSchema>;
export type ConversationSessionDto = z.infer<typeof ConversationSessionSchema>;
