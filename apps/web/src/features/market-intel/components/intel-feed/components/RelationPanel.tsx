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

const { Title, Text, Paragraph } = Typography;

interface RelationPanelProps {
    selectedIntel: IntelItem | null;
    items: IntelItem[];
    onClose: () => void;
    onIntelSelect: (intel: IntelItem | null) => void;
}

import { useRelatedIntel } from '../../../api/related-hooks';
import { useMarketIntel } from '../../../api/hooks';

const RELATION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    time: { label: '时间关联', color: 'blue' },
    commodity: { label: '品种关联', color: 'green' },
    region: { label: '区域关联', color: 'purple' },
    chain: { label: '因果关联', color: 'orange' },
    citation: { label: '引用关联', color: 'cyan' },
    price_fluctuation: { label: '价格异动', color: 'red' },
};

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
    [ContentType.DAILY_REPORT]: <FileTextOutlined style={{ color: '#1890ff' }} />,
    [ContentType.RESEARCH_REPORT]: <FileTextOutlined style={{ color: '#52c41a' }} />,
    [ContentType.POLICY_DOC]: <FileTextOutlined style={{ color: '#722ed1' }} />,
    'PRICE_DATA': <RiseOutlined style={{ color: '#f5222d' }} />,
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

    const contentTypeLabel = useMemo(() => {
        return {
            [ContentType.DAILY_REPORT]: '日报',
            [ContentType.RESEARCH_REPORT]: '研报',
            [ContentType.POLICY_DOC]: '政策',
            'PRICE_DATA': '价格',
        };
    }, []);

    const sourceTypeLabel = useMemo(() => {
        return {
            FIRST_LINE: '一线采集',
            COMPETITOR: '竞对情报',
            OFFICIAL: '官方发布',
            RESEARCH_INST: '研究机构',
            MEDIA: '媒体报道',
        } as Record<string, string>;
    }, []);

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
                                    <Tag bordered={false} color="blue">
                                        {CONTENT_TYPE_ICONS[selectedIntel.contentType]}
                                        <span style={{ marginLeft: 4 }}>
                                            {selectedIntel.contentType === ContentType.DAILY_REPORT && '日报'}
                                            {selectedIntel.contentType === ContentType.RESEARCH_REPORT && '研报'}
                                            {selectedIntel.contentType === ContentType.POLICY_DOC && '政策'}
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
                                    color: RELATION_TYPE_LABELS[related.relationType]?.color || 'blue',
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
                                                            color={RELATION_TYPE_LABELS[related.relationType]?.color}
                                                            style={{ fontSize: 10 }}
                                                        >
                                                            {RELATION_TYPE_LABELS[related.relationType]?.label}
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
                                                {selectedIntel.researchReport.prediction.direction} ({selectedIntel.researchReport.prediction.timeframe})
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
                                                        <li key={i}>{typeof p === 'string' ? p : p.point}</li>
                                                    ))}
                                            </ul>
                                        </>
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
                                    {selectedIntel.rawContent || '暂无原文内容'}
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
                footer={null}
                width={560}
            >
                {detailLoading ? (
                    <Flex justify="center" align="center" style={{ padding: 24 }}>
                        <Spin />
                    </Flex>
                ) : detailData ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Flex align="center" gap={8} wrap="wrap">
                            {detailData.contentType && (
                                <Tag color="blue">
                                    {contentTypeLabel[detailData.contentType as ContentType] || detailData.contentType}
                                </Tag>
                            )}
                            <Tag>{sourceTypeLabel[detailData.sourceType] || detailData.sourceType}</Tag>
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
                                {detailData.summary || '暂无摘要'}
                            </Paragraph>
                        </div>

                        <div>
                            <Text strong>原文内容</Text>
                            <Paragraph style={{ marginTop: 6 }}>
                                {detailData.rawContent || '暂无原文内容'}
                            </Paragraph>
                        </div>
                    </Space>
                ) : (
                    <Empty description="暂无详情数据" />
                )}
            </Modal>
        </div>
    );
};
