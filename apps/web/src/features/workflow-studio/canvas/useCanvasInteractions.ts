import { useCallback, useRef, useState } from 'react';
import { useReactFlow, type Node, type Edge } from '@xyflow/react';
import { message } from 'antd';
import { listNodeTemplates, saveNodeTemplate } from './nodeTemplateStore';

export interface UseCanvasInteractionsParams {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    addNode: (nodeType: string, position: { x: number; y: number }, overrides?: Record<string, unknown>) => string;
    updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    selectedEdgeId: string | null;
    setSelectedEdgeId: (id: string | null) => void;
    canvasRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 画布交互操作：拖放、右键菜单、智能连线、分组、节点聚焦
 */
export function useCanvasInteractions({
    nodes,
    edges,
    setNodes,
    setEdges,
    addNode,
    updateNodeData,
    takeSnapshot,
    setSelectedNodeId,
    setSelectedEdgeId,
    canvasRef,
}: UseCanvasInteractionsParams) {
    const reactFlow = useReactFlow();
    const connectingNodeId = useRef<string | null>(null);
    const connectingHandleId = useRef<string | null>(null);

    const [menuState, setMenuState] = useState<{ id: string; top: number; left: number } | null>(null);
    const [smartLinkMenu, setSmartLinkMenu] = useState<{
        top: number;
        left: number;
        sourceNodeId: string;
        sourceHandleId?: string | null;
    } | null>(null);
    const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set());

    // ── Drag & Drop ──

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();

            const position = reactFlow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const templateId = event.dataTransfer.getData('application/workflow-node-template-id');
            if (templateId) {
                const template = listNodeTemplates().find((item) => item.id === templateId);
                if (!template) {
                    message.error('模板不存在或已删除');
                    return;
                }
                const newNodeId = addNode(template.nodeType, position, {
                    name: template.data.name,
                    enabled: template.data.enabled,
                    config: template.data.config,
                    runtimePolicy: template.data.runtimePolicy,
                    inputBindings: template.data.inputBindings,
                    outputSchema: template.data.outputSchema,
                });
                setSelectedNodeId(newNodeId);
                setSelectedEdgeId(null);
                return;
            }

            const nodeType = event.dataTransfer.getData('application/workflow-node-type');
            if (!nodeType) return;

            const newNodeId = addNode(nodeType, position);
            setSelectedNodeId(newNodeId);
            setSelectedEdgeId(null);
        },
        [reactFlow, addNode, setSelectedNodeId, setSelectedEdgeId],
    );

    // ── Click Handlers ──

    const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);

    const handleEdgeClick = useCallback((_: React.MouseEvent, edge: { id: string }) => {
        setSelectedEdgeId(edge.id);
        setSelectedNodeId(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);

    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setMenuState(null);
        setSmartLinkMenu(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);

    // ── Context Menu ──

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        const pane = canvasRef.current?.getBoundingClientRect();
        setMenuState({
            id: node.id,
            top: event.clientY - (pane?.top || 0),
            left: event.clientX - (pane?.left || 0),
        });
    }, [canvasRef]);

    // ── Connect Handlers (Smart Link) ──

    const onConnectStart = useCallback(
        (_: unknown, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
            connectingNodeId.current = nodeId;
            connectingHandleId.current = handleId;
        },
        [],
    );

    const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
        if (!connectingNodeId.current) return;
        const targetIsPane =
            event.target instanceof Element && event.target.classList.contains('react-flow__pane');

        if (targetIsPane) {
            const { top, left } = canvasRef.current?.getBoundingClientRect() ?? { top: 0, left: 0 };
            const point = 'changedTouches' in event ? event.changedTouches[0] : event;
            if (!point) return;
            setSmartLinkMenu({
                top: point.clientY - top,
                left: point.clientX - left,
                sourceNodeId: connectingNodeId.current,
                sourceHandleId: connectingHandleId.current,
            });
        }
        connectingNodeId.current = null;
        connectingHandleId.current = null;
    }, [canvasRef]);

    const handleSmartLinkSelect = useCallback(
        (nodeType: string) => {
            if (!smartLinkMenu) return;
            const { top, left, sourceNodeId, sourceHandleId } = smartLinkMenu;
            const position = reactFlow.screenToFlowPosition({
                x: left + (canvasRef.current?.getBoundingClientRect().left ?? 0),
                y: top + (canvasRef.current?.getBoundingClientRect().top ?? 0),
            });

            const newNodeId = addNode(nodeType, position);
            const sourceNode = nodes.find((n) => n.id === sourceNodeId);
            if (sourceNode && newNodeId) {
                const newEdge = {
                    id: `e_${sourceNodeId}_${newNodeId}_${Date.now()}`,
                    source: sourceNodeId,
                    target: newNodeId,
                    sourceHandle: sourceHandleId,
                    type: 'default',
                };
                setEdges((eds) => [...eds, newEdge]);
            }
            setSmartLinkMenu(null);
            setSelectedNodeId(newNodeId);
        },
        [smartLinkMenu, reactFlow, addNode, nodes, setEdges, canvasRef, setSelectedNodeId],
    );

    // ── Node Drag Stop (Group handling) ──

    const handleNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            const intersections = reactFlow.getIntersectingNodes(node).filter((item) => item.type === 'group');
            const groupNode = intersections.at(-1);

            if (groupNode && node.parentId !== groupNode.id) {
                const parentPos = groupNode.position;
                const newPosition = {
                    x: node.position.x - parentPos.x,
                    y: node.position.y - parentPos.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? { ...item, position: newPosition, parentId: groupNode.id, extent: 'parent' }
                            : item,
                    ),
                );
                return;
            }

            if (!groupNode && node.parentId) {
                const parent = nodes.find((item) => item.id === node.parentId);
                if (!parent) return;
                const absolutePosition = {
                    x: node.position.x + parent.position.x,
                    y: node.position.y + parent.position.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? { ...item, position: absolutePosition, parentId: undefined, extent: undefined }
                            : item,
                    ),
                );
            }
        },
        [reactFlow, setNodes, nodes],
    );

    // ── Context Actions ──

    const handleContextCopy = useCallback(() => {
        if (!menuState) return;
        const source = nodes.find((node) => node.id === menuState.id);
        if (!source) return;

        takeSnapshot(nodes, edges);
        const duplicatedNodeId = `${source.data.type}_${Date.now()}`;
        const duplicatedData = JSON.parse(JSON.stringify(source.data)) as Node['data'];

        setNodes((items) => [
            ...items.map((item) => ({ ...item, selected: false })),
            {
                ...source,
                id: duplicatedNodeId,
                position: { x: source.position.x + 48, y: source.position.y + 48 },
                data: duplicatedData,
                selected: true,
            },
        ]);

        setSelectedNodeId(duplicatedNodeId);
        setSelectedEdgeId(null);
        message.success('节点已复制');
    }, [menuState, nodes, edges, setNodes, takeSnapshot, setSelectedNodeId, setSelectedEdgeId]);

    const handleContextDelete = useCallback(() => {
        if (!menuState) return;
        takeSnapshot(nodes, edges);
        setNodes((items) => items.filter((item) => item.id !== menuState.id));
        setEdges((items) => items.filter((item) => item.source !== menuState.id && item.target !== menuState.id));
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [menuState, nodes, edges, takeSnapshot, setNodes, setEdges, setSelectedNodeId, setSelectedEdgeId]);

    const handleContextSaveTemplate = useCallback(() => {
        if (!menuState) return;
        const node = nodes.find((item) => item.id === menuState.id);
        if (!node) return;
        saveNodeTemplate({
            name: String(node.data.name ?? node.data.type ?? '未命名模板'),
            nodeType: String(node.data.type ?? ''),
            description: `来自节点 ${node.id}`,
            data: {
                type: String(node.data.type ?? ''),
                name: String(node.data.name ?? node.data.type ?? ''),
                config: (node.data.config as Record<string, unknown>) ?? {},
                runtimePolicy: node.data.runtimePolicy as Record<string, unknown> | undefined,
                inputBindings: node.data.inputBindings as Record<string, unknown> | undefined,
                outputSchema: node.data.outputSchema as string | Record<string, unknown> | undefined,
                enabled: (node.data.enabled as boolean) ?? true,
            },
        });
        message.success('节点模板已保存到本地模板库');
    }, [menuState, nodes]);

    const handleContextToggleEnable = useCallback(() => {
        if (!menuState) return;
        const node = nodes.find((n) => n.id === menuState.id);
        if (!node) return;

        const isEnabled = (node.data.enabled as boolean) ?? true;
        updateNodeData(node.id, { enabled: !isEnabled });
        message.success(isEnabled ? '节点已禁用' : '节点已启用');
        setMenuState(null);
    }, [menuState, nodes, updateNodeData]);

    const handleToggleBreakpoint = useCallback(() => {
        if (!menuState) return;
        const newBreakpoints = new Set(breakpoints);
        if (newBreakpoints.has(menuState.id)) {
            newBreakpoints.delete(menuState.id);
        } else {
            newBreakpoints.add(menuState.id);
        }
        setBreakpoints(newBreakpoints);
        updateNodeData(menuState.id, { isBreakpoint: !breakpoints.has(menuState.id) });
        message.success(newBreakpoints.has(menuState.id) ? '断点已启用' : '断点已移除');
        setMenuState(null);
    }, [menuState, breakpoints, updateNodeData]);

    // ── Focus ──

    const focusNode = useCallback((nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
        } else {
            message.warning(`节点 ${nodeId} 不在当前画布（可能已删除/跨版本）`);
        }
    }, [nodes, reactFlow, setSelectedNodeId, setSelectedEdgeId]);

    const focusEdge = useCallback((edgeId: string) => {
        const edge = edges.find((e) => e.id === edgeId);
        if (edge) {
            setSelectedEdgeId(edgeId);
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);
            if (source && target) {
                reactFlow.fitView({
                    nodes: [{ id: source.id }, { id: target.id }],
                    duration: 800,
                    padding: 0.5,
                });
            }
        } else {
            message.warning(`连线 ${edgeId} 不在当前画布（可能已删除）`);
        }
    }, [edges, nodes, reactFlow, setSelectedEdgeId]);

    const resetSelection = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);

    return {
        state: {
            menuState,
            smartLinkMenu,
            breakpoints,
        },
        setters: {
            setMenuState,
            setSmartLinkMenu,
        },
        actions: {
            handleDragOver,
            handleDrop,
            handleNodeClick,
            handleEdgeClick,
            handlePaneClick,
            onNodeContextMenu,
            onConnectStart,
            onConnectEnd,
            handleSmartLinkSelect,
            handleNodeDragStop,
            handleContextCopy,
            handleContextDelete,
            handleContextSaveTemplate,
            handleContextToggleEnable,
            handleToggleBreakpoint,
            focusNode,
            focusEdge,
            resetSelection,
        },
    };
}
