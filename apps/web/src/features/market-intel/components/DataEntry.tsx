import React, { useState, useRef, useEffect } from 'react';
import {
    Card,
    Form,
    Input,
    Button,
    Space,
    Typography,
    Tag,
    Alert,
    Divider,
    theme,
    Upload,
    message,
    Flex,
    Radio,
    Descriptions,
    Collapse,
    Row,
    Col,
    Progress,
} from 'antd';
import {
    SendOutlined,
    AudioOutlined,
    PictureOutlined,
    EnvironmentOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    CloseOutlined,
    InfoCircleOutlined,
    LinkOutlined,
    FileTextOutlined,
    SoundOutlined,
    BulbOutlined,
    DatabaseOutlined,
    TeamOutlined,
    RadarChartOutlined,
} from '@ant-design/icons';
import { useCreateMarketIntel, useAnalyzeContent } from '../api';
import {
    IntelCategory,
    IntelSourceType,
    INTEL_CATEGORY_LABELS,
    INTEL_SOURCE_TYPE_LABELS,
    INTEL_CATEGORY_GUIDELINES,
    type AIAnalysisResult,
    type InfoCard,
} from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface DataEntryProps {
    onSuccess?: (card?: InfoCard) => void;
    onCancel?: () => void;
}

// 分类图标映射
const CATEGORY_ICONS: Record<IntelCategory, React.ReactNode> = {
    [IntelCategory.A_STRUCTURED]: <DatabaseOutlined />,
    [IntelCategory.B_SEMI_STRUCTURED]: <RadarChartOutlined />,
    [IntelCategory.C_DOCUMENT]: <FileTextOutlined />,
    [IntelCategory.D_ENTITY]: <TeamOutlined />,
};

// 分类颜色映射
const CATEGORY_COLORS: Record<string, string> = {
    blue: '#1677ff',
    purple: '#722ed1',
    orange: '#fa8c16',
    default: '#8c8c8c',
};

export const DataEntry: React.FC<DataEntryProps> = ({ onSuccess, onCancel }) => {
    const { token } = theme.useToken();
    const [form] = Form.useForm();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 状态
    const [category, setCategory] = useState<IntelCategory>(IntelCategory.B_SEMI_STRUCTURED);
    const [sourceType, setSourceType] = useState<IntelSourceType>(IntelSourceType.FIRST_LINE);
    const [content, setContent] = useState('');
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
    const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
    const [imageData, setImageData] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
    const [showGuidelines, setShowGuidelines] = useState(true);

    const createMutation = useCreateMarketIntel();
    const analyzeMutation = useAnalyzeContent();

    // 切换分类时重置状态
    useEffect(() => {
        setAiResult(null);
        setContent('');
        setImageData(null);
        setGpsStatus('idle');
        setShowGuidelines(true);
    }, [category]);

    // 计算预估质量分
    const calculatePreviewScore = () => {
        let score = 0;
        if (content.length > 50) score += 30;
        if (content.length > 500) score += 20;
        if (gpsStatus === 'success') score += 30;
        else if (sourceType !== IntelSourceType.FIRST_LINE) score += 20;
        if (imageData) score += 20;
        return Math.min(score, 100);
    };

    const previewScore = calculatePreviewScore();

    // GPS 验证
    const handleGpsVerify = () => {
        setGpsStatus('verifying');
        setTimeout(() => {
            setGpsStatus('success');
            message.success('位置验证成功：锦州港物流园区');
        }, 1500);
    };

    // 图片上传处理
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                const base64Data = base64String.split(',')[1];
                setImageData({
                    data: base64Data,
                    mimeType: file.type,
                    preview: base64String,
                });
            };
            reader.readAsDataURL(file);
        }
    };

    // AI 分析
    const handleAnalyze = async () => {
        if (!content.trim() && !imageData) {
            message.warning('请先输入内容或上传图片');
            return;
        }

        try {
            const result = await analyzeMutation.mutateAsync({
                content,
                category,
                location: '锦州港物流园区',
                base64Image: imageData?.data,
                mimeType: imageData?.mimeType,
            });
            setAiResult(result);
            setShowGuidelines(false);

            // OCR 结果自动填充
            if (result.ocrText && content.length < 50) {
                setContent((prev) => {
                    const separator = prev ? '\n\n--- OCR 识别结果 ---\n' : '--- OCR 识别结果 ---\n';
                    return prev + separator + result.ocrText;
                });
            }
        } catch {
            message.error('AI 分析失败');
        }
    };

    // 模拟语音输入
    const handleVoiceDemo = () => {
        setCategory(IntelCategory.B_SEMI_STRUCTURED);
        setSourceType(IntelSourceType.FIRST_LINE);
        setContent('刚才路过锦州港，听说因为环保检查，后面三天集港都要受限，大家都在抛货。');
        message.info('已模拟语音输入');
    };

    // 模拟文档输入
    const handleDocDemo = () => {
        setCategory(IntelCategory.C_DOCUMENT);
        setSourceType(IntelSourceType.OFFICIAL);
        setContent(
            '【2024年5月第3周 东北玉米市场周报】\n一、市场综述\n本周东北市场价格稳中偏弱，锦州港平舱价2810元/吨，较上周下跌10元。\n\n二、价格监测（表格数据）\n- 锦州港：2810元/吨（水分14.5%）\n- 鲅鱼圈：2815元/吨（水分15%）\n- 梅花味精：2750元/吨（挂牌）\n\n三、后市预测\n受阴雨天气影响，物流受阻，预计下周价格小幅反弹。',
        );
        message.info('已模拟文档输入');
    };

    // 提交
    const handleSubmit = async () => {
        if (!aiResult) {
            message.warning('请先进行 AI 分析');
            return;
        }

        if (sourceType === IntelSourceType.FIRST_LINE && gpsStatus !== 'success') {
            message.error('系统阻断：一线采集必须通过地理围栏校验！');
            return;
        }

        try {
            const totalScore = Math.round(previewScore * 0.4 + 80 * 0.3 + 0 * 0.3);
            await createMutation.mutateAsync({
                category,
                sourceType,
                rawContent: content,
                effectiveTime: aiResult.extractedEffectiveTime
                    ? new Date(aiResult.extractedEffectiveTime)
                    : new Date(),
                location: '锦州港物流园区',
                region: ['辽宁省', '锦州市'],
                gpsVerified: gpsStatus === 'success',
                aiAnalysis: aiResult,
                completenessScore: previewScore,
                scarcityScore: 80,
                validationScore: 0,
                totalScore,
                isFlagged: !!aiResult.validationMessage,
            });
            message.success('情报提交成功');
            onSuccess?.();
        } catch {
            message.error('提交失败');
        }
    };

    // 重置
    const handleReset = () => {
        setContent('');
        setAiResult(null);
        setImageData(null);
        setGpsStatus('idle');
        setShowGuidelines(true);
        form.resetFields();
    };

    const currentGuideline = INTEL_CATEGORY_GUIDELINES[category];
    const categoryColor = CATEGORY_COLORS[currentGuideline.color] || token.colorPrimary;

    return (
        <div style={{ padding: 24, background: token.colorBgLayout, minHeight: '100%', overflow: 'auto' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                {/* 标题 */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={2} style={{ marginBottom: 8 }}>
                        <ThunderboltOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />
                        智能商情采集
                    </Title>
                    <Text type="secondary">全源宽口径采集 • 统一资产封装 • AI自动治理</Text>
                </div>

                {/* 分类选择 */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {Object.entries(INTEL_CATEGORY_LABELS).map(([key, label]) => {
                        const isActive = category === key;
                        const catKey = key as IntelCategory;
                        const guideline = INTEL_CATEGORY_GUIDELINES[catKey];
                        const color = CATEGORY_COLORS[guideline.color];

                        return (
                            <Col xs={12} md={6} key={key}>
                                <Card
                                    hoverable
                                    size="small"
                                    onClick={() => setCategory(catKey)}
                                    style={{
                                        borderColor: isActive ? color : undefined,
                                        borderWidth: isActive ? 2 : 1,
                                        background: isActive ? `${color}08` : undefined,
                                    }}
                                >
                                    <Flex vertical gap={4}>
                                        <Text
                                            strong
                                            style={{
                                                fontSize: 10,
                                                textTransform: 'uppercase',
                                                color: isActive ? color : token.colorTextSecondary,
                                            }}
                                        >
                                            {CATEGORY_ICONS[catKey]} {key.split('_')[0]} 类
                                        </Text>
                                        <Text style={{ fontSize: 13, color: isActive ? color : undefined }}>
                                            {label.split('：')[1]?.split('（')[0]}
                                        </Text>
                                    </Flex>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>

                {/* 采集规范面板 */}
                {showGuidelines && (
                    <Alert
                        type="info"
                        showIcon
                        icon={<BulbOutlined style={{ color: categoryColor }} />}
                        style={{ marginBottom: 24, borderColor: categoryColor }}
                        message={
                            <Flex justify="space-between" align="center">
                                <Text strong style={{ color: categoryColor }}>
                                    {currentGuideline.title}
                                </Text>
                                <Button type="link" size="small" onClick={() => setShowGuidelines(false)}>
                                    收起说明
                                </Button>
                            </Flex>
                        }
                        description={
                            <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
                                {currentGuideline.items.map((item, idx) => (
                                    <Col xs={24} md={12} key={idx}>
                                        <Flex gap={8} align="flex-start">
                                            <div
                                                style={{
                                                    width: 4,
                                                    height: 4,
                                                    borderRadius: '50%',
                                                    background: categoryColor,
                                                    marginTop: 8,
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <div>
                                                <Text strong style={{ fontSize: 13 }}>
                                                    {item.label}：
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: 13 }}>
                                                    {item.desc}
                                                </Text>
                                            </div>
                                        </Flex>
                                    </Col>
                                ))}
                            </Row>
                        }
                    />
                )}

                {/* 规范收起后的快捷按钮 */}
                {!showGuidelines && (
                    <Flex justify="flex-end" style={{ marginBottom: 16 }}>
                        <Button
                            type="link"
                            size="small"
                            icon={<InfoCircleOutlined />}
                            onClick={() => setShowGuidelines(true)}
                        >
                            查看 {category.split('_')[0]} 类采集规范
                        </Button>
                    </Flex>
                )}

                {/* 主表单 */}
                <Card>
                    {/* 信源类型 */}
                    <Flex align="center" gap={16} style={{ marginBottom: 16 }}>
                        <Text strong style={{ fontSize: 12, color: token.colorTextSecondary }}>
                            信源类型
                        </Text>
                        <Radio.Group
                            value={sourceType}
                            onChange={(e) => setSourceType(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                            size="small"
                        >
                            {Object.entries(INTEL_SOURCE_TYPE_LABELS).map(([key, label]) => (
                                <Radio.Button key={key} value={key}>
                                    {label}
                                </Radio.Button>
                            ))}
                        </Radio.Group>
                    </Flex>

                    {/* GPS 验证 (一线采集) */}
                    {sourceType === IntelSourceType.FIRST_LINE && (
                        <Alert
                            type={gpsStatus === 'success' ? 'success' : 'warning'}
                            showIcon
                            icon={<EnvironmentOutlined />}
                            style={{ marginBottom: 16 }}
                            message={
                                <Flex justify="space-between" align="center">
                                    <Text>地理围栏校验 (System Watchdog)</Text>
                                    <Button
                                        type={gpsStatus === 'success' ? 'default' : 'primary'}
                                        size="small"
                                        loading={gpsStatus === 'verifying'}
                                        onClick={handleGpsVerify}
                                        disabled={gpsStatus === 'success'}
                                    >
                                        {gpsStatus === 'success' ? '✓ 位置已核验' : '点击打卡 (模拟GPS)'}
                                    </Button>
                                </Flex>
                            }
                        />
                    )}

                    {/* 质量分预览 */}
                    <Flex justify="flex-end" align="center" gap={8} style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <ThunderboltOutlined style={{ color: token.colorWarning }} /> 预估质量分
                        </Text>
                        <Text strong style={{ color: token.colorPrimary, fontSize: 24 }}>
                            {previewScore}
                        </Text>
                        <Text type="secondary">/100</Text>
                        {sourceType === IntelSourceType.FIRST_LINE && gpsStatus !== 'success' && (
                            <Tag color="error" style={{ marginLeft: 8 }}>
                                未通过地理围栏
                            </Tag>
                        )}
                    </Flex>

                    {/* 图片预览 */}
                    {imageData && (
                        <div style={{ marginBottom: 16, position: 'relative' }}>
                            <img
                                src={imageData.preview}
                                alt="预览"
                                style={{
                                    width: '100%',
                                    maxHeight: 200,
                                    objectFit: 'contain',
                                    borderRadius: token.borderRadius,
                                    background: token.colorBgContainerDisabled,
                                }}
                            />
                            <Button
                                type="text"
                                icon={<CloseOutlined />}
                                onClick={() => setImageData(null)}
                                style={{ position: 'absolute', top: 8, right: 8 }}
                            />
                            <Tag color="blue" style={{ position: 'absolute', bottom: 8, left: 8 }}>
                                已就绪: AI将提取此图文字 (OCR)
                            </Tag>
                        </div>
                    )}

                    {/* 内容输入 */}
                    <TextArea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={
                            category === IntelCategory.A_STRUCTURED
                                ? "请拍摄价格黑板或输入：'玉米 2800元/吨'..."
                                : category === IntelCategory.B_SEMI_STRUCTURED
                                    ? "请语音描述：'某地 发生某事 导致某种影响'..."
                                    : '【支持OCR】请上传文档图片，系统将自动识别文字。或直接粘贴全文...'
                        }
                        rows={6}
                        style={{ marginBottom: 16 }}
                    />

                    {/* 操作按钮 */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                    />

                    <Flex justify="space-between">
                        <Space>
                            <Button
                                icon={<PictureOutlined />}
                                onClick={() => fileInputRef.current?.click()}
                                type={imageData ? 'primary' : 'default'}
                                ghost={!!imageData}
                            >
                                上传图片
                            </Button>
                            <Button icon={<SoundOutlined />} onClick={handleVoiceDemo}>
                                语音演示
                            </Button>
                            <Button icon={<FileTextOutlined />} onClick={handleDocDemo}>
                                文档演示
                            </Button>
                        </Space>

                        <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleAnalyze}
                            loading={analyzeMutation.isPending}
                            disabled={!content.trim() && !imageData}
                            size="large"
                        >
                            AI 分析与校验
                        </Button>
                    </Flex>
                </Card>

                {/* AI 分析结果 */}
                {aiResult && (
                    <Card style={{ marginTop: 24 }}>
                        {/* 验证状态 */}
                        {aiResult.validationMessage ? (
                            <Alert
                                type="error"
                                showIcon
                                icon={<WarningOutlined />}
                                message="异常值阻断 (AI Validator)"
                                description={
                                    <>
                                        <Paragraph style={{ margin: 0 }}>{aiResult.validationMessage}</Paragraph>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            系统规则：价格偏离区域均价 ±5% 自动触发风控。
                                        </Text>
                                    </>
                                }
                                style={{ marginBottom: 24 }}
                            />
                        ) : (
                            <Alert
                                type="success"
                                showIcon
                                icon={<CheckCircleOutlined />}
                                message="数据逻辑校验通过，符合入库标准。"
                                style={{ marginBottom: 24 }}
                            />
                        )}

                        <Row gutter={24}>
                            {/* 左列：摘要与标签 */}
                            <Col xs={24} lg={12}>
                                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                            智能摘要 (Auto-Summary)
                                        </Text>
                                        <Paragraph strong style={{ fontSize: 16, marginTop: 8 }}>
                                            {aiResult.summary}
                                        </Paragraph>
                                    </div>

                                    <div>
                                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                            业务标签 (Business Tags)
                                        </Text>
                                        <Flex wrap="wrap" gap={8} style={{ marginTop: 8 }}>
                                            {aiResult.tags.map((tag) => (
                                                <Tag key={tag}>{tag}</Tag>
                                            ))}
                                        </Flex>
                                    </div>

                                    {/* 实体关联 */}
                                    {aiResult.entities && aiResult.entities.length > 0 && (
                                        <Card
                                            size="small"
                                            style={{ background: `${token.colorInfo}08`, borderColor: token.colorInfoBorder }}
                                        >
                                            <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                                <LinkOutlined /> 已自动关联实体 (Category D)
                                            </Text>
                                            <Flex gap={8} style={{ marginTop: 8 }}>
                                                {aiResult.entities.map((ent) => (
                                                    <Tag key={ent} color="blue">
                                                        {ent} →
                                                    </Tag>
                                                ))}
                                            </Flex>
                                            <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
                                                该情报将同步挂载到上述企业的信用档案中。
                                            </Text>
                                        </Card>
                                    )}
                                </Space>
                            </Col>

                            {/* 右列：结构化数据 */}
                            <Col xs={24} lg={12}>
                                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                        元数据提取 (Metadata)
                                    </Text>

                                    {aiResult.extractedEffectiveTime && (
                                        <Card size="small" style={{ background: `${token.colorPrimary}08` }}>
                                            <Flex justify="space-between">
                                                <Text>推断生效时间:</Text>
                                                <Text strong>{aiResult.extractedEffectiveTime}</Text>
                                            </Flex>
                                        </Card>
                                    )}

                                    {/* B类事件结构 */}
                                    {aiResult.structuredEvent && (
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="事件主体">
                                                {aiResult.structuredEvent.subject || '-'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="发生动作">
                                                <Text type="warning">{aiResult.structuredEvent.action || '-'}</Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="预估影响">
                                                <Text type="danger">{aiResult.structuredEvent.impact || '-'}</Text>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    )}

                                    {/* A类硬数据 */}
                                    {aiResult.extractedData && Object.keys(aiResult.extractedData).length > 0 && (
                                        <Descriptions bordered size="small" column={2}>
                                            {Object.entries(aiResult.extractedData).map(([k, v]) => (
                                                <Descriptions.Item key={k} label={k}>
                                                    <Text strong>{String(v)}</Text>
                                                </Descriptions.Item>
                                            ))}
                                        </Descriptions>
                                    )}

                                    {/* OCR 结果 */}
                                    {aiResult.ocrText && (
                                        <Card
                                            size="small"
                                            title={
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    <PictureOutlined /> OCR 识别结果 (已自动填入正文)
                                                </Text>
                                            }
                                        >
                                            <pre
                                                style={{
                                                    fontSize: 11,
                                                    margin: 0,
                                                    maxHeight: 120,
                                                    overflow: 'auto',
                                                    whiteSpace: 'pre-wrap',
                                                }}
                                            >
                                                {aiResult.ocrText}
                                            </pre>
                                        </Card>
                                    )}

                                    <Flex justify="space-between">
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Sentiment: {aiResult.sentiment}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Confidence: {aiResult.confidenceScore}%
                                        </Text>
                                    </Flex>
                                </Space>
                            </Col>
                        </Row>

                        <Divider />

                        {/* 提交按钮 */}
                        <Flex justify="flex-end" gap={12}>
                            <Button onClick={onCancel}>放弃</Button>
                            <Button onClick={handleReset}>重置</Button>
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                onClick={handleSubmit}
                                loading={createMutation.isPending}
                                disabled={
                                    !!aiResult.validationMessage ||
                                    (sourceType === IntelSourceType.FIRST_LINE && gpsStatus !== 'success')
                                }
                            >
                                {aiResult.validationMessage ? '请修正异常值' : '确认入库'}
                            </Button>
                        </Flex>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default DataEntry;
