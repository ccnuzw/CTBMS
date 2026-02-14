import { Node, Edge } from '@xyflow/react';
import { getNodeTypeConfig } from './nodeTypeRegistry';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export type WorkflowMode = 'linear' | 'dag' | 'debate';

export const validateGraph = (
    nodes: Node[],
    edges: Edge[],
    mode: WorkflowMode
): ValidationResult => {
    const errors: string[] = [];

    // ── Common Checks (WF001 - WF004) ──

    // WF003: Edge validity
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges.forEach((edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            errors.push(`连线 ${edge.id} 的端点不存在 (WF003)`);
        }
    });

    // WF004: Dangling nodes (Simpler version: just check if isolated)
    // Detailed check would need to know if a node is a root (Trigger) or leaf (Output)
    if (nodes.length > 1) {
        const connectedNodeIds = new Set<string>();
        edges.forEach((e) => {
            connectedNodeIds.add(e.source);
            connectedNodeIds.add(e.target);
        });
        nodes.forEach((n) => {
            if (!connectedNodeIds.has(n.id)) {
                // Allow isolated Comment/Group nodes if we had them, but for functional nodes warn
                const config = getNodeTypeConfig(n.data.type as string);
                if (config?.category !== 'GROUP') {
                    errors.push(`节点 "${n.data.label || n.id}" 未连接 (WF004)`);
                }
            }
        });
    }

    // Mode-specific validation
    switch (mode) {
        case 'linear':
            errors.push(...validateLinear(nodes, edges).errors);
            break;
        case 'debate':
            errors.push(...validateDebate(nodes, edges).errors);
            break;
        case 'dag':
        default:
            errors.push(...validateDAG(nodes, edges).errors);
            break;
    }

    return { isValid: errors.length === 0, errors };
};

const validateDAG = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];
    if (hasCycle(nodes, edges)) {
        errors.push('检测到循环依赖 (Cycle Detected)');
    }
    // WF102: DAG should probably have a Join if it splits? Not strictly enforced here yet.
    return { isValid: errors.length === 0, errors };
};

const validateLinear = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];

    if (hasCycle(nodes, edges)) {
        errors.push('线性模式不支持循环 (Cycle Detected)');
    }

    // WF005: Max 1 outgoing edge per node (Linear Chain)
    const sourceCounts = new Map<string, number>();
    edges.forEach((e) => {
        sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
    });

    sourceCounts.forEach((count, nodeId) => {
        if (count > 1) {
            const node = nodes.find((n) => n.id === nodeId);
            const label = node?.data?.label || nodeId;
            errors.push(`线性模式下节点 "${label}" 不允许有多个后续分支`);
        }
    });

    return { isValid: errors.length === 0, errors };
};

const validateDebate = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];

    // WF101: Debate Topology
    const topicNodes = nodes.filter((n) => n.data.type === 'debate-topic');
    const agentNodes = nodes.filter(
        (n) =>
            n.data.type === 'agent-call' ||
            n.data.type === 'agent-group' ||
            // Compatibility for old checks
            n.data.type === 'single-agent' ||
            n.data.type === 'debate-agent-a' ||
            n.data.type === 'debate-agent-b'
    );
    const judgeNodes = nodes.filter(
        (n) => n.data.type === 'judge-agent' || n.data.type === 'debate-judge'
    );

    if (topicNodes.length !== 1) {
        errors.push('辩论模式需要恰好 1 个 "辩题 (Topic)" 节点');
    }
    if (agentNodes.length < 2) {
        errors.push('辩论模式至少需要 2 个 "辩手 (Agent)" 节点');
    }
    if (judgeNodes.length !== 1) {
        errors.push('辩论模式需要恰好 1 个 "裁判 (Judge)" 节点');
    }

    // Optional: Check Context Builder
    // const contextBuilders = nodes.filter(n => n.data.type === 'context-builder');

    return { isValid: errors.length === 0, errors };
};

// DFS Cycle Detection
const hasCycle = (nodes: Node[], edges: Edge[]): boolean => {
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => adj.set(n.id, []));
    edges.forEach((e) => {
        if (adj.has(e.source)) {
            adj.get(e.source)?.push(e.target);
        }
    });

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const isCyclic = (nodeId: string): boolean => {
        if (!visited.has(nodeId)) {
            visited.add(nodeId);
            recStack.add(nodeId);

            const children = adj.get(nodeId) || [];
            for (const child of children) {
                if (!visited.has(child) && isCyclic(child)) {
                    return true;
                } else if (recStack.has(child)) {
                    return true;
                }
            }
        }
        recStack.delete(nodeId);
        return false;
    };

    for (const node of nodes) {
        if (isCyclic(node.id)) {
            return true;
        }
    }
    return false;
};
