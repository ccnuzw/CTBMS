import { useCallback, useMemo, useRef } from 'react';
import { useNodesState, useEdgesState, type Node, type Edge, addEdge, type Connection } from '@xyflow/react';
import type { WorkflowDsl, WorkflowNode, WorkflowEdge } from '@packages/types';
import { getNodeTypeConfig } from './nodeTypeRegistry';

/**
 * DSL ↔ ReactFlow 数据双向同步 Hook
 *
 * 职责:
 * 1. 将 WorkflowDsl 转换为 ReactFlow 的 Node[] 和 Edge[]
 * 2. 将 ReactFlow 的编辑操作同步回 DSL
 * 3. 管理画布状态（节点位置、选中状态）
 * 4. 提供 DSL 导出（用于保存）
 */
export const useDslSync = (initialDsl?: WorkflowDsl) => {
    const dslRef = useRef<WorkflowDsl | undefined>(initialDsl);

    // ── DSL → ReactFlow 转换 ──

    const initialNodes = useMemo<Node[]>(() => {
        if (!initialDsl) return [];
        return dslNodesToFlow(initialDsl.nodes);
    }, [initialDsl]);

    const initialEdges = useMemo<Edge[]>(() => {
        if (!initialDsl) return [];
        return dslEdgesToFlow(initialDsl.edges);
    }, [initialDsl]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // ── 连线回调 ──

    const onConnect = useCallback(
        (connection: Connection) => {
            const newEdge: Edge = {
                id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
                source: connection.source!,
                target: connection.target!,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
                type: 'smoothstep',
                animated: true,
                data: { edgeType: 'data-edge' },
            };
            setEdges((eds) => addEdge(newEdge, eds));
        },
        [setEdges],
    );

    // ── 添加节点 ──

    const addNode = useCallback(
        (nodeType: string, position: { x: number; y: number }) => {
            const typeConfig = getNodeTypeConfig(nodeType);
            const nodeId = `${nodeType}_${Date.now()}`;

            const newNode: Node = {
                id: nodeId,
                type: 'workflowNode',
                position,
                data: {
                    type: nodeType,
                    name: typeConfig?.label ?? nodeType,
                    enabled: true,
                    config: { ...(typeConfig?.defaultConfig ?? {}) },
                    nodeTypeConfig: typeConfig,
                },
            };

            setNodes((nds) => [...nds, newNode]);
            return nodeId;
        },
        [setNodes],
    );

    // ── 删除节点 ──

    const removeNode = useCallback(
        (nodeId: string) => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        },
        [setNodes, setEdges],
    );

    // ── 更新节点数据 ──

    const updateNodeData = useCallback(
        (nodeId: string, data: Partial<Record<string, unknown>>) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
            );
        },
        [setNodes],
    );

    // ── ReactFlow → DSL 导出 ──

    const exportDsl = useCallback((): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } => {
        const dslNodes: WorkflowNode[] = nodes.map((n) => ({
            id: n.id,
            type: n.data.type as string,
            name: n.data.name as string,
            enabled: (n.data.enabled as boolean) ?? true,
            config: (n.data.config as Record<string, unknown>) ?? {},
            runtimePolicy: n.data.runtimePolicy as Record<string, unknown> | undefined,
            inputBindings: n.data.inputBindings as Record<string, unknown> | undefined,
            outputSchema: n.data.outputSchema as string | undefined,
        }));

        const dslEdges: WorkflowEdge[] = edges.map((e) => ({
            id: e.id,
            from: e.source,
            to: e.target,
            edgeType: (e.data?.edgeType as WorkflowEdge['edgeType']) ?? 'data-edge',
            condition: e.data?.condition ?? null,
        }));

        return { nodes: dslNodes, edges: dslEdges };
    }, [nodes, edges]);

    // ── 从 DSL 重新加载 ──

    const loadDsl = useCallback(
        (dsl: WorkflowDsl) => {
            dslRef.current = dsl;
            setNodes(dslNodesToFlow(dsl.nodes));
            setEdges(dslEdgesToFlow(dsl.edges));
        },
        [setNodes, setEdges],
    );

    return {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        removeNode,
        updateNodeData,
        exportDsl,
        loadDsl,
        setNodes,
        setEdges,
    };
};

// ────────────────── 转换工具函数 ──────────────────

/**
 * WorkflowNode[] → ReactFlow Node[]
 */
function dslNodesToFlow(dslNodes: WorkflowNode[]): Node[] {
    return dslNodes.map((n, idx) => {
        const typeConfig = getNodeTypeConfig(n.type);
        return {
            id: n.id,
            type: 'workflowNode',
            // 在保存时位置可能存于 config._position，否则按列自动排列
            position: (n.config._position as { x: number; y: number }) ?? {
                x: 250,
                y: 100 + idx * 120,
            },
            data: {
                type: n.type,
                name: n.name,
                enabled: n.enabled,
                config: n.config,
                runtimePolicy: n.runtimePolicy,
                inputBindings: n.inputBindings,
                outputSchema: n.outputSchema,
                nodeTypeConfig: typeConfig,
            },
        };
    });
}

/**
 * WorkflowEdge[] → ReactFlow Edge[]
 */
function dslEdgesToFlow(dslEdges: WorkflowEdge[]): Edge[] {
    return dslEdges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'smoothstep',
        animated: e.edgeType === 'data-edge',
        style: getEdgeStyle(e.edgeType),
        data: {
            edgeType: e.edgeType,
            condition: e.condition,
        },
    }));
}

function getEdgeStyle(edgeType: string): React.CSSProperties {
    switch (edgeType) {
        case 'data-edge':
            return { stroke: '#1677FF', strokeWidth: 2 };
        case 'control-edge':
            return { stroke: '#8C8C8C', strokeWidth: 2, strokeDasharray: '5,5' };
        case 'condition-edge':
            return { stroke: '#FA8C16', strokeWidth: 2 };
        case 'error-edge':
            return { stroke: '#F5222D', strokeWidth: 2, strokeDasharray: '3,3' };
        default:
            return { stroke: '#1677FF', strokeWidth: 2 };
    }
}
