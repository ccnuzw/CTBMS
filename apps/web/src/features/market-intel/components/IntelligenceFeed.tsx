import React, { useState, useMemo } from 'react';
import {
    Card,
    Typography,
    theme,
    Flex,
    Segmented,
    Statistic,
    Row,
    Col,
    Spin,
    Tag,
    Empty,
    Button,
} from 'antd';
import {
    UnorderedListOutlined,
    AppstoreOutlined,
    ThunderboltOutlined,
    AimOutlined,
    BankOutlined,
} from '@ant-design/icons';
import {
    useIntelligenceFeed,
    useEventStats,
    useInsightStats,
    MarketEventResponse,
    MarketInsightResponse,
    useMarketIntel,
} from '../api/hooks';
import { EventTimeline } from './EventTimeline';
import { InsightPanel } from './InsightPanel';
import { EventCard } from './EventCard';
import { SmartFilterPanel, FilterState } from './SmartFilterPanel';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { SourceHighlighter } from './SourceHighlighter';
import { Drawer } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

type ViewType = 'FEED' | 'TIMELINE' | 'INSIGHTS' | 'DASHBOARD';

export const IntelligenceFeed: React.FC = () => {
    const { token } = theme.useToken();

    // 状态管理
    const [viewType, setViewType] = useState<ViewType>('DASHBOARD');
    const [filterState, setFilterState] = useState<FilterState>({
        timeRange: '7D',
        commodities: [],
        regions: [],
        eventTypes: [],
    });

    // 原文追溯状态
    const [selectedIntelForTracing, setSelectedIntelForTracing] = useState<MarketEventResponse['intel'] | null>(null);
    const [selectedEventIdForTracing, setSelectedEventIdForTracing] = useState<string | null>(null);

    // 构建查询参数
    const query = useMemo(() => {
        const q: any = {
            commodities: filterState.commodities.length ? filterState.commodities : undefined,
            regions: filterState.regions.length ? filterState.regions : undefined,
            eventTypeIds: filterState.eventTypes.length ? filterState.eventTypes : undefined,
        };

        // 处理时间范围
        const now = dayjs();
        if (filterState.timeRange === 'CUSTOM' && filterState.customDateRange) {
            q.startDate = filterState.customDateRange[0].toDate();
            q.endDate = filterState.customDateRange[1].toDate();
        } else if (filterState.timeRange === '7D') {
            q.startDate = now.subtract(7, 'day').toDate();
        } else if (filterState.timeRange === '30D') {
            q.startDate = now.subtract(30, 'day').toDate();
        } else if (filterState.timeRange === 'YTD') {
            q.startDate = now.startOf('year').toDate();
        }

        return q;
    }, [filterState]);

    // 数据获取
    const { data: feedItems = [], isLoading: loadingFeed, refetch: refetchFeed } = useIntelligenceFeed({
        ...query,
        limit: 100,
    });

    const { data: eventStats, isLoading: loadingStats } = useEventStats(query);
    // InsightStats 暂时不支持筛选，或者后续升级
    const { data: insightStats } = useInsightStats();

    // 衍生数据
    const events = useMemo(() =>
        feedItems
            .filter(item => item.type === 'EVENT')
            .map(item => item.data as MarketEventResponse),
        [feedItems]
    );

    const insights = useMemo(() =>
        feedItems
            .filter(item => item.type === 'INSIGHT')
            .map(item => item.data as MarketInsightResponse),
        [feedItems]
    );

    // 渲染综合情报流视图
    const renderFeedView = () => {
        if (loadingFeed && feedItems.length === 0) {
            return (
                <Flex justify="center" align="center" style={{ height: 300 }}>
                    <Spin size="large" tip="AI 正在分析最新情报..." />
                </Flex>
            );
        }

        if (feedItems.length === 0) {
            return <Empty description="暂无符合条件的情报" style={{ marginTop: 60 }} />;
        }

        return (
            <div style={{ maxWidth: 900, margin: '0 24px' }}>
                {feedItems.map(item => {
                    if (item.type === 'EVENT') {
                        const event = item.data as MarketEventResponse;
                        return (
                            <div key={`event-${item.id}`} style={{ marginBottom: 24, paddingLeft: 16, borderLeft: `2px solid ${token.colorSplit}` }}>
                                <div style={{ marginBottom: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                    {dayjs(item.createdAt).format('MM-DD HH:mm')}
                                    <Tag style={{ marginLeft: 8 }} bordered={false}>事件</Tag>
                                </div>
                                <EventCard
                                    event={event}
                                    onViewSource={() => {
                                        setSelectedIntelForTracing(event.intel);
                                        setSelectedEventIdForTracing(event.id);
                                    }}
                                />
                            </div>
                        );
                    } else {
                        const insight = item.data as MarketInsightResponse;
                        return (
                            <div key={`insight-${item.id}`} style={{ marginBottom: 24, paddingLeft: 16, borderLeft: `2px solid ${token.colorSplit}` }}>
                                <div style={{ marginBottom: 8, fontSize: 12, color: token.colorTextSecondary }}>
                                    {dayjs(item.createdAt).format('MM-DD HH:mm')}
                                    <Tag color="gold" style={{ marginLeft: 8 }} bordered={false}>洞察</Tag>
                                </div>
                                <Card size="small" title={insight.title} extra={<Text type="secondary">{insight.confidence}%</Text>}>
                                    <div style={{ marginBottom: 8 }}>{insight.content}</div>
                                    <Flex gap={4}>
                                        {(insight.factors || []).map(f => <Tag key={f}>#{f}</Tag>)}
                                    </Flex>
                                </Card>
                            </div>
                        );
                    }
                })}
            </div>
        );
    };

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 顶部标题栏 */}
                <Card style={{ borderRadius: 0, marginBottom: 1 }} bodyStyle={{ padding: '12px 24px' }}>
                    <Flex justify="space-between" align="center">
                        <Flex align="center" gap={12}>
                            <Title level={4} style={{ margin: 0 }}>
                                <BankOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                                情报流看板
                            </Title>
                        </Flex>

                        <Segmented
                            options={[
                                { label: '综合分析', value: 'DASHBOARD', icon: <AppstoreOutlined /> },
                                { label: '情报流', value: 'FEED', icon: <UnorderedListOutlined /> },
                                { label: '事件时间线', value: 'TIMELINE', icon: <ThunderboltOutlined /> },
                                { label: '市场洞察', value: 'INSIGHTS', icon: <AimOutlined /> },
                            ]}
                            value={viewType}
                            onChange={(val) => setViewType(val as ViewType)}
                        />
                    </Flex>
                </Card>

                {/* 智能筛选栏 (始终显示) */}
                <SmartFilterPanel
                    filterState={filterState}
                    onChange={setFilterState}
                    style={{ marginBottom: 1 }}
                />

                {/* 核心内容滚动区 */}
                <div style={{ flex: 1, overflowY: 'auto', background: token.colorBgLayout, padding: 24 }}>

                    {/* DASHBOARD 视图 */}
                    {viewType === 'DASHBOARD' && (
                        <div>
                            {/* 1. 趋势与分布分析 */}
                            <AnalyticsDashboard
                                filterQuery={query}
                                stats={eventStats}
                                loading={loadingStats}
                            />

                            <div style={{ height: 24 }} />

                            {/* 2. 最新列表概览 */}
                            <Row gutter={[24, 24]}>
                                <Col xs={24} lg={14}>
                                    <Card title="最新市场事件 (Recent Events)" bordered={false} bodyStyle={{ padding: '0 12px 12px 12px' }}>
                                        <EventTimeline
                                            events={events.slice(0, 5)}
                                            loading={loadingFeed}
                                            onEventClick={(event) => {
                                                setSelectedIntelForTracing(event.intel);
                                                setSelectedEventIdForTracing(event.id);
                                            }}
                                        />
                                        <Button type="link" block onClick={() => setViewType('TIMELINE')}>查看更多事件</Button>
                                    </Card>
                                </Col>
                                <Col xs={24} lg={10}>
                                    <Card title="最新洞察 (Recent Insights)" bordered={false} bodyStyle={{ padding: 12 }}>
                                        <InsightPanel insights={insights.slice(0, 3)} loading={loadingFeed} />
                                        <Button type="link" block onClick={() => setViewType('INSIGHTS')}>查看更多洞察</Button>
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    )}

                    {/* TIMELINE 视图 */}
                    {viewType === 'TIMELINE' && (
                        <Card bordered={false}>
                            <EventTimeline
                                events={events}
                                loading={loadingFeed}
                                onEventClick={(event) => {
                                    setSelectedIntelForTracing(event.intel);
                                    setSelectedEventIdForTracing(event.id);
                                }}
                            />
                        </Card>
                    )}

                    {/* INSIGHTS 视图 */}
                    {viewType === 'INSIGHTS' && (
                        <Card bordered={false}>
                            <InsightPanel insights={insights} loading={loadingFeed} />
                        </Card>
                    )}

                    {/* FEED 视图 */}
                    {viewType === 'FEED' && renderFeedView()}
                </div>
            </Flex>

            {/* 原文追溯抽屉 */}
            <SourceTracingDrawer
                intel={selectedIntelForTracing}
                targetEventId={selectedEventIdForTracing}
                visible={!!selectedIntelForTracing}
                onClose={() => {
                    setSelectedIntelForTracing(null);
                    setSelectedEventIdForTracing(null);
                }}
            />
        </Flex>
    );
};

// =============================================
// 原文追溯抽屉组件
// =============================================
interface SourceTracingDrawerProps {
    intel: MarketEventResponse['intel'] | null;
    targetEventId: string | null;
    visible: boolean;
    onClose: () => void;
}

const SourceTracingDrawer: React.FC<SourceTracingDrawerProps> = ({
    intel,
    targetEventId,
    visible,
    onClose,
}) => {
    const { token } = theme.useToken();
    const { data: fullIntel, isLoading } = useMarketIntel(intel?.id || '');

    const highlights = useMemo(() => {
        if (!fullIntel?.aiAnalysis?.events) return [];
        return fullIntel.aiAnalysis.events
            .filter((e: any) => e.sourceStart !== undefined && e.sourceEnd !== undefined)
            .map((e: any) => ({
                id: e.id,
                start: e.sourceStart,
                end: e.sourceEnd,
                color: e.id === targetEventId ? token.colorWarning : token.colorPrimary,
                label: `${e.subject} ${e.action}`,
            }));
    }, [fullIntel, targetEventId, token]);

    return (
        <Drawer
            title="原文追溯与智能高亮"
            placement="right"
            width={600}
            onClose={onClose}
            open={visible}
            styles={{ body: { padding: 0 } }}
        >
            {isLoading ? (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                    <Spin tip="加载原文...">
                        <div style={{ padding: 50 }} />
                    </Spin>
                </Flex>
            ) : (
                <div style={{ padding: 24 }}>
                    <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">
                            来源: {fullIntel?.sourceType} • {fullIntel?.location} • {dayjs(fullIntel?.effectiveTime).format('YYYY-MM-DD HH:mm')}
                        </Text>
                    </div>
                    <Card style={{ background: token.colorBgLayout, borderColor: token.colorBorderSecondary }}>
                        <SourceHighlighter
                            content={fullIntel?.rawContent || ''}
                            highlights={highlights}
                            activeHighlightId={targetEventId}
                        />
                    </Card>
                </div>
            )}
        </Drawer>
    );
};

export default IntelligenceFeed;
