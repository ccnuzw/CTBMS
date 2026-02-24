import { createZodDto } from 'nestjs-zod';
import {
  CreateConversationSubscriptionSchema,
  ConfirmConversationPlanSchema,
  CreateConversationSessionSchema,
  CreateConversationTurnSchema,
  UpdateConversationSubscriptionSchema,
  ExportConversationResultSchema,
} from '@packages/types';
import { z } from 'zod';

export class CreateConversationSessionRequest extends createZodDto(CreateConversationSessionSchema) {}
export class CreateConversationTurnRequest extends createZodDto(CreateConversationTurnSchema) {}
export class ConfirmConversationPlanRequest extends createZodDto(ConfirmConversationPlanSchema) {}
export class ExportConversationResultRequest extends createZodDto(ExportConversationResultSchema) {}
export class CreateConversationSubscriptionRequest extends createZodDto(
  CreateConversationSubscriptionSchema,
) {}
export class UpdateConversationSubscriptionRequest extends createZodDto(
  UpdateConversationSubscriptionSchema,
) {}

const ConversationSessionQuerySchema = z.object({
  state: z
    .enum([
      'INTENT_CAPTURE',
      'SLOT_FILLING',
      'PLAN_PREVIEW',
      'USER_CONFIRM',
      'EXECUTING',
      'RESULT_DELIVERY',
      'DONE',
      'FAILED',
    ])
    .optional(),
  keyword: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export class ConversationSessionQueryRequest extends createZodDto(ConversationSessionQuerySchema) {}

const DeliverConversationEmailSchema = z.object({
  exportTaskId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  subject: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(5000),
});
export class DeliverConversationEmailRequest extends createZodDto(DeliverConversationEmailSchema) {}
