/**
 * 对话式工作流 — 前端 API Hooks
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

const BASE = '/conversational-workflow';

// ── 类型定义 ──────────────────────────────────────────────

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
  options?: string[];
  workflowPreview?: {
    sceneName: string;
    description: string;
    params: Record<string, unknown>;
  };
  executionResult?: {
    executionId: string;
    status: string;
    summary: string;
    reportContent?: string;
    detailUrl: string;
  };
}

export interface ConversationSessionResponse {
  sessionId: string;
  phase: string;
  createdAt: string;
}

export interface ConversationMessageResponse {
  sessionId: string;
  phase: string;
  messages: RichMessageBlock[];
  matchedScene?: string;
  collectedParams?: Record<string, unknown>;
  workflowDefinitionId?: string;
  workflowVersionId?: string;
  lastExecutionId?: string;
}

export interface ConversationSessionItem {
  sessionId: string;
  phase: string;
  matchedScene?: string;
  summary: string;
  updatedAt: string;
  createdAt: string;
}

export interface DisplayMessageDto {
  id: string;
  role: 'user' | 'assistant';
  blocks: RichMessageBlock[];
  timestamp: string;
}

// ── 查询 Keys ─────────────────────────────────────────────

export const CONV_KEYS = {
  sessions: ['conversational-workflow-sessions'] as const,
  session: (id: string) => ['conversational-workflow-session', id] as const,
  messages: (id: string) => ['conversational-workflow-messages', id] as const,
};

// ── Hooks ──────────────────────────────────────────────────

/** 列出用户会话 */
export const useConversationSessions = () =>
  useQuery({
    queryKey: CONV_KEYS.sessions,
    queryFn: async () => {
      const res = await apiClient.get<ConversationSessionItem[]>(`${BASE}/sessions`);
      return res.data;
    },
  });

/** 创建对话会话 */
export const useCreateConversationSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ConversationSessionResponse>(`${BASE}/sessions`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONV_KEYS.sessions });
    },
  });
};

/** 发送对话消息 */
export const useSendConversationMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const res = await apiClient.post<ConversationMessageResponse>(
        `${BASE}/sessions/${sessionId}/messages`,
        { message },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONV_KEYS.sessions });
    },
  });
};

/** 获取会话消息历史 */
export const useConversationMessages = (sessionId: string | null) =>
  useQuery({
    queryKey: sessionId ? CONV_KEYS.messages(sessionId) : ['noop'],
    queryFn: async () => {
      const res = await apiClient.get<{
        sessionId: string;
        phase: string;
        messages: DisplayMessageDto[];
      }>(`${BASE}/sessions/${sessionId}/messages`);
      return res.data;
    },
    enabled: !!sessionId,
  });

/** 查询对话会话状态 */
export const useConversationSession = (sessionId: string | null) =>
  useQuery({
    queryKey: sessionId ? CONV_KEYS.session(sessionId) : ['noop'],
    queryFn: async () => {
      const res = await apiClient.get<{
        sessionId: string;
        phase: string;
        state: Record<string, unknown>;
      }>(`${BASE}/sessions/${sessionId}`);
      return res.data;
    },
    enabled: !!sessionId,
  });

// ── SSE 流式发送 ──────────────────────────────────────────

export interface SSECallbacks {
  onThinking?: (status: string) => void;
  onPhaseUpdate?: (phase: string) => void;
  onDone?: (result: ConversationMessageResponse) => void;
  onError?: (message: string) => void;
}

/**
 * 通过 SSE 流式发送消息 — 阶段级进度推送
 *
 * 使用 fetch + ReadableStream 代替 EventSource（因为 EventSource 不支持 POST）
 */
export async function sendMessageWithSSE(
  sessionId: string,
  message: string,
  callbacks: SSECallbacks,
): Promise<ConversationMessageResponse | null> {
  const baseUrl = apiClient.defaults.baseURL ?? '';
  const url = `${baseUrl}${BASE}/sessions/${sessionId}/messages/stream`;

  // 手动构建 headers（fetch 不走 axios interceptor）
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    const raw = window.localStorage.getItem('ctbms_virtual_login_user');
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed?.id) {
        headers['x-virtual-user-id'] = parsed.id;
      }
    }
  } catch {
    // ignore
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    callbacks.onError?.(`请求失败: ${response.status} - ${errorText}`);
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError?.('流不可用');
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: ConversationMessageResponse | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 解析 SSE 事件（格式: event: xxx\ndata: {...}\n\n）
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? ''; // 最后一段可能不完整

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;

      const lines = eventBlock.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        }
      }

      if (!eventType || !eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        switch (eventType) {
          case 'thinking':
            callbacks.onThinking?.(parsed.status);
            break;
          case 'phase_update':
            callbacks.onPhaseUpdate?.(parsed.phase);
            break;
          case 'done':
            finalResult = parsed as ConversationMessageResponse;
            callbacks.onDone?.(finalResult);
            break;
          case 'error':
            callbacks.onError?.(parsed.message);
            break;
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return finalResult;
}

