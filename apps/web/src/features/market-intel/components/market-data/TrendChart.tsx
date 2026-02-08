import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Card, Typography, Flex, Segmented, Empty, Spin, Statistic, Tag, theme, Button } from 'antd';
import {
    LineChartOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    Area,
    ComposedChart,
} from 'recharts';
import { useMultiPointCompare, usePriceByRegion } from '../../api/hooks';
import { ChartContainer } from '../ChartContainer';
import type { PriceSubType } from '@packages/types';

const { Text } = Typography;

// 图表颜色
const LINE_COLORS = [
    '#1890ff',
    '#52c41a',
    '#faad14',
    '#722ed1',
    '#13c2c2',
    '#eb2f96',
    '#fa541c',
    '#2f54eb',
];

type ViewMode = 'line' | 'area' | 'comparison';

interface TrendChartProps {
    commodity: string;
    commodityLabel?: string;
    startDate?: Date;
    endDate?: Date;
    selectedPointIds: string[];
    selectedRegionCode?: string;
    subTypes?: PriceSubType[];
    highlightPointId?: string | null;
}

export const TrendChart: React.FC<TrendChartProps> = ({
    commodity,
    commodityLabel,
    startDate,
    endDate,
    selectedPointIds,
    selectedRegionCode,
    subTypes,
    highlightPointId,
}) => {
    const { token } = theme.useToken();
    const [viewMode, setViewMode] = useState<ViewMode>('line');
    const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
    const regionKey = '区域均价';

    // 多采集点对比数据
    const {
        data: multiPointData,
        isLoading: isLoadingPoints,
        isError,
        error,
    } = useMultiPointCompare(selectedPointIds, commodity, {
        startDate,
        endDate,
        subTypes,
    });

    const highlightName = useMemo(() => {
        if (!highlightPointId || !multiPointData) return null;
        const match = multiPointData.find((item) => item.point.id === highlightPointId);
        return match?.point.name ?? null;
    }, [highlightPointId, multiPointData]);

    // 区域聚合数据
    const { data: regionData, isLoading: isLoadingRegion } = usePriceByRegion(
        selectedRegionCode || '',
        commodity,
        { startDate, endDate, subTypes },
    );

    // 只有当实际上正在请求区域数据时，才计入 loading
    const isLoading = isLoadingPoints || (!!selectedRegionCode && isLoadingRegion);

    // 转换为图表数据
    const chartData = useMemo(() => {
        if (!multiPointData || multiPointData.length === 0) return [];

        // 收集所有日期
        const dateSet = new Set<string>();
        multiPointData.forEach((item) => {
            item.data.forEach((d) => {
                const dateStr = new Date(d.date).toISOString().split('T')[0];
                dateSet.add(dateStr);
            });
        });

        // 按日期排序
        const dates = Array.from(dateSet).sort();

        // 构建数据
        return dates.map((dateStr) => {
            const d = new Date(dateStr);
            const entry: Record<string, any> = {
                date: `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`,
                fullDate: dateStr,
            };

            // 添加各采集点价格
            multiPointData.forEach((item) => {
                const pointData = item.data.find(
                    (pd) => new Date(pd.date).toISOString().split('T')[0] === dateStr,
                );
                if (pointData) {
                    entry[item.point.name] = pointData.price;
                    entry[`${item.point.name}_change`] = pointData.change;
                }
            });

            // 添加区域均价
            if (regionData?.trend) {
                const regionPoint = regionData.trend.find((rt) => rt.date === dateStr);
                if (regionPoint) {
                    entry[regionKey] = Math.round(regionPoint.avgPrice);
                }
            }

            return entry;
        });
    }, [multiPointData, regionData, regionKey]);

    // 统计信息
    const stats = useMemo(() => {
        if (!multiPointData || multiPointData.length === 0) return null;

        let allPrices: number[] = [];
        const latestChanges: { name: string; change: number }[] = [];

        multiPointData.forEach((item) => {
            const prices = item.data.map((d) => d.price);
            allPrices = [...allPrices, ...prices];

            const latestData = item.data[item.data.length - 1];
            if (latestData?.change !== null && latestData?.change !== undefined) {
                latestChanges.push({ name: item.point.name, change: latestData.change });
            }
        });

        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
        const avgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
        const volatility = avgPrice > 0 ? ((maxPrice - minPrice) / avgPrice) * 100 : 0;

        // 最大涨跌
        latestChanges.sort((a, b) => b.change - a.change);
        const topGainer = latestChanges[0];
        const topLoser = latestChanges[latestChanges.length - 1];

        return {
            minPrice,
            maxPrice,
            avgPrice,
            volatility,
            topGainer,
            topLoser,
        };
    }, [multiPointData]);

    const latestMap = useMemo(() => {
        const map = new Map<string, { price: number; change: number | null; date: Date }>();
        if (multiPointData) {
            multiPointData.forEach((item) => {
                const latest = item.data[item.data.length - 1];
                if (latest) {
                    map.set(item.point.name, {
                        price: latest.price,
                        change: latest.change ?? null,
                        date: new Date(latest.date),
                    });
                }
            });
        }
        if (regionData?.trend?.length) {
            const last = regionData.trend[regionData.trend.length - 1];
            if (last) {
                map.set(regionKey, {
                    price: Math.round(last.avgPrice),
                    change: null,
                    date: new Date(last.date),
                });
            }
        }
        return map;
    }, [multiPointData, regionData, regionKey]);

    const quality = useMemo(() => {
        if (!multiPointData || multiPointData.length === 0) return null;
        const dateSet = new Set<string>();
        let latestDate: Date | null = null;
        let totalSamples = 0;

        multiPointData.forEach((item) => {
            totalSamples += item.data.length;
            item.data.forEach((d) => {
                const date = new Date(d.date);
                const key = dayjs(date).format('YYYY-MM-DD');
                dateSet.add(key);
                if (!latestDate || date > latestDate) latestDate = date;
            });
        });

        let missingDays: number | null = null;
        if (startDate && endDate) {
            const expectedDays =
                dayjs(endDate).startOf('day').diff(dayjs(startDate).startOf('day'), 'day') + 1;
            missingDays = Math.max(0, expectedDays - dateSet.size);
        }

        return { totalSamples, latestDate, missingDays, uniqueDays: dateSet.size };
    }, [multiPointData, startDate, endDate]);

    const toggleLegend = (dataKey: string) => {
        setHiddenKeys((prev) =>
            prev.includes(dataKey) ? prev.filter((key) => key !== dataKey) : [...prev, dataKey],
        );
    };

    const renderLegend = (props: any) => {
        const { payload } = props;
        if (!payload || payload.length === 0) return null;
        return (
            <Flex wrap="wrap" gap={12} style={{ fontSize: 12 }}>
                {payload.map((entry: any) => {
                    const dataKey = entry.dataKey as string;
                    const latest = latestMap.get(dataKey);
                    const isHidden = hiddenKeys.includes(dataKey);
                    return (
                        <Flex
                            key={dataKey}
                            align="center"
                            gap={6}
                            onClick={() => toggleLegend(dataKey)}
                            style={{ cursor: 'pointer', opacity: isHidden ? 0.4 : 1 }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
                                    background: entry.color,
                                    display: 'inline-block',
                                }}
                            />
                            <Text>{dataKey}</Text>
                            {latest && (
                                <Text type="secondary">
                                    {latest.price.toLocaleString()}
                                    {latest.change !== null &&
                                        ` (${latest.change > 0 ? '+' : ''}${latest.change})`}
                                </Text>
                            )}
                        </Flex>
                    );
                })}
            </Flex>
        );
    };

    if (selectedPointIds.length === 0) {
        return (
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <LineChartOutlined style={{ color: token.colorPrimary }} />
                        <span>价格趋势分析</span>
                    </Flex>
                }
            >
                <Empty
                    image={<LineChartOutlined style={{ fontSize: 64, color: token.colorTextQuaternary }} />}
                    description="请在左侧选择至少一个采集点"
                />
            </Card>
        );
    }

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <LineChartOutlined style={{ color: token.colorPrimary }} />
                    <span>价格趋势分析</span>
                    <Tag color="blue">{commodityLabel || commodity}</Tag>
                </Flex>
            }
            extra={
                <Segmented
                    size="small"
                    options={[
                        { label: '折线图', value: 'line' },
                        { label: '面积图', value: 'area' },
                    ]}
                    value={viewMode}
                    onChange={(val) => setViewMode(val as ViewMode)}
                />
            }
            bodyStyle={{ padding: '16px 24px' }}
        >
            {/* 统计指标 */}
            {stats && (
                <Flex gap={24} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                    <Statistic
                        title="价格区间"
                        value={`${stats.minPrice.toLocaleString()} ~ ${stats.maxPrice.toLocaleString()}`}
                        suffix="元/吨"
                        valueStyle={{ fontSize: 16 }}
                    />
                    <Statistic
                        title="区间均价"
                        value={stats.avgPrice}
                        precision={0}
                        suffix="元/吨"
                        valueStyle={{ fontSize: 16 }}
                    />
                    <Statistic
                        title="波动率"
                        value={stats.volatility}
                        precision={1}
                        suffix="%"
                        valueStyle={{ fontSize: 16 }}
                    />
                    {stats.topGainer && (
                        <Statistic
                            title="今日涨幅最大"
                            value={stats.topGainer.name}
                            suffix={
                                <Text style={{ color: token.colorError, fontSize: 12 }}>
                                    +{stats.topGainer.change}
                                </Text>
                            }
                            valueStyle={{ fontSize: 14 }}
                        />
                    )}
                    {stats.topLoser && stats.topLoser.change < 0 && (
                        <Statistic
                            title="今日跌幅最大"
                            value={stats.topLoser.name}
                            suffix={
                                <Text style={{ color: token.colorSuccess, fontSize: 12 }}>
                                    {stats.topLoser.change}
                                </Text>
                            }
                            valueStyle={{ fontSize: 14 }}
                        />
                    )}
                </Flex>
            )}
            {quality && (
                <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
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

            {/* 图表 */}
            {isError ? (
                <Flex justify="center" align="center" vertical style={{ height: 350, gap: 16 }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<Text type="danger">数据加载失败: {(error as Error)?.message || '未知错误'}</Text>}
                    />
                    <Button onClick={() => window.location.reload()}>刷新重试</Button>
                </Flex>
            ) : isLoading ? (
                <Flex justify="center" align="center" vertical style={{ height: 350, gap: 16 }}>
                    <Spin size="large" />
                    <Text type="secondary">加载数据中...</Text>
                </Flex>
            ) : chartData.length === 0 ? (
                <Empty description="所选时间范围内无数据" style={{ height: 350 }} />
            ) : (
                <div style={{ height: 350 }}>
                    <ChartContainer height={350}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                <defs>
                                    {multiPointData?.map((item, index) => (
                                        <linearGradient
                                            key={item.point.id}
                                            id={`gradient-${item.point.id}`}
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="5%"
                                                stopColor={LINE_COLORS[index % LINE_COLORS.length]}
                                                stopOpacity={0.3}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor={LINE_COLORS[index % LINE_COLORS.length]}
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: token.colorTextSecondary }}
                                    axisLine={{ stroke: token.colorBorder }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fontSize: 11, fill: token.colorTextSecondary }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={50}
                                    tickFormatter={(val) => val.toLocaleString()}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        background: token.colorBgElevated,
                                    }}
                                    formatter={(value: any) =>
                                        `${Number(value).toLocaleString()} 元/吨`
                                    }
                                />
                                <Legend content={renderLegend} wrapperStyle={{ paddingTop: 10 }} />

                                {/* 区域均价参考线 */}
                                {regionData?.trend && (
                                    <Line
                                        type="monotone"
                                        dataKey={regionKey}
                                        name={`区域聚合均价${regionData.summary?.uniqueLocations ? ` (${regionData.summary.uniqueLocations}个采集点)` : ''}`}
                                        stroke={token.colorTextQuaternary}
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                        hide={hiddenKeys.includes(regionKey)}
                                    />
                                )}

                                {/* 各采集点曲线 */}
                                {multiPointData?.map((item, index) => (
                                    <React.Fragment key={item.point.id}>
                                        {viewMode === 'area' && (
                                            <Area
                                                type="monotone"
                                                dataKey={item.point.name}
                                                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                                fill={`url(#gradient-${item.point.id})`}
                                                strokeWidth={highlightName === item.point.name ? 3 : 2}
                                                connectNulls
                                                hide={hiddenKeys.includes(item.point.name)}
                                            />
                                        )}
                                        {viewMode === 'line' && (
                                            <Line
                                                type="monotone"
                                                dataKey={item.point.name}
                                                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                                strokeWidth={highlightName === item.point.name ? 3 : 2}
                                                dot={{
                                                    r: highlightName === item.point.name ? 4 : 3,
                                                    strokeWidth: 2,
                                                    fill: '#fff',
                                                }}
                                                activeDot={{ r: highlightName === item.point.name ? 7 : 6 }}
                                                connectNulls
                                                hide={hiddenKeys.includes(item.point.name)}
                                            />
                                        )}
                                    </React.Fragment>
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            )}
        </Card>
    );
};

export default TrendChart;
