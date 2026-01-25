import React, { useMemo } from 'react';
import { Card, theme, Space, Flex, Typography, Spin, Empty, Tag } from 'antd';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend
} from 'recharts';
import { RadarChartOutlined, CaretUpOutlined, CaretDownOutlined, MinusOutlined } from '@ant-design/icons';
import { ChartContainer } from '../../../ChartContainer';
import { useIntelligenceFeed } from '../../../../api/hooks';
import { IntelCategory } from '../../../../types';

const { Text, Title } = Typography;

export const SentimentGaugeWidget: React.FC = () => {
    const { token } = theme.useToken();

    // Fetch recent items to analyze sentiment
    // Ideally this should be a dedicated stats API, but we aggregate client-side for now
    const { data: feedData, isLoading } = useIntelligenceFeed({
        limit: 50,
        // Only B class usually has strong sentiment analysis
        // But we take all for broader view
    });

    const sentimentStats = useMemo(() => {
        if (!feedData || feedData.length === 0) return null;

        let positive = 0;
        let negative = 0;
        let neutral = 0;
        let total = 0;

        feedData.forEach((item: any) => {
            if (!item?.aiAnalysis) return;
            const sentiment = item.aiAnalysis.sentiment;
            if (sentiment === 'positive') positive++;
            else if (sentiment === 'negative') negative++;
            else neutral++; // default or explicit neutral
            total++;
        });

        const score = total > 0
            ? ((positive - negative) / total) * 100
            : 0; // -100 to 100

        // Normalize score to 0-100 for gauge if needed, but relative -100 to 100 is better for market sentiment

        return {
            distribution: [
                { name: '看涨/积极', value: positive, color: '#f5222d' }, // Red for bullish in China? Actually standard is Red=Rise, Green=Fall in China.
                // Let's stick to Semantic Colors: Positive=Red (Bullish), Negative=Green (Bearish/Fall) in Chinese context
                // But typically Sentiment Positive = Good, Negative = Bad. 
                // In commodity market: Price Up (Positive for seller) = Red. Price Down (Negative for seller) = Green.
                // Let's use Red for Positive/Bullish, Green for Negative/Bearish, Grey for Neutral.
                { name: '看跌/消极', value: negative, color: '#52c41a' },
                { name: '平稳/中性', value: neutral, color: '#faad14' },
            ],
            score: Math.round(score),
            label: score > 20 ? '偏强' : score < -20 ? '偏弱' : '震荡'
        };
    }, [feedData]);

    const COLORS = ['#f5222d', '#52c41a', '#faad14'];

    const renderNeedle = (value: number) => {
        // Value -100 to 100.
        // Rotation: -90deg (at -100) to 90deg (at 100).
        const rotation = (value / 100) * 90;
        return (
            <div style={{
                position: 'absolute',
                top: '60%',
                left: '50%',
                width: 4,
                height: 50,
                background: token.colorText,
                transformOrigin: 'bottom center',
                transform: `translate(-50%, -100%) rotate(${rotation}deg)`,
                transition: 'transform 0.5s ease-out',
                zIndex: 10,
                borderRadius: 2
            }} />
        );
    };

    return (
        <Card
            title={
                <Space>
                    <RadarChartOutlined style={{ color: token.colorPrimary }} />
                    <span>市场情绪哨兵</span>
                </Space>
            }
            bodyStyle={{ padding: 12, height: 290 }}
        >
            {isLoading ? (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                    <Spin />
                </Flex>
            ) : !sentimentStats ? (
                <Empty description="暂无情绪数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <Flex style={{ height: '100%' }} align="center">
                    {/* Gauge / Score Area */}
                    <div style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <ChartContainer height={180}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sentimentStats.distribution}
                                        cx="50%"
                                        cy="70%"
                                        startAngle={180}
                                        endAngle={0}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {sentimentStats.distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                        {/* Needle/Score Display */}
                        {renderNeedle(sentimentStats.score)}
                        <div style={{ marginTop: -20, textAlign: 'center', zIndex: 11 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>情绪指数</Text>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: sentimentStats.score > 0 ? '#f5222d' : sentimentStats.score < 0 ? '#52c41a' : '#faad14' }}>
                                {sentimentStats.score > 0 ? '+' : ''}{sentimentStats.score}
                            </div>
                            <Tag color={sentimentStats.score > 20 ? 'red' : sentimentStats.score < -20 ? 'green' : 'orange'}>
                                {sentimentStats.label}
                            </Tag>
                        </div>
                    </div>

                    {/* Legend Area */}
                    <div style={{ width: 120, paddingLeft: 10 }}>
                        <Flex vertical gap={12}>
                            {sentimentStats.distribution.map(item => (
                                <div key={item.name}>
                                    <Flex align="center" gap={8} style={{ marginBottom: 2 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                                        <Text style={{ fontSize: 12 }}>{item.name}</Text>
                                    </Flex>
                                    <Text strong style={{ paddingLeft: 16 }}>{item.value} <span style={{ fontSize: 10, color: '#999' }}>条</span></Text>
                                </div>
                            ))}
                        </Flex>
                    </div>
                </Flex>
            )}
        </Card>
    );
};
