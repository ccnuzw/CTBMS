import { useState, useMemo } from 'react';
import { PageContainer, ProForm, ProCard, ProFormText, ProFormSelect, ProFormDatePicker, ProFormList, ProFormGroup, ProFormDigit, ProFormTextArea, ProFormItem } from '@ant-design/pro-components';
import { App, Form, Space, Typography, Button, Badge, Row, Col, Empty, Result, Modal, Tag, theme } from 'antd';
import { FileWordOutlined, ThunderboltOutlined, FileSearchOutlined, RobotOutlined, CheckCircleOutlined, EyeOutlined, BulbOutlined, LineChartOutlined, BarChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    ReportType,
    ReportPeriod,
    REPORT_TYPE_LABELS,
    REPORT_PERIOD_LABELS,
    CreateManualResearchReportDto,
    IntelCategory,
    ContentType,
} from '@packages/types';
import { useCreateManualResearchReport, useResearchReportStats, useAnalyzeContent } from '../api/hooks';
import { useProvinces } from '../api/region';
import TiptapEditor from '@/components/TiptapEditor';
import { DocumentUploader } from './DocumentUploader';
import { PREDICTION_DIRECTION_LABELS, PREDICTION_TIMEFRAME_LABELS } from '../constants';

const { Text } = Typography;

const cssStyles = `
.fullHeightItem {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 !important;
    height: 100%;
    width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
}

.fullHeightItem .ant-form-item-row {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}

.fullHeightItem .ant-form-item-control {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
    max-width: 100% !important;
}

.fullHeightItem .ant-form-item-control-input {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}

.fullHeightItem .ant-form-item-control-input-content {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}
`;

export const ResearchReportCreatePage = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [form] = Form.useForm<CreateManualResearchReportDto>();
    const keyPointsWatch = Form.useWatch('keyPoints', form);
    const predictionWatch = Form.useWatch('prediction', form);
    const dataPointsWatch = Form.useWatch('dataPoints', form);
    const createMutation = useCreateManualResearchReport();

    // Theme
    const { token } = theme.useToken();

    // UI State
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [aiSectionCollapsed, setAiSectionCollapsed] = useState(true);

    // Data Fetching
    const { data: stats } = useResearchReportStats();
    const { data: provinces } = useProvinces();

    // Computed Options
    const commodityOptions = stats?.commodityDistribution?.map((item: any) => ({
        label: item.type,
        value: item.type,
    })) || [];

    const regionOptions = provinces?.map?.((p) => ({
        label: p.name,
        value: p.name,
    })) || [];

    // Check if has AI analysis data
    const hasAiData = (keyPointsWatch?.length || 0) > 0 || predictionWatch?.direction || (dataPointsWatch?.length || 0) > 0;

    const handleFinish = async (values: CreateManualResearchReportDto) => {
        // Ensure summary is physically present in the values
        if (!values.summary) {
            const currentSummary = form.getFieldValue('summary');
            if (currentSummary) {
                values.summary = currentSummary;
            } else {
                message.error('研报正文不能为空');
                return;
            }
        }

        try {
            await createMutation.mutateAsync({
                ...values,
                intelId: uploadedIntelId || undefined,
            });
            message.success('研报创建成功');
            navigate('/intel/research-reports');
        } catch (error) {
            message.error('创建失败，请重试');
            console.error(error);
        }
    };

    const analyzeMutation = useAnalyzeContent();

    // Track if an existing MarketIntel was created via upload
    const [uploadedIntelId, setUploadedIntelId] = useState<string | null>(null);
    const [uploadedAttachment, setUploadedAttachment] = useState<any>(null);

    const handleUploadSuccess = (result: any) => {
        if (result.intel?.id) {
            setUploadedIntelId(result.intel.id);
        }

        if (result.attachment) {
            setUploadedAttachment(result.attachment);
        }

        const content = result.intel?.rawContent;
        if (content) {
            const currentContent = form.getFieldValue('summary') || '';
            const isHtml = /^\s*<.*>/.test(content) || /<br\/>|<p>|<div>/i.test(content);

            const processedContent = isHtml
                ? content
                : content.split('\n')
                    .map((line: string) => line.trim())
                    .filter((line: string) => line.length > 0)
                    .map((line: string) => `<p>${line}</p>`)
                    .join('');

            const newContent = currentContent
                ? `${currentContent}${processedContent}`
                : processedContent;

            form.setFieldValue('summary', newContent);
            message.success('文档解析成功，内容已自动填入');
        } else {
            message.warning({
                content: '文档上传成功，但未提取到文本内容（可能是图片或扫描件）。请手动输入正文。',
                duration: 5,
            });
        }
    };

    const handleAnalyzeEditorContent = async () => {
        if (analyzeMutation.isPending) return;

        const content = form.getFieldValue('summary');
        if (!content || content.replace(/<[^>]*>?/gm, '').trim().length === 0) {
            message.warning('编辑器内容为空，无法分析');
            return;
        }
        await performAnalysis(content);
    };

    const performAnalysis = async (content: string) => {
        if (analyzeMutation.isPending) return;

        const hide = message.loading('AI 正在深度分析研报内容...', 0);

        try {
            const result = await analyzeMutation.mutateAsync({
                content: content,
                category: IntelCategory.C_DOCUMENT,
                contentType: ContentType.RESEARCH_REPORT,
            });

            if (result) {
                const updates: Partial<CreateManualResearchReportDto> = {};
                const extractedFields: string[] = [];

                if (result.extractedData?.title && !form.getFieldValue('title')) {
                    updates.title = result.extractedData.title;
                    extractedFields.push('标题');
                }

                if (result.commodities?.length) {
                    updates.commodities = result.commodities;
                    extractedFields.push('关联品种');
                }
                if (result.regions?.length) {
                    updates.regions = result.regions;
                    extractedFields.push('关联区域');
                }

                if (result.reportType) updates.reportType = result.reportType;
                if (result.reportPeriod) updates.reportPeriod = result.reportPeriod;

                if (result.keyPoints?.length) {
                    updates.keyPoints = result.keyPoints.map(kp => ({
                        ...kp,
                        sentiment: kp.sentiment === 'bullish' ? 'positive' :
                            kp.sentiment === 'bearish' ? 'negative' :
                                kp.sentiment === 'neutral' ? 'neutral' :
                                    kp.sentiment,
                    }));
                    extractedFields.push('核心观点');
                }

                if (result.prediction) {
                    updates.prediction = {
                        direction: result.prediction.direction,
                        timeframe: result.prediction.timeframe,
                        reasoning: result.prediction.logic || result.prediction.reasoning,
                    };
                    extractedFields.push('后市预判');
                }

                if (result.dataPoints?.length) {
                    updates.dataPoints = result.dataPoints.map(dp => ({
                        metric: dp.metric,
                        value: dp.value,
                        unit: dp.unit
                    }));
                    extractedFields.push('关键数据');
                }

                form.setFieldsValue(updates);
                setAiSectionCollapsed(false); // 展开 AI 分析区

                if (extractedFields.length > 0) {
                    message.success(`AI 分析完成，已自动提取：${extractedFields.join('、')}`);
                } else {
                    message.info('AI 分析完成，但未提取到关键结构化信息');
                }
            }
        } catch (error) {
            console.error(error);
            message.error('AI 分析失败，请检查网络或重试');
        } finally {
            hide();
        }
    };

    const handleUploadAnalysisTrigger = async (content: string) => {
        await performAnalysis(content);
    };

    const initialValues = useMemo(() => ({
        reportType: ReportType.MARKET,
        publishDate: new Date(),
        summary: '',
    }), []);

    const isOfficeDoc = (filename?: string, mime?: string) => {
        if (!filename) return false;
        return /\.(doc|docx|ppt|pptx)$/i.test(filename) ||
            mime?.includes('word') ||
            mime?.includes('presentation') ||
            mime?.includes('powerpoint');
    };

    const renderDocumentPreview = () => {
        if (!uploadedAttachment) {
            return (
                <Empty
                    description="暂无上传文档"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ padding: 60 }}
                />
            );
        }

        if (uploadedAttachment.mimeType === 'application/pdf' || uploadedAttachment.filename?.endsWith('.pdf')) {
            return (
                <iframe
                    src={`/api/market-intel/attachments/${uploadedAttachment.id}/download?inline=true`}
                    style={{ width: '100%', height: '70vh', border: 'none' }}
                    title="Document Preview"
                />
            );
        }

        if (isOfficeDoc(uploadedAttachment.filename, uploadedAttachment.mimeType)) {
            return (
                <div style={{
                    height: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    background: token.colorBgLayout
                }}>
                    <Result
                        icon={<FileWordOutlined style={{ color: token.colorPrimary }} />}
                        title="Office 文档暂不支持在线预览"
                        subTitle={uploadedAttachment.filename}
                        extra={
                            <Button type="primary" href={`/api/market-intel/attachments/${uploadedAttachment.id}/download`} target="_blank">
                                下载查看
                            </Button>
                        }
                    />
                </div>
            );
        }

        if (uploadedAttachment.mimeType?.startsWith('image/')) {
            return (
                <div style={{ padding: 20, textAlign: 'center' }}>
                    <img
                        src={`/api/market-intel/attachments/${uploadedAttachment.id}/download?inline=true`}
                        alt="Preview"
                        style={{ maxWidth: '100%', maxHeight: '70vh' }}
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <>
            <style>{cssStyles}</style>
            <PageContainer
                header={{
                    title: '智能研报工作台',
                    subTitle: 'Intelligent Research Workbench',
                    onBack: () => navigate('/intel/research-reports'),
                    extra: [
                        <Button
                            key="ai"
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleAnalyzeEditorContent}
                            loading={analyzeMutation.isPending}
                            size="large"
                        >
                            AI 深度分析
                        </Button>,
                    ],
                }}
            >
                <ProForm<CreateManualResearchReportDto>
                    form={form}
                    onFinish={handleFinish}
                    layout="vertical"
                    submitter={{
                        render: () => (
                            <div
                                style={{
                                    position: 'sticky',
                                    bottom: 0,
                                    zIndex: 99,
                                    padding: '16px 24px',
                                    margin: '24px -24px -24px -24px',
                                    background: token.colorBgContainer,
                                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: 12,
                                    boxShadow: token.boxShadowSecondary,
                                }}
                            >
                                <Button onClick={() => form.resetFields()}>
                                    重置
                                </Button>
                                <Button
                                    type="primary"
                                    onClick={() => form.submit()}
                                    loading={createMutation.isPending}
                                    icon={<CheckCircleOutlined />}
                                    size="large"
                                >
                                    保存研报
                                </Button>
                            </div>
                        ),
                    }}
                    initialValues={initialValues}
                >
                    {/* ============ 上层：输入工作区 ============ */}
                    <Row gutter={[16, 16]} align="stretch" style={{ minHeight: 'calc(100vh - 140px)' }}>
                        {/* 左侧元数据栏 (20%) - 自然高度，决定页面高度 */}
                        <Col xs={24} lg={5} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16 }}>
                                {/* 情报来源 */}
                                <ProCard
                                    title={<Space><FileSearchOutlined />情报来源</Space>}
                                    bordered
                                    headerBordered
                                    size="small"
                                >
                                    <DocumentUploader
                                        contentType={ContentType.RESEARCH_REPORT}
                                        onUploadSuccess={handleUploadSuccess}
                                        onStartAnalysis={handleUploadAnalysisTrigger}
                                        isAnalyzing={analyzeMutation.isPending}
                                    />
                                    {uploadedAttachment && (
                                        <Button
                                            type="link"
                                            icon={<EyeOutlined />}
                                            onClick={() => setPreviewModalOpen(true)}
                                            style={{ padding: 0, marginTop: 8 }}
                                        >
                                            预览原始文档
                                        </Button>
                                    )}
                                </ProCard>

                                {/* 基础信息 */}
                                <ProCard
                                    title="基础信息"
                                    bordered
                                    headerBordered
                                    size="small"
                                >
                                    <ProFormText
                                        name="title"
                                        label="报告标题"
                                        rules={[{ required: true, message: '请输入标题' }]}
                                        placeholder="请输入研报标题"
                                    />
                                    <Row gutter={8}>
                                        <Col span={12}>
                                            <ProFormSelect
                                                name="reportType"
                                                label="类型"
                                                options={Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => ({
                                                    label,
                                                    value,
                                                }))}
                                                rules={[{ required: true }]}
                                            />
                                        </Col>
                                        <Col span={12}>
                                            <ProFormSelect
                                                name="reportPeriod"
                                                label="周期"
                                                options={Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => ({
                                                    label,
                                                    value,
                                                }))}
                                            />
                                        </Col>
                                    </Row>
                                    <ProFormDatePicker
                                        name="publishDate"
                                        label="发布日期"
                                        width="100%"
                                    />
                                    <ProFormText
                                        name="source"
                                        label="来源机构"
                                        placeholder="如：中信期货"
                                    />
                                </ProCard>

                                {/* 分类标签 */}
                                <ProCard
                                    title="分类标签"
                                    bordered
                                    headerBordered
                                    size="small"
                                >
                                    <ProFormSelect
                                        name="commodities"
                                        label="关联品种"
                                        mode="tags"
                                        options={commodityOptions}
                                        placeholder="选择或输入品种"
                                    />
                                    <ProFormSelect
                                        name="regions"
                                        label="关联区域"
                                        mode="tags"
                                        options={regionOptions}
                                        placeholder="选择或输入区域"
                                    />
                                </ProCard>
                            </div>
                        </Col>

                        {/* 右侧编辑区 (80%) - 绝对定位填充，实现内部滚动且不撑开父容器 */}
                        <Col xs={24} lg={19} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 600 }}>
                                <ProCard
                                    title="研报正文"
                                    bordered
                                    headerBordered
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        overflow: 'hidden'
                                    }}
                                    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                                    extra={
                                        <Space>
                                            {uploadedAttachment && (
                                                <Button
                                                    icon={<FileSearchOutlined />}
                                                    onClick={() => setPreviewModalOpen(true)}
                                                    size="small"
                                                >
                                                    查看原始文档
                                                </Button>
                                            )}
                                            {hasAiData && (
                                                <Tag color="success" icon={<CheckCircleOutlined />}>
                                                    已完成 AI 分析
                                                </Tag>
                                            )}
                                        </Space>
                                    }
                                >
                                    <ProFormItem
                                        name="summary"
                                        rules={[{ required: true, message: '请输入正文内容' }]}
                                        style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
                                        className="fullHeightItem"
                                    >
                                        <TiptapEditor
                                            minHeight={580}
                                            placeholder="在此输入研报内容，或从左侧上传文档自动导入..."
                                        />
                                    </ProFormItem>
                                </ProCard>
                            </div>
                        </Col>
                    </Row>

                    {/* ============ 下层：AI 智能分析结果区 ============ */}
                    <ProCard
                        title={
                            <Space>
                                <RobotOutlined style={{ color: token.colorPrimary }} />
                                <span>AI 智能分析结果</span>
                                {hasAiData && <Badge status="success" text="已提取" />}
                            </Space>
                        }
                        bordered
                        headerBordered
                        collapsible
                        collapsed={aiSectionCollapsed}
                        onCollapse={setAiSectionCollapsed}
                        style={{
                            marginTop: 16,
                            background: hasAiData ? token.colorBgLayout : undefined,
                        }}
                        extra={
                            !hasAiData && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    点击上方「AI 深度分析」按钮自动提取
                                </Text>
                            )
                        }
                    >
                        <Row gutter={[16, 16]}>
                            {/* 核心观点 (40%) */}
                            <Col xs={24} lg={10}>
                                <ProCard
                                    title={
                                        <Space>
                                            <BulbOutlined style={{ color: token.colorWarning }} />
                                            <span>核心观点</span>
                                            <Badge count={keyPointsWatch?.length || 0} showZero={false} />
                                        </Space>
                                    }
                                    bordered
                                    size="small"
                                    style={{ height: '100%' }}
                                >
                                    <ProFormList
                                        name="keyPoints"
                                        itemRender={({ listDom, action }, { record }) => {
                                            const sentimentColor = record?.sentiment === 'positive'
                                                ? token.colorSuccess
                                                : record?.sentiment === 'negative'
                                                    ? token.colorError
                                                    : token.colorBorder;
                                            return (
                                                <div
                                                    style={{
                                                        marginBottom: 12,
                                                        padding: 12,
                                                        borderRadius: token.borderRadius,
                                                        border: `1px solid ${token.colorBorder}`,
                                                        borderLeftWidth: 4,
                                                        borderLeftColor: sentimentColor,
                                                        background: token.colorBgContainer
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <Space size={4}>
                                                            {record?.sentiment === 'positive' && <Tag color="success">利多</Tag>}
                                                            {record?.sentiment === 'negative' && <Tag color="error">利空</Tag>}
                                                            {record?.sentiment === 'neutral' && <Tag>中性</Tag>}
                                                            {record?.confidence && <Tag color="blue">{record.confidence}%</Tag>}
                                                        </Space>
                                                        {action}
                                                    </div>
                                                    {listDom}
                                                </div>
                                            );
                                        }}
                                        creatorButtonProps={{
                                            creatorButtonText: '添加观点',
                                            style: { width: '100%' }
                                        }}
                                    >
                                        <ProFormTextArea
                                            name="point"
                                            placeholder="输入观点摘要..."
                                            rules={[{ required: true }]}
                                            fieldProps={{ autoSize: { minRows: 2, maxRows: 4 } }}
                                        />
                                        <Row gutter={8} style={{ marginTop: 8 }}>
                                            <Col span={12}>
                                                <ProFormSelect
                                                    name="sentiment"
                                                    placeholder="情绪倾向"
                                                    valueEnum={{
                                                        positive: { text: '利多', status: 'Success' },
                                                        negative: { text: '利空', status: 'Error' },
                                                        neutral: { text: '中性', status: 'Default' },
                                                    }}
                                                />
                                            </Col>
                                            <Col span={12}>
                                                <ProFormDigit
                                                    name="confidence"
                                                    placeholder="置信度%"
                                                    min={0}
                                                    max={100}
                                                />
                                            </Col>
                                        </Row>
                                    </ProFormList>
                                </ProCard>
                            </Col>

                            {/* 后市预判 (30%) */}
                            <Col xs={24} lg={7}>
                                <ProCard
                                    title={
                                        <Space>
                                            <LineChartOutlined style={{ color: token.colorInfo }} />
                                            <span>后市预判</span>
                                            {predictionWatch?.direction && <Tag color="processing">已设置</Tag>}
                                        </Space>
                                    }
                                    bordered
                                    size="small"
                                    style={{ height: '100%' }}
                                >
                                    <ProFormSelect
                                        name={['prediction', 'direction']}
                                        label="预测方向"
                                        options={Object.entries(PREDICTION_DIRECTION_LABELS).map(([value, label]) => ({
                                            label: label,
                                            value: value,
                                        }))}
                                    />
                                    <ProFormSelect
                                        name={['prediction', 'timeframe']}
                                        label="时间周期"
                                        options={Object.entries(PREDICTION_TIMEFRAME_LABELS).map(([value, label]) => ({
                                            label: label,
                                            value: value,
                                        }))}
                                    />
                                    <ProFormTextArea
                                        name={['prediction', 'reasoning']}
                                        label="预测逻辑"
                                        placeholder="AI 分析的预测逻辑..."
                                        fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}
                                    />
                                </ProCard>
                            </Col>

                            {/* 关键数据 (30%) */}
                            <Col xs={24} lg={7}>
                                <ProCard
                                    title={
                                        <Space>
                                            <BarChartOutlined style={{ color: token.colorSuccess }} />
                                            <span>关键数据</span>
                                            <Badge count={dataPointsWatch?.length || 0} showZero={false} />
                                        </Space>
                                    }
                                    bordered
                                    size="small"
                                    style={{ height: '100%' }}
                                >
                                    <ProFormList
                                        name="dataPoints"
                                        itemRender={({ listDom, action }) => (
                                            <div
                                                style={{
                                                    marginBottom: 8,
                                                    padding: 12,
                                                    borderRadius: token.borderRadius,
                                                    border: `1px solid ${token.colorBorder}`,
                                                    background: token.colorBgContainer
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                                                    {action}
                                                </div>
                                                {listDom}
                                            </div>
                                        )}
                                        creatorButtonProps={{
                                            creatorButtonText: '添加数据指标',
                                            style: { width: '100%' }
                                        }}
                                    >
                                        <ProFormText
                                            name="metric"
                                            placeholder="指标名称 (如: 收盘价)"
                                            rules={[{ required: true }]}
                                        />
                                        <Row gutter={8} style={{ marginTop: 8 }}>
                                            <Col span={14}>
                                                <ProFormText
                                                    name="value"
                                                    placeholder="数值"
                                                    rules={[{ required: true }]}
                                                />
                                            </Col>
                                            <Col span={10}>
                                                <ProFormText
                                                    name="unit"
                                                    placeholder="单位"
                                                />
                                            </Col>
                                        </Row>
                                    </ProFormList>
                                </ProCard>
                            </Col>
                        </Row>
                    </ProCard>
                </ProForm>
            </PageContainer>

            {/* Document Preview Modal */}
            <Modal
                title={
                    <Space>
                        <FileSearchOutlined />
                        <span>原始文档预览</span>
                        {uploadedAttachment?.filename && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {uploadedAttachment.filename}
                            </Text>
                        )}
                    </Space>
                }
                open={previewModalOpen}
                onCancel={() => setPreviewModalOpen(false)}
                footer={null}
                width="80%"
                style={{ top: 40 }}
                styles={{ body: { padding: 0 } }}
            >
                {renderDocumentPreview()}
            </Modal>
        </>
    );
};
