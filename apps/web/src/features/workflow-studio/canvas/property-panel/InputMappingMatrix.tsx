import React from 'react';
import { App, Button, Card, Empty, Input, Radio, Select, Space, Tag, Typography } from 'antd';
import { LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useReactFlow } from '@xyflow/react';
import { ExpressionEditor } from '../ExpressionEditor';
import { VariableSelector } from '../VariableSelector';
import { getNodeTypeConfig } from '../nodeTypeRegistry';

const { Text } = Typography;

interface InputFieldSchema {
  name: string;
  type: string;
  required?: boolean;
}

type SourceMode = 'upstream' | 'constant' | 'expression';

interface UpstreamFieldCandidate {
  nodeId: string;
  nodeName: string;
  fieldName: string;
  fieldType: string;
  depth: number;
}

interface InputMappingMatrixProps {
  currentNodeId: string;
  inputsSchema: InputFieldSchema[];
  inputBindings: Record<string, string>;
  defaultValues: Record<string, unknown>;
  nullPolicies: Record<string, string>;
  onInputBindingChange: (key: string, value: string) => void;
  onInputBindingsChange: (nextBindings: Record<string, string>) => void;
  onDefaultValueChange: (key: string, value: unknown) => void;
  onNullPolicyChange: (key: string, value: string) => void;
}

const isSimpleVariableBinding = (value?: string): boolean => {
  if (!value) return false;
  return /^\{\{[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+\}\}$/.test(value.trim());
};

const parseVariableBinding = (value?: string): { nodeId: string; fieldName: string } | null => {
  if (!isSimpleVariableBinding(value)) return null;
  const match = value?.trim().match(/^\{\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)\}\}$/);
  if (!match) return null;
  return { nodeId: match[1], fieldName: match[2] };
};

const detectSourceMode = (bindingValue: string | undefined): SourceMode => {
  if (!bindingValue || !bindingValue.trim()) return 'constant';
  if (isSimpleVariableBinding(bindingValue)) return 'upstream';
  return 'expression';
};

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
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

const areFieldTypesCompatible = (expectedType: string, actualType: string): boolean => {
  if (!expectedType || !actualType) return true;
  if (expectedType === actualType) return true;
  if (expectedType === 'any' || actualType === 'any') return true;
  if (expectedType === 'number' && actualType === 'integer') return true;
  if (expectedType === 'object' && actualType === 'json') return true;
  if (expectedType === 'array' && actualType === 'list') return true;
  return false;
};

export const InputMappingMatrix: React.FC<InputMappingMatrixProps> = ({
  currentNodeId,
  inputsSchema,
  inputBindings,
  defaultValues,
  nullPolicies,
  onInputBindingChange,
  onInputBindingsChange,
  onDefaultValueChange,
  onNullPolicyChange,
}) => {
  const { message } = App.useApp();
  const { getNodes, getEdges } = useReactFlow();

  const upstreamFieldCatalog = React.useMemo<UpstreamFieldCandidate[]>(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const incomingMap = new Map<string, string[]>();

    edges.forEach((edge) => {
      const sources = incomingMap.get(edge.target) ?? [];
      sources.push(edge.source);
      incomingMap.set(edge.target, sources);
    });

    const queue: Array<{ id: string; depth: number }> = [{ id: currentNodeId, depth: 0 }];
    const visited = new Set<string>();
    const upstreamDepth = new Map<string, number>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const sources = incomingMap.get(current.id) ?? [];
      for (const sourceId of sources) {
        if (sourceId === currentNodeId) continue;
        const nextDepth = current.depth + 1;
        const previousDepth = upstreamDepth.get(sourceId);
        if (previousDepth === undefined || nextDepth < previousDepth) {
          upstreamDepth.set(sourceId, nextDepth);
        }
        if (!visited.has(sourceId)) {
          visited.add(sourceId);
          queue.push({ id: sourceId, depth: nextDepth });
        }
      }
    }

    return [...visited]
      .map((nodeId) => {
        const node = nodeMap.get(nodeId);
        if (!node) return [];
        const nodeTypeConfig = getNodeTypeConfig((node.data?.type as string) ?? '');
        const outputFields =
          nodeTypeConfig?.outputFields ??
          nodeTypeConfig?.outputsSchema?.map((schemaField) => ({
            name: schemaField.name,
            label: schemaField.name,
            type: schemaField.type,
          })) ??
          [];

        return outputFields.map((outputField) => ({
          nodeId,
          nodeName: (node.data?.name as string) ?? nodeId,
          fieldName: outputField.name,
          fieldType: outputField.type,
          depth: upstreamDepth.get(nodeId) ?? 99,
        }));
      })
      .flat()
      .sort((a, b) => a.depth - b.depth);
  }, [currentNodeId, getEdges, getNodes]);

  const handleAutoMap = () => {
    const nextBindings: Record<string, string> = { ...inputBindings };
    let mappedCount = 0;

    inputsSchema.forEach((field) => {
      const existing = nextBindings[field.name];
      if (existing && existing.trim()) return;
      const matched = upstreamFieldCatalog.find((item) => item.fieldName === field.name);
      if (!matched) return;
      nextBindings[field.name] = `{{${matched.nodeId}.${matched.fieldName}}}`;
      mappedCount += 1;
    });

    if (mappedCount === 0) {
      message.info('未找到可自动映射的同名字段');
      return;
    }

    onInputBindingsChange(nextBindings);
    message.success(`已自动映射 ${mappedCount} 个字段`);
  };

  if (!inputsSchema.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点无需配置输入映射" />;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          按字段配置来源，可选上游字段、常量值或高级表达式。
        </Text>
        <Button size="small" icon={<ThunderboltOutlined />} onClick={handleAutoMap}>
          自动映射同名字段
        </Button>
      </Space>

      {inputsSchema.map((field) => {
        const currentBinding = inputBindings[field.name];
        const sourceMode = detectSourceMode(currentBinding);
        const parsedBinding = parseVariableBinding(currentBinding);
        const matchedUpstreamField = parsedBinding
          ? upstreamFieldCatalog.find(
              (item) =>
                item.nodeId === parsedBinding.nodeId && item.fieldName === parsedBinding.fieldName,
            )
          : undefined;
        const isTypeCompatible = matchedUpstreamField
          ? areFieldTypesCompatible(field.type, matchedUpstreamField.fieldType)
          : true;

        return (
          <Card key={field.name} size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space size={6}>
                  <Text strong>{field.name}</Text>
                  <Tag style={{ marginInlineEnd: 0 }}>{field.type}</Tag>
                  {field.required ? <Tag color="error">必填</Tag> : <Tag>选填</Tag>}
                </Space>
                <Select
                  size="small"
                  style={{ width: 120 }}
                  value={nullPolicies[field.name] ?? 'FAIL'}
                  onChange={(value) => onNullPolicyChange(field.name, value)}
                  options={[
                    { label: '空值报错', value: 'FAIL' },
                    { label: '使用默认', value: 'USE_DEFAULT' },
                    { label: '直接跳过', value: 'SKIP' },
                  ]}
                />
              </Space>

              <Radio.Group
                size="small"
                value={sourceMode}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: '上游字段', value: 'upstream' },
                  { label: '常量', value: 'constant' },
                  { label: '表达式', value: 'expression' },
                ]}
                onChange={(event) => {
                  const nextMode = event.target.value as SourceMode;
                  if (nextMode === 'constant') {
                    onInputBindingChange(field.name, '');
                    return;
                  }
                  if (nextMode === 'expression') {
                    if (!currentBinding) {
                      onInputBindingChange(field.name, '{{}}');
                    }
                    return;
                  }

                  const fallback = upstreamFieldCatalog.find(
                    (item) => item.fieldName === field.name,
                  );
                  if (fallback) {
                    onInputBindingChange(
                      field.name,
                      `{{${fallback.nodeId}.${fallback.fieldName}}}`,
                    );
                    return;
                  }
                  onInputBindingChange(field.name, '');
                }}
              />

              {sourceMode === 'upstream' ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <VariableSelector
                    currentNodeId={currentNodeId}
                    value={currentBinding}
                    onChange={(value) => onInputBindingChange(field.name, value)}
                  />
                  {matchedUpstreamField ? (
                    <Space size={6}>
                      <Tag icon={<LinkOutlined />}>
                        {matchedUpstreamField.nodeName}.{matchedUpstreamField.fieldName}
                      </Tag>
                      <Tag color={isTypeCompatible ? 'success' : 'warning'}>
                        {isTypeCompatible
                          ? `类型匹配 (${matchedUpstreamField.fieldType})`
                          : `类型可能不匹配 (${matchedUpstreamField.fieldType} -> ${field.type})`}
                      </Tag>
                    </Space>
                  ) : null}
                </Space>
              ) : null}

              {sourceMode === 'constant' ? (
                <Input
                  value={stringifyValue(defaultValues[field.name])}
                  onChange={(event) =>
                    onDefaultValueChange(field.name, parseLooseValue(event.target.value))
                  }
                  placeholder="输入常量值，支持数字/布尔/文本/JSON"
                />
              ) : null}

              {sourceMode === 'expression' ? (
                <ExpressionEditor
                  currentNodeId={currentNodeId}
                  value={currentBinding}
                  onChange={(value) => onInputBindingChange(field.name, value)}
                  placeholder={`为 ${field.name} 编写表达式`}
                />
              ) : null}
            </Space>
          </Card>
        );
      })}
    </Space>
  );
};
