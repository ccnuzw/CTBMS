import React, { useState } from 'react';
import { Alert, Button, Card, Empty, Flex, List, Select, Space, Spin, Tag, Typography } from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useConversationResultDiff, useConversationResultDiffTimeline } from '../api/conversations';

const { Text } = Typography;

const changeSummaryLabelMap: Record<string, string> = {
  CONFIDENCE_SHIFT: '置信度变化',
  FACTS_CHANGED: '事实变化',
  EVIDENCE_SOURCES_CHANGED: '证据变化',
  ACTIONS_CHANGED: '行动建议变化',
  ANALYSIS_CHANGED: '分析结论变化',
};

const getDeltaTagColor = (delta: number) => {
  if (delta > 0) return 'green';
  if (delta < 0) return 'red';
  return 'default';
};

const formatDelta = (delta: number) => {
  const pct = (delta * 100).toFixed(1);
  return `${delta >= 0 ? '+' : ''}${pct}%`;
};

interface ResultDiffTimelinePanelProps {
  sessionId: string | null;
}

export const ResultDiffTimelinePanel: React.FC<ResultDiffTimelinePanelProps> = ({ sessionId }) => {
  const [limit, setLimit] = useState(10);

  const latestDiffQuery = useConversationResultDiff(sessionId ?? undefined);
  const timelineQuery = useConversationResultDiffTimeline(sessionId ?? undefined, { limit });

  if (!sessionId) {
    return <Alert type="info" showIcon message="请先选择会话后再查看结论变化时间线" />;
  }

  if (timelineQuery.isLoading) {
    return (
      <Flex justify="center" style={{ padding: 24 }}>
        <Spin size="small" />
      </Flex>
    );
  }

  const items = timelineQuery.data?.items ?? [];
  const latestDiff = latestDiffQuery.data?.diff;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card
        size="small"
        title={
          <Space size={6}>
            <HistoryOutlined />
            <span>结果变化总览</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              size="small"
              value={limit}
              style={{ width: 110 }}
              options={[
                { label: '最近 5 条', value: 5 },
                { label: '最近 10 条', value: 10 },
                { label: '最近 20 条', value: 20 },
                { label: '最近 30 条', value: 30 },
              ]}
              onChange={setLimit}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                void latestDiffQuery.refetch();
                void timelineQuery.refetch();
              }}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text type="secondary">
            快照数量 {timelineQuery.data?.totalSnapshots ?? 0}，可比较版本{' '}
            {timelineQuery.data?.comparableCount ?? 0}
          </Text>
          {latestDiffQuery.data?.comparable && latestDiff ? (
            <Flex align="center" wrap="wrap" gap={8}>
              <Tag color={getDeltaTagColor(latestDiff.confidenceDelta)}>
                置信度 {formatDelta(latestDiff.confidenceDelta)}
              </Tag>
              <Tag>事实 +{latestDiff.addedFacts.length}</Tag>
              <Tag>事实 -{latestDiff.removedFacts.length}</Tag>
              <Tag>证据 +{latestDiff.addedSources.length}</Tag>
              <Tag>证据 -{latestDiff.removedSources.length}</Tag>
              <Tag>动作变更 {latestDiff.changedActionKeys.length}</Tag>
            </Flex>
          ) : (
            <Text type="secondary">当前会话历史不足，至少两次结果快照后可比较。</Text>
          )}
        </Space>
      </Card>

      <Card size="small" title="历史变化明细">
        {items.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={items}
            renderItem={(item, index) => {
              const diff = item.diff;
              return (
                <List.Item key={item.current.assetId}>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                      <Space size={8}>
                        <Tag color="processing">快照 {index + 1}</Tag>
                        <Text strong>
                          {dayjs(item.current.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                        {item.baseline ? (
                          <Text type="secondary">
                            对比 {dayjs(item.baseline.createdAt).format('MM-DD HH:mm')}
                          </Text>
                        ) : null}
                      </Space>
                      {diff ? (
                        <Tag color={getDeltaTagColor(diff.confidenceDelta)}>
                          置信度 {formatDelta(diff.confidenceDelta)}
                        </Tag>
                      ) : (
                        <Tag>基线不足</Tag>
                      )}
                    </Flex>

                    {diff ? (
                      <>
                        <Space size={8} wrap>
                          {diff.changeSummary.length > 0 ? (
                            diff.changeSummary.map((key) => (
                              <Tag key={key}>{changeSummaryLabelMap[key] ?? key}</Tag>
                            ))
                          ) : (
                            <Tag color="success">无显著变化</Tag>
                          )}
                        </Space>
                        <Space size={12} wrap>
                          <Text type="secondary">事实 +{diff.addedFacts.length}</Text>
                          <Text type="secondary">事实 -{diff.removedFacts.length}</Text>
                          <Text type="secondary">证据 +{diff.addedSources.length}</Text>
                          <Text type="secondary">证据 -{diff.removedSources.length}</Text>
                          <Text type="secondary">动作键 {diff.changedActionKeys.length}</Text>
                        </Space>
                      </>
                    ) : null}
                  </Space>
                </List.Item>
              );
            }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无结果快照" />
        )}
      </Card>
    </Space>
  );
};
