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
import { AIModelService } from '../../ai/ai-model.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { ConversationUtilsService } from './conversation-utils.service';
import type { IntentCode, SessionState, SlotMap } from './conversation.types';

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
        if (currentIntent === 'DEBATE_MARKET_JUDGEMENT' || currentIntent === 'MARKET_SUMMARY_WITH_FORECAST') {
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
        const topicMatch = lower.match(/(?:关于|讨论|辩论|分析)\s*(.{2,20}?)(?:的|吗|呢|$)/);
        if (topicMatch?.[1]) {
            slots.topic = topicMatch[1].trim();
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
        const questions = missingSlots
            .map((slot) => questionMap[slot] ?? slot)
            .join('\n- ');
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
            /发[到给]邮箱|邮件|发送邮件|email|send.*mail/.test(lower) &&
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
}
