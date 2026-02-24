import React, { useMemo } from 'react';
import {
  Alert,
  AutoComplete,
  Card,
  Descriptions,
  Form,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useAgentProfiles } from '../../../workflow-agent-center/api';

const { Text } = Typography;

interface SingleAgentFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

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

  return (
    <Form layout="vertical" size="small">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="已启用简化配置模式"
        description="默认继承智能体中心配置，仅保留最常用的执行参数。"
      />
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
            以上为该智能体的默认配置，节点将自动继承。
          </Text>
        </Card>
      )}

      {/* ── 节点独有配置：创意度 + 推理开关 ── */}
      <Form.Item label="创意度 (Temperature)" extra="数值越高，AI 回答越发散越具创造力；越低则越严谨、越稳定">
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
            是否在最终结果中一并保留大模型的思考分析过程
          </Text>
        </Space>
      </Form.Item>

      {/* ── 模型覆盖（可选）── */}
      <Form.Item label="强行指定运行模型 (可选)" extra="留空则使用智能体本身的默认模型。在这里选择则无视本身设置强行替换成新模型。">
        <AutoComplete
          value={(config.modelOverride as string) ?? (config.model as string)}
          onChange={(value) => {
            onChange('modelOverride', value);
            onChange('model', value);
          }}
          options={[
            { value: 'openai/gpt-4o' },
            { value: 'openai/gpt-4o-mini' },
            { value: 'anthropic/claude-3-5-sonnet-latest' },
            { value: 'google/gemini-1.5-pro-latest' },
            { value: 'google/gemini-1.5-flash-latest' },
            { value: 'deepseek/deepseek-chat' },
            { value: 'deepseek/deepseek-reasoner' },
          ]}
          placeholder="例如：openai/gpt-4o"
        />
      </Form.Item>
    </Form>
  );
};
