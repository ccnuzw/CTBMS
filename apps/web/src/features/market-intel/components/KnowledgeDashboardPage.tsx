import { PageContainer } from '@ant-design/pro-components';
import {
  App,
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
} from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDictionary } from '@/hooks/useDictionaries';
import {
  useTopicEvolution,
  useWeeklyOverview,
} from '../api/knowledge-hooks';
import { KNOWLEDGE_SENTIMENT_LABELS, KNOWLEDGE_TYPE_LABELS } from '../constants/knowledge-labels';


const { Text } = Typography;

import { Line } from '@ant-design/plots';

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

export const KnowledgeDashboardPage: React.FC = () => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();
  const { data: commodityDict } = useDictionary('COMMODITY');
  const { data: timeRangeDict } = useDictionary('TIME_RANGE');
  const [timeRange, setTimeRange] = useState('90D');
  const [commodity, setCommodity] = useState<string | undefined>(undefined);

  // Convert timeRange to weeks for API
  const weeks = useMemo(() => {
    const map: Record<string, number> = {
      '30D': 4,
      '90D': 12,
      '180D': 26,
      '365D': 52,
    };
    return map[timeRange] || 12;
  }, [timeRange]);

  const { data: weeklyOverview } = useWeeklyOverview();
  const { data: topicEvolution, isLoading } = useTopicEvolution({ commodity, weeks });


  /* 移除风险分布计算逻辑 */





  const confidenceSeries = useMemo(
    () =>
      (topicEvolution?.trend || []).map((item) => ({
        label: item.periodKey || '-',
        value: item.confidence ?? 0,
      })),
    [topicEvolution],
  );

  const lineConfig = {
    data: confidenceSeries,
    xField: 'label',
    yField: 'value',
    point: {
      size: 5,
      shape: 'diamond',
    },
    label: {
      style: {
        fill: '#aaa',
      },
    },
    color: '#1677ff',
    height: 220,
    autoFit: true,
    yAxis: {
      max: 100,
      min: 0,
    }
  };

  return (
    <PageContainer>
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
              options={(commodityDict || []).map((item) => ({
                value: item.code,
                label: item.label,
              }))}
            />
            <Select
              value={timeRange}
              style={{ width: 120 }}
              onChange={(value) => setTimeRange(value)}
              options={(timeRangeDict || [])
                .filter((item) => ['30D', '90D', '180D', '365D'].includes(item.code))
                .map((item) => ({
                  value: item.code,
                  label: item.label,
                }))}
            />
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
          <Empty description="当前周期暂无周报汇总数据" />
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
        <Col span={24}>
          <Card title="主题演化">
            <Card size="small" title="置信度趋势" style={{ marginBottom: 12 }}>
              <Line {...lineConfig} />
            </Card>

            <Table
              rowKey="id"
              loading={isLoading}
              pagination={false}
              size="small"
              dataSource={topicEvolution?.trend || []}
              columns={[
                { title: '周期', dataIndex: 'periodKey', key: 'periodKey', width: 100 },
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
                  ellipsis: true,
                  render: (value) => (
                    <Text ellipsis={{ tooltip: value }} style={{ maxWidth: '100%' }}>
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
                      onClick={() => navigate(`/intel/knowledge/items/${record.id}`)}
                    >
                      查看
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};
