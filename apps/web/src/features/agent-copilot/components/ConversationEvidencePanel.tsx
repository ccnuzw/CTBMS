import React, { useMemo, useState } from 'react';
import { Button, Card, Empty, Input, List, Select, Space, Spin, Tag, Typography } from 'antd';
import {
  ClockCircleOutlined,
  LinkOutlined,
  NodeIndexOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  useConversationEvidence,
  type ConversationEvidenceFreshness,
  type ConversationEvidenceItem,
  type ConversationEvidenceQuality,
} from '../api/conversations';

const { Text } = Typography;

interface ConversationEvidencePanelProps {
  sessionId: string | null;
}

const freshnessLabel: Record<ConversationEvidenceFreshness, string> = {
  FRESH: '新鲜',
  STALE: '滞后',
  UNKNOWN: '未知',
};

const freshnessColor: Record<ConversationEvidenceFreshness, string> = {
  FRESH: 'green',
  STALE: 'orange',
  UNKNOWN: 'default',
};

const qualityLabel: Record<ConversationEvidenceQuality, string> = {
  RECONCILED: '已对账',
  INTERNAL: '内部',
  EXTERNAL: '外部',
  UNVERIFIED: '待核验',
};

const qualityColor: Record<ConversationEvidenceQuality, string> = {
  RECONCILED: 'blue',
  INTERNAL: 'geekblue',
  EXTERNAL: 'purple',
  UNVERIFIED: 'default',
};

const formatTimestamp = (iso?: string | null): string => {
  if (!iso) {
    return '--';
  }
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) {
    return iso;
  }
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderEvidenceActions = (item: ConversationEvidenceItem) => (
  <Space size={8} wrap>
    {item.sourceUrl ? (
      <Button
        type="link"
        size="small"
        href={item.sourceUrl}
        target="_blank"
        icon={<LinkOutlined />}
      >
        来源
      </Button>
    ) : null}
    {item.tracePath ? (
      <Button
        type="link"
        size="small"
        icon={<NodeIndexOutlined />}
        onClick={() => {
          if (item.tracePath) {
            window.open(item.tracePath, '_blank');
          }
        }}
      >
        追溯
      </Button>
    ) : null}
  </Space>
);

export const ConversationEvidencePanel: React.FC<ConversationEvidencePanelProps> = ({
  sessionId,
}) => {
  const [sourceKeyword, setSourceKeyword] = useState('');
  const [freshness, setFreshness] = useState<'ALL' | ConversationEvidenceFreshness>('ALL');
  const [quality, setQuality] = useState<'ALL' | ConversationEvidenceQuality>('ALL');
  const [limit, setLimit] = useState<number>(50);

  const query = useMemo(
    () => ({
      limit,
      freshness: freshness === 'ALL' ? undefined : freshness,
      quality: quality === 'ALL' ? undefined : quality,
      source: sourceKeyword.trim() ? sourceKeyword.trim() : undefined,
    }),
    [freshness, limit, quality, sourceKeyword],
  );

  const evidenceQuery = useConversationEvidence(sessionId ?? undefined, query);

  if (!sessionId) {
    return <Empty description="请先选择会话" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (evidenceQuery.isLoading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const data = evidenceQuery.data;
  const items = data?.items ?? [];

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Space size={8} wrap>
        <Input
          allowClear
          value={sourceKeyword}
          onChange={(event) => setSourceKeyword(event.target.value)}
          prefix={<SearchOutlined />}
          placeholder="按来源/标题筛选"
          style={{ width: 200 }}
        />
        <Select
          value={freshness}
          onChange={setFreshness}
          style={{ width: 120 }}
          options={[
            { value: 'ALL', label: '全部时效' },
            { value: 'FRESH', label: '新鲜' },
            { value: 'STALE', label: '滞后' },
            { value: 'UNKNOWN', label: '未知' },
          ]}
        />
        <Select
          value={quality}
          onChange={setQuality}
          style={{ width: 120 }}
          options={[
            { value: 'ALL', label: '全部质量' },
            { value: 'RECONCILED', label: '已对账' },
            { value: 'INTERNAL', label: '内部' },
            { value: 'EXTERNAL', label: '外部' },
            { value: 'UNVERIFIED', label: '待核验' },
          ]}
        />
        <Select
          value={limit}
          onChange={setLimit}
          style={{ width: 100 }}
          options={[
            { value: 20, label: '20条' },
            { value: 50, label: '50条' },
            { value: 100, label: '100条' },
          ]}
        />
      </Space>

      {data?.traceability ? (
        <Space size={[6, 6]} wrap>
          <Tag color="blue">证据总数 {data.traceability.evidenceCount}</Tag>
          <Tag color="green">强证据 {data.traceability.strongEvidenceCount}</Tag>
          <Tag color="purple">外部证据 {data.traceability.externalEvidenceCount}</Tag>
          <Tag>筛选命中 {data.filteredCount}</Tag>
        </Space>
      ) : null}

      {evidenceQuery.isFetching ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          刷新中...
        </Text>
      ) : null}

      {items.length === 0 ? (
        <Empty description="暂无证据数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <Card size="small" style={{ width: '100%' }} bodyStyle={{ padding: '8px 10px' }}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space size={[6, 6]} wrap>
                    <Text strong>{item.title}</Text>
                    <Tag>{item.source}</Tag>
                    <Tag color={freshnessColor[item.freshness]}>
                      {freshnessLabel[item.freshness]}
                    </Tag>
                    <Tag color={qualityColor[item.quality]}>{qualityLabel[item.quality]}</Tag>
                    <Tag icon={<ClockCircleOutlined />}>
                      {formatTimestamp(item.timestamp ?? item.collectedAt)}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.summary}
                  </Text>
                  {renderEvidenceActions(item)}
                </Space>
              </Card>
            </List.Item>
          )}
        />
      )}
    </Space>
  );
};
