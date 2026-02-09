import React, { useMemo, useState } from 'react';
import {
    Card,
    Typography,
    Space,
    Tag,
    Button,
    Divider,
    Empty,
    Flex,
    theme,
    Timeline,
    Tooltip,
    Modal,
    Spin,
    message,
} from 'antd';
import {
    CloseOutlined,
    LinkOutlined,
    FileTextOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    RiseOutlined,
} from '@ant-design/icons';
import { IntelItem } from '../types';
import { ContentType } from '../../../types';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Title, Text, Paragraph } = Typography;

interface RelationPanelProps {
    selectedIntel: IntelItem | null;
    items: IntelItem[];
    onClose: () => void;
    onIntelSelect: (intel: IntelItem | null) => void;
}

import { useRelatedIntel } from '../../../api/related-hooks';
import { useMarketIntel } from '../../../api/hooks';
import { useDictionaries } from '@/hooks/useDictionaries';
import { stripHtml } from '../utils';

const RELATION_TYPE_META_FALLBACK: Record<string, { label: string; color: string }> = {
    TIME: { label: '时间关联', color: 'blue' },
    COMMODITY: { label: '品种关联', color: 'green' },
    REGION: { label: '区域关联', color: 'purple' },
    CHAIN: { label: '因果关联', color: 'orange' },
    CITATION: { label: '引用关联', color: 'cyan' },
    PRICE_FLUCTUATION: { label: '价格异动', color: 'red' },
};

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
    [ContentType.DAILY_REPORT]: <FileTextOutlined style={{ color: '#1890ff' }} />,
    [ContentType.RESEARCH_REPORT]: <FileTextOutlined style={{ color: '#52c41a' }} />,
    [ContentType.POLICY_DOC]: <FileTextOutlined style={{ color: '#722ed1' }} />,
    'PRICE_DATA': <RiseOutlined style={{ color: '#f5222d' }} />,
};

const CONTENT_TYPE_META_FALLBACK: Record<string, { label: string; color: string }> = {
    [ContentType.DAILY_REPORT]: { label: '市场信息', color: 'blue' },
    [ContentType.RESEARCH_REPORT]: { label: '研究报告', color: 'green' },
    [ContentType.POLICY_DOC]: { label: '政策文件', color: 'purple' },
    PRICE_DATA: { label: '价格', color: 'volcano' },
};

const SOURCE_TYPE_META_FALLBACK: Record<string, { label: string; color: string }> = {
    FIRST_LINE: { label: '一线采集', color: 'blue' },
    COMPETITOR: { label: '竞对情报', color: 'volcano' },
    OFFICIAL_GOV: { label: '官方发布', color: 'green' },
    OFFICIAL: { label: '官方发布', color: 'green' },
    RESEARCH_INST: { label: '研究机构', color: 'purple' },
    MEDIA: { label: '媒体报道', color: 'orange' },
    INTERNAL_REPORT: { label: '内部研报', color: 'geekblue' },
};

const SENTIMENT_LABEL_FALLBACK: Record<string, string> = {
    BULLISH: '看涨/积极',
    BEARISH: '看跌/消极',
    NEUTRAL: '中性/震荡',
    MIXED: '混合/波动',
    POSITIVE: '看涨/积极',
    NEGATIVE: '看跌/消极',
};

const TIMEFRAME_LABEL_FALLBACK: Record<string, string> = {
    SHORT: '短期',
    MEDIUM: '中期',
    LONG: '长期',
    SHORT_TERM: '短期',
    MEDIUM_TERM: '中期',
    LONG_TERM: '长期',
};

const COMMODITY_LABEL_FALLBACK: Record<string, string> = {
    SOYBEAN_MEAL: '豆粕',
    SOYBEAN_OIL: '豆油',
    SUGAR: '白糖',
    COTTON: '棉花',
    HOG: '生猪',
    UREA: '尿素',
};

export const RelationPanel: React.FC<RelationPanelProps> = ({
    selectedIntel,
    items,
    onClose,
    onIntelSelect,
}) => {
    const { token } = theme.useToken();
    const { data: relatedItems = [], isLoading } = useRelatedIntel(
        selectedIntel?.intelId || selectedIntel?.id,
    );
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const { data: detailData, isLoading: detailLoading } = useMarketIntel(detailId || '');
    const { data: dictionaries } = useDictionaries([
        'RELATION_TYPE',
        'CONTENT_TYPE',
        'INTEL_SOURCE_TYPE',
        'MARKET_SENTIMENT',
        'PREDICTION_TIMEFRAME',
        'COMMODITY',
    ]);
    const { containerRef, focusRef, modalProps } = useModalAutoFocus();

    const relationTypeMeta = useMemo(() => {
        const items = dictionaries?.RELATION_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return RELATION_TYPE_META_FALLBACK;
        return items.reduce<Record<string, { label: string; color: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color
                || RELATION_TYPE_META_FALLBACK[item.code]?.color
                || 'blue';
            acc[item.code] = { label: item.label, color };
            return acc;
        }, { ...RELATION_TYPE_META_FALLBACK });
    }, [dictionaries]);

    const contentTypeMeta = useMemo(() => {
        const items = dictionaries?.CONTENT_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return CONTENT_TYPE_META_FALLBACK;
        return items.reduce<Record<string, { label: string; color: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color
                || CONTENT_TYPE_META_FALLBACK[item.code]?.color
                || 'blue';
            acc[item.code] = { label: item.label, color };
            return acc;
        }, { ...CONTENT_TYPE_META_FALLBACK });
    }, [dictionaries]);

    const sourceTypeMeta = useMemo(() => {
        const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return SOURCE_TYPE_META_FALLBACK;
        return items.reduce<Record<string, { label: string; color: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color
                || SOURCE_TYPE_META_FALLBACK[item.code]?.color
                || 'default';
            acc[item.code] = { label: item.label, color };
            return acc;
        }, { ...SOURCE_TYPE_META_FALLBACK });
    }, [dictionaries]);

    const sentimentLabelMap = useMemo(() => {
        const map: Record<string, string> = { ...SENTIMENT_LABEL_FALLBACK };
        const items = dictionaries?.MARKET_SENTIMENT?.filter((item) => item.isActive) || [];
        items.forEach((item) => {
            map[item.code] = item.label;
            const aliases = ((item.meta as { aliases?: string[] } | null)?.aliases || [])
                .filter((alias): alias is string => Boolean(alias));
            aliases.forEach((alias) => {
                map[alias.toUpperCase()] = item.label;
            });
        });
        return map;
    }, [dictionaries]);

    const timeframeLabelMap = useMemo(() => {
        const map: Record<string, string> = { ...TIMEFRAME_LABEL_FALLBACK };
        const items = dictionaries?.PREDICTION_TIMEFRAME?.filter((item) => item.isActive) || [];
        items.forEach((item) => {
            map[item.code] = item.label;
        });
        return map;
    }, [dictionaries]);

    const commodityLabelMap = useMemo(() => {
        const map: Record<string, string> = { ...COMMODITY_LABEL_FALLBACK };
        const items = dictionaries?.COMMODITY?.filter((item) => item.isActive) || [];
        items.forEach((item) => {
            map[item.code] = item.label;
        });
        return map;
    }, [dictionaries]);

    const normalizeRelationType = (value?: string) => (value || '').trim().toUpperCase();
    const normalizeDictCode = (value?: string) => (value || '').trim().toUpperCase();

    const getSentimentLabel = (value?: string) => {
        if (!value) return '-';
        const normalized = normalizeDictCode(value);
        return sentimentLabelMap[normalized] || value;
    };

    const getTimeframeLabel = (value?: string) => {
        if (!value) return '-';
        const normalized = normalizeDictCode(value);
        return timeframeLabelMap[normalized] || value;
    };

    const handleOpenDetail = (intelId: string) => {
        setDetailId(intelId);
        setDetailOpen(true);
    };

    const handleJumpToIntel = (intelId: string) => {
        const matched = items.find(
            item => item.intelId === intelId || item.id === intelId,
        );

        if (matched) {
            onIntelSelect(matched);
            requestAnimationFrame(() => {
                const el = document.querySelector(`[data-intel-id="${intelId}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        } else {
            message.info('该关联情报不在当前筛选结果中，已为你打开详情');
        }
    };

    return (

        <div
            style={{
                width: 360,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: token.colorBgContainer,
                borderLeftWidth: 1,
                borderLeftStyle: 'solid',
                borderLeftColor: token.colorBorderSecondary,
            }}
        >
            {/* 头部 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '12px 16px',
                    borderBottomWidth: 1,
                    borderBottomStyle: 'solid',
                    borderBottomColor: token.colorBorderSecondary,
                    position: 'sticky',
                    top: 0,
                    background: token.colorBgContainer,
                    zIndex: 10,
                }}
            >
                <Flex align="center" gap={8}>
                    <LinkOutlined style={{ color: token.colorPrimary }} />
                    <Title level={5} style={{ margin: 0 }}>关联分析</Title>
                </Flex>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
            </Flex>

            {/* 内容 */}
            <div style={{ padding: 16 }}>
                {!selectedIntel ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="点击左侧情报卡片查看关联分析"
                    />
                ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                        {/* 当前选中 */}
                        <div>
                            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                                当前选中
                            </Text>
                            <Card
                                size="small"
                                style={{
                                    marginTop: 8,
                                    background: `${token.colorPrimary}08`,
                                    border: `1px solid ${token.colorPrimary}`,
                                }}
                            >
                                <Text strong>{selectedIntel.title || '未命名情报'}</Text>
                                <Flex gap={4} style={{ marginTop: 8 }}>
                                    <Tag bordered={false} color={contentTypeMeta[selectedIntel.contentType]?.color || 'blue'}>
                                        {CONTENT_TYPE_ICONS[selectedIntel.contentType]}
                                        <span style={{ marginLeft: 4 }}>
                                            {contentTypeMeta[selectedIntel.contentType]?.label || selectedIntel.contentType}
                                        </span>
                                    </Tag>
                                    {selectedIntel.location && (
                                        <Tag bordered={false}>
                                            <EnvironmentOutlined /> {selectedIntel.location}
                                        </Tag>
                                    )}
                                </Flex>
                            </Card>
                        </div>

                        <Divider style={{ margin: 0 }} />

                        {/* 关联情报列表 */}
                        <div>
                            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                                    关联情报 ({relatedItems.length}条)
                                </Text>
                                <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }}>
                                    查看全部
                                </Button>
                            </Flex>

                            <Timeline
                                pending={isLoading ? '分析中...' : false}
                                items={relatedItems.map((related: any, idx: number) => ({
                                    color: relationTypeMeta[normalizeRelationType(related.relationType)]?.color || 'blue',
                                    children: (
                                        <Card
                                            size="small"
                                            hoverable
                                            style={{ marginBottom: 8 }}
                                            bodyStyle={{ padding: '8px 12px' }}
                                            onClick={() => {
                                                handleJumpToIntel(related.id);
                                                handleOpenDetail(related.id);
                                            }}
                                        >
                                            <Flex justify="space-between" align="start">
                                                <div style={{ flex: 1 }}>
                                                    <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                                                        {CONTENT_TYPE_ICONS[related.contentType as string] || <FileTextOutlined />}
                                                        <Text
                                                            ellipsis={{ tooltip: true }}
                                                            style={{ fontSize: 13, maxWidth: 180 }}
                                                        >
                                                            {related.title}
                                                        </Text>
                                                    </Flex>
                                                    <Flex gap={4}>
                                                        <Tag
                                                            color={relationTypeMeta[normalizeRelationType(related.relationType)]?.color}
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            {relationTypeMeta[normalizeRelationType(related.relationType)]?.label || related.relationType}
                                                        </Tag>
                                                        {related.similarity && (
                                                            <Tag style={{ fontSize: 10 }}>
                                                                相似度 {related.similarity}%
                                                            </Tag>
                                                        )}
                                                    </Flex>
                                                </div>
                                                <Tooltip title="查看详情">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<EyeOutlined />}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleJumpToIntel(related.id);
                                                            handleOpenDetail(related.id);
                                                        }}
                                                    />
                                                </Tooltip>
                                            </Flex>
                                        </Card>
                                    ),
                                }))}
                            />
                        </div>

                        <Divider style={{ margin: 0 }} />

                        {/* 研报核心观点 (Research Report Only) */}
                        {selectedIntel.contentType === ContentType.RESEARCH_REPORT && selectedIntel.researchReport && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                                    研报观点
                                </Text>
                                <Card
                                    size="small"
                                    style={{ marginTop: 8, background: token.colorFillQuaternary, borderColor: '#52c41a' }}
                                >
                                    {selectedIntel.researchReport.prediction && (
                                        <div style={{ marginBottom: 12 }}>
                                            <Tag color="orange" style={{ marginBottom: 4 }}>后市预判</Tag>
                                            <Paragraph style={{ fontSize: 12, margin: 0 }}>
                                                {getSentimentLabel(selectedIntel.researchReport.prediction.direction)} ({getTimeframeLabel(selectedIntel.researchReport.prediction.timeframe)})
                                                <br />
                                                {selectedIntel.researchReport.prediction.reasoning}
                                            </Paragraph>
                                        </div>
                                    )}

                                    {selectedIntel.researchReport.keyPoints && (
                                        <>
                                            <Text strong style={{ fontSize: 12 }}>关键点：</Text>
                                            <ul style={{ paddingLeft: 16, margin: '4px 0 0 0', fontSize: 12 }}>
                                                {Array.isArray(selectedIntel.researchReport.keyPoints) &&
                                                    selectedIntel.researchReport.keyPoints.map((p: any, i: number) => (
                                                        <li key={i}>{stripHtml(typeof p === 'string' ? p : p.point)}</li>
                                                    ))}
                                            </ul>
                                        </>
                                    )}
                                    {Array.isArray(selectedIntel.researchReport.commodities) && selectedIntel.researchReport.commodities.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <Text strong style={{ fontSize: 12 }}>关联品种：</Text>
                                            <Flex wrap="wrap" gap={6} style={{ marginTop: 6 }}>
                                                {selectedIntel.researchReport.commodities.map((commodity: string) => (
                                                    <Tag key={commodity} style={{ fontSize: 11, margin: 0 }}>
                                                        {commodityLabelMap[normalizeDictCode(commodity)] || commodity}
                                                    </Tag>
                                                ))}
                                            </Flex>
                                        </div>
                                    )}
                                </Card>
                                <Divider style={{ margin: '16px 0' }} />
                            </div>
                        )}

                        {/* 原文追溯 */}
                        <div>
                            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                                原文追溯
                            </Text>
                            <Card
                                size="small"
                                style={{ marginTop: 8, background: token.colorFillQuaternary }}
                            >
                                <Paragraph
                                    ellipsis={{ rows: 6, expandable: true }}
                                    style={{ fontSize: 12, marginBottom: 0 }}
                                >
                                    {stripHtml(selectedIntel.rawContent) || '暂无原文内容'}
                                </Paragraph>
                            </Card>
                        </div>
                    </Space>
                )}
            </div>

            <Modal
                title="情报详情"
                open={detailOpen}
                onCancel={() => setDetailOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailOpen(false)} ref={focusRef}>
                        关闭
                    </Button>,
                ]}
                width={560}
                {...modalProps}
            >
                <div ref={containerRef}>
                    {detailLoading ? (
                        <Flex justify="center" align="center" style={{ padding: 24 }}>
                            <Spin />
                        </Flex>
                    ) : detailData ? (
                        <Space direction="vertical" style={{ width: '100%' }} size={12}>
                            <Flex align="center" gap={8} wrap="wrap">
                                {detailData.contentType && (
                                    <Tag color={contentTypeMeta[detailData.contentType]?.color || 'blue'}>
                                        {contentTypeMeta[detailData.contentType]?.label || detailData.contentType}
                                    </Tag>
                                )}
                                <Tag color={sourceTypeMeta[detailData.sourceType]?.color || 'default'}>
                                    {sourceTypeMeta[detailData.sourceType]?.label || detailData.sourceType}
                                </Tag>
                                {detailData.location && (
                                    <Tag bordered={false}>
                                        <EnvironmentOutlined /> {detailData.location}
                                    </Tag>
                                )}
                            </Flex>

                            <Text type="secondary" style={{ fontSize: 12 }}>
                                生效时间：{detailData.effectiveTime ? new Date(detailData.effectiveTime).toLocaleString() : '-'}
                            </Text>

                            <Divider style={{ margin: 0 }} />

                            <div>
                                <Text strong>摘要</Text>
                                <Paragraph style={{ marginTop: 6 }}>
                                    {stripHtml(detailData.summary) || '暂无摘要'}
                                </Paragraph>
                            </div>

                            <div>
                                <Text strong>原文内容</Text>
                                <Paragraph style={{ marginTop: 6 }}>
                                    {stripHtml(detailData.rawContent) || '暂无原文内容'}
                                </Paragraph>
                            </div>
                        </Space>
                    ) : (
                        <Empty description="暂无详情数据" />
                    )}
                </div>
            </Modal>
        </div>
    );
};
