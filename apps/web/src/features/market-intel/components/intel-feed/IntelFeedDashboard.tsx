import React, { useState, useCallback, useMemo } from 'react';
import { Flex, theme, Spin, Drawer } from 'antd';
import { FeedHeader } from './components/FeedHeader';
import { AdvancedFilter } from './components/AdvancedFilter';
import { RelationPanel } from './components/RelationPanel';
import { StatsBar } from './components/StatsBar';
import { FeedView } from './components/views/FeedView';
import { DashboardView } from './components/views/DashboardView';
import { TimelineView } from './components/views/TimelineView';
import { TableView } from './components/views/TableView';
import { IntelViewType, IntelFilterState, DEFAULT_FILTER_STATE, IntelItem } from './types';
import { useIntelligenceFeed, useMarketIntel } from '../../api/hooks';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';

export const IntelFeedDashboard: React.FC = () => {
    const { token } = theme.useToken();

    // 状态管理
    const [viewType, setViewType] = useState<IntelViewType>('FEED');
    const [filterState, setFilterState] = useState<IntelFilterState>(DEFAULT_FILTER_STATE);
    const [filterPanelVisible, setFilterPanelVisible] = useState(true);
    const [relationDrawerVisible, setRelationDrawerVisible] = useState(false);
    const [selectedIntel, setSelectedIntel] = useState<IntelItem | null>(null);

    // URL 参数处理 (详情页模式)
    const { id: routeIntelId } = useParams<{ id: string }>();
    const { data: detailIntel } = useMarketIntel(routeIntelId || '');

    // 当通过 URL 访问详情时，自动打开抽屉
    React.useEffect(() => {
        if (routeIntelId && detailIntel) {
            // 将后端数据转换为组件所需的 IntelItem 格式
            const mappedItem: IntelItem = {
                id: detailIntel.id,
                intelId: detailIntel.id,
                type: detailIntel.contentType === 'RESEARCH_REPORT' ? 'research_report' : 'insight',
                contentType: detailIntel.contentType,
                sourceType: detailIntel.sourceType,
                category: detailIntel.category,
                title: (detailIntel as any).title || (detailIntel as any).researchReport?.title || detailIntel.summary?.slice(0, 30) || '未命名情报',
                summary: detailIntel.summary || detailIntel.rawContent,
                rawContent: detailIntel.rawContent,
                effectiveTime: new Date(detailIntel.effectiveTime),
                createdAt: new Date(detailIntel.createdAt),
                location: detailIntel.location,
                region: detailIntel.region,
                confidence: detailIntel.totalScore || 80,
                qualityScore: detailIntel.totalScore || 0,
                status: detailIntel.isFlagged ? 'flagged' : 'confirmed',
                author: detailIntel.author,
                // 研报特定数据可能不完整，但足够用于展示基础关联
                events: [],
                insights: [],
            } as any;

            setSelectedIntel(mappedItem);
            setRelationDrawerVisible(true);
        }
    }, [routeIntelId, detailIntel]);

    // 筛选条件转换
    const { startDate, endDate }: { startDate: Date; endDate: Date } = useMemo(() => {
        if (filterState.timeRange === 'CUSTOM' && filterState.customDateRange) {
            return {
                startDate: filterState.customDateRange[0],
                endDate: filterState.customDateRange[1]
            };
        }
        const end = new Date();
        const start = new Date();
        switch (filterState.timeRange) {
            case '1D': start.setDate(end.getDate() - 1); break;
            case '7D': start.setDate(end.getDate() - 7); break;
            case '30D': start.setDate(end.getDate() - 30); break;
            case '90D': start.setDate(end.getDate() - 90); break;
            case 'YTD': start.setFullYear(end.getFullYear(), 0, 1); break;
            default: start.setDate(end.getDate() - 7);
        }
        return { startDate: start, endDate: end };
    }, [filterState.timeRange, filterState.customDateRange]);

    // 获取数据
    const { data: feedData, isLoading } = useIntelligenceFeed({
        startDate,
        endDate,
        contentTypes: filterState.contentTypes.length ? filterState.contentTypes.map(String) : undefined,
        eventTypeIds: filterState.eventTypeIds.length ? filterState.eventTypeIds : undefined,
        insightTypeIds: filterState.insightTypeIds.length ? filterState.insightTypeIds : undefined,
        sourceTypes: filterState.sourceTypes.length ? filterState.sourceTypes.map(String) : undefined,
        regionCodes: filterState.regions,
        processingStatus: filterState.status,
        qualityLevel: filterState.qualityLevel,
        minScore: filterState.confidenceRange[0],
        maxScore: filterState.confidenceRange[1],
        commodities: filterState.commodities,
        keyword: filterState.keyword,
        limit: 50,
    });

    // 数据映射
    const items = useMemo<IntelItem[]>(() => {
        if (!feedData) return [];
        return feedData.map((item: Record<string, any>) => {
            const isEvent = item.type === 'EVENT';
            const isReport = item.type === 'RESEARCH_REPORT';
            const data = item.data;
            const intelInfo = data.intel || {};

            let itemType: 'event' | 'insight' | 'research_report' = 'insight';
            if (isEvent) itemType = 'event';
            else if (isReport) itemType = 'research_report';

            return {
                id: item.id,
                intelId: intelInfo.id,
                type: itemType,
                contentType: intelInfo.contentType || 'DAILY_REPORT',
                sourceType: intelInfo.sourceType || 'FIRST_LINE',
                category: intelInfo.category || 'B_SEMI_STRUCTURED',

                title: isEvent ? `${data.subject || ''} ${data.action || ''}` : data.title,
                summary: data.content || data.summary,
                rawContent: intelInfo.rawContent || '',

                effectiveTime: new Date(data.eventDate || item.createdAt),
                createdAt: new Date(item.createdAt),

                location: intelInfo.location,
                region: intelInfo.region,

                confidence: intelInfo.totalScore || 80, // 暂用 totalScore 代替 confidence
                qualityScore: intelInfo.totalScore || 0,

                status: intelInfo.isFlagged ? 'flagged' : 'confirmed', // 简单映射
                author: intelInfo.author ? {
                    id: intelInfo.author.id,
                    name: intelInfo.author.name,
                    avatar: intelInfo.author.avatar,
                    organizationName: intelInfo.author.organization?.name,
                } : undefined,

                // 仅为了兼容 UI 显示，保留 event/insight 结构
                events: isEvent ? [data] : [],
                insights: (!isEvent && !isReport) ? [data] : [],
                researchReport: isReport ? data : undefined,
            } as IntelItem;
        });
    }, [feedData]);

    const filteredItems = useMemo(() => {
        if (!items || items.length === 0) return [];

        const hasContentTypes = filterState.contentTypes.length > 0;
        const hasSourceTypes = filterState.sourceTypes.length > 0;
        const hasCommodities = filterState.commodities.length > 0;
        const hasRegions = filterState.regions.length > 0;
        const hasStatuses = filterState.status.length > 0;
        const hasQuality = filterState.qualityLevel.length > 0;
        const hasEventTypes = filterState.eventTypeIds.length > 0;
        const hasInsightTypes = filterState.insightTypeIds.length > 0;
        const hasKeyword = !!filterState.keyword?.trim();
        const [minScore, maxScore] = filterState.confidenceRange;
        const hasScoreRange = minScore > 0 || maxScore < 100;

        const keyword = filterState.keyword?.trim().toLowerCase() ?? '';
        const matchKeyword = (text?: string | null) =>
            !!text && text.toLowerCase().includes(keyword);

        const isWithinTime = (item: IntelItem) => {
            const time = item.effectiveTime || item.createdAt;
            if (startDate && dayjs(time).isBefore(startDate, 'minute')) return false;
            if (endDate && dayjs(time).isAfter(endDate, 'minute')) return false;
            return true;
        };

        const getScore = (item: IntelItem) => item.confidence ?? item.qualityScore;
        const getQualityLevel = (score?: number) => {
            if (score === undefined || score === null) return null;
            if (score >= 80) return 'HIGH';
            if (score >= 50) return 'MEDIUM';
            return 'LOW';
        };

        const matchCommodities = (item: IntelItem) => {
            if (!hasCommodities) return true;
            const matchesList = (value?: string | null) =>
                !!value && filterState.commodities.includes(value);
            const textMatch = (text?: string | null) =>
                !!text &&
                filterState.commodities.some(commodity => text.includes(commodity));

            const eventMatch =
                item.events?.some((event: any) => matchesList(event.commodity)) ?? false;
            const insightMatch =
                item.insights?.some((insight: any) => matchesList(insight.commodity)) ?? false;

            if (eventMatch || insightMatch) return true;
            return textMatch(item.title) || textMatch(item.summary) || textMatch(item.rawContent);
        };

        const matchRegions = (item: IntelItem) => {
            if (!hasRegions) return true;
            if (item.region?.some(region => filterState.regions.includes(region))) return true;
            if (item.location && filterState.regions.some(region => item.location!.includes(region))) {
                return true;
            }
            const eventRegionMatch =
                item.events?.some((event: any) =>
                    filterState.regions.includes(event.regionCode || event.region),
                ) ?? false;
            const insightRegionMatch =
                item.insights?.some((insight: any) =>
                    filterState.regions.includes(insight.regionCode || insight.region),
                ) ?? false;
            return eventRegionMatch || insightRegionMatch;
        };

        const matchEventTypes = (item: IntelItem) => {
            if (!hasEventTypes) return true;
            return (
                item.events?.some((event: any) =>
                    filterState.eventTypeIds.includes(event.eventTypeId || event.eventType?.id),
                ) ?? false
            );
        };

        const matchInsightTypes = (item: IntelItem) => {
            if (!hasInsightTypes) return true;
            return (
                item.insights?.some((insight: any) =>
                    filterState.insightTypeIds.includes(
                        insight.insightTypeId || insight.insightType?.id,
                    ),
                ) ?? false
            );
        };

        const matchKeywordContent = (item: IntelItem) => {
            if (!hasKeyword) return true;
            if (
                matchKeyword(item.title) ||
                matchKeyword(item.summary) ||
                matchKeyword(item.rawContent)
            ) {
                return true;
            }
            const eventMatch =
                item.events?.some((event: any) =>
                    [event.subject, event.action, event.content].some(matchKeyword),
                ) ?? false;
            const insightMatch =
                item.insights?.some((insight: any) =>
                    [insight.title, insight.content, insight.summary].some(matchKeyword),
                ) ?? false;
            return eventMatch || insightMatch;
        };

        return items.filter(item => {
            if (!isWithinTime(item)) return false;

            if (hasContentTypes && !filterState.contentTypes.includes(item.contentType)) {
                return false;
            }
            if (hasSourceTypes && !filterState.sourceTypes.includes(item.sourceType)) {
                return false;
            }
            if (!matchCommodities(item)) return false;
            if (!matchRegions(item)) return false;
            if (hasStatuses && !filterState.status.includes(item.status)) return false;

            const score = getScore(item);
            if (hasScoreRange) {
                if (score === undefined || score === null) return false;
                if (score < minScore || score > maxScore) return false;
            }

            if (hasQuality) {
                const level = getQualityLevel(score);
                if (!level || !filterState.qualityLevel.includes(level as any)) return false;
            }

            if (!matchEventTypes(item)) return false;
            if (!matchInsightTypes(item)) return false;
            if (!matchKeywordContent(item)) return false;

            return true;
        });
    }, [items, filterState, startDate, endDate]);

    // 处理筛选变更
    const handleFilterChange = useCallback((newFilter: Partial<IntelFilterState>) => {
        setFilterState(prev => ({ ...prev, ...newFilter }));
    }, []);

    // 处理情报选中 - 选中时自动打开关联抽屉
    const handleIntelSelect = useCallback((intel: IntelItem | null) => {
        setSelectedIntel(intel);
        if (intel) {
            setRelationDrawerVisible(true);
        }
    }, []);

    // 渲染当前视图
    const renderView = () => {
        const viewProps = {
            filterState,
            onIntelSelect: handleIntelSelect,
            selectedIntelId: selectedIntel?.id,
            items: filteredItems, // 传递过滤后的数据
            loading: isLoading,
        };

        switch (viewType) {
            case 'FEED':
                return <FeedView {...viewProps} />;
            case 'DASHBOARD':
                return <DashboardView {...viewProps} />;
            case 'TIMELINE':
                return <TimelineView {...viewProps} />;
            case 'TABLE':
                return <TableView {...viewProps} />;
            default:
                return <FeedView {...viewProps} />;
        }
    };

    return (
        <Flex vertical style={{ height: '100%', overflow: 'hidden', background: token.colorBgLayout }}>
            {/* 顶部控制栏 */}
            <FeedHeader
                viewType={viewType}
                onViewChange={setViewType}
                filterState={filterState}
                onFilterChange={handleFilterChange}
                filterPanelVisible={filterPanelVisible}
                onFilterPanelToggle={() => setFilterPanelVisible(!filterPanelVisible)}
                relationPanelVisible={relationDrawerVisible}
                onRelationPanelToggle={() => setRelationDrawerVisible(!relationDrawerVisible)}
            />

            {/* 主工作区 */}
            <Flex style={{ flex: 1, overflow: 'hidden' }}>
                {/* 左侧筛选面板 */}
                {filterPanelVisible && (
                    <AdvancedFilter
                        filterState={filterState}
                        onChange={handleFilterChange}
                        onClose={() => setFilterPanelVisible(false)}
                    />
                )}

                {/* 中央内容区 */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: viewType === 'DASHBOARD' ? 0 : 16,
                        background: token.colorBgLayout,
                    }}
                >
                    {isLoading ? (
                        <Flex justify="center" align="center" style={{ height: '100%' }}>
                            <Spin size="large" />
                        </Flex>
                    ) : (
                        renderView()
                    )}
                </div>
            </Flex>

            {/* 底部统计栏 */}
            <StatsBar items={filteredItems} />

            {/* 右侧关联面板抽屉 - 点击后弹出 */}
            <Drawer
                title="🔗 关联分析"
                placement="right"
                width={400}
                open={relationDrawerVisible}
                onClose={() => setRelationDrawerVisible(false)}
                styles={{ body: { padding: 0 } }}
            >
                <RelationPanel
                    selectedIntel={selectedIntel}
                    items={filteredItems}
                    onClose={() => setRelationDrawerVisible(false)}
                    onIntelSelect={handleIntelSelect}
                />
            </Drawer>
        </Flex>
    );
};

export default IntelFeedDashboard;
