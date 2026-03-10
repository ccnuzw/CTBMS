import { Injectable, Logger } from '@nestjs/common';

import { AIProvider, AIProviderSchema } from '@packages/types';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AIMessage, AIRequestOptions } from '../ai/providers/base.provider';
import { ToolAdapterService } from '../agent-tool/tool-adapter.service';

/**
 * LLM Agent 多轮对话服务
 *
 * 核心循环：
 *   用户消息 → LLM（带 tools 列表）
 *   → LLM 回复文本：直接返回
 *   → LLM 回复 tool_call：执行工具 → 结果注入对话 → 继续让 LLM 处理
 *   → 最终 LLM 用中文生成可读回复
 *
 * 设计原则：
 *   1. 不破坏原有 AgentConversationService，新增独立端点
 *   2. 使用 ToolAdapterService 桥接所有底层能力
 *   3. 多轮上下文通过数据库持久化
 *   4. 最大工具调用轮次限制，防止无限循环
 */

const MAX_TOOL_ROUNDS = 8;  // 单次对话最多连续调用工具的轮次
const SYSTEM_PROMPT = `你是一个专业的粮食贸易智能助手。你可以帮助用户完成以下任务：

1. **市场行情查询**：查询玉米、小麦、大豆等品种的现货和期货行情数据
2. **数据分析**：计算价差、分位数、技术指标等
3. **AI研判**：利用AI分析市场走势，提供多方讨论和综合裁判
4. **规则评估**：使用预设规则检查风控条件
5. **报告生成**：生成日报、周报、研报等格式化报告
6. **流程执行**：运行已配置好的分析工作流

回答规则：
- 使用自然、专业的中文回答
- 如果需要数据支撑，主动调用相关工具获取数据后再分析
- 分步骤完成复杂任务，每一步都给用户说明在做什么
- 对于不确定的内容，诚实告知并建议下一步
- 直接给出可操作的结论，避免空泛的表述
- 如果用户的需求不够明确，追问关键信息（品种、地域、时间范围等）`;

interface ChatTurn {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

interface ChatSessionData {
    sessionId: string;
    userId: string;
    turns: ChatTurn[];
    createdAt: Date;
}

@Injectable()
export class AgentChatService {
    private readonly logger = new Logger(AgentChatService.name);

    // 内存会话存储（后续可迁移到 Redis/DB）
    private sessions = new Map<string, ChatSessionData>();

    constructor(
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly toolAdapterService: ToolAdapterService,
    ) { }

    /** 创建新会话 */
    createSession(userId: string): { sessionId: string } {
        const sessionId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        this.sessions.set(sessionId, {
            sessionId,
            userId,
            turns: [],
            createdAt: new Date(),
        });
        return { sessionId };
    }

    /** 获取会话历史 */
    getSessionHistory(sessionId: string): ChatTurn[] {
        return this.sessions.get(sessionId)?.turns ?? [];
    }

    /** 列出用户的所有会话 */
    listSessions(userId: string) {
        const result: Array<{ sessionId: string; turnCount: number; lastMessage: string; createdAt: Date }> = [];
        this.sessions.forEach((session) => {
            if (session.userId === userId) {
                const lastUserTurn = [...session.turns].reverse().find((t) => t.role === 'user');
                result.push({
                    sessionId: session.sessionId,
                    turnCount: session.turns.length,
                    lastMessage: lastUserTurn?.content ?? '',
                    createdAt: session.createdAt,
                });
            }
        });
        return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    /**
     * 核心：处理用户消息
     *
     * 执行 Agent 循环：
     *   1. 将用户消息加入历史
     *   2. 调用 LLM（带 tools）
     *   3. 如果 LLM 返回 tool_call → 执行工具 → 注入结果 → 回到步骤 2
     *   4. 如果 LLM 返回文本 → 返回给用户
     */
    async chat(
        sessionId: string,
        userMessage: string,
    ): Promise<{
        reply: string;
        toolsUsed: Array<{ toolId: string; summary: string }>;
        turnCount: number;
    }> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('会话不存在，请先创建会话');
        }

        // 1. 追加用户消息
        session.turns.push({ role: 'user', content: userMessage });

        // 2. 获取 AI 配置
        const aiOptions = this.getAIOptions();

        // 3. 构建消息列表
        const tools = this.toolAdapterService.getOpenAIFunctions();
        const toolsUsed: Array<{ toolId: string; summary: string }> = [];

        // 4. Agent 循环
        let round = 0;
        while (round < MAX_TOOL_ROUNDS) {
            round++;

            const messages = this.buildMessages(session.turns);
            const provider = this.aiProviderFactory.getProvider(aiOptions.provider ?? 'openai');

            if (!provider.generateChat) {
                throw new Error('当前AI服务不支持对话模式');
            }

            this.logger.log(`Agent循环第 ${round} 轮，历史 ${messages.length} 条消息`);

            const response = await provider.generateChat(messages, {
                ...aiOptions.requestOptions,
                tools,
            });

            // 情况A：LLM 返回文本回复（没有 tool call）
            if (!response.tool_calls || response.tool_calls.length === 0) {
                const reply = response.content ?? '抱歉，我暂时无法回答这个问题。';
                session.turns.push({ role: 'assistant', content: reply });

                return {
                    reply,
                    toolsUsed,
                    turnCount: session.turns.length,
                };
            }

            // 情况B：LLM 返回 tool_call → 执行工具
            const assistantTurn: ChatTurn = {
                role: 'assistant',
                content: response.content ?? '',
                toolCalls: response.tool_calls.map((tc) => ({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                })),
            };
            session.turns.push(assistantTurn);

            // 逐个执行工具
            for (const toolCall of response.tool_calls) {
                let params: Record<string, unknown> = {};
                try {
                    params = JSON.parse(toolCall.function.arguments);
                } catch {
                    params = {};
                }

                this.logger.log(`调用工具: ${toolCall.function.name}`);

                const result = await this.toolAdapterService.executeTool({
                    toolId: toolCall.function.name,
                    params,
                    context: {
                        sessionId,
                        userId: session.userId,
                    },
                });

                toolsUsed.push({
                    toolId: toolCall.function.name,
                    summary: result.summary,
                });

                // 将工具结果注入对话
                const toolResultContent = JSON.stringify({
                    status: result.status,
                    summary: result.summary,
                    data: result.data,
                    error: result.error,
                });

                session.turns.push({
                    role: 'tool',
                    content: toolResultContent,
                    toolCallId: toolCall.id,
                });
            }

            // 继续循环，让 LLM 处理工具结果
        }

        // 超过最大轮次，强制生成回复
        const finalReply = '我已经完成了多步分析，以上是收集到的数据和中间结果。如需进一步分析，请告诉我。';
        session.turns.push({ role: 'assistant', content: finalReply });

        return {
            reply: finalReply,
            toolsUsed,
            turnCount: session.turns.length,
        };
    }

    /** 将 ChatTurn[] 转换为 AIMessage[] */
    private buildMessages(turns: ChatTurn[]): AIMessage[] {
        const messages: AIMessage[] = [
            { role: 'system', content: SYSTEM_PROMPT },
        ];

        // 保留最近 40 条消息防止 token 溢出
        const recentTurns = turns.slice(-40);

        for (const turn of recentTurns) {
            if (turn.role === 'user') {
                messages.push({ role: 'user', content: turn.content });
            } else if (turn.role === 'assistant') {
                if (turn.toolCalls && turn.toolCalls.length > 0) {
                    messages.push({
                        role: 'assistant',
                        content: turn.content || null,
                        tool_calls: turn.toolCalls.map((tc) => ({
                            id: tc.id,
                            type: 'function' as const,
                            function: { name: tc.name, arguments: tc.arguments },
                        })),
                    });
                } else {
                    messages.push({ role: 'assistant', content: turn.content });
                }
            } else if (turn.role === 'tool') {
                messages.push({
                    role: 'tool',
                    content: turn.content,
                    tool_call_id: turn.toolCallId,
                });
            }
        }

        return messages;
    }

    /** 获取 AI 配置（从环境变量） */
    private getAIOptions(): {
        provider: AIProvider;
        requestOptions: AIRequestOptions;
    } {
        const modelName = process.env.DEFAULT_AI_MODEL ?? 'gpt-4o';
        const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY ?? '';
        const apiUrl = process.env.OPENAI_API_URL ?? process.env.AI_API_URL;
        const providerRaw = process.env.AI_PROVIDER ?? 'openai';
        const providerParsed = AIProviderSchema.safeParse(providerRaw);
        const provider = providerParsed.success ? providerParsed.data : 'openai';

        if (!providerParsed.success) {
            this.logger.warn(
                `Invalid AI_PROVIDER "${providerRaw}", fallback to "openai".`,
            );
        }

        return {
            provider,
            requestOptions: {
                modelName,
                apiKey,
                apiUrl,
                temperature: 0.7,
                maxTokens: 4096,
            },
        };
    }
}
