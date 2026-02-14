import React, { memo } from 'react';
import { NodeProps, NodeResizer, Handle, Position, useReactFlow } from '@xyflow/react';
import { theme } from 'antd';
import { GroupOutlined, FileTextOutlined, MinusSquareOutlined, PlusSquareOutlined } from '@ant-design/icons';

export const GroupNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
    const { token } = theme.useToken();
    const { getNodes, setNodes } = useReactFlow();

    const config = (data.config as Record<string, unknown>) || {};
    const label = (config.label as string) || 'Group';
    const collapsed = !!config.collapsed;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();

        setNodes((nodes) => {
            const groupNode = nodes.find((n) => n.id === id);
            if (!groupNode) return nodes;

            const isCollapsing = !collapsed;

            return nodes.map((node) => {
                // Update group node itself
                if (node.id === id) {
                    const currentWidth = node.style?.width ?? node.measured?.width ?? 300;
                    const currentHeight = node.style?.height ?? node.measured?.height ?? 200;

                    const newConfig = {
                        ...config,
                        collapsed: isCollapsing,
                        // Save original dimensions when collapsing
                        ...(isCollapsing ? {
                            _originalWidth: currentWidth,
                            _originalHeight: currentHeight
                        } : {})
                    };

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            config: newConfig,
                        },
                        style: {
                            ...node.style,
                            width: isCollapsing ? 200 : (config._originalWidth as number ?? 300),
                            height: isCollapsing ? 60 : (config._originalHeight as number ?? 200),
                        },
                    };
                }

                // Update children visibility
                if (node.parentId === id) {
                    return {
                        ...node,
                        hidden: isCollapsing,
                    };
                }

                return node;
            });
        });
    };

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: collapsed ? token.colorFillSecondary : 'rgba(240, 240, 240, 0.25)',
                border: selected ? `2px solid ${token.colorPrimary}` : `2px dashed ${token.colorBorder}`,
                borderRadius: token.borderRadiusLG,
                position: 'relative',
                padding: 10,
                transition: 'all 0.2s',
            }}
        >
            {!collapsed && (
                <NodeResizer
                    isVisible={selected}
                    minWidth={200}
                    minHeight={100}
                    lineStyle={{ border: `1px solid ${token.colorPrimary}` }}
                    handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
                />
            )}

            <div
                style={{
                    position: 'absolute',
                    top: collapsed ? 0 : -24,
                    left: 0,
                    right: collapsed ? 0 : 'auto',
                    height: collapsed ? '100%' : 'auto',
                    padding: collapsed ? '0 12px' : '2px 8px',
                    backgroundColor: selected || collapsed ? token.colorPrimary : token.colorFillSecondary,
                    color: selected || collapsed ? '#fff' : token.colorTextSecondary,
                    borderRadius: token.borderRadiusSM,
                    fontSize: 12,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'space-between' : 'flex-start',
                    gap: 8,
                    cursor: collapsed ? 'pointer' : 'default',
                }}
                onClick={collapsed ? (e) => { e.stopPropagation(); /* allow selecting node */ } : undefined}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                        onClick={handleToggle}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        {collapsed ? <PlusSquareOutlined /> : <MinusSquareOutlined />}
                    </div>
                    <span>{label}</span>
                </div>

                {collapsed && (
                    <div style={{ fontSize: 10, opacity: 0.8 }}>
                        (Collapsed)
                    </div>
                )}
            </div>

            {/* Dynamic Input Handles */}
            {(data.inputs as any[])?.length > 0 ? (
                (data.inputs as any[]).map((input, index) => (
                    <Handle
                        key={`input-${input.name}`}
                        type="target"
                        position={Position.Left}
                        id={input.name}
                        style={{
                            top: `${((index + 1) * 100) / ((data.inputs as any[]).length + 1)}%`,
                            width: 10,
                            height: 10,
                            background: token.colorTextSecondary,
                            borderRadius: 2,
                        }}
                    >
                        {/* Optional Tooltip for handle? */}
                    </Handle>
                ))
            ) : (
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ width: 10, height: 10, background: token.colorTextSecondary, borderRadius: 2, top: '50%' }}
                />
            )}

            {/* Dynamic Output Handles */}
            {(data.outputs as any[])?.length > 0 ? (
                (data.outputs as any[]).map((output, index) => (
                    <Handle
                        key={`output-${output.name}`}
                        type="source"
                        position={Position.Right}
                        id={output.name}
                        style={{
                            top: `${((index + 1) * 100) / ((data.outputs as any[]).length + 1)}%`,
                            width: 10,
                            height: 10,
                            background: token.colorTextSecondary,
                            borderRadius: 2,
                        }}
                    />
                ))
            ) : (
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{ width: 10, height: 10, background: token.colorTextSecondary, borderRadius: 2, top: '50%' }}
                />
            )}
        </div>
    );
});

GroupNode.displayName = 'GroupNode';
