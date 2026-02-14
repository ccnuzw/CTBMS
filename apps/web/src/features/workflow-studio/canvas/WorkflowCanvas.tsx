import React, { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    type NodeTypes,
    type Node,
    useReactFlow,
    SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, message, theme } from 'antd';
import {
    canonicalizeWorkflowDsl,
    normalizeWorkflowModeValue,
    toWorkflowModeUi,
    type WorkflowDsl,
    type WorkflowValidationResult,
} from '@packages/types';
import { WorkflowNodeComponent } from './WorkflowNodeComponent';
import { GroupNode } from './GroupNode';
import { NodePalette } from './NodePalette';
import { CanvasToolbar } from './CanvasToolbar';
import { PropertyPanel } from './PropertyPanel';
import { RunLogPanel } from './RunLogPanel';
import { DebateTimelinePanel } from './DebateTimelinePanel';
import { useDslSync } from './useDslSync';
import { validateGraph } from './graphValidation';
import { useUndoRedo } from './useUndoRedo';
import { useCopyPaste } from './useCopyPaste';
import { useAutoLayout } from './useAutoLayout';
import { useCanvasAlignment } from './useCanvasAlignment';
import { NodeContextMenu } from './NodeContextMenu';
import { SaveTemplateModal } from './SaveTemplateModal';
import { listNodeTemplates, saveNodeTemplate } from './nodeTemplateStore';
import { SmartLinkMenu } from './SmartLinkMenu';
import { CanvasErrorList, type ValidationError } from './CanvasErrorList';

interface WorkflowCanvasProps {
    initialDsl?: WorkflowDsl;
    onSave?: (dsl: WorkflowDsl) => void | Promise<void>;
    onValidate?: (
        dsl: WorkflowDsl,
        stage?: 'SAVE' | 'PUBLISH',
    ) => Promise<WorkflowValidationResult | undefined>;
    isReadOnly?: boolean;
    onRun?: (dsl: WorkflowDsl) => Promise<string | undefined>;
    currentVersionId?: string;
    currentDefinitionId?: string;
}

const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = ({
    initialDsl,
    onSave,
    onValidate,
    isReadOnly = false,
    onRun,
    currentVersionId,
    currentDefinitionId,
}) => {
    const { token } = theme.useToken();
    const reactFlow = useReactFlow();
    const canvasRef = useRef<HTMLDivElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [showLogPanel, setShowLogPanel] = useState(false);
    const [showDebatePanel, setShowDebatePanel] = useState(false);
    const [logPanelHeight, setLogPanelHeight] = useState(300);
    const [debatePanelHeight, setDebatePanelHeight] = useState(400);
    const [executionId, setExecutionId] = useState<string | undefined>();
    const [selectionMode, setSelectionMode] = useState<'hand' | 'pointer'>('hand');
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [workflowMode, setWorkflowMode] = useState<'linear' | 'dag' | 'debate'>(
        toWorkflowModeUi(initialDsl?.mode ?? 'DAG'),
    );
    const [menuState, setMenuState] = useState<{ id: string; top: number; left: number } | null>(null);
    const [smartLinkMenu, setSmartLinkMenu] = useState<{
        top: number;
        left: number;
        sourceNodeId: string;
        sourceHandleId?: string | null;
    } | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set());
    const connectingNodeId = useRef<string | null>(null);
    const connectingHandleId = useRef<string | null>(null);

    const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();

    const defaultDsl: WorkflowDsl = useMemo(
        () => ({
            workflowId: 'new',
            name: 'New Workflow',
            version: '1.0.0',
            mode: 'DAG',
            status: 'DRAFT',
            usageMethod: 'ON_DEMAND',
            nodes: [],
            edges: [],
        }),
        [],
    );

    React.useEffect(() => {
        if (initialDsl?.mode) {
            setWorkflowMode(toWorkflowModeUi(initialDsl.mode));
        }
    }, [initialDsl?.mode]);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        updateNodeData,
        updateEdgeData,
        exportDsl,
        setNodes,
        setEdges,
    } = useDslSync(initialDsl || defaultDsl, undefined, takeSnapshot);

    useCopyPaste(nodes, edges, setNodes, setEdges, () => takeSnapshot(nodes, edges));

    const { onLayout } = useAutoLayout();
    const { alignNodes } = useCanvasAlignment();

    const nodeTypes: NodeTypes = useMemo(
        () => ({
            workflowNode: WorkflowNodeComponent,
            group: GroupNode,
        }),
        [],
    );

    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );

    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
        [edges, selectedEdgeId],
    );

    const buildCurrentDsl = useCallback((): WorkflowDsl => {
        const dsl = exportDsl();
        const positionMap = new Map(reactFlow.getNodes().map((node) => [node.id, node.position] as const));

        return canonicalizeWorkflowDsl({
            ...dsl,
            mode: normalizeWorkflowModeValue(workflowMode),
            nodes: dsl.nodes.map((node) => ({
                ...node,
                config: {
                    ...(node.config ?? {}),
                    _position:
                        positionMap.get(node.id)
                        ?? (node.config as Record<string, unknown> | undefined)?._position,
                },
            })),
        });
    }, [exportDsl, reactFlow, workflowMode]);

    const runValidation = useCallback(
        async (dsl: WorkflowDsl): Promise<ValidationError[]> => {
            if (onValidate) {
                const remoteResult = await onValidate(dsl, 'SAVE');
                if (remoteResult) {
                    return remoteResult.issues
                        .filter((issue) => issue.severity === 'ERROR')
                        .map((issue) => ({
                            message: `${issue.code}: ${issue.message}`,
                            nodeId: issue.nodeId,
                            edgeId: issue.edgeId,
                            severity: 'ERROR',
                        }));
                }
            }

            const fallback = validateGraph(nodes, edges, workflowMode);
            return fallback.errors;
        },
        [onValidate, nodes, edges, workflowMode],
    );

    React.useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            try {
                const dsl = buildCurrentDsl();
                const errors = await runValidation(dsl);
                if (active) {
                    setValidationErrors(errors);
                }
            } catch {
                if (active) {
                    setValidationErrors([{ message: '校验服务异常，请稍后重试', severity: 'ERROR' }]);
                }
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [nodes, edges, workflowMode, buildCurrentDsl, runValidation]);

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
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
            if (!nodeType) {
                return;
            }

            const newNodeId = addNode(nodeType, position);
            setSelectedNodeId(newNodeId);
            setSelectedEdgeId(null);
        },
        [reactFlow, addNode],
    );

    const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
    }, []);

    const handleEdgeClick = useCallback((_: React.MouseEvent, edge: { id: string }) => {
        setSelectedEdgeId(edge.id);
        setSelectedNodeId(null);
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setMenuState(null);
        setSmartLinkMenu(null);
    }, []);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        const pane = canvasRef.current?.getBoundingClientRect();
        setMenuState({
            id: node.id,
            top: event.clientY - (pane?.top || 0),
            left: event.clientX - (pane?.left || 0),
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (!onSave) {
            return;
        }

        setIsSaving(true);
        try {
            const dsl = buildCurrentDsl();
            const errors = await runValidation(dsl);
            if (errors.length > 0) {
                setValidationErrors(errors);
                message.error('保存失败：请先修复校验问题');
                return;
            }
            await onSave(dsl);
            message.success('保存成功');
        } catch {
            message.error('保存失败');
        } finally {
            setIsSaving(false);
        }
    }, [onSave, buildCurrentDsl, runValidation]);

    const handleExportDsl = useCallback(() => {
        const dsl = buildCurrentDsl();
        const blob = new Blob([JSON.stringify(dsl, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow-dsl-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        message.success('DSL 已导出');
    }, [buildCurrentDsl]);

    const handleClearCanvas = useCallback(() => {
        takeSnapshot(nodes, edges);
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [takeSnapshot, nodes, edges, setNodes, setEdges]);

    // Keyboard shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    const handleRun = useCallback(async () => {
        if (!onRun) {
            setShowLogPanel(true);
            return;
        }

        try {
            const dsl = buildCurrentDsl();
            const errors = await runValidation(dsl);
            if (errors.length > 0) {
                setValidationErrors(errors);
                message.error('运行失败：请先修复校验问题');
                return;
            }
            const id = await onRun(dsl);
            if (id) {
                setExecutionId(id);
            }
            setShowLogPanel(true);
            if (workflowMode === 'debate') {
                setShowDebatePanel(true);
            }
        } catch {
            message.error('运行失败');
        }
    }, [onRun, buildCurrentDsl, runValidation, workflowMode]);



    const onConnectStart = useCallback(
        (_: any, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
            connectingNodeId.current = nodeId;
            connectingHandleId.current = handleId;
        },
        [],
    );

    const onConnectEnd = useCallback(
        (event: any) => {
            if (!connectingNodeId.current) {
                return;
            }

            const targetIsPane = event.target.classList.contains('react-flow__pane');
            if (targetIsPane) {
                const { top, left } = canvasRef.current?.getBoundingClientRect() ?? { top: 0, left: 0 };
                const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
                const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;

                setSmartLinkMenu({
                    top: clientY - top,
                    left: clientX - left,
                    sourceNodeId: connectingNodeId.current,
                    sourceHandleId: connectingHandleId.current,
                });
            }
            connectingNodeId.current = null;
            connectingHandleId.current = null;
        },
        [],
    );

    const handleSmartLinkSelect = useCallback(
        (nodeType: string) => {
            if (!smartLinkMenu) {
                return;
            }

            const { top, left, sourceNodeId, sourceHandleId } = smartLinkMenu;
            const position = reactFlow.screenToFlowPosition({
                x: left + (canvasRef.current?.getBoundingClientRect().left ?? 0),
                y: top + (canvasRef.current?.getBoundingClientRect().top ?? 0),
            });

            // Add new node
            const newNodeId = addNode(nodeType, position);

            // Connect source to new node
            // Assuming default handles for now, or letting onConnect handle logic if we triggered it
            // But here we manually create edge
            const sourceNode = nodes.find((n) => n.id === sourceNodeId);
            if (sourceNode && newNodeId) {
                const newEdge = {
                    id: `e_${sourceNodeId}_${newNodeId}_${Date.now()}`,
                    source: sourceNodeId,
                    target: newNodeId,
                    sourceHandle: sourceHandleId,
                    type: 'default', // or smoothstep based on preference
                };
                // We need to use onConnect or setEdges to add the edge.
                // onConnect is usually for Connection object.
                // Let's manually add edge
                setEdges((eds) => [...eds, newEdge]);
            }

            setSmartLinkMenu(null);
            setSelectedNodeId(newNodeId);
        },
        [smartLinkMenu, reactFlow, addNode, nodes, setEdges],
    );

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
                            ? {
                                ...item,
                                position: newPosition,
                                parentId: groupNode.id,
                                extent: 'parent',
                            }
                            : item,
                    ),
                );
                return;
            }

            if (!groupNode && node.parentId) {
                const parent = nodes.find((item) => item.id === node.parentId);
                if (!parent) {
                    return;
                }
                const absolutePosition = {
                    x: node.position.x + parent.position.x,
                    y: node.position.y + parent.position.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? {
                                ...item,
                                position: absolutePosition,
                                parentId: undefined,
                                extent: undefined,
                            }
                            : item,
                    ),
                );
            }
        },
        [reactFlow, setNodes, nodes],
    );

    const handleContextCopy = useCallback(() => {
        if (!menuState) {
            return;
        }
        const source = nodes.find((node) => node.id === menuState.id);
        if (!source) {
            return;
        }

        takeSnapshot(nodes, edges);
        const duplicatedNodeId = `${source.data.type}_${Date.now()}`;
        const duplicatedData = JSON.parse(JSON.stringify(source.data)) as Node['data'];

        setNodes((items) => [
            ...items.map((item) => ({ ...item, selected: false })),
            {
                ...source,
                id: duplicatedNodeId,
                position: {
                    x: source.position.x + 48,
                    y: source.position.y + 48,
                },
                data: duplicatedData,
                selected: true,
            },
        ]);

        setSelectedNodeId(duplicatedNodeId);
        setSelectedEdgeId(null);
        message.success('节点已复制');
    }, [menuState, nodes, edges, setNodes, takeSnapshot]);

    const handleContextDelete = useCallback(() => {
        if (!menuState) {
            return;
        }
        takeSnapshot(nodes, edges);
        setNodes((items) => items.filter((item) => item.id !== menuState.id));
        setEdges((items) =>
            items.filter((item) => item.source !== menuState.id && item.target !== menuState.id),
        );
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [menuState, nodes, edges, takeSnapshot, setNodes, setEdges]);

    const handleContextSaveTemplate = useCallback(() => {
        if (!menuState) {
            return;
        }
        const node = nodes.find((item) => item.id === menuState.id);
        if (!node) {
            return;
        }
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

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {!isReadOnly && <NodePalette />}

            <div
                ref={canvasRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: token.colorBgLayout,
                    position: 'relative',
                }}
            >
                {!isReadOnly && (
                    <CanvasToolbar
                        onSave={handleSave}
                        onExportDsl={handleExportDsl}
                        onClearCanvas={handleClearCanvas}
                        isSaving={isSaving}
                        onRun={handleRun}
                        onToggleLogs={() => setShowLogPanel((value) => !value)}
                        selectionMode={selectionMode}
                        onSelectionModeChange={setSelectionMode}
                        workflowMode={workflowMode}
                        onWorkflowModeChange={setWorkflowMode}
                        onUndo={() => undo(nodes, edges, setNodes, setEdges)}
                        onRedo={() => redo(nodes, edges, setNodes, setEdges)}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onAutoLayout={() => onLayout('LR')}
                        onToggleDebatePanel={() => setShowDebatePanel((value) => !value)}
                        snapToGrid={snapToGrid}
                        onToggleSnapToGrid={() => setSnapToGrid((value) => !value)}
                        onAlign={alignNodes}
                        onPublish={currentVersionId ? () => setIsTemplateModalOpen(true) : undefined}
                    />
                )}

                <div
                    style={{ flex: 1, position: 'relative' }}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {validationErrors.length > 0 && (
                        <CanvasErrorList
                            errors={validationErrors}
                            onFocusNode={(nodeId) => {
                                const node = nodes.find(n => n.id === nodeId);
                                if (node) {
                                    setSelectedNodeId(nodeId);
                                    reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
                                }
                            }}
                            onFocusEdge={(edgeId) => {
                                const edge = edges.find(e => e.id === edgeId);
                                if (edge) {
                                    setSelectedEdgeId(edgeId);
                                    // ReactFlow doesn't support fitView for edges directly but we can fit the source/target
                                    const source = nodes.find(n => n.id === edge.source);
                                    const target = nodes.find(n => n.id === edge.target);
                                    if (source && target) {
                                        reactFlow.fitView({ nodes: [{ id: source.id }, { id: target.id }], duration: 800, padding: 0.5 });
                                    }
                                }
                            }}
                        />
                    )}

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={isReadOnly ? undefined : onNodesChange}
                        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
                        onConnect={isReadOnly ? undefined : onConnect}
                        onNodeClick={handleNodeClick}
                        onEdgeClick={handleEdgeClick}
                        onPaneClick={handlePaneClick}
                        onNodeContextMenu={isReadOnly ? undefined : onNodeContextMenu}
                        onNodeDragStop={isReadOnly ? undefined : handleNodeDragStop}
                        onConnectStart={isReadOnly ? undefined : onConnectStart}
                        onConnectEnd={isReadOnly ? undefined : onConnectEnd}
                        nodeTypes={nodeTypes}
                        fitView
                        snapToGrid={snapToGrid}
                        snapGrid={[16, 16]}
                        deleteKeyCode={isReadOnly ? null : 'Delete'}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { strokeWidth: 2 },
                        }}
                        proOptions={{ hideAttribution: true }}
                        panOnDrag={selectionMode === 'hand'}
                        selectionOnDrag={selectionMode === 'pointer'}
                        selectionMode={selectionMode === 'pointer' ? SelectionMode.Partial : undefined}
                    >
                        <Background gap={16} size={1} color={token.colorBorderSecondary} />
                        <Controls showInteractive={!isReadOnly} />
                        <MiniMap
                            nodeStrokeWidth={3}
                            style={{
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                            maskColor={`${token.colorBgLayout}80`}
                        />
                    </ReactFlow>
                </div>

                {showLogPanel ? (
                    <RunLogPanel
                        executionId={executionId}
                        height={logPanelHeight}
                        onHeightChange={setLogPanelHeight}
                        onClose={() => setShowLogPanel(false)}
                        onLogClick={(nodeId) => {
                            setSelectedNodeId(nodeId);
                            reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
                        }}
                    />
                ) : null}

                {showDebatePanel ? (
                    <div
                        style={{
                            position: 'absolute',
                            top: 60,
                            right: 320,
                            bottom: showLogPanel ? logPanelHeight : 0,
                            width: 350,
                            zIndex: 90,
                            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        <DebateTimelinePanel
                            executionId={executionId}
                            height={debatePanelHeight}
                            onHeightChange={setDebatePanelHeight}
                            onClose={() => setShowDebatePanel(false)}
                        />
                    </div>
                ) : null}
            </div>

            {!isReadOnly && (selectedNode || selectedEdge) ? (
                <PropertyPanel
                    selectedNode={selectedNode}
                    selectedEdge={selectedEdge}
                    onUpdateNode={updateNodeData}
                    onUpdateEdge={updateEdgeData}
                    onClose={() => {
                        setSelectedNodeId(null);
                        setSelectedEdgeId(null);
                    }}
                />
            ) : null}

            {menuState ? (
                <NodeContextMenu
                    id={menuState.id}
                    top={menuState.top}
                    left={menuState.left}
                    onCopy={handleContextCopy}
                    onDelete={handleContextDelete}
                    onSaveTemplate={handleContextSaveTemplate}
                    onToggleEnable={handleContextToggleEnable}
                    isEnabled={(nodes.find((n) => n.id === menuState.id)?.data.enabled as boolean) ?? true}
                    onToggleBreakpoint={() => {
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
                    }}
                    hasBreakpoint={menuState ? breakpoints.has(menuState.id) : false}
                    onClose={() => setMenuState(null)}
                />
            ) : null}

            {currentVersionId ? (
                <SaveTemplateModal
                    open={isTemplateModalOpen}
                    onClose={() => setIsTemplateModalOpen(false)}
                    sourceVersionId={currentVersionId}
                    sourceWorkflowDefinitionId={currentDefinitionId}
                    initialName={initialDsl?.name}
                    initialCode={initialDsl?.workflowId !== 'new' ? initialDsl?.workflowId : undefined}
                />
            ) : null}

            {smartLinkMenu && !isReadOnly ? (
                <SmartLinkMenu
                    top={smartLinkMenu.top}
                    left={smartLinkMenu.left}
                    sourceNodeType={nodes.find((n) => n.id === smartLinkMenu.sourceNodeId)?.type ?? ''}
                    onSelect={handleSmartLinkSelect}
                    onClose={() => setSmartLinkMenu(null)}
                />
            ) : null}
        </div>
    );
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner {...props} />
        </ReactFlowProvider>
    );
};
