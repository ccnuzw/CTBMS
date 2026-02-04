import React, { useMemo } from 'react';
import { Card, Row, Col, Flex, Typography, Tag, Space, Empty, Spin, Checkbox, Button, Tooltip } from 'antd';
import { EyeOutlined, SafetyOutlined, FileExcelOutlined, FileTextOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { theme } from 'antd';
import { IntelSourceType, INTEL_SOURCE_TYPE_LABELS } from '@packages/types';
import { stripHtml } from '@packages/utils';
import { useFavoritesStore } from '../../stores/useFavoritesStore';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Text, Paragraph } = Typography;



// 文档响应类型 (支持文档和研报的统一展示)
export interface DocItem {
    id: string;
    category: string;
    sourceType: IntelSourceType | string;
    rawContent: string;
    summary: string | null;
    aiAnalysis: any;
    effectiveTime: string;
    author: { id: string; name: string } | null;
    attachments?: { id: string; fileName: string; fileUrl: string; mimeType: string }[];
    // 扩展字段：区分文档和研报
    itemType?: 'document' | 'report';
    reportData?: any; // 研报原始数据
}

interface DocumentCardViewProps {
    docs: DocItem[];
    isLoading: boolean;
    onPreview: (doc: DocItem) => void;
    previewDocId?: string;
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
}

export const DocumentCardView: React.FC<DocumentCardViewProps> = ({
    docs,
    isLoading,
    onPreview,
    previewDocId,
    selectedIds,
    onSelect
}) => {
    const { token } = theme.useToken();
    const { isFavorite, toggleFavorite } = useFavoritesStore();
    const { data: dictionaries } = useDictionaries(['INTEL_SOURCE_TYPE']);

    const sourceTypeMeta = useMemo(() => {
        const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
        const fallbackColors: Record<string, string> = {
            [IntelSourceType.FIRST_LINE]: 'blue',
            [IntelSourceType.COMPETITOR]: 'warning',
            [IntelSourceType.OFFICIAL]: 'error',
            [IntelSourceType.RESEARCH_INST]: 'purple',
            [IntelSourceType.MEDIA]: 'orange',
            [IntelSourceType.INTERNAL_REPORT]: 'geekblue',
        };
        if (!items.length) {
            return {
                labels: INTEL_SOURCE_TYPE_LABELS as Record<string, string>,
                colors: fallbackColors,
            };
        }
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'default';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    const getSourceIcon = (source: string) => {
        switch (source) {
            case IntelSourceType.OFFICIAL:
                return <SafetyOutlined style={{ color: token.colorError }} />;
            case IntelSourceType.COMPETITOR:
                return <FileExcelOutlined style={{ color: token.colorWarning }} />;
            default:
                return <FileTextOutlined style={{ color: token.colorPrimary }} />;
        }
    };

    if (isLoading) {
        return (
            <Flex vertical justify="center" align="center" gap={16} style={{ height: 200 }}>
                <Spin size="large" />
                <Text type="secondary">加载中...</Text>
            </Flex>
        );
    }

    if (docs.length === 0) {
        return <Empty description="未找到符合条件的文档" />;
    }

    return (
        <Row gutter={[16, 16]}>
            {docs.map((doc) => (
                <Col key={doc.id} xs={24} xl={12}>
                    <Card
                        hoverable
                        onClick={() => onPreview(doc)}
                        style={{
                            borderColor: previewDocId === doc.id ? token.colorPrimary : undefined,
                            position: 'relative'
                        }}
                    >
                        <div
                            style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Checkbox
                                checked={selectedIds.has(doc.id)}
                                onChange={(e) => onSelect(doc.id, e.target.checked)}
                            />
                        </div>
                        <Flex gap={8} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                            <Tooltip title={isFavorite(doc.id) ? '取消收藏' : '添加收藏'}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={isFavorite(doc.id) ?
                                        <StarFilled style={{ color: '#faad14' }} /> :
                                        <StarOutlined style={{ color: token.colorTextSecondary }} />
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(doc.id);
                                    }}
                                />
                            </Tooltip>
                        </Flex>
                        <Flex gap={16} style={{ paddingLeft: 24 }}>
                            <div
                                style={{
                                    padding: 12,
                                    borderRadius: token.borderRadius,
                                    background:
                                        doc.sourceType === IntelSourceType.OFFICIAL
                                            ? token.colorErrorBg
                                            : doc.sourceType === IntelSourceType.COMPETITOR
                                                ? token.colorWarningBg
                                                : token.colorPrimaryBg,
                                }}
                            >
                                {getSourceIcon(doc.sourceType)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text strong style={{ display: 'block' }}>
                                    {(() => {
                                        const title = stripHtml(doc.rawContent || '').split('\n')[0]?.replace(/[\[\]]/g, '') || '';
                                        return title
                                            ? (title.length > 50 ? title.substring(0, 50) + '...' : title)
                                            : '未命名文档';
                                    })()}
                                </Text>
                                <Paragraph
                                    type="secondary"
                                    ellipsis={{ rows: 2 }}
                                    style={{ margin: '8px 0', fontSize: 12 }}
                                >
                                    <Text strong>摘要:</Text> {stripHtml(doc.summary || doc.aiAnalysis?.summary || '') || '暂无摘要'}
                                </Paragraph>
                                <Flex gap={12}>
                                    <Tag style={{ fontSize: 10 }}>
                                        {new Date(doc.effectiveTime).toLocaleDateString()}
                                    </Tag>
                                    <Tag color={sourceTypeMeta.colors[doc.sourceType as string] || 'default'} style={{ fontSize: 10 }}>
                                        {sourceTypeMeta.labels[doc.sourceType as string] || doc.sourceType}
                                    </Tag>
                                    {doc.itemType && (
                                        <Tag color={doc.itemType === 'report' ? 'green' : 'blue'} style={{ fontSize: 10 }}>
                                            {doc.itemType === 'report' ? '研报' : '文档'}
                                        </Tag>
                                    )}
                                </Flex>
                            </div>
                            <EyeOutlined style={{ color: token.colorTextSecondary }} />
                        </Flex>
                    </Card>
                </Col>
            ))}
        </Row>
    );
};
