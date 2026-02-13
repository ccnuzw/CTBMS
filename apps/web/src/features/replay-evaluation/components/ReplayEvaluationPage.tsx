import React, { useState } from 'react';
import {
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Tabs,
  Typography,
  theme,
} from 'antd';
import {
  PlayCircleOutlined,
  BarChartOutlined,
  NodeIndexOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { DebateReplayViewer } from './DebateReplayViewer';
import { ReplayTimeline } from './ReplayTimeline';
import { MetricsDashboard } from './MetricsDashboard';
import {
  useExecutionReplay,
  useExecutionComparison,
  useDebateTimeline,
} from '../api/replayApi';

const { Title, Text } = Typography;

export const ReplayEvaluationPage: React.FC = () => {
  const { token } = theme.useToken();
  const [searchParams, setSearchParams] = useSearchParams();

  const executionId = searchParams.get('executionId') ?? '';
  const compareId = searchParams.get('compareId') ?? '';
  const [inputId, setInputId] = useState(executionId);
  const [activeTab, setActiveTab] = useState('replay');

  const { data: replayBundle, isLoading } = useExecutionReplay(executionId, !!executionId);
  const { data: debateTimeline, isLoading: isDebateLoading } = useDebateTimeline(
    executionId,
    !!executionId,
  );
  const { data: comparison, isLoading: isComparing } = useExecutionComparison(
    executionId,
    compareId,
    !!executionId && !!compareId,
  );

  const handleSearch = () => {
    if (inputId.trim()) {
      setSearchParams({ executionId: inputId.trim() });
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* Header */}
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <PlayCircleOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
            <Title level={3} style={{ margin: 0 }}>
              回放与评估
            </Title>
          </Space>
          <Space>
            <Input
              placeholder="输入执行实例 ID"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 280 }}
              prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
              allowClear
            />
          </Space>
        </Flex>
      </Card>

      {!executionId ? (
        <Card>
          <Empty description="请输入执行实例 ID 以加载回放数据" />
        </Card>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'replay',
              label: (
                <Space size={4}>
                  <NodeIndexOutlined />
                  <span>执行回放</span>
                </Space>
              ),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  {replayBundle && (
                    <ReplayTimeline
                      timeline={replayBundle.timeline}
                      totalDurationMs={replayBundle.stats.totalDurationMs}
                      isLoading={isLoading}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'metrics',
              label: (
                <Space size={4}>
                  <BarChartOutlined />
                  <span>指标看板</span>
                </Space>
              ),
              children: replayBundle ? (
                <MetricsDashboard
                  stats={replayBundle.stats}
                  evidenceBundle={replayBundle.evidenceBundle as Record<string, unknown>}
                  decisionOutput={replayBundle.decisionOutput as Record<string, unknown> | null}
                  isLoading={isLoading}
                />
              ) : null,
            },
            {
              key: 'debate',
              label: (
                <Space size={4}>
                  <PlayCircleOutlined />
                  <span>辩论回放</span>
                </Space>
              ),
              children: debateTimeline ? (
                <DebateReplayViewer timeline={debateTimeline} isLoading={isDebateLoading} />
              ) : (
                <Card>
                  <Empty description="当前执行无辩论数据" />
                </Card>
              ),
            },
            {
              key: 'compare',
              label: (
                <Space size={4}>
                  <BarChartOutlined />
                  <span>执行对比</span>
                </Space>
              ),
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Card size="small">
                    <Flex align="center" gap={12}>
                      <Text>对比执行 ID:</Text>
                      <Input
                        placeholder="输入另一个执行实例 ID"
                        style={{ width: 280 }}
                        value={compareId}
                        onChange={(e) =>
                          setSearchParams({
                            executionId,
                            compareId: e.target.value,
                          })
                        }
                      />
                    </Flex>
                  </Card>
                  {comparison && (
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={12}>
                        <Card
                          title={`执行 A: ${comparison.execA.execution.id.slice(0, 12)}...`}
                          size="small"
                        >
                          <MetricsDashboard
                            stats={comparison.execA.stats}
                            isLoading={isComparing}
                          />
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card
                          title={`执行 B: ${comparison.execB.execution.id.slice(0, 12)}...`}
                          size="small"
                        >
                          <MetricsDashboard
                            stats={comparison.execB.stats}
                            isLoading={isComparing}
                          />
                        </Card>
                      </Col>
                    </Row>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}
    </Space>
  );
};
