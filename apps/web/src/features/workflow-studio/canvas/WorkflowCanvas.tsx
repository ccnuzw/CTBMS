import React, { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    type NodeTypes,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { message, theme } from 'antd';
import type { WorkflowDsl } from '@packages/types';

import { WorkflowNodeComponent } from './WorkflowNodeComponent';
import { NodePalette } from './NodePalette';
import { CanvasToolbar } from './CanvasToolbar';
import { PropertyPanel } from './PropertyPanel';
import { useDslSync } from './useDslSync';
import { getNodeTypeConfig } from './nodeTypeRegistry';

interface WorkflowCanvasProps {
    /** 初始 DSL */
    initialDsl?: WorkflowDsl;
    /** 保存回调 */
    onSave?: (dsl: { nodes: WorkflowDsl['nodes']; edges: WorkflowDsl['edges'] }) => void | Promise<void>;
    /** 是否只读 */
    isReadOnly?: boolean;
}

/**
 * 工作流画布内部组件
 */
const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = ({
    initialDsl,
    onSave,
    isReadOnly = false,
}) => {
    const { token } = theme.useToken();
    const reactFlow = useReactFlow();
    const canvasRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        updateNodeData,
        exportDsl,
        setNodes,
        setEdges,
    } = useDslSync(initialDsl);

    const nodeTypes: NodeTypes = useMemo(
        () => ({ workflowNode: WorkflowNodeComponent }),
        [],
    );

    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );

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
        },
        [reactFlow, addNode],
    );

    // ── 节点选中 ──

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: { id: string }) => {
            setSelectedNodeId(node.id);
        },
        [],
    );

    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    // ── 保存 ──

    const handleSave = useCallback(async () => {
        if (!onSave) return;
        setIsSaving(true);
        try {
            // 保存前将节点位置写入 config._position
            const currentNodes = reactFlow.getNodes();
            for (const n of currentNodes) {
                updateNodeData(n.id, {
                    config: {
                        ...((n.data.config as Record<string, unknown>) ?? {}),
                        _position: { x: n.position.x, y: n.position.y },
                    },
                });
            }
            const dsl = exportDsl();
            await onSave(dsl);
            message.success('保存成功');
        } catch {
            message.error('保存失败');
        } finally {
            setIsSaving(false);
        }
    }, [onSave, exportDsl, reactFlow, updateNodeData]);

    // ── 导出 DSL ──

    const handleExportDsl = useCallback(() => {
        const dsl = exportDsl();
        const blob = new Blob([JSON.stringify(dsl, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-dsl-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('DSL 已导出');
    }, [exportDsl]);

    // ── 自动布局 ──

    const handleAutoLayout = useCallback(() => {
        setNodes((nds) => {
            const sorted = [...nds];
            return sorted.map((node, idx) => ({
                ...node,
                position: { x: 300, y: 80 + idx * 130 },
            }));
        });
        setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 300 }), 50);
    }, [setNodes, reactFlow]);

    // ── 清空画布 ──

    const handleClearCanvas = useCallback(() => {
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
    }, [setNodes, setEdges]);

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
                        onAutoLayout={handleAutoLayout}
                        onClearCanvas={handleClearCanvas}
                        isSaving={isSaving}
                    />
                )}

                <div
                    style={{ flex: 1 }}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={isReadOnly ? undefined : onNodesChange}
                        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
                        onConnect={isReadOnly ? undefined : onConnect}
                        onNodeClick={handleNodeClick}
                        onPaneClick={handlePaneClick}
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
            </div>

            {/* 右侧属性面板 */}
            {!isReadOnly && selectedNode && (
                <PropertyPanel
                    selectedNode={selectedNode}
                    onUpdateNode={updateNodeData}
                    onClose={() => setSelectedNodeId(null)}
                />
            )}
        </div>
    );
};

/**
 * 工作流可视化画布
 *
 * 基于 @xyflow/react 的完整画布组件:
 * - 左侧: 节点面板（按类型分组拖拽）
 * - 中心: ReactFlow 画布（缩放/平移/小地图/网格对齐）
 * - 右侧: 属性面板（选中节点时展现）
 * - 顶部: 工具栏（缩放/布局/保存/导出）
 */
export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner {...props} />
        </ReactFlowProvider>
    );
};
