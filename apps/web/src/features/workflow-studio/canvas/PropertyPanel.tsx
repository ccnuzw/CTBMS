import React from 'react';
import { Card, Divider, Form, Input, InputNumber, Select, Space, Switch, Tag, theme, Typography } from 'antd';
import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import type { Edge, Node } from '@xyflow/react';
import type { NodeTypeConfig } from './nodeTypeRegistry';
import { getNodeTypeConfig } from './nodeTypeRegistry';
import { VariableSelector } from './VariableSelector';

const { Text, Title } = Typography;

interface PropertyPanelProps {
    selectedNode?: Node | null;
    selectedEdge?: Edge | null;
    onUpdateNode?: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
    onUpdateEdge?: (edgeId: string, data: Partial<Record<string, unknown>> & { type?: string }) => void;
    onClose: () => void;
}

/**
 * 节点属性面板
 *
 * 选中节点后在右侧展示，支持编辑:
 * - 基础信息: 名称、启用状态
 * - 运行时策略: 超时、重试次数、重试间隔、错误策略
 * - 节点配置: 根据节点类型动态渲染
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedNode,
    selectedEdge,
    onUpdateNode,
    onUpdateEdge,
    onClose,
}) => {
    const { token } = theme.useToken();

    if (selectedEdge) {
        return (
            <EdgePropertyPanel
                selectedEdge={selectedEdge}
                onUpdateEdge={onUpdateEdge!}
                onClose={onClose}
                token={token}
            />
        );
    }

    if (!selectedNode) return null;

    const nodeData = selectedNode.data;
    const nodeType = nodeData.type as string;
    const nodeName = nodeData.name as string;
    const nodeTypeConfig = getNodeTypeConfig(nodeType);
    const config = (nodeData.config as Record<string, unknown>) ?? {};
    const runtimePolicy = (nodeData.runtimePolicy as Record<string, unknown>) ?? {};
    const isEnabled = (nodeData.enabled as boolean) ?? true;

    const handleFieldChange = (field: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, { [field]: value });
    };

    const handleConfigChange = (key: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, {
            config: { ...config, [key]: value },
        });
    };

    const handleRuntimePolicyChange = (key: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, {
            runtimePolicy: { ...runtimePolicy, [key]: value },
        });
    };

    return (
        <div
            style={{
                width: 320,
                height: '100%',
                background: token.colorBgContainer,
                borderLeft: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Space>
                    {nodeTypeConfig && (
                        <div
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: token.borderRadiusSM,
                                background: `${nodeTypeConfig.color}15`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: nodeTypeConfig.color,
                                fontSize: 12,
                            }}
                        >
                            {React.createElement(nodeTypeConfig.icon)}
                        </div>
                    )}
                    <Text strong style={{ fontSize: 14 }}>
                        节点属性
                    </Text>
                </Space>
                <CloseOutlined
                    style={{ cursor: 'pointer', color: token.colorTextSecondary }}
                    onClick={onClose}
                />
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                {/* 基础信息 */}
                <Form layout="vertical" size="small" style={{ marginBottom: 0 }}>
                    <Form.Item label="节点名称" style={{ marginBottom: 12 }}>
                        <Input
                            value={nodeName}
                            onChange={(e) => handleFieldChange('name', e.target.value)}
                        />
                    </Form.Item>

                    <Form.Item label="节点类型" style={{ marginBottom: 12 }}>
                        <Tag color={nodeTypeConfig?.color}>{nodeTypeConfig?.label ?? nodeType}</Tag>
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            {selectedNode.id}
                        </Text>
                    </Form.Item>

                    <Form.Item label="启用" style={{ marginBottom: 12 }}>
                        <Switch
                            checked={isEnabled}
                            onChange={(v) => handleFieldChange('enabled', v)}
                            size="small"
                        />
                    </Form.Item>
                </Form>

                <Divider style={{ margin: '8px 0 16px' }}>
                    <Space size={4}>
                        <SettingOutlined />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            运行时策略
                        </Text>
                    </Space>
                </Divider>

                <Form layout="vertical" size="small">
                    <Form.Item label="超时 (ms)" style={{ marginBottom: 12 }}>
                        <InputNumber
                            value={(runtimePolicy.timeoutMs as number) ?? 30000}
                            min={1000}
                            max={120000}
                            step={5000}
                            style={{ width: '100%' }}
                            onChange={(v) => handleRuntimePolicyChange('timeoutMs', v)}
                        />
                    </Form.Item>

                    <Form.Item label="重试次数" style={{ marginBottom: 12 }}>
                        <InputNumber
                            value={(runtimePolicy.retryCount as number) ?? 1}
                            min={0}
                            max={5}
                            style={{ width: '100%' }}
                            onChange={(v) => handleRuntimePolicyChange('retryCount', v)}
                        />
                    </Form.Item>

                    <Form.Item label="重试间隔 (ms)" style={{ marginBottom: 12 }}>
                        <InputNumber
                            value={(runtimePolicy.retryBackoffMs as number) ?? 2000}
                            min={0}
                            max={60000}
                            step={1000}
                            style={{ width: '100%' }}
                            onChange={(v) => handleRuntimePolicyChange('retryBackoffMs', v)}
                        />
                    </Form.Item>

                    <Form.Item label="错误策略" style={{ marginBottom: 12 }}>
                        <Select
                            value={(runtimePolicy.onError as string) ?? 'FAIL_FAST'}
                            onChange={(v) => handleRuntimePolicyChange('onError', v)}
                            options={[
                                { label: '立即失败', value: 'FAIL_FAST' },
                                { label: '继续执行', value: 'CONTINUE' },
                                { label: '错误路由', value: 'ROUTE_TO_ERROR' },
                            ]}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Form>

                <Divider style={{ margin: '8px 0 16px' }}>
                    <Space size={4}>
                        <SettingOutlined />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            节点配置
                        </Text>
                    </Space>
                </Divider>

                {/* 动态配置 — 渲染 config 中的所有字段 */}
                <Form layout="vertical" size="small">
                    {Object.entries(config)
                        .filter(([key]) => !key.startsWith('_'))
                        .map(([key, value]) => (
                            <Form.Item key={key} label={key} style={{ marginBottom: 12 }}>
                                {renderConfigField(key, value, (v) => handleConfigChange(key, v), selectedNode.id)}
                            </Form.Item>
                        ))}
                </Form>
            </div>
        </div>
    );
};

/**
 * 根据值类型自动渲染表单控件
 */
function renderConfigField(
    key: string,
    value: unknown,
    onChange: (value: unknown) => void,
    nodeId: string,
): React.ReactNode {
    if (typeof value === 'boolean') {
        return <Switch checked={value} onChange={onChange} size="small" />;
    }
    if (typeof value === 'number') {
        return (
            <InputNumber
                value={value}
                onChange={onChange}
                style={{ width: '100%' }}
            />
        );
    }
    if (typeof value === 'string') {
        // 长文本使用 TextArea
        if (value.length > 80 || key.includes('expression') || key.includes('prompt')) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <VariableSelector
                        value={value}
                        onChange={(v) => onChange(v)}
                        currentNodeId={nodeId}
                    />
                    <Input.TextArea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        placeholder="在此输入表达式或使用上方选择器..."
                    />
                </div>
            );
        }
        return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
    }
    if (Array.isArray(value)) {
        return (
            <Input.TextArea
                value={JSON.stringify(value, null, 2)}
                onChange={(e) => {
                    try {
                        onChange(JSON.parse(e.target.value));
                    } catch {
                        // 保持原值
                    }
                }}
                autoSize={{ minRows: 2, maxRows: 6 }}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
        );
    }
    if (typeof value === 'object' && value !== null) {
        return (
            <Input.TextArea
                value={JSON.stringify(value, null, 2)}
                onChange={(e) => {
                    try {
                        onChange(JSON.parse(e.target.value));
                    } catch {
                        // 保持原值
                    }
                }}
                autoSize={{ minRows: 2, maxRows: 6 }}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
        );
    }
    return <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
}

// ── Edge Property Panel ──

interface EdgePropertyPanelProps {
    selectedEdge: Edge;
    onUpdateEdge: (edgeId: string, data: Partial<Record<string, unknown>> & { type?: string }) => void;
    onClose: () => void;
    token: any;
}

const EdgePropertyPanel: React.FC<EdgePropertyPanelProps> = ({
    selectedEdge,
    onUpdateEdge,
    onClose,
    token,
}) => {
    const edgeData = selectedEdge.data ?? {};
    const edgeType = (edgeData.edgeType as string) ?? 'data-edge';
    const condition = (edgeData.condition as string) ?? '';

    const handleTypeChange = (type: string) => {
        onUpdateEdge(selectedEdge.id, { edgeType: type, type: getFlowEdgeType(type) });
    };

    const handleConditionChange = (value: string) => {
        onUpdateEdge(selectedEdge.id, { condition: value });
    };

    return (
        <div
            style={{
                width: 320,
                height: '100%',
                background: token.colorBgContainer,
                borderLeft: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Space>
                    <div
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: token.borderRadiusSM,
                            background: `#1677FF15`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1677FF',
                            fontSize: 12,
                        }}
                    >
                        <SettingOutlined />
                    </div>
                    <Text strong style={{ fontSize: 14 }}>
                        连线属性
                    </Text>
                </Space>
                <CloseOutlined
                    style={{ cursor: 'pointer', color: token.colorTextSecondary }}
                    onClick={onClose}
                />
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                <Form layout="vertical" size="small">
                    <Form.Item label="连线类型" style={{ marginBottom: 16 }}>
                        <Select
                            value={edgeType}
                            onChange={handleTypeChange}
                            options={[
                                { label: '数据流 (Data Edge)', value: 'data-edge' },
                                { label: '控制流 (Control Edge)', value: 'control-edge' },
                                { label: '条件流 (Condition Edge)', value: 'condition-edge' },
                                { label: '错误流 (Error Edge)', value: 'error-edge' },
                            ]}
                        />
                    </Form.Item>

                    {edgeType === 'condition-edge' && (
                        <Form.Item
                            label="条件表达式"
                            style={{ marginBottom: 16 }}
                            help="例如: result.score > 80"
                        >
                            <Input.TextArea
                                value={condition}
                                onChange={(e) => handleConditionChange(e.target.value)}
                                autoSize={{ minRows: 2, maxRows: 6 }}
                                placeholder="输入条件表达式..."
                            />
                        </Form.Item>
                    )}

                    <Form.Item label="连线 ID" style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {selectedEdge.id}
                        </Text>
                    </Form.Item>
                </Form>
            </div>
        </div>
    );
};

// Helper: map dsl edge type to flow edge type (usually just 'smoothstep' but kept generic)
function getFlowEdgeType(edgeType: string): string {
    return 'smoothstep';
}
