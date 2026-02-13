import { Injectable, Logger } from '@nestjs/common';
import type { WorkflowDsl, WorkflowNode, WorkflowEdge, WorkflowRunPolicy } from '@packages/types';
import { NodeExecutorRegistry } from './node-executor.registry';
// NodeExecutionContext, NodeExecutionResult removed as they are unused imports

/**
 * DAG 节点执行回调
 *
 * 调用方 (WorkflowExecutionService) 通过此接口提供:
 * - 节点执行生命周期 (record, persist, retry)
 * - 取消检查
 * - 运行时策略解析
 */
export interface DagNodeCallbacks {
    /** 检查是否已取消 */
    throwIfCanceled: () => Promise<void>;
    /** 记录运行时事件 */
    recordEvent: (params: {
        eventType: string;
        level: 'INFO' | 'WARN' | 'ERROR';
        message: string;
        detail: Record<string, unknown>;
        nodeExecutionId?: string;
    }) => Promise<void>;
    /** 持久化节点执行记录 */
    persistNodeExecution: (params: {
        nodeId: string;
        nodeType: string;
        status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
        startedAt: Date;
        completedAt: Date;
        durationMs: number;
        errorMessage: string | null;
        failureCategory: string | null;
        failureCode: string | null;
        inputSnapshot: Record<string, unknown>;
        outputSnapshot: Record<string, unknown>;
    }) => Promise<{ id: string }>;
    /** 解析运行时策略 */
    resolveRuntimePolicy: (node: WorkflowNode, runPolicy?: WorkflowRunPolicy) => {
        timeoutMs: number;
        retryCount: number;
        retryBackoffMs: number;
        onError: string;
    };
    /** 带超时执行 */
    executeWithTimeout: <T>(
        task: () => Promise<T>,
        timeoutMs: number,
        timeoutMessage: string,
    ) => Promise<T>;
    /** 延时 */
    sleep: (ms: number) => Promise<void>;
    /** 错误分类 */
    classifyFailure: (error: unknown) => {
        message: string;
        failureCategory: string;
        failureCode: string;
    };
}

/**
 * DAG 执行层级
 */
interface DagLayer {
    /** 层级编号 (0 为根) */
    depth: number;
    /** 该层可并行执行的节点 */
    nodes: WorkflowNode[];
}

/**
 * DAG 执行结果
 */
export interface DagExecutionResult {
    /** 所有节点输出 */
    outputsByNode: Map<string, Record<string, unknown>>;
    /** 软失败计数 */
    softFailureCount: number;
    /** 已执行节点数 */
    executedNodeCount: number;
}

/**
 * DAG 并行执行调度器
 *
 * 核心功能:
 * 1. Kahn 算法拓扑分层 — 将 DAG 分为多个执行层级
 * 2. 层级并行执行 — 同层节点通过 Promise.allSettled 并行
 * 3. 汇聚等待 — join 节点自动等待所有上游层完成
 * 4. 条件分支 — 基于 condition-edge 表达式评估是否执行
 * 5. 错误策略 — FAIL_FAST / CONTINUE / ROUTE_TO_ERROR
 * 6. 取消检查 — 每层执行前检查
 * 7. 并发限制 — 通过 maxConcurrency 控制同层并行度
 */
@Injectable()
export class DagScheduler {
    private readonly logger = new Logger(DagScheduler.name);

    constructor(private readonly nodeExecutorRegistry: NodeExecutorRegistry) { }

    /**
     * 执行 DAG 流程
     */
    async execute(params: {
        executionId: string;
        triggerUserId: string;
        dsl: WorkflowDsl;
        paramSnapshot?: Record<string, unknown>;
        callbacks: DagNodeCallbacks;
        maxConcurrency?: number;
    }): Promise<DagExecutionResult> {
        const { executionId, triggerUserId, dsl, paramSnapshot, callbacks, maxConcurrency = 5 } = params;

        // 1. 拓扑分层
        const layers = this.buildLayers(dsl);
        this.logger.log(`DAG 拓扑分层完成: ${layers.length} 层, 共 ${dsl.nodes.length} 节点`);

        await callbacks.recordEvent({
            eventType: 'DAG_LAYERS_RESOLVED',
            level: 'INFO',
            message: `DAG 拓扑分层: ${layers.length} 层`,
            detail: {
                layerCount: layers.length,
                layers: layers.map((l) => ({
                    depth: l.depth,
                    nodeIds: l.nodes.map((n) => n.id),
                })),
            },
        });

        // 构建边映射
        const incomingEdgeMap = this.buildIncomingEdgeMap(dsl.edges);
        const outputsByNode = new Map<string, Record<string, unknown>>();
        const skipReasonByNode = new Map<string, string>();
        let softFailureCount = 0;

        // 2. 按层级顺序执行
        for (const layer of layers) {
            await callbacks.throwIfCanceled();

            const activeNodes = layer.nodes.filter((node) => {
                // 检查是否被标记为跳过
                const skipReason = skipReasonByNode.get(node.id);
                if (skipReason) return false;

                // 检查条件边
                if (!this.evaluateIncomingConditions(node.id, incomingEdgeMap, outputsByNode)) {
                    skipReasonByNode.set(node.id, `条件边未满足`);
                    return false;
                }

                return true;
            });

            // 处理跳过的节点 (记录 SKIPPED)
            for (const node of layer.nodes) {
                const skipReason = skipReasonByNode.get(node.id);
                if (skipReason) {
                    const now = new Date();
                    const skippedOutput = {
                        skipped: true,
                        skipType: 'DAG_SKIP',
                        skipReason,
                        nodeId: node.id,
                        nodeType: node.type,
                    };
                    await callbacks.persistNodeExecution({
                        nodeId: node.id,
                        nodeType: node.type,
                        status: 'SKIPPED',
                        startedAt: now,
                        completedAt: now,
                        durationMs: 0,
                        errorMessage: skipReason,
                        failureCategory: null,
                        failureCode: null,
                        inputSnapshot: {},
                        outputSnapshot: skippedOutput,
                    });
                    outputsByNode.set(node.id, skippedOutput);
                }
            }

            if (activeNodes.length === 0) continue;

            // 3. 同层并行执行 (受并发限制)
            const results = await this.executeLayerWithConcurrency(
                activeNodes,
                maxConcurrency,
                executionId,
                triggerUserId,
                paramSnapshot,
                outputsByNode,
                incomingEdgeMap,
                callbacks,
                dsl.runPolicy,
            );

            // 4. 处理结果
            for (const result of results) {
                outputsByNode.set(result.nodeId, result.output);

                if (result.status === 'FAILED') {
                    softFailureCount += 1;

                    if (result.onError === 'FAIL_FAST') {
                        throw new Error(result.errorMessage ?? `DAG 节点 ${result.nodeId} 执行失败 (FAIL_FAST)`);
                    }

                    if (result.onError === 'ROUTE_TO_ERROR') {
                        // 标记后续非错误分支为跳过
                        this.markDownstreamSkipped(
                            result.nodeId,
                            dsl.edges,
                            skipReasonByNode,
                            `上游节点 ${result.nodeId} 失败，ROUTE_TO_ERROR`,
                        );
                    }
                }
            }
        }

        return {
            outputsByNode,
            softFailureCount,
            executedNodeCount: outputsByNode.size,
        };
    }

    // ────────────────── 拓扑分层 ──────────────────

    /**
     * Kahn 算法拓扑分层
     *
     * 将 DAG 按依赖关系分为多层，同层节点可并行执行
     */
    buildLayers(dsl: WorkflowDsl): DagLayer[] {
        const nodeMap = new Map(dsl.nodes.map((n) => [n.id, n]));
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>();

        // 初始化入度和邻接表
        for (const node of dsl.nodes) {
            inDegree.set(node.id, 0);
            adjacency.set(node.id, []);
        }

        for (const edge of dsl.edges) {
            const current = inDegree.get(edge.to) ?? 0;
            inDegree.set(edge.to, current + 1);
            const adj = adjacency.get(edge.from) ?? [];
            adj.push(edge.to);
            adjacency.set(edge.from, adj);
        }

        // BFS 分层
        const layers: DagLayer[] = [];
        let currentLevel: string[] = [];

        for (const [nodeId, degree] of inDegree) {
            if (degree === 0) {
                currentLevel.push(nodeId);
            }
        }

        let depth = 0;
        while (currentLevel.length > 0) {
            const layerNodes: WorkflowNode[] = [];
            const nextLevel: string[] = [];

            for (const nodeId of currentLevel) {
                const node = nodeMap.get(nodeId);
                if (node) layerNodes.push(node);

                const neighbors = adjacency.get(nodeId) ?? [];
                for (const neighbor of neighbors) {
                    const deg = (inDegree.get(neighbor) ?? 1) - 1;
                    inDegree.set(neighbor, deg);
                    if (deg === 0) {
                        nextLevel.push(neighbor);
                    }
                }
            }

            if (layerNodes.length > 0) {
                layers.push({ depth, nodes: layerNodes });
            }

            currentLevel = nextLevel;
            depth += 1;
        }

        // 检测环
        const processedCount = layers.reduce((sum, l) => sum + l.nodes.length, 0);
        if (processedCount < dsl.nodes.length) {
            this.logger.error(`DAG 检测到环! 已处理 ${processedCount}/${dsl.nodes.length} 节点`);
            throw new Error('DAG 中存在循环依赖，无法执行');
        }

        return layers;
    }

    // ────────────────── 层级并行执行 ──────────────────

    /**
     * 带并发限制的层级并行执行
     */
    private async executeLayerWithConcurrency(
        nodes: WorkflowNode[],
        maxConcurrency: number,
        executionId: string,
        triggerUserId: string,
        paramSnapshot: Record<string, unknown> | undefined,
        outputsByNode: Map<string, Record<string, unknown>>,
        incomingEdgeMap: Map<string, WorkflowEdge[]>,
        callbacks: DagNodeCallbacks,
        runPolicy?: WorkflowRunPolicy,
    ): Promise<Array<{
        nodeId: string;
        status: 'SUCCESS' | 'FAILED';
        output: Record<string, unknown>;
        errorMessage: string | null;
        onError: string;
    }>> {
        const results: Array<{
            nodeId: string;
            status: 'SUCCESS' | 'FAILED';
            output: Record<string, unknown>;
            errorMessage: string | null;
            onError: string;
        }> = [];

        // 分批执行（并发限制）
        for (let i = 0; i < nodes.length; i += maxConcurrency) {
            const batch = nodes.slice(i, i + maxConcurrency);
            const batchPromises = batch.map((node) =>
                this.executeNode(
                    node,
                    executionId,
                    triggerUserId,
                    paramSnapshot,
                    outputsByNode,
                    incomingEdgeMap,
                    callbacks,
                    runPolicy,
                ),
            );

            const batchResults = await Promise.allSettled(batchPromises);

            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                const node = batch[j];
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({
                        nodeId: node.id,
                        status: 'FAILED',
                        output: { _meta: { error: String(result.reason) } },
                        errorMessage: String(result.reason),
                        onError: 'FAIL_FAST',
                    });
                }
            }
        }

        return results;
    }

    /**
     * 执行单个节点（含重试）
     */
    private async executeNode(
        node: WorkflowNode,
        executionId: string,
        triggerUserId: string,
        paramSnapshot: Record<string, unknown> | undefined,
        outputsByNode: Map<string, Record<string, unknown>>,
        incomingEdgeMap: Map<string, WorkflowEdge[]>,
        callbacks: DagNodeCallbacks,
        runPolicy?: WorkflowRunPolicy,
    ): Promise<{
        nodeId: string;
        status: 'SUCCESS' | 'FAILED';
        output: Record<string, unknown>;
        errorMessage: string | null;
        onError: string;
    }> {
        const startedAt = new Date();
        const inputSnapshot = this.buildNodeInput(node.id, incomingEdgeMap, outputsByNode);
        const nodeExecutor = this.nodeExecutorRegistry.resolve(node);
        const runtimePolicy = callbacks.resolveRuntimePolicy(node, runPolicy);

        let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let errorMessage: string | null = null;
        let outputSnapshot: Record<string, unknown> = {};
        let attempts = 0;
        let failureCategory: string | null = null;
        let failureCode: string | null = null;

        await callbacks.recordEvent({
            eventType: 'NODE_STARTED',
            level: 'INFO',
            message: `[DAG] 节点 ${node.name} 开始执行`,
            detail: {
                nodeId: node.id,
                nodeType: node.type,
                retryCount: runtimePolicy.retryCount,
                timeoutMs: runtimePolicy.timeoutMs,
            },
        });

        // 重试循环
        for (let attempt = 0; attempt <= runtimePolicy.retryCount; attempt += 1) {
            attempts = attempt + 1;
            try {
                const result = await callbacks.executeWithTimeout(
                    () =>
                        nodeExecutor.execute({
                            executionId,
                            triggerUserId,
                            node,
                            input: inputSnapshot,
                            paramSnapshot,
                        }),
                    runtimePolicy.timeoutMs,
                    `[DAG] 节点 ${node.name} 执行超时（${runtimePolicy.timeoutMs}ms）`,
                );

                status = (result.status as 'SUCCESS' | 'FAILED') ?? 'SUCCESS';
                outputSnapshot = result.output ?? {};

                if (status === 'FAILED') {
                    errorMessage = result.message ?? `节点 ${node.name} 执行失败`;
                    throw new Error(errorMessage);
                }

                outputSnapshot = {
                    ...outputSnapshot,
                    _meta: {
                        executor: nodeExecutor.name,
                        attempts,
                        runtimePolicy,
                        dagExecution: true,
                    },
                };
                errorMessage = null;
                break;
            } catch (error) {
                status = 'FAILED';
                const classified = callbacks.classifyFailure(error);
                errorMessage = classified.message;
                failureCategory = classified.failureCategory;
                failureCode = classified.failureCode;
                outputSnapshot = {
                    ...outputSnapshot,
                    _meta: {
                        executor: nodeExecutor.name,
                        attempts,
                        runtimePolicy,
                        dagExecution: true,
                        lastError: errorMessage,
                        failureCategory,
                        failureCode,
                    },
                };

                if (attempt < runtimePolicy.retryCount) {
                    await callbacks.recordEvent({
                        eventType: 'NODE_RETRY',
                        level: 'WARN',
                        message: `[DAG] 节点 ${node.name} 将进行第 ${attempt + 2} 次重试`,
                        detail: {
                            nodeId: node.id,
                            nodeType: node.type,
                            attempt: attempts,
                            retryBackoffMs: runtimePolicy.retryBackoffMs,
                            errorMessage,
                        },
                    });
                    await callbacks.sleep(runtimePolicy.retryBackoffMs);
                    continue;
                }
            }
        }

        // 持久化
        const completedAt = new Date();
        const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

        const createdNodeExecution = await callbacks.persistNodeExecution({
            nodeId: node.id,
            nodeType: node.type,
            status,
            startedAt,
            completedAt,
            durationMs,
            errorMessage,
            failureCategory: status === 'FAILED' ? failureCategory : null,
            failureCode: status === 'FAILED' ? failureCode : null,
            inputSnapshot,
            outputSnapshot,
        });

        await callbacks.recordEvent({
            nodeExecutionId: createdNodeExecution.id,
            eventType: status === 'SUCCESS' ? 'NODE_SUCCEEDED' : 'NODE_FAILED',
            level: status === 'SUCCESS' ? 'INFO' : 'ERROR',
            message: status === 'SUCCESS'
                ? `[DAG] 节点 ${node.name} 执行成功`
                : `[DAG] 节点 ${node.name} 执行失败`,
            detail: {
                nodeId: node.id,
                nodeType: node.type,
                attempts,
                durationMs,
                errorMessage,
                failureCategory,
                failureCode,
            },
        });

        return {
            nodeId: node.id,
            status,
            output: outputSnapshot,
            errorMessage,
            onError: runtimePolicy.onError,
        };
    }

    // ────────────────── 工具方法 ──────────────────

    /**
     * 构建入边映射 <nodeId, incomingEdges[]>
     */
    private buildIncomingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
        const map = new Map<string, WorkflowEdge[]>();
        for (const edge of edges) {
            const existing = map.get(edge.to) ?? [];
            existing.push(edge);
            map.set(edge.to, existing);
        }
        return map;
    }

    /**
     * 构建节点输入 — 合并所有上游输出
     */
    private buildNodeInput(
        nodeId: string,
        incomingEdgeMap: Map<string, WorkflowEdge[]>,
        outputsByNode: Map<string, Record<string, unknown>>,
    ): Record<string, unknown> {
        const incomingEdges = incomingEdgeMap.get(nodeId) ?? [];
        if (incomingEdges.length === 0) return {};

        if (incomingEdges.length === 1) {
            return outputsByNode.get(incomingEdges[0].from) ?? {};
        }

        // 多上游 → 按来源节点分组
        const branchOutputs: Record<string, unknown> = {};
        for (const edge of incomingEdges) {
            branchOutputs[edge.from] = outputsByNode.get(edge.from) ?? {};
        }
        return { branches: branchOutputs };
    }

    /**
     * 评估入边条件 — 判断是否所有必要上游已完成
     */
    private evaluateIncomingConditions(
        nodeId: string,
        incomingEdgeMap: Map<string, WorkflowEdge[]>,
        outputsByNode: Map<string, Record<string, unknown>>,
    ): boolean {
        const incomingEdges = incomingEdgeMap.get(nodeId) ?? [];
        if (incomingEdges.length === 0) return true;

        // 所有上游必须已有输出
        for (const edge of incomingEdges) {
            if (!outputsByNode.has(edge.from)) return false;

            // condition-edge: 评估条件表达式
            if (edge.edgeType === 'condition-edge' && edge.condition) {
                const sourceOutput = outputsByNode.get(edge.from) ?? {};
                if (!this.evaluateCondition(edge.condition, sourceOutput)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * 简单条件评估
     *
     * 支持格式:
     * - { field: "status", operator: "eq", value: "HIGH" }
     * - { field: "score", operator: "gte", value: 60 }
     * - boolean (直接使用)
     */
    private evaluateCondition(
        condition: unknown,
        sourceOutput: Record<string, unknown>,
    ): boolean {
        if (typeof condition === 'boolean') return condition;
        if (!condition || typeof condition !== 'object') return true;

        const cond = condition as Record<string, unknown>;
        const field = cond.field as string;
        const operator = cond.operator as string;
        const expected = cond.value;

        if (!field || !operator) return true;

        const actual = sourceOutput[field];

        switch (operator) {
            case 'eq':
                return actual === expected;
            case 'neq':
                return actual !== expected;
            case 'gt':
                return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
            case 'gte':
                return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
            case 'lt':
                return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
            case 'lte':
                return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
            case 'in':
                return Array.isArray(expected) && expected.includes(actual);
            case 'not_in':
                return Array.isArray(expected) && !expected.includes(actual);
            case 'exists':
                return actual !== undefined && actual !== null;
            case 'not_exists':
                return actual === undefined || actual === null;
            default:
                return true;
        }
    }

    /**
     * 标记下游非错误分支为跳过
     */
    private markDownstreamSkipped(
        failedNodeId: string,
        edges: WorkflowEdge[],
        skipReasonByNode: Map<string, string>,
        reason: string,
    ): void {
        const outgoingEdges = edges.filter((e) => e.from === failedNodeId);
        for (const edge of outgoingEdges) {
            if (edge.edgeType === 'error-edge') continue;
            if (skipReasonByNode.has(edge.to)) continue;

            skipReasonByNode.set(edge.to, reason);
            // 递归标记
            this.markDownstreamSkipped(edge.to, edges, skipReasonByNode, reason);
        }
    }
}
