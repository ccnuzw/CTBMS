/**
 * ConversationIntentService — L1 统一意图调度器
 *
 * 双层检测架构：
 *   1. 规则层（正则/关键词） — 延迟 <1ms，覆盖简单操作
 *   2. LLM 层（AI 语义理解） — 延迟 ~500ms，覆盖复杂/模糊意图
 *
 * 所有意图识别、slot 提取、slot 默认值逻辑集中在此。
 */
import { Injectable } from '@nestjs/common';
import { WorkflowTemplateSource } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import { AIModelService } from '../../ai/ai-model.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { ConversationUtilsService } from './conversation-utils.service';
import type { IntentCode, SessionState, SlotMap, ReplyOption } from './conversation.types';

// ── Intent Types ─────────────────────────────────────────────────────────────

export type ActionIntentType =
  | 'ANALYSIS'
  | 'EXPORT'
  | 'DELIVER_EMAIL'
  | 'DELIVER_DINGTALK'
  | 'SCHEDULE'
  | 'SKILL_CREATE'
  | 'SKILL_SAVE'
  | 'BACKTEST'
  | 'COMPARE'
  | 'MODIFY_PARAM'
  | 'RETRY'
  | 'CHITCHAT'
  | 'CREATE_AGENT'
  | 'ASSEMBLE_WORKFLOW'
  | 'PROMOTE_AGENT'
  | 'HELP';

export interface ActionIntentResult {
  type: ActionIntentType;
  confidence: number;
  format?: string;
  emailTo?: string[];
  cronNatural?: string;
  slotUpdates?: Partial<SlotMap>;
  analysisIntent?: IntentCode;
}

@Injectable()
export class ConversationIntentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: ConversationUtilsService,
    private readonly aiModelService: AIModelService,
    private readonly aiProviderFactory: AIProviderFactory,
  ) { }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Unified intent detection — rule layer + optional LLM layer.
   */
  async detectUnifiedIntent(
    message: string,
    sessionState: SessionState,
    currentIntent?: string | null,
  ): Promise<ActionIntentResult> {
    // Layer 1: Rule-based fast path
    const ruleResult = this.detectByRules(message, sessionState);
    if (ruleResult) {
      return ruleResult;
    }

    // Layer 2: LLM semantic detection (if enabled)
    const llmResult = await this.detectByLLM(message, sessionState, currentIntent);
    if (llmResult) {
      return llmResult;
    }

    // Fallback: treat as analysis intent
    return {
      type: 'ANALYSIS',
      confidence: 0.5,
      analysisIntent: this.detectAnalysisIntent(message, currentIntent),
    };
  }

  /**
   * Detect the specific analysis intent (MARKET_SUMMARY vs DEBATE).
   */
  detectAnalysisIntent(message: string, currentIntent?: string | null): IntentCode {
    const lower = message.toLowerCase();
    if (lower.includes('辩论') || lower.includes('debate') || lower.includes('裁判')) {
      return 'DEBATE_MARKET_JUDGEMENT';
    }
    if (
      currentIntent === 'DEBATE_MARKET_JUDGEMENT' ||
      currentIntent === 'MARKET_SUMMARY_WITH_FORECAST'
    ) {
      return currentIntent;
    }
    return 'MARKET_SUMMARY_WITH_FORECAST';
  }

  /**
   * Extract slot values from natural language.
   */
  extractSlots(message: string): SlotMap {
    const slots: SlotMap = {};
    const lower = message.toLowerCase();

    // Time range
    const timePatterns: Array<[RegExp, string]> = [
      [/最近一周|近一周|上周|过去一周|last\s*week/i, '最近一周'],
      [/最近一个月|近一月|上月|过去一个月|last\s*month/i, '最近一个月'],
      [/最近三个月|近三月|近三个月/i, '最近三个月'],
      [/今[天日]|today/i, '今天'],
      [/本周|this\s*week/i, '本周'],
      [/本月|this\s*month/i, '本月'],
      [/今年|this\s*year/i, '今年'],
    ];
    for (const [pattern, value] of timePatterns) {
      if (pattern.test(lower)) {
        slots.timeRange = value;
        break;
      }
    }

    // Region
    const regionPatterns: Array<[RegExp, string]> = [
      [/东北/i, '东北地区'],
      [/华北/i, '华北地区'],
      [/华东/i, '华东地区'],
      [/华南/i, '华南地区'],
      [/华中/i, '华中地区'],
      [/西北/i, '西北地区'],
      [/西南/i, '西南地区'],
      [/全国|全部地区/i, '全国'],
    ];
    for (const [pattern, value] of regionPatterns) {
      if (pattern.test(lower)) {
        slots.region = value;
        break;
      }
    }

    // Output format
    if (/报告|report/i.test(lower)) {
      slots.outputFormat = ['分析报告'];
    } else if (/表格|数据|data|table/i.test(lower)) {
      slots.outputFormat = ['数据表格'];
    }

    // Topic (for debate)
    const debateTopicMatch = lower.match(
      /(?:请就|就|针对)\s*(.{2,40}?)(?:是否|进行辩论|展开辩论|进行讨论|辩论|讨论)/i,
    );
    if (debateTopicMatch?.[1]) {
      slots.topic = debateTopicMatch[1].trim().replace(/[\s，,。！？!?]+$/g, '');
    }

    if (!slots.topic) {
      const topicMatch = lower.match(/(?:关于|讨论|辩论|分析)\s*(.{2,20}?)(?:的|吗|呢|$)/);
      if (topicMatch?.[1]) {
        slots.topic = topicMatch[1].trim();
      }
    }

    return slots;
  }

  /**
   * Required slots by intent type.
   */
  requiredSlotsByIntent(intent: IntentCode): Array<keyof SlotMap> {
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      return ['topic', 'timeRange', 'region', 'judgePolicy'];
    }
    return ['timeRange', 'region', 'outputFormat'];
  }

  /**
   * Apply sensible defaults to minimize SLOT_FILLING interruptions.
   */
  applySlotDefaults(slots: SlotMap, intent: IntentCode): SlotMap {
    const defaults: Partial<SlotMap> = {
      timeRange: '最近一周',
      region: '全国',
      outputFormat: ['分析报告'],
    };
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      (defaults as Record<string, unknown>).judgePolicy = 'balanced';
    }
    const result = { ...slots };
    for (const [key, value] of Object.entries(defaults)) {
      if (this.utils.isSlotMissing(result[key as keyof SlotMap])) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  }

  /**
   * Build natural-language slot prompt instead of dry "请补充信息" text.
   */
  buildSlotPrompt(missingSlots: string[], _intent?: IntentCode): string {
    const questionMap: Record<string, string> = {
      timeRange: '你想分析哪个时间段的数据呢？比如"最近一周"或"最近一个月"',
      region: '分析哪个地区的数据？比如"东北地区"或"全国"',
      outputFormat: '你希望以什么形式查看结果？比如"分析报告"或"数据表格"',
      topic: '你想讨论什么主题？',
      judgePolicy: '你希望用什么方式来裁判辩论结果？',
    };

    if (missingSlots.length === 1) {
      return questionMap[missingSlots[0]] ?? '还需要补充一个信息：' + missingSlots[0];
    }
    const questions = missingSlots.map((slot) => questionMap[slot] ?? slot).join('\n- ');
    return '还需要你补充几个信息：\n- ' + questions + '\n\n你可以一次性告诉我，也可以逐个回答。';
  }

  // ── Private: Rule-Based Detection ────────────────────────────────────────

  private detectByRules(message: string, sessionState: SessionState): ActionIntentResult | null {
    const lower = message.trim().toLowerCase();

    // Export
    if (
      /导出|下载|生成pdf|生成报告|export/.test(lower) &&
      (sessionState === 'DONE' || sessionState === 'RESULT_DELIVERY')
    ) {
      return {
        type: 'EXPORT',
        confidence: 0.95,
        format: /excel|xlsx|csv/.test(lower) ? 'EXCEL' : 'PDF',
      };
    }

    // Email delivery
    if (
      /发[到给]邮箱|发到.*邮箱|邮件|发送邮件|email|send.*mail/.test(lower) &&
      (sessionState === 'DONE' || sessionState === 'RESULT_DELIVERY')
    ) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = message.match(emailRegex) ?? [];
      return {
        type: 'DELIVER_EMAIL',
        confidence: 0.95,
        emailTo: emails.length > 0 ? emails : undefined,
      };
    }

    // Retry
    if (
      /重[新试来]|再来|再[分做执]|retry/.test(lower) &&
      (sessionState === 'FAILED' || sessionState === 'DONE')
    ) {
      return { type: 'RETRY', confidence: 0.9 };
    }

    // Schedule
    if (/每[天周月日]|定[时期]|自动执行|schedule|cron/.test(lower)) {
      return { type: 'SCHEDULE', confidence: 0.85, cronNatural: message };
    }

    // Backtest
    if (/回测|backtest|历史验证|模拟/.test(lower) && sessionState === 'DONE') {
      return { type: 'BACKTEST', confidence: 0.9 };
    }

    // Compare
    if (/对比|比较|compare|vs|和.*相比/.test(lower)) {
      return { type: 'COMPARE', confidence: 0.8 };
    }

    // Modify params
    if (
      /换[个一]|改[成为]|调整|修改|更新.*参数/.test(lower) &&
      (sessionState === 'DONE' || sessionState === 'EXECUTING')
    ) {
      const slotUpdates = this.extractSlots(message);
      return { type: 'MODIFY_PARAM', confidence: 0.85, slotUpdates };
    }

    // Help
    if (/帮助|help|怎么用|如何使用|什么功能/.test(lower)) {
      return { type: 'HELP', confidence: 0.95 };
    }

    // Create Agent (Phase 4: 动态 Agent 生成)
    if (/创建.*智能体|生成.*agent|新建.*智能体|创建.*agent|帮我.*创建.*分析/i.test(lower)) {
      return { type: 'CREATE_AGENT', confidence: 0.9 };
    }

    // Assemble Workflow (Phase 13: 动态工作流组装)
    if (/组装.*工作流|编排.*流程|先.*再.*最后|创建.*工作流|搭建.*流水线|组合.*分析/i.test(lower)) {
      return { type: 'ASSEMBLE_WORKFLOW', confidence: 0.85 };
    }

    // Promote Agent (Phase 13: 晋升智能体)
    if (/晋升.*智能体|保存.*智能体|持久化.*agent|agent.*持久化|永久.*保存.*agent|转正.*智能体/i.test(lower)) {
      return { type: 'PROMOTE_AGENT', confidence: 0.9 };
    }

    return null;
  }

  // ── Private: LLM-Based Detection ─────────────────────────────────────────

  private async detectByLLM(
    message: string,
    sessionState: SessionState,
    currentIntent?: string | null,
  ): Promise<ActionIntentResult | null> {
    if (process.env.AGENT_COPILOT_LLM_INTENT_ENABLED === 'false') {
      return null;
    }

    const model = await this.aiModelService.getSystemModelConfig();
    if (!model) {
      return null;
    }

    try {
      const provider = this.aiProviderFactory.getProvider(model.provider);
      const systemPrompt = [
        '你是意图分类器。根据用户消息和当前会话状态，输出一个 JSON。',
        '可选意图类型：ANALYSIS, EXPORT, DELIVER_EMAIL, SCHEDULE, BACKTEST, COMPARE, MODIFY_PARAM, RETRY, SKILL_CREATE, SKILL_SAVE, CHITCHAT, HELP',
        '输出格式：{"type":"ANALYSIS","confidence":0.9,"analysisIntent":"MARKET_SUMMARY_WITH_FORECAST"}',
        '当无法确定时使用 ANALYSIS。confidence 0-1。',
        '不要输出 markdown，只输出 JSON。',
      ].join('\n');

      const userPrompt = JSON.stringify({
        message,
        sessionState,
        currentIntent,
      });

      const raw = await provider.generateResponse(systemPrompt, userPrompt, {
        modelName: model.modelId,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
        wireApi: model.wireApi,
        temperature: 0.1,
        maxTokens: 150,
        timeoutSeconds: 5,
        maxRetries: 1,
      });

      const parsed = this.utils.parseJsonObject(raw);
      if (!parsed) {
        return null;
      }

      const type = this.utils.pickString(parsed.type) as ActionIntentType | null;
      if (!type) {
        return null;
      }

      return {
        type,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        analysisIntent: (this.utils.pickString(parsed.analysisIntent) as IntentCode) ?? undefined,
        format: this.utils.pickString(parsed.format) ?? undefined,
        cronNatural: this.utils.pickString(parsed.cronNatural) ?? undefined,
      };
    } catch {
      return null;
    }
  }

  // ── A2: Capability Discovery (能力自发现) ──────────────────────────────────

  /**
   * Build a user-friendly message listing all available capabilities.
   * Queries AgentProfile, AgentSkill, and WorkflowDefinition tables.
   */
  async buildCapabilityDiscoveryMessage(userId: string): Promise<string> {
    const [agents, skills, workflows] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where: {
          OR: [{ ownerUserId: userId }, { templateSource: WorkflowTemplateSource.PUBLIC }],
          isActive: true,
        },
        select: { agentName: true, objective: true, agentCode: true },
        take: 10,
      }),
      this.prisma.agentSkill.findMany({
        where: { isActive: true },
        select: { name: true, description: true, skillCode: true },
        take: 10,
      }),
      this.prisma.workflowDefinition.findMany({
        where: {
          OR: [{ ownerUserId: userId }, { templateSource: WorkflowTemplateSource.PUBLIC }],
          isActive: true,
        },
        select: { name: true, description: true },
        take: 8,
      }),
    ]);

    const lines: string[] = ['我可以帮你做以下事情：', ''];

    // Core capabilities (always available)
    lines.push('📊 **市场分析** — 分析品种价格走势、供需预测、风险评估');
    lines.push('⚖️ **多方辩论** — 多角度分析市场观点，AI 裁判给出结论');
    lines.push('📋 **报告导出** — 将分析结果导出为 PDF / Word 格式');
    lines.push('📬 **多渠道推送** — 通过邮件、钉钉、企微、飞书发送报告');
    lines.push('⏰ **定时任务** — 设置自动定时分析推送');
    lines.push('🔍 **对比分析** — 对比不同品种/时段的数据差异');
    lines.push('🔄 **历史回测** — 验证分析策略的历史表现');

    // Dynamic agents
    if (agents.length > 0) {
      lines.push('');
      lines.push('🤖 **可用智能体：**');
      for (const agent of agents) {
        const desc = agent.objective ? ` — ${agent.objective}` : '';
        lines.push(`  • ${agent.agentName}${desc}`);
      }
    }

    // Dynamic skills
    if (skills.length > 0) {
      lines.push('');
      lines.push('🧩 **可用技能：**');
      for (const skill of skills) {
        const desc = skill.description ? ` — ${skill.description}` : '';
        lines.push(`  • ${skill.name}${desc}`);
      }
    }

    // Dynamic workflows
    if (workflows.length > 0) {
      lines.push('');
      lines.push('⚙️ **可用工作流：**');
      for (const wf of workflows) {
        const desc = wf.description ? ` — ${wf.description}` : '';
        lines.push(`  • ${wf.name}${desc}`);
      }
    }

    lines.push('');
    lines.push(
      '直接用自然语言告诉我你想做什么就行，比如「分析玉米最近一周走势」或「帮我对比大豆和豆粕」。',
    );

    return lines.join('\n');
  }

  // ── C3: Smart Next-Step Recommendations (意图链推荐) ────────────────────────

  /**
   * Build intelligent next-step reply options based on the completed action.
   * Returns context-aware suggestions instead of generic options.
   */
  buildSmartNextStepOptions(completedAction: {
    sessionState: SessionState;
    intent?: IntentCode;
    hasResult: boolean;
    hasExport: boolean;
  }): ReplyOption[] {
    const { sessionState, hasResult, hasExport } = completedAction;

    // After analysis is done
    if (sessionState === 'DONE' && hasResult && !hasExport) {
      return [
        { id: 'next_export', label: '导出为 PDF 报告', mode: 'SEND', value: '帮我导出报告' },
        { id: 'next_email', label: '发送到邮箱', mode: 'SEND', value: '发到我邮箱' },
        { id: 'next_schedule', label: '设为定时推送', mode: 'SEND', value: '每周一早上自动执行' },
        { id: 'next_compare', label: '跟其他品种对比', mode: 'SEND', value: '跟其他品种对比一下' },
      ];
    }

    // After export is done
    if (sessionState === 'DONE' && hasExport) {
      return [
        { id: 'next_email_export', label: '发送到邮箱', mode: 'SEND', value: '把报告发到我邮箱' },
        {
          id: 'next_schedule_export',
          label: '设为定期发送',
          mode: 'SEND',
          value: '每周自动发送报告',
        },
        { id: 'next_new_task', label: '开始新分析', mode: 'SEND', value: '再帮我分析另一个品种' },
      ];
    }

    // After execution failed
    if (sessionState === 'FAILED') {
      return [
        { id: 'next_retry', label: '重新执行', mode: 'SEND', value: '重新执行一次' },
        { id: 'next_modify', label: '调整参数重试', mode: 'SEND', value: '调整参数重新分析' },
        { id: 'next_help', label: '查看帮助', mode: 'SEND', value: '帮助' },
      ];
    }

    // During execution
    if (sessionState === 'EXECUTING') {
      return [
        { id: 'next_progress', label: '查看进度', mode: 'OPEN_TAB', tab: 'progress' },
        { id: 'next_new_question', label: '同时问个问题', mode: 'SEND' },
      ];
    }

    // Default: initial state
    return [
      { id: 'next_analysis', label: '开始市场分析', mode: 'SEND', value: '分析最近一周的市场走势' },
      { id: 'next_debate', label: '发起多方辩论', mode: 'SEND', value: '关于市场走势的多方辩论' },
      { id: 'next_help', label: '查看我能做什么', mode: 'SEND', value: '帮助' },
    ];
  }
}
