import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { PrismaService } from '../../../../prisma';
import { AIProviderFactory } from '../../../ai/providers/provider.factory';
import { AIRequestOptions } from '../../../ai/providers/base.provider';
import { DebateTraceService } from '../../../debate-trace/debate-trace.service';
import {
    WorkflowNodeExecutor,
    NodeExecutionContext,
    NodeExecutionResult,
} from '../node-executor.interface';

/**
 * 辩论参与者配置
 */
interface DebateParticipant {
    agentCode: string;
    role: string;
    perspective: string;
    weight: number;
}

/**
 * 单轮辩论记录
 */
interface DebateRoundRecord {
    roundNumber: number;
    arguments: {
        agentCode: string;
        role: string;
        response: string;
        confidence?: number;
        keyPoints: string[];
    }[];
    consensusScore: number;
}

/**
 * 辩论轮次节点执行器
 *
 * 支持多 Agent 辩论：
 * 1. 解析参与者列表 (来自节点 config.participants)
 * 2. 加载各 Agent 的 Profile + PromptTemplate
 * 3. 多轮辩论（each round: 每个 Agent 基于上一轮论点提出论述）
 * 4. 裁判策略（WEIGHTED / MAJORITY / JUDGE_AGENT）
 * 5. 收敛检测（连续两轮 consensusScore > threshold → 提前结束）
 * 6. 输出综合结论
 */
@Injectable()
export class DebateRoundNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'DebateRoundNodeExecutor';
    private readonly logger = new Logger(this.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly debateTraceService: DebateTraceService,
    ) { }

    supports(node: WorkflowNode): boolean {
        return node.type === 'debate-round';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input, paramSnapshot, executionId } = context;
        const config = node.config as Record<string, unknown>;

        // ── 解析配置 ──
        const participants = this.parseParticipants(config.participants);
        const maxRounds = (config.maxRounds as number) ?? 3;
        const judgePolicy = (config.judgePolicy as string) ?? 'WEIGHTED';
        const consensusThreshold = (config.consensusThreshold as number) ?? 0.8;
        const debateTopic = (config.topic as string) ?? this.extractTopicFromInput(input);

        if (participants.length < 2) {
            return {
                status: 'FAILED',
                output: {},
                message: '辩论至少需要 2 名参与者',
            };
        }

        this.logger.log(
            `[${executionId}] 启动辩论: ${participants.length} 名参与者, 最多 ${maxRounds} 轮`,
        );

        // ── 加载 Agent Profiles ──
        const agentProfiles = await this.loadAgentProfiles(participants);
        const rounds: DebateRoundRecord[] = [];
        let previousArguments: string[] = [];

        // ── 多轮辩论 ──
        for (let round = 1; round <= maxRounds; round++) {
            this.logger.log(`[${executionId}] 辩论第 ${round}/${maxRounds} 轮`);

            const roundArguments: DebateRoundRecord['arguments'] = [];

            for (const participant of participants) {
                const profile = agentProfiles.get(participant.agentCode);
                if (!profile) continue;

                const response = await this.callAgent(
                    profile,
                    participant,
                    debateTopic,
                    input,
                    paramSnapshot,
                    previousArguments,
                    round,
                    maxRounds,
                );

                roundArguments.push({
                    agentCode: participant.agentCode,
                    role: participant.role,
                    response: response.text,
                    confidence: response.confidence,
                    keyPoints: response.keyPoints,
                });
            }

            // 评估共识度
            const consensusScore = this.evaluateConsensus(roundArguments);

            rounds.push({
                roundNumber: round,
                arguments: roundArguments,
                consensusScore,
            });

            // 更新上一轮论点
            previousArguments = roundArguments.map(
                (a) => `[${a.role}] ${a.response}`,
            );

            // 收敛检测
            if (consensusScore >= consensusThreshold) {
                this.logger.log(
                    `[${executionId}] 辩论在第 ${round} 轮达成共识 (score: ${consensusScore})`,
                );

                // 写入轨迹 (fire-and-forget)
                this.writeRoundTraces(executionId, round, roundArguments, consensusScore)
                    .catch((err) => this.logger.warn(`轨迹写入失败: ${String(err)}`));

                break;
            }

            // 普通轮次写入轨迹 (fire-and-forget)
            this.writeRoundTraces(executionId, round, roundArguments, consensusScore)
                .catch((err) => this.logger.warn(`轨迹写入失败: ${String(err)}`));
        }

        // ── 裁判合成 ──
        const verdict = await this.synthesizeVerdict(
            judgePolicy,
            participants,
            rounds,
            debateTopic,
            agentProfiles,
            input,
            paramSnapshot,
        );

        return {
            status: 'SUCCESS',
            output: {
                debate: {
                    topic: debateTopic,
                    participantCount: participants.length,
                    roundCount: rounds.length,
                    maxRounds,
                    judgePolicy,
                    consensusThreshold,
                    finalConsensusScore: rounds[rounds.length - 1]?.consensusScore ?? 0,
                },
                rounds: rounds.map((r) => ({
                    roundNumber: r.roundNumber,
                    consensusScore: r.consensusScore,
                    argumentCount: r.arguments.length,
                    arguments: r.arguments.map((a) => ({
                        agentCode: a.agentCode,
                        role: a.role,
                        confidence: a.confidence,
                        keyPoints: a.keyPoints,
                    })),
                })),
                verdict,
            },
        };
    }

    // ────────────────── 轨迹写入 ──────────────────

    /**
     * 将一轮辩论的所有论点写入 DebateRoundTrace 表
     */
    private async writeRoundTraces(
        executionId: string,
        roundNumber: number,
        roundArguments: DebateRoundRecord['arguments'],
        consensusScore: number,
    ): Promise<void> {
        const traces = roundArguments.map((arg) => ({
            workflowExecutionId: executionId,
            roundNumber,
            participantCode: arg.agentCode,
            participantRole: arg.role,
            statementText: arg.response,
            confidence: arg.confidence ?? null,
            previousConfidence: null,
            isJudgement: false,
            keyPoints: arg.keyPoints,
            evidenceRefs: {} as Record<string, unknown>,
            consensusScore,
        }));

        await this.debateTraceService.createBatch(traces);
    }

    // ────────────────── 核心方法 ──────────────────

    /**
     * 调用单个 Agent 进行辩论
     */
    private async callAgent(
        profile: Record<string, unknown>,
        participant: DebateParticipant,
        topic: string,
        input: Record<string, unknown>,
        paramSnapshot: Record<string, unknown> | undefined,
        previousArguments: string[],
        round: number,
        maxRounds: number,
    ): Promise<{ text: string; confidence?: number; keyPoints: string[] }> {
        const modelConfigKey = (profile.modelConfigKey as string) ?? 'default';
        const modelConfig = await this.resolveModelConfig(modelConfigKey);

        const systemPrompt = this.buildDebateSystemPrompt(
            participant,
            topic,
            round,
            maxRounds,
        );

        const userPrompt = this.buildDebateUserPrompt(
            input,
            paramSnapshot,
            previousArguments,
            round,
        );

        try {
            const providerType = this.detectProviderType(modelConfig);
            const provider = this.aiProviderFactory.getProvider(providerType);

            const requestOptions: AIRequestOptions = {
                modelName: (modelConfig.modelId as string) ?? 'gemini-2.0-flash',
                apiKey: this.resolveApiKey(modelConfig),
                temperature: 0.7,
                maxTokens: 2000,
            };

            const response = await provider.generateResponse(
                systemPrompt,
                userPrompt,
                requestOptions,
            );

            return this.parseDebateResponse(response);
        } catch {
            this.logger.warn(`Agent ${participant.agentCode} 辩论调用失败，使用默认回复`);
            return {
                text: `[${participant.role}] 无法参与本轮辩论`,
                keyPoints: [],
            };
        }
    }

    /**
     * 合成裁判结论
     */
    private async synthesizeVerdict(
        judgePolicy: string,
        participants: DebateParticipant[],
        rounds: DebateRoundRecord[],
        topic: string,
        agentProfiles: Map<string, Record<string, unknown>>,
        input: Record<string, unknown>,
        paramSnapshot: Record<string, unknown> | undefined,
    ): Promise<Record<string, unknown>> {
        const lastRound = rounds[rounds.length - 1];
        if (!lastRound) {
            return { action: 'HOLD', confidence: 0, reasoning: '无辩论数据' };
        }

        if (judgePolicy === 'WEIGHTED') {
            return this.weightedVerdict(participants, lastRound);
        }

        if (judgePolicy === 'MAJORITY') {
            return this.majorityVerdict(lastRound);
        }

        if (judgePolicy === 'JUDGE_AGENT') {
            return this.judgeAgentVerdict(
                rounds, topic, participants, agentProfiles, input, paramSnapshot,
            );
        }

        return this.weightedVerdict(participants, lastRound);
    }

    /**
     * 加权投票裁判
     */
    private weightedVerdict(
        participants: DebateParticipant[],
        lastRound: DebateRoundRecord,
    ): Record<string, unknown> {
        const weightMap = new Map(participants.map((p) => [p.agentCode, p.weight]));
        let totalWeight = 0;
        let weightedConfidence = 0;
        const allKeyPoints: string[] = [];

        for (const arg of lastRound.arguments) {
            const weight = weightMap.get(arg.agentCode) ?? 1;
            totalWeight += weight;
            weightedConfidence += (arg.confidence ?? 50) * weight;
            allKeyPoints.push(...arg.keyPoints);
        }

        const avgConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 50;

        return {
            method: 'WEIGHTED',
            confidence: Math.round(avgConfidence * 100) / 100,
            consensusScore: lastRound.consensusScore,
            keyFindings: [...new Set(allKeyPoints)],
            reasoning: lastRound.arguments.map((a) => `[${a.role}] ${a.keyPoints.join('; ')}`).join('\n'),
        };
    }

    /**
     * 多数投票裁判
     */
    private majorityVerdict(lastRound: DebateRoundRecord): Record<string, unknown> {
        const votes: Record<string, number> = {};
        for (const arg of lastRound.arguments) {
            for (const point of arg.keyPoints) {
                votes[point] = (votes[point] ?? 0) + 1;
            }
        }

        const sortedPoints = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        const topPoints = sortedPoints.slice(0, 5).map(([point]) => point);

        return {
            method: 'MAJORITY',
            consensusScore: lastRound.consensusScore,
            topConsensusPoints: topPoints,
            allVotes: votes,
            reasoning: `多数投票: ${topPoints.join('; ')}`,
        };
    }

    /**
     * Judge Agent 裁判（独立 Agent 裁决）
     */
    private async judgeAgentVerdict(
        rounds: DebateRoundRecord[],
        topic: string,
        participants: DebateParticipant[],
        agentProfiles: Map<string, Record<string, unknown>>,
        input: Record<string, unknown>,
        paramSnapshot: Record<string, unknown> | undefined,
    ): Promise<Record<string, unknown>> {
        const judgeSystemPrompt = [
            '你是一位公正的辩论裁判。请基于以下多轮辩论记录，综合各方论点，给出最终结论。',
            '',
            '输出格式 (JSON):',
            '{',
            '  "conclusion": "综合结论",',
            '  "confidence": 0-100,',
            '  "action": "BUY|SELL|HOLD|REDUCE|REVIEW_ONLY",',
            '  "keyFindings": ["要点1", "要点2"],',
            '  "dissent": "少数派观点摘要"',
            '}',
        ].join('\n');

        const debateTranscript = rounds.map((r) =>
            `--- 第 ${r.roundNumber} 轮 (共识度: ${r.consensusScore}) ---\n` +
            r.arguments.map((a) => `[${a.role}] ${a.response}`).join('\n\n'),
        ).join('\n\n');

        const judgeUserPrompt = [
            `辩论主题: ${topic}`,
            '',
            `参与者: ${participants.map((p) => `${p.role}(${p.agentCode})`).join(', ')}`,
            '',
            '辩论记录:',
            debateTranscript,
            '',
            `输入数据摘要: ${JSON.stringify(input).slice(0, 500)}`,
        ].join('\n');

        try {
            const modelConfig = await this.resolveModelConfig('default');
            const providerType = this.detectProviderType(modelConfig);
            const provider = this.aiProviderFactory.getProvider(providerType);

            const requestOptions: AIRequestOptions = {
                modelName: (modelConfig.modelId as string) ?? 'gemini-2.0-flash',
                apiKey: this.resolveApiKey(modelConfig),
                temperature: 0.3,
                maxTokens: 2000,
            };

            const response = await provider.generateResponse(
                judgeSystemPrompt,
                judgeUserPrompt,
                requestOptions,
            );

            try {
                const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                return { method: 'JUDGE_AGENT', ...JSON.parse(cleaned) };
            } catch {
                return { method: 'JUDGE_AGENT', conclusion: response, confidence: 50 };
            }
        } catch (error) {
            this.logger.error(`Judge Agent 裁决失败`, (error as Error).stack);
            return this.weightedVerdict(
                participants,
                rounds[rounds.length - 1],
            );
        }
    }

    // ────────────────── 工具方法 ──────────────────

    private parseParticipants(raw: unknown): DebateParticipant[] {
        if (!Array.isArray(raw)) return [];
        return raw
            .filter((p) => p && typeof p === 'object' && p.agentCode)
            .map((p) => ({
                agentCode: String(p.agentCode),
                role: String(p.role ?? p.agentCode),
                perspective: String(p.perspective ?? ''),
                weight: Number(p.weight ?? 1),
            }));
    }

    private extractTopicFromInput(input: Record<string, unknown>): string {
        if (typeof input.topic === 'string') return input.topic;
        if (typeof input.question === 'string') return input.question;
        return JSON.stringify(input).slice(0, 200);
    }

    private async loadAgentProfiles(
        participants: DebateParticipant[],
    ): Promise<Map<string, Record<string, unknown>>> {
        const profiles = new Map<string, Record<string, unknown>>();
        for (const p of participants) {
            const profile = await this.prisma.agentProfile.findFirst({
                where: { agentCode: p.agentCode, isActive: true },
            });
            if (profile) {
                profiles.set(p.agentCode, profile as unknown as Record<string, unknown>);
            }
        }
        return profiles;
    }

    private async resolveModelConfig(configKey: string): Promise<Record<string, unknown>> {
        const config = await this.prisma.aIModelConfig.findFirst({
            where: { configKey, isActive: true },
        });
        return (config as unknown as Record<string, unknown>) ?? {};
    }

    private detectProviderType(config: Record<string, unknown>): 'google' | 'openai' {
        const model = String(config.modelId ?? '');
        if (model.includes('gemini') || model.includes('palm')) return 'google';
        return 'openai';
    }

    private resolveApiKey(config: Record<string, unknown>): string {
        if (typeof config.apiKey === 'string' && config.apiKey) return config.apiKey;
        const envVar = config.apiKeyEnvVar as string;
        if (envVar) return process.env[envVar] ?? '';
        return process.env.DEFAULT_AI_API_KEY ?? '';
    }

    private buildDebateSystemPrompt(
        participant: DebateParticipant,
        topic: string,
        round: number,
        maxRounds: number,
    ): string {
        return [
            `你是 "${participant.role}"，正在参与一场多方辩论。`,
            `你的视角: ${participant.perspective || '中立分析'}`,
            '',
            `辩论主题: ${topic}`,
            `当前轮次: 第 ${round}/${maxRounds} 轮`,
            '',
            '要求:',
            '1. 基于你的角色视角，提供明确的论述',
            '2. 引用数据和逻辑支持你的观点',
            '3. 如果是后续轮次，回应前一轮的论点',
            '4. 保持专业和客观',
            '',
            '输出格式 (JSON):',
            '{',
            '  "argument": "你的论述",',
            '  "confidence": 0-100,',
            '  "keyPoints": ["要点1", "要点2"],',
            '  "rebuttal": "对前轮论点的回应(如适用)"',
            '}',
        ].join('\n');
    }

    private buildDebateUserPrompt(
        input: Record<string, unknown>,
        paramSnapshot: Record<string, unknown> | undefined,
        previousArguments: string[],
        round: number,
    ): string {
        const parts: string[] = [];
        parts.push('## 输入数据');
        parts.push(JSON.stringify(input, null, 2).slice(0, 2000));

        if (paramSnapshot) {
            parts.push('\n## 参数快照');
            parts.push(JSON.stringify(paramSnapshot, null, 2).slice(0, 1000));
        }

        if (round > 1 && previousArguments.length > 0) {
            parts.push('\n## 上一轮论点');
            parts.push(previousArguments.join('\n\n'));
        }

        return parts.join('\n');
    }

    private parseDebateResponse(raw: string): {
        text: string;
        confidence?: number;
        keyPoints: string[];
    } {
        try {
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                text: parsed.argument ?? raw,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
            };
        } catch {
            return { text: raw, keyPoints: [] };
        }
    }

    /**
     * 评估共识度 — 基于 keyPoints 的重叠率
     */
    private evaluateConsensus(
        arguments_: DebateRoundRecord['arguments'],
    ): number {
        if (arguments_.length < 2) return 1;

        const allKeyPoints = arguments_.map((a) => new Set(a.keyPoints.map((p) => p.toLowerCase())));
        let overlapCount = 0;
        let totalComparisons = 0;

        for (let i = 0; i < allKeyPoints.length; i++) {
            for (let j = i + 1; j < allKeyPoints.length; j++) {
                const setA = allKeyPoints[i];
                const setB = allKeyPoints[j];
                const union = new Set([...setA, ...setB]);
                const intersection = [...setA].filter((p) => setB.has(p)).length;

                if (union.size > 0) {
                    overlapCount += intersection / union.size;
                }
                totalComparisons++;
            }
        }

        return totalComparisons > 0 ? Math.round((overlapCount / totalComparisons) * 100) / 100 : 0;
    }
}
