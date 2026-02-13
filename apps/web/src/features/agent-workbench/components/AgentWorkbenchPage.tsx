import React from 'react';
import {
  Card,
  Col,
  Flex,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import type { WorkflowExecutionDto } from '@packages/types';
import { useWorkflowExecutions } from '../../workflow-runtime/api/workflow-executions';
import { useExecutionAnalytics } from '../../execution-analytics/api/analytics';
import { useExperiments } from '../../workflow-experiment/api/experiments';

const { Title, Text, Paragraph } = Typography;

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  RUNNING: { color: 'processing', label: '运行中', icon: <SyncOutlined spin /> },
  SUCCESS: { color: 'success', label: '成功', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
  CANCELED: { color: 'default', label: '已取消', icon: <CloseCircleOutlined /> },
  PENDING: { color: 'default', label: '等待中', icon: <ClockCircleOutlined /> },
};

export const AgentWorkbenchPage: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();

  // 获取最近的执行列表
  const { data: recentExecutions, isLoading: isExecLoading } = useWorkflowExecutions({
    page: 1,
    pageSize: 10,
  });

  // 获取今日分析数据
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayAnalytics, isLoading: isAnalyticsLoading } = useExecutionAnalytics({
    startDate: today,
    endDate: today,
    granularity: 'DAY',
  });

  // 获取运行中的实验
  const { data: runningExperiments } = useExperiments({
    status: 'RUNNING',
    page: 1,
    pageSize: 5,
  });

  const todayOverall = todayAnalytics?.trend?.overall;

  // 运行中和失败的执行
  const runningExecutions = (recentExecutions?.data ?? []).filter(
    (e) => e.status === 'RUNNING',
  );
  const failedExecutions = (recentExecutions?.data ?? []).filter(
    (e) => e.status === 'FAILED',
  );

  const recentColumns: ColumnsType<WorkflowExecutionDto> = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const cfg = statusConfig[status] ?? { color: 'default', label: status, icon: null };
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: '实例 ID',
      dataIndex: 'id',
      width: 240,
      ellipsis: true,
      render: (id: string) => <Text style={{ fontSize: 12 }}>{id.slice(0, 12)}...</Text>,
    },
    {
      title: '触发方式',
      dataIndex: 'triggerType',
      width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => navigate('/workflow/executions')}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ── Header ── */}
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <DashboardOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
            <Title level={3} style={{ margin: 0 }}>智能体工作台</Title>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={() => navigate('/workflow/definitions')}
            >
              新建工作流
            </Button>
            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => navigate('/workflow/triggers')}
            >
              触发管理
            </Button>
          </Space>
        </Flex>
      </Card>

      {/* ── Today's Stats ── */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={isAnalyticsLoading}>
            <Statistic
              title="今日执行"
              value={todayOverall?.total ?? 0}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isAnalyticsLoading}>
            <Statistic
              title="今日成功率"
              value={todayOverall ? `${(todayOverall.successRate * 100).toFixed(1)}%` : '-'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{
                color: (todayOverall?.successRate ?? 0) >= 0.8
                  ? token.colorSuccess
                  : token.colorWarning,
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="运行中"
              value={runningExecutions.length}
              prefix={<SyncOutlined spin={runningExecutions.length > 0} />}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="今日失败"
              value={todayOverall?.failed ?? 0}
              prefix={<AlertOutlined />}
              valueStyle={{
                color: (todayOverall?.failed ?? 0) > 0 ? token.colorError : token.colorSuccess,
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* ── Alert Aggregation ── */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <AlertOutlined style={{ color: token.colorError }} />
                <span>异常告警</span>
              </Space>
            }
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/workflow/executions')}>
                查看全部
              </Button>
            }
          >
            {failedExecutions.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {failedExecutions.slice(0, 5).map((exec) => (
                  <Card key={exec.id} size="small" style={{ borderLeft: `3px solid ${token.colorError}` }}>
                    <Flex justify="space-between" align="center">
                      <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 12 }}>{exec.id.slice(0, 16)}...</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {exec.errorMessage?.slice(0, 50) ?? '执行失败'}
                        </Text>
                      </Space>
                      {exec.failureCategory && (
                        <Tag color="error" style={{ fontSize: 11 }}>{exec.failureCategory}</Tag>
                      )}
                    </Flex>
                  </Card>
                ))}
              </Space>
            ) : (
              <Flex justify="center" align="center" style={{ height: 100 }}>
                <Space direction="vertical" align="center">
                  <CheckCircleOutlined style={{ fontSize: 32, color: token.colorSuccess }} />
                  <Text type="secondary">暂无异常</Text>
                </Space>
              </Flex>
            )}
          </Card>

          {/* ── Running Experiments ── */}
          {(runningExperiments?.data ?? []).length > 0 && (
            <Card
              title={
                <Space>
                  <ExperimentOutlined style={{ color: token.colorPrimary }} />
                  <span>进行中的实验</span>
                </Space>
              }
              size="small"
              style={{ marginTop: 16 }}
              extra={
                <Button type="link" size="small" onClick={() => navigate('/workflow/experiments')}>
                  查看
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {(runningExperiments?.data ?? []).map((exp) => (
                  <Flex key={exp.id} justify="space-between" align="center">
                    <Space size={4}>
                      <Text strong style={{ fontSize: 12 }}>{exp.experimentCode}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{exp.name}</Text>
                    </Space>
                    <Space size={4}>
                      <Tag color="blue" style={{ fontSize: 11 }}>A:{exp.currentExecutionsA}</Tag>
                      <Tag color="orange" style={{ fontSize: 11 }}>B:{exp.currentExecutionsB}</Tag>
                    </Space>
                  </Flex>
                ))}
              </Space>
            </Card>
          )}
        </Col>

        {/* ── Recent Executions ── */}
        <Col xs={24} lg={16}>
          <Card
            title="最近执行"
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/workflow/executions')}>
                查看全部
              </Button>
            }
          >
            <Table<WorkflowExecutionDto>
              rowKey="id"
              loading={isExecLoading}
              dataSource={recentExecutions?.data ?? []}
              columns={recentColumns}
              pagination={false}
              size="small"
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Quick Actions ── */}
      <Card title="快速入口" size="small">
        <Row gutter={[16, 16]}>
          {[
            { label: '工作流设计', icon: <RocketOutlined />, path: '/workflow/definitions' },
            { label: '执行监控', icon: <DashboardOutlined />, path: '/workflow/executions' },
            { label: '执行分析', icon: <ThunderboltOutlined />, path: '/workflow/analytics' },
            { label: '参数中心', icon: <ClockCircleOutlined />, path: '/workflow/parameters' },
            { label: '规则中心', icon: <AlertOutlined />, path: '/workflow/rules' },
            { label: '模板市场', icon: <ExperimentOutlined />, path: '/workflow/templates' },
          ].map((item) => (
            <Col key={item.path} xs={12} sm={8} md={4}>
              <Card
                size="small"
                hoverable
                onClick={() => navigate(item.path)}
                style={{ textAlign: 'center' }}
              >
                <Space direction="vertical" size={4}>
                  <span style={{ fontSize: 24, color: token.colorPrimary }}>{item.icon}</span>
                  <Text style={{ fontSize: 12 }}>{item.label}</Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
};
