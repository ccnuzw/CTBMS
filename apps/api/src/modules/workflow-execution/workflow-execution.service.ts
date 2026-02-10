import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    TriggerWorkflowExecutionDto,
    WorkflowDsl,
    WorkflowRunPolicy,
    WorkflowEdge,
    WorkflowDslSchema,
    WorkflowNode,
    WorkflowNodeOnErrorPolicyEnum,
    WorkflowNodeRuntimePolicy,
    WorkflowNodeRuntimePolicySchema,
    WorkflowExecutionQueryDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { NodeExecutorRegistry } from './engine/node-executor.registry';

@Injectable()
export class WorkflowExecutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly nodeExecutorRegistry: NodeExecutorRegistry,
    ) { }

    async trigger(
        ownerUserId: string,
        dto: TriggerWorkflowExecutionDto,
        options?: { sourceExecutionId?: string },
    ) {
        const definition = await this.prisma.workflowDefinition.findFirst({
            where: {
                id: dto.workflowDefinitionId,
                OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
        });

        if (!definition) {
            throw new NotFoundException('流程不存在或无权限执行');
        }

        const version = dto.workflowVersionId
            ? await this.prisma.workflowVersion.findFirst({
                where: {
                    id: dto.workflowVersionId,
                    workflowDefinitionId: definition.id,
                },
            })
            : await this.prisma.workflowVersion.findFirst({
                where: {
                    workflowDefinitionId: definition.id,
                    status: 'PUBLISHED',
                },
                orderBy: { createdAt: 'desc' },
            });

        if (!version) {
            throw new BadRequestException('未找到可执行版本，请先发布至少一个版本');
        }

        const parsedDsl = WorkflowDslSchema.safeParse(version.dslSnapshot);
        if (!parsedDsl.success) {
            throw new BadRequestException({
                message: '流程 DSL 快照解析失败',
                issues: parsedDsl.error.issues,
            });
        }

        const execution = await this.prisma.workflowExecution.create({
            data: {
                workflowVersionId: version.id,
                sourceExecutionId: options?.sourceExecutionId,
                triggerType: dto.triggerType,
                triggerUserId: ownerUserId,
                status: 'RUNNING',
                startedAt: new Date(),
                paramSnapshot: dto.paramSnapshot ? this.toJsonValue(dto.paramSnapshot) : undefined,
            },
        });

        const sortedNodes = this.sortNodesByEdges(parsedDsl.data);
        const incomingNodeMap = this.buildIncomingNodeMap(parsedDsl.data.edges);
        const outgoingEdgeMap = this.buildOutgoingEdgeMap(parsedDsl.data.edges);
        const outputsByNode = new Map<string, Record<string, unknown>>();
        const skipReasonByNode = new Map<string, string>();
        let softFailureCount = 0;

        try {
            for (const node of sortedNodes) {
                const existingSkipReason = skipReasonByNode.get(node.id);
                if (existingSkipReason) {
                    const now = new Date();
                    const skippedOutput = {
                        skipped: true,
                        skipType: 'ROUTE_TO_ERROR',
                        skipReason: existingSkipReason,
                        nodeId: node.id,
                        nodeType: node.type,
                        _meta: {
                            skipType: 'ROUTE_TO_ERROR',
                        },
                    };
                    await this.prisma.nodeExecution.create({
                        data: {
                            workflowExecutionId: execution.id,
                            nodeId: node.id,
                            nodeType: node.type,
                            status: 'SKIPPED',
                            startedAt: now,
                            completedAt: now,
                            durationMs: 0,
                            errorMessage: existingSkipReason,
                            inputSnapshot: this.toJsonValue({}),
                            outputSnapshot: this.toJsonValue(skippedOutput),
                        },
                    });
                    outputsByNode.set(node.id, skippedOutput);
                    continue;
                }

                const startedAt = new Date();
                const inputSnapshot = this.buildNodeInput(node.id, incomingNodeMap, outputsByNode);
                const nodeExecutor = this.nodeExecutorRegistry.resolve(node);
                const runtimePolicy = this.resolveRuntimePolicy(node, parsedDsl.data.runPolicy);

                let status: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SUCCESS';
                let errorMessage: string | null = null;
                let outputSnapshot: Record<string, unknown> = {};
                let attempts = 0;

                for (let attempt = 0; attempt <= runtimePolicy.retryCount; attempt += 1) {
                    attempts = attempt + 1;
                    try {
                        const result = await this.executeWithTimeout(
                            () => nodeExecutor.execute({
                                executionId: execution.id,
                                triggerUserId: ownerUserId,
                                node,
                                input: inputSnapshot,
                                paramSnapshot: dto.paramSnapshot,
                            }),
                            runtimePolicy.timeoutMs,
                            `节点 ${node.name} 执行超时（${runtimePolicy.timeoutMs}ms）`,
                        );

                        status = result.status ?? 'SUCCESS';
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
                            },
                        };
                        errorMessage = null;
                        break;
                    } catch (error) {
                        status = 'FAILED';
                        errorMessage = error instanceof Error ? error.message : '节点执行失败';
                        outputSnapshot = {
                            ...outputSnapshot,
                            _meta: {
                                executor: nodeExecutor.name,
                                attempts,
                                runtimePolicy,
                                lastError: errorMessage,
                            },
                        };

                        if (attempt < runtimePolicy.retryCount) {
                            await this.sleep(runtimePolicy.retryBackoffMs);
                            continue;
                        }
                    }
                }

                if (status === 'FAILED' && runtimePolicy.onError === 'ROUTE_TO_ERROR') {
                    outputSnapshot = {
                        ...outputSnapshot,
                        _meta: {
                            ...this.readMeta(outputSnapshot),
                            onErrorRouting: 'ROUTE_TO_ERROR',
                        },
                    };
                }

                const completedAt = new Date();
                const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

                await this.prisma.nodeExecution.create({
                    data: {
                        workflowExecutionId: execution.id,
                        nodeId: node.id,
                        nodeType: node.type,
                        status,
                        startedAt,
                        completedAt,
                        durationMs,
                        errorMessage,
                        inputSnapshot: this.toJsonValue(inputSnapshot),
                        outputSnapshot: this.toJsonValue(outputSnapshot),
                    },
                });

                outputsByNode.set(node.id, outputSnapshot);

                if (status === 'FAILED') {
                    if (runtimePolicy.onError === 'FAIL_FAST') {
                        throw new Error(errorMessage ?? `节点 ${node.id} 执行失败`);
                    }

                    softFailureCount += 1;
                    if (runtimePolicy.onError === 'ROUTE_TO_ERROR') {
                        this.markNonErrorBranchSkipped(
                            node.id,
                            outgoingEdgeMap,
                            skipReasonByNode,
                            `节点 ${node.id} 执行失败，按 ROUTE_TO_ERROR 跳过非错误分支`,
                        );
                    }
                }
            }

            const latestNode = sortedNodes.at(-1);
            const completed = await this.prisma.workflowExecution.update({
                where: { id: execution.id },
                data: {
                    status: 'SUCCESS',
                    completedAt: new Date(),
                    outputSnapshot: this.toJsonValue({
                        nodeCount: sortedNodes.length,
                        latestNodeId: latestNode?.id ?? null,
                        latestNodeType: latestNode?.type ?? null,
                        softFailureCount,
                    }),
                },
                include: {
                    nodeExecutions: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });

            return completed;
        } catch (error) {
            await this.prisma.workflowExecution.update({
                where: { id: execution.id },
                data: {
                    status: 'FAILED',
                    completedAt: new Date(),
                    errorMessage: error instanceof Error ? error.message : '执行失败',
                },
            });
            throw error;
        }
    }

    async findAll(ownerUserId: string, query: WorkflowExecutionQueryDto) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = this.buildAccessibleWhere(ownerUserId, query);

        const [data, total] = await Promise.all([
            this.prisma.workflowExecution.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ createdAt: 'desc' }],
                include: {
                    workflowVersion: {
                        include: {
                            workflowDefinition: true,
                        },
                    },
                },
            }),
            this.prisma.workflowExecution.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async findOne(ownerUserId: string, id: string) {
        const execution = await this.prisma.workflowExecution.findFirst({
            where: {
                id,
                workflowVersion: {
                    workflowDefinition: {
                        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
                    },
                },
            },
            include: {
                workflowVersion: {
                    include: {
                        workflowDefinition: true,
                    },
                },
                nodeExecutions: {
                    orderBy: [{ createdAt: 'asc' }],
                },
            },
        });

        if (!execution) {
            throw new NotFoundException('运行实例不存在或无权限访问');
        }

        return execution;
    }

    async rerun(ownerUserId: string, id: string) {
        const sourceExecution = await this.prisma.workflowExecution.findFirst({
            where: {
                id,
                workflowVersion: {
                    workflowDefinition: {
                        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
                    },
                },
            },
            include: {
                workflowVersion: true,
            },
        });

        if (!sourceExecution) {
            throw new NotFoundException('运行实例不存在或无权限访问');
        }
        if (sourceExecution.status !== 'FAILED') {
            throw new BadRequestException('仅失败实例支持重跑');
        }

        return this.trigger(ownerUserId, {
            workflowDefinitionId: sourceExecution.workflowVersion.workflowDefinitionId,
            workflowVersionId: sourceExecution.workflowVersionId,
            triggerType: 'MANUAL',
            paramSnapshot: this.toRecord(sourceExecution.paramSnapshot),
        }, {
            sourceExecutionId: sourceExecution.id,
        });
    }

    private buildAccessibleWhere(
        ownerUserId: string,
        query: WorkflowExecutionQueryDto,
    ): Prisma.WorkflowExecutionWhereInput {
        const conditions: Prisma.WorkflowExecutionWhereInput[] = [
            {
                workflowVersion: {
                    workflowDefinition: {
                        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
                        ...(query.workflowDefinitionId ? { id: query.workflowDefinitionId } : {}),
                    },
                },
            },
        ];

        if (query.workflowVersionId) {
            conditions.push({ workflowVersionId: query.workflowVersionId });
        }
        if (query.triggerType) {
            conditions.push({ triggerType: query.triggerType });
        }
        if (query.status) {
            conditions.push({ status: query.status });
        }
        if (query.hasSoftFailure) {
            conditions.push({
                status: 'SUCCESS',
                nodeExecutions: {
                    some: { status: 'FAILED' },
                },
            });
        }
        if (query.hasErrorRoute) {
            conditions.push({
                nodeExecutions: {
                    some: {
                        status: 'SKIPPED',
                        errorMessage: { contains: 'ROUTE_TO_ERROR', mode: 'insensitive' },
                    },
                },
            });
        }

        const versionCode = query.versionCode?.trim();
        if (versionCode) {
            conditions.push({
                workflowVersion: {
                    versionCode: { contains: versionCode, mode: 'insensitive' },
                },
            });
        }

        const keyword = query.keyword?.trim();
        if (keyword) {
            conditions.push({
                OR: [
                    { id: { contains: keyword } },
                    {
                        workflowVersion: {
                            OR: [
                                { versionCode: { contains: keyword, mode: 'insensitive' } },
                                {
                                    workflowDefinition: {
                                        OR: [
                                            { name: { contains: keyword, mode: 'insensitive' } },
                                            { workflowId: { contains: keyword, mode: 'insensitive' } },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
            });
        }

        if (query.startedAtFrom || query.startedAtTo) {
            conditions.push({
                startedAt: {
                    ...(query.startedAtFrom ? { gte: query.startedAtFrom } : {}),
                    ...(query.startedAtTo ? { lte: query.startedAtTo } : {}),
                },
            });
        }

        if (conditions.length === 1) {
            return conditions[0];
        }

        return {
            AND: conditions,
        };
    }

    private readMeta(outputSnapshot: Record<string, unknown>): Record<string, unknown> {
        const meta = outputSnapshot._meta;
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
            return {};
        }
        return meta as Record<string, unknown>;
    }

    private toJsonValue(value: unknown): Prisma.InputJsonValue {
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    }

    private toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    }

    private sortNodesByEdges(dsl: WorkflowDsl): WorkflowNode[] {
        const indexByNodeId = new Map<string, number>(
            dsl.nodes.map((node, index) => [node.id, index]),
        );
        const nodeById = new Map<string, WorkflowNode>(
            dsl.nodes.map((node) => [node.id, node]),
        );
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>();

        for (const node of dsl.nodes) {
            inDegree.set(node.id, 0);
            adjacency.set(node.id, []);
        }

        for (const edge of dsl.edges) {
            if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
                continue;
            }
            adjacency.get(edge.from)?.push(edge.to);
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        }

        const queue = dsl.nodes
            .filter((node) => (inDegree.get(node.id) || 0) === 0)
            .map((node) => node.id);
        const sortedNodeIds: string[] = [];

        while (queue.length > 0) {
            queue.sort((a, b) => (indexByNodeId.get(a) || 0) - (indexByNodeId.get(b) || 0));
            const currentNodeId = queue.shift();
            if (!currentNodeId) {
                break;
            }

            sortedNodeIds.push(currentNodeId);
            const neighbors = adjacency.get(currentNodeId) || [];
            for (const nextNodeId of neighbors) {
                const nextInDegree = (inDegree.get(nextNodeId) || 0) - 1;
                inDegree.set(nextNodeId, nextInDegree);
                if (nextInDegree === 0) {
                    queue.push(nextNodeId);
                }
            }
        }

        if (sortedNodeIds.length !== dsl.nodes.length) {
            return dsl.nodes;
        }

        return sortedNodeIds
            .map((nodeId) => nodeById.get(nodeId))
            .filter((node): node is WorkflowNode => Boolean(node));
    }

    private buildIncomingNodeMap(edges: WorkflowEdge[]): Map<string, string[]> {
        const incomingNodeMap = new Map<string, string[]>();
        for (const edge of edges) {
            const incomingNodeIds = incomingNodeMap.get(edge.to) || [];
            incomingNodeIds.push(edge.from);
            incomingNodeMap.set(edge.to, incomingNodeIds);
        }
        return incomingNodeMap;
    }

    private buildOutgoingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
        const outgoingEdgeMap = new Map<string, WorkflowEdge[]>();
        for (const edge of edges) {
            const outgoingEdges = outgoingEdgeMap.get(edge.from) || [];
            outgoingEdges.push(edge);
            outgoingEdgeMap.set(edge.from, outgoingEdges);
        }
        return outgoingEdgeMap;
    }

    private buildNodeInput(
        nodeId: string,
        incomingNodeMap: Map<string, string[]>,
        outputsByNode: Map<string, Record<string, unknown>>,
    ): Record<string, unknown> {
        const incomingNodeIds = incomingNodeMap.get(nodeId) || [];
        if (incomingNodeIds.length === 0) {
            return {};
        }

        if (incomingNodeIds.length === 1) {
            return outputsByNode.get(incomingNodeIds[0]) || {};
        }

        const branchOutputs: Record<string, unknown> = {};
        for (const incomingNodeId of incomingNodeIds) {
            branchOutputs[incomingNodeId] = outputsByNode.get(incomingNodeId) || {};
        }
        return { branches: branchOutputs };
    }

    private resolveRuntimePolicy(
        node: WorkflowNode,
        runPolicy?: WorkflowRunPolicy,
    ): WorkflowNodeRuntimePolicy {
        const defaults = WorkflowNodeRuntimePolicySchema.parse({});
        const config = node.config as Record<string, unknown>;
        const workflowNodeDefaults = runPolicy?.nodeDefaults ?? {};
        const nodeRuntimePolicy = node.runtimePolicy ?? {};

        const timeoutMsSource = nodeRuntimePolicy.timeoutMs
            ?? config.timeoutMs
            ?? workflowNodeDefaults.timeoutMs;
        const retryCountSource = nodeRuntimePolicy.retryCount
            ?? config.retryCount
            ?? workflowNodeDefaults.retryCount;
        const retryBackoffMsSource = nodeRuntimePolicy.retryBackoffMs
            ?? config.retryBackoffMs
            ?? workflowNodeDefaults.retryBackoffMs;
        const onErrorSource = nodeRuntimePolicy.onError
            ?? config.onError
            ?? workflowNodeDefaults.onError;

        const onErrorParsed = WorkflowNodeOnErrorPolicyEnum.safeParse(onErrorSource);

        return {
            timeoutMs: this.toInteger(timeoutMsSource, defaults.timeoutMs, 1_000, 120_000),
            retryCount: this.toInteger(retryCountSource, defaults.retryCount, 0, 5),
            retryBackoffMs: this.toInteger(retryBackoffMsSource, defaults.retryBackoffMs, 0, 60_000),
            onError: onErrorParsed.success ? onErrorParsed.data : defaults.onError,
        };
    }

    private markNonErrorBranchSkipped(
        failedNodeId: string,
        outgoingEdgeMap: Map<string, WorkflowEdge[]>,
        skipReasonByNode: Map<string, string>,
        reason: string,
    ): void {
        const outgoingEdges = outgoingEdgeMap.get(failedNodeId) || [];
        const directErrorTargets = new Set(
            outgoingEdges
                .filter((edge) => edge.edgeType === 'error-edge')
                .map((edge) => edge.to),
        );

        const queue = outgoingEdges
            .filter((edge) => edge.edgeType !== 'error-edge')
            .map((edge) => edge.to)
            .filter((nodeId) => !directErrorTargets.has(nodeId));

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            if (!currentNodeId || skipReasonByNode.has(currentNodeId)) {
                continue;
            }

            skipReasonByNode.set(currentNodeId, reason);
            const nextEdges = outgoingEdgeMap.get(currentNodeId) || [];
            for (const nextEdge of nextEdges) {
                if (nextEdge.edgeType !== 'error-edge') {
                    queue.push(nextEdge.to);
                }
            }
        }
    }

    private toInteger(value: unknown, fallback: number, min: number, max: number): number {
        let parsed = fallback;
        if (typeof value === 'number' && Number.isFinite(value)) {
            parsed = Math.trunc(value);
        } else if (typeof value === 'string' && value.trim() !== '') {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                parsed = Math.trunc(numeric);
            }
        }
        return Math.max(min, Math.min(max, parsed));
    }

    private async executeWithTimeout<T>(
        task: () => Promise<T>,
        timeoutMs: number,
        timeoutMessage: string,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, timeoutMs);

            task()
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error: unknown) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private async sleep(ms: number): Promise<void> {
        if (ms <= 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
