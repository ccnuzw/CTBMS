import React from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, Badge, Progress } from 'antd';
import {
    DollarOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    StarOutlined,
    LinkOutlined,
    MoreOutlined,
    RiseOutlined,
    FallOutlined,
    AlertOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { IntelItem, ExtractedPricePoint } from '../../types';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

interface PriceAlertCardProps {
    intel: IntelItem;
    style?: React.CSSProperties;
    onClick?: () => void;
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    FIRST_LINE: { label: '一线采集', color: 'blue' },
    OFFICIAL_GOV: { label: '官方发布', color: 'green' },
    RESEARCH_INST: { label: '研究机构', color: 'purple' },
    MEDIA: { label: '媒体报道', color: 'orange' },
};

// 计算价格变动的统计信息
const getPriceStats = (pricePoints: ExtractedPricePoint[]) => {
    const changes = pricePoints.filter(p => p.change !== null && p.change !== 0);
    const ups = changes.filter(p => p.change! > 0);
    const downs = changes.filter(p => p.change! < 0);
    const maxUp = ups.length > 0 ? Math.max(...ups.map(p => p.change!)) : 0;
    const maxDown = downs.length > 0 ? Math.min(...downs.map(p => p.change!)) : 0;

    return {
        totalCount: pricePoints.length,
        upCount: ups.length,
        downCount: downs.length,
        maxUp,
        maxDown,
        isMainlyUp: ups.length > downs.length,
    };
};

export const PriceAlertCard: React.FC<PriceAlertCardProps> = ({
    intel,
    style,
    onClick,
}) => {
    const { token } = theme.useToken();
    const sourceInfo = SOURCE_TYPE_LABELS[intel.sourceType] || { label: '未知', color: 'default' };

    const pricePoints = intel.pricePoints || [];
    const stats = getPriceStats(pricePoints);

    // 根据涨跌情况确定边框颜色
    const borderColor = stats.isMainlyUp ? '#f5222d' : stats.downCount > 0 ? '#52c41a' : token.colorPrimary;

    return (
        <Card
            hoverable
            style={{
                ...style,
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: borderColor,
            }}
            bodyStyle={{ padding: 16 }}
            onClick={onClick}
        >
            {/* 头部: 标题 + 标签 */}
            <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                <Flex align="center" gap={8}>
                    <AlertOutlined style={{ color: borderColor, fontSize: 18 }} />
                    <Text strong style={{ fontSize: 15 }}>{intel.title || '价格异动'}</Text>
                    {intel.status === 'pending' && (
                        <Badge status="processing" text="待处理" />
                    )}
                </Flex>
                <Space>
                    <Tag color="volcano" bordered={false}>价格异动</Tag>
                    <Tag color={sourceInfo.color} bordered={false}>{sourceInfo.label}</Tag>
                </Space>
            </Flex>

            {/* 价格统计概览 */}
            <div style={{ marginBottom: 12, padding: 12, background: token.colorFillAlter, borderRadius: token.borderRadius }}>
                <Flex justify="space-between" align="center">
                    <Space size="large">
                        <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>采集点</Text>
                            <Text strong style={{ fontSize: 18 }}>{stats.totalCount}</Text>
                        </div>
                        <Divider type="vertical" style={{ height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                <RiseOutlined style={{ color: '#f5222d' }} /> 上涨
                            </Text>
                            <Text strong style={{ fontSize: 18, color: '#f5222d' }}>{stats.upCount}</Text>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                <FallOutlined style={{ color: '#52c41a' }} /> 下跌
                            </Text>
                            <Text strong style={{ fontSize: 18, color: '#52c41a' }}>{stats.downCount}</Text>
                        </div>
                    </Space>
                    <div style={{ textAlign: 'right' }}>
                        {stats.maxUp > 0 && (
                            <Text style={{ fontSize: 12, color: '#f5222d', display: 'block' }}>
                                最大涨幅 +{stats.maxUp}
                            </Text>
                        )}
                        {stats.maxDown < 0 && (
                            <Text style={{ fontSize: 12, color: '#52c41a', display: 'block' }}>
                                最大跌幅 {stats.maxDown}
                            </Text>
                        )}
                    </div>
                </Flex>
            </div>

            {/* 元信息 */}
            <Flex gap={16} style={{ marginBottom: 12, fontSize: 12, color: token.colorTextSecondary }}>
                <Flex align="center" gap={4}>
                    <ClockCircleOutlined />
                    <span>{dayjs(intel.createdAt).fromNow()}</span>
                </Flex>
                {intel.location && (
                    <Flex align="center" gap={4}>
                        <EnvironmentOutlined />
                        <span>{intel.location}</span>
                    </Flex>
                )}
                {intel.confidence && (
                    <Flex align="center" gap={4}>
                        <span>AI可信度</span>
                        <Tag
                            color={intel.confidence >= 80 ? 'green' : intel.confidence >= 60 ? 'orange' : 'red'}
                            style={{ margin: 0 }}
                        >
                            {intel.confidence}%
                        </Tag>
                    </Flex>
                )}
            </Flex>

            {/* 价格变动详情 */}
            <div style={{ marginBottom: 12 }}>
                <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                    <DollarOutlined style={{ color: token.colorPrimary }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>价格明细</Text>
                </Flex>
                <Space wrap size={[8, 8]}>
                    {pricePoints.slice(0, 8).map((pp, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '6px 10px',
                                background: pp.change && pp.change > 0
                                    ? 'rgba(245, 34, 45, 0.1)'
                                    : pp.change && pp.change < 0
                                        ? 'rgba(82, 196, 66, 0.1)'
                                        : token.colorFillQuaternary,
                                borderRadius: token.borderRadius,
                                border: `1px solid ${pp.change && pp.change > 0
                                    ? 'rgba(245, 34, 45, 0.3)'
                                    : pp.change && pp.change < 0
                                        ? 'rgba(82, 196, 66, 0.3)'
                                        : token.colorBorder}`,
                            }}
                        >
                            <Text style={{ fontSize: 12, display: 'block' }}>{pp.location}</Text>
                            <Flex align="baseline" gap={4}>
                                <Text strong style={{ fontSize: 14 }}>{pp.price}</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>{pp.unit || '元/吨'}</Text>
                                {pp.change !== null && pp.change !== 0 && (
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            color: pp.change > 0 ? '#f5222d' : '#52c41a',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {pp.change > 0 ? '+' : ''}{pp.change}
                                    </Text>
                                )}
                            </Flex>
                            {pp.note && (
                                <Text type="secondary" style={{ fontSize: 10 }}>{pp.note}</Text>
                            )}
                        </div>
                    ))}
                    {pricePoints.length > 8 && (
                        <div
                            style={{
                                padding: '6px 10px',
                                background: token.colorFillQuaternary,
                                borderRadius: token.borderRadius,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                +{pricePoints.length - 8} 更多
                            </Text>
                        </div>
                    )}
                </Space>
            </div>

            {/* 摘要 */}
            {intel.summary && (
                <Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ marginBottom: 12, color: token.colorTextSecondary, fontSize: 13 }}
                >
                    {intel.summary}
                </Paragraph>
            )}

            <Divider style={{ margin: '12px 0' }} />

            {/* 操作栏 */}
            <Flex justify="space-between" align="center">
                <Space>
                    <Button type="link" size="small" icon={<EyeOutlined />} style={{ padding: 0 }}>
                        查看详情
                    </Button>
                    <Button type="link" size="small" icon={<LinkOutlined />} style={{ padding: 0 }}>
                        历史对比
                    </Button>
                </Space>
                <Space>
                    <Tooltip title="标记重要">
                        <Button type="text" size="small" icon={<StarOutlined />} />
                    </Tooltip>
                    <Tooltip title="更多操作">
                        <Button type="text" size="small" icon={<MoreOutlined />} />
                    </Tooltip>
                </Space>
            </Flex>
        </Card>
    );
};
