import React, { useState } from 'react';
import {
    Card,
    Row,
    Col,
    Typography,
    Space,
    Button,
    Tag,
    Descriptions,
    Divider,
    Alert,
    Modal,
    Select,
    theme,
    Spin,
    Empty,
    App,
    List,
    Segmented,
} from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import { useNavigate, useParams } from 'react-router-dom';
import {
    RocketOutlined,
    FileTextOutlined,
    CalendarOutlined,
    EnvironmentOutlined,
    TagOutlined,
    RobotOutlined,
    EyeOutlined,
    BookOutlined,
    ArrowRightOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ThunderboltOutlined,
    DownloadOutlined,
} from '@ant-design/icons';
import { useMarketIntel, usePromoteToReport, useResearchReportByIntelId } from '../api/hooks';
import { ReportType, REPORT_TYPE_LABELS } from '@packages/types';
import DOMPurify from 'dompurify';
import { DocumentPreview } from './research-report-detail/DocumentPreview';

const { Title, Text, Paragraph } = Typography;

export const DocumentDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const { message } = App.useApp();

    const { data: document, isLoading } = useMarketIntel(id || '');
    const promoteMutation = usePromoteToReport();

    // Check if document already has a linked report (precise by intelId)
    const { data: linkedReport } = useResearchReportByIntelId(id || '');
    const hasLinkedReport = !!linkedReport;

    const [promoteModalOpen, setPromoteModalOpen] = useState(false);
    const [selectedReportType, setSelectedReportType] = useState<ReportType>(ReportType.MARKET);
    const [readerView, setReaderView] = useState<'content' | 'original'>('content');
    const [contentMode, setContentMode] = useState<'summary' | 'full'>('full');

    const handlePromoteToReport = async () => {
        if (!id) return;

        try {
            const result = await promoteMutation.mutateAsync({
                intelId: id,
                reportType: selectedReportType,
                triggerDeepAnalysis: true,
            });

            message.success('研报生成成功');
            setPromoteModalOpen(false);
            navigate(`/intel/knowledge/reports/${result.reportId}`);
        } catch (error) {
            message.error('研报生成失败，请重试');
            console.error(error);
        }
    };

    const getProcessingStatusTag = () => {
        if (hasLinkedReport) {
            return (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                    已生成研报
                </Tag>
            );
        }
        if (document?.aiAnalysis) {
            return (
                <Tag color="processing" icon={<RobotOutlined />}>
                    已分析
                </Tag>
            );
        }
        return (
            <Tag color="default" icon={<ClockCircleOutlined />}>
                待处理
            </Tag>
        );
    };

    const formatDate = (date: string | Date | undefined) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (isLoading) {
        return (
            <PageContainer>
                <div style={{ textAlign: 'center', padding: 100 }}>
                    <Spin size="large" />
                </div>
            </PageContainer>
        );
    }

    if (!document) {
        return (
            <PageContainer>
                <Empty description="文档不存在或已被删除" />
            </PageContainer>
        );
    }

    const rawContent = document.rawContent || '';
    const summaryContent = document.summary || '';
    const hasSummary = !!summaryContent;

    React.useEffect(() => {
        setContentMode(hasSummary ? 'summary' : 'full');
    }, [document.id, hasSummary]);

    const displayContent = contentMode === 'summary' && hasSummary ? summaryContent : rawContent;
    const isHtml = /^\s*<.*>/.test(displayContent) || /<br\s*\/?>|<p>|<div>|<table>|<span>|<ul>|<ol>|<li>/i.test(displayContent);
    const htmlContent = isHtml ? displayContent : displayContent.replace(/\n/g, '<br/>');
    const safeHtml = DOMPurify.sanitize(htmlContent, { USE_PROFILES: { html: true } });

    const normalizedAttachments = React.useMemo(() => {
        const attachments = ((document as any).attachments || []) as Array<{
            id: string;
            filename?: string;
            fileName?: string;
            mimeType?: string;
            fileUrl?: string;
        }>;
        return attachments.map((att) => ({
            ...att,
            filename: att.filename || att.fileName,
        }));
    }, [document]);

    const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | undefined>(normalizedAttachments[0]?.id);

    React.useEffect(() => {
        setSelectedAttachmentId(normalizedAttachments[0]?.id);
    }, [document.id, normalizedAttachments]);

    const selectedAttachment = normalizedAttachments.find((att) => att.id === selectedAttachmentId) || normalizedAttachments[0];
    const previewUrl = selectedAttachment
        ? (selectedAttachment.fileUrl || `/api/market-intel/attachments/${selectedAttachment.id}/download?inline=true`)
        : undefined;

    const handleDownloadAttachment = (attachmentId?: string) => {
        const target = normalizedAttachments.find((att) => att.id === attachmentId) || normalizedAttachments[0];
        if (!target) {
            message.warning('该文档暂无附件可下载');
            return;
        }
        const url = target.fileUrl || `/api/market-intel/attachments/${target.id}/download`;
        window.open(url, '_self');
    };

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/intel/knowledge?tab=library&content=documents');
        }
    };

    return (
        <PageContainer
            header={{
                title: (
                    <Space>
                        <FileTextOutlined />
                        文档详情
                    </Space>
                ),
                subTitle: document.summary?.substring(0, 50) || '未命名文档',
                onBack: handleBack,
                tags: getProcessingStatusTag(),
                extra: (
                    <Space>
                        {normalizedAttachments.length > 0 && (
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownloadAttachment(selectedAttachment?.id)}
                            >
                                下载原件
                            </Button>
                        )}
                        {hasLinkedReport ? (
                            <Button
                                type="primary"
                                icon={<EyeOutlined />}
                                onClick={() => navigate(`/intel/knowledge/reports/${linkedReport?.id}`)}
                            >
                                查看关联研报
                            </Button>
                        ) : (
                            <Button
                                type="primary"
                                icon={<RocketOutlined />}
                                onClick={() => setPromoteModalOpen(true)}
                            >
                                一键生成研报
                            </Button>
                        )}
                    </Space>
                ),
            }}
        >
            <Row gutter={[24, 24]}>
                {/* Left Column: Document Info & Content */}
                <Col xs={24} lg={16}>
                    {/* Promotion CTA Card - Only show if not yet promoted */}
                    {!hasLinkedReport && (
                        <Alert
                            type="info"
                            showIcon
                            icon={<ThunderboltOutlined />}
                            style={{ marginBottom: 24, borderRadius: token.borderRadiusLG }}
                            message={
                                <Space>
                                    <Text strong>此文档可升级为结构化研报</Text>
                                </Space>
                            }
                            description={
                                <div style={{ marginTop: 8 }}>
                                    <Paragraph style={{ marginBottom: 12 }}>
                                        AI 将自动提取：核心观点与论据、价格预测与市场判断、关键数据指标
                                    </Paragraph>
                                    <Button
                                        type="primary"
                                        icon={<RocketOutlined />}
                                        onClick={() => setPromoteModalOpen(true)}
                                    >
                                        一键生成研报
                                    </Button>
                                </div>
                            }
                        />
                    )}

                    {/* Linked Report Info - Show if already promoted */}
                    {hasLinkedReport && linkedReport && (
                        <Alert
                            type="success"
                            showIcon
                            icon={<CheckCircleOutlined />}
                            style={{ marginBottom: 24, borderRadius: token.borderRadiusLG }}
                            message="此文档已生成研报"
                            description={
                                <div style={{ marginTop: 8 }}>
                                    <Space direction="vertical" size="small">
                                        <Text>
                                            研报标题：<Text strong>{linkedReport.title}</Text>
                                        </Text>
                                        <Button
                                            type="link"
                                            style={{ padding: 0 }}
                                            onClick={() =>
                                                navigate(`/intel/knowledge/reports/${linkedReport.id}`)
                                            }
                                        >
                                            查看研报详情 <ArrowRightOutlined />
                                        </Button>
                                    </Space>
                                </div>
                            }
                        />
                    )}

                    {/* Document Content */}
                    <Card
                        title={
                            <Space>
                                <FileTextOutlined />
                                文档内容
                            </Space>
                        }
                        style={{ borderRadius: token.borderRadiusLG }}
                        bodyStyle={{ padding: 0 }}
                    >
                        <div style={{ padding: 16, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                            {hasSummary && (
                                <Segmented
                                    size="small"
                                    value={contentMode}
                                    onChange={(value) => setContentMode(value as 'summary' | 'full')}
                                    options={[
                                        { label: '摘要', value: 'summary' },
                                        { label: '全文', value: 'full' },
                                    ]}
                                />
                            )}
                        </div>
                        <DocumentPreview
                            fileUrl={previewUrl}
                            fileName={selectedAttachment?.filename}
                            mimeType={selectedAttachment?.mimeType}
                            content={safeHtml}
                            onDownload={() => handleDownloadAttachment(selectedAttachment?.id)}
                            view={readerView}
                            onViewChange={setReaderView}
                            attachments={normalizedAttachments}
                            selectedAttachmentId={selectedAttachment?.id}
                            onAttachmentChange={setSelectedAttachmentId}
                            contentLabel={hasSummary ? '内容摘要' : '正文内容'}
                            originalLabel="原始附件"
                        />
                    </Card>
                </Col>

                {/* Right Column: Metadata & AI Analysis */}
                <Col xs={24} lg={8}>
                    {/* Basic Info */}
                    <Card
                        title="基本信息"
                        size="small"
                        style={{ marginBottom: 16, borderRadius: token.borderRadiusLG }}
                    >
                        <Descriptions column={1} size="small">
                            <Descriptions.Item
                                label={
                                    <Space>
                                        <CalendarOutlined />
                                        创建时间
                                    </Space>
                                }
                            >
                                {formatDate(document.createdAt)}
                            </Descriptions.Item>
                            <Descriptions.Item
                                label={
                                    <Space>
                                        <CalendarOutlined />
                                        生效时间
                                    </Space>
                                }
                            >
                                {formatDate(document.effectiveTime)}
                            </Descriptions.Item>
                            <Descriptions.Item
                                label={
                                    <Space>
                                        <EnvironmentOutlined />
                                        地区
                                    </Space>
                                }
                            >
                                {document.region?.join(', ') || document.location || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item
                                label={
                                    <Space>
                                        <TagOutlined />
                                        来源类型
                                    </Space>
                                }
                            >
                                <Tag>{document.sourceType || '-'}</Tag>
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>

                    {/* AI Analysis Summary */}
                    {document.aiAnalysis && (
                        <Card
                            title={
                                <Space>
                                    <RobotOutlined style={{ color: token.colorPrimary }} />
                                    AI 分析结果
                                </Space>
                            }
                            size="small"
                            style={{ borderRadius: token.borderRadiusLG }}
                        >
                            {document.aiAnalysis.summary && (
                                <div style={{ marginBottom: 16 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        摘要
                                    </Text>
                                    <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>
                                        {document.aiAnalysis.summary}
                                    </Paragraph>
                                </div>
                            )}

                            {document.aiAnalysis.tags && document.aiAnalysis.tags.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        标签
                                    </Text>
                                    <div style={{ marginTop: 4 }}>
                                        {document.aiAnalysis.tags.map((tag: string, idx: number) => (
                                            <Tag key={idx} style={{ marginBottom: 4 }}>
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {document.aiAnalysis.sentiment && (
                                <div style={{ marginBottom: 16 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        情绪倾向
                                    </Text>
                                    <div style={{ marginTop: 4 }}>
                                        <Tag
                                            color={
                                                document.aiAnalysis.sentiment === 'positive'
                                                    ? 'success'
                                                    : document.aiAnalysis.sentiment === 'negative'
                                                    ? 'error'
                                                    : 'default'
                                            }
                                        >
                                            {document.aiAnalysis.sentiment === 'positive'
                                                ? '利多'
                                                : document.aiAnalysis.sentiment === 'negative'
                                                ? '利空'
                                                : '中性'}
                                        </Tag>
                                    </div>
                                </div>
                            )}

                            <Divider style={{ margin: '12px 0' }} />

                            <Button
                                type="primary"
                                block
                                icon={<BookOutlined />}
                                onClick={() => setPromoteModalOpen(true)}
                                disabled={hasLinkedReport}
                            >
                                {hasLinkedReport ? '已生成研报' : '基于此分析生成研报'}
                            </Button>
                        </Card>
                    )}

                    {normalizedAttachments.length > 0 && (
                        <Card
                            title={`附件列表 (${normalizedAttachments.length})`}
                            size="small"
                            style={{ borderRadius: token.borderRadiusLG }}
                        >
                            <List
                                size="small"
                                dataSource={normalizedAttachments}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                key="preview"
                                                type="link"
                                                size="small"
                                                onClick={() => {
                                                    setSelectedAttachmentId(item.id);
                                                    setReaderView('original');
                                                }}
                                            >
                                                预览
                                            </Button>,
                                            <Button
                                                key="download"
                                                type="link"
                                                size="small"
                                                onClick={() => handleDownloadAttachment(item.id)}
                                            >
                                                下载
                                            </Button>,
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={item.filename || '未命名附件'}
                                            description={item.mimeType || '附件'}
                                        />
                                    </List.Item>
                                )}
                            />
                        </Card>
                    )}
                </Col>
            </Row>

            {/* Promote to Report Modal */}
            <Modal
                title={
                    <Space>
                        <RocketOutlined style={{ color: token.colorPrimary }} />
                        生成结构化研报
                    </Space>
                }
                open={promoteModalOpen}
                onCancel={() => setPromoteModalOpen(false)}
                onOk={handlePromoteToReport}
                okText="开始生成"
                okButtonProps={{ loading: promoteMutation.isPending }}
                cancelText="取消"
            >
                <div style={{ padding: '16px 0' }}>
                    <Paragraph>
                        AI 将基于当前文档内容自动生成结构化研报，提取以下信息：
                    </Paragraph>
                    <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
                        <li>核心观点与论据</li>
                        <li>价格预测与市场判断</li>
                        <li>关键数据指标</li>
                        <li>相关品种与区域标签</li>
                    </ul>

                    <div style={{ marginTop: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                            选择研报类型
                        </Text>
                        <Select
                            value={selectedReportType}
                            onChange={setSelectedReportType}
                            style={{ width: '100%' }}
                            options={Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => ({
                                label,
                                value,
                            }))}
                        />
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
};
