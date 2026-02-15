import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 多路决策合成执行器
 *
 * 支持节点类型: decision-merge
 *
 * 功能: 从多个上游分支（Agent/规则/计算节点）收集决策建议，
 * 通过加权评分 + 置信度融合 + 证据链合并，输出统一决策。
 *
 * 配置:
 *   config.mergeStrategy: 'weighted-vote' | 'highest-confidence' | 'unanimous' (默认 weighted-vote)
 *   config.weights: Record<branchId, number> (可选，默认等权)
 *   config.minConfidence: number (最低置信度阈值, 默认 0.5)
 *   config.riskLevelPriority: string[] (风险等级排序, 默认 ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'])
 */
@Injectable()
export class DecisionMergeNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'DecisionMergeNodeExecutor';
    private readonly logger = new Logger(DecisionMergeNodeExecutor.name);

    private readonly DEFAULT_RISK_PRIORITY = ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'];

    supports(node: WorkflowNode): boolean {
        return node.type === 'decision-merge';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        // 提取分支数据 — DAG Scheduler 以 { branches: { nodeA: {...}, nodeB: {...} } } 格式传入
        const branches = (input.branches as Record<string, Record<string, unknown>>) ?? {};
        const branchKeys = Object.keys(branches);

        if (branchKeys.length < 2) {
            return {
                status: 'FAILED',
                output: { branches },
                message: `decision-merge 节点 ${node.name} 至少需要 2 路上游输入，当前 ${branchKeys.length}`,
            };
        }

        const mergeStrategy = (config.mergeStrategy as string) ?? 'weighted-vote';
        this.logger.log(`[${node.name}] decision-merge: ${branchKeys.length} 路, 策略=${mergeStrategy}`);

        switch (mergeStrategy) {
            case 'weighted-vote':
                return this.mergeByWeightedVote(node, config, branches, branchKeys);
            case 'highest-confidence':
                return this.mergeByHighestConfidence(node, config, branches, branchKeys);
            case 'unanimous':
                return this.mergeByUnanimous(node, config, branches, branchKeys);
            default:
                return this.mergeByWeightedVote(node, config, branches, branchKeys);
        }
    }

    // ────────────────── 加权投票 ──────────────────

    private mergeByWeightedVote(
        node: WorkflowNode,
        config: Record<string, unknown>,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        const weights = (config.weights as Record<string, number>) ?? {};
        const minConfidence = (config.minConfidence as number) ?? 0.5;

        // 收集每个分支的 action + confidence
        const votes: Array<{
            branchId: string;
            action: string;
            confidence: number;
            riskLevel: string;
            weight: number;
            evidence: unknown;
        }> = [];

        for (const key of branchKeys) {
            const output = branches[key];
            const action = (output.action as string) ?? 'HOLD';
            const confidence = (output.confidence as number) ?? 0;
            const riskLevel = (output.riskLevel as string) ?? 'MEDIUM';
            const weight = weights[key] ?? 1;
            const evidence = output.evidenceSummary ?? output.evidence ?? null;
            votes.push({ branchId: key, action, confidence, riskLevel, weight, evidence });
        }

        // 按 action 分组，加权求和
        const actionScores = new Map<string, number>();
        let totalWeight = 0;
        for (const vote of votes) {
            const score = vote.confidence * vote.weight;
            actionScores.set(vote.action, (actionScores.get(vote.action) ?? 0) + score);
            totalWeight += vote.weight;
        }

        // 选择得分最高的 action
        let bestAction = 'HOLD';
        let bestScore = -1;
        for (const [action, score] of actionScores) {
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }

        // 融合置信度 — 同 action 加权平均
        const supportingVotes = votes.filter((v) => v.action === bestAction);
        const supportWeight = supportingVotes.reduce((sum, v) => sum + v.weight, 0);
        const mergedConfidence = supportWeight > 0
            ? supportingVotes.reduce((sum, v) => sum + v.confidence * v.weight, 0) / supportWeight
            : 0;

        // 取最高风险等级
        const riskLevelPriority = (config.riskLevelPriority as string[]) ?? this.DEFAULT_RISK_PRIORITY;
        const mergedRiskLevel = this.getHighestRiskLevel(votes.map((v) => v.riskLevel), riskLevelPriority);

        // 合并证据链
        const evidenceBundle = votes
            .filter((v) => v.evidence)
            .map((v) => ({ source: v.branchId, evidence: v.evidence }));

        const isBelowThreshold = mergedConfidence < minConfidence;

        return {
            status: 'SUCCESS',
            output: {
                action: isBelowThreshold ? 'HOLD' : bestAction,
                confidence: mergedConfidence,
                riskLevel: mergedRiskLevel,
                evidenceBundle,
                voting: {
                    actionScores: Object.fromEntries(actionScores),
                    totalWeight,
                    supportingVoteCount: supportingVotes.length,
                    totalVoteCount: votes.length,
                },
                isBelowThreshold,
                minConfidence,
                _meta: {
                    executor: this.name,
                    mergeStrategy: 'weighted-vote',
                    branchCount: branchKeys.length,
                },
            },
        };
    }

    // ────────────────── 最高置信度 ──────────────────

    private mergeByHighestConfidence(
        node: WorkflowNode,
        config: Record<string, unknown>,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        const minConfidence = (config.minConfidence as number) ?? 0.5;
        let bestBranch = branchKeys[0];
        let bestConfidence = -1;

        for (const key of branchKeys) {
            const output = branches[key];
            const confidence = (output.confidence as number) ?? 0;
            if (confidence > bestConfidence) {
                bestConfidence = confidence;
                bestBranch = key;
            }
        }

        const bestOutput = branches[bestBranch];
        const action = (bestOutput.action as string) ?? 'HOLD';
        const riskLevel = (bestOutput.riskLevel as string) ?? 'MEDIUM';

        return {
            status: 'SUCCESS',
            output: {
                action: bestConfidence < minConfidence ? 'HOLD' : action,
                confidence: bestConfidence,
                riskLevel,
                selectedBranch: bestBranch,
                evidenceBundle: [{ source: bestBranch, evidence: bestOutput.evidenceSummary ?? null }],
                isBelowThreshold: bestConfidence < minConfidence,
                minConfidence,
                _meta: {
                    executor: this.name,
                    mergeStrategy: 'highest-confidence',
                    branchCount: branchKeys.length,
                },
            },
        };
    }

    // ────────────────── 一致通过 ──────────────────

    private mergeByUnanimous(
        node: WorkflowNode,
        config: Record<string, unknown>,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        const actions = branchKeys.map((key) => (branches[key].action as string) ?? 'HOLD');
        const uniqueActions = new Set(actions);

        if (uniqueActions.size === 1) {
            const unanimousAction = actions[0];
            const confidences = branchKeys.map((key) => (branches[key].confidence as number) ?? 0);
            const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

            const riskLevels = branchKeys.map((key) => (branches[key].riskLevel as string) ?? 'MEDIUM');
            const riskLevelPriority = (config.riskLevelPriority as string[]) ?? this.DEFAULT_RISK_PRIORITY;
            const mergedRiskLevel = this.getHighestRiskLevel(riskLevels, riskLevelPriority);

            return {
                status: 'SUCCESS',
                output: {
                    action: unanimousAction,
                    confidence: avgConfidence,
                    riskLevel: mergedRiskLevel,
                    isUnanimous: true,
                    evidenceBundle: branchKeys.map((key) => ({
                        source: key,
                        evidence: branches[key].evidenceSummary ?? null,
                    })),
                    _meta: {
                        executor: this.name,
                        mergeStrategy: 'unanimous',
                        branchCount: branchKeys.length,
                    },
                },
            };
        }

        // 不一致 → 降级为 HOLD
        return {
            status: 'SUCCESS',
            output: {
                action: 'HOLD',
                confidence: 0,
                riskLevel: 'HIGH',
                isUnanimous: false,
                disagreement: {
                    actions: Array.from(uniqueActions),
                    votesByAction: this.groupBy(branchKeys, (key) => (branches[key].action as string) ?? 'HOLD'),
                },
                _meta: {
                    executor: this.name,
                    mergeStrategy: 'unanimous',
                    reason: '各方意见不一致，降级为 HOLD',
                },
            },
        };
    }

    // ────────────────── 工具方法 ──────────────────

    private getHighestRiskLevel(levels: string[], priority: string[]): string {
        for (const level of priority) {
            if (levels.includes(level)) return level;
        }
        return levels[0] ?? 'MEDIUM';
    }

    private groupBy(keys: string[], classifier: (key: string) => string): Record<string, string[]> {
        const groups: Record<string, string[]> = {};
        for (const key of keys) {
            const group = classifier(key);
            if (!groups[group]) groups[group] = [];
            groups[group].push(key);
        }
        return groups;
    }
}
