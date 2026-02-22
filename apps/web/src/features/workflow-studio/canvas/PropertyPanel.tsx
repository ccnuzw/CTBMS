import React from 'react';
import {
  Alert,
  Empty,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  theme,
  Typography,
} from 'antd';
import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import type { Edge, Node } from '@xyflow/react';
import type { WorkflowDsl } from '@packages/types';
import { getNodeTypeConfig } from './nodeTypeRegistry';
import { ExpressionEditor } from './ExpressionEditor';
import { NODE_FORM_REGISTRY } from './node-forms/formRegistry';
import { InputMappingMatrix } from './property-panel/InputMappingMatrix';
import { NodeDryRunPreview } from './property-panel/NodeDryRunPreview';
import { ParameterOverrideBuilder } from './property-panel/ParameterOverrideBuilder';
import { RuntimePresetCard as RuntimePresetCardComponent } from './property-panel/RuntimePresetCard';

const { Text } = Typography;

interface PropertyPanelProps {
  selectedNode?: Node | null;
  selectedEdge?: Edge | null;
  onUpdateNode?: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  onUpdateEdge?: (
    edgeId: string,
    data: Partial<Record<string, unknown>> & { type?: string },
  ) => void;
  viewLevel?: 'business' | 'enhanced' | 'expert';
  paramSetBindings?: string[];
  currentDsl?: WorkflowDsl;
  onFocusNode?: (nodeId: string) => void;
  onClose: () => void;
}

const EMPTY_RECORD: Record<string, unknown> = {};
const EMPTY_STRING_RECORD: Record<string, string> = {};

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

const formatIssueMessage = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '-';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * 节点属性面板
 *
 * 选中节点后在右侧展示，支持编辑:
 * - 概览: 名称、状态、描述
 * - 输入: 可视化输入映射
 * - 能力: 节点配置与参数覆盖
 * - 运行: 运行时策略
 * - 校验: 即时配置问题提示
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  viewLevel = 'business',
  paramSetBindings = [],
  currentDsl,
  onFocusNode,
  onClose,
}) => {
  const { token } = theme.useToken();

  const [viewMode, setViewMode] = React.useState<'ui' | 'json'>('ui');
  const [activeTab, setActiveTab] = React.useState('overview');

  React.useEffect(() => {
    setActiveTab('overview');
  }, [selectedNode?.id, selectedEdge?.id]);

  React.useEffect(() => {
    if (viewLevel === 'business' && viewMode !== 'ui') {
      setViewMode('ui');
    }
  }, [viewLevel, viewMode]);

  if (selectedEdge && onUpdateEdge) {
    return (
      <EdgePropertyPanel
        selectedEdge={selectedEdge}
        onUpdateEdge={onUpdateEdge}
        onClose={onClose}
        token={token}
      />
    );
  }

  if (!selectedNode) return null;

  const nodeData = (selectedNode.data as Record<string, unknown> | undefined) ?? EMPTY_RECORD;
  const nodeType = (nodeData.type as string) ?? '';
  const nodeName = (nodeData.name as string) ?? '';
  const nodeTypeConfig = getNodeTypeConfig(nodeType);
  const config = (nodeData.config as Record<string, unknown>) ?? EMPTY_RECORD;
  const inputBindings = (nodeData.inputBindings as Record<string, string>) ?? EMPTY_STRING_RECORD;
  const defaultValues = (nodeData.defaultValues as Record<string, unknown>) ?? EMPTY_RECORD;
  const nullPolicies = (nodeData.nullPolicies as Record<string, string>) ?? EMPTY_STRING_RECORD;
  const runtimePolicy = (nodeData.runtimePolicy as Record<string, unknown>) ?? EMPTY_RECORD;
  const isEnabled = (nodeData.enabled as boolean) ?? true;
  const nodeTags = (nodeData.tags as string[]) || [];
  const isBusinessView = viewLevel === 'business';
  const isExpertView = viewLevel === 'expert';

  const paramOverrideMode =
    (config.paramOverrideMode as 'INHERIT' | 'PRIVATE_OVERRIDE') ?? 'INHERIT';
  const paramOverrides = (config.paramOverrides as Record<string, unknown>) ?? EMPTY_RECORD;

  const currentTimeoutMs = (runtimePolicy.timeoutMs as number) ?? 30000;
  const currentRetryCount = (runtimePolicy.retryCount as number) ?? 1;
  const currentRetryBackoffMs = (runtimePolicy.retryBackoffMs as number) ?? 2000;
  const currentOnError = (runtimePolicy.onError as string) ?? 'FAIL_FAST';
  const currentCachePolicy = (runtimePolicy.cachePolicy as string) ?? 'NONE';
  const currentAuditLevel = (runtimePolicy.auditLevel as string) ?? 'BASIC';

  const currentRuntimePreset =
    currentTimeoutMs === 15000 &&
      currentRetryCount === 0 &&
      currentRetryBackoffMs === 0 &&
      currentOnError === 'FAIL_FAST'
      ? 'FAST'
      : currentTimeoutMs === 30000 &&
        currentRetryCount === 1 &&
        currentRetryBackoffMs === 2000 &&
        currentOnError === 'CONTINUE'
        ? 'BALANCED'
        : currentTimeoutMs === 60000 &&
          currentRetryCount === 3 &&
          currentRetryBackoffMs === 3000 &&
          currentOnError === 'ROUTE_TO_ERROR'
          ? 'ROBUST'
          : 'CUSTOM';

  const handleFieldChange = (field: string, value: unknown) => {
    onUpdateNode?.(selectedNode.id, { [field]: value });
  };

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

  const handleInputBindingsChange = (nextBindings: Record<string, string>) => {
    onUpdateNode?.(selectedNode.id, {
      inputBindings: nextBindings,
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

  const validationIssues = React.useMemo(() => {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }> = [];

    if (!nodeName.trim()) {
      issues.push({ type: 'error', message: '节点名称不能为空。' });
    }

    (nodeTypeConfig?.inputsSchema ?? []).forEach((inputField) => {
      const binding = inputBindings[inputField.name];
      const hasBinding = typeof binding === 'string' && binding.trim().length > 0;
      const hasDefault =
        Object.prototype.hasOwnProperty.call(defaultValues, inputField.name) &&
        defaultValues[inputField.name] !== undefined &&
        defaultValues[inputField.name] !== '';

      if (inputField.required && !hasBinding && !hasDefault) {
        issues.push({
          type: 'error',
          message: `输入字段 ${inputField.name} 为必填，当前既未映射也未配置默认值。`,
        });
      }
    });

    if (paramOverrideMode === 'PRIVATE_OVERRIDE' && Object.keys(paramOverrides).length === 0) {
      issues.push({ type: 'warning', message: '当前启用了“节点私有覆盖”，但尚未配置任何覆盖项。' });
    }

    if (currentTimeoutMs > 90000) {
      issues.push({ type: 'warning', message: '超时时间较高，可能导致实例长时间占用资源。' });
    }

    if (currentRetryCount >= 3) {
      issues.push({ type: 'warning', message: '重试次数较高，可能增加下游服务压力与调用成本。' });
    }

    if (!isEnabled) {
      issues.push({ type: 'info', message: '节点当前处于禁用状态，流程执行时会跳过该节点。' });
    }

    return issues;
  }, [
    currentRetryCount,
    currentTimeoutMs,
    defaultValues,
    inputBindings,
    isEnabled,
    nodeName,
    nodeTypeConfig?.inputsSchema,
    paramOverrideMode,
    paramOverrides,
  ]);

  const capabilityContent = (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {!isBusinessView ? (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isExpertView ? '专家视图：支持源码配置' : '增强视图：推荐使用可视化表单'}
          </Text>
          <Segmented
            size="small"
            options={[
              { label: '表单', value: 'ui' },
              { label: '源码', value: 'json' },
            ]}
            value={viewMode}
            onChange={(value) => setViewMode(value as 'ui' | 'json')}
          />
        </Space>
      ) : null}

      {!isBusinessView && viewMode === 'json' ? (
        <Input.TextArea
          value={JSON.stringify(config, null, 2)}
          onChange={(event) => {
            try {
              const nextConfig = JSON.parse(event.target.value);
              onUpdateNode?.(selectedNode.id, { config: nextConfig });
            } catch {
              // typing in progress
            }
          }}
          autoSize={{ minRows: 10, maxRows: 30 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      ) : (
        <>
          {NODE_FORM_REGISTRY[nodeType] ? (
            React.createElement(NODE_FORM_REGISTRY[nodeType], {
              config,
              onChange: handleConfigChange,
              currentNodeId: selectedNode.id,
            })
          ) : (
            <Form layout="vertical" size="small">
              {Object.entries(config)
                .filter(([key]) => !key.startsWith('_'))
                .map(([key, value]) => (
                  <Form.Item key={key} label={key} style={{ marginBottom: 12 }}>
                    {renderConfigField(
                      key,
                      value,
                      (nextValue) => handleConfigChange(key, nextValue),
                      selectedNode.id,
                    )}
                  </Form.Item>
                ))}
            </Form>
          )}
        </>
      )}

      {!isBusinessView ? (
        <ParameterOverrideBuilder
          paramOverrideMode={paramOverrideMode}
          paramOverrides={paramOverrides}
          defaultParameterSetCodes={paramSetBindings}
          onModeChange={(mode) => {
            handleConfigChange('paramOverrideMode', mode);
            if (mode === 'INHERIT') {
              handleConfigChange('paramOverrides', {});
            }
          }}
          onOverridesChange={(overrides) => handleConfigChange('paramOverrides', overrides)}
        />
      ) : null}
    </Space>
  );

  const runtimeContent = (
    <Form layout="vertical" size="small">
      <Form.Item
        label="策略预设"
        help="使用业务预设快速配置节点稳定性与性能；切到自定义可逐项调整。"
        style={{ marginBottom: 16 }}
      >
        <RuntimePresetCardComponent
          value={currentRuntimePreset}
          currentTimeout={currentTimeoutMs}
          currentRetry={currentRetryCount}
          onChange={(value) => {
            if (value === 'CUSTOM') return;
            const preset = applyRuntimePreset(value as 'FAST' | 'BALANCED' | 'ROBUST');
            handleRuntimePolicyChange('timeoutMs', preset.timeoutMs);
            handleRuntimePolicyChange('retryCount', preset.retryCount);
            handleRuntimePolicyChange('retryBackoffMs', preset.retryBackoffMs);
            handleRuntimePolicyChange('onError', preset.onError);
          }}
        />
      </Form.Item>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 12 }}
        message="当前策略摘要"
        description={`超时 ${currentTimeoutMs}ms，重试 ${currentRetryCount} 次，重试间隔 ${currentRetryBackoffMs}ms，错误策略 ${currentOnError}`}
      />

      <Form.Item label="超时 (ms)" style={{ marginBottom: 12 }}>
        <InputNumber
          value={currentTimeoutMs}
          min={1000}
          max={120000}
          step={5000}
          style={{ width: '100%' }}
          onChange={(value) => handleRuntimePolicyChange('timeoutMs', value)}
        />
      </Form.Item>

      {!isBusinessView ? (
        <>
          <Form.Item label="重试次数" style={{ marginBottom: 12 }}>
            <InputNumber
              value={currentRetryCount}
              min={0}
              max={5}
              style={{ width: '100%' }}
              onChange={(value) => handleRuntimePolicyChange('retryCount', value)}
            />
          </Form.Item>

          <Form.Item label="重试间隔 (ms)" style={{ marginBottom: 12 }}>
            <InputNumber
              value={currentRetryBackoffMs}
              min={0}
              max={60000}
              step={1000}
              style={{ width: '100%' }}
              onChange={(value) => handleRuntimePolicyChange('retryBackoffMs', value)}
            />
          </Form.Item>
        </>
      ) : null}

      <Form.Item label="错误策略" style={{ marginBottom: 12 }}>
        <Select
          value={currentOnError}
          onChange={(value) => handleRuntimePolicyChange('onError', value)}
          options={[
            { label: '立即失败', value: 'FAIL_FAST' },
            { label: '继续执行', value: 'CONTINUE' },
            { label: '错误路由', value: 'ROUTE_TO_ERROR' },
          ]}
        />
      </Form.Item>

      {!isBusinessView ? (
        <>
          <Form.Item label="缓存策略" style={{ marginBottom: 12 }}>
            <Select
              value={currentCachePolicy}
              onChange={(value) => handleRuntimePolicyChange('cachePolicy', value)}
              options={[
                { label: '不缓存', value: 'NONE' },
                { label: '本地缓存', value: 'LOCAL' },
                { label: '共享缓存', value: 'SHARED' },
              ]}
            />
          </Form.Item>

          {currentCachePolicy === 'LOCAL' || currentCachePolicy === 'SHARED' ? (
            <Form.Item label="缓存时长 (秒)" style={{ marginBottom: 12 }}>
              <InputNumber
                value={(runtimePolicy.cacheTtlSec as number) ?? 300}
                min={1}
                style={{ width: '100%' }}
                onChange={(value) => handleRuntimePolicyChange('cacheTtlSec', value)}
              />
            </Form.Item>
          ) : null}

          <Form.Item label="审计级别" style={{ marginBottom: 12 }}>
            <Select
              value={currentAuditLevel}
              onChange={(value) => handleRuntimePolicyChange('auditLevel', value)}
              options={[
                { label: '无', value: 'NONE' },
                { label: '基础', value: 'BASIC' },
                { label: '完整', value: 'FULL' },
              ]}
            />
          </Form.Item>
        </>
      ) : null}
    </Form>
  );

  const tabs = [
    {
      key: 'overview',
      label: '概览',
      children: (
        <div style={{ paddingRight: 4 }}>
          <Form layout="vertical" size="small" style={{ marginBottom: 0 }}>
            <Form.Item label="节点名称" style={{ marginBottom: 12 }}>
              <Input
                value={nodeName}
                onChange={(event) => handleFieldChange('name', event.target.value)}
              />
            </Form.Item>

            <Form.Item label="节点类型" style={{ marginBottom: 12 }}>
              <Space>
                <Tag color={nodeTypeConfig?.color}>{nodeTypeConfig?.label ?? nodeType}</Tag>
                {!isBusinessView ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {selectedNode.id}
                  </Text>
                ) : null}
              </Space>
            </Form.Item>

            <Form.Item label="启用" style={{ marginBottom: 12 }}>
              <Switch
                checked={isEnabled}
                onChange={(value) => handleFieldChange('enabled', value)}
                size="small"
              />
            </Form.Item>

            <Form.Item label="描述" style={{ marginBottom: 12 }}>
              <Input.TextArea
                value={nodeData.description as string}
                onChange={(event) => handleFieldChange('description', event.target.value)}
                rows={2}
                placeholder="节点描述..."
              />
            </Form.Item>

            {!isBusinessView ? (
              <Form.Item label="标签 (Tags)" style={{ marginBottom: 12 }}>
                <Select
                  mode="tags"
                  value={nodeTags}
                  onChange={(value) => handleFieldChange('tags', value)}
                  tokenSeparators={[',']}
                  placeholder="添加标签..."
                  size="small"
                />
              </Form.Item>
            ) : null}
          </Form>
        </div>
      ),
    },
    {
      key: 'inputs',
      label: '输入',
      children:
        nodeTypeConfig?.inputsSchema && nodeTypeConfig.inputsSchema.length > 0 ? (
          <div style={{ paddingRight: 4 }}>
            <InputMappingMatrix
              currentNodeId={selectedNode.id}
              inputsSchema={nodeTypeConfig.inputsSchema}
              inputBindings={inputBindings}
              defaultValues={defaultValues}
              nullPolicies={nullPolicies}
              onInputBindingChange={handleInputBindingChange}
              onInputBindingsChange={handleInputBindingsChange}
              onDefaultValueChange={handleDefaultValueChange}
              onNullPolicyChange={handleNullPolicyChange}
            />
          </div>
        ) : (
          <div style={{ paddingRight: 4 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点无输入字段" />
          </div>
        ),
    },
    {
      key: 'capability',
      label: '能力',
      children: (
        <div style={{ paddingRight: 4 }}>
          {capabilityContent}
        </div>
      ),
    },
    {
      key: 'runtime',
      label: '运行',
      children: (
        <div style={{ paddingRight: 4 }}>
          {runtimeContent}
        </div>
      ),
    },
    {
      key: 'validation',
      label: '校验',
      children: (
        <div style={{ paddingRight: 4 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {validationIssues.length === 0 ? (
              <Alert type="success" showIcon message="当前配置通过基础校验" />
            ) : (
              validationIssues.map((issue, index) => (
                <Alert
                  key={`${issue.type}-${index}`}
                  type={issue.type === 'info' ? 'info' : issue.type}
                  showIcon
                  message={issue.message}
                />
              ))
            )}

            <Alert
              type="info"
              showIcon
              message="配置摘要"
              description={[
                `输入映射数: ${Object.keys(inputBindings).filter((key) => (inputBindings[key] ?? '').trim().length > 0).length}`,
                `默认值数: ${Object.keys(defaultValues).length}`,
                `参数覆盖模式: ${paramOverrideMode}`,
                `参数覆盖项: ${Object.keys(paramOverrides).length}`,
              ].join(' | ')}
            />

            {!isBusinessView ? (
              <Alert
                type="warning"
                showIcon
                message="调试信息"
                description={`Node ${selectedNode.id} / Type ${nodeType}`}
              />
            ) : null}

            {currentDsl && nodeTypeConfig?.inputsSchema && nodeTypeConfig.inputsSchema.length > 0 ? (
              <NodeDryRunPreview
                nodeId={selectedNode.id}
                currentDsl={currentDsl}
                inputsSchema={nodeTypeConfig.inputsSchema}
                inputBindings={inputBindings}
                defaultValues={defaultValues}
                nullPolicies={nullPolicies}
                onLocateField={() => setActiveTab('inputs')}
                onFocusNode={onFocusNode}
              />
            ) : null}
          </Space>
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        width: 420,
        height: '100%',
        background: token.colorBgContainer,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
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
          {nodeTypeConfig ? (
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
          ) : null}
          <Text strong style={{ fontSize: 14 }}>
            节点属性
          </Text>
        </Space>
        <CloseOutlined
          style={{ cursor: 'pointer', color: token.colorTextSecondary }}
          onClick={onClose}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 0 12px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabs}
          size="small"
          tabBarStyle={{ marginBottom: 8 }}
        />
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
    return <InputNumber value={value} onChange={onChange} style={{ width: '100%' }} />;
  }
  if (typeof value === 'string') {
    if (
      value.length > 80 ||
      key.includes('expression') ||
      key.includes('prompt') ||
      key.includes('Template')
    ) {
      return (
        <ExpressionEditor
          value={value}
          onChange={(nextValue) => onChange(nextValue)}
          currentNodeId={nodeId}
          placeholder="输入表达式或变量引用"
        />
      );
    }
    return <Input value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return (
      <Input.TextArea
        value={JSON.stringify(value, null, 2)}
        onChange={(event) => {
          try {
            onChange(JSON.parse(event.target.value));
          } catch {
            // typing in progress
          }
        }}
        autoSize={{ minRows: 2, maxRows: 6 }}
        style={{ fontFamily: 'monospace', fontSize: 11 }}
      />
    );
  }
  return (
    <Input value={formatIssueMessage(value)} onChange={(event) => onChange(event.target.value)} />
  );
}

// ── Edge Property Panel ──

interface EdgePropertyPanelProps {
  selectedEdge: Edge;
  onUpdateEdge: (
    edgeId: string,
    data: Partial<Record<string, unknown>> & { type?: string },
  ) => void;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              background: token.colorPrimaryBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: token.colorPrimary,
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

          {edgeType === 'condition-edge' ? (
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
          ) : null}

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

function getFlowEdgeType(_edgeType: string): string {
  return 'smoothstep';
}
