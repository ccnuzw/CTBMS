import { Node, Edge } from '@xyflow/react';
import { getNodeTypeConfig } from './nodeTypeRegistry';

export interface ValidationError {
    message: string;
    nodeId?: string;
    edgeId?: string;
    severity?: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

export type WorkflowMode = 'linear' | 'dag' | 'debate';

export const validateGraph = (
    nodes: Node[],
    edges: Edge[],
    mode: WorkflowMode
): ValidationResult => {
    const errors: ValidationError[] = [];

    // ── Common Checks (WF001 - WF004) ──

    // WF001: Required Metadata
    nodes.forEach(n => {
        if (!n.data.label) {
            // errors.push({ message: `节点 ${n.id} 缺少标签 (WF001)`, nodeId: n.id });
        }
    });

    // WF002: Unique ID Check
    const idSet = new Set<string>();
    const duplicates = new Set<string>();
    nodes.forEach(n => {
        if (idSet.has(n.id)) duplicates.add(n.id);
        idSet.add(n.id);
    });
    if (duplicates.size > 0) {
        duplicates.forEach(id => {
            errors.push({ message: `存在重复节点 ID: ${id} (WF002)`, nodeId: id });
        });
    }

    // WF003: Edge validity
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges.forEach((edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            errors.push({ message: `连线端点不存在 (WF003)`, edgeId: edge.id });
        }
    });

    // WF004: Dangling nodes (Strict Connectivity)
    if (nodes.length > 1) {
        const incomingEdges = new Set<string>();
        const outgoingEdges = new Set<string>();
        edges.forEach((e) => {
            incomingEdges.add(e.target);
            outgoingEdges.add(e.source);
        });

        nodes.forEach((n) => {
            const config = getNodeTypeConfig(n.data.type as string);
            if (config?.category === 'GROUP') return;

            const isTrigger = config?.category === 'TRIGGER';
            // const isOutput = config?.category === 'OUTPUT';

            if (isTrigger && !outgoingEdges.has(n.id)) {
                errors.push({ message: `触发节点未连接后续流程 (WF004)`, nodeId: n.id });
            }

            if (!isTrigger && !incomingEdges.has(n.id)) {
                errors.push({ message: `节点缺少输入连线 (WF004)`, nodeId: n.id });
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

const validateDebate = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: ValidationError[] = [];

    const contextBuilderNodes = nodes.filter((n) => n.data.type === 'context-builder');
    const agentNodes = nodes.filter(
        (n) =>
            n.data.type === 'agent-call' ||
            n.data.type === 'single-agent' ||
            n.data.type === 'agent-group' ||
            n.data.type === 'debate-round'
    );
    const judgeNodes = nodes.filter(
        (n) => n.data.type === 'judge-agent'
    );

    if (contextBuilderNodes.length !== 1) {
        errors.push({ message: '辩论模式需要恰好 1 个 "上下文构建 (Context Builder)" 节点' });
    }
    if (agentNodes.length < 1) {
        errors.push({ message: '辩论模式至少需要 1 个 "辩论轮次" 或 "智能体" 节点' });
    }
    if (judgeNodes.length !== 1) {
        errors.push({ message: '辩论模式需要恰好 1 个 "裁判 (Judge)" 节点' });
    }

    return { isValid: errors.length === 0, errors };
};

const validateDAG = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: ValidationError[] = [];
    if (hasCycle(nodes, edges)) {
        errors.push({ message: '检测到循环依赖 (Cycle Detected)' });
    }

    const splitNodes = nodes.filter(n => n.data.type === 'parallel-split');
    const joinNodes = nodes.filter(n => n.data.type === 'join' || n.data.type === 'control-join');

    if (splitNodes.length > 0 && joinNodes.length === 0) {
        splitNodes.forEach(n => {
            errors.push({ message: '使用 "并行拆分" 时，通常需要配对 "汇聚等待" 节点', nodeId: n.id, severity: 'WARNING' });
        });
    }

    return { isValid: errors.length === 0, errors };
};

const validateLinear = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: ValidationError[] = [];

    if (hasCycle(nodes, edges)) {
        errors.push({ message: '线性模式不支持循环 (Cycle Detected)' });
    }

    const sourceCounts = new Map<string, number>();
    edges.forEach((e) => {
        sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
    });

    sourceCounts.forEach((count, nodeId) => {
        if (count > 1) {
            errors.push({ message: `线性模式下节点不允许有多个后续分支`, nodeId });
        }
    });

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
