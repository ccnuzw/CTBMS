import React, { useMemo } from 'react';
import { List, Typography, Tag, Empty, Card, Flex } from 'antd';
import { RiseOutlined, FallOutlined, WarningOutlined } from '@ant-design/icons';
import { MarketIntelResponse } from '@packages/types';

const { Text, Title } = Typography;

interface PriceAnomalyListProps {
    data: MarketIntelResponse[];
    loading?: boolean;
}

export const PriceAnomalyList: React.FC<PriceAnomalyListProps> = ({ data, loading }) => {
    // Filter for items with significant price fluctuations
    // Logic: 1. Tagged with 'price_fluctuation'
    //        2. Or absolute price change > 20 (if available in content/extractedData)
    const anomalies = useMemo(() => {
        return data.filter(item => {
            const analysis = item.aiAnalysis;
            const tags = analysis?.tags || [];
            const hasTag = tags.includes('price_fluctuation') || tags.includes('price_alert');

            // Check extracted data for price change if available
            const extracted = (analysis as any)?.extractedData;
            const priceChange = extracted?.priceChange ? Math.abs(extracted.priceChange) : 0;
            const hasLargeChange = priceChange > 20;

            return hasTag || hasLargeChange;
        }).slice(0, 5); // Limit to top 5
    }, [data]);

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <WarningOutlined style={{ color: '#ff4d4f' }} />
                    <span>价格异动监测 (Class A Anomalies)</span>
                </Flex>
            }
            size="small"
            bodyStyle={{ padding: 0 }}
            style={{ height: '100%' }}
        >
            <List
                loading={loading}
                dataSource={anomalies}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无价格异动" /> }}
                renderItem={item => {
                    const extracted = (item.aiAnalysis as any)?.extractedData || {};
                    const change = extracted.priceChange || 0;
                    const isRise = change >= 0;

                    return (
                        <List.Item style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                            <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <Text ellipsis strong>{item.summary || extracted.commodity || item.rawContent.substring(0, 20)}</Text>
                                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                                        {new Date(item.effectiveTime).toLocaleDateString()} · {item.location || '未知地区'}
                                    </div>
                                </div>

                                <Flex align="end" vertical>
                                    <Text type={isRise ? 'danger' : 'success'} strong style={{ fontSize: 16 }}>
                                        {isRise ? '+' : ''}{change}
                                    </Text>
                                    <Tag color={isRise ? 'red' : 'green'} style={{ margin: 0, fontSize: 10 }}>
                                        {isRise ? <RiseOutlined /> : <FallOutlined />} {isRise ? '上涨' : '下跌'}
                                    </Tag>
                                </Flex>
                            </Flex>
                        </List.Item>
                    );
                }}
            />
        </Card>
    );
};
