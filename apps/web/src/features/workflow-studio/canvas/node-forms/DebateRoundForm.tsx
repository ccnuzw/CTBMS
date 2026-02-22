import React from 'react';
import { Button, Card, Form, Input, InputNumber, Select, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useAgentProfiles } from '../../../workflow-agent-center/api';

interface DebateRoundFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

interface DebateParticipant {
  agentCode: string;
  role?: string;
  perspective?: string;
  weight?: number;
}

interface DebateParticipantEditor extends DebateParticipant {
  id: string;
}

const { Text } = Typography;

const createParticipant = (seed?: Partial<DebateParticipant>): DebateParticipantEditor => ({
  id: `participant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  agentCode: seed?.agentCode ?? '',
  role: seed?.role ?? '',
  perspective: seed?.perspective ?? '',
  weight: seed?.weight ?? 1,
});

const normalizeParticipants = (raw: unknown): DebateParticipantEditor[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return createParticipant({ agentCode: item, role: item });
      }
      if (!item || typeof item !== 'object') {
        return null;
      }
      const data = item as Record<string, unknown>;
      return createParticipant({
        agentCode: (data.agentCode as string) ?? '',
        role: (data.role as string) ?? '',
        perspective: (data.perspective as string) ?? '',
        weight:
          typeof data.weight === 'number'
            ? data.weight
            : data.weight === null || data.weight === undefined
              ? 1
              : Number(data.weight) || 1,
      });
    })
    .filter((item): item is DebateParticipantEditor => Boolean(item));
};

const toParticipantsConfig = (items: DebateParticipantEditor[]): DebateParticipant[] =>
  items
    .filter((item) => item.agentCode.trim())
    .map((item) => ({
      agentCode: item.agentCode.trim(),
      role: item.role?.trim() || undefined,
      perspective: item.perspective?.trim() || undefined,
      weight: typeof item.weight === 'number' ? item.weight : undefined,
    }));

export const DebateRoundForm: React.FC<DebateRoundFormProps> = ({ config, onChange }) => {
  const { data: agentProfilePage, isLoading } = useAgentProfiles({
    includePublic: true,
    isActive: true,
    page: 1,
    pageSize: 200,
  });

  const [participants, setParticipants] = React.useState<DebateParticipantEditor[]>(
    normalizeParticipants(config.participants),
  );

  React.useEffect(() => {
    setParticipants(normalizeParticipants(config.participants));
  }, [config.participants]);

  const applyParticipants = (nextParticipants: DebateParticipantEditor[]) => {
    setParticipants(nextParticipants);
    onChange('participants', toParticipantsConfig(nextParticipants));
  };

  const updateParticipant = (id: string, patch: Partial<DebateParticipantEditor>) => {
    const nextParticipants = participants.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    applyParticipants(nextParticipants);
  };

  const addParticipant = () => {
    applyParticipants([...participants, createParticipant()]);
  };

  const removeParticipant = (id: string) => {
    applyParticipants(participants.filter((item) => item.id !== id));
  };

  const usedAgentCodes = new Set(participants.map((item) => item.agentCode).filter(Boolean));

  return (
    <Form layout="vertical" size="small">
      <Form.Item label="最大轮次">
        <InputNumber
          min={1}
          max={10}
          value={(config.maxRounds as number) ?? 3}
          onChange={(value) => onChange('maxRounds', value)}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item label="裁判策略">
        <Select
          value={(config.judgePolicy as string) ?? 'WEIGHTED'}
          onChange={(value) => onChange('judgePolicy', value)}
          options={[
            { label: '加权投票', value: 'WEIGHTED' },
            { label: '一票否决', value: 'VETO' },
            { label: '多数决', value: 'MAJORITY' },
          ]}
        />
      </Form.Item>

      <Card
        size="small"
        title="参与者配置"
        extra={
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addParticipant}>
            添加参与者
          </Button>
        }
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            通过可视化方式配置每个辩手的身份、立场与权重。
          </Text>

          {participants.length === 0 ? <Text type="secondary">暂无参与者，请先添加。</Text> : null}

          {participants.map((participant, index) => (
            <Card
              key={participant.id}
              size="small"
              title={<Tag color="blue">参与者 {index + 1}</Tag>}
              extra={
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeParticipant(participant.id)}
                />
              }
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Select
                  showSearch
                  loading={isLoading}
                  value={participant.agentCode || undefined}
                  placeholder="选择智能体"
                  options={(agentProfilePage?.data || [])
                    .filter((item) => item.isActive)
                    .map((item) => ({
                      label: `${item.agentName} (${item.agentCode})`,
                      value: item.agentCode,
                      disabled:
                        item.agentCode !== participant.agentCode &&
                        usedAgentCodes.has(item.agentCode),
                    }))}
                  onChange={(value) => updateParticipant(participant.id, { agentCode: value })}
                />

                <Input
                  value={participant.role}
                  onChange={(event) =>
                    updateParticipant(participant.id, { role: event.target.value })
                  }
                  placeholder="角色（如：多头分析师）"
                />

                <Input.TextArea
                  value={participant.perspective}
                  onChange={(event) =>
                    updateParticipant(participant.id, { perspective: event.target.value })
                  }
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder="观点立场（如：强调成本驱动与库存收缩）"
                />

                <InputNumber
                  min={0}
                  max={5}
                  step={0.1}
                  value={participant.weight ?? 1}
                  onChange={(value) =>
                    updateParticipant(participant.id, { weight: value === null ? 1 : value })
                  }
                  style={{ width: '100%' }}
                  addonBefore="权重"
                />
              </Space>
            </Card>
          ))}
        </Space>
      </Card>
    </Form>
  );
};
