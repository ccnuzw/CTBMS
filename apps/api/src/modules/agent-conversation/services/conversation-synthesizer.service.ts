/**
 * ConversationSynthesizerService — 结果融合
 *
 * 职责：
 *   - 将多 Agent 输出融合为结构化报告（synthesizeResult）
 *   - 生成卡片化展现数据（buildReportCards）
 *   - LLM 工作流路由选择（llmSelectWorkflow，score < 0.6 时触发）
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { AIModelService } from '../../ai/ai-model.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';

/** 融合报告结构 */
export interface SynthesizedReport {
    title: string;
    summary: string;
    keyFindings: Array<{ label: string; value: string; confidence?: number }>;
    riskWarnings: string[];
    actionSuggestions: string[];
    dataTimestamp: string | null;
    sourceAgentCount: number;
    synthesizedAt: string;
}

/** 结果卡片 */
export interface ReportCard {
    id: string;
    type: 'SUMMARY' | 'FINDING' | 'RISK' | 'ACTION' | 'DATA';
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
    order: number;
}

/** LLM 工作流选择结果 */
export interface LlmWorkflowSelection {
    selectedId: string;
    selectedName: string;
    score: number;
    reason: string;
    source: 'LLM_SELECTOR';
}

@Injectable()
export class ConversationSynthesizerService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly aiModelService: AIModelService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── 结果融合 ──────────────────────────────────────────────────────────────

    /**
     * 将工作流执行的多 Agent 输出融合为一份结构化报告。
     *
     * 流程：
     *   1. 从执行结果中提取各 Agent 的 facts/analysis/actions
     *   2. 调用 LLM 将多个视角合并为统一结论
     *   3. 生成 SynthesizedReport 存储为 RESULT_SYNTHESIS 资产
     */
    async synthesizeResult(
        sessionId: string,
        executionResult: Record<string, unknown>,
    ): Promise<SynthesizedReport | null> {
        const normalizedFacts = this.extractFacts(executionResult);
        const normalizedAnalysis = this.extractAnalysis(executionResult);
        const normalizedActions = this.extractActions(executionResult);
        const agentOutputs = this.extractAgentOutputs(executionResult);

        // 如果没有有效数据，返回基础报告
        if (!normalizedFacts.length && !normalizedAnalysis && !agentOutputs.length) {
            return null;
        }

        // 尝试 LLM 融合
        const llmSynthesis = await this.tryLlmSynthesis(normalizedFacts, normalizedAnalysis, normalizedActions, agentOutputs);
        const report: SynthesizedReport = llmSynthesis ?? this.buildFallbackReport(normalizedFacts, normalizedAnalysis, normalizedActions, agentOutputs);

        // 存储为资产
        await this.assetService.createAsset({
            sessionId,
            assetType: 'NOTE',
            title: `结果融合报告 ${new Date().toISOString().slice(0, 16)}`,
            payload: report as unknown as Record<string, unknown>,
            tags: { synthesized: true, sourceAgentCount: report.sourceAgentCount },
        });

        return report;
    }

    // ── 卡片化展现 ────────────────────────────────────────────────────────────

    /**
     * 将融合报告转换为前端卡片组数据。
     */
    buildReportCards(report: SynthesizedReport): ReportCard[] {
        const cards: ReportCard[] = [];
        let order = 0;

        // 总结卡片
        cards.push({
            id: `card_summary_${order}`, type: 'SUMMARY', title: report.title,
            content: report.summary, order: order++,
            metadata: { sourceAgentCount: report.sourceAgentCount, dataTimestamp: report.dataTimestamp },
        });

        // 关键发现卡片
        for (const finding of report.keyFindings) {
            cards.push({
                id: `card_finding_${order}`, type: 'FINDING', title: finding.label,
                content: finding.value, order: order++,
                metadata: { confidence: finding.confidence },
            });
        }

        // 风险警示卡片
        if (report.riskWarnings.length > 0) {
            cards.push({
                id: `card_risk_${order}`, type: 'RISK', title: '风险提示',
                content: report.riskWarnings.join('\n'), order: order++,
            });
        }

        // 操作建议卡片
        if (report.actionSuggestions.length > 0) {
            cards.push({
                id: `card_action_${order}`, type: 'ACTION', title: '操作建议',
                content: report.actionSuggestions.join('\n'), order: order++,
            });
        }

        return cards;
    }

    // ── LLM 工作流路由选择 ─────────────────────────────────────────────────────

    /**
     * 当规则匹配分 < threshold 时启用 LLM 选择器。
     * 将所有工作流描述传入 LLM，由模型选择最佳匹配。
     */
    async llmSelectWorkflow(
        intent: string,
        userMessage: string,
        candidates: Array<{ id: string; name: string; description: string | null }>,
    ): Promise<LlmWorkflowSelection | null> {
        if (!candidates.length) return null;

        const model = await this.aiModelService.getSystemModelConfig();
        if (!model) return null;

        try {
            const provider = this.aiProviderFactory.getProvider(model.provider);
            const systemPrompt = [
                '你是工作流路由选择专家。根据用户需求和可用工作流列表，选择最匹配的工作流。',
                '请严格输出 JSON，不要输出 markdown 或其他格式。',
                '',
                'JSON 结构：{"selectedIndex": number, "score": number, "reason": string}',
                'selectedIndex 是候选列表的索引（从 0 开始），score 0-1 表示匹配度，reason 用中文解释。',
                '如果没有任何合适的工作流，返回 {"selectedIndex": -1, "score": 0, "reason": "..."}',
                '',
                '示例：',
                '用户需求：「分析铜价走势」',
                '候选列表：[0] 价格趋势分析: 分析商品价格趋势\n[1] 供应链风险: 评估供应链风险',
                '输出：{"selectedIndex": 0, "score": 0.92, "reason": "用户明确要求价格走势分析，与价格趋势分析工作流高度匹配"}',
            ].join('\n');

            const candidateList = candidates.map((c, i) => `[${i}] ${c.name}: ${c.description ?? '无描述'}`).join('\n');
            const userPrompt = JSON.stringify({
                intent,
                userMessage: userMessage.slice(0, 500),
                candidates: candidateList,
            }, null, 2);

            const raw = await provider.generateResponse(systemPrompt, userPrompt, {
                modelName: model.modelId,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                wireApi: model.wireApi,
                temperature: 0.1,
                maxTokens: 200,
                timeoutSeconds: 10,
                maxRetries: 1,
            });

            const parsed = this.parseJsonObject(raw);
            if (!parsed) return null;

            const selectedIndex = typeof parsed.selectedIndex === 'number' ? parsed.selectedIndex : -1;
            const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0;
            const reason = this.utils.pickString(parsed.reason) ?? '无';

            if (selectedIndex < 0 || selectedIndex >= candidates.length || score < 0.3) {
                return null;
            }

            const selected = candidates[selectedIndex];
            return {
                selectedId: selected.id,
                selectedName: selected.name,
                score,
                reason,
                source: 'LLM_SELECTOR',
            };
        } catch {
            return null;
        }
    }

    // ── Private: LLM 融合 ──────────────────────────────────────────────────────

    private async tryLlmSynthesis(
        facts: string[], analysis: string, actions: string[],
        agentOutputs: Array<{ agentCode: string; perspective: string; content: string }>,
    ): Promise<SynthesizedReport | null> {
        const model = await this.aiModelService.getSystemModelConfig();
        if (!model) return null;

        try {
            const provider = this.aiProviderFactory.getProvider(model.provider);
            const systemPrompt = [
                '你是大宗商品分析融合专家。将多个智能体的分析结果融合为一份结构化报告。',
                '请严格输出 JSON，不要输出 markdown 或其他格式。',
                '',
                'JSON 结构：',
                '{',
                '  "title": "报告标题",',
                '  "summary": "200字以内的综合结论",',
                '  "keyFindings": [{"label": "发现标签", "value": "详细描述", "confidence": 0.8}],',
                '  "riskWarnings": ["风险1", "风险2"],',
                '  "actionSuggestions": ["建议1", "建议2"]',
                '}',
                '',
                '要求：',
                '- keyFindings 不超过 5 条，每条 confidence 介于 0-1',
                '- riskWarnings 不超过 3 条，仅包含高风险项',
                '- actionSuggestions 不超过 3 条，需可操作',
                '- summary 应综合所有 Agent 观点，突出共识和分歧',
            ].join('\n');

            const userPrompt = JSON.stringify({
                facts: facts.slice(0, 10),
                analysis: analysis.slice(0, 500),
                actions: actions.slice(0, 5),
                agentOutputs: agentOutputs.slice(0, 4).map((o) => ({
                    agent: o.agentCode, perspective: o.perspective, content: o.content.slice(0, 300),
                })),
            }, null, 2);

            const raw = await provider.generateResponse(systemPrompt, userPrompt, {
                modelName: model.modelId,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                wireApi: model.wireApi,
                temperature: 0.3,
                maxTokens: 800,
                timeoutSeconds: 15,
                maxRetries: 1,
            });

            const parsed = this.parseJsonObject(raw);
            if (!parsed) return null;

            return {
                title: this.utils.pickString(parsed.title) ?? '分析报告',
                summary: this.utils.pickString(parsed.summary) ?? analysis,
                keyFindings: this.normalizeFindings(parsed.keyFindings),
                riskWarnings: this.normalizeStringArray(parsed.riskWarnings, 3),
                actionSuggestions: this.normalizeStringArray(parsed.actionSuggestions, 3),
                dataTimestamp: null,
                sourceAgentCount: agentOutputs.length,
                synthesizedAt: new Date().toISOString(),
            };
        } catch {
            return null;
        }
    }

    private buildFallbackReport(
        facts: string[], analysis: string, actions: string[],
        agentOutputs: Array<{ agentCode: string; perspective: string; content: string }>,
    ): SynthesizedReport {
        return {
            title: '分析结果汇总',
            summary: analysis || facts.slice(0, 3).join('；') || '暂无分析结论。',
            keyFindings: facts.slice(0, 5).map((fact, i) => ({
                label: `发现 ${i + 1}`, value: fact,
            })),
            riskWarnings: [],
            actionSuggestions: actions.slice(0, 3),
            dataTimestamp: null,
            sourceAgentCount: agentOutputs.length,
            synthesizedAt: new Date().toISOString(),
        };
    }

    // ── Private: Extractors ────────────────────────────────────────────────────

    private extractFacts(result: Record<string, unknown>): string[] {
        const facts = result.facts;
        if (Array.isArray(facts)) {
            return facts
                .map((item) => typeof item === 'string' ? item : (this.utils.toRecord(item).text ?? this.utils.pickString(item)))
                .filter((item): item is string => Boolean(item));
        }
        return [];
    }

    private extractAnalysis(result: Record<string, unknown>): string {
        return this.utils.pickString(result.analysis) ?? this.utils.pickString(result.conclusion) ?? '';
    }

    private extractActions(result: Record<string, unknown>): string[] {
        const actions = result.actions;
        if (Array.isArray(actions)) {
            return actions
                .map((item) => typeof item === 'string' ? item : this.utils.pickString(this.utils.toRecord(item).action))
                .filter((item): item is string => Boolean(item));
        }
        return [];
    }

    private extractAgentOutputs(result: Record<string, unknown>): Array<{
        agentCode: string; perspective: string; content: string;
    }> {
        const outputs = result.agentOutputs ?? result.nodeOutputs ?? result.debateRounds;
        if (!Array.isArray(outputs)) return [];
        return outputs
            .map((item) => {
                const record = this.utils.toRecord(item);
                const agentCode = this.utils.pickString(record.agentCode) ?? this.utils.pickString(record.nodeId) ?? 'unknown';
                const perspective = this.utils.pickString(record.perspective) ?? this.utils.pickString(record.role) ?? '';
                const content = this.utils.pickString(record.content) ?? this.utils.pickString(record.output) ?? JSON.stringify(record).slice(0, 500);
                return { agentCode, perspective, content };
            })
            .filter((item) => item.content.length > 0);
    }

    // ── Private: Normalizers ───────────────────────────────────────────────────

    private normalizeFindings(raw: unknown): Array<{ label: string; value: string; confidence?: number }> {
        if (!Array.isArray(raw)) return [];
        return raw
            .slice(0, 5)
            .map((item) => {
                const record = this.utils.toRecord(item);
                const label = this.utils.pickString(record.label) ?? '';
                const value = this.utils.pickString(record.value) ?? '';
                const rawConf = record.confidence;
                const confidence = typeof rawConf === 'number' && Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : undefined;
                return label && value ? { label, value, confidence } : null;
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }

    private normalizeStringArray(raw: unknown, maxCount: number): string[] {
        if (!Array.isArray(raw)) return [];
        return raw
            .slice(0, maxCount)
            .map((item) => typeof item === 'string' ? item : this.utils.pickString(item))
            .filter((item): item is string => Boolean(item));
    }

    private parseJsonObject(value: string): Record<string, unknown> | null {
        let text = value.trim();
        if (!text) return null;

        // Phase 10: 剥离 markdown 代码围栏
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) text = fenceMatch[1].trim();

        // 策略 1: 直接解析
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch { /* 继续尝试 */ }

        // 策略 2: 提取第一个 平衡的 {...} 块
        const objStart = text.indexOf('{');
        let objMatch: string | null = null;
        if (objStart >= 0) {
            let depth = 0;
            let inStr = false;
            let escape = false;
            for (let i = objStart; i < text.length; i++) {
                const ch = text[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\') { escape = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        objMatch = text.slice(objStart, i + 1);
                        break;
                    }
                }
            }
        }
        if (objMatch) {
            try {
                const parsed = JSON.parse(objMatch);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
            } catch { /* 继续尝试 */ }
        }

        // 策略 3: 修复常见 LLM 输出问题
        if (objMatch) {
            try {
                const fixed = objMatch
                    .replace(/,\s*([\]}])/g, '$1')
                    .replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
            } catch { /* ignore */ }
        }

        return null;
    }
}
