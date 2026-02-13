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
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
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

export type AgentMemoryPolicy = z.infer<typeof AgentMemoryPolicyEnum>;
export type AgentRoleType = z.infer<typeof AgentRoleTypeEnum>;
export type AgentProfileDto = z.infer<typeof AgentProfileSchema>;
export type CreateAgentProfileDto = z.infer<typeof CreateAgentProfileSchema>;
export type UpdateAgentProfileDto = z.infer<typeof UpdateAgentProfileSchema>;
export type AgentProfileQueryDto = z.infer<typeof AgentProfileQuerySchema>;
export type AgentProfilePageDto = z.infer<typeof AgentProfilePageSchema>;
export type PublishAgentProfileDto = z.infer<typeof PublishAgentProfileSchema>;
