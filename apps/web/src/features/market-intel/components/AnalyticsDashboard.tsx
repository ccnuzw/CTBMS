import React from 'react';
import { Card, Row, Col, Typography, Empty, Flex } from 'antd';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
} from 'recharts';
import { useTrendAnalysis, EventStats } from '../api/hooks';
import { ChartContainer } from './ChartContainer';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface AnalyticsDashboardProps {
    filterQuery: {
        startDate?: Date;
        endDate?: Date;
        commodities?: string[];
        regions?: string[];
    };
    stats?: EventStats;
    loading?: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
    filterQuery,
    stats,
    loading,
}) => {
    const { data: trendData, isLoading: loadingTrend } = useTrendAnalysis(filterQuery);

    const formattedTrendData = React.useMemo(() => {
        if (!trendData) return [];
        return trendData.map(item => ({
            ...item,
            date: dayjs(item.date).format('MM-DD'),
        }));
    }, [trendData]);

    if (!stats && !trendData) {
        return <Empty description="暂无分析数据" />;
    }

    return (
        <Flex vertical gap={16}>
            <Row gutter={[16, 16]}>
                {/* 趋势分析图表 */}
                <Col span={24}>
                    <Card
                        title="市场趋势与情绪走势 (Market Trend)"
                        bordered={false}
                        loading={loadingTrend}
                    >
                        <ChartContainer height={300}>
                            <ResponsiveContainer minWidth={500} minHeight={300}>
                                <LineChart data={formattedTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" />
                                    <YAxis yAxisId="left" />
                                    <YAxis yAxisId="right" orientation="right" />
                                    <Tooltip />
                                    <Legend />
                                    <Line
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="volume"
                                        name="事件量"
                                        stroke="#1890ff"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="sentimentScore"
                                        name="情绪指数"
                                        stroke="#52c41a"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                {/* 区域热度 */}
                <Col xs={24} md={12}>
                    <Card title="区域活跃度 (Regional Activity)" bordered={false} loading={loading}>
                        <ChartContainer height={250}>
                            {/* 暂时使用 BarChart 代替 Heatmap */}
                            <ResponsiveContainer minWidth={300} minHeight={250}>
                                <BarChart
                                    layout="vertical"
                                    data={(stats?.regionStats || []).slice(0, 10)}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="region" width={80} />
                                    <Tooltip />
                                    <Bar dataKey="count" name="事件数" fill="#faad14" radius={[0, 4, 4, 0]} barSize={40}>
                                        {(stats?.regionStats || []).slice(0, 10).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={['#ffc53d', '#faad14', '#d48806'][index % 3]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>

                {/* 品种分布 */}
                <Col xs={24} md={12}>
                    <Card title="热门品种 (Top Commodities)" bordered={false} loading={loading}>
                        <ChartContainer height={250}>
                            <ResponsiveContainer minWidth={300} minHeight={250}>
                                <BarChart
                                    data={(stats?.commodityStats || []).slice(0, 10)}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="commodity" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="count" name="事件数" fill="#13c2c2" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>
            </Row>
        </Flex>
    );
};
