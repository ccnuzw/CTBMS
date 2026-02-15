import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 并行控制执行器
 *
 * 支持节点类型: parallel-split, join
 *
 * parallel-split 配置:
 *   config.branchIds: string[] (并行子分支 ID 列表)
 *   config.splitStrategy: 'clone' | 'partition' (可选)
 *
 * join 配置:
 *   config.joinPolicy: 'ALL_REQUIRED' | 'QUORUM' | 'FIRST_SUCCESS' | 'WEIGHTED_MERGE'
 *   config.quorumBranches: number (仅 QUORUM 模式)
 *   config.weights: Record<string, number> (仅 WEIGHTED_MERGE 模式)
 *   config.timeoutMs: number (等待上游超时, 可选)
 */
@Injectable()
export class ParallelControlNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ParallelControlNodeExecutor';
    private readonly logger = new Logger(ParallelControlNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'parallel-split' || node.type === 'join';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;

        if (node.type === 'parallel-split') {
            return this.executeSplit(node, input);
        }

        return this.executeJoin(node, input);
    }

    // ────────────────── parallel-split ──────────────────

    private executeSplit(
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): NodeExecutionResult {
        const config = node.config as Record<string, unknown>;
        const branchIds = (config.branchIds as string[]) ?? [];
        const splitStrategy = (config.splitStrategy as string) ?? 'clone';

        this.logger.log(`[${node.name}] parallel-split: ${branchIds.length} 分支, 策略=${splitStrategy}`);

        if (branchIds.length < 2) {
            return {
                status: 'FAILED',
                output: {},
                message: `parallel-split 节点 ${node.name} 至少需要 2 个分支`,
            };
        }

        // clone: 输入完整传递到每个分支
        // partition: 按分支ID从input中取对应key
        const branchOutputs: Record<string, Record<string, unknown>> = {};
        for (const branchId of branchIds) {
            if (splitStrategy === 'partition') {
                branchOutputs[branchId] = (input[branchId] as Record<string, unknown>) ?? {};
            } else {
                branchOutputs[branchId] = { ...input };
            }
        }

        return {
            status: 'SUCCESS',
            output: {
                splitNodeId: node.id,
                splitStrategy,
                branchIds,
                branchOutputs,
                _meta: {
                    executor: this.name,
                    branchCount: branchIds.length,
                },
            },
        };
    }

    // ────────────────── join ──────────────────

    private executeJoin(
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): NodeExecutionResult {
        const config = node.config as Record<string, unknown>;
        const joinPolicy = (config.joinPolicy as string) ?? 'ALL_REQUIRED';

        // DAG Scheduler 会自动把多个上游输出组装为 { branches: { nodeA: {...}, nodeB: {...} } }
        const branches = (input.branches as Record<string, Record<string, unknown>>) ?? {};
        const branchKeys = Object.keys(branches);

        this.logger.log(`[${node.name}] join: 策略=${joinPolicy}, 上游=${branchKeys.length} 分支`);

        if (branchKeys.length === 0) {
            // 单一上游直接透传
            return {
                status: 'SUCCESS',
                output: { ...input, _meta: { executor: this.name, joinPolicy } },
            };
        }

        switch (joinPolicy) {
            case 'ALL_REQUIRED':
                return this.joinAllRequired(node, branches, branchKeys);
            case 'QUORUM':
                return this.joinQuorum(node, config, branches, branchKeys);
            case 'FIRST_SUCCESS':
                return this.joinFirstSuccess(node, branches, branchKeys);
            case 'WEIGHTED_MERGE':
                return this.joinWeightedMerge(node, config, branches, branchKeys);
            default:
                return this.joinAllRequired(node, branches, branchKeys);
        }
    }

    /**
     * ALL_REQUIRED: 合并所有分支输出
     */
    private joinAllRequired(
        node: WorkflowNode,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        // 检查是否有失败的分支
        const failedBranches = branchKeys.filter((key) => {
            const output = branches[key];
            return output._meta && (output._meta as Record<string, unknown>).lastError;
        });

        if (failedBranches.length > 0) {
            return {
                status: 'FAILED',
                output: { branches, failedBranches },
                message: `join(ALL_REQUIRED) - ${failedBranches.length} 个分支失败: ${failedBranches.join(', ')}`,
            };
        }

        return {
            status: 'SUCCESS',
            output: {
                branches,
                mergedKeys: branchKeys,
                _meta: { executor: this.name, joinPolicy: 'ALL_REQUIRED', branchCount: branchKeys.length },
            },
        };
    }

    /**
     * QUORUM: 至少 N 个分支成功即可
     */
    private joinQuorum(
        node: WorkflowNode,
        config: Record<string, unknown>,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        const quorumBranches = (config.quorumBranches as number) ?? 2;
        const successBranches = branchKeys.filter((key) => {
            const output = branches[key];
            return !output._meta || !(output._meta as Record<string, unknown>).lastError;
        });

        if (successBranches.length >= quorumBranches) {
            const quorumOutputs: Record<string, Record<string, unknown>> = {};
            for (const key of successBranches) {
                quorumOutputs[key] = branches[key];
            }
            return {
                status: 'SUCCESS',
                output: {
                    branches: quorumOutputs,
                    mergedKeys: successBranches,
                    _meta: {
                        executor: this.name,
                        joinPolicy: 'QUORUM',
                        quorumRequired: quorumBranches,
                        successCount: successBranches.length,
                    },
                },
            };
        }

        return {
            status: 'FAILED',
            output: { branches, successBranches },
            message: `join(QUORUM) - 成功 ${successBranches.length}/${branchKeys.length}，未达到 quorum=${quorumBranches}`,
        };
    }

    /**
     * FIRST_SUCCESS: 取第一个成功分支的输出
     */
    private joinFirstSuccess(
        node: WorkflowNode,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        for (const key of branchKeys) {
            const output = branches[key];
            const hasFailed = output._meta && (output._meta as Record<string, unknown>).lastError;
            if (!hasFailed) {
                return {
                    status: 'SUCCESS',
                    output: {
                        ...output,
                        _meta: {
                            executor: this.name,
                            joinPolicy: 'FIRST_SUCCESS',
                            selectedBranch: key,
                        },
                    },
                };
            }
        }

        return {
            status: 'FAILED',
            output: { branches },
            message: `join(FIRST_SUCCESS) - 所有 ${branchKeys.length} 个分支均失败`,
        };
    }

    /**
     * WEIGHTED_MERGE: 加权合并数值字段
     */
    private joinWeightedMerge(
        node: WorkflowNode,
        config: Record<string, unknown>,
        branches: Record<string, Record<string, unknown>>,
        branchKeys: string[],
    ): NodeExecutionResult {
        const weights = (config.weights as Record<string, number>) ?? {};
        const mergedValues: Record<string, number> = {};
        let totalWeight = 0;

        for (const key of branchKeys) {
            const weight = weights[key] ?? 1;
            totalWeight += weight;

            const output = branches[key];
            for (const [field, value] of Object.entries(output)) {
                if (field === '_meta') continue;
                if (typeof value === 'number') {
                    mergedValues[field] = (mergedValues[field] ?? 0) + value * weight;
                }
            }
        }

        // 归一化
        if (totalWeight > 0) {
            for (const field of Object.keys(mergedValues)) {
                mergedValues[field] = mergedValues[field] / totalWeight;
            }
        }

        return {
            status: 'SUCCESS',
            output: {
                ...mergedValues,
                branches,
                _meta: {
                    executor: this.name,
                    joinPolicy: 'WEIGHTED_MERGE',
                    weights,
                    totalWeight,
                    branchCount: branchKeys.length,
                },
            },
        };
    }
}
