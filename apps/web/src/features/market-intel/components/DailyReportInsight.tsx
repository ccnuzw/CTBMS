import React from 'react';
import { Card, Table, Tag, Typography, Tabs, Timeline, Statistic, Row, Col, Descriptions, Badge, theme } from 'antd';
import {
    RiseOutlined,
    FallOutlined,
    MinusOutlined,
    DatabaseOutlined,
    RadarChartOutlined,
    BulbOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import {
    type AIAnalysisResult,
    type ExtractedPricePoint,
    type StructuredEvent,
    IntelSourceType
} from '../types';

const { Text, Paragraph, Title } = Typography;

interface DailyReportInsightProps {
    aiResult: AIAnalysisResult;
}

export const DailyReportInsight: React.FC<DailyReportInsightProps> = ({ aiResult }) => {
    const { token } = theme.useToken();

    // 1. Price Data Columns
    const priceColumns = [
        {
            title: '品种 & 等级',
            key: 'commodity',
            render: (text: any, record: ExtractedPricePoint) => (
                <div>
                    <Text strong>{record.commodity || '未识别'}</Text>
                    {record.grade && <Tag style={{ marginLeft: 8 }}>{record.grade}</Tag>}
                </div>
            ),
        },
        {
            title: '价格',
            key: 'price',
            render: (text: any, record: ExtractedPricePoint) => (
                <Text strong style={{ color: token.colorPrimary }}>
                    {record.price} <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{record.unit}</span>
                </Text>
            ),
        },
        {
            title: '涨跌',
            key: 'change',
            render: (text: any, record: ExtractedPricePoint) => {
                const change = record.change || 0;
                let color = token.colorTextSecondary;
                let Icon = MinusOutlined;

                if (change > 0) {
                    color = token.colorError; // Red for rise (CN)
                    Icon = RiseOutlined;
                } else if (change < 0) {
                    color = token.colorSuccess; // Green for fall (CN)
                    Icon = FallOutlined;
                }

                return (
                    <Text style={{ color }}>
                        <Icon /> {change !== 0 ? Math.abs(change) : '-'}
                    </Text>
                );
            },
        },
        {
            title: '采集点/位置',
            dataIndex: 'location',
            key: 'location',
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        {
            title: '类型',
            dataIndex: 'sourceType',
            key: 'sourceType',
            render: (text: string) => (
                <Tag>{text === 'ENTERPRISE' ? '企业' : text === 'PORT' ? '港口' : '地域'}</Tag>
            )
        },
        {
            title: '价格类型',
            dataIndex: 'subType',
            key: 'subType',
            render: (text: string) => {
                const labels: Record<string, string> = {
                    'LISTED': '挂牌价',
                    'TRANSACTION': '成交价',
                    'ARRIVAL': '到港价',
                    'FOB': '平舱价',
                    'STATION_ORIGIN': '站台价(产区)',
                    'STATION_DEST': '站台价(销区)',
                    'PURCHASE': '收购价',
                    'WHOLESALE': '批发价',
                    'OTHER': '其他',
                };
                return <Tag color="cyan">{labels[text] || text || '挂牌价'}</Tag>;
            }
        }
    ];

    // 2. Event Timeline Items
    const getEventItems = () => {
        if (!aiResult.events || aiResult.events.length === 0) return [];
        return aiResult.events.map((event: StructuredEvent, index: number) => ({
            label: <Text type="secondary" style={{ fontSize: 12 }}>事件 {index + 1}</Text>,
            children: (
                <Card size="small" style={{ marginBottom: 8, borderColor: token.colorBorderSecondary }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text strong>{event.subject}</Text>
                        {event.regionCode && <Tag>{event.regionCode}</Tag>}
                    </div>
                    <div style={{ margin: '4px 0' }}>
                        <Tag color="geekblue">{event.action}</Tag>
                        <Text>{event.impact}</Text>
                    </div>
                    {event.sourceText && (
                        <div style={{ marginTop: 4, padding: 8, background: token.colorFillAlter, borderRadius: 4 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                原文: "{event.sourceText}"
                            </Text>
                        </div>
                    )}
                </Card>
            )
        }));
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Top Stats */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                    <Card size="small">
                        <Statistic
                            title="价格点提取"
                            value={aiResult.pricePoints?.length || 0}
                            prefix={<DatabaseOutlined style={{ color: token.colorPrimary }} />}
                            valueStyle={{ fontSize: 18 }}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Statistic
                            title="市场心理"
                            value={aiResult.sentiment === 'positive' ? '看涨' : aiResult.sentiment === 'negative' ? '看跌' : '中性'}
                            prefix={<RadarChartOutlined style={{ color: aiResult.sentiment === 'positive' ? token.colorError : token.colorSuccess }} />}
                            valueStyle={{
                                fontSize: 18,
                                color: aiResult.sentiment === 'positive' ? token.colorError : aiResult.sentiment === 'negative' ? token.colorSuccess : token.colorText
                            }}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Statistic
                            title="有效日期"
                            value={aiResult.extractedEffectiveTime ? new Date(aiResult.extractedEffectiveTime).toLocaleDateString() : '当天'}
                            prefix={<CalendarOutlined />}
                            valueStyle={{ fontSize: 16 }}
                        />
                    </Card>
                </Col>
            </Row>

            <Tabs
                defaultActiveKey="price"
                type="card"
                items={[
                    {
                        key: 'price',
                        label: <span><DatabaseOutlined /> 价格校对 ({aiResult.pricePoints?.length || 0})</span>,
                        children: (
                            <Table
                                dataSource={(aiResult.pricePoints || []).map((p, idx) => ({ ...p, _rowKey: `${p.location}-${p.commodity}-${p.price}-${p.subType || ''}-${p.grade || ''}-${idx}` }))}
                                columns={priceColumns}
                                pagination={false}
                                size="small"
                                scroll={aiResult.pricePoints && aiResult.pricePoints.length > 10 ? { y: 400 } : undefined}
                                rowKey="_rowKey"
                            />
                        )
                    },
                    {
                        key: 'event',
                        label: <span><RiseOutlined /> 市场事件 ({aiResult.events?.length || 0})</span>,
                        children: (
                            <div style={{ padding: 12 }}>
                                <Timeline items={getEventItems()} />
                            </div>
                        )
                    },
                    {
                        key: 'insight',
                        label: <span><BulbOutlined /> 深度观点</span>,
                        children: (
                            <div style={{ padding: 12 }}>
                                {/* Market Sentiment Breakdown */}
                                {aiResult.marketSentiment && (
                                    <Descriptions title="市场心态细分" bordered size="small" column={1} style={{ marginBottom: 24 }}>
                                        {aiResult.marketSentiment.traders && (
                                            <Descriptions.Item label="贸易商心态">{aiResult.marketSentiment.traders}</Descriptions.Item>
                                        )}
                                        {aiResult.marketSentiment.processors && (
                                            <Descriptions.Item label="加工企业">{aiResult.marketSentiment.processors}</Descriptions.Item>
                                        )}
                                        {aiResult.marketSentiment.farmers && (
                                            <Descriptions.Item label="基层农户">{aiResult.marketSentiment.farmers}</Descriptions.Item>
                                        )}
                                    </Descriptions>
                                )}

                                {/* Forecast */}
                                {aiResult.forecast && (
                                    <Card size="small" title="后市预判" style={{ borderColor: token.colorPrimaryBorder }}>
                                        <Badge status="processing" text={<Text strong>短期: {aiResult.forecast.shortTerm}</Text>} />
                                        <div style={{ marginTop: 8 }}>
                                            <Text type="secondary">关键因素: </Text>
                                            {aiResult.forecast.keyFactors?.map(f => (
                                                <Tag key={f} color="geekblue">{f}</Tag>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {/* Raw Summary */}
                                <div style={{ marginTop: 24 }}>
                                    <Title level={5}>AI 综合摘要</Title>
                                    <Paragraph style={{ padding: 12, background: token.colorFillAlter, borderRadius: 6 }}>
                                        {aiResult.summary}
                                    </Paragraph>
                                </div>
                            </div>
                        )
                    }
                ]}
            />
        </div>
    );
};
