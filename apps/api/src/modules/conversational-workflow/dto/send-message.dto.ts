import { z } from 'zod';

// ── 请求 DTO ────────────────────────────────────────────

export const CreateConversationSessionSchema = z.object({
  userId: z.string().min(1),
});

export type CreateConversationSessionDto = z.infer<typeof CreateConversationSessionSchema>;

export const SendConversationMessageSchema = z.object({
  message: z.string().min(1, '消息不能为空'),
});

export type SendConversationMessageDto = z.infer<typeof SendConversationMessageSchema>;

// ── 对话状态 ────────────────────────────────────────────

export const CONVERSATION_PHASES = [
  'IDLE',
  'INTENT_PARSED',
  'COLLECTING_PARAMS',
  'WORKFLOW_READY',
  'RUNNING',
  'RESULT_DELIVERED',
] as const;

export type ConversationPhase = (typeof CONVERSATION_PHASES)[number];

// ── 富消息类型 ──────────────────────────────────────────

export type RichMessageType =
  | 'text'
  | 'param_card'
  | 'workflow_preview'
  | 'running_progress'
  | 'execution_result'
  | 'clarification';

export interface RichMessageBlock {
  type: RichMessageType;
  content: string;
  /** 交互式选项（用于 param_card / clarification） */
  options?: string[];
  /** 工作流预览数据 */
  workflowPreview?: {
    sceneName: string;
    description: string;
    params: Record<string, unknown>;
  };
  /** 执行结果数据 */
  executionResult?: {
    executionId: string;
    status: string;
    summary: string;
    reportContent?: string;
    detailUrl: string;
  };
}

// ── 响应 DTO ────────────────────────────────────────────

export interface ConversationSessionResponse {
  sessionId: string;
  phase: ConversationPhase;
  createdAt: string;
}

export interface ConversationMessageResponse {
  sessionId: string;
  phase: ConversationPhase;
  messages: RichMessageBlock[];
  /** 已匹配的场景（如有） */
  matchedScene?: string;
  /** 已收集的参数 */
  collectedParams?: Record<string, unknown>;
  /** 关联的工作流定义 ID */
  workflowDefinitionId?: string;
  /** 关联的工作流版本 ID */
  workflowVersionId?: string;
  /** 最近执行 ID */
  lastExecutionId?: string;
}

// ── 内部会话状态 ────────────────────────────────────────

export interface ConversationState {
  phase: ConversationPhase;
  matchedScene?: string;
  confidence?: number;
  extractedParams: Record<string, unknown>;
  missingParams: string[];
  workflowDefinitionId?: string;
  workflowVersionId?: string;
  lastExecutionId?: string;
  conversationHistory: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
}

export const DEFAULT_CONVERSATION_STATE: ConversationState = {
  phase: 'IDLE',
  extractedParams: {},
  missingParams: [],
  conversationHistory: [],
};

// ── Function Calling 输出 Zod Schemas ──────────────────

export const MatchSceneResultSchema = z.object({
  sceneCode: z.string(),
  confidence: z.number().min(0).max(100),
  missingParams: z.array(z.string()),
  extractedParams: z.record(z.unknown()).optional().default({}),
  userFacingMessage: z.string().describe('向用户展示的中文回复'),
});

export type MatchSceneResult = z.infer<typeof MatchSceneResultSchema>;

export const CollectParamsResultSchema = z.object({
  extractedParams: z.record(z.unknown()).optional().default({}),
  stillMissing: z.array(z.string()),
  isComplete: z.boolean(),
  userFacingMessage: z.string().describe('向用户展示的中文回复'),
});

export type CollectParamsResult = z.infer<typeof CollectParamsResultSchema>;

export const ConfirmCreateResultSchema = z.object({
  confirmed: z.boolean(),
  workflowName: z.string(),
  finalParams: z.record(z.unknown()).optional().default({}),
  userFacingMessage: z.string().describe('向用户展示的中文回复'),
});

export type ConfirmCreateResult = z.infer<typeof ConfirmCreateResultSchema>;

export const AskClarificationResultSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).optional().default([]),
  userFacingMessage: z.string().describe('向用户展示的中文回复'),
});

export type AskClarificationResult = z.infer<typeof AskClarificationResultSchema>;
