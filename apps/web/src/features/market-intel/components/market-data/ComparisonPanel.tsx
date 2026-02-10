import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Card,
    Typography,
    Flex,
    Statistic,
    Row,
    Col,
    Progress,
    Tag,
    Space,
    Empty,
    theme,
    Select,
    Segmented,
    Switch,
    InputNumber,
    Tooltip,
    Input,
} from 'antd';
import {
    ArrowUpOutlined,
    ArrowDownOutlined,
    SwapOutlined,
    BarChartOutlined,
    AimOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import { usePriceCompareAnalytics } from '../../api/hooks';
import { ChartContainer } from '../ChartContainer';
import type { PriceReviewScope, PriceSourceScope, PriceSubType } from '@packages/types';
import {
    ResponsiveContainer,
    ComposedChart,
    XAxis,
    YAxis,
    Tooltip as RechartsTooltip,
    Line,
    Customized,
    CartesianGrid,
} from 'recharts';
import { useOffset, usePlotArea, useXAxis, useYAxis } from 'recharts/es6/hooks';
import { useDictionary } from '@/hooks/useDictionaries';

const { Text } = Typography;

const POINT_TYPE_LABELS_FALLBACK: Record<string, string> = {
    PORT: '港口',
    ENTERPRISE: '企业',
    MARKET: '市场',
    REGION: '地域',
    STATION: '站台',
};

type SortMetric = 'changePct' | 'volatility' | 'periodChangePct';

type GroupMode = 'all' | 'type' | 'region';

type ViewMode = 'list' | 'range';
type DistributionMode = 'box' | 'band';

interface ComparisonPanelProps {
    commodity: string;
    startDate?: Date;
    endDate?: Date;
    selectedPointIds: string[];
    selectedProvince?: string;
    pointTypeFilter?: string[];
    subTypes?: PriceSubType[];
    reviewScope?: PriceReviewScope;
    sourceScope?: PriceSourceScope;
    onFocusPoint?: (id: string) => void;
}

interface RankingItem {
    id: string;
    name: string;
    code: string;
    type?: string;
    regionLabel: string;
    price: number;
    change: number;
    changePct: number;
    periodChange: number;
    periodChangePct: number;
    volatility: number;
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    basePrice: number;
    indexPrice: number;
    indexChange: number;
    samples: number;
    missingDays: number | null;
    isAnomaly: boolean;
    baselineDiff: number | null;
    baselineDiffPct: number | null;
}

interface DistributionItem {
    id: string;
    name: string;
    min: number;
    max: number;
    q1: number;
    median: number;
    q3: number;
    avg: number;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
    commodity,
    startDate,
    endDate,
    selectedPointIds,
    selectedProvince,
    pointTypeFilter,
    subTypes,
    reviewScope,
    sourceScope,
    onFocusPoint,
}) => {
    const { token } = theme.useToken();
    const { data: pointTypeDict } = useDictionary('COLLECTION_POINT_TYPE');

    const pointTypeLabels = useMemo(() => {
        const items = (pointTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return POINT_TYPE_LABELS_FALLBACK;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [pointTypeDict]);

    const [sortMetric, setSortMetric] = useState<SortMetric>('changePct');
    const [groupMode, setGroupMode] = useState<GroupMode>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [distributionMode, setDistributionMode] = useState<DistributionMode>('box');
    const [indexMode, setIndexMode] = useState(false);
    const [baselineKey, setBaselineKey] = useState<string>('none');
    const [onlyAnomalies, setOnlyAnomalies] = useState(false);
    const [deviationThreshold, setDeviationThreshold] = useState(5);
    const [changeThreshold, setChangeThreshold] = useState(20);
    const [showDebug, setShowDebug] = useState(false);
    const [regionSort, setRegionSort] = useState<'avg' | 'count' | 'delta' | 'volatility'>('avg');
    const [regionWindow, setRegionWindow] = useState<'7' | '30' | '90' | 'all'>('30');
    const [regionView, setRegionView] = useState<'all' | 'top' | 'bottom'>('all');
    const [regionKeyword, setRegionKeyword] = useState('');
    const [regionLevel, setRegionLevel] = useState<'province' | 'city' | 'district'>('city');
    const [regionDetail, setRegionDetail] = useState<'compact' | 'detail'>('compact');

    const { data: compareAnalytics, isLoading } = usePriceCompareAnalytics({
        collectionPointIds: selectedPointIds,
        commodity,
        startDate,
        endDate,
        subTypes,
        regionCode: selectedProvince,
        pointTypes: pointTypeFilter,
        reviewScope,
        sourceScope,
        regionLevel,
        regionWindow,
    }, {
        enabled: selectedPointIds.length > 0 && !!commodity,
    });

    const latestRegionAvg = useMemo(
        () => compareAnalytics?.latestRegionAvg ?? null,
        [compareAnalytics],
    );

    const baseItems = useMemo<RankingItem[]>(() => {
        const ranking = compareAnalytics?.ranking || [];
        const meanLatest = compareAnalytics?.meta.meanLatestPrice || 0;

        return ranking.map((item) => {
            const deviationPct = meanLatest ? Math.abs((item.price - meanLatest) / meanLatest) * 100 : 0;
            const isAnomaly = deviationPct >= deviationThreshold || Math.abs(item.change) >= changeThreshold;
            return {
                ...item,
                isAnomaly,
                baselineDiff: null,
                baselineDiffPct: null,
            };
        });
    }, [compareAnalytics, deviationThreshold, changeThreshold]);

    useEffect(() => {
        if (baselineKey === 'region' && !latestRegionAvg) {
            setBaselineKey('none');
            return;
        }
        if (baselineKey !== 'none' && baselineKey !== 'region') {
            const exists = baseItems.some((item) => item.id === baselineKey);
            if (!exists) setBaselineKey('none');
        }
    }, [baselineKey, latestRegionAvg, baseItems]);

    const baselinePrice = useMemo(() => {
        if (baselineKey === 'none') return null;
        if (baselineKey === 'region') return latestRegionAvg;
        const match = baseItems.find((item) => item.id === baselineKey);
        return match?.price ?? null;
    }, [baselineKey, baseItems, latestRegionAvg]);

    const items = useMemo(() => {
        return baseItems.map((item) => {
            if (!baselinePrice) return item;
            const diff = item.price - baselinePrice;
            const diffPct = baselinePrice ? (diff / baselinePrice) * 100 : null;
            return {
                ...item,
                baselineDiff: diff,
                baselineDiffPct: diffPct,
            };
        });
    }, [baseItems, baselinePrice]);

    const filteredItems = useMemo(() => {
        if (!onlyAnomalies) return items;
        return items.filter((item) => item.isAnomaly);
    }, [items, onlyAnomalies]);

    const sortedItems = useMemo(() => {
        const metricValue = (item: RankingItem) => {
            if (sortMetric === 'volatility') return item.volatility;
            if (sortMetric === 'periodChangePct') return item.periodChangePct;
            return item.changePct;
        };
        return [...filteredItems].sort((a, b) => metricValue(b) - metricValue(a));
    }, [filteredItems, sortMetric]);

    const changeRanking = useMemo(() => {
        return [...filteredItems].sort((a, b) => b.change - a.change);
    }, [filteredItems]);

    const groupedItems = useMemo(() => {
        if (groupMode === 'all') {
            return [{ key: '全部', items: sortedItems }];
        }

        const groups: Record<string, RankingItem[]> = {};
        sortedItems.forEach((item) => {
            const key = groupMode === 'type'
                ? (pointTypeLabels[item.type || ''] || item.type || '其他')
                : item.regionLabel;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        return Object.entries(groups)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([key, groupItems]) => ({ key, items: groupItems }));
    }, [groupMode, sortedItems]);

    const distributionItems = useMemo<DistributionItem[]>(() => {
        const distribution = compareAnalytics?.distribution || [];
        if (distribution.length === 0 || sortedItems.length === 0) return [];
        const distributionById = new Map(distribution.map((item) => [item.id, item] as const));
        return sortedItems
            .map((item) => distributionById.get(item.id))
            .filter((item): item is DistributionItem => Boolean(item))
            .slice(0, 12);
    }, [compareAnalytics, sortedItems]);

    const regionSummary = useMemo(() => {
        return compareAnalytics?.regions || {
            list: [],
            overallAvg: null as number | null,
            minAvg: 0,
            maxAvg: 0,
            rangeMin: 0,
            rangeMax: 0,
            windowLabel: '',
            expectedDays: 0,
        };
    }, [compareAnalytics]);

    const regionList = useMemo(() => {
        const keyword = regionKeyword.trim();
        const filtered = regionSummary.list.filter((item) => {
            if (!keyword) return true;
            return item.region.includes(keyword);
        });

        if (regionSort === 'count') {
            filtered.sort((a, b) => b.count - a.count);
        } else if (regionSort === 'delta') {
            filtered.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        } else if (regionSort === 'volatility') {
            filtered.sort((a, b) => b.volatility - a.volatility);
        } else {
            filtered.sort((a, b) => b.avgPrice - a.avgPrice);
        }

        if (regionView === 'all') return filtered;
        const topN = 8;
        if (regionView === 'top') {
            return filtered.slice(0, topN);
        }
        return filtered.slice(-topN);
    }, [regionSummary.list, regionSort, regionKeyword, regionView]);

    const quality = useMemo(() => compareAnalytics?.quality || null, [compareAnalytics]);

    if (selectedPointIds.length === 0) {
        return (
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <BarChartOutlined style={{ color: token.colorPrimary }} />
                        <span>对比分析</span>
                    </Flex>
                }
            >
                <Empty description="请选择采集点进行对比分析" />
            </Card>
        );
    }

    const baselineOptions = [
        { label: '无', value: 'none' },
        ...(latestRegionAvg ? [{ label: '区域均价', value: 'region' }] : []),
        ...baseItems.map((item) => ({ label: item.name, value: item.id })),
    ];

    const renderList = (itemsToRender: RankingItem[]) => {
        if (itemsToRender.length === 0) {
            return <Empty description="暂无数据" />;
        }

        const displayMax = Math.max(...itemsToRender.map((item) => (indexMode ? item.indexPrice : item.price)), 1);
        const priceSuffix = indexMode ? '指数' : '元/吨';

        const metricLabel = sortMetric === 'volatility'
            ? '波动率'
            : sortMetric === 'periodChangePct'
                ? '区间涨幅'
                : '涨跌幅';

        return (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {itemsToRender.slice(0, 10).map((item, index) => {
                    const displayPrice = indexMode ? item.indexPrice : item.price;
                    const displayChange = indexMode ? item.indexChange : item.change;
                    const metricValue = sortMetric === 'volatility'
                        ? item.volatility
                        : sortMetric === 'periodChangePct'
                            ? item.periodChangePct
                            : item.changePct;

                    const progressPercent = (displayPrice / displayMax) * 100;

                    return (
                        <Flex
                            key={item.id}
                            align="center"
                            gap={12}
                            onClick={() => onFocusPoint?.(item.id)}
                            style={{ cursor: onFocusPoint ? 'pointer' : 'default' }}
                        >
                            <Text
                                strong
                                style={{
                                    width: 24,
                                    textAlign: 'center',
                                    color: index < 3 ? token.colorPrimary : token.colorTextSecondary,
                                }}
                            >
                                {index + 1}
                            </Text>
                            <Flex vertical style={{ flex: 1 }}>
                                <Flex justify="space-between" align="center" gap={8}>
                                    <Flex align="center" gap={6} style={{ minWidth: 0 }}>
                                        <Text ellipsis style={{ maxWidth: 140 }}>
                                            {item.name}
                                        </Text>
                                        {item.isAnomaly && <Tag color="red">异常</Tag>}
                                    </Flex>
                                    <Flex align="center" gap={8}>
                                        <Text strong style={{ fontFamily: 'monospace' }}>
                                            {displayPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {priceSuffix}
                                        </Text>
                                        {displayChange !== 0 && (
                                            <Text
                                                style={{
                                                    color: displayChange > 0 ? token.colorError : token.colorSuccess,
                                                    fontSize: 12,
                                                }}
                                            >
                                                {displayChange > 0 ? '+' : ''}{displayChange.toFixed(2)}
                                            </Text>
                                        )}
                                    </Flex>
                                </Flex>
                                <Flex justify="space-between" align="center">
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        {metricLabel} {metricValue.toFixed(2)}%
                                        {item.missingDays !== null && ` · 缺失 ${item.missingDays} 天`}
                                        {item.baselineDiff !== null && (
                                            ` · 基准差 ${item.baselineDiff > 0 ? '+' : ''}${item.baselineDiff.toFixed(1)} (${item.baselineDiffPct?.toFixed(1)}%)`
                                        )}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        样本 {item.samples}
                                    </Text>
                                </Flex>
                                {viewMode === 'list' ? (
                                    <Progress
                                        percent={progressPercent}
                                        showInfo={false}
                                        strokeColor={index < 3 ? token.colorPrimary : token.colorTextQuaternary}
                                        size="small"
                                    />
                                ) : (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        区间 {item.minPrice.toFixed(0)} ~ {item.maxPrice.toFixed(0)} · 均值 {item.avgPrice.toFixed(0)}
                                    </Text>
                                )}
                            </Flex>
                        </Flex>
                    );
                })}
            </Space>
        );
    };

    const renderDistributionChart = () => {
        if (distributionItems.length === 0) {
            return <Empty description="暂无分布数据" />;
        }

        const numericItems = distributionItems.filter((item) =>
            [item.min, item.max, item.q1, item.q3, item.median, item.avg].every((v) => Number.isFinite(v)),
        );
        if (numericItems.length === 0) {
            return <Empty description="暂无分布数据" />;
        }

        const minValue = Math.min(...numericItems.map((item) => item.min));
        const maxValue = Math.max(...numericItems.map((item) => item.max));
        const padding = Math.max(1, (maxValue - minValue) * 0.05);
        const yDomain: [number, number] = [minValue - padding, maxValue + padding];

        const TooltipContent = ({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const data = payload[0].payload as DistributionItem;
            return (
                <div
                    style={{
                        background: token.colorBgElevated,
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        padding: 12,
                        fontSize: 12,
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{data.name}</div>
                    <div>最小值：{data.min.toFixed(1)}</div>
                    <div>Q1：{data.q1.toFixed(1)}</div>
                    <div>中位数：{data.median.toFixed(1)}</div>
                    <div>Q3：{data.q3.toFixed(1)}</div>
                    <div>最大值：{data.max.toFixed(1)}</div>
                    <div>均值：{data.avg.toFixed(1)}</div>
                </div>
            );
        };

    const DistributionLayer: React.FC = () => {
            const xAxis = useXAxis(0) as any;
            const yAxis = useYAxis(0) as any;
            const offset = useOffset();
            const plotArea = usePlotArea();
            const xScale = xAxis?.scale as any;
            const yScale = yAxis?.scale as any;
            const xRange = typeof xScale?.range === 'function' ? xScale.range() : null;
            const yRange = typeof yScale?.range === 'function' ? yScale.range() : null;

            const debugLines = [
                `xAxis: ${xAxis ? 'ok' : 'null'} / yAxis: ${yAxis ? 'ok' : 'null'}`,
                `offset: ${offset ? `${offset.left},${offset.top},${offset.right},${offset.bottom}` : 'null'}`,
                `plotArea: ${plotArea ? `${plotArea.x},${plotArea.y},${plotArea.width},${plotArea.height}` : 'null'}`,
                `xRange: ${xRange ? xRange.join(',') : 'null'}`,
                `yRange: ${yRange ? yRange.join(',') : 'null'}`,
            ];

            const DebugOverlay = showDebug ? (
                <g>
                    <rect x={8} y={6} width={260} height={debugLines.length * 12 + 8} fill="rgba(255,255,255,0.9)" stroke={token.colorBorder} rx={4} />
                    {debugLines.map((line, idx) => (
                        <text key={line} x={12} y={20 + idx * 12} fontSize={10} fill={token.colorTextSecondary}>
                            {line}
                        </text>
                    ))}
                </g>
            ) : null;

            if (!xScale || !yScale || !plotArea) {
                return <g>{DebugOverlay}</g>;
            }

            const chartWidth = plotArea.width ?? 0;
            const bandWidth = typeof xScale.bandwidth === 'function'
                ? xScale.bandwidth()
                : Math.max(10, chartWidth / Math.max(numericItems.length, 1));
            const maxBoxWidth = 80;
            const boxWidth = Math.min(maxBoxWidth, Math.max(8, bandWidth * (distributionMode === 'box' ? 0.5 : 0.6)));

            return (
                <g>
                    {numericItems.map((entry) => {
                        const xBase = xScale(entry.name);
                        if (!Number.isFinite(xBase)) return null;

                        const xCenter = xBase + bandWidth / 2;
                        if (distributionMode === 'box') {
                            const yMin = yScale(entry.min);
                            const yMax = yScale(entry.max);
                            const yQ1 = yScale(entry.q1);
                            const yQ3 = yScale(entry.q3);
                            const yMedian = yScale(entry.median);
                            if (![yMin, yMax, yQ1, yQ3, yMedian].every((v) => Number.isFinite(v))) return null;
                            return (
                                <g key={entry.id}>
                                    <line x1={xCenter} x2={xCenter} y1={yMax} y2={yQ3} stroke={token.colorPrimary} />
                                    <line x1={xCenter} x2={xCenter} y1={yQ1} y2={yMin} stroke={token.colorPrimary} />
                                    <line x1={xCenter - boxWidth / 2} x2={xCenter + boxWidth / 2} y1={yMax} y2={yMax} stroke={token.colorPrimary} />
                                    <line x1={xCenter - boxWidth / 2} x2={xCenter + boxWidth / 2} y1={yMin} y2={yMin} stroke={token.colorPrimary} />
                                    <rect
                                        x={xCenter - boxWidth / 2}
                                        y={Math.min(yQ1, yQ3)}
                                        width={boxWidth}
                                        height={Math.max(2, Math.abs(yQ1 - yQ3))}
                                        fill={token.colorPrimaryBg}
                                        stroke={token.colorPrimary}
                                    />
                                    <line
                                        x1={xCenter - boxWidth / 2}
                                        x2={xCenter + boxWidth / 2}
                                        y1={yMedian}
                                        y2={yMedian}
                                        stroke={token.colorPrimary}
                                        strokeWidth={2}
                                    />
                                </g>
                            );
                        }

                        const yMin = yScale(entry.min);
                        const yMax = yScale(entry.max);
                        const yAvg = yScale(entry.avg);
                        if (![yMin, yMax, yAvg].every((v) => Number.isFinite(v))) return null;
                        return (
                            <g key={entry.id}>
                                <rect
                                    x={xCenter - boxWidth / 2}
                                    y={Math.min(yMin, yMax)}
                                    width={boxWidth}
                                    height={Math.max(2, Math.abs(yMax - yMin))}
                                    fill={token.colorPrimaryBg}
                                    stroke={token.colorPrimary}
                                    opacity={0.7}
                                />
                                <line
                                    x1={xCenter - boxWidth / 2}
                                    x2={xCenter + boxWidth / 2}
                                    y1={yAvg}
                                    y2={yAvg}
                                    stroke={token.colorPrimary}
                                    strokeWidth={2}
                                />
                            </g>
                        );
                    })}
                    {DebugOverlay}
                    {showDebug && (
                        <text x={12} y={20 + debugLines.length * 12} fontSize={10} fill={token.colorTextSecondary}>
                            bandWidth: {Number.isFinite(bandWidth) ? bandWidth.toFixed(2) : String(bandWidth)} / sample: {numericItems[0]?.name ?? '-'} / x: {numericItems[0] ? String(xScale(numericItems[0].name)) : '-'} / y: {numericItems[0] ? String(yScale(numericItems[0].median)) : '-'}
                        </text>
                    )}
                </g>
            );
    };

        const shouldRotateTicks = distributionItems.length > 6;

        const renderXAxisTick = (props: any) => {
            const { x, y, payload } = props;
            const rawValue = String(payload?.value ?? '');
            const maxLen = 6;
            const displayValue = rawValue.length > maxLen ? `${rawValue.slice(0, maxLen)}…` : rawValue;
            const rotate = shouldRotateTicks ? -20 : 0;
            const textAnchor = shouldRotateTicks ? 'end' : 'middle';
            const dy = shouldRotateTicks ? 12 : 16;
            return (
                <g transform={`translate(${x},${y})`}>
                    <title>{rawValue}</title>
                    <text
                        dy={dy}
                        textAnchor={textAnchor}
                        transform={rotate ? `rotate(${rotate})` : undefined}
                        fontSize={10}
                        fill={token.colorTextSecondary}
                    >
                        {displayValue}
                    </text>
                </g>
            );
        };

        return (
            <ChartContainer height={300}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={distributionItems} margin={{ top: 8, right: 20, left: 10, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="2 6" stroke={token.colorBorderSecondary} />
                        <XAxis
                            dataKey="name"
                            interval={0}
                            height={60}
                            tick={renderXAxisTick}
                            type="category"
                            scale="band"
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            domain={yDomain}
                            tick={{ fontSize: 10, fill: token.colorTextSecondary }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            tickFormatter={(val) => Number(val).toLocaleString()}
                        />
                        <Line
                            type="monotone"
                            dataKey="median"
                            stroke="transparent"
                            dot={false}
                            isAnimationActive={false}
                        />
                        <RechartsTooltip content={<TooltipContent />} />
                        <Customized component={DistributionLayer} />
                    </ComposedChart>
                </ResponsiveContainer>
            </ChartContainer>
        );
    };

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {quality && (
                <Flex align="center" gap={8} wrap="wrap">
                    <Tag color="blue">样本 {quality.totalSamples}</Tag>
                    {quality.latestDate && (
                        <Tag color="default">
                            最后更新 {dayjs(quality.latestDate).format('YYYY-MM-DD')}
                        </Tag>
                    )}
                    {quality.missingDays !== null && (
                        <Tag color={quality.missingDays > 0 ? 'orange' : 'green'}>
                            缺失 {quality.missingDays} 天
                        </Tag>
                    )}
                </Flex>
            )}

            <Card
                size="small"
                bodyStyle={{ padding: '12px 16px' }}
            >
                <Flex wrap="wrap" gap={12} align="center" justify="space-between">
                    <Flex wrap="wrap" gap={12} align="center">
                        <Tooltip title="涨跌幅=日涨跌/最新价；波动率=(区间最大-最小)/均价；区间涨幅=(末日-首日)/首日">
                            <Select
                                size="small"
                                value={sortMetric}
                                onChange={(val) => setSortMetric(val)}
                                options={[
                                    { label: '涨跌幅', value: 'changePct' },
                                    { label: '波动率', value: 'volatility' },
                                    { label: '区间涨幅', value: 'periodChangePct' },
                                ]}
                                style={{ width: 120 }}
                            />
                        </Tooltip>
                        <Segmented
                            size="small"
                            value={groupMode}
                            onChange={(val) => setGroupMode(val as GroupMode)}
                            options={[
                                { label: '总榜', value: 'all' },
                                { label: '按类型', value: 'type' },
                                { label: '按区域', value: 'region' },
                            ]}
                        />
                        <Segmented
                            size="small"
                            value={viewMode}
                            onChange={(val) => setViewMode(val as ViewMode)}
                            options={[
                                { label: '榜单', value: 'list' },
                                { label: '区间', value: 'range' },
                            ]}
                        />
                        <Tooltip title="按基准日=100 进行指数化展示">
                            <Flex align="center" gap={6}>
                                <Text type="secondary" style={{ fontSize: 12 }}>指数化</Text>
                                <Switch size="small" checked={indexMode} onChange={setIndexMode} />
                            </Flex>
                        </Tooltip>
                    </Flex>

                    <Flex wrap="wrap" gap={12} align="center">
                        <Tooltip title="选择基准点进行价差对比">
                            <Select
                                size="small"
                                value={baselineKey}
                                onChange={(val) => setBaselineKey(val)}
                                options={baselineOptions}
                                style={{ width: 140 }}
                            />
                        </Tooltip>
                        <Tooltip title="仅展示异常点位">
                            <Flex align="center" gap={6}>
                                <Text type="secondary" style={{ fontSize: 12 }}>仅异常</Text>
                                <Switch size="small" checked={onlyAnomalies} onChange={setOnlyAnomalies} />
                            </Flex>
                        </Tooltip>
                        <Flex align="center" gap={6}>
                            <Text type="secondary" style={{ fontSize: 12 }}>偏离%</Text>
                            <InputNumber
                                size="small"
                                min={1}
                                max={20}
                                value={deviationThreshold}
                                onChange={(val) => setDeviationThreshold(Number(val) || 5)}
                                style={{ width: 70 }}
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>涨跌</Text>
                            <InputNumber
                                size="small"
                                min={1}
                                max={100}
                                value={changeThreshold}
                                onChange={(val) => setChangeThreshold(Number(val) || 20)}
                                style={{ width: 70 }}
                            />
                            <Tooltip title="显示分布图调试信息">
                                <Flex align="center" gap={6}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>调试</Text>
                                    <Switch size="small" checked={showDebug} onChange={setShowDebug} />
                                </Flex>
                            </Tooltip>
                        </Flex>
                    </Flex>
                </Flex>
            </Card>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <BarChartOutlined style={{ color: token.colorPrimary }} />
                                <span>综合排行 (Top 10)</span>
                                <Tag color="blue">{commodity}</Tag>
                            </Flex>
                        }
                        bodyStyle={{ padding: '12px 16px' }}
                        loading={isLoading}
                    >
                        {groupedItems.length === 1 ? (
                            renderList(groupedItems[0].items)
                        ) : (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                {groupedItems.map((group) => (
                                    <div key={group.key}>
                                        <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                                            <AimOutlined style={{ color: token.colorPrimary }} />
                                            <Text strong>{group.key}</Text>
                                            <Tag>{group.items.length}</Tag>
                                        </Flex>
                                        {renderList(group.items)}
                                    </div>
                                ))}
                            </Space>
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <SwapOutlined style={{ color: token.colorPrimary }} />
                                <span>涨跌排行</span>
                            </Flex>
                        }
                        bodyStyle={{ padding: '12px 16px' }}
                        loading={isLoading}
                    >
                        {changeRanking.length === 0 ? (
                            <Empty description="暂无数据" />
                        ) : (
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        <ArrowUpOutlined style={{ color: token.colorError }} /> 涨幅榜
                                    </Text>
                                    <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                                        {changeRanking
                                            .filter((item) => item.change > 0)
                                            .slice(0, 5)
                                            .map((item) => (
                                                <Flex key={item.id} justify="space-between" align="center">
                                                    <Text ellipsis style={{ maxWidth: 80, fontSize: 12 }}>
                                                        {item.name}
                                                    </Text>
                                                    <Tag color="red" style={{ margin: 0 }}>
                                                        +{item.change}
                                                    </Tag>
                                                </Flex>
                                            ))}
                                        {changeRanking.filter((item) => item.change > 0).length === 0 && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>暂无上涨</Text>
                                        )}
                                    </Space>
                                </Col>

                                <Col span={12}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        <ArrowDownOutlined style={{ color: token.colorSuccess }} /> 跌幅榜
                                    </Text>
                                    <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                                        {changeRanking
                                            .filter((item) => item.change < 0)
                                            .reverse()
                                            .slice(0, 5)
                                            .map((item) => (
                                                <Flex key={item.id} justify="space-between" align="center">
                                                    <Text ellipsis style={{ maxWidth: 80, fontSize: 12 }}>
                                                        {item.name}
                                                    </Text>
                                                    <Tag color="green" style={{ margin: 0 }}>
                                                        {item.change}
                                                    </Tag>
                                                </Flex>
                                            ))}
                                        {changeRanking.filter((item) => item.change < 0).length === 0 && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>暂无下跌</Text>
                                        )}
                                    </Space>
                                </Col>
                            </Row>
                        )}
                    </Card>
                </Col>

                <Col xs={24}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <BarChartOutlined style={{ color: token.colorPrimary }} />
                                <span>分布视角</span>
                                <Tooltip
                                    overlayStyle={{ maxWidth: 420 }}
                                    title={(
                                        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6 }}>如何看箱线图</div>
                                            <div>Q1=25%分位，Q3=75%分位；箱体(Q1~Q3)表示中间50%区间，中位数是典型水平。</div>
                                            <div style={{ marginTop: 6 }}>解读要点：</div>
                                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                                <li>中位数越高，整体水平越高</li>
                                                <li>箱体越高，波动越大</li>
                                                <li>胡须越长，极值跨度越大</li>
                                                <li>中位数偏箱体上/下沿，分布偏高/偏低</li>
                                            </ul>
                                            <div style={{ marginTop: 6 }}>当前实现：胡须为最小值~最大值；区间带=最小~最大+均值线。</div>
                                        </div>
                                    )}
                                >
                                    <Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>
                                        <InfoCircleOutlined style={{ marginRight: 4 }} />
                                        说明
                                    </Text>
                                </Tooltip>
                            </Flex>
                        }
                        extra={(
                            <Segmented
                                size="small"
                                value={distributionMode}
                                onChange={(val) => setDistributionMode(val as DistributionMode)}
                                options={[
                                    { label: '箱线图', value: 'box' },
                                    { label: '区间带', value: 'band' },
                                ]}
                            />
                        )}
                        bodyStyle={{ padding: '12px 16px' }}
                    >
                        {renderDistributionChart()}
                    </Card>
                </Col>

                <Col xs={24}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <BarChartOutlined style={{ color: token.colorPrimary }} />
                                <span>各省/区域均价对比 (参考)</span>
                            </Flex>
                        }
                        bodyStyle={{ padding: '16px 20px' }}
                    >
                        <div
                            style={{
                                background: token.colorFillQuaternary,
                                borderRadius: 12,
                                padding: '12px 14px',
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginBottom: 16,
                            }}
                        >
                            <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                                <Input
                                    allowClear
                                    size="small"
                                    placeholder="搜索区域"
                                    value={regionKeyword}
                                    onChange={(e) => setRegionKeyword(e.target.value)}
                                    style={{ width: 220 }}
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {regionSummary.windowLabel}
                                    {regionSummary.overallAvg !== null ? ` · 全局均价 ${regionSummary.overallAvg.toFixed(0)} 元/吨` : ''}
                                    · 共 {regionSummary.list.length} 个区域
                                </Text>
                            </Flex>
                            <Flex align="center" gap={10} wrap="wrap" style={{ marginTop: 10 }}>
                                <Segmented
                                    size="small"
                                    value={regionWindow}
                                    onChange={(val) => setRegionWindow(val as '7' | '30' | '90' | 'all')}
                                    options={[
                                        { label: '近7天', value: '7' },
                                        { label: '近30天', value: '30' },
                                        { label: '近90天', value: '90' },
                                        { label: '全量', value: 'all' },
                                    ]}
                                />
                                <Segmented
                                    size="small"
                                    value={regionLevel}
                                    onChange={(val) => setRegionLevel(val as 'province' | 'city' | 'district')}
                                    options={[
                                        { label: '省', value: 'province' },
                                        { label: '市', value: 'city' },
                                        { label: '区县', value: 'district' },
                                    ]}
                                />
                                <Segmented
                                    size="small"
                                    value={regionSort}
                                    onChange={(val) => setRegionSort(val as 'avg' | 'count' | 'delta' | 'volatility')}
                                    options={[
                                        { label: '按均价', value: 'avg' },
                                        { label: '按样本', value: 'count' },
                                        { label: '偏离度', value: 'delta' },
                                        { label: '波动率', value: 'volatility' },
                                    ]}
                                />
                                <Segmented
                                    size="small"
                                    value={regionView}
                                    onChange={(val) => setRegionView(val as 'all' | 'top' | 'bottom')}
                                    options={[
                                        { label: '全部', value: 'all' },
                                        { label: 'Top', value: 'top' },
                                        { label: 'Bottom', value: 'bottom' },
                                    ]}
                                />
                                <Segmented
                                    size="small"
                                    value={regionDetail}
                                    onChange={(val) => setRegionDetail(val as 'compact' | 'detail')}
                                    options={[
                                        { label: '简洁', value: 'compact' },
                                        { label: '详情', value: 'detail' },
                                    ]}
                                />
                            </Flex>
                        </div>
                        <Row gutter={[16, 16]}>
                            {regionList.map((item, index) => {
                                const deltaColor = Math.abs(item.deltaPct) < 0.3
                                    ? token.colorTextSecondary
                                    : item.delta >= 0
                                        ? token.colorSuccess
                                        : token.colorError;
                                const sampleHint = item.count < 5
                                    ? '样本偏少'
                                    : item.count < 10
                                        ? '样本较少'
                                        : null;
                                const missingHint = item.missingRate > 0.3
                                    ? '缺失偏高'
                                    : item.missingRate > 0.15
                                        ? '缺失较高'
                                        : null;
                                const rankTone = index < 3 ? token.colorPrimary : token.colorBorderSecondary;
                                const rangeSpan = regionSummary.rangeMax - regionSummary.rangeMin || 1;
                                const clampPct = (value: number) => Math.max(0, Math.min(100, value));
                                const minPct = clampPct(((item.minPrice - regionSummary.rangeMin) / rangeSpan) * 100);
                                const maxPct = clampPct(((item.maxPrice - regionSummary.rangeMin) / rangeSpan) * 100);
                                const q1Pct = clampPct(((item.q1 - regionSummary.rangeMin) / rangeSpan) * 100);
                                const q3Pct = clampPct(((item.q3 - regionSummary.rangeMin) / rangeSpan) * 100);
                                const medianPct = clampPct(((item.median - regionSummary.rangeMin) / rangeSpan) * 100);
                                const cardAccent = index < 3 ? token.colorPrimary : token.colorBorderSecondary;

                                return (
                                    <Col key={item.region} xs={24} sm={12} md={8} lg={6} xl={6} style={{ display: 'flex' }}>
                                        <div
                                            style={{
                                                borderRadius: 14,
                                                border: `1px solid ${token.colorBorderSecondary}`,
                                                padding: '12px 14px',
                                                background: token.colorBgContainer,
                                                boxShadow: index < 3 ? `0 8px 24px rgba(22, 119, 255, 0.08)` : 'none',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                width: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    height: 3,
                                                    width: '100%',
                                                    background: cardAccent,
                                                    opacity: index < 3 ? 1 : 0.5,
                                                }}
                                            />
                                            <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
                                                <Text style={{ fontWeight: 600, fontSize: 13 }} ellipsis>
                                                    {item.region}
                                                </Text>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        color: rankTone,
                                                        border: `1px solid ${rankTone}`,
                                                        borderRadius: 999,
                                                        padding: '0 8px',
                                                        lineHeight: '18px',
                                                    }}
                                                >
                                                    #{index + 1}
                                                </span>
                                            </Flex>
                                            <Flex align="baseline" gap={6} style={{ marginTop: 6 }}>
                                                <Text style={{ fontSize: 20, fontWeight: 600 }}>
                                                    {Number(item.avgPrice).toLocaleString()}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    元/吨
                                                </Text>
                                            </Flex>
                                            <Tooltip
                                                overlayStyle={{ maxWidth: 260 }}
                                                title={(
                                                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{item.region}</div>
                                                        <div>最小值：{item.minPrice.toFixed(0)}</div>
                                                        <div>P25：{item.q1.toFixed(0)}</div>
                                                        <div>中位数：{item.median.toFixed(0)}</div>
                                                        <div>P75：{item.q3.toFixed(0)}</div>
                                                        <div>最大值：{item.maxPrice.toFixed(0)}</div>
                                                    </div>
                                                )}
                                            >
                                                <div style={{ marginTop: 10, cursor: 'help' }}>
                                                    <div style={{ position: 'relative', height: 8, borderRadius: 999, background: token.colorFillSecondary }}>
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                left: `${minPct}%`,
                                                                width: `${Math.max(2, maxPct - minPct)}%`,
                                                            top: 3,
                                                            height: 2,
                                                            background: token.colorPrimary,
                                                            opacity: 0.8,
                                                        }}
                                                    />
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${q1Pct}%`,
                                                            width: `${Math.max(2, q3Pct - q1Pct)}%`,
                                                            top: 1,
                                                            height: 6,
                                                            borderRadius: 6,
                                                            background: token.colorPrimaryBg,
                                                            border: `1px solid ${token.colorPrimary}`,
                                                        }}
                                                    />
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${medianPct}%`,
                                                            width: 2,
                                                            top: 0,
                                                            height: 8,
                                                            borderRadius: 2,
                                                            background: token.colorPrimary,
                                                        }}
                                                        />
                                                    </div>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        min {Math.round(item.minPrice)} · median {Math.round(item.median)} · max {Math.round(item.maxPrice)}
                                                    </Text>
                                                </div>
                                            </Tooltip>
                                            <Flex justify="space-between" align="center" style={{ marginTop: 10 }}>
                                                <Flex gap={6} align="center" wrap="wrap">
                                                    <Tag color="blue" style={{ margin: 0, borderRadius: 999 }}>
                                                        {item.count} 样本
                                                    </Tag>
                                                    {sampleHint && (
                                                        <Tag color="orange" style={{ margin: 0, borderRadius: 999 }}>
                                                            {sampleHint}
                                                        </Tag>
                                                    )}
                                                    {missingHint && (
                                                        <Tag color="orange" style={{ margin: 0, borderRadius: 999 }}>
                                                            {missingHint}
                                                        </Tag>
                                                    )}
                                                </Flex>
                                                {item.hasPrev ? (
                                                    <Text style={{ fontSize: 11, color: deltaColor }}>
                                                        {item.delta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                                        {Math.abs(item.delta).toFixed(0)} ({Math.abs(item.deltaPct).toFixed(1)}%)
                                                    </Text>
                                                ) : (
                                                    <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                                                )}
                                            </Flex>
                                            {regionDetail === 'detail' && (
                                                <>
                                                    <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            P25 {item.q1.toFixed(0)} / P50 {item.median.toFixed(0)} / P75 {item.q3.toFixed(0)}
                                                        </Text>
                                                    </Flex>
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr 1fr',
                                                            columnGap: 10,
                                                            rowGap: 6,
                                                            marginTop: 6,
                                                            fontSize: 11,
                                                            color: token.colorTextSecondary,
                                                        }}
                                                    >
                                                        <div>波动率 {(item.volatility * 100).toFixed(1)}%</div>
                                                        <div>区间 {Math.round(item.maxPrice - item.minPrice)}</div>
                                                        <div>箱体高度 {Math.round(item.q3 - item.q1)}</div>
                                                        <div>更新 {dayjs(item.latestTs).format('MM-DD')}</div>
                                                        <div>{regionWindow === 'all' ? '对比上期 —' : '对比上期'}</div>
                                                        <div>{item.hasPrev ? '有上期' : '无上期'}</div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </Col>
                                );
                            })}
                            {regionSummary.list.length === 0 && (
                                <Col span={24}>
                                    <Empty description="暂无区域统计数据" />
                                </Col>
                            )}
                        </Row>
                    </Card>
                </Col>
            </Row>
        </Space>
    );
};

export default ComparisonPanel;
