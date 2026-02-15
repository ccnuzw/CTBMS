import { Area, Pie } from '@ant-design/plots';
import { BarChartOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Space, Tag, Typography, theme } from 'antd';
import { INTEL_SOURCE_TYPE_LABELS, IntelSourceType } from '@packages/types';
import { useTheme } from '@/theme/ThemeContext';

const { Text } = Typography;

type TrendPoint = { date: string; count: number };
type SourcePoint = { name: string; value: number };
type HotTopic = { topic: string; displayTopic?: string; count: number };

const SOURCE_LABEL_MAP: Record<string, string> = {
  ...INTEL_SOURCE_TYPE_LABELS,
  // Fallbacks for legacy or other types if needed
  NEWS_MEDIA: '新闻媒体',
  SOCIAL_MEDIA: '社交媒体',
  ENTERPRISE: '企业公告',
  OTHER: '其他来源',
};

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
  const { token } = theme.useToken();
  const { isDarkMode } = useTheme();
  const plotTheme = isDarkMode ? 'classicDark' : 'classic';

  const trendConfig = {
    data: trend,
    theme: plotTheme,
    xField: 'date',
    yField: 'count',
    smooth: true,
    areaStyle: () => ({ fillOpacity: 0.16 }),
    height: 220,
    xAxis: {
      label: {
        style: {
          fill: token.colorText,
        },
      },
    },
    yAxis: {
      label: {
        style: {
          fill: token.colorText,
        },
      },
    },
  };

  const sourceConfig = {
    data: sourceData,
    theme: plotTheme,
    angleField: 'value',
    colorField: 'name',
    radius: 0.75,
    legend: { position: 'bottom' as const, itemName: { style: { fill: token.colorText } } },
    height: 220,
    label: {
      text: (d: any) => `${d.value}`,
      style: {
        fill: token.colorText,
      },
    },
  };

  const mappedSourceData = sourceData.map((item) => ({
    ...item,
    name:
      SOURCE_LABEL_MAP[item.name as IntelSourceType] || SOURCE_LABEL_MAP[item.name] || item.name,
  }));

  return (
    <Card
      title="分析预览"
      style={{ borderRadius: 14, borderColor: token.colorBorderSecondary }}
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
              <Pie {...sourceConfig} data={mappedSourceData} />
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
