import { Card, Empty, Segmented, Slider, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { KNOWLEDGE_RELATION_LABELS, KNOWLEDGE_TYPE_LABELS } from '../constants/knowledge-labels';

const { Text } = Typography;

type Node = {
  id: string;
  title: string;
  type: string;
};

type Relation = {
  id: string;
  relationType: string;
  weight: number;
  evidence?: string | null;
  toKnowledge?: Node;
  fromKnowledge?: Node;
};

type Props = {
  center: Node;
  outgoing: Relation[];
  incoming: Relation[];
  onJump: (id: string) => void;
};

const RELATION_COLORS: Record<string, string> = {
  WEEKLY_ROLLUP_OF: '#1677ff',
  DERIVED_FROM: '#52c41a',
  SAME_TOPIC: '#722ed1',
  CITES: '#13c2c2',
  FOLLOW_UP: '#fa8c16',
  CONTRADICTS: '#f5222d',
};

const RELATION_LABELS = KNOWLEDGE_RELATION_LABELS;
const NODE_TYPE_LABELS = KNOWLEDGE_TYPE_LABELS;

const NODE_TYPE_COLORS: Record<string, string> = {
  DAILY: 'blue',
  WEEKLY: 'processing',
  MONTHLY: 'gold',
  RESEARCH: 'green',
  AI_REPORT: 'geekblue',
};

export const KnowledgeRelationGraph: React.FC<Props> = ({ center, outgoing, incoming, onJump }) => {
  const [relationType, setRelationType] = useState<string>('ALL');
  const [minWeight, setMinWeight] = useState<number>(0);
  const [onlyKeyChain, setOnlyKeyChain] = useState<boolean>(false);

  const threshold = onlyKeyChain ? Math.max(minWeight, 80) : minWeight;

  const relationTypes = useMemo(
    () => Array.from(new Set([...outgoing, ...incoming].map((item) => item.relationType))).sort(),
    [incoming, outgoing],
  );

  const filterRelations = (items: Relation[]) =>
    items.filter((item) => {
      if (relationType !== 'ALL' && item.relationType !== relationType) return false;
      if (item.weight < threshold) return false;
      return true;
    });

  const visibleOutgoing = filterRelations(outgoing).slice(0, 15);
  const visibleIncoming = filterRelations(incoming).slice(0, 15);

  const renderNode = (node: Node, relation: Relation, direction: 'left' | 'right') => {
    const lineColor = RELATION_COLORS[relation.relationType] || '#8c8c8c';
    return (
      <Tooltip
        title={`${RELATION_LABELS[relation.relationType] || relation.relationType} | 权重 ${relation.weight}${relation.evidence ? ` | ${relation.evidence}` : ''}`}
      >
        <div
          onClick={() => onJump(node.id)}
          style={{
            border: `1px solid ${lineColor}`,
            borderRadius: 10,
            padding: '8px 10px',
            maxWidth: 230,
            background: '#fff',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            textAlign: direction === 'left' ? 'right' : 'left',
          }}
        >
          <Text strong ellipsis style={{ maxWidth: 190, display: 'inline-block' }}>
            {node.title}
          </Text>
          <div style={{ marginTop: 6 }}>
            <Tag color={NODE_TYPE_COLORS[node.type] || 'default'}>
              {NODE_TYPE_LABELS[node.type] || node.type}
            </Tag>
            <Tag color="default">W{relation.weight}</Tag>
          </div>
        </div>
      </Tooltip>
    );
  };

  return (
    <Card title="关系图谱">
      <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }} size={10}>
        <Space wrap>
          <Segmented
            value={relationType}
            onChange={(value) => setRelationType(String(value))}
            options={[
              { label: '全部关系', value: 'ALL' },
              ...relationTypes.map((value) => ({
                label: RELATION_LABELS[value] || value,
                value,
              })),
            ]}
          />
          <Space>
            <Text>仅关键链路</Text>
            <Switch checked={onlyKeyChain} onChange={setOnlyKeyChain} />
          </Space>
        </Space>
        <Space style={{ width: '100%' }}>
          <Text type="secondary" style={{ minWidth: 88 }}>
            最小权重：{threshold}
          </Text>
          <Slider
            style={{ flex: 1, marginBottom: 0 }}
            min={0}
            max={100}
            step={5}
            value={minWeight}
            onChange={setMinWeight}
            disabled={onlyKeyChain}
          />
          <Text type="secondary">每侧最多 15 条</Text>
        </Space>
      </Space>

      {visibleOutgoing.length === 0 && visibleIncoming.length === 0 ? (
        <Empty description="当前筛选下暂无可视化关系" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 220px 1fr',
            gap: 16,
            alignItems: 'center',
            minHeight: 220,
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}
          >
            {visibleIncoming.map((relation) =>
              relation.fromKnowledge ? (
                <div key={relation.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {renderNode(relation.fromKnowledge, relation, 'left')}
                  <div
                    style={{
                      width: 22,
                      borderTop: `2px solid ${RELATION_COLORS[relation.relationType] || '#8c8c8c'}`,
                    }}
                  />
                </div>
              ) : null,
            )}
          </div>

          <div
            style={{
              border: '2px solid #1677ff',
              borderRadius: 12,
              padding: '16px 14px',
              textAlign: 'center',
              background: 'linear-gradient(160deg, #f0f5ff 0%, #ffffff 100%)',
            }}
          >
            <Text strong>{center.title}</Text>
            <div>
              <Tag color={NODE_TYPE_COLORS[center.type] || 'processing'} style={{ marginTop: 8 }}>
                {NODE_TYPE_LABELS[center.type] || center.type}
              </Tag>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleOutgoing.map((relation) =>
              relation.toKnowledge ? (
                <div key={relation.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 22,
                      borderTop: `2px solid ${RELATION_COLORS[relation.relationType] || '#8c8c8c'}`,
                    }}
                  />
                  {renderNode(relation.toKnowledge, relation, 'right')}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
