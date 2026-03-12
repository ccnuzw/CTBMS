import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AIModelService } from '../ai/ai-model.service';
import { ConfigService } from '../config/config.service';
import { WorkflowDefinitionService } from '../workflow-definition/workflow-definition.service';
import { WorkflowExecutionService } from '../workflow-execution/workflow-execution.service';
import type { AIMessage, AIChatResponse, AIToolCall } from '../ai/providers/base.provider';
import type { AIProvider, WorkflowDsl } from '@packages/types';

import {
  ConversationState,
  ConversationPhase,
  DEFAULT_CONVERSATION_STATE,
  ConversationSessionResponse,
  ConversationMessageResponse,
  RichMessageBlock,
  MatchSceneResultSchema,
  CollectParamsResultSchema,
  ConfirmCreateResultSchema,
  AskClarificationResultSchema,
  type MatchSceneResult,
  type CollectParamsResult,
  type ConfirmCreateResult,
} from './dto';
import { getToolsForPhase, SCENE_TEMPLATE_SUMMARIES } from './tools/workflow-tools';
import { buildSystemPrompt } from './tools/system-prompt';
import { buildDslForScene } from './tools/scene-dsl-registry';

const SCENE_DISPLAY_NAMES: Record<string, string> = {
  MORNING_BRIEF: '晨间综判',
  INTRADAY_ALERT: '异动速报',
  CLOSING_JOURNAL: '收盘日志',
  SPREAD_ANALYSIS: '价差分析',
  BASIS_ANALYSIS: '期现联动',
  SUPPLY_DEMAND: '供需平衡',
  POLICY_DEBATE: '政策评估',
  POSITION_RISK: '持仓风险',
  LOGISTICS_RISK: '物流风险',
  COMPLIANCE_CHECK: '合规检查',
  WEEKLY_REVIEW: '周度复盘',
  MONTHLY_BACKTEST: '月度回测',
};

const MAX_HISTORY_TURNS = 40;

@Injectable()
export class ConversationalWorkflowService {
  private readonly logger = new Logger(ConversationalWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly aiModelService: AIModelService,
    private readonly configService: ConfigService,
    private readonly workflowDefinitionService: WorkflowDefinitionService,
    private readonly workflowExecutionService: WorkflowExecutionService,
  ) {}

  // ── 会话管理 ──────────────────────────────────────────

  async createSession(userId: string): Promise<ConversationSessionResponse> {
    const session = await this.prisma.wizardSession.create({
      data: {
        userId,
        currentStep: 'conversational',
        sessionData: DEFAULT_CONVERSATION_STATE as unknown as Record<string, never>,
      },
    });

    return {
      sessionId: session.id,
      phase: 'IDLE',
      createdAt: session.createdAt.toISOString(),
    };
  }

  async getSession(sessionId: string): Promise<{
    sessionId: string;
    phase: ConversationPhase;
    state: ConversationState;
  }> {
    const session = await this.prisma.wizardSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`会话 ${sessionId} 不存在`);
    }

    const state = (session.sessionData as unknown as ConversationState) || DEFAULT_CONVERSATION_STATE;

    return {
      sessionId: session.id,
      phase: state.phase,
      state,
    };
  }

  /**
   * 列出用户的对话会话（按最近更新排序）
   */
  async listSessions(userId: string, limit = 20): Promise<Array<{
    sessionId: string;
    phase: string;
    matchedScene?: string;
    summary: string;
    updatedAt: string;
    createdAt: string;
  }>> {
    const sessions = await this.prisma.wizardSession.findMany({
      where: {
        userId,
        currentStep: 'conversational',
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return sessions.map((s) => {
      const state = (s.sessionData as unknown as ConversationState) || DEFAULT_CONVERSATION_STATE;

      // 智能标题：场景名 > 第一条用户消息 > 兜底
      let summary = '新对话';
      const sceneName = state.matchedScene
        ? SCENE_DISPLAY_NAMES[state.matchedScene] || state.matchedScene
        : undefined;
      const dateStr = `${s.updatedAt.getMonth() + 1}/${s.updatedAt.getDate()}`;

      if (sceneName) {
        summary = `${sceneName} · ${dateStr}`;
      } else {
        const firstUserMsg = state.conversationHistory.find((m) => m.role === 'user');
        if (firstUserMsg?.content) {
          summary = (firstUserMsg.content as string).slice(0, 40);
        }
      }

      return {
        sessionId: s.id,
        phase: state.phase,
        matchedScene: state.matchedScene,
        summary,
        updatedAt: s.updatedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      };
    });
  }

  /**
   * 获取会话的消息历史（转换为前端可渲染的富消息格式）
   */
  async getSessionMessages(sessionId: string): Promise<{
    sessionId: string;
    phase: string;
    messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      blocks: RichMessageBlock[];
      timestamp: string;
    }>;
  }> {
    const session = await this.prisma.wizardSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`会话 ${sessionId} 不存在`);
    }

    const state = (session.sessionData as unknown as ConversationState) || DEFAULT_CONVERSATION_STATE;
    const displayMessages: Array<{
      id: string;
      role: 'user' | 'assistant';
      blocks: RichMessageBlock[];
      timestamp: string;
    }> = [];

    let msgIndex = 0;
    for (const entry of state.conversationHistory) {
      if (entry.role === 'user' && entry.content) {
        displayMessages.push({
          id: `hist-user-${msgIndex++}`,
          role: 'user',
          blocks: [{ type: 'text', content: entry.content }],
          timestamp: session.updatedAt.toISOString(),
        });
      } else if (entry.role === 'assistant' && entry.content && !entry.tool_calls?.length) {
        displayMessages.push({
          id: `hist-assistant-${msgIndex++}`,
          role: 'assistant',
          blocks: [{ type: 'text', content: entry.content }],
          timestamp: session.updatedAt.toISOString(),
        });
      }
      // tool_calls 和 tool results 不直接展示，它们的结果已经被 service 转成了富消息
    }

    return {
      sessionId: session.id,
      phase: state.phase,
      messages: displayMessages,
    };
  }

  // ── 核心对话处理 ──────────────────────────────────────

  async sendMessage(
    sessionId: string,
    userMessage: string,
  ): Promise<ConversationMessageResponse> {
    // 1. 加载会话状态
    const { state } = await this.getSession(sessionId);

    // 2. 追加用户消息到历史
    state.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // 3. 裁剪历史（防止超出 token 限制）
    this.trimHistory(state);

    // 4. 获取 AI 配置
    const aiConfig = await this.resolveAIConfig();
    if (!aiConfig) {
      return this.buildErrorResponse(sessionId, state, '未配置 AI 模型，请联系管理员');
    }

    // 5. 构建消息 + 调用 LLM
    const tools = getToolsForPhase(state.phase);
    const systemPrompt = buildSystemPrompt(state);

    // 将 tool_calls/tool 消息合并为精简的 assistant 摘要，避免 provider 格式兼容问题
    const sanitizedHistory = this.sanitizeHistoryForLLM(state.conversationHistory);

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory,
    ];

    let response!: AIChatResponse;

    // 构建所有可用的 AI 配置（主配置 + 降级候选）
    const allConfigs = await this.configService.getAllAIModelConfigs();
    const activeConfigs = allConfigs.filter((c) => c.isActive);
    const fallbackConfigs = activeConfigs.filter((c) => c.configKey !== aiConfig.configKey);

    // 日志：请求详情
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    this.logger.log(
      `📤 LLM 请求 [session=${sessionId}, phase=${state.phase}] ` +
      `provider=${aiConfig.provider}/${aiConfig.modelName}, ` +
      `msgs=${messages.length}, tools=${tools?.length || 0}, ` +
      `historyLen=${sanitizedHistory.length}, totalChars=${totalChars}, ` +
      `fallbacks=${fallbackConfigs.map((c) => c.configKey).join(',')}`,
    );

    // 逐个 config 尝试（主配置 + 降级）
    const configsToTry = [aiConfig, ...fallbackConfigs];
    let lastErrorMsg = '';

    for (let ci = 0; ci < configsToTry.length; ci++) {
      const currentConfig = configsToTry[ci];
      const isFailover = ci > 0;
      const MAX_RETRIES = isFailover ? 1 : 2; // 降级 provider 只重试 1 次

      if (isFailover) {
        this.logger.warn(
          `🔄 降级到 ${currentConfig.provider}/${currentConfig.modelName} (${currentConfig.configKey}) [session=${sessionId}]`,
        );
      }

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const provider = this.aiProviderFactory.getProvider(currentConfig.provider as AIProvider);
          if (!provider.generateChat) {
            this.logger.warn(`Provider ${currentConfig.provider} 不支持 generateChat，跳过`);
            break;
          }

          const startTime = Date.now();
          response = await provider.generateChat(messages, {
            ...this.aiModelService.buildAIRequestOptions({
              provider: currentConfig.provider as AIProvider,
              config: currentConfig,
              modelName: currentConfig.modelName || 'gpt-4',
              apiKey: this.aiModelService.resolveApiKey(currentConfig, this.aiModelService.apiKey),
              apiUrl: this.aiModelService.resolveApiUrl(currentConfig, this.aiModelService.apiUrl) || undefined,
              temperature: 0.3,
              maxTokens: 4096,
              timeoutSeconds: 60,
              maxRetries: 1,
            }),
            tools,
          });

          const elapsed = Date.now() - startTime;
          this.logger.log(
            `✅ LLM 响应 [session=${sessionId}] ` +
            `provider=${currentConfig.provider}/${currentConfig.modelName}, ` +
            `elapsed=${elapsed}ms, ` +
            `hasContent=${!!response.content}, ` +
            `toolCalls=${response.tool_calls?.length || 0}` +
            (isFailover ? ' (降级成功)' : ''),
          );

          // 成功 → 跳出所有循环
          ci = configsToTry.length; // 外层也退出
          break;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          lastErrorMsg = err.message;

          const isRetryable = lastErrorMsg.includes('502') || lastErrorMsg.includes('503')
            || lastErrorMsg.includes('429') || lastErrorMsg.includes('timeout')
            || lastErrorMsg.includes('ETIMEDOUT') || lastErrorMsg.includes('ECONNRESET')
            || lastErrorMsg.includes('No available accounts');

          if (isRetryable && attempt < MAX_RETRIES) {
            const delay = (attempt + 1) * 1500;
            this.logger.warn(
              `⏳ 重试 ${attempt + 1}/${MAX_RETRIES} [${currentConfig.provider}/${currentConfig.modelName}] ` +
              `${delay}ms 后重试: ${lastErrorMsg.slice(0, 80)}`,
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          // 本配置失败，打印日志后尝试下一个降级配置
          this.logger.error(
            `❌ LLM 失败 [${currentConfig.provider}/${currentConfig.modelName}] ` +
            `attempts=${attempt + 1}: ${lastErrorMsg.slice(0, 100)}`,
          );
          break; // 跳出内层 retry 循环，进入下一个 config
        }
      }
    }

    // 如果所有配置都失败
    if (!response || (!response.content && !response.tool_calls?.length)) {
      let friendlyMessage = 'AI 服务暂时不可用，已尝试所有可用模型。';
      if (lastErrorMsg.includes('502') || lastErrorMsg.includes('503')) {
        friendlyMessage = 'AI 服务端暂时过载，已尝试备用模型仍失败，请稍后再试。';
      } else if (lastErrorMsg.includes('timeout')) {
        friendlyMessage = 'AI 响应超时，请稍后重试。';
      } else if (lastErrorMsg.includes('401') || lastErrorMsg.includes('403')) {
        friendlyMessage = 'AI 服务认证失败，请联系管理员。';
      }
      return this.buildErrorResponse(sessionId, state, `${friendlyMessage}（${lastErrorMsg.slice(0, 120)}）`);
    }

    // 6. 处理 LLM 响应
    const richMessages: RichMessageBlock[] = [];

    if (response.tool_calls && response.tool_calls.length > 0) {
      // 记录 assistant 的 tool_calls 消息到历史
      state.conversationHistory.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });

      // 执行每个 tool call
      for (const toolCall of response.tool_calls) {
        const toolResult = await this.executeToolCall(toolCall, state, sessionId);
        richMessages.push(...toolResult.messages);

        // 记录 tool 结果到历史
        state.conversationHistory.push({
          role: 'tool',
          content: JSON.stringify(toolResult.data),
          tool_call_id: toolCall.id,
        });
      }
    } else if (response.content) {
      // LLM 直接回复文本（不应该发生，但做兜底）
      state.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });
      richMessages.push({ type: 'text', content: response.content });
    } else {
      richMessages.push({
        type: 'text',
        content: '抱歉，我没有理解您的意思。请再描述一下您想做什么分析？',
      });
    }

    // 7. 保存状态
    await this.saveState(sessionId, state);

    return {
      sessionId,
      phase: state.phase,
      messages: richMessages,
      matchedScene: state.matchedScene,
      collectedParams: state.extractedParams,
      workflowDefinitionId: state.workflowDefinitionId,
      workflowVersionId: state.workflowVersionId,
      lastExecutionId: state.lastExecutionId,
    };
  }

  // ── 工具执行 ──────────────────────────────────────────

  private async executeToolCall(
    toolCall: AIToolCall,
    state: ConversationState,
    sessionId: string,
  ): Promise<{ messages: RichMessageBlock[]; data: unknown }> {
    const { name, arguments: argsStr } = toolCall.function;

    let args: unknown = {};
    let argsParseFailed = false;
    try {
      args = JSON.parse(argsStr);
    } catch {
      argsParseFailed = true;
      this.logger.warn(`工具参数解析失败: ${argsStr}`);
    }

    if (
      argsParseFailed &&
      name !== 'collect_workflow_params' &&
      name !== 'match_scene_template'
    ) {
      return {
        messages: [{ type: 'text', content: '抱歉，处理过程中出现了问题，请重新描述。' }],
        data: { error: 'Invalid JSON arguments' },
      };
    }

    switch (name) {
      case 'match_scene_template':
        return this.handleMatchScene(args, state);

      case 'collect_workflow_params':
        return this.handleCollectParams(args, state);

      case 'confirm_and_create_workflow':
        return this.handleConfirmCreate(args, state, sessionId);

      case 'ask_clarification':
        return this.handleAskClarification(args, state);

      default:
        this.logger.warn(`未知工具: ${name}`);
        return {
          messages: [{ type: 'text', content: '系统内部工具调用错误。' }],
          data: { error: `Unknown tool: ${name}` },
        };
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private coerceRecord(value: unknown): Record<string, unknown> | null {
    const direct = this.asRecord(value);
    if (direct) return direct;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.asRecord(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }

  private coerceStringArray(value: unknown): string[] | null {
    if (Array.isArray(value)) {
      const filtered = value.filter((item) => typeof item === 'string') as string[];
      return filtered.length > 0 ? filtered : [];
    }
    if (typeof value === 'string') {
      const parts = value
        .split(/[，,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      return parts.length > 0 ? parts : [];
    }
    return null;
  }

  private coerceCollectParams(
    args: unknown,
    state: ConversationState,
  ): CollectParamsResult | null {
    const record = this.asRecord(args);
    if (!record) return null;

    const extractedParams =
      this.coerceRecord(record.extractedParams) ||
      this.coerceRecord(record.params) ||
      this.coerceRecord(record.collectedParams) ||
      {};

    const stillMissing =
      this.coerceStringArray(record.stillMissing) ||
      this.coerceStringArray(record.missingParams) ||
      state.missingParams;

    const isComplete =
      typeof record.isComplete === 'boolean' ? record.isComplete : stillMissing.length === 0;

    const userFacingMessage =
      typeof record.userFacingMessage === 'string' && record.userFacingMessage.trim().length > 0
        ? record.userFacingMessage
        : typeof record.message === 'string' && record.message.trim().length > 0
          ? record.message
          : '已更新参数。';

    return {
      extractedParams,
      stillMissing,
      isComplete,
      userFacingMessage,
    };
  }

  private getLastUserMessage(state: ConversationState): string | null {
    for (let i = state.conversationHistory.length - 1; i >= 0; i -= 1) {
      const entry = state.conversationHistory[i];
      if (entry.role === 'user' && typeof entry.content === 'string') {
        return entry.content;
      }
    }
    return null;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractLabeledValue(text: string, label: string): string | null {
    const pattern = new RegExp(`${this.escapeRegExp(label)}\\s*[:：]?\\s*([^,，;；\\s]+)`);
    const match = text.match(pattern);
    return match?.[1] ?? null;
  }

  private extractLabeledValueFromAliases(text: string, labels: string[]): string | null {
    for (const label of labels) {
      const value = this.extractLabeledValue(text, label);
      if (value) return value;
    }
    return null;
  }

  private applyRegionAliasMapping(
    extractedParams: Record<string, unknown>,
    requiredParams: string[],
    lastUserMessage: string,
  ): boolean {
    const alias = this.extractLabeledValueFromAliases(lastUserMessage, [
      '关注区域',
      '关注地区',
      '关注区域',
      '产地',
      '产区',
      '销区',
      '销地',
      '主销区',
      '消费地',
    ]);
    if (!alias) return false;

    const needsOrigin = requiredParams.includes('产区') && extractedParams['产区'] === undefined;
    const needsDest = requiredParams.includes('销区') && extractedParams['销区'] === undefined;

    if (needsOrigin && needsDest) {
      extractedParams['产区'] = alias;
      return true;
    }
    if (needsOrigin) {
      extractedParams['产区'] = alias;
      return true;
    }
    if (needsDest) {
      extractedParams['销区'] = alias;
      return true;
    }
    return false;
  }

  private extractArrowPair(text: string): { left: string; right: string } | null {
    const pattern =
      /([^,，;；\s]+)\s*(?:→|->|到|至|—|～|~|vs|VS|对比)\s*([^,，;；\s]+)/;
    const match = text.match(pattern);
    if (!match) return null;
    return { left: match[1], right: match[2] };
  }

  private extractCommodity(text: string): string | null {
    if (!text) return null;
    const candidates = [
      '玉米',
      '小麦',
      '大豆',
      '稻谷',
      '菜粕',
      '豆粕',
      '菜籽',
      '菜油',
      '豆油',
      '棉花',
      '棉纱',
      '高粱',
      '大麦',
      '白糖',
    ];
    for (const item of candidates) {
      if (text.includes(item)) return item;
    }
    return null;
  }

  private extractParamsFromText(text: string, keys: string[]): Record<string, string> {
    if (!text || keys.length === 0) return {};
    const extracted: Record<string, string> = {};
    const lines = text.split('\n');

    for (const line of lines) {
      const cleaned = line.trim().replace(/^[-*]\s*/, '');
      for (const key of keys) {
        if (extracted[key] !== undefined) continue;
        const prefixZh = `${key}：`;
        const prefixEn = `${key}:`;
        if (cleaned.startsWith(prefixZh)) {
          const value = cleaned.slice(prefixZh.length).trim();
          if (value) extracted[key] = value;
        } else if (cleaned.startsWith(prefixEn)) {
          const value = cleaned.slice(prefixEn.length).trim();
          if (value) extracted[key] = value;
        }
      }
    }

    return extracted;
  }

  private enrichMatchSceneFromMessage(
    result: MatchSceneResult,
    state: ConversationState,
  ): MatchSceneResult {
    const scene = SCENE_TEMPLATE_SUMMARIES.find((s) => s.code === result.sceneCode);
    const requiredParams = scene?.requiredParams ?? [];
    if (requiredParams.length === 0) return result;

    const extractedParams: Record<string, unknown> = {
      ...result.extractedParams,
    };

    const lastUserMessage = this.getLastUserMessage(state);
    if (lastUserMessage) {
      for (const param of requiredParams) {
        if (extractedParams[param] !== undefined) continue;
        const labeled = this.extractLabeledValue(lastUserMessage, param);
        if (labeled) {
          extractedParams[param] = labeled;
        }
      }

      if (
        requiredParams.includes('产区') &&
        requiredParams.includes('销区') &&
        (extractedParams['产区'] === undefined || extractedParams['销区'] === undefined)
      ) {
        const pair = this.extractArrowPair(lastUserMessage);
        if (pair) {
          if (extractedParams['产区'] === undefined) extractedParams['产区'] = pair.left;
          if (extractedParams['销区'] === undefined) extractedParams['销区'] = pair.right;
        }
      }

      this.applyRegionAliasMapping(extractedParams, requiredParams, lastUserMessage);

      if (requiredParams.includes('品种') && extractedParams['品种'] === undefined) {
        const commodity = this.extractCommodity(lastUserMessage);
        if (commodity) {
          extractedParams['品种'] = commodity;
        }
      }
    }

    const missingParams = requiredParams.filter((param) => extractedParams[param] === undefined);

    if (
      Object.keys(extractedParams).length === Object.keys(result.extractedParams).length &&
      missingParams.length === result.missingParams.length
    ) {
      return result;
    }

    return {
      ...result,
      extractedParams,
      missingParams,
    };
  }

  private enrichCollectParamsFromMessage(
    result: CollectParamsResult,
    state: ConversationState,
  ): CollectParamsResult {
    const lastUserMessage = this.getLastUserMessage(state);
    if (!lastUserMessage) return result;
    if (!state.missingParams || state.missingParams.length === 0) return result;

    const extractedParams: Record<string, unknown> = { ...result.extractedParams };
    let didEnrich = false;

    for (const param of state.missingParams) {
      if (extractedParams[param] !== undefined) continue;
      const labeled = this.extractLabeledValue(lastUserMessage, param);
      if (labeled) {
        extractedParams[param] = labeled;
        didEnrich = true;
      }
    }

    if (this.applyRegionAliasMapping(extractedParams, state.missingParams, lastUserMessage)) {
      didEnrich = true;
    }

    if (state.missingParams.includes('品种') && extractedParams['品种'] === undefined) {
      const commodity = this.extractCommodity(lastUserMessage);
      if (commodity) {
        extractedParams['品种'] = commodity;
        didEnrich = true;
      }
    }

    if (
      state.missingParams.includes('产区') &&
      state.missingParams.includes('销区') &&
      (extractedParams['产区'] === undefined || extractedParams['销区'] === undefined)
    ) {
      const pair = this.extractArrowPair(lastUserMessage);
      if (pair) {
        if (extractedParams['产区'] === undefined) {
          extractedParams['产区'] = pair.left;
          didEnrich = true;
        }
        if (extractedParams['销区'] === undefined) {
          extractedParams['销区'] = pair.right;
          didEnrich = true;
        }
      }
    }

    if (!didEnrich) return result;

    const merged = {
      ...state.extractedParams,
      ...extractedParams,
    };
    const stillMissing = state.missingParams.filter((param) => merged[param] === undefined);
    const isComplete = stillMissing.length === 0;

    return {
      ...result,
      extractedParams,
      stillMissing,
      isComplete,
    };
  }

  private buildCollectParamsResponse(
    result: CollectParamsResult,
    state: ConversationState,
  ): { messages: RichMessageBlock[]; data: unknown } {
    // 合并新参数
    state.extractedParams = {
      ...state.extractedParams,
      ...result.extractedParams,
    };
    state.missingParams = result.stillMissing;

    if (result.isComplete) {
      state.phase = 'WORKFLOW_READY';
      return {
        messages: [{
          type: 'workflow_preview',
          content: result.userFacingMessage,
          workflowPreview: {
            sceneName: this.getSceneName(state.matchedScene || '') || '自定义分析',
            description: this.getSceneDescription(state.matchedScene || '') || '',
            params: state.extractedParams,
          },
        }],
        data: result,
      };
    }

    state.phase = 'COLLECTING_PARAMS';
    return {
      messages: [{
        type: 'param_card',
        content: result.userFacingMessage,
        options: result.stillMissing,
      }],
      data: result,
    };
  }

  private buildCollectParamsFallbackMessage(
    result: CollectParamsResult,
    state: ConversationState,
  ): string {
    const mergedParams = {
      ...state.extractedParams,
      ...result.extractedParams,
    };
    const paramLines = Object.entries(mergedParams).map(
      ([key, value]) => `- ${key}：${String(value)}`,
    );
    const sceneName = this.getSceneName(state.matchedScene || '') || '分析';

    if (result.isComplete) {
      return [
        `✅ 参数已齐全，准备创建【${sceneName}】工作流`,
        '',
        '已收集参数：',
        ...(paramLines.length > 0 ? paramLines : ['- （无）']),
        '',
        '是否现在创建并运行？（回复“确认”即可）',
      ].join('\n');
    }

    return [
      '✅ 已根据你的输入补充参数。',
      '',
      '已识别参数：',
      ...(paramLines.length > 0 ? paramLines : ['- （无）']),
      '',
      `还需要：${result.stillMissing.join('、')}`,
      '请继续补充。',
    ].join('\n');
  }

  private buildDefaultWorkflowName(state: ConversationState): string {
    const sceneName = this.getSceneName(state.matchedScene || '') || '对话分析';
    const product = state.extractedParams?.['品种'];
    if (typeof product === 'string' && product.trim().length > 0) {
      return `${product}-${sceneName}`;
    }
    return sceneName;
  }

  private inferConfirmationFromMessage(state: ConversationState): boolean | null {
    const lastUserMessage = this.getLastUserMessage(state);
    if (!lastUserMessage) return null;
    const normalized = lastUserMessage.trim();
    if (!normalized) return null;

    const denyPattern = /(先不|不用|不需要|取消|不要|暂停|稍后|等会|先等等)/;
    if (denyPattern.test(normalized)) return false;

    const acceptPattern = /(开始|确认|创建|运行|执行|启动|好的|可以|行|马上|就现在)/;
    if (acceptPattern.test(normalized)) return true;

    return null;
  }

  private coerceConfirmCreate(args: unknown, state: ConversationState): ConfirmCreateResult | null {
    const record = this.asRecord(args);
    if (!record) return null;

    const confirmed =
      typeof record.confirmed === 'boolean'
        ? record.confirmed
        : this.inferConfirmationFromMessage(state) ?? false;

    const workflowName =
      typeof record.workflowName === 'string' && record.workflowName.trim().length > 0
        ? record.workflowName
        : this.buildDefaultWorkflowName(state);

    const finalParams =
      this.coerceRecord(record.finalParams) ||
      this.coerceRecord(record.params) ||
      this.coerceRecord(record.extractedParams) ||
      {};

    const userFacingMessage =
      typeof record.userFacingMessage === 'string' && record.userFacingMessage.trim().length > 0
        ? record.userFacingMessage
        : confirmed
          ? '已确认创建工作流。'
          : '已取消创建工作流。';

    return {
      confirmed,
      workflowName,
      finalParams,
      userFacingMessage,
    };
  }

  // ── 工具处理器 ────────────────────────────────────────

  private handleMatchScene(
    args: unknown,
    state: ConversationState,
  ): { messages: RichMessageBlock[]; data: unknown } {
    const parsed = MatchSceneResultSchema.safeParse(args);

    if (!parsed.success) {
      this.logger.warn(`match_scene_template 输出校验失败: ${parsed.error.message}`);
      state.phase = 'IDLE';
      return {
        messages: [{
          type: 'clarification',
          content: '我没有完全理解您的需求。您想做哪种类型的分析？',
          options: SCENE_TEMPLATE_SUMMARIES.slice(0, 5).map((s) => s.name),
        }],
        data: { error: parsed.error.message },
      };
    }

    const result: MatchSceneResult = this.enrichMatchSceneFromMessage(parsed.data, state);

    // 低置信度 → 追问
    if (result.confidence < 60) {
      state.phase = 'IDLE';
      return {
        messages: [{
          type: 'clarification',
          content: result.userFacingMessage,
          options: SCENE_TEMPLATE_SUMMARIES.slice(0, 5).map((s) => s.name),
        }],
        data: result,
      };
    }

    // 高置信度 → 更新状态
    state.matchedScene = result.sceneCode;
    state.confidence = result.confidence;
    state.extractedParams = {
      ...state.extractedParams,
      ...result.extractedParams,
    };
    state.missingParams = result.missingParams;

    if (result.missingParams.length === 0) {
      state.phase = 'WORKFLOW_READY';
      return {
        messages: [{
          type: 'workflow_preview',
          content: result.userFacingMessage,
          workflowPreview: {
            sceneName: this.getSceneName(result.sceneCode) || result.sceneCode,
            description: this.getSceneDescription(result.sceneCode) || '',
            params: state.extractedParams,
          },
        }],
        data: result,
      };
    }

    state.phase = 'COLLECTING_PARAMS';
    return {
      messages: [{
        type: 'param_card',
        content: result.userFacingMessage,
        options: result.missingParams,
      }],
      data: result,
    };
  }

  private handleCollectParams(
    args: unknown,
    state: ConversationState,
  ): { messages: RichMessageBlock[]; data: unknown } {
    const parsed = CollectParamsResultSchema.safeParse(args);

    if (!parsed.success) {
      const coerced = this.coerceCollectParams(args, state);
      if (coerced) {
        this.logger.warn(
          `collect_workflow_params 输出校验失败，已自动纠正: ${parsed.error.message}`,
        );
        const enriched = this.enrichCollectParamsFromMessage(coerced, state);
        return this.buildCollectParamsResponse(enriched, state);
      }
      const provisional: CollectParamsResult = {
        extractedParams: {},
        stillMissing: state.missingParams,
        isComplete: false,
        userFacingMessage: '',
      };
      const enriched = this.enrichCollectParamsFromMessage(provisional, state);
      if (Object.keys(enriched.extractedParams).length > 0) {
        const userFacingMessage = this.buildCollectParamsFallbackMessage(enriched, state);
        return this.buildCollectParamsResponse({ ...enriched, userFacingMessage }, state);
      }
      this.logger.warn(`collect_workflow_params 输出校验失败: ${parsed.error.message}`);
      return {
        messages: [{ type: 'text', content: '我没有完全理解，请再说一下？' }],
        data: { error: parsed.error.message },
      };
    }
    const enriched = this.enrichCollectParamsFromMessage(parsed.data, state);
    return this.buildCollectParamsResponse(enriched, state);
  }

  private async handleConfirmCreate(
    args: unknown,
    state: ConversationState,
    sessionId: string,
  ): Promise<{ messages: RichMessageBlock[]; data: unknown }> {
    const parsed = ConfirmCreateResultSchema.safeParse(args);

    if (!parsed.success) {
      const coerced = this.coerceConfirmCreate(args, state);
      if (coerced) {
        this.logger.warn(
          `confirm_and_create_workflow 输出校验失败，已自动纠正: ${parsed.error.message}`,
        );
        return this.handleConfirmCreate(coerced, state, sessionId);
      }
      this.logger.warn(`confirm_and_create_workflow 输出校验失败: ${parsed.error.message}`);
      return {
        messages: [{ type: 'text', content: '确认信息有误，请重新确认。' }],
        data: { error: parsed.error.message },
      };
    }

    const result: ConfirmCreateResult = {
      ...parsed.data,
      workflowName: parsed.data.workflowName?.trim()
        ? parsed.data.workflowName
        : this.buildDefaultWorkflowName(state),
      finalParams: parsed.data.finalParams ?? {},
    };

    if (!result.confirmed) {
      state.phase = 'COLLECTING_PARAMS';
      return {
        messages: [{ type: 'text', content: result.userFacingMessage }],
        data: result,
      };
    }

    // 创建工作流
    try {
      const session = await this.prisma.wizardSession.findUnique({
        where: { id: sessionId },
      });
      const userId = session?.userId || 'system';

      // 查找匹配的场景模板信息
      const scene = SCENE_TEMPLATE_SUMMARIES.find((s) => s.code === state.matchedScene);

      // 构建场景 DSL（核心：注入用户参数到完整节点链路）
      const mergedParams = {
        ...state.extractedParams,
        ...result.finalParams,
      };
      state.extractedParams = mergedParams;

      const sceneDsl = buildDslForScene(
        state.matchedScene || '',
        mergedParams,
      );

      const workflowId = sceneDsl?.workflowId
        || `conv-${(state.matchedScene || 'custom').toLowerCase()}-${Date.now().toString(36)}`;
      const mode = sceneDsl?.mode || 'LINEAR';

      const created = await this.workflowDefinitionService.create(userId, {
        workflowId,
        name: result.workflowName,
        description: scene?.description || '通过对话创建的工作流',
        mode,
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: sceneDsl as unknown as WorkflowDsl | undefined,
      });

      state.workflowDefinitionId = created.definition.id;
      state.workflowVersionId = created.version.id;
      state.phase = 'WORKFLOW_READY';

      // 自动发布版本以便立即运行（先 Preflight 校验）
      let isPublished = false;
      if (sceneDsl) {
        try {
          // Preflight 校验：规范化 DSL + 检查合法性
          const preflightResult = this.workflowDefinitionService.preflightDsl(
            sceneDsl as unknown as WorkflowDsl,
            'PUBLISH',
            'SAFE',
          );

          if (!preflightResult.validation.valid) {
            const errorSummary = preflightResult.validation.issues
              .filter((i) => i.severity === 'ERROR')
              .map((i) => `[${i.code}] ${i.message}`)
              .join('\n');
            this.logger.warn(`Preflight 校验未通过:\n${errorSummary}`);
            // 校验不通过时降级：不自动发布，但工作流仍可手动调整后发布
          } else {
            await this.workflowDefinitionService.publishVersion(
              userId,
              created.definition.id,
              { versionId: created.version.id },
            );
            isPublished = true;
            this.logger.log(`工作流版本已自动发布: ${created.version.id}`);
          }
        } catch (publishError) {
          this.logger.warn('自动发布版本失败，工作流仍可手动发布', publishError);
        }
      }

      // 尝试自动运行（仅在成功发布后）
      if (isPublished) {
        const autoRunResult = await this.tryAutoRun(userId, created.definition.id, state);

        if (autoRunResult) {
          state.lastExecutionId = autoRunResult.executionId;
          state.phase = 'RESULT_DELIVERED';

          return {
            messages: [
              {
                type: 'text',
                content: result.userFacingMessage,
              },
              {
                type: 'execution_result',
                content: autoRunResult.summary,
                executionResult: {
                  executionId: autoRunResult.executionId,
                  status: autoRunResult.status,
                  summary: autoRunResult.summary,
                  reportContent: autoRunResult.reportContent,
                  detailUrl: `/workflow/hub?tab=executions`,
                },
              },
            ],
            data: { ...result, executionId: autoRunResult.executionId },
          };
        }
      }

      return {
        messages: [{
          type: 'workflow_preview',
          content: `${result.userFacingMessage}\n\n工作流已创建${isPublished ? '并已发布' : ''}，您可以在工作流编排页面查看和运行。`,
          workflowPreview: {
            sceneName: result.workflowName,
            description: scene?.description || '',
            params: mergedParams,
          },
        }],
        data: {
          ...result,
          finalParams: mergedParams,
        },
      };
    } catch (error) {
      this.logger.error('创建工作流失败', error);
      return {
        messages: [{
          type: 'text',
          content: `创建工作流时遇到问题: ${error instanceof Error ? error.message : '未知错误'}。请稍后重试。`,
        }],
        data: { error: error instanceof Error ? error.message : 'unknown' },
      };
    }
  }

  private handleAskClarification(
    args: unknown,
    _state: ConversationState,
  ): { messages: RichMessageBlock[]; data: unknown } {
    const parsed = AskClarificationResultSchema.safeParse(args);

    if (!parsed.success) {
      return {
        messages: [{ type: 'text', content: '请再描述一下您想做什么？' }],
        data: { error: parsed.error.message },
      };
    }

    const result = parsed.data;

    return {
      messages: [{
        type: 'clarification',
        content: result.userFacingMessage,
        options: result.options,
      }],
      data: result,
    };
  }

  // ── 自动运行 ──────────────────────────────────────────

  private async tryAutoRun(
    userId: string,
    definitionId: string,
    state: ConversationState,
  ): Promise<{ executionId: string; status: string; summary: string; reportContent?: string } | null> {
    try {
      // 查找已发布版本（如果有的话）
      const version = await this.prisma.workflowVersion.findFirst({
        where: {
          workflowDefinitionId: definitionId,
          status: 'PUBLISHED',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!version) {
        // 没有已发布版本，跳过自动运行
        this.logger.log('无已发布版本，跳过自动运行');
        return null;
      }

      const executionResult = await this.workflowExecutionService.trigger(userId, {
        workflowDefinitionId: definitionId,
        workflowVersionId: version.id,
        triggerType: 'MANUAL',
        paramSnapshot: state.extractedParams,
      });

      const executionId = typeof executionResult === 'object' && executionResult !== null && 'id' in executionResult
        ? (executionResult as { id: string }).id
        : String(executionResult);

      // 查询执行结果
      const executionDetail = await this.prisma.workflowExecution.findUnique({
        where: { id: executionId },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const lastNodeOutput = executionDetail?.nodeExecutions?.[0]?.outputSnapshot;
      const reportContent =
        lastNodeOutput && typeof lastNodeOutput === 'object'
          ? JSON.stringify(lastNodeOutput, null, 2)
          : undefined;

      const status = executionDetail?.status ?? 'RUNNING';

      return {
        executionId,
        status,
        summary:
          status === 'SUCCESS'
            ? '✅ 分析完成！'
            : status === 'FAILED'
              ? '❌ 运行失败，请查看详情'
              : '⏳ 正在运行中...',
        reportContent,
      };
    } catch (error) {
      this.logger.warn('自动运行失败', error);
      return null;
    }
  }

  // ── 辅助方法 ──────────────────────────────────────────

  private async resolveAIConfig() {
    const allConfigs = await this.configService.getAllAIModelConfigs();
    return (
      allConfigs.find((c) => c.isDefault && c.isActive) ||
      allConfigs.find((c) => c.isActive) ||
      allConfigs[0] ||
      null
    );
  }

  private async saveState(sessionId: string, state: ConversationState): Promise<void> {
    await this.prisma.wizardSession.update({
      where: { id: sessionId },
      data: {
        currentStep: state.phase,
        sessionData: state as unknown as Record<string, never>,
      },
    });
  }

  private trimHistory(state: ConversationState): void {
    if (state.conversationHistory.length > MAX_HISTORY_TURNS) {
      // 保留最早的 system 消息和最近的消息
      state.conversationHistory = state.conversationHistory.slice(-MAX_HISTORY_TURNS);
    }
  }

  /**
   * 将 conversation history 中的 tool_calls/tool 消息对合并为精简的 assistant 摘要。
   *
   * 原始格式:
   *   { role: 'assistant', tool_calls: [...], content: null }
   *   { role: 'tool', tool_call_id: 'xxx', content: '{"result": ...}' }
   *
   * 合并后:
   *   { role: 'assistant', content: '[已调用工具: match_scene → {result}]' }
   *
   * 这样避免了不同 provider 对 tool_calls/tool 格式的兼容性问题。
   */
  private sanitizeHistoryForLLM(history: AIMessage[]): AIMessage[] {
    const result: AIMessage[] = [];
    let i = 0;

    while (i < history.length) {
      const msg = history[i];

      // 检测 assistant + tool_calls 消息
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // 收集后续的 tool result 消息
        const toolSummaries: string[] = [];
        if (msg.content) {
          toolSummaries.push(msg.content);
        }

        let j = i + 1;
        while (j < history.length && history[j].role === 'tool') {
          const toolMsg = history[j];
          const toolCall = msg.tool_calls.find(
            (tc: { id?: string }) => tc.id === toolMsg.tool_call_id,
          );
          const fnName = toolCall?.function?.name || 'tool';
          // 截取 tool result 的前 200 字符
          const resultSummary = (toolMsg.content || '').slice(0, 200);
          toolSummaries.push(`[${fnName}: ${resultSummary}]`);
          j++;
        }

        // 合并为一条 assistant 摘要
        result.push({
          role: 'assistant',
          content: toolSummaries.join('\n'),
        });

        i = j; // 跳过已处理的 tool 消息
      } else {
        result.push(msg);
        i++;
      }
    }

    return result;
  }

  private buildErrorResponse(
    sessionId: string,
    state: ConversationState,
    errorMessage: string,
  ): ConversationMessageResponse {
    return {
      sessionId,
      phase: state.phase,
      messages: [{ type: 'text', content: `⚠️ ${errorMessage}` }],
      matchedScene: state.matchedScene,
      collectedParams: state.extractedParams,
    };
  }

  private getSceneName(code: string): string | undefined {
    return SCENE_TEMPLATE_SUMMARIES.find((s) => s.code === code)?.name;
  }

  private getSceneDescription(code: string): string | undefined {
    return SCENE_TEMPLATE_SUMMARIES.find((s) => s.code === code)?.description;
  }
}
