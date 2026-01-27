import React, { useMemo } from 'react';
import { Card, Typography, Flex, Empty } from 'antd';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChartOutlined } from '@ant-design/icons';
import { MarketIntelResponse } from '@packages/types';
import { ChartContainer } from '../../ChartContainer';

interface IntelCompositionChartProps {
    data: MarketIntelResponse[];
    loading?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// Mapping source types to readable labels
const SOURCE_LABEL_MAP: Record<string, string> = {
    'OFFICIAL': '官方发布',
    'INTERNAL_REPORT': '内部研报',
    'INDUSTRY_ASSOC': '行业协会',
    'THIRD_PARTY': '三方数据',
    'COMPETITOR': '竞对情报',
    'NEWS': '新闻资讯',
    'SOCIAL_MEDIA': '社媒动态',
    'FIRST_LINE': '一线采集',
    'MARKET_PRICE': '市场报价',
    'BIDDING': '招投标信息',
    'RESEARCH_INST': '研究机构',
    'OTHER': '其他来源'
};

export const IntelCompositionChart: React.FC<IntelCompositionChartProps> = ({ data, loading }) => {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const distribution: Record<string, number> = {};

        data.forEach(item => {
            // Use sourceType as the primary grouping key
            // Fallback to eventTypeCode if needed, but sourceType is standard
            const type = item.sourceType || 'OTHER';
            distribution[type] = (distribution[type] || 0) + 1;
        });

        return Object.entries(distribution)
            .map(([name, value]) => ({
                name: SOURCE_LABEL_MAP[name] || (name === 'OTHER' ? '其他来源' : name),
                value
            }))
            .sort((a, b) => b.value - a.value);
    }, [data]);

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <PieChartOutlined style={{ color: '#1890ff' }} />
                    <span>情报来源构成 (Source Composition)</span>
                </Flex>
            }
            size="small"
            style={{ height: '100%' }}
        >
            {chartData.length > 0 ? (
                <ChartContainer height={200}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend
                                layout="vertical"
                                align="right"
                                verticalAlign="middle"
                                wrapperStyle={{ fontSize: 12 }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>
            ) : (
                <Empty description="暂无分布数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
        </Card>
    );
};
