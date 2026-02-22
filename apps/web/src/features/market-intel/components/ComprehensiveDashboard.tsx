import React, { useMemo, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Empty, Grid, Row, Select, Space, Statistic, Table, Tag, Typography, theme, Button } from 'antd';
import { Area, Pie, Line } from '@ant-design/plots';
import { useNavigate } from 'react-router-dom';
import {
    useTopicEvolution,
    useWeeklyOverview,
} from '../api/knowledge-hooks';
import { useDocumentStats, useHotTopics } from '../api/hooks';
import { useDictionary } from '@/hooks/useDictionaries';
import { useTheme } from '@/theme/ThemeContext';
import { KNOWLEDGE_SENTIMENT_LABELS } from '../constants/knowledge-labels';

const { Text } = Typography;

const RISK_LABEL: Record<string, string> = {
    HIGH: '高风险',
    MEDIUM: '中风险',
    LOW: '低风险',
};

const SENTIMENT_COLOR: Record<string, string> = {
    BULLISH: 'green',
    BEARISH: 'red',
    NEUTRAL: 'blue',
};

export const ComprehensiveDashboard: React.FC = () => {
    const { token } = theme.useToken();
    const { isDarkMode } = useTheme();
    const plotTheme = isDarkMode ? 'classicDark' : 'classic';
    const screens = Grid.useBreakpoint();
    const navigate = useNavigate();

    // Dictionaries for filters
    const { data: commodityDict } = useDictionary('COMMODITY');
    const { data: timeRangeDict } = useDictionary('TIME_RANGE');

    // States
    const [timeRange, setTimeRange] = useState('90D');
    const [commodity, setCommodity] = useState<string | undefined>(undefined);

    // Filter computation
    const weeks = useMemo(() => {
        const map: Record<string, number> = { '30D': 4, '90D': 12, '180D': 26, '365D': 52 };
        return map[timeRange] || 12;
    }, [timeRange]);
    const trendDays = useMemo(() => {
        const map: Record<string, number> = { '30D': 30, '90D': 90, '180D': 180, '365D': 365 };
        return map[timeRange] || 90;
    }, [timeRange]);

    // Data Hooks
    const { data: weeklyOverview } = useWeeklyOverview();
    const { data: docStats } = useDocumentStats(trendDays);
    const { data: topicEvolution, isLoading: isEvoLoading } = useTopicEvolution({ commodity, weeks });
    const { data: hotTopics } = useHotTopics(trendDays);

    // ==========================================
    // Charts configs
    // ==========================================

    const areaConfig = {
        data: docStats?.trend || [],
        xField: 'date',
        yField: 'daily',
        theme: plotTheme,
        smooth: true,
        height: 220,
        color: token.colorPrimary,
        areaStyle: { fillOpacity: 0.3 },
    };

    const pieConfig = {
        data: docStats?.sourceDistribution || [],
        angleField: 'value',
        colorField: 'name',
        theme: plotTheme,
        innerRadius: 0.6,
        height: 220,
        legend: { position: 'right' as const },
    };

    const confidenceSeries = useMemo(
        () => (topicEvolution?.trend || []).map((item) => ({
            label: item.periodKey || '-',
            value: item.confidence ?? 0,
        })),
        [topicEvolution]
    );

    const lineConfig = {
        data: confidenceSeries,
        theme: plotTheme,
        xField: 'label',
        yField: 'value',
        point: { size: 5, shape: 'diamond' },
        height: 220,
        color: '#1677ff',
        yAxis: { max: 100, min: 0 },
    };

    // ==========================================
    // Render
    // ==========================================

    return (
        <PageContainer>
            {/* Filter */}
            <Card style={{ marginBottom: 16 }}>
                <Space wrap style={{ width: '100%', justifyContent: screens.md ? 'space-between' : 'flex-start' }}>
                    <Text type="secondary">可按品种和观察周期查看主题演化与风险结构</Text>
                    <Space wrap>
                        <Select
                            allowClear
                            placeholder="按品种筛选"
                            style={{ width: 160 }}
                            onChange={setCommodity}
                            options={(commodityDict || []).map((i) => ({ value: i.code, label: i.label }))}
                        />
                        <Select
                            value={timeRange}
                            style={{ width: 120 }}
                            onChange={setTimeRange}
                            options={(timeRangeDict || [])
                                .filter((i) => ['30D', '90D', '180D', '365D'].includes(i.code))
                                .map((i) => ({ value: i.code, label: i.label }))
                            }
                        />
                    </Space>
                </Space>
            </Card>

            {/* ① 周报概览 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                    <Card bodyStyle={{ padding: '20px 24px' }}>
                        <Statistic title="本周来源总数" value={weeklyOverview?.sourceStats?.totalSources || 0} suffix="条" />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card bodyStyle={{ padding: '20px 24px' }}>
                        <Statistic
                            title="概览风险等级"
                            value={
                                weeklyOverview?.metrics?.riskLevelLabel ||
                                (weeklyOverview?.metrics?.riskLevel ? RISK_LABEL[weeklyOverview.metrics.riskLevel] : '暂无')
                            }
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card bodyStyle={{ padding: '20px 24px' }}>
                        <Statistic title="分析置信度" value={weeklyOverview?.metrics?.confidence || 0} suffix="%" />
                    </Card>
                </Col>
            </Row>

            {!weeklyOverview?.found && (
                <Card style={{ marginTop: 16 }}>
                    <Empty description="当前周期暂无周报汇总数据" />
                </Card>
            )}

            {/* ② 采集趋势 & 来源分布 */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} lg={14}>
                    <Card title="📈 文档采集趋势">
                        {docStats?.trend?.length ? (
                            <Area {...areaConfig} />
                        ) : (
                            <Empty description="暂无趋势数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card title="🍕 来源分布">
                        {docStats?.sourceDistribution?.length ? (
                            <Pie {...pieConfig} />
                        ) : (
                            <Empty description="暂无分布数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ③ 主题演化 & ④ 热点话题 */}
            <Card title="💎 主题演化 & 热点" style={{ marginTop: 16 }}>
                {/* 趋势图 */}
                <Card size="small" title="置信度趋势" style={{ marginBottom: 16 }}>
                    {confidenceSeries.length > 0 ? (
                        <Line {...lineConfig} />
                    ) : (
                        <Empty description="暂无置信度数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                </Card>

                {/* 明细表 */}
                <Table
                    rowKey="id"
                    loading={isEvoLoading}
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
                            render: (v) => (
                                <Tag color={SENTIMENT_COLOR[v] || 'default'}>
                                    {KNOWLEDGE_SENTIMENT_LABELS[v as keyof typeof KNOWLEDGE_SENTIMENT_LABELS] || v || '暂无'}
                                </Tag>
                            ),
                        },
                        {
                            title: '风险',
                            dataIndex: 'riskLevel',
                            key: 'riskLevel',
                            width: 100,
                            render: (v) => (
                                <Tag color={v === 'HIGH' ? 'red' : v === 'MEDIUM' ? 'orange' : 'green'}>
                                    {RISK_LABEL[v] || v || '暂无'}
                                </Tag>
                            ),
                        },
                        {
                            title: '摘要',
                            dataIndex: 'summary',
                            key: 'summary',
                            ellipsis: true,
                            render: (v) => <Text ellipsis={{ tooltip: v }} style={{ maxWidth: '100%' }}>{v || '-'}</Text>,
                        },
                        {
                            title: '操作',
                            key: 'action',
                            width: 90,
                            render: (_, r) => (
                                <Button type="link" onClick={() => navigate(`/intel/knowledge/items/${r.id}`)}>
                                    查看
                                </Button>
                            ),
                        },
                    ]}
                    style={{ marginBottom: 24 }}
                />

                {/* 热门话题 */}
                {hotTopics && hotTopics.length > 0 && (
                    <div style={{ padding: '16px', background: token.colorFillAlter, borderRadius: 8 }}>
                        <Text strong style={{ display: 'block', marginBottom: 12 }}>🔥 热门话题</Text>
                        <Space wrap>
                            {hotTopics.map((topic: any, i: number) => (
                                <Tag key={i} color={i < 3 ? 'orange' : 'default'} style={{ fontSize: 13, padding: '4px 8px' }}>
                                    {topic.displayTopic || topic.topic} ({topic.count})
                                </Tag>
                            ))}
                        </Space>
                    </div>
                )}
            </Card>
        </PageContainer>
    );
};
