import React from 'react';
import { Collapse, Form, Input, Select, Slider, Space, Switch, Typography } from 'antd';
import { useAgentProfiles } from '../../../workflow-agent-center/api';
import { StructuredPromptBuilder } from '../../../workflow-agent-center/components/StructuredPromptBuilder';
import { OutputSchemaBuilder } from '../../../workflow-agent-center/components/OutputSchemaBuilder';
import { VisualGuardrailsBuilder } from '../../../workflow-agent-center/components/VisualGuardrailsBuilder';
import { VisualToolPolicyBuilder } from '../../../workflow-agent-center/components/VisualToolPolicyBuilder';

const { Text } = Typography;

interface SingleAgentFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const stringifySchema = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const parseSchemaValue = (value: string): unknown => {
  const raw = value.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
};

export const SingleAgentForm: React.FC<SingleAgentFormProps> = ({ config, onChange }) => {
  const { data: agentProfilePage, isLoading } = useAgentProfiles({
    includePublic: true,
    isActive: true,
    page: 1,
    pageSize: 200,
  });

  const selectedAgentCode = (config.agentProfileCode as string) || (config.agentCode as string);

  return (
    <Form layout="vertical" size="small">
      <Form.Item label="智能体" required>
        <Select
          value={selectedAgentCode}
          onChange={(value) => {
            onChange('agentProfileCode', value);
            onChange('agentCode', value);
          }}
          loading={isLoading}
          showSearch
          optionFilterProp="label"
          options={(agentProfilePage?.data || [])
            .filter((item) => item.isActive)
            .map((item) => ({
              label: `${item.agentName} (${item.agentCode})`,
              value: item.agentCode,
            }))}
          placeholder="选择智能体配置"
        />
      </Form.Item>

      <Form.Item label="模型覆盖（可选）" extra="不填则使用智能体默认模型">
        <Input
          value={(config.modelOverride as string) ?? (config.model as string)}
          onChange={(event) => {
            onChange('modelOverride', event.target.value);
            onChange('model', event.target.value);
          }}
          placeholder="例如：openai/gpt-4.1"
        />
      </Form.Item>

      <Form.Item label="创意度 (Creativity)" extra="数值越高回答越发散，越低越严谨">
        <Slider
          min={0}
          max={1}
          step={0.1}
          value={(config.temperatureOverride as number) ?? (config.temperature as number) ?? 0.7}
          onChange={(value) => {
            onChange('temperatureOverride', value);
            onChange('temperature', value);
          }}
          marks={{ 0: '严谨', 0.5: '平衡', 1: '发散' }}
        />
      </Form.Item>

      <Form.Item label="输出要求" style={{ marginBottom: 8 }}>
        <Space size={8}>
          <Switch
            checked={Boolean(config.returnReasoning ?? true)}
            onChange={(checked) => onChange('returnReasoning', checked)}
            checkedChildren="推理过程"
            unCheckedChildren="仅结论"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            控制输出中是否保留推理说明字段。
          </Text>
        </Space>
      </Form.Item>

      <Collapse
        size="small"
        defaultActiveKey={['prompt', 'schema']}
        items={[
          {
            key: 'prompt',
            label: '提示词配置',
            children: (
              <StructuredPromptBuilder
                value={(config.systemPrompt as string) ?? ''}
                onChange={(value) => {
                  onChange('systemPrompt', value);
                  onChange('systemPromptOverride', value);
                }}
              />
            ),
          },
          {
            key: 'schema',
            label: '输出结构',
            children: (
              <OutputSchemaBuilder
                value={stringifySchema(config.outputSchema)}
                onChange={(value) => {
                  onChange('outputSchema', parseSchemaValue(value));
                  if (value.trim()) {
                    onChange('outputSchemaCode', 'CUSTOM');
                  }
                }}
              />
            ),
          },
          {
            key: 'guardrails',
            label: '安全防护',
            children: (
              <VisualGuardrailsBuilder
                value={(config.guardrails as Record<string, unknown>) ?? {}}
                onChange={(value) => onChange('guardrails', value)}
              />
            ),
          },
          {
            key: 'tools',
            label: '工具策略',
            children: (
              <VisualToolPolicyBuilder
                value={
                  (config.toolPolicy as { allowedTools?: string[]; blockedTools?: string[] }) ?? {}
                }
                onChange={(value) => onChange('toolPolicy', value)}
              />
            ),
          },
        ]}
      />
    </Form>
  );
};
