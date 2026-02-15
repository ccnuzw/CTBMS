import React from 'react';
import { Button, Divider, Form, Input, InputNumber, Segmented, Select, Space, Switch, Tag, theme, Typography } from 'antd';
import { CloseOutlined, DeleteOutlined, PlusOutlined, SettingOutlined, SwapOutlined } from '@ant-design/icons';
import type { Edge, Node } from '@xyflow/react';
import type { NodeTypeConfig } from './nodeTypeRegistry';
import { getNodeTypeConfig } from './nodeTypeRegistry';
import { ExpressionEditor } from './ExpressionEditor';
import { NODE_FORM_REGISTRY } from './node-forms/formRegistry';

const { Text } = Typography;

interface PropertyPanelProps {
    selectedNode?: Node | null;
    selectedEdge?: Edge | null;
    onUpdateNode?: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
    onUpdateEdge?: (edgeId: string, data: Partial<Record<string, unknown>> & { type?: string }) => void;
    viewLevel?: 'business' | 'enhanced' | 'expert';
    onClose: () => void;
}

interface ParamOverrideEntry {
    id: string;
    key: string;
    value: string;
}

const toParamOverrideEntries = (overrides: Record<string, unknown>): ParamOverrideEntry[] => {
    return Object.entries(overrides).map(([key, value], idx) => ({
        id: `${key}-${idx}`,
        key,
        value: value === null || value === undefined
            ? ''
            : typeof value === 'string'
                ? value
                : JSON.stringify(value),
    }));
};

const parseLooseValue = (value: string): unknown => {
    const raw = value.trim();
    if (!raw) return '';
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return value;
    }
};

const fromParamOverrideEntries = (entries: ParamOverrideEntry[]): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const entry of entries) {
        const key = entry.key.trim();
        if (!key) continue;
        next[key] = parseLooseValue(entry.value);
    }
    return next;
};

const applyRuntimePreset = (
    preset: 'FAST' | 'BALANCED' | 'ROBUST',
): { timeoutMs: number; retryCount: number; retryBackoffMs: number; onError: string } => {
    if (preset === 'FAST') {
        return { timeoutMs: 15000, retryCount: 0, retryBackoffMs: 0, onError: 'FAIL_FAST' };
    }
    if (preset === 'ROBUST') {
        return { timeoutMs: 60000, retryCount: 3, retryBackoffMs: 3000, onError: 'ROUTE_TO_ERROR' };
    }
    return { timeoutMs: 30000, retryCount: 1, retryBackoffMs: 2000, onError: 'CONTINUE' };
};

/**
 * 节点属性面板
 *
 * 选中节点后在右侧展示，支持编辑:
 * - 基础信息: 名称、启用状态
 * - 输入映射: 绑定上游变量或表达式 (New in Phase 8B)
 * - 运行时策略: 超时、重试次数、重试间隔、错误策略
 * - 节点配置: 根据节点类型动态渲染
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedNode,
    selectedEdge,
    onUpdateNode,
    onUpdateEdge,
    viewLevel = 'business',
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
    const inputBindings = (nodeData.inputBindings as Record<string, string>) ?? {}; // Input Mappings
    const defaultValues = (nodeData.defaultValues as Record<string, unknown>) ?? {};
    const nullPolicies = (nodeData.nullPolicies as Record<string, string>) ?? {};
    const runtimePolicy = (nodeData.runtimePolicy as Record<string, unknown>) ?? {};
    const isEnabled = (nodeData.enabled as boolean) ?? true;
    const paramOverrideMode = (config.paramOverrideMode as 'INHERIT' | 'PRIVATE_OVERRIDE') ?? 'INHERIT';
    const paramOverrides = (config.paramOverrides as Record<string, unknown>) ?? {};

    const [viewMode, setViewMode] = React.useState<'ui' | 'json'>('ui');
    const [paramOverrideEntries, setParamOverrideEntries] = React.useState<ParamOverrideEntry[]>(
        toParamOverrideEntries(paramOverrides),
    );

    React.useEffect(() => {
        setParamOverrideEntries(toParamOverrideEntries(paramOverrides));
    }, [selectedNode.id, paramOverrides]);

    React.useEffect(() => {
        if (viewLevel === 'business' && viewMode !== 'ui') {
            setViewMode('ui');
        }
    }, [viewLevel, viewMode]);

    const isBusinessView = viewLevel === 'business';
    const isExpertView = viewLevel === 'expert';
    const currentTimeoutMs = (runtimePolicy.timeoutMs as number) ?? 30000;
    const currentRetryCount = (runtimePolicy.retryCount as number) ?? 1;
    const currentRetryBackoffMs = (runtimePolicy.retryBackoffMs as number) ?? 2000;
    const currentOnError = (runtimePolicy.onError as string) ?? 'FAIL_FAST';
    const currentRuntimePreset =
        currentTimeoutMs === 15000 && currentRetryCount === 0 && currentRetryBackoffMs === 0 && currentOnError === 'FAIL_FAST'
            ? 'FAST'
            : currentTimeoutMs === 30000 && currentRetryCount === 1 && currentRetryBackoffMs === 2000 && currentOnError === 'CONTINUE'
                ? 'BALANCED'
                : currentTimeoutMs === 60000 && currentRetryCount === 3 && currentRetryBackoffMs === 3000 && currentOnError === 'ROUTE_TO_ERROR'
                    ? 'ROBUST'
                    : 'CUSTOM';

    const handleFieldChange = (field: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, { [field]: value });
    };

    // Helper for tags handling
    const nodeTags = (nodeData.tags as string[]) || [];

    const handleConfigChange = (key: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, {
            config: { ...config, [key]: value },
        });
    };

    const handleInputBindingChange = (key: string, value: string) => {
        onUpdateNode?.(selectedNode.id, {
            inputBindings: { ...inputBindings, [key]: value },
        });
    };

    const handleDefaultValueChange = (key: string, value: unknown) => {
        onUpdateNode?.(selectedNode.id, {
            defaultValues: { ...defaultValues, [key]: value },
        });
    };

    const handleNullPolicyChange = (key: string, value: string) => {
        onUpdateNode?.(selectedNode.id, {
            nullPolicies: { ...nullPolicies, [key]: value },
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
                width: 380,
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

            {/* View Toggle */}
            {!isBusinessView ? (
                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {isExpertView ? '专家视图：支持源码配置' : '增强视图：推荐使用表单配置'}
                    </Text>
                    <Segmented
                        size="small"
                        options={[
                            { label: '表单', value: 'ui' },
                            { label: '源码', value: 'json' },
                        ]}
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'ui' | 'json')}
                    />
                </div>
            ) : null}

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
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
                        {!isBusinessView ? (
                            <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                {selectedNode.id}
                            </Text>
                        ) : null}
                    </Form.Item>

                    <Form.Item label="启用" style={{ marginBottom: 12 }}>
                        <Switch
                            checked={isEnabled}
                            onChange={(v) => handleFieldChange('enabled', v)}
                            size="small"
                        />
                    </Form.Item>

                    <Form.Item label="描述" style={{ marginBottom: 12 }}>
                        <Input.TextArea
                            value={nodeData.description as string}
                            onChange={(e) => handleFieldChange('description', e.target.value)}
                            rows={2}
                            placeholder="节点描述..."
                        />
                    </Form.Item>

                    {!isBusinessView ? (
                        <Form.Item label="标签 (Tags)" style={{ marginBottom: 12 }}>
                            <Select
                                mode="tags"
                                value={nodeTags}
                                onChange={(v) => handleFieldChange('tags', v)}
                                tokenSeparators={[',']}
                                placeholder="添加标签..."
                                size="small"
                            />
                        </Form.Item>
                    ) : null}
                </Form>

                {/* 输入映射 (New in Phase 8B) */}
                {!isBusinessView && nodeTypeConfig?.inputsSchema && nodeTypeConfig.inputsSchema.length > 0 && (
                    <>
                        <Divider style={{ margin: '16px 0' }}>
                            <Space size={4}>
                                <SwapOutlined />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    输入映射 (Input Mappings)
                                </Text>
                            </Space>
                        </Divider>
                        <Form layout="vertical" size="small">
                            {nodeTypeConfig.inputsSchema.map((input) => (
                                <div key={input.name} style={{ marginBottom: 16, border: `1px solid ${token.colorBorderSecondary}`, padding: 8, borderRadius: token.borderRadiusSM }}>
                                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                        <Space>
                                            <Text strong>{input.name}</Text>
                                            <Tag style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{input.type}</Tag>
                                            {input.required && <Text type="danger">*</Text>}
                                        </Space>
                                    </div>

                                    <Form.Item style={{ marginBottom: 8 }} help="绑定表达式">
                                        <ExpressionEditor
                                            currentNodeId={selectedNode.id}
                                            value={inputBindings[input.name]}
                                            onChange={(val) => handleInputBindingChange(input.name, val)}
                                            placeholder={`映射 ${input.name} ...`}
                                        />
                                    </Form.Item>

                                    <Space style={{ width: '100%' }} align="start">
                                        <Form.Item label="默认值" style={{ marginBottom: 0, flex: 1 }}>
                                            <Input
                                                size="small"
                                                value={String(defaultValues[input.name] ?? '')}
                                                onChange={(e) => handleDefaultValueChange(input.name, e.target.value)}
                                                placeholder="Default"
                                            />
                                        </Form.Item>
                                        <Form.Item label="空值策略" style={{ marginBottom: 0, width: 100 }}>
                                            <Select
                                                size="small"
                                                value={nullPolicies[input.name] ?? 'FAIL'}
                                                onChange={(val) => handleNullPolicyChange(input.name, val)}
                                                options={[
                                                    { label: '报错', value: 'FAIL' },
                                                    { label: '默认值', value: 'USE_DEFAULT' },
                                                    { label: '跳过', value: 'SKIP' },
                                                ]}
                                            />
                                        </Form.Item>
                                    </Space>
                                </div>
                            ))}
                        </Form>
                    </>
                )}

                {!isBusinessView ? (
                    <>
                        <Divider style={{ margin: '16px 0' }}>
                            <Space size={4}>
                                <SettingOutlined />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    节点参数覆盖
                                </Text>
                            </Space>
                        </Divider>

                        <Form layout="vertical" size="small">
                            <Form.Item
                                label="参数模式"
                                help="INHERIT: 继承流程参数；PRIVATE_OVERRIDE: 仅当前节点使用私有覆盖"
                                style={{ marginBottom: 12 }}
                            >
                                <Segmented
                                    value={paramOverrideMode}
                                    options={[
                                        { label: '继承 (INHERIT)', value: 'INHERIT' },
                                        { label: '私有覆盖 (PRIVATE_OVERRIDE)', value: 'PRIVATE_OVERRIDE' },
                                    ]}
                                    onChange={(value) => {
                                        const mode = value as 'INHERIT' | 'PRIVATE_OVERRIDE';
                                        handleConfigChange('paramOverrideMode', mode);
                                        if (mode === 'INHERIT') {
                                            handleConfigChange('paramOverrides', {});
                                            setParamOverrideEntries([]);
                                        }
                                    }}
                                />
                            </Form.Item>

                            {paramOverrideMode === 'PRIVATE_OVERRIDE' ? (
                                <Form.Item
                                    label="节点参数覆盖"
                                    help="建议使用业务参数编码，值支持数字/布尔/文本/JSON。"
                                    style={{ marginBottom: 12 }}
                                >
                                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                        {paramOverrideEntries.length === 0 ? (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                当前没有覆盖项，可点击“新增覆盖项”开始配置。
                                            </Text>
                                        ) : null}
                                        {paramOverrideEntries.map((entry) => (
                                            <Space key={entry.id} style={{ width: '100%' }} align="start">
                                                <Input
                                                    placeholder="参数编码，如 MAX_POSITION_RATIO"
                                                    value={entry.key}
                                                    onChange={(event) => {
                                                        const nextEntries = paramOverrideEntries.map((item) =>
                                                            item.id === entry.id
                                                                ? { ...item, key: event.target.value }
                                                                : item,
                                                        );
                                                        setParamOverrideEntries(nextEntries);
                                                        handleConfigChange('paramOverrides', fromParamOverrideEntries(nextEntries));
                                                    }}
                                                />
                                                <Input
                                                    placeholder={'值，如 0.4 / true / {"limit":10}'}
                                                    value={entry.value}
                                                    onChange={(event) => {
                                                        const nextEntries = paramOverrideEntries.map((item) =>
                                                            item.id === entry.id
                                                                ? { ...item, value: event.target.value }
                                                                : item,
                                                        );
                                                        setParamOverrideEntries(nextEntries);
                                                        handleConfigChange('paramOverrides', fromParamOverrideEntries(nextEntries));
                                                    }}
                                                />
                                                <Button
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => {
                                                        const nextEntries = paramOverrideEntries.filter((item) => item.id !== entry.id);
                                                        setParamOverrideEntries(nextEntries);
                                                        handleConfigChange('paramOverrides', fromParamOverrideEntries(nextEntries));
                                                    }}
                                                />
                                            </Space>
                                        ))}
                                        <Button
                                            type="dashed"
                                            icon={<PlusOutlined />}
                                            onClick={() => {
                                                setParamOverrideEntries((prev) => [
                                                    ...prev,
                                                    {
                                                        id: `override-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                                        key: '',
                                                        value: '',
                                                    },
                                                ]);
                                            }}
                                        >
                                            新增覆盖项
                                        </Button>
                                    </Space>
                                    <Space style={{ marginTop: 8 }}>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                handleConfigChange('paramOverrides', {});
                                                setParamOverrideEntries([]);
                                            }}
                                        >
                                            清空覆盖
                                        </Button>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                handleConfigChange('paramOverrideMode', 'INHERIT');
                                                handleConfigChange('paramOverrides', {});
                                                setParamOverrideEntries([]);
                                            }}
                                        >
                                            回退到继承
                                        </Button>
                                    </Space>
                                </Form.Item>
                            ) : null}
                        </Form>
                    </>
                ) : null}

                <Divider style={{ margin: '16px 0' }}>
                    <Space size={4}>
                        <SettingOutlined />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            运行时策略
                        </Text>
                    </Space>
                </Divider>

                <Form layout="vertical" size="small">
                    <Form.Item
                        label="策略预设"
                        help="可一键套用运行策略；选择自定义后可逐项调整。"
                        style={{ marginBottom: 12 }}
                    >
                        <Select
                            value={currentRuntimePreset}
                            onChange={(value) => {
                                if (value === 'CUSTOM') return;
                                const preset = applyRuntimePreset(value as 'FAST' | 'BALANCED' | 'ROBUST');
                                handleRuntimePolicyChange('timeoutMs', preset.timeoutMs);
                                handleRuntimePolicyChange('retryCount', preset.retryCount);
                                handleRuntimePolicyChange('retryBackoffMs', preset.retryBackoffMs);
                                handleRuntimePolicyChange('onError', preset.onError);
                            }}
                            options={[
                                { label: '快速响应（低重试）', value: 'FAST' },
                                { label: '平衡推荐（默认）', value: 'BALANCED' },
                                { label: '稳健容错（高重试）', value: 'ROBUST' },
                                { label: '自定义', value: 'CUSTOM' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item label="超时 (ms)" style={{ marginBottom: 12 }}>
                        <InputNumber
                            value={currentTimeoutMs}
                            min={1000}
                            max={120000}
                            step={5000}
                            style={{ width: '100%' }}
                            onChange={(v) => handleRuntimePolicyChange('timeoutMs', v)}
                        />
                    </Form.Item>

                    {!isBusinessView ? (
                        <Form.Item label="重试次数" style={{ marginBottom: 12 }}>
                            <InputNumber
                                value={currentRetryCount}
                                min={0}
                                max={5}
                                style={{ width: '100%' }}
                                onChange={(v) => handleRuntimePolicyChange('retryCount', v)}
                            />
                        </Form.Item>
                    ) : null}

                    {!isBusinessView ? (
                        <Form.Item label="重试间隔 (ms)" style={{ marginBottom: 12 }}>
                            <InputNumber
                                value={currentRetryBackoffMs}
                                min={0}
                                max={60000}
                                step={1000}
                                style={{ width: '100%' }}
                                onChange={(v) => handleRuntimePolicyChange('retryBackoffMs', v)}
                            />
                        </Form.Item>
                    ) : null}

                    <Form.Item label="错误策略" style={{ marginBottom: 12 }}>
                        <Select
                            value={currentOnError}
                            onChange={(v) => handleRuntimePolicyChange('onError', v)}
                            options={[
                                { label: '立即失败', value: 'FAIL_FAST' },
                                { label: '继续执行', value: 'CONTINUE' },
                                { label: '错误路由', value: 'ROUTE_TO_ERROR' },
                            ]}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    {!isBusinessView ? (
                        <Form.Item label="缓存策略 (Cache Policy)" style={{ marginBottom: 12 }}>
                            <Select
                                value={(runtimePolicy.cachePolicy as string) ?? 'NONE'}
                                onChange={(v) => handleRuntimePolicyChange('cachePolicy', v)}
                                options={[
                                    { label: '不缓存 (None)', value: 'NONE' },
                                    { label: '本地缓存 (Local)', value: 'LOCAL' },
                                    { label: '共享缓存 (Shared)', value: 'SHARED' },
                                ]}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    ) : null}

                    {!isBusinessView && (runtimePolicy.cachePolicy === 'LOCAL' || runtimePolicy.cachePolicy === 'SHARED') && (
                        <Form.Item label="缓存时长 (TTL Seconds)" style={{ marginBottom: 12 }}>
                            <InputNumber
                                value={(runtimePolicy.cacheTtlSec as number) ?? 300}
                                min={1}
                                style={{ width: '100%' }}
                                onChange={(v) => handleRuntimePolicyChange('cacheTtlSec', v)}
                            />
                        </Form.Item>
                    )}

                    {!isBusinessView ? (
                        <Form.Item label="审计级别 (Audit Level)" style={{ marginBottom: 12 }}>
                            <Select
                                value={(runtimePolicy.auditLevel as string) ?? 'BASIC'}
                                onChange={(v) => handleRuntimePolicyChange('auditLevel', v)}
                                options={[
                                    { label: '无 (None)', value: 'NONE' },
                                    { label: '基础 (Basic)', value: 'BASIC' },
                                    { label: '完整 (Full)', value: 'FULL' },
                                ]}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    ) : null}
                </Form>

                <Divider style={{ margin: '16px 0' }}>
                    <Space size={4}>
                        <SettingOutlined />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            节点配置
                        </Text>
                    </Space>
                </Divider>

                {/* 动态配置 */}
                {!isBusinessView && viewMode === 'json' ? (
                    <Input.TextArea
                        value={JSON.stringify(config, null, 2)}
                        onChange={(e) => {
                            try {
                                const newConfig = JSON.parse(e.target.value);
                                onUpdateNode?.(selectedNode.id, { config: newConfig });
                            } catch {
                                // Ignore parse error while typing
                            }
                        }}
                        autoSize={{ minRows: 10, maxRows: 30 }}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                ) : (
                    <>
                        {/* 优先使用专用表单，否则渲染通用 Key-Value */}
                        {NODE_FORM_REGISTRY[nodeType] ? (
                            React.createElement(NODE_FORM_REGISTRY[nodeType], {
                                config: config,
                                onChange: handleConfigChange,
                                currentNodeId: selectedNode.id,
                            })
                        ) : (
                            <Form layout="vertical" size="small">
                                {Object.entries(config)
                                    .filter(([key]) => !key.startsWith('_'))
                                    .map(([key, value]) => (
                                        <Form.Item key={key} label={key} style={{ marginBottom: 12 }}>
                                            {renderConfigField(key, value, (v) => handleConfigChange(key, v), selectedNode.id)}
                                        </Form.Item>
                                    ))}
                            </Form>
                        )}
                    </>
                )}
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
        // 长文本或特定Key使用 ExpressionEditor
        if (value.length > 80 || key.includes('expression') || key.includes('prompt') || key.includes('Template')) {
            return (
                <ExpressionEditor
                    value={value}
                    onChange={(v) => onChange(v)}
                    currentNodeId={nodeId}
                    placeholder="不支持变量引用? 请检查字段名"
                />
            );
        }
        return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
    }
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        return (
            <Input.TextArea
                value={JSON.stringify(value, null, 2)}
                onChange={(e) => {
                    try {
                        onChange(JSON.parse(e.target.value));
                    } catch {
                        // Keep text as is
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
                            help="例如: {{n1.score}} > 80"
                        >
                            <ExpressionEditor
                                value={condition}
                                onChange={handleConditionChange}
                                currentNodeId={selectedEdge.source}
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
