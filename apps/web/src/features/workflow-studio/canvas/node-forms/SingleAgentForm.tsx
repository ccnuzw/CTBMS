import React, { useMemo } from 'react';
import {
  Alert,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import { InfoCircleOutlined, SettingOutlined } from '@ant-design/icons';
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
  const { token } = theme.useToken();

  const { data: agentProfilePage, isLoading } = useAgentProfiles({
    includePublic: true,
    isActive: true,
    page: 1,
    pageSize: 200,
  });

  const selectedAgentCode = (config.agentProfileCode as string) || (config.agentCode as string);

  // 查找已选择的智能体的完整配置信息
  const selectedAgentProfile = useMemo(() => {
    if (!selectedAgentCode || !agentProfilePage?.data) return null;
    return agentProfilePage.data.find(
      (item) => item.agentCode === selectedAgentCode && item.isActive,
    );
  }, [selectedAgentCode, agentProfilePage?.data]);

  // 是否有任何高级覆盖项被填写
  const hasOverrides = useMemo(() => {
    const hasPrompt = Boolean(config.systemPrompt || config.systemPromptOverride);
    const hasSchema = Boolean(config.outputSchema);
    const hasGuardrails = Boolean(
      config.guardrails && Object.keys(config.guardrails as Record<string, unknown>).length > 0,
    );
    const hasToolPolicy = Boolean(
      config.toolPolicy && Object.keys(config.toolPolicy as Record<string, unknown>).length > 0,
    );
    return hasPrompt || hasSchema || hasGuardrails || hasToolPolicy;
  }, [config.systemPrompt, config.systemPromptOverride, config.outputSchema, config.guardrails, config.toolPolicy]);

  return (
    <Form layout="vertical" size="small">
      {/* ── 第一步：选择智能体（必填）── */}
      <Form.Item label="选择智能体" required>
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
          placeholder="请选择要使用的智能体"
        />
      </Form.Item>

      {/* ── 继承预览：展示选中智能体的默认配置 ── */}
      {selectedAgentProfile && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: token.colorFillQuaternary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Descriptions
            size="small"
            column={1}
            labelStyle={{ fontSize: 12, color: token.colorTextSecondary, width: 80 }}
            contentStyle={{ fontSize: 12 }}
          >
            <Descriptions.Item label="模型">
              {selectedAgentProfile.modelConfigKey || '默认模型'}
            </Descriptions.Item>
            <Descriptions.Item label="提示词">
              {selectedAgentProfile.agentPromptCode || '未设置'}
            </Descriptions.Item>
            <Descriptions.Item label="输出结构">
              {selectedAgentProfile.outputSchemaCode || '默认'}
            </Descriptions.Item>
          </Descriptions>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <InfoCircleOutlined style={{ marginRight: 4 }} />
            以上为该智能体的默认配置，如需修改请展开下方"高级覆盖"
          </Text>
        </Card>
      )}

      {/* ── 节点独有配置：创意度 + 推理开关 ── */}
      <Form.Item label="创意度" extra="数值越高回答越发散，越低越严谨">
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

      <Form.Item label="输出要求" style={{ marginBottom: 16 }}>
        <Space size={8}>
          <Switch
            checked={Boolean(config.returnReasoning ?? true)}
            onChange={(checked) => onChange('returnReasoning', checked)}
            checkedChildren="含推理"
            unCheckedChildren="仅结论"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            是否在输出中包含推理分析过程
          </Text>
        </Space>
      </Form.Item>

      {/* ── 模型覆盖（可选）── */}
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

      {/* ── 高级覆盖（默认折叠）── */}
      <Collapse
        size="small"
        defaultActiveKey={hasOverrides ? ['advanced'] : []}
        items={[
          {
            key: 'advanced',
            label: (
              <Space size={8}>
                <SettingOutlined />
                <span>高级覆盖</span>
                {hasOverrides && (
                  <Text type="warning" style={{ fontSize: 11 }}>
                    已自定义
                  </Text>
                )}
              </Space>
            ),
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="以下配置项不填写则自动继承智能体的默认设置"
                  style={{ marginBottom: 0 }}
                />

                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'prompt',
                      label: '提示词覆盖',
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
                      label: '输出结构覆盖',
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
                      label: '安全防护覆盖',
                      children: (
                        <VisualGuardrailsBuilder
                          value={(config.guardrails as Record<string, unknown>) ?? {}}
                          onChange={(value) => onChange('guardrails', value)}
                        />
                      ),
                    },
                    {
                      key: 'tools',
                      label: '工具策略覆盖',
                      children: (
                        <VisualToolPolicyBuilder
                          value={
                            (config.toolPolicy as {
                              allowedTools?: string[];
                              blockedTools?: string[];
                            }) ?? {}
                          }
                          onChange={(value) => onChange('toolPolicy', value)}
                        />
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />
    </Form>
  );
};
