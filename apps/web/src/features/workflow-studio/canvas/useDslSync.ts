import { useCallback, useEffect, useRef } from 'react';
import {
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    addEdge,
    type Connection,
} from '@xyflow/react';
import { message } from 'antd';
import {
    normalizeWorkflowNodeType,
    type WorkflowDsl,
    type WorkflowNode,
    type WorkflowEdge,
} from '@packages/types';
import { getNodeTypeConfig } from './nodeTypeRegistry';

interface AddNodePreset {
    name?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    runtimePolicy?: Record<string, unknown>;
    inputBindings?: Record<string, unknown>;
    outputSchema?: string | Record<string, unknown>;
}

export const useDslSync = (
    initialDsl: WorkflowDsl,
    onChange?: (dsl: WorkflowDsl) => void,
    onSnapshot?: (nodes: Node[], edges: Edge[]) => void,
) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const dslRef = useRef<WorkflowDsl>(initialDsl);

    useEffect(() => {
        if (!initialDsl) {
            setNodes([]);
            setEdges([]);
            return;
        }
        setNodes(dslNodesToFlow(initialDsl.nodes));
        setEdges(dslEdgesToFlow(initialDsl.edges));
    }, [initialDsl, setNodes, setEdges]);

    const syncToDsl = useCallback(() => {
        const newDsl = flowToDsl(nodes, edges, dslRef.current);
        dslRef.current = newDsl;
        onChange?.(newDsl);
    }, [nodes, edges, onChange]);

    const onConnect = useCallback(
        (params: Connection) => {
            const sourceNode = nodes.find((n) => n.id === params.source);
            const targetNode = nodes.find((n) => n.id === params.target);

            if (sourceNode && targetNode) {
                const sourceConfig = getNodeTypeConfig(sourceNode.data.type as string);
                const targetConfig = getNodeTypeConfig(targetNode.data.type as string);

                const sourceSchemas = sourceConfig?.outputsSchema ?? [{ name: 'output', type: 'any' }];
                const targetSchemas = targetConfig?.inputsSchema ?? [{ name: 'input', type: 'any' }];

                const sourceHandle = params.sourceHandle ?? sourceSchemas[0]?.name;
                const targetHandle = params.targetHandle ?? targetSchemas[0]?.name;

                const outputSchema = sourceSchemas.find((schema) => schema.name === sourceHandle);
                const inputSchema = targetSchemas.find((schema) => schema.name === targetHandle);

                if (!outputSchema || !inputSchema) {
                    message.error('端口不存在或不可连接');
                    return;
                }

                if (
                    outputSchema.type !== 'any'
                    && inputSchema.type !== 'any'
                    && outputSchema.type !== inputSchema.type
                ) {
                    message.error(`类型不匹配: 无法将 ${outputSchema.type} 连接到 ${inputSchema.type}`);
                    return;
                }

                params = {
                    ...params,
                    sourceHandle,
                    targetHandle,
                };
            }

            // Snapshot before connecting
            onSnapshot?.(nodes, edges);

            const newEdge: Edge = {
                id: `edge_${params.source}_${params.target}_${Date.now()}`,
                source: params.source,
                target: params.target,
                sourceHandle: params.sourceHandle,
                targetHandle: params.targetHandle,
                type: 'smoothstep',
                animated: true,
                data: { edgeType: 'data-edge' },
            };
            setEdges((eds) => addEdge(newEdge, eds));
        },
        [setEdges, nodes, edges, onSnapshot],
    );

    const addNode = useCallback(
        (nodeType: string, position: { x: number; y: number }, preset?: AddNodePreset) => {
            // Snapshot before adding
            onSnapshot?.(nodes, edges);

            const normalizedType = normalizeWorkflowNodeType(nodeType);
            const typeConfig = getNodeTypeConfig(normalizedType);
            const nodeId = `${normalizedType}_${Date.now()}`;
            const defaultConfig = { ...(typeConfig?.defaultConfig ?? {}) };

            const newNode: Node = {
                id: nodeId,
                type: normalizedType === 'group' ? 'group' : 'workflowNode',
                position,
                data: {
                    type: normalizedType,
                    name: preset?.name ?? typeConfig?.label ?? normalizedType,
                    enabled: preset?.enabled ?? true,
                    config: {
                        ...defaultConfig,
                        ...(preset?.config ?? {}),
                    },
                    runtimePolicy: preset?.runtimePolicy,
                    inputBindings: preset?.inputBindings,
                    outputSchema: preset?.outputSchema,
                    nodeTypeConfig: typeConfig,
                },
            };

            setNodes((nds) => [...nds, newNode]);
            return nodeId;
        },
        [setNodes, nodes, edges, onSnapshot],
    );

    const removeNode = useCallback(
        (nodeId: string) => {
            onSnapshot?.(nodes, edges);
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        },
        [setNodes, setEdges, nodes, edges, onSnapshot],
    );

    const onNodesDelete = useCallback(
        (deleted: Node[]) => {
            // Optional: Handle side effects here
        },
        [],
    );

    const updateNodeData = useCallback(
        (nodeId: string, data: Partial<Record<string, unknown>>) => {
            // Snapshot? Note: this might be called frequently if typing in input.
            // Ideally snapshot only on blur or distinct action. 
            // For now, let's NOT snapshot on generic data update to avoid spam, 
            // or rely on component to trigger snapshot on blur? 
            // Actually, PropertyPanel calls this. 
            // We should expose a separate 'snapshot' method or let caller handle it?
            // Let's assume caller (PropertyPanel) might want to trigger snapshot.
            // But here we are inside the hook.
            // Let's add a `skipSnapshot` optional arg? Or just leave it for now and handle in PropertyPanel?
            setNodes((nds) =>
                nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
            );
        },
        [setNodes],
    );

    const updateEdgeData = useCallback(
        (edgeId: string, data: Partial<Record<string, unknown>> & { type?: string }) => {
            setEdges((eds) =>
                eds.map((edge) => {
                    if (edge.id !== edgeId) return edge;

                    const newData = { ...edge.data, ...data };
                    const edgeType = (newData.edgeType as string);

                    return {
                        ...edge,
                        type: data.type ?? edge.type,
                        style: getEdgeStyle(edgeType),
                        animated: edgeType === 'data-edge',
                        data: newData,
                    };
                }),
            );
        },
        [setEdges],
    );

    const exportDsl = useCallback((): WorkflowDsl => {
        return flowToDsl(nodes, edges, dslRef.current);
    }, [nodes, edges]);

    const loadDsl = useCallback(
        (dsl: WorkflowDsl) => {
            dslRef.current = dsl;
            setNodes(dslNodesToFlow(dsl.nodes));
            setEdges(dslEdgesToFlow(dsl.edges));
        },
        [setNodes, setEdges],
    );

    const importDsl = loadDsl;

    return {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        removeNode,
        updateNodeData,
        updateEdgeData,
        exportDsl,
        loadDsl,
        importDsl,
        setNodes,
        setEdges,
        syncToDsl,
        onNodesDelete,
    };
};

function dslNodesToFlow(dslNodes: WorkflowNode[]): Node[] {
    const nodes = dslNodes.map((n, idx) => {
        const normalizedType = normalizeWorkflowNodeType(n.type);
        const typeConfig = getNodeTypeConfig(normalizedType);
        const config = n.config as Record<string, unknown>;

        return {
            id: n.id,
            type: normalizedType === 'group' ? 'group' : 'workflowNode',
            position: (config._position as { x: number; y: number }) ?? {
                x: 250,
                y: 100 + idx * 120,
            },
            data: {
                type: normalizedType,
                name: n.name,
                enabled: n.enabled,
                config: n.config,
                runtimePolicy: n.runtimePolicy,
                inputBindings: n.inputBindings,
                outputSchema: n.outputSchema,
                nodeTypeConfig: typeConfig,
            },
            parentId: (config.parentId as string) || undefined,
            extent: (config.extent as 'parent' | undefined),
        };
    });

    return nodes.sort((a, b) => {
        if (a.type === 'group' && b.type !== 'group') return -1;
        if (a.type !== 'group' && b.type === 'group') return 1;
        return 0;
    });
}

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

function flowToDsl(nodes: Node[], edges: Edge[], originalDsl: WorkflowDsl): WorkflowDsl {
    const dslNodes: WorkflowNode[] = nodes.map((n) => ({
        id: n.id,
        type: normalizeWorkflowNodeType(n.data.type as string),
        name: n.data.name as string,
        enabled: (n.data.enabled as boolean) ?? true,
        config: {
            ...(n.data.config as Record<string, unknown>),
            _position: n.position,
            parentId: n.parentId,
            extent: n.extent,
        },
        runtimePolicy: n.data.runtimePolicy as Record<string, unknown> | undefined,
        inputBindings: n.data.inputBindings as Record<string, unknown> | undefined,
        outputSchema: n.data.outputSchema as string | Record<string, unknown> | undefined,
    }));

    const dslEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        edgeType: (e.data?.edgeType as WorkflowEdge['edgeType']) ?? 'data-edge',
        condition: (e.data?.condition as string) ?? null,
    }));

    return {
        ...originalDsl,
        nodes: dslNodes,
        edges: dslEdges,
    };
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
