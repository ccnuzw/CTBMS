import React from 'react';
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { IntelItem } from '../../types';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text, Paragraph } = Typography;

interface DailyReportCardProps {
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

export const DailyReportCard: React.FC<DailyReportCardProps> = ({
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
                borderLeft: `3px solid ${token.colorPrimary}`,
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
