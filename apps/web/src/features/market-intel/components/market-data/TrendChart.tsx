import React, { useMemo, useState } from 'react';
import { Card, Typography, Flex, Segmented, Empty, Spin, Statistic, Space, Tag, theme } from 'antd';
import {
    LineChartOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    MinusOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    Area,
    ComposedChart,
    ReferenceLine,
} from 'recharts';
import { useMultiPointCompare, usePriceByRegion } from '../../api/hooks';
import { ChartContainer } from '../ChartContainer';

const { Title, Text } = Typography;

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
    days: number;
    selectedPointIds: string[];
    selectedRegionCode?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
    commodity,
    days,
    selectedPointIds,
    selectedRegionCode,
}) => {
    const { token } = theme.useToken();
    const [viewMode, setViewMode] = useState<ViewMode>('line');

    // 多采集点对比数据
    const { data: multiPointData, isLoading: isLoadingPoints } = useMultiPointCompare(
        selectedPointIds,
        commodity,
        days,
    );

    // 区域聚合数据
    const { data: regionData, isLoading: isLoadingRegion } = usePriceByRegion(
        selectedRegionCode || '',
        commodity,
        days,
    );

    const isLoading = isLoadingPoints || isLoadingRegion;

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
                    entry['区域均价'] = Math.round(regionPoint.avgPrice);
                }
            }

            return entry;
        });
    }, [multiPointData, regionData]);

    // 统计信息
    const stats = useMemo(() => {
        if (!multiPointData || multiPointData.length === 0) return null;

        let allPrices: number[] = [];
        let latestChanges: { name: string; change: number }[] = [];

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
                    <Tag color="blue">{commodity}</Tag>
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

            {/* 图表 */}
            {isLoading ? (
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
                                <Legend wrapperStyle={{ paddingTop: 10 }} />

                                {/* 区域均价参考线 */}
                                {regionData?.trend && (
                                    <Line
                                        type="monotone"
                                        dataKey="区域均价"
                                        name={`区域聚合均价${regionData.summary?.uniqueLocations ? ` (${regionData.summary.uniqueLocations}个采集点)` : ''}`}
                                        stroke={token.colorTextQuaternary}
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
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
                                                strokeWidth={2}
                                                connectNulls
                                            />
                                        )}
                                        {viewMode === 'line' && (
                                            <Line
                                                type="monotone"
                                                dataKey={item.point.name}
                                                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                                strokeWidth={2}
                                                dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                                                activeDot={{ r: 6 }}
                                                connectNulls
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
