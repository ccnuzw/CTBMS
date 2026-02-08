import React, { useMemo } from 'react';
import {
    Card,
    Typography,
    Row,
    Col,
    Flex,
    theme,
    Tag,
    Empty,
} from 'antd';
import {
    RiseOutlined,
    LineChartOutlined,
    ThunderboltOutlined,
    DatabaseOutlined,
    ContainerOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
} from 'recharts';
import { useMarketIntels, useMyTasks, usePriceData } from '../api';
import { IntelCategory, IntelTaskStatus } from '@packages/types';
import { ChartContainer } from './ChartContainer';
import { SmartBriefingCard } from './intel-feed/components/SmartBriefingCard';
import { PriceAnomalyList } from './dashboard/widgets/PriceAnomalyList';
import { IntelCompositionChart } from './dashboard/widgets/IntelCompositionChart';
import { DEFAULT_FILTER_STATE } from './intel-feed/types';
import { Leaderboard } from './Leaderboard';
import { useVirtualUser } from '@/features/auth/virtual-user';

const { Title, Text } = Typography;

/**
 * 决策驾驶舱 (Strategic Dashboard)
 * 升级版：集成 AI 简报、价格异动监测与多维情报分析
 */
export const Dashboard: React.FC = () => {
    const { token } = theme.useToken();
    const { currentUser } = useVirtualUser();
    const currentUserId = currentUser?.id || '';

    // 获取真实数据
    const { data: aData, isLoading: aLoading } = useMarketIntels({
        category: IntelCategory.A_STRUCTURED,
        pageSize: 100,
    });
    const { data: bData, isLoading: bLoading } = useMarketIntels({
        category: IntelCategory.B_SEMI_STRUCTURED,
        pageSize: 100,
    });

    // 获取任务数据
    const { data: myTasks } = useMyTasks(currentUserId);

    // 获取库存数据 (通过 PriceData 获取 inventory 字段)
    const { data: inventoryData } = usePriceData({
        pageSize: 100,
    });

    const combinedIntels = useMemo(() => {
        return [...(aData?.data || []), ...(bData?.data || [])];
    }, [aData, bData]);

    // KPI 1: 价差 (模拟：取最近两个价格差)
    const spreadInfo = useMemo(() => {
        const prices = (aData?.data || [])
            .map(d => (d.aiAnalysis as any)?.extractedData?.price)
            .filter(Boolean);

        if (prices.length >= 2) {
            const diff = Math.abs(prices[0] - prices[1]);
            return { value: diff, change: 45 }; // change 固定模拟
        }
        return { value: 85, change: 45 }; // 默认模拟值
    }, [aData]);

    // KPI 2: 情绪风向
    const sentimentInfo = useMemo(() => {
        const intels = bData?.data || [];
        if (intels.length === 0) return { label: '中性 (Neutral)', color: token.colorTextSecondary, ratio: 50 };

        const neg = intels.filter(i => (i.aiAnalysis as any)?.sentiment === 'negative').length;
        const total = intels.length;
        const ratio = Math.round((neg / total) * 100);

        if (ratio > 60) return { label: '偏空 (Bearish)', color: token.colorError, ratio };
        if (ratio < 40) return { label: '偏多 (Bullish)', color: token.colorSuccess, ratio };
        return { label: '震荡 (Neutral)', color: token.colorWarning, ratio };
    }, [bData]);

    // 核心图表数据 1: 价差监测 (A类数据)
    const arbitrageData = useMemo(() => {
        const prices = (aData?.data || [])
            .filter(d => (d.aiAnalysis as any)?.extractedData?.price)
            .sort((a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime());

        // 简单模拟产销区价格：销区 = 价格 * 1.05 + 波动，产区 = 价格 * 0.95 - 波动
        return prices.map((item, i) => ({
            date: new Date(item.effectiveTime).toLocaleDateString(),
            south: Math.round((item.aiAnalysis as any).extractedData.price * 1.05 + Math.sin(i) * 10),
            north: Math.round((item.aiAnalysis as any).extractedData.price * 0.95 - Math.cos(i) * 10),
            freight: 2800, // 参考线
        }));
    }, [aData]);

    // 核心图表数据 2: 情绪风向标 (B类数据 - 堆叠柱状图)
    const sentimentTrendData = useMemo(() => {
        const intels = bData?.data || [];
        const groups: Record<string, { pos: number, neg: number }> = {};

        intels.forEach(item => {
            const date = new Date(item.effectiveTime).toLocaleDateString();
            if (!groups[date]) groups[date] = { pos: 0, neg: 0 };
            const sent = (item.aiAnalysis as any)?.sentiment;
            if (sent === 'positive') groups[date].pos += 1;
            else if (sent === 'negative') groups[date].neg += 1;
        });

        const result = Object.entries(groups)
            .map(([day, val]) => ({ day, ...val }))
            .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime())
            .slice(-7);

        return result.length > 0 ? result : []; // 如果没有数据则返回空数组
    }, [bData]);

    // 库存数据处理
    const inventoryChartData = useMemo(() => {
        if (!inventoryData?.data) return [];
        // 过滤出有库存的数据
        const items = inventoryData.data.filter(item => item.inventory && item.inventory > 0);
        // 按地点分组求和 (假设每个地点有多条记录，取最新的或者求和，这里简化为取最新的5条展示)
        return items.slice(0, 5).map(item => ({
            name: item.location,
            value: item.inventory || 0,
            max: (item.inventory || 0) * 1.2, // 模拟最大容量
            color: token.colorPrimary
        }));
    }, [inventoryData]);

    return (
        <div style={{ padding: 24, background: token.colorBgLayout, minHeight: '100%' }}>
            {/* Header */}
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>
                        决策驾驶舱 (Strategic Dashboard)
                    </Title>
                    <Text type="secondary">宏观视角：价差趋势、情绪风向与核心库存。</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>数据更新于: {new Date().toLocaleTimeString()}</Text>
            </Flex>

            {/* Row 1: AI Smart Briefing */}
            <Row style={{ marginBottom: 24 }}>
                <Col span={24}>
                    <SmartBriefingCard filterState={DEFAULT_FILTER_STATE} />
                </Col>
            </Row>

            {/* Row 2: KPI Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={6}>
                    <Card size="small" bodyStyle={{ padding: 20 }}>
                        <Flex justify="space-between" align="start">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>北港-南港价差</Text>
                                <Title level={3} style={{ margin: '4px 0 8px' }}>
                                    {spreadInfo.value} ¥/吨
                                </Title>
                                <Flex gap={4}>
                                    <RiseOutlined style={{ color: token.colorError }} />
                                    <Text type="danger" style={{ fontSize: 12 }}>较离初缩窄 {spreadInfo.change}元</Text>
                                </Flex>
                            </div>
                            <div style={{ padding: 8, background: token.colorInfoBg, borderRadius: 8 }}>
                                <LineChartOutlined style={{ color: token.colorInfo, fontSize: 20 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card size="small" bodyStyle={{ padding: 20 }}>
                        <Flex justify="space-between" align="start">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>情绪风向标</Text>
                                <Title level={3} style={{ margin: '4px 0 8px' }}>
                                    {sentimentInfo.label}
                                </Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    负面情绪占比升至 {sentimentInfo.ratio}%
                                </Text>
                            </div>
                            <div style={{ padding: 8, background: token.colorWarningBg, borderRadius: 8 }}>
                                <ThunderboltOutlined style={{ color: token.colorWarning, fontSize: 20 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card size="small" bodyStyle={{ padding: 20 }}>
                        <Flex justify="space-between" align="start">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>自有库存水位</Text>
                                <Title level={3} style={{ margin: '4px 0 8px' }}>
                                    {inventoryChartData.reduce((acc, cur) => acc + (cur.value || 0), 0)} 吨
                                </Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    库容利用率 72% (估)
                                </Text>
                            </div>
                            <div style={{ padding: 8, background: token.colorSuccessBg, borderRadius: 8 }}>
                                <DatabaseOutlined style={{ color: token.colorSuccess, fontSize: 20 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} md={6}>
                    <Card size="small" bodyStyle={{ padding: 20 }}>
                        <Flex justify="space-between" align="start">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>系统情报量</Text>
                                <Title level={3} style={{ margin: '4px 0 8px' }}>
                                    {combinedIntels.length}
                                </Title>
                                <Flex gap={4}>
                                    <RiseOutlined style={{ color: token.colorSuccess }} />
                                    <Text type="success" style={{ fontSize: 12 }}>今日新增 {bData?.data.length || 0} 条</Text>
                                </Flex>
                            </div>
                            <div style={{ padding: 8, background: token.colorPrimaryBg, borderRadius: 8 }}>
                                <ContainerOutlined style={{ color: token.colorPrimary, fontSize: 20 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
            </Row>

            {/* Row 3: Deep Dive Widgets (New Features) */}
            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                {/* 1. Price Anomalies (Class A) */}
                <Col xs={24} lg={8}>
                    <PriceAnomalyList data={aData?.data || []} loading={aLoading} />
                </Col>

                {/* 2. Intel Composition (Class B) */}
                <Col xs={24} lg={8}>
                    <IntelCompositionChart data={bData?.data || []} loading={bLoading} />
                </Col>

                {/* 3. My Tasks (System Push) */}
                <Col xs={24} lg={8}>
                    <Card
                        title={<><ClockCircleOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />今日任务 (System Push)</>}
                        style={{ height: '100%', minHeight: 300, overflow: 'auto' }}
                        bodyStyle={{ padding: '12px 16px' }}
                        size="small"
                    >
                        {myTasks && myTasks.length > 0 ? (
                            myTasks.map(task => (
                                <div
                                    key={task.id}
                                    style={{
                                        padding: 12,
                                        background: task.status === IntelTaskStatus.OVERDUE ? token.colorErrorBg : token.colorSuccessBg,
                                        border: `1px solid ${task.status === IntelTaskStatus.OVERDUE ? token.colorErrorBorder : token.colorSuccessBorder}`,
                                        borderRadius: 6,
                                        marginBottom: 8
                                    }}
                                >
                                    <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                        <Text strong style={{ fontSize: 13 }}>{task.title}</Text>
                                        <Tag color={task.status === IntelTaskStatus.OVERDUE ? "red" : "green"} style={{ margin: 0 }}>
                                            {task.status === IntelTaskStatus.OVERDUE ? '超时' : '进行中'}
                                        </Tag>
                                    </Flex>
                                    {task.status === IntelTaskStatus.OVERDUE && (
                                        <Text type="danger" style={{ fontSize: 12 }}>
                                            <ExclamationCircleOutlined /> 已超时 (未打卡)
                                        </Text>
                                    )}
                                </div>
                            ))
                        ) : (
                            <Empty
                                description="暂无待办任务"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        )}
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 12, textAlign: 'center' }}>
                            系统规则: 早9点未报送自动记录违规
                        </Text>
                    </Card>
                </Col>
            </Row>

            {/* Row 4: Trending Charts (Legacy upgraded) */}
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={12}>
                    <Card
                        title={<><LineChartOutlined style={{ color: token.colorInfo, marginRight: 8 }} />产销区价差监测 (Arbitrage Window)</>}
                        style={{ height: 360 }}
                    >
                        {arbitrageData.length > 0 ? (
                            <ChartContainer height={280}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <LineChart data={arbitrageData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="south" stroke={token.colorError} strokeWidth={2} dot={false} name="南方销区" />
                                        <Line type="monotone" dataKey="north" stroke={token.colorPrimary} strokeWidth={2} dot={false} name="北方产区" />
                                        <Line type="monotone" dataKey="freight" stroke={token.colorTextQuaternary} strokeWidth={1} strokeDasharray="5 5" dot={false} name="理论运费" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无价差数据" />
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={12}>
                    <Card
                        title={<><ThunderboltOutlined style={{ color: token.colorWarning, marginRight: 8 }} />情绪风向标趋势 (Sentiment Trend)</>}
                        style={{ height: 360 }}
                    >
                        {sentimentTrendData.length > 0 ? (
                            <ChartContainer height={280}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <BarChart data={sentimentTrendData} barSize={20}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis hide />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="neg" stackId="a" fill={token.colorError} name="负面" />
                                        <Bar dataKey="pos" stackId="a" fill={token.colorSuccess} radius={[4, 4, 0, 0]} name="正面" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无情绪数据" />
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Row 5: Performance Leaderboard */}
            <Row style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Leaderboard />
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
