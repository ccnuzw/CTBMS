import React from 'react';
import { Drawer, Card, Typography, Flex, Tag, Divider, Empty, Spin, theme } from 'antd';
import {
    CalendarOutlined,
    EnvironmentOutlined,
    TagOutlined,
    BulbOutlined,
    LinkOutlined,
    LineChartOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useRelatedContent } from '../api/hooks';

const { Title, Text, Paragraph } = Typography;

export interface SearchResultItem {
    id: string;
    category: string;
    rawContent: string;
    effectiveTime: string;
    location?: string;
    region?: string[];
    sourceType?: string;
    aiAnalysis?: {
        summary?: string;
        sentiment?: 'positive' | 'negative' | 'neutral';
        tags?: string[];
        entities?: string[];
    };
    author?: {
        name?: string;
    };
}

interface SearchResultDetailProps {
    open: boolean;
    onClose: () => void;
    item: SearchResultItem | null;
    highlightKeywords?: (text: string, keywords: string) => React.ReactNode;
    keywords?: string;
}

export const SearchResultDetail: React.FC<SearchResultDetailProps> = ({
    open,
    onClose,
    item,
    highlightKeywords,
    keywords = '',
}) => {
    const { token } = theme.useToken();

    // 获取关联内容
    const { data: relatedContent, isLoading: isLoadingRelated } = useRelatedContent(
        {
            intelId: item?.id,
            tags: item?.aiAnalysis?.tags,
            limit: 5,
        },
        { enabled: open && !!item }
    );

    if (!item) return null;

    const sentiment = item.aiAnalysis?.sentiment;
    const sentimentColor = sentiment === 'positive' ? token.colorSuccess :
        sentiment === 'negative' ? token.colorError : token.colorTextSecondary;
    const sentimentLabel = sentiment === 'positive' ? '利好' :
        sentiment === 'negative' ? '利空' : '中性';

    const renderText = (text: string) => {
        return highlightKeywords ? highlightKeywords(text, keywords) : text;
    };

    return (
        <Drawer
            title={
                <Flex align="center" gap={8}>
                    {item.category === 'C_DOCUMENT' ? (
                        <FileTextOutlined style={{ color: token.colorWarning }} />
                    ) : (
                        <ThunderboltOutlined style={{ color: token.colorPrimary }} />
                    )}
                    <span>详情</span>
                    {sentiment && (
                        <Tag color={sentimentColor} style={{ marginLeft: 8 }}>{sentimentLabel}</Tag>
                    )}
                </Flex>
            }
            placement="right"
            width={560}
            open={open}
            onClose={onClose}
        >
            {/* 基本信息 */}
            <Flex gap={16} wrap="wrap" style={{ marginBottom: 16 }}>
                <Text type="secondary">
                    <CalendarOutlined style={{ marginRight: 4 }} />
                    {new Date(item.effectiveTime).toLocaleDateString('zh-CN')}
                </Text>
                {item.location && (
                    <Text type="secondary">
                        <EnvironmentOutlined style={{ marginRight: 4 }} />
                        {item.location}
                    </Text>
                )}
                {item.author?.name && (
                    <Text type="secondary">来源：{item.author.name}</Text>
                )}
            </Flex>

            {/* AI 分析摘要 */}
            {item.aiAnalysis?.summary && (
                <Card
                    size="small"
                    style={{
                        background: `${token.colorPrimary}08`,
                        marginBottom: 16,
                        borderColor: `${token.colorPrimary}20`,
                    }}
                >
                    <Flex gap={8}>
                        <BulbOutlined style={{ color: token.colorPrimary, flexShrink: 0 }} />
                        <div>
                            <Text strong style={{ display: 'block', marginBottom: 4, color: token.colorPrimary }}>
                                AI 摘要
                            </Text>
                            <Text>{renderText(item.aiAnalysis.summary)}</Text>
                        </div>
                    </Flex>
                </Card>
            )}

            {/* 标签 */}
            {item.aiAnalysis?.tags && item.aiAnalysis.tags.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        <TagOutlined style={{ marginRight: 4 }} />相关标签
                    </Text>
                    <Flex gap={4} wrap="wrap">
                        {item.aiAnalysis.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                        ))}
                    </Flex>
                </div>
            )}

            {/* 原始内容 */}
            <Divider style={{ margin: '16px 0' }}>原文内容</Divider>
            <Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                {renderText(item.rawContent)}
            </Paragraph>

            {/* 关联内容 */}
            <Divider style={{ margin: '24px 0 16px' }}>
                <LinkOutlined style={{ marginRight: 4 }} />关联内容
            </Divider>
            {isLoadingRelated ? (
                <Flex justify="center" style={{ padding: 24 }}>
                    <Spin tip="加载关联内容..." />
                </Flex>
            ) : (
                <>
                    {/* 相关情报 */}
                    {relatedContent?.relatedIntels && relatedContent.relatedIntels.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                <ThunderboltOutlined style={{ marginRight: 4, color: token.colorPrimary }} />
                                相关情报 ({relatedContent.relatedIntels.length})
                            </Text>
                            {relatedContent.relatedIntels.slice(0, 3).map((intel: { id: string; summary?: string | null; rawContent?: string; effectiveTime: string }) => (
                                <Card key={intel.id} size="small" hoverable style={{ marginBottom: 8 }}>
                                    <Text ellipsis style={{ display: 'block' }}>
                                        {intel.summary || intel.rawContent?.substring(0, 60)}...
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        {new Date(intel.effectiveTime).toLocaleDateString()}
                                    </Text>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* 相关价格 */}
                    {relatedContent?.relatedPrices && relatedContent.relatedPrices.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                <LineChartOutlined style={{ marginRight: 4, color: token.colorSuccess }} />
                                相关价格 ({relatedContent.relatedPrices.length})
                            </Text>
                            <Flex gap={8} wrap="wrap">
                                {relatedContent.relatedPrices.slice(0, 4).map((price: { id: string; location: string; commodity: string; price: number }) => (
                                    <Tag key={price.id} color="green">
                                        {price.location} · {price.commodity}: ¥{price.price}
                                    </Tag>
                                ))}
                            </Flex>
                        </div>
                    )}

                    {/* 无关联内容 */}
                    {(!relatedContent?.relatedIntels?.length && !relatedContent?.relatedPrices?.length) && (
                        <Empty description="暂无关联内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                </>
            )}
        </Drawer>
    );
};
