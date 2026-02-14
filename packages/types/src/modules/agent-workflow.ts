import { z } from 'zod';
import { WorkflowTemplateSourceEnum } from './workflow';

export const AgentMemoryPolicyEnum = z.enum(['none', 'short-term', 'windowed']);
export const AgentRoleTypeEnum = z.enum([
  'ANALYST',
  'RISK_OFFICER',
  'JUDGE',
  'COST_SPREAD',
  'FUTURES_EXPERT',
  'SPOT_EXPERT',
  'LOGISTICS_EXPERT',
  'EXECUTION_ADVISOR',
]);

export const AgentProfileSchema = z.object({
  id: z.string().uuid(),
  agentCode: z.string(),
  agentName: z.string(),
  roleType: AgentRoleTypeEnum,
  objective: z.string().nullable().optional(),
  modelConfigKey: z.string(),
  agentPromptCode: z.string(),
  memoryPolicy: AgentMemoryPolicyEnum,
  toolPolicy: z.record(z.unknown()),
  guardrails: z.record(z.unknown()),
  outputSchemaCode: z.string(),
  timeoutMs: z.number().int(),
  retryPolicy: z.record(z.unknown()),
  isActive: z.boolean(),
  version: z.number().int(),
  ownerUserId: z.string().nullable().optional(),
  templateSource: WorkflowTemplateSourceEnum,
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateAgentProfileSchema = z.object({
  agentCode: z.string().regex(/^[A-Z0-9_]{3,80}$/),
  agentName: z.string().min(1).max(120),
  roleType: AgentRoleTypeEnum,
  objective: z.string().max(2000).optional(),
  modelConfigKey: z.string().min(1).max(120),
  agentPromptCode: z.string().min(1).max(120),
  memoryPolicy: AgentMemoryPolicyEnum.default('none'),
  toolPolicy: z.record(z.unknown()).default({}),
  guardrails: z.record(z.unknown()).default({}),
  outputSchemaCode: z.string().min(1).max(120),
  timeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
  retryPolicy: z.record(z.unknown()).default({ retryCount: 1, retryBackoffMs: 2000 }),
  templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
});

export const UpdateAgentProfileSchema = z.object({
  agentName: z.string().min(1).max(120).optional(),
  roleType: AgentRoleTypeEnum.optional(),
  objective: z.string().max(2000).optional(),
  modelConfigKey: z.string().min(1).max(120).optional(),
  agentPromptCode: z.string().min(1).max(120).optional(),
  memoryPolicy: AgentMemoryPolicyEnum.optional(),
  toolPolicy: z.record(z.unknown()).optional(),
  guardrails: z.record(z.unknown()).optional(),
  outputSchemaCode: z.string().min(1).max(120).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(120000).optional(),
  retryPolicy: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const AgentProfileQuerySchema = z.object({
  keyword: z.string().max(120).optional(),
  includePublic: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().optional(),
  roleType: AgentRoleTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

export const AgentProfilePageSchema = z.object({
  data: z.array(AgentProfileSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const PublishAgentProfileSchema = z.object({
  comment: z.string().max(500).optional(),
});

// ─── AgentPromptTemplate ────────────────────────────────────────────

export const AgentPromptOutputFormatEnum = z.enum(['json', 'markdown', 'text', 'csv']);

export const AgentPromptTemplateSchema = z.object({
  id: z.string().uuid(),
  promptCode: z.string(),
  name: z.string(),
  roleType: AgentRoleTypeEnum,
  systemPrompt: z.string(),
  userPromptTemplate: z.string(),
  fewShotExamples: z.array(z.record(z.unknown())).nullable().optional(),
  outputFormat: AgentPromptOutputFormatEnum,
  variables: z.record(z.unknown()).nullable().optional(),
  version: z.number().int(),
  ownerUserId: z.string().nullable().optional(),
  templateSource: WorkflowTemplateSourceEnum,
  isActive: z.boolean(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateAgentPromptTemplateSchema = z.object({
  promptCode: z.string().regex(/^[A-Z0-9_]{3,120}$/, 'promptCode 格式不正确'),
  name: z.string().min(1).max(120),
  roleType: AgentRoleTypeEnum,
  systemPrompt: z.string().min(1).max(20000),
  userPromptTemplate: z.string().min(1).max(20000),
  fewShotExamples: z.array(z.record(z.unknown())).max(20).optional(),
  outputFormat: AgentPromptOutputFormatEnum.default('json'),
  variables: z.record(z.unknown()).optional(),
  templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
});

export const UpdateAgentPromptTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roleType: AgentRoleTypeEnum.optional(),
  systemPrompt: z.string().min(1).max(20000).optional(),
  userPromptTemplate: z.string().min(1).max(20000).optional(),
  fewShotExamples: z.array(z.record(z.unknown())).max(20).optional(),
  outputFormat: AgentPromptOutputFormatEnum.optional(),
  variables: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const AgentPromptTemplateQuerySchema = z.object({
  keyword: z.string().max(120).optional(),
  roleType: AgentRoleTypeEnum.optional(),
  includePublic: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

export const AgentPromptTemplatePageSchema = z.object({
  data: z.array(AgentPromptTemplateSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export type AgentMemoryPolicy = z.infer<typeof AgentMemoryPolicyEnum>;
export type AgentRoleType = z.infer<typeof AgentRoleTypeEnum>;
export type AgentProfileDto = z.infer<typeof AgentProfileSchema>;
export type CreateAgentProfileDto = z.infer<typeof CreateAgentProfileSchema>;
export type UpdateAgentProfileDto = z.infer<typeof UpdateAgentProfileSchema>;
export type AgentProfileQueryDto = z.infer<typeof AgentProfileQuerySchema>;
export type AgentProfilePageDto = z.infer<typeof AgentProfilePageSchema>;
export type PublishAgentProfileDto = z.infer<typeof PublishAgentProfileSchema>;

export type AgentPromptOutputFormat = z.infer<typeof AgentPromptOutputFormatEnum>;
export type AgentPromptTemplateDto = z.infer<typeof AgentPromptTemplateSchema>;
export type CreateAgentPromptTemplateDto = z.infer<typeof CreateAgentPromptTemplateSchema>;
export type UpdateAgentPromptTemplateDto = z.infer<typeof UpdateAgentPromptTemplateSchema>;
export type AgentPromptTemplateQueryDto = z.infer<typeof AgentPromptTemplateQuerySchema>;
export type AgentPromptTemplatePageDto = z.infer<typeof AgentPromptTemplatePageSchema>;

// ────────────────── DebateRoundTrace ──────────────────

export const DebateRoundTraceSchema = z.object({
  id: z.string().uuid(),
  workflowExecutionId: z.string().uuid(),
  nodeExecutionId: z.string().uuid().nullable().optional(),
  roundNumber: z.number().int().min(1),
  participantCode: z.string().min(1),
  participantRole: z.string().min(1),
  stance: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  previousConfidence: z.number().min(0).max(1).nullable().optional(),
  statementText: z.string().min(1),
  evidenceRefs: z.record(z.unknown()).nullable().optional(),
  challengeTargetCode: z.string().nullable().optional(),
  challengeText: z.string().nullable().optional(),
  responseText: z.string().nullable().optional(),
  keyPoints: z.array(z.string()).nullable().optional(),
  isJudgement: z.boolean().default(false),
  judgementVerdict: z.string().nullable().optional(),
  judgementReasoning: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  createdAt: z.date().optional(),
});

export const CreateDebateRoundTraceSchema = DebateRoundTraceSchema.omit({
  id: true,
  createdAt: true,
});

export const CreateDebateRoundTraceBatchSchema = z.object({
  traces: z.array(CreateDebateRoundTraceSchema).min(1).max(200),
});

export const DebateRoundTraceQuerySchema = z.object({
  workflowExecutionId: z.string().uuid(),
  roundNumber: z.coerce.number().int().min(1).optional(),
  participantCode: z.string().max(120).optional(),
  participantRole: z.string().max(120).optional(),
  isJudgement: z.coerce.boolean().optional(),
  keyword: z.string().max(120).optional(),
});

export const DebateReplayQuerySchema = z.object({
  roundNumber: z.coerce.number().int().min(1).optional(),
  participantCode: z.string().max(120).optional(),
  participantRole: z.string().max(120).optional(),
  isJudgement: z.coerce.boolean().optional(),
  keyword: z.string().max(120).optional(),
});

export const DebateTimelineEntrySchema = z.object({
  roundNumber: z.number().int(),
  entries: z.array(DebateRoundTraceSchema),
  roundSummary: z.object({
    participantCount: z.number().int(),
    hasJudgement: z.boolean(),
    avgConfidence: z.number().nullable(),
    confidenceDelta: z.number().nullable(),
  }),
});

export const DebateTimelineSchema = z.object({
  executionId: z.string().uuid(),
  totalRounds: z.number().int(),
  rounds: z.array(DebateTimelineEntrySchema),
});

export type DebateRoundTraceDto = z.infer<typeof DebateRoundTraceSchema>;
export type CreateDebateRoundTraceDto = z.infer<typeof CreateDebateRoundTraceSchema>;
export type CreateDebateRoundTraceBatchDto = z.infer<typeof CreateDebateRoundTraceBatchSchema>;
export type DebateRoundTraceQueryDto = z.infer<typeof DebateRoundTraceQuerySchema>;
export type DebateTimelineEntryDto = z.infer<typeof DebateTimelineEntrySchema>;
export type DebateTimelineDto = z.infer<typeof DebateTimelineSchema>;
export type DebateReplayQueryDto = z.infer<typeof DebateReplayQuerySchema>;
