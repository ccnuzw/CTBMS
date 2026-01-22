import React from 'react';
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
} from 'antd';
import {
    CloseOutlined,
    LinkOutlined,
    FileTextOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { IntelItem, RelatedIntel } from '../types';
import { ContentType } from '../../../types';

const { Title, Text, Paragraph } = Typography;

interface RelationPanelProps {
    selectedIntel: IntelItem | null;
    onClose: () => void;
    onIntelSelect: (intel: IntelItem | null) => void;
}

// 模拟关联数据
const MOCK_RELATED: RelatedIntel[] = [
    {
        id: '1',
        title: '大连港玉米到港价同步上涨15元',
        contentType: ContentType.DAILY_REPORT,
        relationType: 'commodity',
        similarity: 92,
        createdAt: new Date(),
    },
    {
        id: '2',
        title: 'XX期货: 港口供需分析报告',
        contentType: ContentType.RESEARCH_REPORT,
        relationType: 'citation',
        createdAt: new Date(),
    },
    {
        id: '3',
        title: '营口港库存下降3%',
        contentType: ContentType.DAILY_REPORT,
        relationType: 'region',
        similarity: 85,
        createdAt: new Date(),
    },
    {
        id: '4',
        title: '粮食局关于加强市场监管通知',
        contentType: ContentType.POLICY_DOC,
        relationType: 'chain',
        createdAt: new Date(),
    },
];

const RELATION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    time: { label: '时间关联', color: 'blue' },
    commodity: { label: '品种关联', color: 'green' },
    region: { label: '区域关联', color: 'purple' },
    chain: { label: '因果关联', color: 'orange' },
    citation: { label: '引用关联', color: 'cyan' },
};

const CONTENT_TYPE_ICONS: Record<ContentType, React.ReactNode> = {
    [ContentType.DAILY_REPORT]: <FileTextOutlined style={{ color: '#1890ff' }} />,
    [ContentType.RESEARCH_REPORT]: <FileTextOutlined style={{ color: '#52c41a' }} />,
    [ContentType.POLICY_DOC]: <FileTextOutlined style={{ color: '#722ed1' }} />,
};

export const RelationPanel: React.FC<RelationPanelProps> = ({
    selectedIntel,
    onClose,
    onIntelSelect,
}) => {
    const { token } = theme.useToken();

    return (
        <Card
            style={{
                width: 360,
                height: '100%',
                overflow: 'auto',
                borderRadius: 0,
                borderLeft: `1px solid ${token.colorBorderSecondary}`,
            }}
            bodyStyle={{ padding: 0 }}
        >
            {/* 头部 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
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
                                    borderColor: token.colorPrimary,
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
                                    关联情报 ({MOCK_RELATED.length}条)
                                </Text>
                                <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }}>
                                    查看全部
                                </Button>
                            </Flex>

                            <Timeline
                                items={MOCK_RELATED.map((related, idx) => ({
                                    color: RELATION_TYPE_LABELS[related.relationType]?.color || 'blue',
                                    children: (
                                        <Card
                                            size="small"
                                            hoverable
                                            style={{ marginBottom: 8 }}
                                            bodyStyle={{ padding: '8px 12px' }}
                                        >
                                            <Flex justify="space-between" align="start">
                                                <div style={{ flex: 1 }}>
                                                    <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                                                        {CONTENT_TYPE_ICONS[related.contentType]}
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
                                                    />
                                                </Tooltip>
                                            </Flex>
                                        </Card>
                                    ),
                                }))}
                            />
                        </div>

                        <Divider style={{ margin: 0 }} />

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
        </Card>
    );
};
