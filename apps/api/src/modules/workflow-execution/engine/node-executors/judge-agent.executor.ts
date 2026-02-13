import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import { PrismaService } from '../../../../prisma';
import { AIProviderFactory } from '../../../ai/providers/provider.factory';
import { AIRequestOptions } from '../../../ai/providers/base.provider';
import type { WorkflowNode } from '@packages/types';

/**
 * 裁判 Agent 执行器
 *
 * 支持节点类型: judge-agent
 *
 * 功能: 独立的裁判节点，接收上游辩论轮次的输出，
 * 综合评估各方论点并给出最终裁决（含评分、结论、行动建议）。
 * 与 debate-round 中的 JUDGE_AGENT 策略不同，本执行器是独立节点，
 * 可用于多阶段辩论流程中的最终裁决环节。
 *
 * 配置:
 *   config.judgeAgentCode: string (裁判 Agent 编码)
 *   config.scoringDimensions: string[] (评分维度, 默认 ['逻辑性', '数据支撑', '风险识别'])
 *   config.outputAction: boolean (是否输出行动建议, 默认 true)
 *   config.minConfidenceForAction: number (出具行动建议的最低置信度, 默认 60)
 *   config.verdictFormat: 'structured' | 'narrative' (裁决输出格式, 默认 structured)
 */
@Injectable()
export class JudgeAgentNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'JudgeAgentNodeExecutor';
    private readonly logger = new Logger(JudgeAgentNodeExecutor.name);

    private readonly DEFAULT_SCORING_DIMENSIONS = ['逻辑性', '数据支撑', '风险识别'];

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiProviderFactory: AIProviderFactory,
    ) {}

    supports(node: WorkflowNode): boolean {
        return node.type === 'judge-agent';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        const judgeAgentCode = config.judgeAgentCode as string | undefined;
        const scoringDimensions = (config.scoringDimensions as string[]) ?? this.DEFAULT_SCORING_DIMENSIONS;
        const outputAction = (config.outputAction as boolean) ?? true;
        const minConfidenceForAction = (config.minConfidenceForAction as number) ?? 60;
        const verdictFormat = (config.verdictFormat as string) ?? 'structured';

        // 提取上游辩论数据
        const debateData = this.extractDebateData(input);
        if (!debateData) {
            return {
                status: 'FAILED',
                output: {},
                message: `judge-agent 节点 ${node.name} 未接收到有效的辩论数据`,
            };
        }

        // 加载裁判 Agent Profile
        const profile = judgeAgentCode
            ? await this.prisma.agentProfile.findFirst({
                  where: { agentCode: judgeAgentCode, isActive: true },
              })
            : null;

        // 加载模型配置
        const modelConfigKey = (profile as Record<string, unknown> | null)?.modelConfigKey as string ?? 'default';
        const modelConfig = await this.prisma.aIModelConfig.findFirst({
            where: { configKey: modelConfigKey, isActive: true },
        });

        if (!modelConfig) {
            // 无 AI 模型时使用规则裁决
            this.logger.warn(`[${node.name}] 无可用 AI 模型，使用规则裁决`);
            return this.ruleBasedVerdict(node, debateData, scoringDimensions, outputAction, minConfidenceForAction);
        }

        // 构建裁判提示词
        const systemPrompt = this.buildJudgeSystemPrompt(
            scoringDimensions,
            outputAction,
            verdictFormat,
            profile as Record<string, unknown> | null,
        );
        const userPrompt = this.buildJudgeUserPrompt(debateData, input);

        this.logger.log(
            `[${node.name}] judge-agent 启动裁决: agent=${judgeAgentCode ?? 'default'}, ` +
            `维度=${scoringDimensions.length}, format=${verdictFormat}`,
        );

        // 调用 AI
        const startTime = Date.now();
        try {
            const providerType = this.detectProviderType(modelConfig as Record<string, unknown>);
            const provider = this.aiProviderFactory.getProvider(providerType);

            const requestOptions: AIRequestOptions = {
                modelName: modelConfig.modelName,
                apiKey: this.resolveApiKey(modelConfig as Record<string, unknown>),
                temperature: 0.3,
                maxTokens: 3000,
                timeoutMs: (profile as Record<string, unknown> | null)?.timeoutMs as number ?? 30000,
            };

            const rawResponse = await provider.generateResponse(
                systemPrompt,
                userPrompt,
                requestOptions,
            );

            const durationMs = Date.now() - startTime;
            const verdict = this.parseVerdict(rawResponse, verdictFormat);

            // 检查置信度是否足够出具行动建议
            const confidence = (verdict.confidence as number) ?? 0;
            if (outputAction && confidence < minConfidenceForAction) {
                verdict.action = 'REVIEW_ONLY';
                verdict.actionOverridden = true;
                verdict.actionOverrideReason = `置信度 ${confidence} 低于阈值 ${minConfidenceForAction}`;
            }

            return {
                status: 'SUCCESS',
                output: {
                    verdict,
                    judgeAgentCode: judgeAgentCode ?? 'default',
                    scoringDimensions,
                    verdictFormat,
                    durationMs,
                    modelName: modelConfig.modelName,
                    debateSummary: {
                        topic: debateData.topic,
                        roundCount: Array.isArray(debateData.rounds) ? debateData.rounds.length : 0,
                        participantCount: (debateData.participantCount as number) ?? 0,
                    },
                    _meta: {
                        executor: this.name,
                    },
                },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[${node.name}] judge-agent 调用失败: ${errorMsg}`);

            // 降级为规则裁决
            return this.ruleBasedVerdict(node, debateData, scoringDimensions, outputAction, minConfidenceForAction);
        }
    }

    // ────────────────── 辩论数据提取 ──────────────────

    private extractDebateData(input: Record<string, unknown>): Record<string, unknown> | null {
        // 直接上游是 debate-round 节点
        if (input.debate && input.rounds) {
            return input as Record<string, unknown>;
        }

        // 多分支输入
        const branches = input.branches as Record<string, Record<string, unknown>> | undefined;
        if (branches) {
            for (const output of Object.values(branches)) {
                if (output.debate && output.rounds) {
                    return output;
                }
            }
        }

        // 尝试从 verdict 字段提取（上游可能已经有部分裁决）
        if (input.verdict || input.arguments || input.topic) {
            return input as Record<string, unknown>;
        }

        return null;
    }

    // ────────────────── 规则裁决（降级方案） ──────────────────

    private ruleBasedVerdict(
        node: WorkflowNode,
        debateData: Record<string, unknown>,
        scoringDimensions: string[],
        outputAction: boolean,
        minConfidenceForAction: number,
    ): NodeExecutionResult {
        const rounds = debateData.rounds as Array<Record<string, unknown>> | undefined;
        const lastRound = rounds?.[rounds.length - 1];
        const args = (lastRound?.arguments as Array<Record<string, unknown>>) ?? [];

        // 基于置信度加权平均
        let totalConfidence = 0;
        let totalWeight = 0;
        const keyPointsSet = new Set<string>();

        for (const arg of args) {
            const confidence = (arg.confidence as number) ?? 50;
            const weight = 1;
            totalConfidence += confidence * weight;
            totalWeight += weight;

            const keyPoints = (arg.keyPoints as string[]) ?? [];
            for (const point of keyPoints) {
                keyPointsSet.add(point);
            }
        }

        const avgConfidence = totalWeight > 0 ? Math.round(totalConfidence / totalWeight) : 50;
        const consensusScore = (lastRound?.consensusScore as number) ?? 0;

        const scores: Record<string, number> = {};
        for (const dim of scoringDimensions) {
            scores[dim] = Math.round(avgConfidence * (0.7 + Math.random() * 0.3));
        }

        const verdict: Record<string, unknown> = {
            method: 'RULE_BASED',
            confidence: avgConfidence,
            consensusScore,
            scores,
            keyFindings: Array.from(keyPointsSet).slice(0, 10),
            reasoning: `基于 ${args.length} 位参与者的论点进行规则裁决`,
        };

        if (outputAction) {
            verdict.action = avgConfidence >= minConfidenceForAction ? 'REVIEW_ONLY' : 'HOLD';
        }

        this.logger.log(
            `[${node.name}] judge-agent 规则裁决: confidence=${avgConfidence}, consensus=${consensusScore}`,
        );

        return {
            status: 'SUCCESS',
            output: {
                verdict,
                judgeAgentCode: 'rule-based-fallback',
                scoringDimensions,
                verdictFormat: 'structured',
                debateSummary: {
                    topic: debateData.topic ?? '',
                    roundCount: rounds?.length ?? 0,
                    participantCount: args.length,
                },
                _meta: {
                    executor: this.name,
                    fallback: true,
                },
            },
        };
    }

    // ────────────────── 提示词构建 ──────────────────

    private buildJudgeSystemPrompt(
        scoringDimensions: string[],
        outputAction: boolean,
        verdictFormat: string,
        profile: Record<string, unknown> | null,
    ): string {
        const roleName = (profile?.roleType as string) ?? 'JUDGE';
        const parts: string[] = [
            `你是一位公正的辩论裁判（${roleName}）。请基于辩论记录综合评估各方论点。`,
            '',
            `评分维度: ${scoringDimensions.join(', ')}`,
            '',
        ];

        if (verdictFormat === 'structured') {
            parts.push('输出格式 (JSON):');
            parts.push('{');
            parts.push('  "conclusion": "综合结论",');
            parts.push(`  "confidence": 0-100,`);
            parts.push(`  "scores": { ${scoringDimensions.map((d) => `"${d}": 0-100`).join(', ')} },`);
            parts.push('  "keyFindings": ["要点1", "要点2"],');
            parts.push('  "dissent": "少数派观点摘要",');
            if (outputAction) {
                parts.push('  "action": "BUY|SELL|HOLD|REDUCE|REVIEW_ONLY",');
                parts.push('  "actionRationale": "行动建议理由"');
            }
            parts.push('}');
        } else {
            parts.push('请以叙述格式输出裁决结论，包含：综合分析、关键发现、置信度评估。');
        }

        return parts.join('\n');
    }

    private buildJudgeUserPrompt(
        debateData: Record<string, unknown>,
        input: Record<string, unknown>,
    ): string {
        const parts: string[] = [];

        const topic = (debateData.topic as string) ??
            ((debateData.debate as Record<string, unknown>)?.topic as string) ?? '未知主题';
        parts.push(`## 辩论主题\n${topic}`);

        const rounds = debateData.rounds as Array<Record<string, unknown>> | undefined;
        if (rounds && rounds.length > 0) {
            parts.push('\n## 辩论记录');
            for (const round of rounds) {
                const roundNum = round.roundNumber ?? '?';
                const consensus = round.consensusScore ?? '?';
                parts.push(`\n### 第 ${roundNum} 轮 (共识度: ${consensus})`);

                const args = (round.arguments as Array<Record<string, unknown>>) ?? [];
                for (const arg of args) {
                    const role = (arg.role as string) ?? (arg.agentCode as string) ?? '未知';
                    const confidence = arg.confidence ?? '?';
                    const keyPoints = (arg.keyPoints as string[]) ?? [];
                    parts.push(`**[${role}]** (置信度: ${confidence})`);
                    if (keyPoints.length > 0) {
                        parts.push(`要点: ${keyPoints.join('; ')}`);
                    }
                }
            }
        }

        // 附加上下文
        const debateContext = input.debateContext as Record<string, unknown> | undefined;
        if (debateContext) {
            parts.push('\n## 附加上下文');
            parts.push(JSON.stringify(debateContext, null, 2).slice(0, 2000));
        }

        return parts.join('\n');
    }

    // ────────────────── 输出解析 ──────────────────

    private parseVerdict(raw: string, format: string): Record<string, unknown> {
        if (format === 'narrative') {
            return { conclusion: raw, format: 'narrative' };
        }

        try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return typeof parsed === 'object' && parsed !== null ? parsed : { conclusion: raw };
        } catch {
            this.logger.warn('judge-agent JSON 解析失败，返回原始文本');
            return { conclusion: raw, parseError: true };
        }
    }

    // ────────────────── 工具方法 ──────────────────

    private detectProviderType(config: Record<string, unknown>): 'google' | 'openai' {
        const model = String(config.modelName ?? config.modelId ?? '');
        if (model.includes('gemini') || model.includes('palm')) return 'google';
        return 'openai';
    }

    private resolveApiKey(config: Record<string, unknown>): string {
        if (typeof config.apiKey === 'string' && config.apiKey) return config.apiKey;
        const envVar = config.apiKeyEnvVar as string;
        if (envVar) return process.env[envVar] ?? '';
        return process.env.GEMINI_API_KEY ?? '';
    }
}
