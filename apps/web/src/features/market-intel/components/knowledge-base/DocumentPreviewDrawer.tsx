import React, { useMemo } from 'react';
import { Drawer, Button, Flex, Tag, Typography, Space, Card, Row, Col, Divider, Descriptions, App } from 'antd';
import { DownloadOutlined, FileTextOutlined, ClockCircleOutlined, UserOutlined, GlobalOutlined, PaperClipOutlined, FilePdfOutlined, FileImageOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import { DocItem } from './DocumentCardView';
import { IntelSourceType, INTEL_SOURCE_TYPE_LABELS } from '@packages/types';
import { EditTagsModal } from './EditTagsModal';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Text, Paragraph, Title } = Typography;



interface DocumentPreviewDrawerProps {
    doc: DocItem | null;
    onClose: () => void;
}

export const DocumentPreviewDrawer: React.FC<DocumentPreviewDrawerProps> = ({
    doc: propDoc,
    onClose
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [isEditTagsOpen, setIsEditTagsOpen] = React.useState(false);
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

    // Maintain local state to reflect changes immediately
    const [localDoc, setLocalDoc] = React.useState<DocItem | null>(null);

    React.useEffect(() => {
        setLocalDoc(propDoc);
    }, [propDoc]);

    if (!localDoc) return null;

    const handleTagsUpdated = (newTags: string[]) => {
        // Optimistic update of local doc
        setLocalDoc(prev => {
            if (!prev) return null;
            return {
                ...prev,
                aiAnalysis: {
                    ...prev.aiAnalysis,
                    tags: newTags
                }
            };
        });
    };

    const handleDownload = () => {
        const attachments = localDoc.attachments || [];
        if (attachments.length === 0) {
            message.warning('该文档暂无附件可下载');
            return;
        }
        const target = attachments[0];
        const url = target.fileUrl || `/api/market-intel/attachments/${target.id}/download`;
        window.open(url, '_self');
    };

    return (
        <>
            <Drawer
                title={
                    <Flex align="center" gap={8}>
                        <Tag color={sourceTypeMeta.colors[localDoc.sourceType as string] || 'default'}>
                            {sourceTypeMeta.labels[localDoc.sourceType as string] || localDoc.sourceType}
                        </Tag>
                        <Text strong style={{ maxWidth: 600 }} ellipsis>
                            {localDoc.rawContent?.split('\n')[0] || '文档详情'}
                        </Text>
                    </Flex>
                }
                open={!!localDoc}
                onClose={onClose}
                width={1000}
                extra={
                    <Button
                        icon={<DownloadOutlined />}
                        type="primary"
                        onClick={handleDownload}
                        disabled={(localDoc.attachments?.length || 0) === 0}
                    >
                        下载原件
                    </Button>
                }
            >
                <Row gutter={24} style={{ height: '100%' }}>
                    {/* 左侧：文档内容 (70%) */}
                    <Col span={16} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Card
                            title={<><FileTextOutlined /> 文档内容</>}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                            bodyStyle={{ flex: 1, overflow: 'hidden', padding: 0 }}
                        >
                            <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
                                <Typography>
                                    <pre
                                        style={{
                                            fontSize: 14,
                                            margin: 0,
                                            whiteSpace: 'pre-wrap',
                                            fontFamily: 'monospace',
                                            lineHeight: 1.6,
                                            color: token.colorText
                                        }}
                                    >
                                        {localDoc.rawContent}
                                    </pre>
                                </Typography>
                            </div>
                        </Card>
                    </Col>

                    {/* 右侧：元信息面板 (30%) */}
                    <Col span={8} style={{ height: '100%', overflow: 'auto' }}>
                        <Flex vertical gap={16}>
                            {/* AI 核心摘要 */}
                            <Card
                                size="small"
                                title="AI 核心摘要"
                                style={{
                                    background: `${token.colorPrimary}08`,
                                    borderColor: token.colorPrimaryBorder
                                }}
                            >
                                <Paragraph style={{ marginBottom: 0 }}>
                                    {localDoc.summary || localDoc.aiAnalysis?.summary || '暂无摘要'}
                                </Paragraph>
                            </Card>

                            {/* 关键信息 */}
                            <Card size="small" title="关键信息">
                                <Descriptions column={1} size="small">
                                    <Descriptions.Item label="来源渠道">
                                        <Space>
                                            {localDoc.sourceType === IntelSourceType.OFFICIAL ? <GlobalOutlined /> : <UserOutlined />}
                                            {sourceTypeMeta.labels[localDoc.sourceType as string] || localDoc.sourceType}
                                        </Space>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="归档时间">
                                        <Space>
                                            <ClockCircleOutlined />
                                            {new Date(localDoc.effectiveTime).toLocaleString()}
                                        </Space>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="文档ID">
                                        <Text code>{localDoc.id.substring(0, 8)}</Text>
                                    </Descriptions.Item>
                                </Descriptions>
                            </Card>

                            {/* 标签 */}
                            <Card
                                size="small"
                                title="智能标签 (分类)"
                                extra={<Button type="link" size="small" onClick={() => setIsEditTagsOpen(true)}>编辑</Button>}
                            >
                                <Flex wrap="wrap" gap={8}>
                                    {(localDoc.aiAnalysis?.tags || []).length > 0 ? (
                                        (localDoc.aiAnalysis?.tags || []).map((tag: string) => (
                                            <Tag key={tag} color="blue">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Text type="secondary">暂无标签</Text>
                                    )}
                                </Flex>
                            </Card>

                            {/* 作者信息 (如有) */}
                            {localDoc.author && (
                                <Card size="small" title="上传者">
                                    <Flex align="center" gap={8}>
                                        <UserOutlined />
                                        <Text>{localDoc.author.name}</Text>
                                    </Flex>
                                </Card>
                            )}

                            {/* 附件列表 */}
                            {(localDoc.attachments && localDoc.attachments.length > 0) && (
                                <Card size="small" title={`附件 (${localDoc.attachments.length})`}>
                                    <Flex vertical gap={8}>
                                        {localDoc.attachments.map((att) => (
                                            <div
                                                key={att.id}
                                                style={{
                                                    padding: 8,
                                                    border: `1px solid ${token.colorBorder}`,
                                                    borderRadius: token.borderRadius,
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => window.open(att.fileUrl, '_blank')}
                                            >
                                                <Flex align="center" gap={8}>
                                                    {att.mimeType?.includes('pdf') ? <FilePdfOutlined style={{ color: token.colorError }} /> :
                                                        att.mimeType?.includes('image') ? <FileImageOutlined style={{ color: token.colorWarning }} /> :
                                                            <PaperClipOutlined />}
                                                    <Text ellipsis style={{ flex: 1, fontSize: 12 }}>{att.fileName}</Text>
                                                    <DownloadOutlined />
                                                </Flex>
                                            </div>
                                        ))}
                                    </Flex>
                                </Card>
                            )}
                        </Flex>
                    </Col>
                </Row>
            </Drawer>
            <EditTagsModal
                open={isEditTagsOpen}
                onClose={() => setIsEditTagsOpen(false)}
                docId={localDoc.id}
                initialTags={localDoc.aiAnalysis?.tags || []}
                onSuccess={handleTagsUpdated}
            />
        </>
    );
};
