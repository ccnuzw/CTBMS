import React, { useMemo } from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, Badge } from 'antd';
import {
    FileTextOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    ThunderboltOutlined,
    BulbOutlined,
    EyeOutlined,
    StarOutlined,
    LinkOutlined,
    MoreOutlined,
    HeartOutlined,
    DollarOutlined,
    FundOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { IntelItem } from '../../types';
import { useDictionaries } from '@/hooks/useDictionaries';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

interface DailyReportCardProps {
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
    INTERNAL_REPORT: { label: '内部研报', color: 'geekblue' },
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

const FALLBACK_RISK_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };
const FALLBACK_RISK_COLORS: Record<string, string> = { low: 'green', medium: 'orange', high: 'red' };

export const DailyReportCard: React.FC<DailyReportCardProps> = ({
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
            const color = (item.meta as { color?: string } | null)?.color
                || FALLBACK_SOURCE_TYPE_META[item.code]?.color
                || 'default';
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

    const sentimentColor = sentimentMeta.colors[intel.marketSentiment?.overall || ''] || '#1890ff';
    const sentimentLabel = sentimentMeta.labels[intel.marketSentiment?.overall || ''] || intel.marketSentiment?.overall || '未知';
    const sourceInfo = sourceTypeMeta[intel.sourceType] || { label: '未知', color: 'default' };

    return (
        <Card
            hoverable
            style={{
                ...style,
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: token.colorPrimary,
            }}
            bodyStyle={{ padding: 16 }}
            onClick={onClick}
        >
            {/* 头部: 标题 + 标签 */}
            <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                <Flex align="center" gap={8}>
                    <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                    <Text strong style={{ fontSize: 15 }}>{intel.title}</Text>
                    {intel.status === 'pending' && (
                        <Badge status="processing" text="待处理" />
                    )}
                </Flex>
                <Space>
                    <Tag color={sourceInfo.color} bordered={false}>{sourceInfo.label}</Tag>
                    {intel.collectionPointName && (
                        <Tag bordered={false}>{intel.collectionPointName}</Tag>
                    )}
                </Space>
            </Flex>

            {/* 上报人信息 (新增) */}
            {intel.author && (
                <Flex align="center" gap={8} style={{ marginBottom: 8, padding: '4px 8px', background: token.colorFillAlter, borderRadius: 4, width: 'fit-content' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>上报人:</Text>
                    <Flex align="center" gap={4}>
                        {/* Simple avatar placeholder if no image */}
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: token.colorPrimary, color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

            {/* 摘要 */}
            <Paragraph
                ellipsis={{ rows: 2 }}
                style={{ marginBottom: 12, color: token.colorText }}
            >
                {intel.summary}
            </Paragraph>

            {/* 事件提取 */}
            {intel.events && intel.events.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                        <ThunderboltOutlined style={{ color: '#faad14' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>事件摘要</Text>
                    </Flex>
                    <Space wrap>
                        {intel.events.map((event: any, idx: number) => (
                            <Tag key={idx} color="blue" bordered={false}>
                                {event.type}: {event.commodity} {event.change > 0 ? '+' : ''}{event.change}元
                            </Tag>
                        ))}
                    </Space>
                </div>
            )}

            {/* AI洞察 */}
            {intel.insights && intel.insights.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                        <BulbOutlined style={{ color: '#722ed1' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>AI洞察</Text>
                    </Flex>
                    {intel.insights.map((insight: any, idx: number) => (
                        <Text key={idx} style={{ fontSize: 13 }}>
                            <strong>{insight.title}</strong>: {insight.content}
                        </Text>
                    ))}
                </div>
            )}

            {/* 市场心态区块 (新增) */}
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

            {/* 价格变动摘要 (新增) */}
            {intel.pricePoints && intel.pricePoints.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                        <DollarOutlined style={{ color: token.colorPrimary }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>价格变动</Text>
                    </Flex>
                    <Space wrap>
                        {intel.pricePoints.slice(0, 5).map((pp, idx) => (
                            <Tag
                                key={idx}
                                color={pp.change && pp.change > 0 ? 'red' : pp.change && pp.change < 0 ? 'green' : 'default'}
                            >
                                {pp.location}: {pp.price}{pp.unit || '元'}
                                {pp.change !== null && pp.change !== 0 && (
                                    <span>({pp.change > 0 ? '+' : ''}{pp.change})</span>
                                )}
                            </Tag>
                        ))}
                        {intel.pricePoints.length > 5 && (
                            <Tag>+{intel.pricePoints.length - 5} 更多</Tag>
                        )}
                    </Space>
                </div>
            )}

            {/* 后市预判 (新增) */}
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
                        查看原文
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
