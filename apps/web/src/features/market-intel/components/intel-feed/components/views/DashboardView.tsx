import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Typography, Flex, theme, Progress, Tag, Space, Spin, Empty } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    FallOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    FireOutlined,
    TrophyOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { IntelFilterState, IntelItem } from '../../types';
import { ChartContainer } from '../../../ChartContainer';
import { useIntelDashboardStats } from '../../../../api/hooks';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface DashboardViewProps {
    filterState: IntelFilterState;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
    items?: IntelItem[]; // Pass filtered items for immediate calculation if needed, but we use server stats
}

export const DashboardView: React.FC<DashboardViewProps> = ({ filterState }) => {
    const { token } = theme.useToken();

    // Calculate dates from filter
    const { startDate, endDate } = useMemo(() => {
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

    // Fetch Stats
    const { data: stats, isLoading } = useIntelDashboardStats({
        startDate,
        endDate,
        sourceTypes: filterState.sourceTypes.length ? filterState.sourceTypes.map(String) : undefined,
        regionCodes: filterState.regions,
        commodities: filterState.commodities,
        keyword: filterState.keyword,
        processingStatus: filterState.status,
        qualityLevel: filterState.qualityLevel,
        minScore: filterState.confidenceRange[0],
        maxScore: filterState.confidenceRange[1],
        contentTypes: filterState.contentTypes.length ? filterState.contentTypes.map(String) : undefined,
    });

    // Data Transformation for Charts
    const sourceData = useMemo(() => {
        if (!stats) return [];
        const nameMap: Record<string, string> = {
            'FIRST_LINE': '一线采集',
            'OFFICIAL': '官方发布',
            'RESEARCH_INST': '研究机构',
            'MEDIA': '媒体报道',
            'COMPETITOR': '竞对情报',
            'THIRD_PARTY': '第三方数据',
            'OTHER': '其他'
        };
        return stats.sourceDistribution.map(item => ({
            ...item,
            name: nameMap[item.name] || item.name
        }));
    }, [stats]);

    if (isLoading) {
        return <Flex justify="center" align="center" style={{ height: 400 }}><Spin size="large" /></Flex>;
    }

    if (!stats) {
        return <Empty description="暂无统计数据" style={{ marginTop: 60 }} />;
    }

    // Colors for charts
    const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

    return (
        <div style={{ padding: 16 }}>
            {/* 核心指标 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="总情报数"
                            value={stats.overview.total}
                            prefix={<FileTextOutlined style={{ color: token.colorPrimary }} />}
                            valueStyle={{ color: token.colorPrimary }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="今日新增"
                            value={stats.overview.today}
                            prefix={<BarChartOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="高价值"
                            value={stats.overview.highValue || '-'}
                            prefix={<FireOutlined style={{ color: '#faad14' }} />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="待处理"
                            value={stats.overview.pending || '-'}
                            prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
                            valueStyle={{ color: '#fa8c16' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="已确认"
                            value={stats.overview.confirmed || '-'}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card size="small">
                        <Statistic
                            title="平均质量分"
                            value={stats.overview.avgQuality}
                            suffix="/100"
                            prefix={<TrophyOutlined style={{ color: '#722ed1' }} />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 图表区域 */}
            <Row gutter={[16, 16]}>
                {/* 情报趋势 */}
                <Col xs={24} lg={14}>
                    <Card title="情报趋势 (近7天)" bordered={false}>
                        <ChartContainer height={280}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.trend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(val) => dayjs(val).format('MM-DD')}
                                    />
                                    <YAxis />
                                    <Tooltip labelFormatter={(val) => dayjs(val).format('YYYY-MM-DD')} />
                                    <Legend />
                                    <Area type="monotone" dataKey="daily" name="日报/信号" stackId="1" stroke="#1890ff" fill="#1890ff" fillOpacity={0.6} />
                                    <Area type="monotone" dataKey="research" name="研报/洞察" stackId="1" stroke="#52c41a" fill="#52c41a" fillOpacity={0.6} />
                                    <Area type="monotone" dataKey="policy" name="政策/其他" stackId="1" stroke="#722ed1" fill="#722ed1" fillOpacity={0.6} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>

                {/* 来源分布 */}
                <Col xs={24} lg={10}>
                    <Card title="信源分布" bordered={false}>
                        <ChartContainer height={280}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sourceData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {sourceData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>

                {/* 品种热度 */}
                <Col xs={24} lg={12}>
                    <Card title="热门关注品种" bordered={false}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {stats.commodityHeat.map((item, index) => {
                                const maxVal = Math.max(...stats.commodityHeat.map(i => i.count));
                                return (
                                    <Flex key={item.name} align="center" gap={12}>
                                        <Text style={{ width: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {index + 1}. {item.name}
                                        </Text>
                                        <Progress
                                            percent={maxVal > 0 ? (item.count / maxVal) * 100 : 0}
                                            showInfo={false}
                                            strokeColor={token.colorPrimary}
                                            style={{ flex: 1 }}
                                        />
                                        <Text style={{ width: 40, textAlign: 'right' }}>{item.count}</Text>
                                    </Flex>
                                );
                            })}
                            {stats.commodityHeat.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无品种数据" />}
                        </Space>
                    </Card>
                </Col>

                {/* 区域分布 */}
                <Col xs={24} lg={12}>
                    <Card title="活跃区域分布" bordered={false}>
                        <ChartContainer height={250}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.regionHeat} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="region" type="category" width={80} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill={token.colorPrimary} radius={[0, 4, 4, 0]} name="情报量" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
