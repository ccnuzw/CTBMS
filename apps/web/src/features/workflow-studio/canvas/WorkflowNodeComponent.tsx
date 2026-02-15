import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, theme, Typography } from 'antd';
import type { NodeTypeConfig } from './nodeTypeRegistry';
import { getNodeTypeConfig } from './nodeTypeRegistry';
import { NodeConfigSummary } from './NodeConfigSummary';

const { Text } = Typography;

/**
 * 自定义工作流节点组件
 *
 * 用于 ReactFlow 画布中渲染的每个节点
 */
export const WorkflowNodeComponent = memo(({ data, selected }: NodeProps) => {
    const { token } = theme.useToken();
    // Use getNodeTypeConfig to get the full config, including schemas
    const nodeTypeConfig = getNodeTypeConfig(data.type as string);
    const isEnabled = (data.enabled as boolean) ?? true;
    const nodeName = data.name as string;
    const nodeType = data.type as string;
    const diffStatus = data.diffStatus as 'added' | 'removed' | 'modified' | 'unchanged' | undefined;

    let color = nodeTypeConfig?.color ?? token.colorPrimary;
    if (diffStatus === 'added') color = token.colorSuccess;
    if (diffStatus === 'removed') color = token.colorError;
    if (diffStatus === 'modified') color = token.colorWarning;
    if (diffStatus === 'unchanged') color = token.colorTextQuaternary;

    const IconComponent = nodeTypeConfig?.icon;


    // Extract schemas for handle rendering
    const inputsSchema = nodeTypeConfig?.inputsSchema;
    const outputsSchema = nodeTypeConfig?.outputsSchema;

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
                opacity: isEnabled ? (diffStatus === 'unchanged' ? 0.5 : 1) : 0.5,
                position: 'relative',
                transition: 'all 0.2s ease',

                cursor: 'pointer',
            }}
        >
            {/* Input Handles */}
            {inputsSchema ? (
                inputsSchema.map((input, index) => (
                    <Handle
                        key={input.name}
                        type="target"
                        position={Position.Top}
                        id={input.name}
                        style={{
                            left: inputsSchema.length === 1 ? '50%' : `${((index + 1) * 100) / (inputsSchema.length + 1)}%`,
                            top: -6,
                            width: 10,
                            height: 10,
                            background: color,
                            border: `2px solid ${token.colorBgContainer}`,
                        }}
                    >
                        {inputsSchema.length > 1 && (
                            <div style={{ position: 'absolute', top: -16, left: -10, fontSize: 10, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
                                {input.name}
                            </div>
                        )}
                    </Handle>
                ))
            ) : (
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
            )}

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
                        style={{ fontSize: 11, lineHeight: '14px', display: 'block', marginTop: 2 }}
                    >
                        {nodeTypeConfig?.label ?? nodeType}
                    </Text>
                </div>
                {diffStatus && diffStatus !== 'unchanged' && (
                    <Badge
                        count={diffStatus === 'added' ? '新增' : diffStatus === 'removed' ? '删除' : '变更'}
                        color={color}
                        style={{ fontSize: 10 }}
                    />
                )}
                {!isEnabled && (
                    <Badge

                        count="禁用"
                        style={{ fontSize: 10, backgroundColor: token.colorTextQuaternary }}
                    />
                )}

            </div>

            {/* Breakpoint Indicator */}
            {(data.isBreakpoint as boolean) && (
                <div
                    style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#ff4d4f',
                        border: '2px solid white',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        zIndex: 10,
                    }}
                />
            )}

            <NodeConfigSummary nodeType={nodeType} config={(data.config as Record<string, unknown>) ?? {}} />

            {/* Output Handles */}
            {outputsSchema ? (
                outputsSchema.map((output, index) => (
                    <Handle
                        key={output.name}
                        type="source"
                        position={Position.Bottom}
                        id={output.name}
                        style={{
                            left: outputsSchema.length === 1 ? '50%' : `${((index + 1) * 100) / (outputsSchema.length + 1)}%`,
                            bottom: -6,
                            width: 10,
                            height: 10,
                            background: color,
                            border: `2px solid ${token.colorBgContainer}`,
                        }}
                    >
                        {outputsSchema.length > 1 && (
                            <div style={{ position: 'absolute', bottom: -16, left: -10, fontSize: 10, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
                                {output.name}
                            </div>
                        )}
                    </Handle>
                ))
            ) : (
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
            )}
        </div>
    );
});

WorkflowNodeComponent.displayName = 'WorkflowNodeComponent';
