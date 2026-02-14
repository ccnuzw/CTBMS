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

    // WF001: Required Metadata
    // Ideally this checks dsl.name/mode fields, but here we validate graph structure primarily.
    // We can check if nodes have required data.
    nodes.forEach(n => {
        if (!n.data.label) {
            // errors.push(`节点 ${n.id} 缺少标签 (WF001)`); // Optional strictness
        }
    });

    // WF002: Unique ID Check (React Flow handles this internally usually, but good to verify)
    const idSet = new Set<string>();
    const duplicates = new Set<string>();
    nodes.forEach(n => {
        if (idSet.has(n.id)) duplicates.add(n.id);
        idSet.add(n.id);
    });
    if (duplicates.size > 0) {
        errors.push(`存在重复节点 ID: ${Array.from(duplicates).join(', ')} (WF002)`);
    }

    // WF003: Edge validity
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges.forEach((edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            errors.push(`连线 ${edge.id} 的端点不存在 (WF003)`);
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
            // Groups and Comments might be isolated
            if (config?.category === 'GROUP') return;

            const isTrigger = config?.category === 'TRIGGER';
            const isOutput = config?.category === 'OUTPUT'; // OR n.type === 'end' if strictly defined

            // Triggers generally start flows, so they might not have incoming (unless looped)
            // But they MUST have outgoing to be useful (WF004) -> "Effective Reachability"
            if (isTrigger && !outgoingEdges.has(n.id)) {
                errors.push(`触发节点 "${n.data.label || n.id}" 未连接后续流程 (WF004)`);
            }

            // Middle nodes must have both
            if (!isTrigger && !incomingEdges.has(n.id)) {
                errors.push(`节点 "${n.data.label || n.id}" 缺少输入连线 (WF004)`);
            }
            // Strict: Non-output/End nodes should have outgoing, but maybe legitimate dead-ends exist (e.g. fire-and-forget notify)
            // We can loosen this for now or keep it strict.
            // if (!isOutput && !outgoingEdges.has(n.id) && !['notify'].includes(n.data.type as string)) {
            //    errors.push(`节点 "${n.data.label || n.id}" 缺少输出连线 (WF004)`);
            // }
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
    const errors: string[] = [];

    // WF101: Debate Topology
    const contextBuilderNodes = nodes.filter((n) => n.data.type === 'context-builder'); // Fixed: debate-topic -> context-builder
    const agentNodes = nodes.filter(
        (n) =>
            n.data.type === 'agent-call' ||
            n.data.type === 'single-agent' ||
            n.data.type === 'agent-group' ||
            n.data.type === 'debate-round' // debate-round also considered part of debate flow
    );
    const judgeNodes = nodes.filter(
        (n) => n.data.type === 'judge-agent'
    );

    if (contextBuilderNodes.length !== 1) {
        errors.push('辩论模式需要恰好 1 个 "上下文构建 (Context Builder)" 节点');
    }
    // Debate round needs at least participants config, but structurally we check for agent/debate nodes
    if (agentNodes.length < 1) {
        errors.push('辩论模式至少需要 1 个 "辩论轮次" 或 "智能体" 节点');
    }
    if (judgeNodes.length !== 1) {
        errors.push('辩论模式需要恰好 1 个 "裁判 (Judge)" 节点');
    }

    return { isValid: errors.length === 0, errors };
};

const validateDAG = (nodes: Node[], edges: Edge[]): ValidationResult => {
    const errors: string[] = [];
    if (hasCycle(nodes, edges)) {
        errors.push('检测到循环依赖 (Cycle Detected)');
    }

    // WF102: DAG should imply complexity that often needs a Join, but strictly:
    // Any node with >1 incoming edge usually implies a Join or Merge needed upstream if they split.
    // Here we just check if ParallelSplit exists, there should be a Join.
    const splitNodes = nodes.filter(n => n.data.type === 'parallel-split');
    const joinNodes = nodes.filter(n => n.data.type === 'join' || n.data.type === 'control-join');

    if (splitNodes.length > 0 && joinNodes.length === 0) {
        errors.push('DAG 模式下使用 "并行拆分" 时，通常需要配对 "汇聚等待 (Join)" 节点');
    }

    // WF104: High value scenarios should have Risk Gate
    const riskNodes = nodes.filter(n => n.data.type === 'risk-gate');
    if (riskNodes.length === 0) {
        // This might be a warning rather than error, but per design it's a "Standard Link" component
        // errors.push('建议在 DAG 模式决策流中添加 "风控闸门 (Risk Gate)" 节点 (WF104)');
    }

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
