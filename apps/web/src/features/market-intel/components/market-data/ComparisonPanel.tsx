import React, { useMemo } from 'react';
import { Card, Typography, Flex, Statistic, Row, Col, Progress, Tag, Space, Empty, Spin, theme } from 'antd';
import {
    ArrowUpOutlined,
    ArrowDownOutlined,
    SwapOutlined,
    BarChartOutlined,
} from '@ant-design/icons';
import { useMultiPointCompare, usePriceData } from '../../api/hooks';

const { Title, Text } = Typography;

interface ComparisonPanelProps {
    commodity: string;
    days: number;
    selectedPointIds: string[];
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
    commodity,
    days,
    selectedPointIds,
}) => {
    const { token } = theme.useToken();

    // 多采集点数据
    const { data: multiPointData, isLoading } = useMultiPointCompare(
        selectedPointIds,
        commodity,
        days,
    );

    // 获取价格数据用于分类统计
    const { data: priceDataResult } = usePriceData({
        commodity,
        pageSize: 500,
    });

    const priceDataList = priceDataResult?.data || [];

    // 各采集点最新价格排行
    const priceRanking = useMemo(() => {
        if (!multiPointData) return [];

        return multiPointData
            .map((item) => {
                const latestData = item.data[item.data.length - 1];
                const firstData = item.data[0];
                const periodChange = latestData && firstData ? latestData.price - firstData.price : 0;

                return {
                    id: item.point.id,
                    name: item.point.shortName || item.point.name,
                    code: item.point.code,
                    price: latestData?.price || 0,
                    change: latestData?.change || 0,
                    periodChange,
                };
            })
            .sort((a, b) => b.price - a.price);
    }, [multiPointData]);

    // 涨跌幅排行
    const changeRanking = useMemo(() => {
        return [...priceRanking].sort((a, b) => b.change - a.change);
    }, [priceRanking]);

    // 按价格类型统计
    const typeStats = useMemo(() => {
        const stats: Record<string, { count: number; avgPrice: number; prices: number[] }> = {};

        priceDataList.forEach((item) => {
            const type = item.sourceType || 'OTHER';
            if (!stats[type]) {
                stats[type] = { count: 0, avgPrice: 0, prices: [] };
            }
            stats[type].count++;
            stats[type].prices.push(item.price);
        });

        Object.keys(stats).forEach((type) => {
            const prices = stats[type].prices;
            stats[type].avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        });

        return stats;
    }, [priceDataList]);

    const typeLabels: Record<string, string> = {
        PORT: '港口价',
        ENTERPRISE: '企业价',
        REGIONAL: '区域价',
    };

    if (selectedPointIds.length === 0) {
        return (
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <BarChartOutlined style={{ color: token.colorPrimary }} />
                        <span>对比分析</span>
                    </Flex>
                }
            >
                <Empty description="请选择采集点进行对比分析" />
            </Card>
        );
    }

    return (
        <Row gutter={[16, 16]}>
            {/* 价格排行 */}
            <Col xs={24} lg={12}>
                <Card
                    title={
                        <Flex align="center" gap={8}>
                            <BarChartOutlined style={{ color: token.colorPrimary }} />
                            <span>价格排行</span>
                            <Tag color="blue">{commodity}</Tag>
                        </Flex>
                    }
                    bodyStyle={{ padding: '12px 16px' }}
                    loading={isLoading}
                >
                    {priceRanking.length === 0 ? (
                        <Empty description="暂无数据" />
                    ) : (
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            {priceRanking.slice(0, 10).map((item, index) => {
                                const maxPrice = priceRanking[0]?.price || 1;
                                const percent = (item.price / maxPrice) * 100;

                                return (
                                    <Flex key={item.id} align="center" gap={12}>
                                        <Text
                                            strong
                                            style={{
                                                width: 24,
                                                textAlign: 'center',
                                                color: index < 3 ? token.colorPrimary : token.colorTextSecondary,
                                            }}
                                        >
                                            {index + 1}
                                        </Text>
                                        <Flex vertical style={{ flex: 1 }}>
                                            <Flex justify="space-between" align="center">
                                                <Text ellipsis style={{ maxWidth: 120 }}>
                                                    {item.name}
                                                </Text>
                                                <Flex align="center" gap={8}>
                                                    <Text strong style={{ fontFamily: 'monospace' }}>
                                                        {item.price.toLocaleString()}
                                                    </Text>
                                                    {item.change !== 0 && (
                                                        <Text
                                                            style={{
                                                                color: item.change > 0 ? token.colorError : token.colorSuccess,
                                                                fontSize: 12,
                                                            }}
                                                        >
                                                            {item.change > 0 ? '+' : ''}{item.change}
                                                        </Text>
                                                    )}
                                                </Flex>
                                            </Flex>
                                            <Progress
                                                percent={percent}
                                                showInfo={false}
                                                strokeColor={index < 3 ? token.colorPrimary : token.colorTextQuaternary}
                                                size="small"
                                            />
                                        </Flex>
                                    </Flex>
                                );
                            })}
                        </Space>
                    )}
                </Card>
            </Col>

            {/* 涨跌排行 */}
            <Col xs={24} lg={12}>
                <Card
                    title={
                        <Flex align="center" gap={8}>
                            <SwapOutlined style={{ color: token.colorPrimary }} />
                            <span>涨跌排行</span>
                        </Flex>
                    }
                    bodyStyle={{ padding: '12px 16px' }}
                    loading={isLoading}
                >
                    {changeRanking.length === 0 ? (
                        <Empty description="暂无数据" />
                    ) : (
                        <Row gutter={16}>
                            {/* 涨幅榜 */}
                            <Col span={12}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    <ArrowUpOutlined style={{ color: token.colorError }} /> 涨幅榜
                                </Text>
                                <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                                    {changeRanking
                                        .filter((item) => item.change > 0)
                                        .slice(0, 5)
                                        .map((item) => (
                                            <Flex key={item.id} justify="space-between" align="center">
                                                <Text ellipsis style={{ maxWidth: 80, fontSize: 12 }}>
                                                    {item.name}
                                                </Text>
                                                <Tag color="red" style={{ margin: 0 }}>
                                                    +{item.change}
                                                </Tag>
                                            </Flex>
                                        ))}
                                    {changeRanking.filter((item) => item.change > 0).length === 0 && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>暂无上涨</Text>
                                    )}
                                </Space>
                            </Col>

                            {/* 跌幅榜 */}
                            <Col span={12}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    <ArrowDownOutlined style={{ color: token.colorSuccess }} /> 跌幅榜
                                </Text>
                                <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 8 }}>
                                    {changeRanking
                                        .filter((item) => item.change < 0)
                                        .reverse()
                                        .slice(0, 5)
                                        .map((item) => (
                                            <Flex key={item.id} justify="space-between" align="center">
                                                <Text ellipsis style={{ maxWidth: 80, fontSize: 12 }}>
                                                    {item.name}
                                                </Text>
                                                <Tag color="green" style={{ margin: 0 }}>
                                                    {item.change}
                                                </Tag>
                                            </Flex>
                                        ))}
                                    {changeRanking.filter((item) => item.change < 0).length === 0 && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>暂无下跌</Text>
                                    )}
                                </Space>
                            </Col>
                        </Row>
                    )}
                </Card>
            </Col>

            {/* 类型均价对比 */}
            <Col xs={24}>
                <Card
                    title={
                        <Flex align="center" gap={8}>
                            <BarChartOutlined style={{ color: token.colorPrimary }} />
                            <span>类型均价对比</span>
                        </Flex>
                    }
                    bodyStyle={{ padding: '16px 24px' }}
                >
                    <Row gutter={24}>
                        {Object.entries(typeStats).map(([type, stat]) => (
                            <Col key={type} xs={8} sm={6} md={4}>
                                <Statistic
                                    title={typeLabels[type] || type}
                                    value={stat.avgPrice}
                                    precision={0}
                                    suffix="元/吨"
                                    valueStyle={{ fontSize: 18 }}
                                />
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    {stat.count} 条数据
                                </Text>
                            </Col>
                        ))}
                        {Object.keys(typeStats).length === 0 && (
                            <Col span={24}>
                                <Empty description="暂无类型统计数据" />
                            </Col>
                        )}
                    </Row>
                </Card>
            </Col>
        </Row>
    );
};

export default ComparisonPanel;
