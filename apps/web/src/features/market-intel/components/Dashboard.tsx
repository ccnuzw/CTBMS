import React, { useMemo, useState, useEffect } from 'react';
import {
    Card,
    Typography,
    Row,
    Col,
    Flex,
    Statistic,
    theme,
    Spin,
    Tag,
    Empty,
} from 'antd';
import {
    RiseOutlined,
    FallOutlined,
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
    Legend,
    BarChart,
    Bar,
    Cell,
} from 'recharts';
import { useMarketIntels, useMyTasks, usePriceData } from '../api';
import { IntelCategory, IntelTaskStatus } from '@packages/types';

const { Title, Text } = Typography;

import { ChartContainer } from './ChartContainer';

/**
 * 决策驾驶舱 (Strategic Dashboard)
 */
export const Dashboard: React.FC = () => {
    const { token } = theme.useToken();
    const currentUserId = 'system-user-placeholder'; // 暂时硬编码

    // 获取真实数据
    const { data: aData } = useMarketIntels({
        category: IntelCategory.A_STRUCTURED,
        pageSize: 100,
    });
    const { data: bData } = useMarketIntels({
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

            {/* KPI Cards */}
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
                            <div style={{ padding: 8, background: '#f0f5ff', borderRadius: 8 }}>
                                <LineChartOutlined style={{ color: '#2f54eb', fontSize: 20 }} />
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
                            <div style={{ padding: 8, background: '#fff7e6', borderRadius: 8 }}>
                                <ThunderboltOutlined style={{ color: '#fa8c16', fontSize: 20 }} />
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
                            <div style={{ padding: 8, background: '#f6ffed', borderRadius: 8 }}>
                                <DatabaseOutlined style={{ color: '#52c41a', fontSize: 20 }} />
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
                            <div style={{ padding: 8, background: '#e6f7ff', borderRadius: 8 }}>
                                <ContainerOutlined style={{ color: '#1890ff', fontSize: 20 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[24, 24]}>
                {/* Left Column */}
                <Col xs={24} lg={8}>
                    {/* Tasks */}
                    <Card
                        title={<><ClockCircleOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />今日任务 (System Push)</>}
                        style={{ marginBottom: 24, height: 320, overflow: 'auto' }}
                        bodyStyle={{ padding: '12px 24px' }}
                    >
                        {myTasks && myTasks.length > 0 ? (
                            myTasks.map(task => (
                                <div
                                    key={task.id}
                                    style={{
                                        padding: 16,
                                        background: task.status === IntelTaskStatus.OVERDUE ? '#fff1f0' : '#f6ffed',
                                        border: `1px solid ${task.status === IntelTaskStatus.OVERDUE ? '#ffccc7' : '#b7eb8f'}`,
                                        borderRadius: 6,
                                        marginBottom: 12
                                    }}
                                >
                                    <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                                        <Text strong>{task.title}</Text>
                                        <Tag color={task.status === IntelTaskStatus.OVERDUE ? "red" : "green"}>
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
                            <Empty description="暂无待办任务" />
                        )}
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 24 }}>
                            系统规则: 早9点未报送自动记录违规，关联绩效扣分。
                        </Text>
                    </Card>

                    {/* Sentiment Chart */}
                    <Card
                        title={<><ThunderboltOutlined style={{ color: '#fa8c16', marginRight: 8 }} />情绪风向标</>}
                        style={{ height: 360 }}
                    >
                        {sentimentTrendData.length > 0 ? (
                            <ChartContainer height={260}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <BarChart data={sentimentTrendData} barSize={20}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis hide />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="neg" stackId="a" fill={token.colorError} />
                                        <Bar dataKey="pos" stackId="a" fill={token.colorSuccess} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无情绪数据" />
                        )}
                    </Card>
                </Col>

                {/* Right Column */}
                <Col xs={24} lg={16}>
                    {/* Arbitrage Window */}
                    <Card
                        title={<><LineChartOutlined style={{ color: '#9333ea', marginRight: 8 }} />产销区价差监测 (Arbitrage Window)</>}
                        style={{ marginBottom: 24, height: 320 }}
                        extra={
                            <Flex gap={16}>
                                <Flex align="center" gap={4}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorError }} />南方销区</Flex>
                                <Flex align="center" gap={4}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorPrimary }} />北方产区</Flex>
                                <Flex align="center" gap={4}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d9d9d9' }} />理论运费线</Flex>
                            </Flex>
                        }
                    >
                        {arbitrageData.length > 0 ? (
                            <ChartContainer height={220}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <LineChart data={arbitrageData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#8c8c8c' }} axisLine={false} tickLine={false} />
                                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#8c8c8c' }} axisLine={false} tickLine={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="south" stroke={token.colorError} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="north" stroke={token.colorPrimary} strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="freight" stroke="#d9d9d9" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无价差数据" />
                        )}
                    </Card>

                    {/* Inventory Chart */}
                    <Card
                        title={<><DatabaseOutlined style={{ color: token.colorSuccess, marginRight: 8 }} />核心库存水位对比 (Strategic Inventory)</>}
                        style={{ height: 360 }}
                    >
                        {inventoryChartData.length > 0 ? (
                            <ChartContainer height={260}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                    <BarChart data={inventoryChartData} layout="vertical" barSize={32}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="value" fill={token.colorPrimary} radius={[0, 4, 4, 0]} background={{ fill: '#f5f5f5' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : (
                            <Empty description="暂无库存数据" />
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
