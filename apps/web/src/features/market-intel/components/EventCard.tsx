import React from 'react';
import { Card, Flex, Typography, Tag, theme, Tooltip, Button } from 'antd';
import {
    ClockCircleOutlined,
    EnvironmentOutlined,
    ArrowRightOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
    RiseOutlined,
    FallOutlined,
    MinusOutlined,
} from '@ant-design/icons';
import { MarketEventResponse } from '../api/hooks';

const { Text, Paragraph } = Typography;

interface EventCardProps {
    event: MarketEventResponse;
    variant?: 'compact' | 'full';
    onClick?: () => void;
    onViewSource?: () => void;
    className?: string;
    style?: React.CSSProperties;
}

export const EventCard: React.FC<EventCardProps> = ({
    event,
    variant = 'full',
    onClick,
    onViewSource,
    className,
    style,
}) => {
    const { token } = theme.useToken();

    if (!event) return null;

    // 情绪配置
    const getSentimentConfig = (sentiment: string | null) => {
        switch (sentiment?.toLowerCase()) {
            case 'positive':
                return { color: token.colorSuccess, bg: token.colorSuccessBg, icon: <RiseOutlined />, label: '利好' };
            case 'negative':
                return { color: token.colorError, bg: token.colorErrorBg, icon: <FallOutlined />, label: '利空' };
            default:
                return { color: token.colorTextSecondary, bg: token.colorBgTextHover, icon: <MinusOutlined />, label: '中性' };
        }
    };

    // 影响等级配置
    const getImpactLevelConfig = (level: string | null) => {
        switch (level?.toLowerCase()) {
            case 'high':
                return { color: token.colorError, label: '高影响' };
            case 'medium':
                return { color: token.colorWarning, label: '中影响' };
            case 'low':
                return { color: token.colorTextSecondary, label: '低影响' };
            default:
                return { color: token.colorTextQuaternary, label: '未知' };
        }
    };

    const sentimentConfig = getSentimentConfig(event.sentiment);
    const impactConfig = getImpactLevelConfig(event.impactLevel);

    // 渲染头部
    const renderHeader = () => (
        <Flex justify="space-between" align="start" style={{ marginBottom: 8 }}>
            <Flex gap={8} align="center">
                {/* 事件类型图标（如果有） */}
                {event.eventType.icon ? (
                    <div
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: event.eventType.color ? `${event.eventType.color}20` : token.colorPrimaryBg,
                            color: event.eventType.color || token.colorPrimary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                        }}
                    >
                        {/* 这里通常需要一个图标映射，简单起见显示首字或默认图标 */}
                        <ThunderboltOutlined />
                    </div>
                ) : (
                    <ThunderboltOutlined style={{ color: token.colorPrimary }} />
                )}
                <Text strong>{event.eventType.name}</Text>
                {event.eventDate && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(event.eventDate).toLocaleDateString()}
                    </Text>
                )}
            </Flex>
            <Tag
                bordered={false}
                color={sentimentConfig.bg}
                style={{ color: sentimentConfig.color, margin: 0 }}
            >
                <Flex align="center" gap={4}>
                    {sentimentConfig.icon}
                    {sentimentConfig.label}
                </Flex>
            </Tag>
        </Flex>
    );

    // 渲染紧凑视图
    if (variant === 'compact') {
        return (
            <Card
                size="small"
                hoverable={!!onClick}
                onClick={onClick}
                className={className}
                style={{ ...style, borderLeft: `3px solid ${sentimentConfig.color}` }}
                bodyStyle={{ padding: 12 }}
            >
                {renderHeader()}
                <Flex align="center" gap={8} style={{ fontSize: 13 }}>
                    <Text strong>{event.subject}</Text>
                    <Text type="secondary"><ArrowRightOutlined style={{ fontSize: 10 }} /></Text>
                    <Text>{event.action}</Text>
                </Flex>
                {event.impact && (
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }} ellipsis>
                        影响: {event.impact}
                    </Text>
                )}
            </Card>
        );
    }

    // 渲染完整视图
    return (
        <Card
            hoverable={!!onClick}
            onClick={onClick}
            className={className}
            style={{ ...style, borderLeft: `4px solid ${sentimentConfig.color}` }}
            bodyStyle={{ padding: 16 }}
        >
            {renderHeader()}

            {/* 核心三元组 */}
            <div
                style={{
                    background: token.colorBgLayout,
                    padding: 12,
                    borderRadius: token.borderRadius,
                    marginBottom: 12,
                }}
            >
                <Flex align="center" wrap="wrap" gap={8}>
                    <Text strong style={{ fontSize: 15 }}>{event.subject}</Text>
                    <Tag color="blue" style={{ margin: 0 }}>{event.action}</Tag>
                </Flex>
                <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                        {event.content}
                    </Text>
                </div>
            </div>

            {/* 影响评估 */}
            {event.impact && (
                <div style={{ marginBottom: 12 }}>
                    <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 12 }}>影响评估</Text>
                        <Tag style={{ fontSize: 10, lineHeight: '18px' }} color={impactConfig.color || 'default'}>
                            {impactConfig.label}
                        </Tag>
                    </Flex>
                    <Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }}>
                        {event.impact}
                    </Paragraph>
                </div>
            )}

            {/* 底部元数据 */}
            <Flex justify="space-between" align="center" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${token.colorSplit}` }}>
                <Flex gap={12}>
                    {event.commodity && (
                        <Tag style={{ margin: 0, fontSize: 11 }}>{event.commodity}</Tag>
                    )}
                    {(event.regionCode || event.intel?.location) && (
                        <Flex align="center" gap={4}>
                            <EnvironmentOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {event.intel?.location || '未知区域'}
                            </Text>
                        </Flex>
                    )}
                </Flex>

                <Flex gap={8}>
                    <Tooltip title="查看原文">
                        <Button
                            type="text"
                            size="small"
                            icon={<FileTextOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewSource?.();
                            }}
                        />
                    </Tooltip>
                    <Flex align="center" gap={4}>
                        <ClockCircleOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </Flex>
                </Flex>
            </Flex>
        </Card>
    );
};
