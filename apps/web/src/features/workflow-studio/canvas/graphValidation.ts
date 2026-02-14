import { Node, Edge } from '@xyflow/react';

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
    switch (mode) {
        case 'linear':
            return validateLinear(nodes, edges);
        case 'debate':
            return validateDebate(nodes, edges);
        case 'dag':
        default:
            return validateDAG(nodes, edges);
    }
};

const validateDAG = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];
    if (hasCycle(nodes, edges)) {
        errors.push('检测到循环依赖 (Cycle Detected)');
    }
    return { isValid: errors.length === 0, errors };
};

const validateLinear = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];

    // 1. Check for cycles (Linear is also a DAG)
    if (hasCycle(nodes, edges)) {
        errors.push('检测到循环依赖');
    }

    // 2. Check max outgoing edges per node (Simplify: max 1 data edge)
    const outputCounts = new Map<string, number>();
    edges.forEach(edge => {
        // Assume all edges are data flow for now, or check generic type
        const count = outputCounts.get(edge.source) || 0;
        outputCounts.set(edge.source, count + 1);
    });

    nodes.forEach(node => {
        if ((outputCounts.get(node.id) || 0) > 1) {
            // Allow multiple outputs if it's a router/switch (logic needed), 
            // but for strict linear chain, warn about it.
            // keeping it simple for now.
            errors.push(`节点 "${node.data.label || node.id}" 有多个输出分支，线性模式下建议单一流程。`);
        }
    });

    return { isValid: errors.length === 0, errors };
};

const validateDebate = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];

    // Check for required node types
    const topicNodes = nodes.filter(n => n.data.type === 'debate-topic');
    const agentNodes = nodes.filter(n => n.data.type === 'debate-agent-a' || n.data.type === 'debate-agent-b'); // Assuming these types exist or will exist
    const judgeNodes = nodes.filter(n => n.data.type === 'debate-judge'); // Assuming this type exists

    if (topicNodes.length !== 1) {
        errors.push('辩论模式需要 1 个 "辩题 (Topic)" 节点');
    }
    if (agentNodes.length < 2) {
        errors.push('辩论模式至少需要 2 个 "辩手 (Agent)" 节点');
    }
    if (judgeNodes.length !== 1) {
        errors.push('辩论模式需要 1 个 "裁判 (Judge)" 节点');
    }

    // Explicit topology checks can be added here (Topic -> Agents -> Judge)

    return { isValid: errors.length === 0, errors };
};

// DFS Cycle Detection
const hasCycle = (nodes: Node[], edges: Edge[]): boolean => {
    const adj = new Map<string, string[]>();
    nodes.forEach(n => adj.set(n.id, []));
    edges.forEach(e => {
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
