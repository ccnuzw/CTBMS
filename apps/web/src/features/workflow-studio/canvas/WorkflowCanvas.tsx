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
import { message, theme, Alert } from 'antd';
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

interface WorkflowCanvasProps {
    /** 初始 DSL */
    initialDsl?: WorkflowDsl;
    /** 保存回调 */
    onSave?: (dsl: WorkflowDsl) => void | Promise<void>;
    /** 保存前校验回调（优先使用服务端校验） */
    onValidate?: (
        dsl: WorkflowDsl,
        stage?: 'SAVE' | 'PUBLISH',
    ) => Promise<WorkflowValidationResult | undefined>;
    /** 是否只读 */
    isReadOnly?: boolean;
    /** 触发运行回调 (返回 executionId) */
    onRun?: (dsl: WorkflowDsl) => Promise<string | undefined>;
}

/**
 * 工作流画布内部组件
 */
const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = ({
    initialDsl,
    onSave,
    onValidate,
    isReadOnly = false,
    onRun,
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
    const [workflowMode, setWorkflowMode] = useState<'linear' | 'dag' | 'debate'>(
        toWorkflowModeUi(initialDsl?.mode ?? 'DAG'),
    );
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    // Undo/Redo
    const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();



    // Default DSL if none provided
    const defaultDsl: WorkflowDsl = useMemo(() => ({
        workflowId: 'new',
        name: 'New Workflow',
        version: '1.0.0',
        mode: 'DAG',
        status: 'DRAFT',
        usageMethod: 'ON_DEMAND',
        nodes: [],
        edges: [],
    }), []);

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

    // Copy/Paste
    useCopyPaste(nodes, edges, setNodes, setEdges, () => takeSnapshot(nodes, edges));

    // Auto Layout & Alignment
    const { onLayout } = useAutoLayout();
    const { alignNodes } = useCanvasAlignment();

    const nodeTypes: NodeTypes = useMemo(
        () => ({
            workflowNode: WorkflowNodeComponent,
            group: GroupNode
        }),
        [],
    );

    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );

    const selectedEdge = useMemo(
        () => edges.find((e) => e.id === selectedEdgeId) ?? null,
        [edges, selectedEdgeId],
    );

    const buildCurrentDsl = useCallback((): WorkflowDsl => {
        const dsl = exportDsl();
        const positionMap = new Map(
            reactFlow.getNodes().map((node) => [node.id, node.position] as const),
        );

        return canonicalizeWorkflowDsl({
            ...dsl,
            mode: normalizeWorkflowModeValue(workflowMode),
            nodes: dsl.nodes.map((node) => ({
                ...node,
                config: {
                    ...(node.config ?? {}),
                    _position: positionMap.get(node.id) ?? (node.config as Record<string, unknown>)?._position,
                },
            })),
        });
    }, [exportDsl, reactFlow, workflowMode]);

    const runValidation = useCallback(
        async (dsl: WorkflowDsl): Promise<string[]> => {
            if (onValidate) {
                const remoteResult = await onValidate(dsl, 'SAVE');
                if (remoteResult) {
                    return remoteResult.issues
                        .filter((issue) => issue.severity === 'ERROR')
                        .map((issue) =>
                            issue.nodeId || issue.edgeId
                                ? `${issue.code}: ${issue.message} (${issue.nodeId ?? issue.edgeId})`
                                : `${issue.code}: ${issue.message}`,
                        );
                }
            }

            const fallback = validateGraph(nodes, edges, workflowMode);
            return fallback.errors;
        },
        [onValidate, workflowMode, nodes, edges],
    );

    // ── 验证逻辑（优先服务端） ──
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
                    setValidationErrors(['校验服务异常，请稍后重试']);
                }
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [nodes, edges, workflowMode, buildCurrentDsl, runValidation]);

    // ── 拖拽放置 ──

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const nodeType = event.dataTransfer.getData('application/workflow-node-type');
            if (!nodeType) return;

            const position = reactFlow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNodeId = addNode(nodeType, position);
            setSelectedNodeId(newNodeId);
            setSelectedEdgeId(null);
        },
        [reactFlow, addNode],
    );

    // ── 节点选中 ──

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: { id: string }) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
        },
        [],
    );

    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, []);

    const handleEdgeClick = useCallback(
        (_: React.MouseEvent, edge: { id: string }) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
        },
        [],
    );

    // ── 保存 ──

    const handleSave = useCallback(async () => {
        if (!onSave) return;
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

    // ── 导出 DSL ──

    const handleExportDsl = useCallback(() => {
        const dsl = buildCurrentDsl();
        const blob = new Blob([JSON.stringify(dsl, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-dsl-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('DSL 已导出');
    }, [buildCurrentDsl]);

    // ── 清空画布 ──

    const handleClearCanvas = useCallback(() => {
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
    }, [setNodes, setEdges]);

    const handleRun = useCallback(async () => {
        if (onRun) {
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
                    setShowLogPanel(true);
                    if (workflowMode === 'debate') {
                        setShowDebatePanel(true);
                    }
                }
            } catch (error) {
                console.error('Run failed:', error);
            }
        } else {
            message.info('开始调试运行...');
            setShowLogPanel(true);
        }
    }, [onRun, buildCurrentDsl, workflowMode, runValidation]);

    const handleToggleLogs = useCallback(() => {
        setShowLogPanel((v) => !v);
    }, []);

    // ── 拖拽结束处理 (分组嵌套逻辑) ──
    const onNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            // Find intersecting group nodes
            const intersections = reactFlow.getIntersectingNodes(node).filter((n) => n.type === 'group');
            const groupNode = intersections[intersections.length - 1]; // Use the last one (topmost?)

            // Case 1: Node Dropped INTO a Group
            if (groupNode && node.parentId !== groupNode.id) {
                // Calculate relative position
                // Note: reactFlow.getNode(groupNode.id) might be safer to ensure fresh position
                const parentPos = groupNode.position;
                // Using pure math for now, implicitly assuming single level nesting or flattened absolute positions?
                // Actually React Flow nodes have absolute position in 'position' ONLY if no parent.
                // If it has parent, it is relative.
                // We need the *absolute* position of the node and the group to calculate new relative.
                // node.position is current local position.

                // Helper to get absolute position
                const getAbsolutePosition = (n: Node): { x: number; y: number } => {
                    if (!n.parentId) return n.position;
                    const parent = nodes.find(p => p.id === n.parentId);
                    if (!parent) return n.position;
                    const parentAbs = getAbsolutePosition(parent);
                    return { x: n.position.x + parentAbs.x, y: n.position.y + parentAbs.y };
                };

                const nodeAbs = getAbsolutePosition(node);
                const groupAbs = getAbsolutePosition(groupNode);

                const newRelativePos = {
                    x: nodeAbs.x - groupAbs.x,
                    y: nodeAbs.y - groupAbs.y,
                };

                updateNodeData(node.id, {
                    // Update internal data if needed (dsl sync handles parentId prop change via onNodesChange? No, explicit update needed)
                });

                // We need to update the node object itself (parentId, extent, position)
                setNodes((nds) =>
                    nds.map((n) => {
                        if (n.id === node.id) {
                            return {
                                ...n,
                                position: newRelativePos,
                                parentId: groupNode.id,
                                extent: 'parent',
                            };
                        }
                        return n;
                    })
                );
                message.success(`已加入分组: ${groupNode.data.name || 'Group'}`);
            }

            // Case 2: Node Dragged OUT of a Group (and not into another)
            else if (!groupNode && node.parentId) {
                // Convert relative to absolute
                const getAbsolutePosition = (n: Node): { x: number; y: number } => {
                    // Current node is relative to its CURRENT parent
                    const parent = nodes.find(p => p.id === n.parentId);
                    // Recursive or just single lookup? ReactFlow doesn't fully expose recursive getAbsolute currently without helper
                    // Assuming single level for MVP or recursive look up
                    if (!parent) return n.position;
                    // We need parent's absolute position.
                    // A cleaner way is using node.computed?.position if available? not in simple Node interface
                    // Let's rely on stored node state lookup
                    let x = n.position.x;
                    let y = n.position.y;
                    let currentParentId = n.parentId;

                    while (currentParentId) {
                        const parent = nodes.find(p => p.id === currentParentId);
                        if (!parent) break;
                        x += parent.position.x;
                        y += parent.position.y;
                        currentParentId = parent.parentId;
                    }
                    return { x, y };
                };

                const newAbs = getAbsolutePosition(node);

                setNodes((nds) =>
                    nds.map((n) => {
                        if (n.id === node.id) {
                            const { parentId, extent, ...rest } = n;
                            return {
                                ...rest,
                                position: newAbs,
                                parentId: undefined,
                                extent: undefined,
                            };
                        }
                        return n;
                    })
                );
            }
        },
        [reactFlow, nodes, setNodes]
    );

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* 左侧节点面板 */}
            {!isReadOnly && <NodePalette />}

            {/* 中心画布 */}
            <div
                ref={canvasRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: token.colorBgLayout,
                }}
            >
                {!isReadOnly && (
                    <CanvasToolbar
                        onSave={handleSave}
                        onExportDsl={handleExportDsl}
                        onClearCanvas={handleClearCanvas}
                        isSaving={isSaving}
                        onRun={handleRun}
                        onToggleLogs={handleToggleLogs}
                        selectionMode={selectionMode}
                        onSelectionModeChange={setSelectionMode}
                        workflowMode={workflowMode}
                        onWorkflowModeChange={(mode) => {
                            setWorkflowMode(mode);
                            // TODO: Trigger validation when mode changes
                        }}
                        onUndo={() => undo(nodes, edges, setNodes, setEdges)}
                        onRedo={() => redo(nodes, edges, setNodes, setEdges)}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onAutoLayout={() => onLayout('LR')}
                        onToggleDebatePanel={() => setShowDebatePanel((v) => !v)}
                        snapToGrid={snapToGrid}
                        onToggleSnapToGrid={() => setSnapToGrid((v) => !v)}
                        onAlign={alignNodes}
                    />
                )}

                <div
                    style={{ flex: 1, position: 'relative' }}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {validationErrors.length > 0 && (
                        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, maxWidth: 300 }}>
                            <Alert
                                message="工作流校验未通过"
                                description={
                                    <ul style={{ paddingLeft: 20, margin: 0 }}>
                                        {validationErrors.map((err, idx) => (
                                            <li key={idx}>{err}</li>
                                        ))}
                                    </ul>
                                }
                                type="warning"
                                showIcon
                                closable
                            />
                        </div>
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
                        onNodeDragStop={isReadOnly ? undefined : onNodeDragStop}
                        nodeTypes={nodeTypes}
                        fitView
                        snapToGrid
                        snapGrid={[16, 16]}
                        deleteKeyCode={isReadOnly ? null : 'Delete'}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { strokeWidth: 2 },
                        }}
                        proOptions={{ hideAttribution: true }}
                        // Selection Mode Support
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

                {/* 底部运行日志面板 */}
                {showLogPanel && (
                    <RunLogPanel
                        executionId={executionId}
                        height={logPanelHeight}
                        onHeightChange={setLogPanelHeight}
                        onClose={() => setShowLogPanel(false)}
                    />
                )}

                {/* 辩论时间线面板 */}
                {showDebatePanel && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 60, // below toolbar
                            right: 320, // left of property panel
                            bottom: showLogPanel ? logPanelHeight : 0,
                            width: 350,
                            zIndex: 90,
                            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        <DebateTimelinePanel
                            executionId={executionId}
                            height={debatePanelHeight} // Actually height here might be '100%' if it's a side panel
                            onHeightChange={setDebatePanelHeight} // Use this as width maybe? For now just keep vertical 
                            onClose={() => setShowDebatePanel(false)}
                        />
                    </div>
                )}
            </div>

            {/* 右侧属性面板 */}
            {!isReadOnly && (selectedNode || selectedEdge) && (
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
            )}
        </div>
    );
};

/**
 * 工作流可视化画布
 */
export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner {...props} />
        </ReactFlowProvider>
    );
};
