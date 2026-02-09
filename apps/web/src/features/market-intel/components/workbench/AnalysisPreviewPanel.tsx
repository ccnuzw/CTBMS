import { Area, Pie } from '@ant-design/plots';
import { BarChartOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

type TrendPoint = { date: string; count: number };
type SourcePoint = { name: string; value: number };
type HotTopic = { topic: string; displayTopic?: string; count: number };

type Props = {
  trend: TrendPoint[];
  sourceData: SourcePoint[];
  hotTopics: HotTopic[];
  loading?: boolean;
  onOpenDashboard: () => void;
  onOpenSearchTopic: (topic: string) => void;
};

export const AnalysisPreviewPanel: React.FC<Props> = ({
  trend,
  sourceData,
  hotTopics,
  loading,
  onOpenDashboard,
  onOpenSearchTopic,
}) => {
  const trendConfig = {
    data: trend,
    xField: 'date',
    yField: 'count',
    smooth: true,
    areaStyle: () => ({ fillOpacity: 0.16 }),
    height: 220,
  };

  const sourceConfig = {
    data: sourceData,
    angleField: 'value',
    colorField: 'name',
    radius: 0.75,
    legend: { position: 'bottom' as const },
    height: 220,
  };

  return (
    <Card
      title="分析预览"
      style={{ borderRadius: 14, borderColor: '#e9edf5' }}
      extra={
        <Button icon={<BarChartOutlined />} type="link" onClick={onOpenDashboard}>
          查看完整看板
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="文档采集趋势">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 36 }}>
                <Text type="secondary">加载中...</Text>
              </div>
            ) : trend.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
            ) : (
              <Area {...trendConfig} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="来源分布">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 36 }}>
                <Text type="secondary">加载中...</Text>
              </div>
            ) : sourceData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源分布" />
            ) : (
              <Pie {...sourceConfig} />
            )}
          </Card>
        </Col>
      </Row>

      <Card size="small" title="热门话题" style={{ marginTop: 16 }}>
        {hotTopics.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热门话题" />
        ) : (
          <Space wrap>
            {hotTopics.slice(0, 12).map((topic) => (
              <Tag
                key={topic.topic}
                color="blue"
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenSearchTopic(topic.topic)}
              >
                {topic.displayTopic || topic.topic} ({topic.count})
              </Tag>
            ))}
          </Space>
        )}
      </Card>
    </Card>
  );
};
