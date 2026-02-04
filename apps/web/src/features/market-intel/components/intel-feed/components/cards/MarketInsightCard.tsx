import React, { useMemo } from 'react';
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
import { useDictionaries } from '@/hooks/useDictionaries';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

interface MarketInsightCardProps {
    intel: IntelItem;
    style?: React.CSSProperties;
    onClick?: () => void;
}

const FALLBACK_SOURCE_TYPE_META: Record<string, { label: string; color: string }> = {
    FIRST_LINE: { label: '一线采集', color: 'blue' },
    COMPETITOR: { label: '竞对情报', color: 'volcano' },
    OFFICIAL_GOV: { label: '官方发布', color: 'green' },
    OFFICIAL: { label: '官方发布', color: 'green' },
    RESEARCH_INST: { label: '研究机构', color: 'purple' },
    MEDIA: { label: '媒体报道', color: 'orange' },
};

const FALLBACK_SENTIMENT_LABELS: Record<string, string> = {
    bullish: '看涨',
    bearish: '看跌',
    neutral: '中性',
    mixed: '分歧',
};

const FALLBACK_SENTIMENT_COLORS: Record<string, string> = {
    bullish: '#f5222d',
    bearish: '#52c41a',
    neutral: '#1890ff',
    mixed: '#faad14',
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

const FALLBACK_RISK_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };
const FALLBACK_RISK_COLORS: Record<string, string> = { low: 'green', medium: 'orange', high: 'red' };

export const MarketInsightCard: React.FC<MarketInsightCardProps> = ({
    intel,
    style,
    onClick,
}) => {
    const { token } = theme.useToken();
    const { data: dictionaries } = useDictionaries(['INTEL_SOURCE_TYPE', 'MARKET_SENTIMENT', 'RISK_LEVEL']);

    const sourceTypeMeta = useMemo(() => {
        const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return FALLBACK_SOURCE_TYPE_META;
        return items.reduce<Record<string, { label: string; color: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color || FALLBACK_SOURCE_TYPE_META[item.code]?.color || 'default';
            acc[item.code] = { label: item.label, color };
            return acc;
        }, { ...FALLBACK_SOURCE_TYPE_META });
    }, [dictionaries]);

    const sentimentMeta = useMemo(() => {
        const items = dictionaries?.MARKET_SENTIMENT?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return {
                labels: FALLBACK_SENTIMENT_LABELS,
                colors: FALLBACK_SENTIMENT_COLORS,
            };
        }
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || FALLBACK_SENTIMENT_COLORS[item.code] || '#1890ff';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    const riskMeta = useMemo(() => {
        const items = dictionaries?.RISK_LEVEL?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return {
                labels: FALLBACK_RISK_LABELS,
                colors: FALLBACK_RISK_COLORS,
            };
        }
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || FALLBACK_RISK_COLORS[item.code] || 'default';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    const sourceInfo = sourceTypeMeta[intel.sourceType] || { label: '未知', color: 'default' };
    const sentimentColor = sentimentMeta.colors[intel.marketSentiment?.overall || ''] || '#1890ff';
    const sentimentLabel = sentimentMeta.labels[intel.marketSentiment?.overall || ''] || intel.marketSentiment?.overall || '未知';

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
                        <HeartOutlined style={{ color: sentimentColor }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>市场心态</Text>
                        <Tag color={sentimentColor} style={{ margin: 0 }}>
                            {sentimentLabel}
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
                            <Tag color={riskMeta.colors[intel.forecast.riskLevel] || 'default'} style={{ margin: 0 }}>
                                风险: {riskMeta.labels[intel.forecast.riskLevel] || intel.forecast.riskLevel}
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
