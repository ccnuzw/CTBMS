import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Col,
  Empty,
  Grid,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMemo, useState } from 'react';
import { ArrowLeftOutlined, AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useGenerateWeeklyRollup,
  useTopicEvolution,
  useWeeklyOverview,
} from '../api/knowledge-hooks';
import { KNOWLEDGE_SENTIMENT_LABELS, KNOWLEDGE_TYPE_LABELS } from '../constants/knowledge-labels';
import { KnowledgeTopActionsBar } from './knowledge/KnowledgeTopActionsBar';

const { Text } = Typography;

const SENTIMENT_COLOR: Record<string, string> = {
  BULLISH: 'green',
  BEARISH: 'red',
  NEUTRAL: 'blue',
};

const SENTIMENT_LABEL = KNOWLEDGE_SENTIMENT_LABELS;

const RISK_LABEL: Record<string, string> = {
  HIGH: '高风险',
  MEDIUM: '中风险',
  LOW: '低风险',
};

const TYPE_LABEL = KNOWLEDGE_TYPE_LABELS;

const RISK_COLOR: Record<string, string> = {
  HIGH: '#f5222d',
  MEDIUM: '#fa8c16',
  LOW: '#52c41a',
};

const ConfidenceLineChart: React.FC<{
  values: Array<{ label: string; value: number }>;
}> = ({ values }) => {
  if (values.length === 0) return <Empty description="暂无置信度趋势数据" />;

  const width = 640;
  const height = 220;
  const padding = 30;
  const max = 100;
  const min = 0;

  const points = values
    .map((item, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, values.length - 1);
      const y = height - padding - ((item.value - min) / (max - min)) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} role="img" aria-label="confidence trend">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#d9d9d9"
        />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#d9d9d9" />
        <polyline fill="none" stroke="#1677ff" strokeWidth="3" points={points} />
        {values.map((item, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(1, values.length - 1);
          const y = height - padding - ((item.value - min) / (max - min)) * (height - padding * 2);
          return (
            <g key={`${item.label}-${index}`}>
              <circle cx={x} cy={y} r={4} fill="#1677ff" />
              <text x={x} y={height - 8} textAnchor="middle" fontSize="10" fill="#8c8c8c">
                {item.label}
              </text>
              <text x={x} y={y - 8} textAnchor="middle" fontSize="10" fill="#262626">
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const KnowledgeDashboardPage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [weeks, setWeeks] = useState(8);
  const [commodity, setCommodity] = useState<string | undefined>(undefined);

  const { data: weeklyOverview } = useWeeklyOverview();
  const { data: topicEvolution, isLoading } = useTopicEvolution({ commodity, weeks });
  const weeklyRollupMutation = useGenerateWeeklyRollup();

  const byTypeRows = useMemo(() => {
    const byType = weeklyOverview?.sourceStats.byType || {};
    return Object.entries(byType).map(([type, count]) => ({ type, count }));
  }, [weeklyOverview]);

  const confidenceSeries = useMemo(
    () =>
      (topicEvolution?.trend || []).map((item) => ({
        label: item.periodKey || '-',
        value: item.confidence ?? 0,
      })),
    [topicEvolution],
  );

  const riskDistribution = useMemo(() => {
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    (topicEvolution?.trend || []).forEach((item) => {
      if (item.riskLevel === 'HIGH') counts.HIGH += 1;
      else if (item.riskLevel === 'MEDIUM') counts.MEDIUM += 1;
      else counts.LOW += 1;
    });
    const total = Math.max(1, counts.HIGH + counts.MEDIUM + counts.LOW);
    return {
      counts,
      percentages: {
        HIGH: Math.round((counts.HIGH / total) * 100),
        MEDIUM: Math.round((counts.MEDIUM / total) * 100),
        LOW: Math.round((counts.LOW / total) * 100),
      },
    };
  }, [topicEvolution]);

  const fromWorkbench = searchParams.get('from') === 'workbench';
  const dashboardSearch = searchParams.toString();
  const dashboardReturnTo = `/intel/knowledge/dashboard${dashboardSearch ? `?${dashboardSearch}` : ''}`;

  const backFallback = useMemo(() => {
    const from = searchParams.get('from');
    if (from === 'workbench') return '/intel/knowledge?tab=workbench';
    if (from === 'library') return '/intel/knowledge?tab=library';
    return '/intel/knowledge?tab=library';
  }, [searchParams]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backFallback);
  };

  const jumpToLibraryByType = (type?: string) => {
    const params = new URLSearchParams();
    params.set('tab', 'library');
    params.set('from', 'dashboard');
    if (type === 'RESEARCH') params.set('content', 'reports');
    navigate(`/intel/knowledge?${params.toString()}`);
  };

  return (
    <PageContainer
      title="知识分析看板"
      subTitle="周报质量、来源构成与主题演化"
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回上一页
        </Button>,
      ]}
    >
      <KnowledgeTopActionsBar
        contextBackLabel={fromWorkbench ? '返回工作台' : undefined}
        onContextBack={fromWorkbench ? () => navigate('/intel/knowledge?tab=workbench') : undefined}
        onBackLibrary={() => navigate('/intel/knowledge?tab=library&from=dashboard')}
        onCreateReport={() => navigate('/intel/knowledge/reports/create')}
        generatingWeekly={weeklyRollupMutation.isPending}
        onGenerateWeekly={async () => {
          try {
            await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
            message.success('已生成本周周报，请稍候刷新看板');
          } catch (error) {
            message.error('周报生成失败，请稍后重试');
            console.error(error);
          }
        }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Space
          wrap
          style={{ width: '100%', justifyContent: screens.md ? 'space-between' : 'flex-start' }}
        >
          <Text type="secondary">可按品种和观察周期查看主题演化与风险结构</Text>
          <Space wrap>
            <Select
              allowClear
              placeholder="按品种筛选"
              style={{ width: 160 }}
              onChange={(value) => setCommodity(value)}
              options={[
                { value: 'SOYBEAN_MEAL', label: '豆粕' },
                { value: 'SOYBEAN_OIL', label: '豆油' },
                { value: 'SUGAR', label: '白糖' },
                { value: 'COTTON', label: '棉花' },
                { value: 'HOG', label: '生猪' },
                { value: 'UREA', label: '尿素' },
              ]}
            />
            <Select
              value={weeks}
              style={{ width: 100 }}
              onChange={(value) => setWeeks(value)}
              options={[
                { value: 4, label: '4周' },
                { value: 8, label: '8周' },
                { value: 12, label: '12周' },
              ]}
            />
            <Button icon={<AppstoreOutlined />} onClick={() => navigate('/intel/entry')}>
              快速采集
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="本周来源总数"
              value={weeklyOverview?.sourceStats.totalSources || 0}
              suffix="条"
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="风险等级"
              value={
                weeklyOverview?.metrics?.riskLevelLabel ||
                (weeklyOverview?.metrics?.riskLevel
                  ? RISK_LABEL[weeklyOverview.metrics.riskLevel] || weeklyOverview.metrics.riskLevel
                  : '暂无')
              }
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="分析置信度"
              value={weeklyOverview?.metrics?.confidence || 0}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      {!weeklyOverview?.found && (
        <Card style={{ marginTop: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Text type="secondary">当前周期暂无周报汇总数据，可先生成本周周报后再查看看板。</Text>
            <Button
              icon={<ThunderboltOutlined />}
              type="primary"
              loading={weeklyRollupMutation.isPending}
              onClick={async () => {
                try {
                  await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
                  message.success('已生成本周周报，请稍候刷新看板');
                } catch (error) {
                  message.error('周报生成失败，请稍后重试');
                  console.error(error);
                }
              }}
            >
              立即生成
            </Button>
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
        <Col xs={24} lg={10}>
          <Card title="本周来源构成" style={{ marginBottom: 16 }}>
            {byTypeRows.length === 0 ? (
              <Empty description="暂无来源数据" />
            ) : (
              <Table
                rowKey="type"
                pagination={false}
                size="small"
                dataSource={byTypeRows}
                columns={[
                  {
                    title: '类型',
                    dataIndex: 'type',
                    key: 'type',
                    render: (value) => <Tag>{TYPE_LABEL[value] || value}</Tag>,
                  },
                  { title: '数量', dataIndex: 'count', key: 'count' },
                  {
                    title: '操作',
                    key: 'action',
                    width: 90,
                    render: (_value, record) => (
                      <Button type="link" onClick={() => jumpToLibraryByType(record.type)}>
                        查看
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>

          <Card title="关键来源" style={{ marginBottom: 16 }}>
            {weeklyOverview?.topSources?.length ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={weeklyOverview.topSources.slice(0, 6)}
                columns={[
                  {
                    title: '标题',
                    dataIndex: 'title',
                    key: 'title',
                    render: (value, record) => (
                      <Button
                        type="link"
                        style={{ paddingInline: 0 }}
                        onClick={() =>
                          navigate(`/intel/knowledge/items/${record.id}`, {
                            state: {
                              from: fromWorkbench ? 'workbench' : 'dashboard',
                              returnTo: dashboardReturnTo,
                            },
                          })
                        }
                      >
                        {value}
                      </Button>
                    ),
                  },
                  {
                    title: '类型',
                    dataIndex: 'typeLabel',
                    key: 'typeLabel',
                    width: 80,
                    render: (value) => <Tag>{value}</Tag>,
                  },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关键来源" />
            )}
          </Card>

          <Card title="风险分布">
            <Space direction="vertical" style={{ width: '100%' }}>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                <div key={level}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text>{RISK_LABEL[level]}</Text>
                    <Text type="secondary">{riskDistribution.counts[level]} 周</Text>
                  </Space>
                  <Progress
                    percent={riskDistribution.percentages[level]}
                    strokeColor={RISK_COLOR[level]}
                    trailColor="#f5f5f5"
                  />
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="主题演化">
            <Card size="small" title="置信度趋势" style={{ marginBottom: 12 }}>
              <ConfidenceLineChart values={confidenceSeries} />
            </Card>

            <Table
              rowKey="id"
              loading={isLoading}
              pagination={false}
              size="small"
              dataSource={topicEvolution?.trend || []}
              columns={[
                { title: '周期', dataIndex: 'periodKey', key: 'periodKey', width: 110 },
                {
                  title: '情绪',
                  dataIndex: 'sentiment',
                  key: 'sentiment',
                  width: 100,
                  render: (value, record) => (
                    <Tag color={SENTIMENT_COLOR[value] || 'default'}>
                      {value
                        ? topicEvolution?.trend.find((item) => item.id === record.id)
                            ?.sentimentLabel ||
                          SENTIMENT_LABEL[value] ||
                          value
                        : '暂无'}
                    </Tag>
                  ),
                },
                {
                  title: '风险',
                  dataIndex: 'riskLevel',
                  key: 'riskLevel',
                  width: 100,
                  render: (value, record) => (
                    <Tag color={value === 'HIGH' ? 'red' : value === 'MEDIUM' ? 'orange' : 'green'}>
                      {value
                        ? topicEvolution?.trend.find((item) => item.id === record.id)
                            ?.riskLevelLabel ||
                          RISK_LABEL[value] ||
                          value
                        : '暂无'}
                    </Tag>
                  ),
                },
                {
                  title: '摘要',
                  dataIndex: 'summary',
                  key: 'summary',
                  render: (value) => (
                    <Text ellipsis={{ tooltip: value }} style={{ maxWidth: 340 }}>
                      {value || '-'}
                    </Text>
                  ),
                },
                {
                  title: '详情',
                  key: 'action',
                  width: 90,
                  render: (_value, record) => (
                    <Button
                      type="link"
                      onClick={() =>
                        navigate(`/intel/knowledge/items/${record.id}`, {
                          state: {
                            from: fromWorkbench ? 'workbench' : 'dashboard',
                            returnTo: dashboardReturnTo,
                          },
                        })
                      }
                    >
                      查看
                    </Button>
                  ),
                },
              ]}
            />

            {topicEvolution?.trend?.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <Button
                  icon={<ThunderboltOutlined />}
                  type="primary"
                  loading={weeklyRollupMutation.isPending}
                  onClick={async () => {
                    try {
                      await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
                      message.success('已生成本周周报，请稍候查看分析看板数据');
                    } catch (error) {
                      message.error('周报生成失败，请稍后重试');
                      console.error(error);
                    }
                  }}
                >
                  生成本周周报数据
                </Button>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};
