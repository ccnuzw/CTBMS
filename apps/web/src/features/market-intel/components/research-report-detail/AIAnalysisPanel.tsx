import React from 'react';
import {
  Card,
  Typography,
  Space,
  Statistic,
  List,
  Tag,
  Empty,
  Descriptions,
  Row,
  Col,
  theme,
} from 'antd';
import { KnowledgeItem } from '../../api/knowledge-hooks';
import {
  RobotOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  BulbOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useDictionaries } from '@/hooks/useDictionaries';

import { MARKET_SENTIMENT_LABELS, PREDICTION_TIMEFRAME_LABELS } from '../../constants';

const { Text } = Typography;

interface AIAnalysisPanelProps {
  report: KnowledgeItem;
  mode?: 'summary' | 'data';
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ report, mode = 'summary' }) => {
  const { token } = theme.useToken();
  const { data: dictionaries } = useDictionaries(['MARKET_SENTIMENT', 'PREDICTION_TIMEFRAME']);

  const normalizeKey = (value?: string | null) => (value || '').trim().toUpperCase();

  const sentimentMeta = React.useMemo(() => {
    const labels: Record<string, string> = {};
    const codeMap: Record<string, string> = {
      BULLISH: 'BULLISH',
      BEARISH: 'BEARISH',
      NEUTRAL: 'NEUTRAL',
      MIXED: 'MIXED',
      POSITIVE: 'BULLISH',
      NEGATIVE: 'BEARISH',
      STABLE: 'NEUTRAL',
    };

    Object.entries(MARKET_SENTIMENT_LABELS).forEach(([code, label]) => {
      labels[normalizeKey(code)] = label;
    });

    const items = dictionaries?.MARKET_SENTIMENT?.filter((item) => item.isActive) || [];
    items.forEach((item) => {
      const normalizedCode = normalizeKey(item.code);
      labels[normalizedCode] = item.label;
      codeMap[normalizedCode] = normalizedCode;
      const aliases = ((item.meta as { aliases?: string[] } | null)?.aliases || []).filter(
        (alias): alias is string => Boolean(alias),
      );
      aliases.forEach((alias) => {
        codeMap[normalizeKey(alias)] = normalizedCode;
      });
    });

    return { labels, codeMap };
  }, [dictionaries]);

  const timeframeMeta = React.useMemo(() => {
    const labels: Record<string, string> = {};
    const codeMap: Record<string, string> = {
      SHORT: 'SHORT',
      MEDIUM: 'MEDIUM',
      LONG: 'LONG',
      SHORT_TERM: 'SHORT',
      MEDIUM_TERM: 'MEDIUM',
      LONG_TERM: 'LONG',
    };

    Object.entries(PREDICTION_TIMEFRAME_LABELS).forEach(([code, label]) => {
      labels[normalizeKey(code)] = label;
    });

    const items = dictionaries?.PREDICTION_TIMEFRAME?.filter((item) => item.isActive) || [];
    items.forEach((item) => {
      const normalizedCode = normalizeKey(item.code);
      labels[normalizedCode] = item.label;
      codeMap[normalizedCode] = normalizedCode;
      const aliases = ((item.meta as { aliases?: string[] } | null)?.aliases || []).filter(
        (alias): alias is string => Boolean(alias),
      );
      aliases.forEach((alias) => {
        codeMap[normalizeKey(alias)] = normalizedCode;
      });
    });

    return { labels, codeMap };
  }, [dictionaries]);

  const resolveSentimentCode = (value?: string | null) => {
    const normalized = normalizeKey(value);
    return sentimentMeta.codeMap[normalized] || normalized;
  };

  const resolveTimeframeCode = (value?: string | null) => {
    const normalized = normalizeKey(value);
    return timeframeMeta.codeMap[normalized] || normalized;
  };

  const getSentimentLabel = (value?: string | null) => {
    const code = resolveSentimentCode(value);
    return sentimentMeta.labels[code] || value || '震荡';
  };

  const getTimeframeLabel = (value?: string | null) => {
    const code = resolveTimeframeCode(value);
    return timeframeMeta.labels[code] || value || '未知';
  };

  // Helper to safely access AI data which might be mapped to top-level fields or inside aiAnalysis
  // Based on previous tasks, we mapped keyPoints, prediction, dataPoints to the root of ResearchReportResponse
  // but schema.prisma definitions are Json? type.

  // Check types first. ResearchReportResponse (from types packages) defines:
  // keyPoints: any; prediction: any; dataPoints: any;

  let keyPoints: any[] = [];
  if (Array.isArray(report.analysis?.keyPoints)) {
    keyPoints = report.analysis.keyPoints;
  } else if (report.analysis?.keyPoints && typeof report.analysis.keyPoints === 'object') {
    const kpObj = report.analysis.keyPoints as Record<string, any>;
    keyPoints = Array.isArray(kpObj.aiKeyPoints) ? kpObj.aiKeyPoints : [];
  }
  const prediction = report.analysis?.prediction as any;
  const dataPoints = (report.analysis?.dataPoints as any[]) || [];

  const getSentimentIcon = (sentiment?: string) => {
    const sentimentCode = resolveSentimentCode(sentiment);
    if (sentimentCode === 'BULLISH') return <RiseOutlined style={{ color: '#cf1322' }} />;
    if (sentimentCode === 'BEARISH') return <FallOutlined style={{ color: '#3f8600' }} />;
    return <MinusOutlined style={{ color: token.colorTextTertiary }} />;
  };

  const structuredAnalysis = (report as any).analysis?.structuredAnalysis;

  if (mode === 'data') {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined />
            关键数据指标
          </Space>
        }
        bordered={false}
        className="shadow-sm"
      >
        {dataPoints.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            {dataPoints.map((dp: any, idx: number) => (
              <Card key={idx} size="small" type="inner">
                <Statistic
                  title={dp.metric}
                  value={dp.value}
                  suffix={
                    <span style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                      {dp.unit}
                    </span>
                  }
                  valueStyle={{ fontSize: '18px' }}
                />
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="暂无数据提取" />
        )}
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={15}>
        <Card
          bordered={false}
          className="shadow-sm"
          title={
            <Space>
              <BulbOutlined style={{ color: '#faad14' }} /> 关键观点
            </Space>
          }
        >
          {keyPoints.length > 0 ? (
            <List
              dataSource={keyPoints}
              renderItem={(item: any) => (
                <List.Item>
                  <Space align="start">
                    <div style={{ marginTop: 4 }}>{getSentimentIcon(item.sentiment)}</div>
                    <div>
                      <Text strong>{item.point}</Text>
                      {item.confidence && (
                        <Tag style={{ marginLeft: 8 }} color="blue">
                          置信度: {item.confidence}%
                        </Tag>
                      )}
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无关键观点" />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        <Card
          bordered={false}
          className="shadow-sm"
          title={
            <Space>
              <RobotOutlined />
              AI 结论
            </Space>
          }
        >
          {prediction ? (
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="预测方向">
                <Space>
                  {getSentimentIcon(prediction.direction)}
                  {getSentimentLabel(prediction.direction)}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="时间周期">
                {getTimeframeLabel(prediction.timeframe)}
              </Descriptions.Item>
              <Descriptions.Item label="结论逻辑">
                {prediction.logic || prediction.reasoning || '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Empty description="暂无 AI 结论" />
          )}
        </Card>
      </Col>

      {/* Structured Analysis (Deep Analysis) */}
      {structuredAnalysis && (
        <Col span={24}>
          <Card
            bordered={false}
            className="shadow-sm"
            title={
              <Space>
                <LineChartOutlined /> 深度分析 (Deep Analysis)
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card size="small" title="关键驱动因素 (Drivers)" type="inner">
                  <ul>
                    {(structuredAnalysis.drivers || []).map((d: string, i: number) => <li key={i}>{d}</li>)}
                  </ul>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" title="风险因素 (Risks)" type="inner">
                  <ul>
                    {(structuredAnalysis.risks || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" title="操作建议 (Suggestions)" type="inner">
                  <ul>
                    {(structuredAnalysis.suggestions || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </Card>
              </Col>

              {structuredAnalysis.outlook && (
                <Col span={24}>
                  <Descriptions title="市场展望 (Outlook)" bordered size="small">
                    <Descriptions.Item label="短期 (Short Term)">{structuredAnalysis.outlook.shortTerm || '-'}</Descriptions.Item>
                    <Descriptions.Item label="中期 (Medium Term)">{structuredAnalysis.outlook.mediumTerm || '-'}</Descriptions.Item>
                    <Descriptions.Item label="长期 (Long Term)">{structuredAnalysis.outlook.longTerm || '-'}</Descriptions.Item>
                  </Descriptions>
                </Col>
              )}
            </Row>
          </Card>
        </Col>
      )}
    </Row>
  );
};
