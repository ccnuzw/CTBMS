import React, { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
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

import { DebateReplayViewer } from './DebateReplayViewer';
import { ReplayTimeline } from './ReplayTimeline';
import { MetricsDashboard } from './MetricsDashboard';
import {
  useExecutionReplay,
  useExecutionComparison,
  useDebateTimeline,
  useConversationObservabilitySummary,
} from '../api/replayApi';
import { apiClient } from '@/api/client';

const { Title, Text } = Typography;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExecutionSearchPage = {
  data?: Array<{ id: string }>;
  total?: number;
};

const formatLatency = (valueMs: number | null): string => {
  if (valueMs === null || !Number.isFinite(valueMs)) {
    return '-';
  }
  if (valueMs < 1000) {
    return `${Math.round(valueMs)}ms`;
  }
  if (valueMs < 60_000) {
    return `${(valueMs / 1000).toFixed(1)}s`;
  }
  return `${(valueMs / 60_000).toFixed(1)}min`;
};

export const ReplayEvaluationPage: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [executionId, setExecutionId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [inputId, setInputId] = useState('');
  const [compareInputId, setCompareInputId] = useState('');
  const [activeTab, setActiveTab] = useState('replay');
  const [resolvingId, setResolvingId] = useState(false);
  const [resolvingCompareId, setResolvingCompareId] = useState(false);
  const [observabilityWindowDays, setObservabilityWindowDays] = useState(7);

  const {
    data: replayBundle,
    isLoading,
    error: replayError,
  } = useExecutionReplay(executionId, !!executionId);
  const { data: debateTimeline, isLoading: isDebateLoading } = useDebateTimeline(
    executionId,
    !!executionId,
  );
  const {
    data: comparison,
    isLoading: isComparing,
    error: comparisonError,
  } = useExecutionComparison(executionId, compareId, !!executionId && !!compareId);
  const {
    data: observabilitySummary,
    isLoading: isObservabilityLoading,
    error: observabilityError,
  } = useConversationObservabilitySummary({
    windowDays: observabilityWindowDays,
    maxSessions: 500,
  });



  const resolveExecutionId = async (rawId: string): Promise<string | null> => {
    const normalized = rawId.trim();
    if (!normalized) {
      return null;
    }
    if (UUID_PATTERN.test(normalized)) {
      return normalized;
    }

    const response = await apiClient.get<ExecutionSearchPage>('/workflow-executions', {
      params: {
        keyword: normalized,
        page: 1,
        pageSize: 50,
      },
    });
    const candidates = Array.isArray(response.data?.data) ? response.data.data : [];
    const prefixMatches = candidates.filter((item) => item.id.startsWith(normalized));

    if (prefixMatches.length === 1) {
      return prefixMatches[0].id;
    }
    if (prefixMatches.length > 1) {
      message.warning(`命中多个执行实例，请输入更长 ID（当前匹配 ${prefixMatches.length} 条）`);
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0].id;
    }
    return null;
  };

  const handleSearch = async () => {
    const normalized = inputId.trim();
    if (!normalized) {
      message.warning('请输入执行实例 ID');
      return;
    }

    setResolvingId(true);
    try {
      const resolved = await resolveExecutionId(normalized);
      if (!resolved) {
        message.error('未找到可访问的执行实例，请确认 ID 是否完整');
        return;
      }

      if (resolved !== normalized) {
        message.info(`已自动解析为完整 ID: ${resolved}`);
      }
      setExecutionId(resolved);
      setInputId(resolved);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载执行实例失败';
      message.error(errorMessage);
    } finally {
      setResolvingId(false);
    }
  };

  const handleCompareSearch = async () => {
    if (!executionId) {
      message.warning('请先输入主执行实例 ID');
      return;
    }

    const normalized = compareInputId.trim();
    if (!normalized) {
      setCompareId('');
      return;
    }

    setResolvingCompareId(true);
    try {
      const resolved = await resolveExecutionId(normalized);
      if (!resolved) {
        message.error('未找到可访问的对比实例，请确认 ID 是否完整');
        return;
      }

      if (resolved === executionId) {
        message.warning('对比实例不能与主实例相同');
        return;
      }

      if (resolved !== normalized) {
        message.info(`对比实例已解析为完整 ID: ${resolved}`);
      }
      setCompareId(resolved);
      setCompareInputId(resolved);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载对比执行实例失败';
      message.error(errorMessage);
    } finally {
      setResolvingCompareId(false);
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
              suffix={resolvingId ? '解析中' : undefined}
              disabled={resolvingId}
              allowClear
            />
          </Space>
        </Flex>
      </Card>

      {!executionId ? (
        <Alert
          type="info"
          showIcon
          message="未提供执行实例 ID"
          description="你仍可在“指标看板”查看全局 NFR 可观测指标，输入执行实例 ID 后可查看回放、辩论和对比。"
        />
      ) : null}

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
                {replayError ? (
                  <Alert
                    type="error"
                    showIcon
                    message="加载回放失败"
                    description={
                      replayError instanceof Error ? replayError.message : '请检查执行实例 ID'
                    }
                  />
                ) : null}
                {replayBundle && (
                  <ReplayTimeline
                    timeline={replayBundle.timeline}
                    totalDurationMs={replayBundle.stats.totalDurationMs}
                    isLoading={isLoading}
                  />
                )}
                {!isLoading && !replayError && !replayBundle ? (
                  <Card>
                    <Empty description="未找到回放数据，请确认执行实例 ID 是否完整且有访问权限" />
                  </Card>
                ) : null}
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
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                {observabilityError ? (
                  <Alert
                    type="error"
                    showIcon
                    message="加载会话可观测指标失败"
                    description={
                      observabilityError instanceof Error
                        ? observabilityError.message
                        : '请稍后重试'
                    }
                  />
                ) : null}
                <Card
                  title="Copilot NFR 可观测指标"
                  loading={isObservabilityLoading}
                  extra={
                    <Space>
                      <Text type="secondary">观察窗口</Text>
                      <Select
                        size="small"
                        value={observabilityWindowDays}
                        onChange={(value) => setObservabilityWindowDays(value)}
                        options={[
                          { label: '近 7 天', value: 7 },
                          { label: '近 14 天', value: 14 },
                          { label: '近 30 天', value: 30 },
                        ]}
                        style={{ width: 120 }}
                      />
                    </Space>
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="P95 首响"
                        value={formatLatency(
                          observabilitySummary?.firstResponseLatency.p95Ms ?? null,
                        )}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="P95 受理"
                        value={formatLatency(observabilitySummary?.acceptanceLatency.p95Ms ?? null)}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="P95 完成"
                        value={formatLatency(observabilitySummary?.completionLatency.p95Ms ?? null)}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="成功率"
                        value={Number(((observabilitySummary?.successRate ?? 0) * 100).toFixed(1))}
                        suffix="%"
                      />
                    </Col>
                  </Row>

                  <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="会话样本"
                        value={observabilitySummary?.sampledSessions ?? 0}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="执行样本"
                        value={observabilitySummary?.totals.executions ?? 0}
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="引用覆盖率"
                        value={Number(
                          (
                            (observabilitySummary?.citationCoverage.coverageRate ?? 0) * 100
                          ).toFixed(1),
                        )}
                        suffix="%"
                      />
                    </Col>
                    <Col xs={12} md={6}>
                      <Statistic
                        title="有事实执行"
                        value={observabilitySummary?.citationCoverage.executionWithFacts ?? 0}
                      />
                    </Col>
                  </Row>

                  {observabilitySummary?.nfrGate ? (
                    <Space direction="vertical" size={8} style={{ marginTop: 12, width: '100%' }}>
                      <Space wrap>
                        <Tag color={observabilitySummary.nfrGate.passed ? 'success' : 'error'}>
                          NFR 门禁 {observabilitySummary.nfrGate.passed ? '通过' : '未通过'}
                        </Tag>
                        {observabilitySummary.nfrGate.checks.map((check) => (
                          <Tag key={check.id} color={check.passed ? 'success' : 'error'}>
                            {check.id} {check.passed ? 'PASS' : 'FAIL'}
                          </Tag>
                        ))}
                      </Space>
                    </Space>
                  ) : null}

                  {observabilitySummary?.truncated ? (
                    <Alert
                      style={{ marginTop: 12 }}
                      type="warning"
                      showIcon
                      message={`当前窗口会话较多，仅采样最近 ${observabilitySummary.sampledSessions} 条用于计算`}
                    />
                  ) : null}
                </Card>

                {replayBundle ? (
                  <MetricsDashboard
                    stats={replayBundle.stats}
                    evidenceBundle={replayBundle.evidenceBundle as Record<string, unknown>}
                    decisionOutput={replayBundle.decisionOutput as Record<string, unknown> | null}
                    isLoading={isLoading}
                  />
                ) : (
                  <Card>
                    <Empty description="请输入执行实例 ID 查看执行级指标" />
                  </Card>
                )}
              </Space>
            ),
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
                      value={compareInputId}
                      onChange={(e) => setCompareInputId(e.target.value)}
                      onPressEnter={handleCompareSearch}
                      disabled={resolvingCompareId || !executionId}
                    />
                    <Button
                      type="primary"
                      onClick={handleCompareSearch}
                      loading={resolvingCompareId}
                      disabled={!executionId}
                    >
                      对比
                    </Button>
                    {compareId ? (
                      <Button
                        onClick={() => {
                          setCompareInputId('');
                          setCompareId('');
                        }}
                      >
                        清空
                      </Button>
                    ) : null}
                  </Flex>
                </Card>
                {comparisonError ? (
                  <Alert
                    type="error"
                    showIcon
                    message="加载执行对比失败"
                    description={
                      comparisonError instanceof Error
                        ? comparisonError.message
                        : '请检查两个执行实例 ID 是否完整'
                    }
                  />
                ) : null}
                {!compareId ? (
                  <Card>
                    <Empty description="请输入对比执行 ID 并点击“对比”" />
                  </Card>
                ) : null}
                {!isComparing && !comparisonError && compareId && !comparison ? (
                  <Card>
                    <Empty description="未获取到对比结果，请检查实例是否可访问" />
                  </Card>
                ) : null}
                {comparison && (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card
                        title={`执行 A: ${comparison.execA.execution.id.slice(0, 12)}...`}
                        size="small"
                      >
                        <MetricsDashboard stats={comparison.execA.stats} isLoading={isComparing} />
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card
                        title={`执行 B: ${comparison.execB.execution.id.slice(0, 12)}...`}
                        size="small"
                      >
                        <MetricsDashboard stats={comparison.execB.stats} isLoading={isComparing} />
                      </Card>
                    </Col>
                  </Row>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
};
