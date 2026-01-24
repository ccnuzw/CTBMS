import React, { useMemo } from 'react';
import { Card, Typography, Flex, Space, Tag, Alert, theme } from 'antd';
import {
    BulbOutlined,
    WarningOutlined,
    RiseOutlined,
    FallOutlined,
    SwapOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useMultiPointCompare } from '../../api/hooks';
import type { PriceSubType } from '@packages/types';

const { Text } = Typography;

interface InsightCardsProps {
    commodity: string;
    startDate?: Date;
    endDate?: Date;
    selectedPointIds: string[];
    subTypes?: PriceSubType[];
}

interface InsightItem {
    type: 'warning' | 'info' | 'success' | 'trend';
    icon: React.ReactNode;
    title: string;
    content: string;
}

export const InsightCards: React.FC<InsightCardsProps> = ({
    commodity,
    startDate,
    endDate,
    selectedPointIds,
    subTypes,
}) => {
    const { token } = theme.useToken();

    // 多采集点数据
    const { data: multiPointData } = useMultiPointCompare(selectedPointIds, commodity, {
        startDate,
        endDate,
        subTypes,
    });

    // 生成智能洞察
    const insights = useMemo<InsightItem[]>(() => {
        const result: InsightItem[] = [];

        if (!multiPointData || multiPointData.length === 0) return result;

        // 1. 异常检测 - 偏离均价超过5%
        const allLatestPrices: number[] = [];
        multiPointData.forEach((item) => {
            const latest = item.data[item.data.length - 1];
            if (latest) allLatestPrices.push(latest.price);
        });

        if (allLatestPrices.length > 0) {
            const avgPrice = allLatestPrices.reduce((a, b) => a + b, 0) / allLatestPrices.length;

            multiPointData.forEach((item) => {
                const latest = item.data[item.data.length - 1];
                if (latest) {
                    const deviation = ((latest.price - avgPrice) / avgPrice) * 100;
                    if (Math.abs(deviation) > 5) {
                        result.push({
                            type: 'warning',
                            icon: <WarningOutlined style={{ color: token.colorWarning }} />,
                            title: '价格异常',
                            content: `${item.point.shortName || item.point.name} 当前价格 ${latest.price.toLocaleString()} 元/吨，${deviation > 0 ? '高于' : '低于'}均价 ${Math.abs(deviation).toFixed(1)}%`,
                        });
                    }
                }
            });
        }

        // 2. 连续涨跌检测
        multiPointData.forEach((item) => {
            if (item.data.length >= 3) {
                const recentData = item.data.slice(-7);
                const consecutiveUp = recentData.every((d, i, arr) => i === 0 || d.price >= arr[i - 1].price);
                const consecutiveDown = recentData.every((d, i, arr) => i === 0 || d.price <= arr[i - 1].price);

                if (consecutiveUp && recentData.length >= 5) {
                    const totalChange = recentData[recentData.length - 1].price - recentData[0].price;
                    result.push({
                        type: 'trend',
                        icon: <RiseOutlined style={{ color: token.colorError }} />,
                        title: '持续上涨',
                        content: `${item.point.shortName || item.point.name} 近 ${recentData.length} 日连续上涨，累计 +${totalChange} 元`,
                    });
                } else if (consecutiveDown && recentData.length >= 5) {
                    const totalChange = recentData[0].price - recentData[recentData.length - 1].price;
                    result.push({
                        type: 'trend',
                        icon: <FallOutlined style={{ color: token.colorSuccess }} />,
                        title: '持续下跌',
                        content: `${item.point.shortName || item.point.name} 近 ${recentData.length} 日连续下跌，累计 -${totalChange} 元`,
                    });
                }
            }
        });

        // 3. 价差分析
        if (multiPointData.length >= 2) {
            const latestPrices = multiPointData
                .map((item) => ({
                    name: item.point.shortName || item.point.name,
                    price: item.data[item.data.length - 1]?.price || 0,
                }))
                .filter((p) => p.price > 0)
                .sort((a, b) => b.price - a.price);

            if (latestPrices.length >= 2) {
                const highest = latestPrices[0];
                const lowest = latestPrices[latestPrices.length - 1];
                const spread = highest.price - lowest.price;

                if (spread > 50) {
                    result.push({
                        type: 'info',
                        icon: <SwapOutlined style={{ color: token.colorInfo }} />,
                        title: '价差提示',
                        content: `${highest.name} 与 ${lowest.name} 价差达 ${spread} 元/吨，存在套利空间`,
                    });
                }
            }
        }

        // 4. 大幅波动检测
        multiPointData.forEach((item) => {
            const latest = item.data[item.data.length - 1];
            if (latest && latest.change && Math.abs(latest.change) >= 20) {
                result.push({
                    type: latest.change > 0 ? 'warning' : 'success',
                    icon: <ThunderboltOutlined style={{ color: latest.change > 0 ? token.colorError : token.colorSuccess }} />,
                    title: '大幅波动',
                    content: `${item.point.shortName || item.point.name} 今日${latest.change > 0 ? '上涨' : '下跌'} ${Math.abs(latest.change)} 元/吨`,
                });
            }
        });

        return result.slice(0, 5); // 最多显示5条
    }, [multiPointData, token]);

    if (insights.length === 0) {
        return null;
    }

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <BulbOutlined style={{ color: token.colorWarning }} />
                    <span>智能洞察</span>
                    <Tag color="gold">{insights.length}</Tag>
                </Flex>
            }
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
        >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {insights.map((insight, index) => (
                    <Alert
                        key={index}
                        type={insight.type === 'warning' ? 'warning' : insight.type === 'success' ? 'success' : 'info'}
                        showIcon
                        icon={insight.icon}
                        message={
                            <Flex justify="space-between" align="center">
                                <Text strong style={{ fontSize: 12 }}>{insight.title}</Text>
                            </Flex>
                        }
                        description={<Text style={{ fontSize: 12 }}>{insight.content}</Text>}
                        style={{ padding: '8px 12px' }}
                    />
                ))}
            </Space>
        </Card>
    );
};

export default InsightCards;
