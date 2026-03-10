import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Card,
    Typography,
    Select,
    Flex,
    Segmented,
    Tag,
    Statistic,
    theme,
    Row,
    Col,
    Spin,
    Empty,
} from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import {
    DashboardOutlined,
    RiseOutlined,
    FallOutlined,
    ThunderboltOutlined,
    AlertOutlined,
    DatabaseOutlined,
    FireOutlined,
    GlobalOutlined,
    LineChartOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Treemap,
    Cell,
} from 'recharts';
import { useMarketIntels } from '../api/hooks';
import { IntelCategory, MarketIntelResponse } from '@packages/types';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Title, Text, Paragraph } = Typography;

type TimeRange = '7D' | '30D' | '90D' | 'YTD' | 'ALL';

import { ChartContainer } from './ChartContainer';

// 品种 fallback（与字典 COMMODITY 保持一致）
const COMMODITY_OPTIONS_FALLBACK = [
    { label: '🌽 玉米', value: 'CORN' },
    { label: '🌾 小麦', value: 'WHEAT' },
    { label: '🫘 大豆', value: 'SOYBEAN' },
    { label: '🌾 稻谷', value: 'RICE' },
    { label: '🌾 高粱', value: 'SORGHUM' },
    { label: '🌾 大麦', value: 'BARLEY' },
];

const REGION_OPTIONS_FALLBACK = [
    { label: '🌍 全国全域', value: 'ALL' },
    { label: '辽宁产区', value: '辽宁' },
    { label: '吉林产区', value: '吉林' },
    { label: '南方销区', value: '南方' },
];

// KPI 卡片组件
const KpiCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    iconColor: string;
    extra?: React.ReactNode;
}> = ({ title, value, icon, iconColor, extra }) => {
    const { token } = theme.useToken();

    return (
        <Card>
            <Flex gap={16} align="flex-start">
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: token.borderRadius,
                        background: `${iconColor}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        color: iconColor,
                    }}
                >
                    {icon}
                </div>
                <div style={{ flex: 1 }}>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>
                        {title}
                    </Text>
                    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
                    {extra && <div style={{ marginTop: 8 }}>{extra}</div>}
                </div>
            </Flex>
        </Card>
    );
};

export const SuperDashboard: React.FC = () => {
    const { token } = theme.useToken();
    const { data: dictionaries } = useDictionaries(['COMMODITY', 'SUPER_DASHBOARD_REGION']);

    // 状态
    const [timeRange, setTimeRange] = useState<TimeRange>('30D');
    const [selectedRegion, setSelectedRegion] = useState('ALL');
    const [selectedCommodity, setSelectedCommodity] = useState('CORN');

    const commodityOptions = useMemo(() => {
        const items = dictionaries?.COMMODITY?.filter((item) => item.isActive) || [];
        if (!items.length) return COMMODITY_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const regionOptions = useMemo(() => {
        const items = dictionaries?.SUPER_DASHBOARD_REGION?.filter((item) => item.isActive) || [];
        if (!items.length) return REGION_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    // 获取真实数据
    const { data: aData, isLoading: aLoading } = useMarketIntels({
        category: IntelCategory.A_STRUCTURED,
        pageSize: 500,
    });
    const { data: bData, isLoading: bLoading } = useMarketIntels({
        category: IntelCategory.B_SEMI_STRUCTURED,
        pageSize: 500,
    });

    const isLoading = aLoading || bLoading;
    const allIntels = useMemo(() => {
        return [...(aData?.data || []), ...(bData?.data || [])];
    }, [aData, bData]);

    // 筛选数据
    const filteredCards = useMemo(() => {
        let data = allIntels;
        const now = new Date();
        const cutoff = new Date();

        if (timeRange === '7D') cutoff.setDate(now.getDate() - 7);
        if (timeRange === '30D') cutoff.setDate(now.getDate() - 30);
        if (timeRange === '90D') cutoff.setDate(now.getDate() - 90);
        if (timeRange === 'YTD') cutoff.setMonth(0, 1);
        if (timeRange === 'ALL') cutoff.setFullYear(2000);

        data = data.filter((c) => new Date(c.effectiveTime) >= cutoff);

        if (selectedRegion !== 'ALL') {
            data = data.filter(
                (c) =>
                    c.location.includes(selectedRegion) ||
                    c.region?.some((r) => r.includes(selectedRegion)),
            );
        }

        data = data.filter(
            (c) => {
                const aiAnalysis = c.aiAnalysis as any || {};
                return (aiAnalysis.tags || []).some((t: string) => t.includes(selectedCommodity)) ||
                    c.rawContent.includes(selectedCommodity) ||
                    c.category !== IntelCategory.A_STRUCTURED;
            }
        );

        return data.sort(
            (a, b) =>
                new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime(),
        );
    }, [allIntels, timeRange, selectedRegion, selectedCommodity]);

    // KPI 计算
    const kpis = useMemo(() => {
        const aCards = filteredCards.filter(
            (c) => c.category === IntelCategory.A_STRUCTURED && (c.aiAnalysis as any)?.extractedData?.price,
        );
        const bCards = filteredCards.filter((c) => c.category === IntelCategory.B_SEMI_STRUCTURED);

        const latestPrice =
            aCards.length > 0 ? ((aCards[aCards.length - 1].aiAnalysis as any).extractedData?.price as number) : 0;
        const prevPrice =
            aCards.length > 1 ? ((aCards[aCards.length - 2].aiAnalysis as any).extractedData?.price as number) : 0;
        const priceChange = latestPrice && prevPrice ? ((latestPrice - prevPrice) / prevPrice) * 100 : 0;

        const pos = bCards.filter((c) => (c.aiAnalysis as any)?.sentiment === 'BULLISH').length;
        const neg = bCards.filter((c) => (c.aiAnalysis as any)?.sentiment === 'BEARISH').length;
        const totalSent = bCards.length;
        const sentimentScore = totalSent
            ? Math.round(((pos + 0.5 * (totalSent - pos - neg)) / totalSent) * 100)
            : 50;

        // 这里仅作为演示，真实场景应该有一个 explicitly 的 isFlagged 字段，暂时用 negative 来模拟
        const riskCount = bCards.filter((c) => (c.aiAnalysis as any)?.sentiment === 'BEARISH').length;

        return { latestPrice, priceChange, sentimentScore, riskCount, totalVolume: filteredCards.length };
    }, [filteredCards]);

    // 图表数据
    const chartData = useMemo(() => {
        const grouped = new Map<string, { date: string; priceSum: number; priceCount: number; sentimentScore: number }>();

        filteredCards.forEach((c) => {
            const dateKey = new Date(c.effectiveTime).toLocaleDateString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
            });
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, { date: dateKey, priceSum: 0, priceCount: 0, sentimentScore: 0 });
            }
            const entry = grouped.get(dateKey)!;

            const aiAnalysis = c.aiAnalysis as any || {};

            if (c.category === IntelCategory.A_STRUCTURED && aiAnalysis.extractedData?.price) {
                entry.priceSum += aiAnalysis.extractedData.price as number;
                entry.priceCount += 1;
            }

            if (c.category === IntelCategory.B_SEMI_STRUCTURED) {
                const score = aiAnalysis.sentiment === 'BULLISH' ? 10 : aiAnalysis.sentiment === 'BEARISH' ? -10 : 2;
                entry.sentimentScore += score;
            }
        });

        return Array.from(grouped.values()).map((item) => ({
            date: item.date,
            price: item.priceCount ? Math.round(item.priceSum / item.priceCount) : null,
            sentiment: item.sentimentScore,
        }));
    }, [filteredCards]);

    // 区域数据
    const regionalData = useMemo(() => {
        const regions: Record<string, number> = {};
        filteredCards.forEach((c) => {
            const reg = c.region?.[0] || '其他';
            regions[reg] = (regions[reg] || 0) + 1;
        });
        return Object.entries(regions)
            .map(([name, size]) => ({ name, size }))
            .sort((a, b) => b.size - a.size);
    }, [filteredCards]);

    // 价格数据 (用于套利分析)
    const { data: priceData } = useMarketIntels({
        category: IntelCategory.A_STRUCTURED,
        pageSize: 500
    });

    // 套利数据 (基于真实价格)
    const arbitrageData = useMemo(() => {
        const prices = (priceData?.data || [])
            .filter(d => (d.aiAnalysis as any)?.extractedData?.price)
            .sort((a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime());

        // 按日期聚合
        const groupedByDate: Record<string, { north: number[], south: number[] }> = {};

        prices.forEach(p => {
            const date = new Date(p.effectiveTime).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
            if (!groupedByDate[date]) groupedByDate[date] = { north: [], south: [] };

            const val = (p.aiAnalysis as any).extractedData.price;
            // 简单规则：辽宁/吉林/黑龙江 -> 产区(north)，其他 -> 销区(south)
            const loc = p.location || '';
            const regions = p.region || [];

            if (loc.includes('辽宁') || loc.includes('吉林') || loc.includes('黑龙江') || regions.some(r => r.includes('产区'))) {
                groupedByDate[date].north.push(val);
            } else {
                groupedByDate[date].south.push(val);
            }
        });

        // 计算日均价
        return Object.entries(groupedByDate).map(([date, vals]) => {
            const northAvg = vals.north.length > 0 ? Math.round(vals.north.reduce((a, b) => a + b, 0) / vals.north.length) : null;
            const southAvg = vals.south.length > 0 ? Math.round(vals.south.reduce((a, b) => a + b, 0) / vals.south.length) : null;

            // 如果某天缺数据，尝试用前一天的(简单补全)或者留空
            // 这里为了图表连续性，若都有值才展示，或者允许 connectNulls
            return {
                date,
                north: northAvg,
                south: southAvg,
                freight: 130 // 参考线
            };
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [priceData]);

    // 热门话题
    const hotTopics = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredCards.forEach((c) => {
            const aiAnalysis = c.aiAnalysis as any || {};
            (aiAnalysis.tags || []).forEach((t: string) => (counts[t] = (counts[t] || 0) + 1));
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [filteredCards]);

    // 关键事件
    const keyEvents = filteredCards
        .filter((c) => c.category === IntelCategory.B_SEMI_STRUCTURED)
        .slice(0, 4);

    if (isLoading) {
        return (
            <PageContainer header={{ title: null, breadcrumb: undefined }}>
                <Flex justify="center" align="center" style={{ height: 400 }}>
                    <Flex vertical align="center" gap={16}>
                        <Spin size="large" />
                        <Text type="secondary">加载全域数据...</Text>
                    </Flex>
                </Flex>
            </PageContainer>
        );
    }

    return (
        <PageContainer
            header={{ title: null, breadcrumb: undefined }}
            extra={
                <Flex gap={12} align="center">
                    <Select
                        value={selectedCommodity}
                        onChange={setSelectedCommodity}
                        style={{ width: 100 }}
                        size="small"
                        options={commodityOptions}
                    />
                    <Select
                        value={selectedRegion}
                        onChange={setSelectedRegion}
                        style={{ width: 120 }}
                        size="small"
                        options={regionOptions}
                    />
                    <div style={{ width: 1, height: 24, background: token.colorBorder }} />
                    <Segmented
                        options={[
                            { label: '7D', value: '7D' },
                            { label: '30D', value: '30D' },
                            { label: '90D', value: '90D' },
                            { label: 'YTD', value: 'YTD' },
                            { label: 'ALL', value: 'ALL' },
                        ]}
                        value={timeRange}
                        onChange={(val) => setTimeRange(val as TimeRange)}
                        size="small"
                    />
                </Flex>
            }
            token={{
                paddingInlinePageContainerContent: 16,
                paddingBlockPageContainerContent: 16,
            }}
        >

            {/* KPI 卡片 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={6}>
                    <KpiCard
                        title="行情价格指数 (Price)"
                        value={kpis.latestPrice ? `¥${kpis.latestPrice.toLocaleString()}` : '-'}
                        icon={<LineChartOutlined />}
                        iconColor={token.colorWarning}
                        extra={
                            <Flex align="center" gap={4}>
                                {kpis.priceChange >= 0 ? (
                                    <RiseOutlined style={{ color: token.colorError }} />
                                ) : (
                                    <FallOutlined style={{ color: token.colorSuccess }} />
                                )}
                                <Text style={{ color: kpis.priceChange >= 0 ? token.colorError : token.colorSuccess }}>
                                    {Math.abs(kpis.priceChange).toFixed(2)}% (环比)
                                </Text>
                            </Flex>
                        }
                    />
                </Col>
                <Col xs={24} md={6}>
                    <KpiCard
                        title="市场情绪评分 (Sentiment)"
                        value={`${kpis.sentimentScore}/100`}
                        icon={<ThunderboltOutlined />}
                        iconColor={token.colorPrimary}
                        extra={
                            <div
                                style={{
                                    height: 6,
                                    borderRadius: 3,
                                    background: token.colorBgTextHover,
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${kpis.sentimentScore}%`,
                                        background:
                                            kpis.sentimentScore > 60
                                                ? token.colorError
                                                : kpis.sentimentScore < 40
                                                    ? token.colorSuccess
                                                    : token.colorTextSecondary,
                                        borderRadius: 3,
                                    }}
                                />
                            </div>
                        }
                    />
                </Col>
                <Col xs={24} md={6}>
                    <KpiCard
                        title="风险预警信号 (Risks)"
                        value={kpis.riskCount}
                        icon={<AlertOutlined />}
                        iconColor={token.colorError}
                        extra={<Text type="secondary">需关注异常事件</Text>}
                    />
                </Col>
                <Col xs={24} md={6}>
                    <KpiCard
                        title="数据资产沉淀 (Assets)"
                        value={kpis.totalVolume}
                        icon={<DatabaseOutlined />}
                        iconColor={(token as any).purple || token.colorPrimary}
                        extra={<Text type="secondary">结构化记录总量</Text>}
                    />
                </Col>
            </Row>

            {/* 主图表区 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} xl={16}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <LineChartOutlined style={{ color: token.colorPrimary }} />
                                行情-舆情 共振分析
                            </Flex>
                        }
                        extra={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                左轴: 价格走势 | 右轴: 情绪净值
                            </Text>
                        }
                    >
                        {filteredCards.length > 0 ? (
                            <ChartContainer height={300}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <ComposedChart data={chartData}>
                                        <defs>
                                            <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={token.colorPrimary} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={token.colorPrimary} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={token.colorBorderSecondary} />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '8px',
                                                border: 'none',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            }}
                                        />
                                        <Legend />
                                        <Area
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="sentiment"
                                            name="情绪流"
                                            fill="url(#sentimentGradient)"
                                            stroke={token.colorPrimaryHover || token.blue}
                                            strokeWidth={1}
                                        />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="price"
                                            name="价格"
                                            stroke={token.colorPrimaryActive || token.blue}
                                            strokeWidth={3}
                                            dot={{ r: 3, strokeWidth: 2, fill: token.colorBgContainer }}
                                            activeDot={{ r: 6 }}
                                            connectNulls
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无共振分析数据" />
                        )}
                    </Card>
                </Col>

                <Col xs={24} xl={8}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <FireOutlined style={{ color: token.colorWarning }} />
                                市场焦点雷达
                            </Flex>
                        }
                        style={{ height: '100%' }}
                    >
                        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                            高频话题 (Hot Topics)
                        </Text>
                        <Flex wrap="wrap" gap={8} style={{ marginTop: 12, marginBottom: 16 }}>
                            {hotTopics.length > 0 ? (
                                hotTopics.map(([tag, count], i) => (
                                    <Tag
                                        key={tag}
                                        color={i < 3 ? 'blue' : undefined}
                                        style={{ fontSize: Math.max(10, 14 - i) }}
                                    >
                                        {tag} <span style={{ opacity: 0.5 }}>{count}</span>
                                    </Tag>
                                ))
                            ) : (
                                <Text type="secondary">暂无热门话题</Text>
                            )}
                        </Flex>

                        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                            最新关键事件 (Events)
                        </Text>
                        <div style={{ marginTop: 12 }}>
                            {keyEvents.length > 0 ? (
                                keyEvents.map((c) => {
                                    const aiAnalysis = c.aiAnalysis as any || {};
                                    return (
                                        <div
                                            key={c.id}
                                            style={{
                                                borderLeft: `2px solid ${aiAnalysis.sentiment === 'BEARISH' ? token.colorError : token.colorPrimary}`,
                                                paddingLeft: 12,
                                                marginBottom: 12,
                                            }}
                                        >
                                            <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                                <Text type="secondary" style={{ fontSize: 10 }}>
                                                    {new Date(c.effectiveTime).toLocaleDateString()}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: 10 }}>
                                                    {c.region?.[0]}
                                                </Text>
                                            </Flex>
                                            <Text strong style={{ fontSize: 12 }}>
                                                {aiAnalysis.structuredEvent?.subject} {aiAnalysis.structuredEvent?.action}
                                            </Text>
                                        </div>
                                    );
                                })
                            ) : (
                                <Text type="secondary">暂无关键事件</Text>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* 套利与热力图 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <LineChartOutlined style={{ color: (token as any).purple || token.colorPrimary }} />
                                产销区套利窗口 (Arbitrage)
                            </Flex>
                        }
                        extra={<Tag>理论运费: 130元/吨</Tag>}
                    >
                        <ChartContainer height={250}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                <ComposedChart data={arbitrageData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={token.colorBorderSecondary} />
                                    <XAxis dataKey="date" tick={false} axisLine={false} />
                                    <YAxis domain={['auto', 'auto']} hide />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="south" name="销区价格" stroke={token.colorError} strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="north" name="产区价格" stroke={token.colorPrimary} strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                        <Card
                            size="small"
                            style={{ background: `${(token as any).purple || token.colorPrimary}10`, borderColor: `${(token as any).purple || token.colorPrimary}30`, marginTop: 16 }}
                        >
                            <Flex justify="space-between" align="center">
                                <Text strong>当前窗口状态：</Text>
                                <Text>
                                    {arbitrageData.length > 0 &&
                                        (arbitrageData[arbitrageData.length - 1].south || 0) - (arbitrageData[arbitrageData.length - 1].north || 0) > 130
                                        ? '✅ 窗口开启 (利润 > 0)'
                                        : '⛔ 窗口关闭 (倒挂)'}
                                </Text>
                            </Flex>
                        </Card>
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <GlobalOutlined style={{ color: token.colorSuccess }} />
                                区域活跃度热力 (Heatmap)
                            </Flex>
                        }
                    >
                        {regionalData.length > 0 ? (
                            <ChartContainer height={290}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <Treemap
                                        data={regionalData}
                                        dataKey="size"
                                        aspectRatio={4 / 3}
                                        stroke={token.colorBgContainer}
                                        fill={token.colorSuccess}
                                    >
                                        <Tooltip />
                                    </Treemap>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无热力数据" />
                        )}
                    </Card>
                </Col>
            </Row>
        </PageContainer>
    );
};

export default SuperDashboard;
