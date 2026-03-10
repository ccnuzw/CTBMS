import { useMutation, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

const BASE = '/agent-tools';

// ── 类型定义 ──────────────────────────────────────────────

interface ChatTurn {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

interface ChatResponse {
    reply: string;
    toolsUsed: Array<{ toolId: string; summary: string }>;
    turnCount: number;
}

interface ChatSession {
    sessionId: string;
    turnCount: number;
    lastMessage: string;
    createdAt: string;
}

interface AgentToolDefinition {
    toolId: string;
    displayName: string;
    description: string;
    category: string;
    parameters: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
    }>;
}

// ── Hooks ──────────────────────────────────────────────────

/** 创建新对话会话 */
export const useCreateChatSession = () =>
    useMutation({
        mutationFn: async (userId: string) => {
            const res = await apiClient.post<{ sessionId: string }>(
                `${BASE}/chat/sessions`,
                { userId },
            );
            return res.data;
        },
    });

/** 发送消息 */
export const useSendMessage = () =>
    useMutation({
        mutationFn: async ({
            sessionId,
            message,
        }: {
            sessionId: string;
            message: string;
        }) => {
            const res = await apiClient.post<ChatResponse>(
                `${BASE}/chat/sessions/${sessionId}/messages`,
                { message },
            );
            return res.data;
        },
    });

/** 获取会话历史 */
export const useChatHistory = (sessionId: string | null) =>
    useQuery({
        queryKey: ['agent-chat-history', sessionId],
        queryFn: async () => {
            const res = await apiClient.get<ChatTurn[]>(
                `${BASE}/chat/sessions/${sessionId}/history`,
            );
            return res.data;
        },
        enabled: !!sessionId,
    });

/** 列出用户会话 */
export const useChatSessions = (userId: string) =>
    useQuery({
        queryKey: ['agent-chat-sessions', userId],
        queryFn: async () => {
            const res = await apiClient.get<ChatSession[]>(
                `${BASE}/chat/sessions`,
                { params: { userId } },
            );
            return res.data;
        },
        enabled: !!userId,
    });

/** 获取可用工具列表 */
export const useAgentTools = () =>
    useQuery({
        queryKey: ['agent-tools'],
        queryFn: async () => {
            const res = await apiClient.get<AgentToolDefinition[]>(BASE);
            return res.data;
        },
    });
