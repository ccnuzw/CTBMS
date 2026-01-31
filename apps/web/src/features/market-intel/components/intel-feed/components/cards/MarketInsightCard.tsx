import React from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, Badge } from 'antd';
import {
    BulbOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    StarOutlined,
    LinkOutlined,
    MoreOutlined,
    HeartOutlined,
    FundOutlined,
    RiseOutlined,
    FallOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { IntelItem, Insight } from '../../types';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

interface MarketInsightCardProps {
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

// 市场心态常量
const SENTIMENT_LABELS: Record<string, string> = {
    bullish: '看涨',
    bearish: '看跌',
    neutral: '中性',
    mixed: '分歧',
};

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment) {
        case 'bullish': return '#f5222d';
        case 'bearish': return '#52c41a';
        case 'neutral': return '#1890ff';
        case 'mixed': return '#faad14';
        default: return '#1890ff';
    }
};

// 洞察方向图标
const getDirectionIcon = (direction?: string) => {
    switch (direction) {
        case 'Bullish': return <RiseOutlined style={{ color: '#f5222d' }} />;
        case 'Bearish': return <FallOutlined style={{ color: '#52c41a' }} />;
        default: return null;
    }
};

const getDirectionColor = (direction?: string): string => {
    switch (direction) {
        case 'Bullish': return 'red';
        case 'Bearish': return 'green';
        case 'Neutral': return 'blue';
        default: return 'default';
    }
};

// 风险等级常量
const RISK_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };
const RISK_COLORS: Record<string, string> = { low: 'green', medium: 'orange', high: 'red' };

export const MarketInsightCard: React.FC<MarketInsightCardProps> = ({
    intel,
    style,
    onClick,
}) => {
    const { token } = theme.useToken();
    const sourceInfo = SOURCE_TYPE_LABELS[intel.sourceType] || { label: '未知', color: 'default' };

    return (
        <Card
            hoverable
            style={{
                ...style,
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: '#722ed1', // 紫色标识洞察类
            }}
            bodyStyle={{ padding: 16 }}
            onClick={onClick}
        >
            {/* 头部: 标题 + 标签 */}
            <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                <Flex align="center" gap={8}>
                    <BulbOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                    <Text strong style={{ fontSize: 15 }}>{intel.title || '市场洞察'}</Text>
                    {intel.status === 'pending' && (
                        <Badge status="processing" text="待处理" />
                    )}
                </Flex>
                <Space>
                    <Tag color="purple" bordered={false}>洞察分析</Tag>
                    <Tag color={sourceInfo.color} bordered={false}>{sourceInfo.label}</Tag>
                </Space>
            </Flex>

            {/* 上报人信息 */}
            {intel.author && (
                <Flex align="center" gap={8} style={{ marginBottom: 8, padding: '4px 8px', background: token.colorFillAlter, borderRadius: 4, width: 'fit-content' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>上报人:</Text>
                    <Flex align="center" gap={4}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#722ed1', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {intel.author.name[0]}
                        </div>
                        <Text style={{ fontSize: 12 }}>{intel.author.name}</Text>
                        {intel.author.organizationName && (
                            <>
                                <Divider type="vertical" style={{ margin: '0 4px', borderColor: 'rgba(0,0,0,0.1)' }} />
                                <Text type="secondary" style={{ fontSize: 11 }}>{intel.author.organizationName}</Text>
                            </>
                        )}
                    </Flex>
                </Flex>
            )}

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

            {/* 洞察列表（核心展示） */}
            {intel.insights && intel.insights.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    {intel.insights.map((insight: Insight, idx: number) => (
                        <div
                            key={idx}
                            style={{
                                marginBottom: 8,
                                padding: 12,
                                background: token.colorFillQuaternary,
                                borderRadius: token.borderRadius,
                                borderLeft: `3px solid ${getDirectionColor(insight.direction) === 'red' ? '#f5222d' : getDirectionColor(insight.direction) === 'green' ? '#52c41a' : '#1890ff'}`,
                            }}
                        >
                            <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                                {getDirectionIcon(insight.direction)}
                                <Text strong style={{ fontSize: 13 }}>{insight.title}</Text>
                                {insight.direction && (
                                    <Tag color={getDirectionColor(insight.direction)} style={{ margin: 0 }}>
                                        {insight.direction === 'Bullish' ? '看涨' : insight.direction === 'Bearish' ? '看跌' : '中性'}
                                    </Tag>
                                )}
                                {insight.confidence && (
                                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                                        置信度 {insight.confidence}%
                                    </Text>
                                )}
                            </Flex>
                            <Text style={{ fontSize: 13 }}>{insight.content}</Text>
                            {insight.factors && insight.factors.length > 0 && (
                                <Flex gap={4} wrap="wrap" style={{ marginTop: 6 }}>
                                    {insight.factors.map((factor, fIdx) => (
                                        <Tag key={fIdx} style={{ fontSize: 11 }}>{factor}</Tag>
                                    ))}
                                </Flex>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 市场心态区块 */}
            {intel.marketSentiment && (
                <div style={{ marginBottom: 12, padding: 10, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                        <HeartOutlined style={{ color: getSentimentColor(intel.marketSentiment.overall) }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>市场心态</Text>
                        <Tag color={getSentimentColor(intel.marketSentiment.overall)} style={{ margin: 0 }}>
                            {SENTIMENT_LABELS[intel.marketSentiment.overall] || intel.marketSentiment.overall}
                        </Tag>
                        {intel.marketSentiment.score !== undefined && (
                            <Text style={{ fontSize: 12 }}>情绪值: {intel.marketSentiment.score}</Text>
                        )}
                    </Flex>
                    {intel.marketSentiment.summary && (
                        <Text style={{ fontSize: 13 }}>{intel.marketSentiment.summary}</Text>
                    )}
                </div>
            )}

            {/* 后市预判 */}
            {intel.forecast && (
                <div style={{ marginBottom: 12, padding: 10, background: token.colorInfoBg, borderRadius: token.borderRadius }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                        <FundOutlined style={{ color: token.colorInfo }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>后市预判</Text>
                        {intel.forecast.riskLevel && (
                            <Tag color={RISK_COLORS[intel.forecast.riskLevel]} style={{ margin: 0 }}>
                                风险: {RISK_LABELS[intel.forecast.riskLevel]}
                            </Tag>
                        )}
                    </Flex>
                    {intel.forecast.shortTerm && (
                        <Text style={{ fontSize: 13, display: 'block' }}>短期: {intel.forecast.shortTerm}</Text>
                    )}
                    {intel.forecast.mediumTerm && (
                        <Text style={{ fontSize: 13, display: 'block' }}>中期: {intel.forecast.mediumTerm}</Text>
                    )}
                </div>
            )}

            <Divider style={{ margin: '12px 0' }} />

            {/* 操作栏 */}
            <Flex justify="space-between" align="center">
                <Space>
                    <Button type="link" size="small" icon={<EyeOutlined />} style={{ padding: 0 }}>
                        查看详情
                    </Button>
                    <Button type="link" size="small" icon={<LinkOutlined />} style={{ padding: 0 }}>
                        关联分析
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
