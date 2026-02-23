import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
  Tooltip,
  App,
} from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  FireOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  RocketOutlined,
  StarFilled,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import type { WorkflowDefinitionDto, WorkflowExecutionDto } from '@packages/types';
import {
  useWorkbenchSummary,
  useWorkbenchAlerts,
  useWorkbenchRecentExecutions,
} from '../api';
import {
  usePublishedWorkflows,
  useWorkflowDefinitionDetail,
} from '../../workflow-studio/api/workflow-definitions';
import { WorkflowQuickRunnerModal } from '../../workflow-studio/components/workflow-definition/WorkflowQuickRunnerModal';
import { useTriggerWorkflowExecution } from '../../workflow-studio/api';
import { useRerunWorkflowExecution } from '../../workflow-runtime/api';

const { Title, Text, Paragraph } = Typography;

// ── Status helpers ──────────────────────────────────────────────
const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  RUNNING: { color: 'processing', label: '运行中', icon: <SyncOutlined spin /> },
  COMPLETED: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  SUCCESS: { color: 'success', label: '成功', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
  CANCELED: { color: 'default', label: '已取消', icon: <CloseCircleOutlined /> },
  PENDING: { color: 'default', label: '等待中', icon: <ClockCircleOutlined /> },
};

// ── Featured App Card ───────────────────────────────────────────
const FeaturedWorkflowCard: React.FC<{
  workflow: WorkflowDefinitionDto;
  onRun: (w: WorkflowDefinitionDto) => void;
}> = ({ workflow, onRun }) => {
  const { token } = theme.useToken();
  return (
    <Card
      hoverable
      style={{ height: '100%', borderColor: token.colorBorder }}
      bodyStyle={{ padding: '16px', display: 'flex', flexDirection: 'column' }}
    >
      <Flex vertical style={{ height: '100%', flex: 1 }} gap={8}>
        {/* Icon area */}
        <div style={{
          height: 72,
          borderRadius: token.borderRadiusLG,
          background: `linear-gradient(135deg, ${token.colorPrimaryBg}, ${token.colorInfoBg})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}>
          <AppstoreOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
        </div>

        {/* Name */}
        <Text strong style={{ fontSize: 14 }} ellipsis={{ tooltip: workflow.name }}>
          {workflow.name}
        </Text>

        {/* Description */}
        <Paragraph
          type="secondary"
          style={{ fontSize: 12, margin: 0, flex: 1 }}
          ellipsis={{ rows: 2 }}
        >
          {workflow.description || '无描述'}
        </Paragraph>

        {/* Stars + Run button */}
        <Flex justify="space-between" align="center" style={{ marginTop: 4 }}>
          <Space size={4}>
            <StarFilled style={{ color: token.colorWarning, fontSize: 12 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{(workflow as any).stars ?? 0}</Text>
          </Space>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => onRun(workflow)}
          >
            运行
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};

// ── Main Page ───────────────────────────────────────────────────
export const AgentWorkbenchPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message: antMessage } = App.useApp();
  const navigate = useNavigate();

  // Data hooks
  const { data: summary, isLoading: isSummaryLoading } = useWorkbenchSummary();
  const { data: alerts } = useWorkbenchAlerts(5);
  const { data: recentExecData, isLoading: isExecLoading } = useWorkbenchRecentExecutions(10);
  const { data: publishedPage, isLoading: isFeaturedLoading } = usePublishedWorkflows({
    orderBy: 'stars',
    pageSize: 6,
  });

  // Quick Runner state
  const [runnerTarget, setRunnerTarget] = useState<WorkflowDefinitionDto | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);

  // Load detail for runner (needed for version info)
  const { data: runnerDetail, isLoading: isRunnerDetailLoading } = useWorkflowDefinitionDetail(
    runnerTarget?.id,
  );

  const triggerMutation = useTriggerWorkflowExecution();
  const rerunMutation = useRerunWorkflowExecution();

  const recentExecutions = (recentExecData as Record<string, unknown>)?.data as WorkflowExecutionDto[] | undefined;
  const featuredWorkflows: WorkflowDefinitionDto[] = (publishedPage as any)?.data ?? [];

  const handleRunWorkflow = (w: WorkflowDefinitionDto) => {
    setRunnerTarget(w);
    setRunnerOpen(true);
  };

  const handleModalRun = async (paramSnapshot: Record<string, unknown>) => {
    if (!runnerTarget) {
      antMessage.error('请先选择工作流');
      return;
    }
    try {
      await triggerMutation.mutateAsync({
        workflowDefinitionId: runnerTarget.id,
        paramSnapshot,
      });
      antMessage.success('已提交运行，请稍候查看结果');
      setRunnerOpen(false);
    } catch {
      antMessage.error('运行失败，请检查参数或联系管理员');
    }
  };

  const handleRerun = async (executionId: string) => {
    try {
      await rerunMutation.mutateAsync(executionId);
      antMessage.success('已重跑任务，结果将在「最近运行」列表刷新');
    } catch {
      antMessage.error('重跑失败');
    }
  };

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
      title: '任务 ID',
      dataIndex: 'id',
      ellipsis: true,
      render: (id: string) => <Text code style={{ fontSize: 11 }}>{id.slice(0, 12)}…</Text>,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      width: 150,
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>
          {v ? new Date(v).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => navigate('/workflow/executions')}>
            详情
          </Button>
          {['COMPLETED', 'SUCCESS', 'FAILED'].includes(record.status) && (
            <Tooltip title="以相同参数重新执行">
              <Button
                type="link"
                size="small"
                icon={<RedoOutlined />}
                loading={rerunMutation.isPending}
                onClick={() => handleRerun(record.id)}
              >
                重跑
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <App>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>

        {/* ── Header ── */}
        <Card>
          <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
            <Space direction="vertical" size={0}>
              <Space>
                <RocketOutlined style={{ fontSize: 22, color: token.colorPrimary }} />
                <Title level={3} style={{ margin: 0 }}>应用中心</Title>
              </Space>
              <Text type="secondary" style={{ marginLeft: 34 }}>
                找到需要的 AI 工作流，输入您的需求，即可获得专业结果
              </Text>
            </Space>
            <Space>
              <Button icon={<AppstoreOutlined />} onClick={() => navigate('/workflow/templates')}>
                全部应用
              </Button>
              <Button
                type="primary"
                icon={<FireOutlined />}
                onClick={() => navigate('/workflow/definitions')}
              >
                编排新流程
              </Button>
            </Space>
          </Flex>
        </Card>

        {/* ── Featured Workflows ── */}
        <Card
          title={
            <Space>
              <StarFilled style={{ color: token.colorWarning }} />
              <span>精选应用</span>
              <Badge count="NEW" color={token.colorSuccess} />
            </Space>
          }
          extra={
            <Button type="link" size="small" onClick={() => navigate('/workflow/templates')}>
              查看更多 →
            </Button>
          }
        >
          {isFeaturedLoading ? (
            <Row gutter={[16, 16]}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Col key={i} xs={24} sm={12} md={8} lg={8} xl={4}>
                  <Skeleton active paragraph={{ rows: 3 }} />
                </Col>
              ))}
            </Row>
          ) : featuredWorkflows.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={8} style={{ textAlign: 'center' }}>
                  <Text>还没有发布的工作流应用</Text>
                  <Button type="primary" onClick={() => navigate('/workflow/definitions')}>
                    去创建第一个
                  </Button>
                </Space>
              }
            />
          ) : (
            <Row gutter={[16, 16]}>
              {featuredWorkflows.map((wf) => (
                <Col key={wf.id} xs={24} sm={12} md={8} lg={8} xl={4}>
                  <FeaturedWorkflowCard workflow={wf} onRun={handleRunWorkflow} />
                </Col>
              ))}
            </Row>
          )}
        </Card>

        {/* ── Stats ── */}
        <Row gutter={[16, 16]}>
          {[
            {
              title: '今日执行',
              value: summary?.todayTotal ?? 0,
              icon: <ThunderboltOutlined />,
              color: token.colorPrimary,
            },
            {
              title: '今日成功率',
              value: summary ? `${(summary.todaySuccessRate * 100).toFixed(1)}%` : '-',
              icon: <CheckCircleOutlined />,
              color: (summary?.todaySuccessRate ?? 0) >= 0.8 ? token.colorSuccess : token.colorWarning,
            },
            {
              title: '运行中',
              value: summary?.runningCount ?? 0,
              icon: <SyncOutlined spin={(summary?.runningCount ?? 0) > 0} />,
              color: token.colorInfo,
            },
            {
              title: '今日失败',
              value: summary?.todayFailed ?? 0,
              icon: <AlertOutlined />,
              color: (summary?.todayFailed ?? 0) > 0 ? token.colorError : token.colorSuccess,
            },
          ].map((item) => (
            <Col key={item.title} xs={12} sm={6}>
              <Card loading={isSummaryLoading}>
                <Statistic
                  title={item.title}
                  value={item.value}
                  prefix={item.icon}
                  valueStyle={{ color: item.color }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]}>
          {/* Alerts */}
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
              {(alerts ?? []).length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {(alerts ?? []).map((alert) => (
                    <Card key={alert.id} size="small" style={{ borderLeft: `3px solid ${token.colorError}` }}>
                      <Flex justify="space-between" align="center">
                        <Space direction="vertical" size={0}>
                          <Text style={{ fontSize: 12 }}>{alert.executionId.slice(0, 16)}…</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {alert.errorMessage?.slice(0, 50) ?? '执行失败'}
                          </Text>
                        </Space>
                        {alert.failureCategory && (
                          <Tag color="error" style={{ fontSize: 11 }}>{alert.failureCategory}</Tag>
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
          </Col>

          {/* Recent Executions */}
          <Col xs={24} lg={16}>
            <Card
              title={
                <Space>
                  <DashboardOutlined />
                  <span>最近运行</span>
                </Space>
              }
              size="small"
              extra={
                <Button type="link" size="small" onClick={() => navigate('/workflow/executions')}>
                  查看全部
                </Button>
              }
            >
              {(recentExecutions ?? []).length === 0 && !isExecLoading ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" size={8}>
                      <Text type="secondary">您还没有运行过任何工作流</Text>
                      <Button
                        type="primary"
                        icon={<RocketOutlined />}
                        size="small"
                        onClick={() => navigate('/workflow/templates')}
                      >
                        去探索应用商店
                      </Button>
                    </Space>
                  }
                />
              ) : (
                <Table<WorkflowExecutionDto>
                  rowKey="id"
                  loading={isExecLoading}
                  dataSource={recentExecutions ?? []}
                  columns={recentColumns}
                  pagination={false}
                  size="small"
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* Quick Runner Modal */}
        <WorkflowQuickRunnerModal
          open={runnerOpen}
          definition={runnerDetail ?? null}
          version={null}
          loading={triggerMutation.isPending || isRunnerDetailLoading}
          onClose={() => { setRunnerOpen(false); setRunnerTarget(null); }}
          onRun={handleModalRun}
        />
      </Space>
    </App>
  );
};
