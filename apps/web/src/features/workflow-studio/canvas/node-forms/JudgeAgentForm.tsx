import React from 'react';
import { Collapse, Form, Select } from 'antd';
import { useAgentProfiles } from '../../../workflow-agent-center/api';
import { StructuredPromptBuilder } from '../../../workflow-agent-center/components/StructuredPromptBuilder';
import { OutputSchemaBuilder } from '../../../workflow-agent-center/components/OutputSchemaBuilder';
import { VisualGuardrailsBuilder } from '../../../workflow-agent-center/components/VisualGuardrailsBuilder';
import { VisualToolPolicyBuilder } from '../../../workflow-agent-center/components/VisualToolPolicyBuilder';

interface FormProps {
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

export const JudgeAgentForm: React.FC<FormProps> = ({ config, onChange }) => {
  const { data: agentProfilePage, isLoading } = useAgentProfiles({
    includePublic: true,
    isActive: true,
    page: 1,
    pageSize: 200,
  });

  const selectedAgentCode = (config.agentProfileCode as string) || (config.agentCode as string);

  return (
    <Form layout="vertical" size="small">
      <Form.Item label="裁判智能体" required>
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
          placeholder="选择裁判智能体"
        />
      </Form.Item>

      <Form.Item label="裁决策略">
        <Select
          value={(config.judgePolicy as string) ?? 'WEIGHTED'}
          onChange={(value) => onChange('judgePolicy', value)}
          options={[
            { label: '加权评分', value: 'WEIGHTED' },
            { label: '全票通过', value: 'UNANIMOUS' },
            { label: '多数票', value: 'MAJORITY' },
            { label: '一票否决', value: 'VETO' },
          ]}
        />
      </Form.Item>

      <Collapse
        size="small"
        defaultActiveKey={['rubric']}
        items={[
          {
            key: 'rubric',
            label: '评分标准与裁决指令',
            children: (
              <StructuredPromptBuilder
                value={(config.rubric as string) ?? ''}
                onChange={(value) => onChange('rubric', value)}
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
