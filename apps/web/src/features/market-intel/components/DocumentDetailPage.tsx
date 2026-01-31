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
} from '@ant-design/icons';
import { useMarketIntel, usePromoteToReport, useResearchReportByIntelId } from '../api/hooks';
import { ReportType, REPORT_TYPE_LABELS } from '@packages/types';
import DOMPurify from 'dompurify';

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
    const isHtml = /^\s*<.*>/.test(rawContent) || /<br\s*\/?>|<p>|<div>|<table>|<span>|<ul>|<ol>|<li>/i.test(rawContent);
    const htmlContent = isHtml ? rawContent : rawContent.replace(/\n/g, '<br/>');
    const safeHtml = DOMPurify.sanitize(htmlContent, { USE_PROFILES: { html: true } });

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
                onBack: () => navigate(-1),
                tags: getProcessingStatusTag(),
                extra: hasLinkedReport ? (
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
                    >
                        <div
                            style={{
                                padding: 16,
                                background: token.colorBgLayout,
                                borderRadius: token.borderRadius,
                                maxHeight: 500,
                                overflow: 'auto',
                            }}
                        >
                            {safeHtml ? (
                                <div
                                    style={{
                                        fontSize: 13,
                                        lineHeight: 1.6,
                                    }}
                                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                                />
                            ) : (
                                <Text type="secondary">暂无内容</Text>
                            )}
                        </div>
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
