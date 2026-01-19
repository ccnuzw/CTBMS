import React, { useMemo } from 'react';
import { Card, Flex, Typography, Tag, Progress, Empty, List, theme, Tooltip } from 'antd';
import {
    RiseOutlined,
    FallOutlined,
    MinusOutlined,
    BulbOutlined,
    AimOutlined,
    BarChartOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import { MarketInsightResponse } from '../api/hooks';

const { Text, Paragraph, Title } = Typography;

interface InsightPanelProps {
    insights: MarketInsightResponse[];
    loading?: boolean;
    onInsightClick?: (insight: MarketInsightResponse) => void;
}

export const InsightPanel: React.FC<InsightPanelProps> = ({
    insights,
    loading = false,
    onInsightClick,
}) => {
    const { token } = theme.useToken();

    // 市场方向配置
    const getDirectionConfig = (direction: string | null) => {
        switch (direction?.toLowerCase()) {
            case 'bullish':
                return { color: token.colorSuccess, icon: <RiseOutlined />, label: '看涨' };
            case 'bearish':
                return { color: token.colorError, icon: <FallOutlined />, label: '看跌' };
            case 'neutral':
                return { color: token.colorTextSecondary, icon: <MinusOutlined />, label: '震荡' };
            default:
                return { color: token.colorTextQuaternary, icon: <MinusOutlined />, label: '未知' };
        }
    };

    // 时间周期映射
    const getTimeframeLabel = (timeframe: string | null) => {
        const map: Record<string, string> = {
            SHORT_TERM: '短期 (1周)',
            MEDIUM_TERM: '中期 (1月)',
            LONG_TERM: '长期 (1季)',
        };
        return timeframe ? map[timeframe] || timeframe : '未指定';
    };

    // 分组洞察
    const groupedInsights = useMemo(() => {
        const groups: Record<string, MarketInsightResponse[]> = {
            FORECAST: [],
            ANALYSIS: [],
            DISCOVERY: [],
        };

        insights.forEach(insight => {
            // 简单映射，实际应根据 insightType.category
            const cat = insight.insightType.category || 'ANALYSIS';
            if (groups[cat]) groups[cat].push(insight);
            else {
                if (!groups['OTHER']) groups['OTHER'] = [];
                groups['OTHER'].push(insight);
            }
        });
        return groups;
    }, [insights]);

    const renderInsightCard = (insight: MarketInsightResponse) => {
        const dirConfig = getDirectionConfig(insight.direction);

        return (
            <Card
                key={insight.id}
                hoverable
                onClick={() => onInsightClick?.(insight)}
                style={{ marginBottom: 16, borderColor: token.colorBorderSecondary }}
                bodyStyle={{ padding: 16 }}
            >
                {/* 头部：标题与置信度 */}
                <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                    <Flex vertical flex={1} style={{ marginRight: 16 }}>
                        <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
                            {insight.insightType.icon && (
                                <Text style={{ fontSize: 16 }}>{/* 动态图标占位 */}</Text>
                            )}
                            <Text strong style={{ fontSize: 15 }}>{insight.title}</Text>
                        </Flex>
                        <Flex gap={8} align="center">
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {new Date(insight.createdAt).toLocaleDateString()}
                            </Text>
                            {insight.commodity && (
                                <Tag bordered={false} style={{ margin: 0, fontSize: 11 }}>
                                    {insight.commodity}
                                </Tag>
                            )}
                        </Flex>
                    </Flex>

                    {insight.confidence && (
                        <Tooltip title={`置信度: ${insight.confidence}%`}>
                            <Flex vertical align="end" style={{ width: 80 }}>
                                <Progress
                                    percent={insight.confidence}
                                    steps={5}
                                    size="small"
                                    strokeColor={token.colorPrimary}
                                    showInfo={false}
                                />
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    {insight.confidence}% 可信
                                </Text>
                            </Flex>
                        </Tooltip>
                    )}
                </Flex>

                {/* 内容摘要 */}
                <Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 12 }}
                >
                    {insight.content}
                </Paragraph>

                {/* 底部：方向与因素 */}
                <Flex justify="space-between" align="center" style={{ paddingTop: 12, borderTop: `1px solid ${token.colorSplit}` }}>
                    <Flex gap={8} align="center">
                        {insight.direction && (
                            <Tag
                                color={dirConfig.color}
                                style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                {dirConfig.icon}
                                {dirConfig.label}
                            </Tag>
                        )}
                        {insight.timeframe && (
                            <Tag style={{ margin: 0 }}>
                                {getTimeframeLabel(insight.timeframe)}
                            </Tag>
                        )}
                    </Flex>

                    {/* 因素标签缩略 */}
                    <Flex gap={4}>
                        {(insight.factors || []).slice(0, 2).map((factor, idx) => (
                            <Text key={idx} type="secondary" style={{ fontSize: 11, background: token.colorBgLayout, padding: '2px 6px', borderRadius: 4 }}>
                                #{factor}
                            </Text>
                        ))}
                    </Flex>
                </Flex>
            </Card>
        );
    };

    if (!loading && insights.length === 0) {
        return <Empty description="暂无市场洞察" style={{ padding: 40 }} />;
    }

    return (
        <div style={{ padding: 12 }}>
            {/* 后市预判区 */}
            {groupedInsights['FORECAST']?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                        <AimOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                        <Title level={5} style={{ margin: 0 }}>后市预判 (Forecast)</Title>
                    </Flex>
                    {groupedInsights['FORECAST'].map(renderInsightCard)}
                </div>
            )}

            {/* 心态分析区 */}
            {groupedInsights['ANALYSIS']?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                        <BulbOutlined style={{ fontSize: 18, color: token.colorWarning }} />
                        <Title level={5} style={{ margin: 0 }}>心态分析 (Analysis)</Title>
                    </Flex>
                    {groupedInsights['ANALYSIS'].map(renderInsightCard)}
                </div>
            )}

            {/* 数据发现区 */}
            {groupedInsights['DISCOVERY']?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                        <BarChartOutlined style={{ fontSize: 18, color: token.colorSuccess }} />
                        <Title level={5} style={{ margin: 0 }}>数据发现 (Discovery)</Title>
                    </Flex>
                    {groupedInsights['DISCOVERY'].map(renderInsightCard)}
                </div>
            )}

            {/* 其他 */}
            {groupedInsights['OTHER']?.length > 0 && (
                <div>
                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                        <Text strong>其他洞察</Text>
                    </Flex>
                    {groupedInsights['OTHER'].map(renderInsightCard)}
                </div>
            )}
        </div>
    );
};
