import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, theme, Typography } from 'antd';
import type { NodeTypeConfig } from './nodeTypeRegistry';

const { Text } = Typography;

/**
 * 自定义工作流节点组件
 *
 * 用于 ReactFlow 画布中渲染的每个节点
 */
export const WorkflowNodeComponent = memo(({ data, selected }: NodeProps) => {
    const { token } = theme.useToken();
    const nodeTypeConfig = data.nodeTypeConfig as NodeTypeConfig | undefined;
    const isEnabled = (data.enabled as boolean) ?? true;
    const nodeName = data.name as string;
    const nodeType = data.type as string;
    const color = nodeTypeConfig?.color ?? token.colorPrimary;
    const IconComponent = nodeTypeConfig?.icon;

    return (
        <div
            style={{
                background: token.colorBgContainer,
                border: `2px solid ${selected ? token.colorPrimary : color}`,
                borderRadius: token.borderRadiusLG,
                padding: '12px 16px',
                minWidth: 180,
                maxWidth: 240,
                boxShadow: selected ? `0 0 0 3px ${token.colorPrimaryBg}` : token.boxShadowTertiary,
                opacity: isEnabled ? 1 : 0.5,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
            }}
        >
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    width: 10,
                    height: 10,
                    background: color,
                    border: `2px solid ${token.colorBgContainer}`,
                }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {IconComponent && (
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: token.borderRadius,
                            background: `${color}15`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color,
                            fontSize: 16,
                            flexShrink: 0,
                        }}
                    >
                        <IconComponent />
                    </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        strong
                        ellipsis
                        style={{
                            display: 'block',
                            fontSize: 13,
                            lineHeight: '18px',
                            color: token.colorText,
                        }}
                    >
                        {nodeName}
                    </Text>
                    <Text
                        type="secondary"
                        style={{ fontSize: 11, lineHeight: '14px' }}
                    >
                        {nodeTypeConfig?.label ?? nodeType}
                    </Text>
                </div>
                {!isEnabled && (
                    <Badge
                        count="禁用"
                        style={{ fontSize: 10, backgroundColor: token.colorTextQuaternary }}
                    />
                )}
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    width: 10,
                    height: 10,
                    background: color,
                    border: `2px solid ${token.colorBgContainer}`,
                }}
            />
        </div>
    );
});

WorkflowNodeComponent.displayName = 'WorkflowNodeComponent';
