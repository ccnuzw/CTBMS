
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@ant-design/pro-components';
import { Row, Col, Spin, Button, Space, App, Typography, Card, Tag, theme, FloatButton, Anchor, Divider, List, Alert } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined as DownloadIcon, ClockCircleOutlined, EyeOutlined, FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import { useResearchReport, useIncrementViewCount, useIncrementDownloadCount, useMarketIntel } from '../api/hooks';
import { AIAnalysisPanel } from './research-report-detail/AIAnalysisPanel';
import { DocumentPreview } from './research-report-detail/DocumentPreview';
import { RelatedReports } from './research-report-detail/RelatedReports';
import { REPORT_TYPE_LABELS, REVIEW_STATUS_LABELS, ReviewStatus } from '@packages/types';
import dayjs from 'dayjs';

export const ResearchReportDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { message } = App.useApp(); // Fix: Use App context hooks
    const { token } = theme.useToken();

    const { data: report, isLoading, error } = useResearchReport(id || '');
    const { mutate: incrementView } = useIncrementViewCount();
    const { mutate: incrementDownload } = useIncrementDownloadCount();

    // Fetch linked source document if intelId exists
    const linkedIntelId = (report as any)?.intelId || (report as any)?.intel?.id;
    const { data: sourceDocument } = useMarketIntel(linkedIntelId || '');

    // 本地轻量状态，保证下载/阅读后数值即时反馈
    const [localViewCount, setLocalViewCount] = useState<number>();
    const [localDownloadCount, setLocalDownloadCount] = useState<number>();
    const [readerView, setReaderView] = useState<'content' | 'original'>('content');

    // Increment view count on mount
    React.useEffect(() => {
        if (id) {
            incrementView(id);
        }
    }, [id]);

    // 同步远端数据到本地状态
    React.useEffect(() => {
        if (report) {
            setLocalViewCount(report.viewCount);
            setLocalDownloadCount(report.downloadCount);
        }
    }, [report]);

    if (isLoading) return <PageContainer><Spin size="large" /></PageContainer>;
    if (error || !report) return <PageContainer><div>加载失败或研报不存在</div></PageContainer>;
    // Determine content: specific report summary > linked intel summary (redundancy)
    const displayContent = report.summary || (report as any).intel?.summary;



    const handleDownload = (attachmentId?: string) => {
        if (id) {
            const attachments = (report as any).intel?.attachments;

            if (attachments && attachments.length > 0) {
                const targetAttachmentId = attachmentId || attachments[0].id;
                incrementDownload(id);
                setLocalDownloadCount((prev) => (prev || 0) + 1);
                message.success('开始下载...');
                // Trigger download
                window.open(`/api/market-intel/attachments/${targetAttachmentId}/download`, '_self');
            } else {
                message.warning('该研报暂无附件可下载');
            }
        }
    };

    // Determine preview URL (Support PDF and Images)
    const attachments = (report as any).intel?.attachments as Array<{
        id: string;
        filename: string;
        mimeType: string;
    }> | undefined;
    let previewUrl = undefined;
    if (attachments && attachments.length > 0) {
        const att = attachments[0];
        // Relaxed check: Check MimeType OR Filename extension
        const isPdf = att.mimeType === 'application/pdf' || att.filename.toLowerCase().endsWith('.pdf');
        const isImage = att.mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(att.filename);
        const isWord = att.mimeType === 'application/msword' || att.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.(doc|docx)$/i.test(att.filename);
        const isPpt = att.mimeType === 'application/vnd.ms-powerpoint' || att.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || /\.(ppt|pptx)$/i.test(att.filename);

        if (isPdf || isImage || isWord || isPpt) {
            previewUrl = `/api/market-intel/attachments/${att.id}/download?inline=true`;
        }
    }

    const heroBackground = `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgLayout} 100%)`;

    const reviewStatusColorMap: Record<ReviewStatus, string> = {
        [ReviewStatus.PENDING]: 'processing',
        [ReviewStatus.APPROVED]: 'success',
        [ReviewStatus.REJECTED]: 'error',
        [ReviewStatus.ARCHIVED]: 'default',
    };

    const publishDate = dayjs(report.publishDate || report.createdAt).format('YYYY-MM-DD');

    const commodityTags = report.commodities?.slice(0, 6) || [];
    const regionTags = report.regions?.slice(0, 6) || [];

    const statusTag = (
        <Tag color={reviewStatusColorMap[report.reviewStatus]} style={{ marginLeft: 8 }}>
            {REVIEW_STATUS_LABELS[report.reviewStatus]}
        </Tag>
    );

    const anchorItems = [
        { key: 'source', href: '#report-source', title: '源文档' },
        { key: 'highlights', href: '#report-highlights', title: '关键观点' },
        { key: 'reader', href: '#report-reader', title: '正文/原文' },
        { key: 'data', href: '#report-data', title: '关键数据' },
        attachments && attachments.length > 0 ? { key: 'attachments', href: '#report-attachments', title: '附件列表' } : null,
        { key: 'related', href: '#report-related', title: '相关研报' },
    ].filter(Boolean) as { key: string; href: string; title: string }[];

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/intel/knowledge?tab=library&content=reports');
        }
    };

    return (
        <PageContainer
            header={{
                title: '研报详情',
                breadcrumb: {},
            }}
        >
            <Card
                bordered={false}
                style={{ marginBottom: 16, background: heroBackground }}
                bodyStyle={{ padding: 20 }}
                className="shadow-sm"
            >
                <Row align="middle" gutter={[16, 16]}>
                    <Col xs={24} md={16}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <Typography.Title level={3} style={{ margin: 0 }}>
                                {report.title}
                                {statusTag}
                            </Typography.Title>
                            <Space size="small" wrap>
                                <Tag color="blue">{REPORT_TYPE_LABELS[report.reportType] || report.reportType}</Tag>
                                {commodityTags.map((item) => <Tag key={`commodity-${item}`}>{item}</Tag>)}
                                {report.commodities?.length > 6 && <Tag>+{report.commodities.length - 6}</Tag>}
                                {regionTags.map((item) => <Tag key={`region-${item}`}>{item}</Tag>)}
                                {report.regions?.length > 6 && <Tag>+{report.regions.length - 6}</Tag>}
                            </Space>
                            <Space size="middle" wrap>
                                <Typography.Text type="secondary"><ClockCircleOutlined /> {publishDate}</Typography.Text>
                                <Typography.Text type="secondary">来源：{report.source || '未知来源'}</Typography.Text>
                                <Typography.Text type="secondary">版本 v{report.version}</Typography.Text>
                            </Space>
                        </Space>
                    </Col>
                    <Col xs={24} md={8}>
                        <Space direction="vertical" style={{ width: '100%', alignItems: 'flex-end' }} size="small">
                            <Space wrap>
                                <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
                                <Button onClick={() => navigate(`/intel/knowledge/reports/${id}/edit`)}>编辑</Button>
                                <Button type="primary" icon={<DownloadIcon />} onClick={() => handleDownload()}>下载原文</Button>
                            </Space>
                            <Space size="middle" wrap>
                                <Tag><EyeOutlined /> 阅读 {localViewCount ?? report.viewCount}</Tag>
                                <Tag><DownloadIcon /> 下载 {localDownloadCount ?? report.downloadCount}</Tag>
                            </Space>
                        </Space>
                    </Col>
                </Row>
            </Card>

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={18}>
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        {/* Source Document Section */}
                        {linkedIntelId && (
                            <div id="report-source">
                                <Alert
                                    type="info"
                                    showIcon
                                    icon={<LinkOutlined />}
                                    style={{ borderRadius: token.borderRadius }}
                                    message={
                                        <Space>
                                            <FileTextOutlined />
                                            <Typography.Text strong>基于以下素材生成</Typography.Text>
                                        </Space>
                                    }
                                    description={
                                        <div style={{ marginTop: 8 }}>
                                            <Space direction="vertical" size="small">
                                                <Typography.Text>
                                                    {sourceDocument?.summary?.substring(0, 100) ||
                                                     sourceDocument?.rawContent?.substring(0, 100) ||
                                                     '源文档'}
                                                    {((sourceDocument?.summary?.length || 0) > 100 ||
                                                      (sourceDocument?.rawContent?.length || 0) > 100) && '...'}
                                                </Typography.Text>
                                                <Space>
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        style={{ padding: 0 }}
                                                        onClick={() => navigate(`/intel/knowledge/documents/${linkedIntelId}`)}
                                                    >
                                                        查看原始文档
                                                    </Button>
                                                    {sourceDocument?.createdAt && (
                                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                            上传于 {dayjs(sourceDocument.createdAt).format('YYYY-MM-DD HH:mm')}
                                                        </Typography.Text>
                                                    )}
                                                </Space>
                                            </Space>
                                        </div>
                                    }
                                />
                            </div>
                        )}

                        <div id="report-highlights">
                            <AIAnalysisPanel report={report} mode="summary" />
                        </div>

                        <div id="report-reader">
                            <DocumentPreview
                                fileUrl={previewUrl}
                                content={displayContent}
                                fileName={attachments?.[0]?.filename}
                                mimeType={attachments?.[0]?.mimeType}
                                onDownload={() => handleDownload()}
                                view={readerView}
                                onViewChange={setReaderView}
                            />
                        </div>

                        {attachments && attachments.length > 0 && (
                            <div id="report-attachments">
                                <Card title="附件列表" bordered={false} className="shadow-sm">
                                    <List
                                        rowKey="id"
                                        dataSource={attachments}
                                        renderItem={(item: any) => (
                                            <List.Item
                                                actions={[
                                                    <Button key="download" size="small" type="link" onClick={() => handleDownload(item.id)}>
                                                        下载
                                                    </Button>
                                                ]}
                                            >
                                                <List.Item.Meta
                                                    title={item.filename}
                                                    description={item.mimeType || '附件'}
                                                />
                                            </List.Item>
                                        )}
                                    />
                                </Card>
                            </div>
                        )}

                        <div id="report-data">
                            <AIAnalysisPanel report={report} mode="data" />
                        </div>

                        <Divider style={{ margin: '8px 0' }} />

                        <div id="report-related">
                            <RelatedReports currentReportId={report.id} />
                        </div>
                    </Space>
                </Col>

                <Col xs={24} lg={6}>
                    <Space direction="vertical" size="middle" style={{ width: '100%', position: 'sticky', top: 88 }}>
                        <Card size="small" bordered={false} className="shadow-sm">
                            <Space direction="vertical" style={{ width: '100%' }} size="small">
                                <Button type="primary" icon={<DownloadIcon />} block onClick={() => handleDownload()}>
                                    下载原文
                                </Button>
                                <Button block onClick={() => setReaderView('content')}>
                                    查看正文
                                </Button>
                                <Button block onClick={() => setReaderView('original')}>
                                    查看原文
                                </Button>
                            </Space>
                        </Card>
                        <Card size="small" bordered={false} className="shadow-sm">
                            <Typography.Text type="secondary">目录</Typography.Text>
                            <Anchor affix={false} items={anchorItems} />
                        </Card>
                    </Space>
                </Col>
            </Row>

            <FloatButton.BackTop visibilityHeight={200} />

        </PageContainer>
    );
};
