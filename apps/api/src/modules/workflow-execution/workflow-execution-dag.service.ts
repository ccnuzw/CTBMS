import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { VariableResolver } from './engine/variable-resolver';
import {
    WorkflowDsl,
    WorkflowEdge,
    WorkflowNode,
    WorkflowRunPolicy,
    WorkflowNodeRuntimePolicy,
    WorkflowNodeOnErrorPolicyEnum,
    WorkflowNodeRuntimePolicySchema,
} from '@packages/types';
import * as ExecutionUtils from './workflow-execution.utils';
import { ConfigService } from '../config/config.service';

@Injectable()
export class WorkflowExecutionDagService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly variableResolver: VariableResolver,
        private readonly configService: ConfigService,
    ) { }

    sortNodesByEdges(dsl: WorkflowDsl): WorkflowNode[] {
        const indexByNodeId = new Map<string, number>(dsl.nodes.map((node, index) => [node.id, index]));
        const nodeById = new Map<string, WorkflowNode>(dsl.nodes.map((node) => [node.id, node]));
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

    buildIncomingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
        const incomingEdgeMap = new Map<string, WorkflowEdge[]>();
        for (const edge of edges) {
            const incomingEdges = incomingEdgeMap.get(edge.to) || [];
            incomingEdges.push(edge);
            incomingEdgeMap.set(edge.to, incomingEdges);
        }
        return incomingEdgeMap;
    }

    buildOutgoingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
        const outgoingEdgeMap = new Map<string, WorkflowEdge[]>();
        for (const edge of edges) {
            const outgoingEdges = outgoingEdgeMap.get(edge.from) || [];
            outgoingEdges.push(edge);
            outgoingEdgeMap.set(edge.from, outgoingEdges);
        }
        return outgoingEdgeMap;
    }

    selectLinearIncomingEdges(
        nodeId: string,
        incomingEdgeMap: Map<string, WorkflowEdge[]>,
        outputsByNode: Map<string, Record<string, unknown>>,
        paramSnapshot?: Record<string, unknown>,
    ): { hasIncoming: boolean; activeEdges: WorkflowEdge[] } {
        const incomingEdges = incomingEdgeMap.get(nodeId) || [];
        if (incomingEdges.length === 0) {
            return { hasIncoming: false, activeEdges: [] };
        }

        const activeEdges: WorkflowEdge[] = [];
        for (const edge of incomingEdges) {
            const sourceOutput = outputsByNode.get(edge.from);
            if (!sourceOutput) {
                continue;
            }
            if (edge.edgeType === 'error-edge') {
                const meta = ExecutionUtils.readMeta(sourceOutput);
                if (meta.onErrorRouting === 'ROUTE_TO_ERROR') {
                    activeEdges.push(edge);
                }
                continue;
            }
            if (edge.edgeType === 'condition-edge') {
                if (!this.evaluateEdgeCondition(edge.condition, sourceOutput, paramSnapshot, edge.from)) {
                    continue;
                }
            }
            activeEdges.push(edge);
        }

        return {
            hasIncoming: true,
            activeEdges,
        };
    }

    buildNodeInputFromEdges(
        incomingEdges: WorkflowEdge[],
        outputsByNode: Map<string, Record<string, unknown>>,
    ): Record<string, unknown> {
        if (incomingEdges.length === 0) {
            return {};
        }

        if (incomingEdges.length === 1) {
            return outputsByNode.get(incomingEdges[0].from) || {};
        }

        const branchOutputs: Record<string, unknown> = {};
        for (const edge of incomingEdges) {
            branchOutputs[edge.from] = outputsByNode.get(edge.from) || {};
        }
        return { branches: branchOutputs };
    }

    resolveNodeInputBindings(params: {
        node: WorkflowNode;
        rawInputSnapshot: Record<string, unknown>;
        outputsByNode: Map<string, Record<string, unknown>>;
        paramSnapshot?: Record<string, unknown>;
        executionId: string;
        triggerUserId: string;
    }): Record<string, unknown> {
        const inputBindings = params.node.inputBindings;
        if (!inputBindings || typeof inputBindings !== 'object' || Array.isArray(inputBindings)) {
            return params.rawInputSnapshot;
        }

        const bindingResult = this.variableResolver.resolveMapping(inputBindings, {
            currentNodeId: params.node.id,
            outputsByNode: params.outputsByNode,
            paramSnapshot: params.paramSnapshot,
            meta: {
                executionId: params.executionId,
                triggerUserId: params.triggerUserId,
                timestamp: new Date().toISOString(),
            },
        });
        if (bindingResult.unresolvedVars.length > 0) {
            throw new BadRequestException(
                `节点 ${params.node.name} 的 inputBindings 无法解析: ${bindingResult.unresolvedVars.join(', ')}`,
            );
        }

        return {
            ...params.rawInputSnapshot,
            ...bindingResult.resolved,
        };
    }

    evaluateEdgeCondition(
        condition: unknown,
        sourceOutput: Record<string, unknown>,
        paramSnapshot?: Record<string, unknown>,
        sourceNodeId?: string,
    ): boolean {
        if (condition === null || condition === undefined) {
            return false;
        }
        if (typeof condition === 'boolean') {
            return condition;
        }
        if (typeof condition === 'object') {
            const cond = condition as Record<string, unknown>;
            const field = typeof cond.field === 'string' ? cond.field : '';
            const operator = typeof cond.operator === 'string' ? cond.operator.toLowerCase() : '';
            const expected = cond.value;
            if (!field || !operator) {
                return false;
            }
            const actual = ExecutionUtils.readValueByPath(sourceOutput, field);
            return ExecutionUtils.compareConditionValues(actual, expected, operator);
        }
        if (typeof condition !== 'string') {
            return false;
        }

        const expression = condition.trim();
        if (!expression) {
            return false;
        }
        if (expression === 'true') {
            return true;
        }
        if (expression === 'false') {
            return false;
        }

        const resolvedExpression = expression.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawRef: string) => {
            const ref = rawRef.trim();
            let value: unknown;
            if (ref.startsWith('params.')) {
                value = ExecutionUtils.readValueByPath(paramSnapshot ?? {}, ref.slice('params.'.length));
            } else {
                const normalizedPath =
                    sourceNodeId && ref.startsWith(`${sourceNodeId}.`)
                        ? ref.slice(sourceNodeId.length + 1)
                        : ref;
                value = ExecutionUtils.readValueByPath(sourceOutput, normalizedPath);
            }
            return JSON.stringify(value);
        });

        const comparisonMatch = resolvedExpression.match(/^\s*(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)\s*$/);
        if (!comparisonMatch) {
            const single = ExecutionUtils.parseConditionLiteral(resolvedExpression);
            return Boolean(single);
        }

        const left = ExecutionUtils.parseConditionLiteral(comparisonMatch[1]);
        const operator = comparisonMatch[2];
        const right = ExecutionUtils.parseConditionLiteral(comparisonMatch[3]);
        return ExecutionUtils.compareConditionValues(left, right, operator);
    }

    resolveRuntimePolicy(
        node: WorkflowNode,
        runPolicy?: WorkflowRunPolicy,
        strictModeEnabled = false,
    ): WorkflowNodeRuntimePolicy {
        const defaults = WorkflowNodeRuntimePolicySchema.parse({});
        const config = node.config as Record<string, unknown>;
        const workflowNodeDefaults = runPolicy?.nodeDefaults ?? {};
        const nodeRuntimePolicy = node.runtimePolicy ?? {};

        const timeoutSecondsSource =
            nodeRuntimePolicy.timeoutSeconds ?? config.timeoutSeconds ?? workflowNodeDefaults.timeoutSeconds;
        const retryCountSource =
            nodeRuntimePolicy.retryCount ?? config.retryCount ?? workflowNodeDefaults.retryCount;
        const retryIntervalSecondsSource =
            nodeRuntimePolicy.retryIntervalSeconds ??
            config.retryIntervalSeconds ??
            workflowNodeDefaults.retryIntervalSeconds;
        const onErrorSource =
            nodeRuntimePolicy.onError ?? config.onError ?? workflowNodeDefaults.onError;

        const onErrorParsed = WorkflowNodeOnErrorPolicyEnum.safeParse(onErrorSource);
        const onErrorResolved = onErrorParsed.success ? onErrorParsed.data : defaults.onError;
        const onError = strictModeEnabled && this.isStrictModeAgentNode(node.type)
            ? 'FAIL_FAST'
            : onErrorResolved;

        return {
            timeoutSeconds: ExecutionUtils.toInteger(timeoutSecondsSource, defaults.timeoutSeconds, 1, 120),
            retryCount: ExecutionUtils.toInteger(retryCountSource, defaults.retryCount, 0, 5),
            retryIntervalSeconds: ExecutionUtils.toInteger(retryIntervalSecondsSource, defaults.retryIntervalSeconds, 0, 60),
            onError,
        };
    }

    isStrictModeAgentNode(nodeType: string): boolean {
        return (
            nodeType === 'agent-call' ||
            nodeType === 'single-agent' ||
            nodeType === 'debate-round' ||
            nodeType === 'judge-agent'
        );
    }

    async isWorkflowAgentStrictModeEnabled(): Promise<boolean> {
        try {
            const setting = await this.configService.getWorkflowAgentStrictMode();
            return setting.enabled;
        } catch {
            const fallback = this.parseBooleanFlag(process.env.WORKFLOW_AGENT_STRICT_MODE);
            return fallback ?? false;
        }
    }

    parseBooleanFlag(value: unknown): boolean | null {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value === 0) return false;
            if (value > 0) return true;
        }
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            if (lower === 'true' || lower === '1') return true;
            if (lower === 'false' || lower === '0') return false;
        }
        return null;
    }

    markNonErrorBranchSkipped(
        failedNodeId: string,
        outgoingEdgeMap: Map<string, WorkflowEdge[]>,
        skipReasonByNode: Map<string, string>,
        reason: string,
    ): void {
        const outgoingEdges = outgoingEdgeMap.get(failedNodeId) || [];
        const queue = outgoingEdges
            .filter((e) => e.edgeType !== 'error-edge')
            .map((e) => e.to);
        const visited = new Set<string>();

        while (queue.length > 0) {
            const nextId = queue.shift();
            if (!nextId || visited.has(nextId)) {
                continue;
            }
            visited.add(nextId);
            skipReasonByNode.set(nextId, reason);

            const nextOutgoingEdges = outgoingEdgeMap.get(nextId) || [];
            for (const nextEdge of nextOutgoingEdges) {
                if (nextEdge.edgeType !== 'error-edge') {
                    queue.push(nextEdge.to);
                }
            }
        }
    }
}
