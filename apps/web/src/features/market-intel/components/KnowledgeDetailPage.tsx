import { ArrowLeftOutlined, BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  useGenerateWeeklyRollup,
  useKnowledgeItem,
  useKnowledgeRelations,
  useReanalyzeKnowledge,
} from '../api/knowledge-hooks';
import {
  formatKnowledgeTagLabel,
  KNOWLEDGE_PERIOD_LABELS,
  KNOWLEDGE_RELATION_LABELS,
  KNOWLEDGE_SENTIMENT_LABELS,
  KNOWLEDGE_SOURCE_LABELS,
  KNOWLEDGE_STATUS_META,
  KNOWLEDGE_TYPE_LABELS,
} from '../constants/knowledge-labels';
import { KnowledgeRelationGraph } from './KnowledgeRelationGraph';
import { KnowledgeTopActionsBar } from './knowledge/KnowledgeTopActionsBar';

const { Paragraph, Text, Title } = Typography;

const TYPE_LABEL_MAP = KNOWLEDGE_TYPE_LABELS;

const STATUS_META_MAP = KNOWLEDGE_STATUS_META;

const PERIOD_LABEL_MAP = KNOWLEDGE_PERIOD_LABELS;

const SOURCE_LABEL_MAP = KNOWLEDGE_SOURCE_LABELS;

const RELATION_LABEL_MAP = KNOWLEDGE_RELATION_LABELS;

const SENTIMENT_LABEL_MAP = KNOWLEDGE_SENTIMENT_LABELS;

const formatTagLabel = formatKnowledgeTagLabel;

type WeeklySections = {
  market?: string[];
  events?: string[];
  risks?: string[];
  outlook?: string[];
  metrics?: {
    priceMoveCount?: number;
    eventCount?: number;
    riskLevel?: string;
    sentiment?: string;
    confidence?: number;
  };
};

export const KnowledgeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: detail, isLoading } = useKnowledgeItem(id);
  const { data: relations } = useKnowledgeRelations(id);
  const reanalyzeMutation = useReanalyzeKnowledge();
  const weeklyRollupMutation = useGenerateWeeklyRollup();

  const weeklySections: WeeklySections = useMemo(() => {
    const keyPoints = detail?.analysis?.keyPoints as any;
    if (!keyPoints || typeof keyPoints !== 'object') return {};
    return {
      market: Array.isArray(keyPoints.market) ? keyPoints.market : [],
      events: Array.isArray(keyPoints.events) ? keyPoints.events : [],
      risks: Array.isArray(keyPoints.risks) ? keyPoints.risks : [],
      outlook: Array.isArray(keyPoints.outlook) ? keyPoints.outlook : [],
      metrics:
        keyPoints.metrics && typeof keyPoints.metrics === 'object' ? keyPoints.metrics : undefined,
    };
  }, [detail]);

  const fromState = (location.state as { from?: string } | null)?.from;
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const backTo =
    returnTo ||
    (fromState === 'workbench'
      ? '/intel/knowledge?tab=workbench'
      : fromState === 'dashboard'
        ? '/intel/knowledge/dashboard'
        : '/intel/knowledge?tab=library');

  const navPath =
    fromState === 'workbench'
      ? ['工作台', '知识详情']
      : fromState === 'dashboard'
        ? ['分析看板', '知识详情']
        : ['知识库', '知识详情'];

  if (isLoading) {
    return (
      <PageContainer>
        <div style={{ textAlign: 'center', padding: 120 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!detail) {
    return (
      <PageContainer>
        <Empty description="知识条目不存在" />
      </PageContainer>
    );
  }

  const renderSection = (title: string, items?: string[]) => (
    <Card title={title}>
      {!items || items.length === 0 ? (
        <Text type="secondary">暂无提取内容</Text>
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(item) => (
            <List.Item>
              <Text>{item}</Text>
            </List.Item>
          )}
        />
      )}
    </Card>
  );

  return (
    <PageContainer
      onBack={() => navigate(backTo)}
      title={detail.title}
      subTitle="统一知识详情"
      tags={
        <Space>
          <Tag>{detail.typeLabel || TYPE_LABEL_MAP[detail.type] || detail.type}</Tag>
          <Tag color={detail.statusColor || STATUS_META_MAP[detail.status]?.color || 'default'}>
            {detail.statusLabel || STATUS_META_MAP[detail.status]?.label || detail.status}
          </Tag>
        </Space>
      }
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo)}>
          {backTo.includes('workbench')
            ? '返回工作台'
            : backTo.includes('/dashboard')
              ? '返回看板'
              : '返回列表'}
        </Button>,
        <Button
          key="dashboard"
          icon={<BarChartOutlined />}
          onClick={() => navigate('/intel/knowledge/dashboard')}
        >
          分析看板
        </Button>,
        <Button
          key="reanalyze"
          type="primary"
          icon={<ReloadOutlined />}
          loading={reanalyzeMutation.isPending}
          onClick={() => reanalyzeMutation.mutate({ id: detail.id, triggerDeepAnalysis: true })}
        >
          深度重分析
        </Button>,
      ]}
    >
      <KnowledgeTopActionsBar
        contextBackLabel={
          backTo.includes('workbench')
            ? '返回工作台'
            : backTo.includes('/dashboard')
              ? '返回看板'
              : undefined
        }
        onContextBack={
          backTo.includes('workbench') || backTo.includes('/dashboard')
            ? () => navigate(backTo)
            : undefined
        }
        onBackLibrary={() => navigate('/intel/knowledge?tab=library')}
        onQuickEntry={() => navigate('/intel/entry')}
        onOpenDashboard={() => navigate('/intel/knowledge/dashboard?from=library')}
        onCreateReport={() => navigate('/intel/knowledge/reports/create')}
        generatingWeekly={weeklyRollupMutation.isPending}
        onGenerateWeekly={async () => {
          try {
            await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
            message.success('已生成本周周报');
          } catch (error) {
            message.error('周报生成失败，请稍后重试');
            console.error(error);
          }
        }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card title="摘要">
              <Paragraph style={{ marginBottom: 0 }}>
                {detail.analysis?.summary || '暂无 AI 摘要'}
              </Paragraph>
            </Card>

            {detail.type === 'WEEKLY' && (
              <>
                {renderSection('一、行情', weeklySections.market)}
                {renderSection('二、事件', weeklySections.events)}
                {renderSection('三、风险', weeklySections.risks)}
                {renderSection('四、展望', weeklySections.outlook)}
              </>
            )}

            <Card title="正文">
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {detail.contentPlain || detail.contentRich || '-'}
              </Paragraph>
            </Card>

            <KnowledgeRelationGraph
              center={{ id: detail.id, title: detail.title, type: detail.type }}
              outgoing={relations?.outgoing || []}
              incoming={relations?.incoming || []}
              onJump={(targetId) => navigate(`/intel/knowledge/items/${targetId}`)}
            />

            <Card title="关系明细">
              <Title level={5}>出向关系</Title>
              <List
                size="small"
                dataSource={relations?.outgoing || []}
                locale={{ emptyText: '暂无出向关系' }}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                      <Tag color="geekblue" style={{ flexShrink: 0 }}>
                        {RELATION_LABEL_MAP[item.relationType] || item.relationType}
                      </Tag>
                      <Button
                        type="link"
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          padding: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                        onClick={() =>
                          item.toKnowledge?.id &&
                          navigate(`/intel/knowledge/items/${item.toKnowledge.id}`)
                        }
                      >
                        {item.toKnowledge?.title || '-'}
                      </Button>
                      <Text type="secondary" style={{ flexShrink: 0, fontSize: 12 }}>
                        权重 {item.weight}
                      </Text>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card title="基础信息">
              <Descriptions column={1} size="small" colon>
                <Descriptions.Item label="周期类型">
                  {detail.periodTypeLabel ||
                    PERIOD_LABEL_MAP[detail.periodType] ||
                    detail.periodType}
                </Descriptions.Item>
                <Descriptions.Item label="周期标识">{detail.periodKey || '-'}</Descriptions.Item>
                <Descriptions.Item label="来源">
                  {detail.sourceTypeLabel ||
                    (detail.sourceType
                      ? SOURCE_LABEL_MAP[detail.sourceType] || detail.sourceType
                      : '-')}
                </Descriptions.Item>
                <Descriptions.Item label="附件数">
                  {detail.attachments?.length || 0}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {detail.type === 'WEEKLY' && (
              <Card title="周报指标摘要">
                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Statistic
                      title="价格异动"
                      value={weeklySections.metrics?.priceMoveCount ?? 0}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic title="关键事件" value={weeklySections.metrics?.eventCount ?? 0} />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="置信度"
                      value={weeklySections.metrics?.confidence ?? 0}
                      suffix="%"
                    />
                  </Col>
                  <Col span={12}>
                    <Space direction="vertical" size={4}>
                      <Text type="secondary">风险等级</Text>
                      <Tag
                        color={
                          weeklySections.metrics?.riskLevel === 'HIGH'
                            ? 'red'
                            : weeklySections.metrics?.riskLevel === 'MEDIUM'
                              ? 'orange'
                              : 'green'
                        }
                      >
                        {weeklySections.metrics?.riskLevel || 'LOW'}
                      </Tag>
                      <Text type="secondary">
                        情绪：
                        {SENTIMENT_LABEL_MAP[weeklySections.metrics?.sentiment || ''] ||
                          weeklySections.metrics?.sentiment ||
                          '中性'}
                      </Text>
                    </Space>
                  </Col>
                </Row>
              </Card>
            )}

            <Card title="标签">
              <Space wrap>
                {(detail.analysis?.tags || []).length === 0 ? (
                  <Text type="secondary">暂无标签</Text>
                ) : (
                  (detail.analysis?.tags || []).map((tag) => (
                    <Tag key={tag}>#{formatTagLabel(tag)}</Tag>
                  ))
                )}
              </Space>
            </Card>

            <Card title="入向关系">
              <List
                size="small"
                dataSource={relations?.incoming || []}
                locale={{ emptyText: '暂无入向关系' }}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                      <Tag color="purple" style={{ flexShrink: 0 }}>
                        {RELATION_LABEL_MAP[item.relationType] || item.relationType}
                      </Tag>
                      <Button
                        type="link"
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          padding: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                        }}
                        onClick={() =>
                          item.fromKnowledge?.id &&
                          navigate(`/intel/knowledge/items/${item.fromKnowledge.id}`)
                        }
                      >
                        {item.fromKnowledge?.title || '-'}
                      </Button>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </PageContainer>
  );
};
