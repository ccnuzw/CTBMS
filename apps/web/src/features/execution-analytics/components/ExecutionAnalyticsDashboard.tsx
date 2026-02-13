import React, { useState } from 'react';
import {
  Card,
  Col,
  DatePicker,
  Flex,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  BarChartOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  ExecutionTrendPointDto,
  DurationBucketDto,
  FailureCategoryStatDto,
  NodePerformanceStatDto,
} from '@packages/types';
import { useExecutionAnalytics } from '../api/analytics';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const failureCategoryLabels: Record<string, string> = {
  EXECUTOR: '执行器错误',
  TIMEOUT: '超时',
  CANCELED: '已取消',
  INTERNAL: '内部错误',
  UNKNOWN: '未知',
};

export const ExecutionAnalyticsDashboard: React.FC = () => {
  const { token } = theme.useToken();

  const [granularity, setGranularity] = useState<string>('DAY');
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [definitionId, setDefinitionId] = useState<string | undefined>();

  const { data: analytics, isLoading } = useExecutionAnalytics({
    granularity,
    startDate: dateRange[0],
    endDate: dateRange[1],
    workflowDefinitionId: definitionId,
  });

  const overall = analytics?.trend?.overall;

  const trendColumns: ColumnsType<ExecutionTrendPointDto> = [
    { title: '时间', dataIndex: 'timestamp', width: 140 },
    { title: '总数', dataIndex: 'total', width: 70 },
    {
      title: '成功',
      dataIndex: 'success',
      width: 70,
      render: (v: number) => <Text style={{ color: token.colorSuccess }}>{v}</Text>,
    },
    {
      title: '失败',
      dataIndex: 'failed',
      width: 70,
      render: (v: number) => <Text style={{ color: token.colorError }}>{v}</Text>,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      width: 120,
      render: (v: number) => (
        <Progress
          percent={Math.round(v * 100)}
          size="small"
          strokeColor={v >= 0.8 ? token.colorSuccess : v >= 0.5 ? token.colorWarning : token.colorError}
        />
      ),
    },
  ];

  const nodeColumns: ColumnsType<NodePerformanceStatDto> = [
    { title: '节点类型', dataIndex: 'nodeType', width: 160 },
    { title: '执行次数', dataIndex: 'totalExecutions', width: 90 },
    {
      title: '成功率',
      dataIndex: 'successRate',
      width: 100,
      render: (v: number) => (
        <Tag color={v >= 0.9 ? 'success' : v >= 0.7 ? 'warning' : 'error'}>
          {(v * 100).toFixed(1)}%
        </Tag>
      ),
    },
    {
      title: '平均耗时',
      dataIndex: 'avgDurationMs',
      width: 100,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: 'P95 耗时',
      dataIndex: 'p95DurationMs',
      width: 100,
      render: (ms: number) => (
        <Text style={{ color: ms > 10000 ? token.colorError : ms > 5000 ? token.colorWarning : undefined }}>
          {ms}ms
        </Text>
      ),
    },
    {
      title: '最大耗时',
      dataIndex: 'maxDurationMs',
      width: 100,
      render: (ms: number) => `${ms}ms`,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ── Header ── */}
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <BarChartOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>执行统计分析</Title>
          </Space>
          <Space wrap>
            <RangePicker
              onChange={(_, dateStrings) => {
                setDateRange([dateStrings[0] || undefined, dateStrings[1] || undefined]);
              }}
            />
            <Select
              style={{ width: 120 }}
              value={granularity}
              onChange={setGranularity}
              options={[
                { label: '按小时', value: 'HOUR' },
                { label: '按天', value: 'DAY' },
                { label: '按周', value: 'WEEK' },
              ]}
            />
          </Space>
        </Flex>
      </Card>

      {/* ── Overall Stats ── */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic
              title="总执行数"
              value={overall?.total ?? 0}
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic
              title="成功率"
              value={overall ? `${(overall.successRate * 100).toFixed(1)}%` : '-'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: (overall?.successRate ?? 0) >= 0.8 ? token.colorSuccess : token.colorWarning }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic
              title="失败数"
              value={overall?.failed ?? 0}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: (overall?.failed ?? 0) > 0 ? token.colorError : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic
              title="平均耗时"
              value={overall ? `${overall.avgDurationMs}ms` : '-'}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* ── Trend Table ── */}
        <Col xs={24} lg={14}>
          <Card title="执行趋势" size="small" loading={isLoading}>
            <Table<ExecutionTrendPointDto>
              rowKey="timestamp"
              dataSource={analytics?.trend?.points ?? []}
              columns={trendColumns}
              pagination={false}
              size="small"
              scroll={{ x: 500, y: 300 }}
            />
          </Card>
        </Col>

        {/* ── Duration Distribution ── */}
        <Col xs={24} lg={10}>
          <Card title="耗时分布" size="small" loading={isLoading}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {(analytics?.durationDistribution ?? []).map((bucket: DurationBucketDto) => {
                const total = (analytics?.trend?.overall?.total ?? 1) || 1;
                const pct = Math.round((bucket.count / total) * 100);
                return (
                  <Flex key={bucket.label} justify="space-between" align="center">
                    <Text style={{ width: 60, fontSize: 12 }}>{bucket.label}</Text>
                    <Progress
                      percent={pct}
                      size="small"
                      style={{ flex: 1, margin: '0 8px' }}
                      showInfo={false}
                      strokeColor={
                        bucket.minMs >= 30000 ? token.colorError
                          : bucket.minMs >= 10000 ? token.colorWarning
                          : token.colorPrimary
                      }
                    />
                    <Text style={{ width: 50, textAlign: 'right', fontSize: 12 }}>{bucket.count}</Text>
                  </Flex>
                );
              })}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* ── Failure Categories ── */}
        <Col xs={24} lg={8}>
          <Card title="失败分类" size="small" loading={isLoading}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {(analytics?.failureCategories ?? []).map((cat: FailureCategoryStatDto) => (
                <Flex key={cat.category} justify="space-between" align="center">
                  <Space size={4}>
                    <WarningOutlined style={{ color: token.colorError }} />
                    <Text style={{ fontSize: 12 }}>
                      {failureCategoryLabels[cat.category] ?? cat.category}
                    </Text>
                  </Space>
                  <Space size={8}>
                    <Tag color="error">{cat.count}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {(cat.percentage * 100).toFixed(0)}%
                    </Text>
                  </Space>
                </Flex>
              ))}
              {(analytics?.failureCategories ?? []).length === 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>暂无失败记录</Text>
              )}
            </Space>
          </Card>
        </Col>

        {/* ── Top Slow Nodes ── */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined />
                <span>慢节点 TOP 10</span>
              </Space>
            }
            size="small"
            loading={isLoading}
          >
            <Table<NodePerformanceStatDto>
              rowKey="nodeType"
              dataSource={analytics?.topSlowNodes ?? []}
              columns={nodeColumns}
              pagination={false}
              size="small"
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Full Node Performance ── */}
      <Card title="节点性能全览" size="small" loading={isLoading}>
        <Table<NodePerformanceStatDto>
          rowKey="nodeType"
          dataSource={analytics?.nodePerformance ?? []}
          columns={nodeColumns}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
        />
      </Card>
    </Space>
  );
};
