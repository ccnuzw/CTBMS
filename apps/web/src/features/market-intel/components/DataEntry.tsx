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

                        {/* ===== 新增：采集数据摘要 ===== */}
                        <Card
                            size="small"
                            title={
                                <Flex align="center" gap={8}>
                                    <ThunderboltOutlined style={{ color: token.colorPrimary }} />
                                    <Text strong>📋 采集数据摘要 - 确认入库内容</Text>
                                </Flex>
                            }
                            style={{
                                marginBottom: 24,
                                background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 100%)`,
                                border: `1px solid ${token.colorPrimaryBorder}`,
                            }}
                        >
                            {/* 主情报信息 */}
                            <Descriptions
                                size="small"
                                column={{ xs: 1, sm: 2, md: 3 }}
                                style={{ marginBottom: 16 }}
                            >
                                <Descriptions.Item label="情报类型">
                                    <Tag color={
                                        category === IntelCategory.A_STRUCTURED ? 'blue' :
                                            category === IntelCategory.B_SEMI_STRUCTURED ? 'purple' :
                                                category === IntelCategory.C_DOCUMENT ? 'orange' : 'default'
                                    }>
                                        {INTEL_CATEGORY_LABELS[category].split('：')[0]}
                                    </Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="信源类型">
                                    <Tag>{INTEL_SOURCE_TYPE_LABELS[sourceType]}</Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="置信度">
                                    <Progress
                                        percent={aiResult.confidenceScore}
                                        size="small"
                                        style={{ width: 100 }}
                                        status={aiResult.confidenceScore >= 80 ? 'success' : aiResult.confidenceScore >= 60 ? 'normal' : 'exception'}
                                    />
                                </Descriptions.Item>
                            </Descriptions>

                            <Divider style={{ margin: '12px 0' }} />

                            {/* 采集内容统计 */}
                            <Row gutter={[16, 12]}>
                                {/* 主情报 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card size="small" style={{ background: token.colorSuccessBg, borderColor: token.colorSuccessBorder }}>
                                        <Flex align="center" gap={8}>
                                            <FileTextOutlined style={{ fontSize: 20, color: token.colorSuccess }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>主情报</Text>
                                                <div>
                                                    <Text strong style={{ color: token.colorSuccess }}>1</Text>
                                                    <Text type="secondary" style={{ fontSize: 11 }}> 条待入库</Text>
                                                </div>
                                            </div>
                                        </Flex>
                                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                            {content.length} 字原文 + AI摘要
                                        </Text>
                                    </Card>
                                </Col>

                                {/* 价格数据 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card
                                        size="small"
                                        style={{
                                            background: aiResult.pricePoints?.length ? token.colorInfoBg : token.colorBgContainerDisabled,
                                            borderColor: aiResult.pricePoints?.length ? token.colorInfoBorder : token.colorBorder,
                                        }}
                                    >
                                        <Flex align="center" gap={8}>
                                            <DatabaseOutlined style={{ fontSize: 20, color: aiResult.pricePoints?.length ? token.colorInfo : token.colorTextDisabled }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>价格数据 (A类)</Text>
                                                <div>
                                                    <Text strong style={{ color: aiResult.pricePoints?.length ? token.colorInfo : token.colorTextDisabled }}>
                                                        {aiResult.pricePoints?.length || 0}
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 11 }}> 条待入库</Text>
                                                </div>
                                            </div>
                                        </Flex>
                                        {aiResult.pricePoints && aiResult.pricePoints.length > 0 && (
                                            <Flex gap={4} wrap="wrap" style={{ marginTop: 4 }}>
                                                {(() => {
                                                    const ent = aiResult.pricePoints.filter(p => p.sourceType === 'ENTERPRISE').length;
                                                    const port = aiResult.pricePoints.filter(p => p.sourceType === 'PORT').length;
                                                    const reg = aiResult.pricePoints.filter(p => !p.sourceType || p.sourceType === 'REGIONAL').length;
                                                    return (
                                                        <>
                                                            {ent > 0 && <Tag color="orange" style={{ fontSize: 10 }}>🏭企业{ent}</Tag>}
                                                            {port > 0 && <Tag color="blue" style={{ fontSize: 10 }}>⚓港口{port}</Tag>}
                                                            {reg > 0 && <Tag color="green" style={{ fontSize: 10 }}>🌍地域{reg}</Tag>}
                                                        </>
                                                    );
                                                })()}
                                            </Flex>
                                        )}
                                    </Card>
                                </Col>

                                {/* 市场心态 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card
                                        size="small"
                                        style={{
                                            background: aiResult.marketSentiment ? token.colorWarningBg : token.colorBgContainerDisabled,
                                            borderColor: aiResult.marketSentiment ? token.colorWarningBorder : token.colorBorder,
                                        }}
                                    >
                                        <Flex align="center" gap={8}>
                                            <RadarChartOutlined style={{ fontSize: 20, color: aiResult.marketSentiment ? token.colorWarning : token.colorTextDisabled }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>市场心态 (B类)</Text>
                                                <div>
                                                    {aiResult.marketSentiment ? (
                                                        <Tag color={
                                                            aiResult.marketSentiment.overall === 'bullish' ? 'success' :
                                                                aiResult.marketSentiment.overall === 'bearish' ? 'error' : 'warning'
                                                        }>
                                                            {aiResult.marketSentiment.overall === 'bullish' ? '看涨' :
                                                                aiResult.marketSentiment.overall === 'bearish' ? '看跌' :
                                                                    aiResult.marketSentiment.overall === 'mixed' ? '分化' : '中性'}
                                                        </Tag>
                                                    ) : (
                                                        <Text type="secondary" style={{ fontSize: 11 }}>未识别</Text>
                                                    )}
                                                </div>
                                            </div>
                                        </Flex>
                                        {aiResult.marketSentiment?.score !== undefined && (
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                                情绪分值: {aiResult.marketSentiment.score}
                                            </Text>
                                        )}
                                    </Card>
                                </Col>

                                {/* 后市预判 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card
                                        size="small"
                                        style={{
                                            background: aiResult.forecast?.shortTerm ? token.colorPrimaryBg : token.colorBgContainerDisabled,
                                            borderColor: aiResult.forecast?.shortTerm ? token.colorPrimaryBorder : token.colorBorder,
                                        }}
                                    >
                                        <Flex align="center" gap={8}>
                                            <BulbOutlined style={{ fontSize: 20, color: aiResult.forecast?.shortTerm ? token.colorPrimary : token.colorTextDisabled }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>后市预判</Text>
                                                <div>
                                                    {aiResult.forecast?.shortTerm ? (
                                                        <Text strong style={{ fontSize: 12 }}>已提取</Text>
                                                    ) : (
                                                        <Text type="secondary" style={{ fontSize: 11 }}>未识别</Text>
                                                    )}
                                                </div>
                                            </div>
                                        </Flex>
                                        {aiResult.forecast?.keyFactors && aiResult.forecast.keyFactors.length > 0 && (
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                                关键因素: {aiResult.forecast.keyFactors.length}个
                                            </Text>
                                        )}
                                    </Card>
                                </Col>

                                {/* 关联实体 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card
                                        size="small"
                                        style={{
                                            background: aiResult.entities?.length ? token.colorInfoBg : token.colorBgContainerDisabled,
                                            borderColor: aiResult.entities?.length ? token.colorInfoBorder : token.colorBorder,
                                        }}
                                    >
                                        <Flex align="center" gap={8}>
                                            <TeamOutlined style={{ fontSize: 20, color: aiResult.entities?.length ? token.colorInfo : token.colorTextDisabled }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>关联实体 (D类)</Text>
                                                <div>
                                                    <Text strong style={{ color: aiResult.entities?.length ? token.colorInfo : token.colorTextDisabled }}>
                                                        {aiResult.entities?.length || 0}
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 11 }}> 个企业</Text>
                                                </div>
                                            </div>
                                        </Flex>
                                        {aiResult.entities && aiResult.entities.length > 0 && (
                                            <Flex gap={4} wrap="wrap" style={{ marginTop: 4 }}>
                                                {aiResult.entities.slice(0, 3).map(ent => (
                                                    <Tag key={ent} style={{ fontSize: 10 }}>{ent}</Tag>
                                                ))}
                                                {aiResult.entities.length > 3 && (
                                                    <Tag style={{ fontSize: 10 }}>+{aiResult.entities.length - 3}</Tag>
                                                )}
                                            </Flex>
                                        )}
                                    </Card>
                                </Col>

                                {/* 原文分段 */}
                                <Col xs={24} sm={12} md={8}>
                                    <Card
                                        size="small"
                                        style={{
                                            background: aiResult.sections?.length ? token.colorSuccessBg : token.colorBgContainerDisabled,
                                            borderColor: aiResult.sections?.length ? token.colorSuccessBorder : token.colorBorder,
                                        }}
                                    >
                                        <Flex align="center" gap={8}>
                                            <FileTextOutlined style={{ fontSize: 20, color: aiResult.sections?.length ? token.colorSuccess : token.colorTextDisabled }} />
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>原文分段</Text>
                                                <div>
                                                    <Text strong style={{ color: aiResult.sections?.length ? token.colorSuccess : token.colorTextDisabled }}>
                                                        {aiResult.sections?.length || 0}
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 11 }}> 个段落</Text>
                                                </div>
                                            </div>
                                        </Flex>
                                        {aiResult.sections && aiResult.sections.length > 0 && (
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                                {aiResult.sections.map(s => s.title).slice(0, 3).join('、')}
                                                {aiResult.sections.length > 3 ? '...' : ''}
                                            </Text>
                                        )}
                                    </Card>
                                </Col>
                            </Row>

                            {/* 入库预览提示 */}
                            <Alert
                                type="info"
                                showIcon
                                icon={<InfoCircleOutlined />}
                                message={
                                    <Flex justify="space-between" align="center">
                                        <span>
                                            点击【确认入库】后，以上数据将写入：
                                            <Text strong> 1条主情报</Text>
                                            {aiResult.pricePoints?.length ? <Text strong> + {aiResult.pricePoints.length}条价格数据</Text> : null}
                                            {aiResult.entities?.length ? <Text strong> + {aiResult.entities.length}个实体关联</Text> : null}
                                        </span>
                                    </Flex>
                                }
                                style={{ marginTop: 16 }}
                            />
                        </Card>
                        {/* ===== 采集数据摘要结束 ===== */}

                        {/* 详细解析结果 - 可展开查看 */}
                        <Collapse
                            items={[{
                                key: 'details',
                                label: (
                                    <Flex align="center" gap={8}>
                                        <FileTextOutlined />
                                        <Text strong>查看详细解析结果</Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            (点击展开查看摘要、标签、价格明细等)
                                        </Text>
                                    </Flex>
                                ),
                                children: (
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

                                                {/* 日报提取的价格点列表 (A类扩展) */}
                                                {aiResult.pricePoints && aiResult.pricePoints.length > 0 && (() => {
                                                    // 按类型分组
                                                    const enterprisePrices = aiResult.pricePoints.filter(p => p.sourceType === 'ENTERPRISE');
                                                    const portPrices = aiResult.pricePoints.filter(p => p.sourceType === 'PORT');
                                                    const regionalPrices = aiResult.pricePoints.filter(p => p.sourceType === 'REGIONAL' || !p.sourceType);

                                                    const renderPriceList = (prices: typeof aiResult.pricePoints, title: string, icon: React.ReactNode, bgColor: string) => (
                                                        prices && prices.length > 0 && (
                                                            <div style={{ marginBottom: 8 }}>
                                                                <Flex gap={4} align="center" style={{ marginBottom: 4 }}>
                                                                    {icon}
                                                                    <Text strong style={{ fontSize: 12 }}>{title}</Text>
                                                                    <Tag color="blue" style={{ marginLeft: 'auto' }}>{prices.length}条</Tag>
                                                                </Flex>
                                                                <div style={{ background: bgColor, borderRadius: token.borderRadius, padding: 8 }}>
                                                                    {prices.map((point, idx) => (
                                                                        <Flex
                                                                            key={idx}
                                                                            justify="space-between"
                                                                            align="center"
                                                                            style={{
                                                                                padding: '4px 0',
                                                                                borderBottom: idx < prices.length - 1 ? `1px solid ${token.colorBorderSecondary}` : undefined,
                                                                            }}
                                                                        >
                                                                            <Flex gap={4} align="center">
                                                                                <Text>{point.location}</Text>
                                                                                {point.note && (
                                                                                    <Tag style={{ fontSize: 10, padding: '0 4px' }}>{point.note}</Tag>
                                                                                )}
                                                                            </Flex>
                                                                            <Flex gap={8} align="center">
                                                                                <Text strong style={{ color: token.colorPrimary }}>
                                                                                    {point.price} {point.unit}
                                                                                </Text>
                                                                                {point.change !== null && point.change !== undefined && (
                                                                                    <Text
                                                                                        style={{
                                                                                            color: point.change > 0 ? token.colorSuccess : point.change < 0 ? token.colorError : token.colorTextSecondary,
                                                                                        }}
                                                                                    >
                                                                                        {point.change > 0 ? `↑${point.change}` : point.change < 0 ? `↓${Math.abs(point.change)}` : '→'}
                                                                                    </Text>
                                                                                )}
                                                                            </Flex>
                                                                        </Flex>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    );

                                                    return (
                                                        <Card
                                                            size="small"
                                                            title={
                                                                <Flex justify="space-between" align="center">
                                                                    <Text style={{ fontSize: 12 }}>
                                                                        <DatabaseOutlined style={{ color: token.colorPrimary }} /> 提取的价格数据 (A类)
                                                                    </Text>
                                                                    <Tag color="blue">{aiResult.pricePoints!.length} 条</Tag>
                                                                </Flex>
                                                            }
                                                        >
                                                            <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                                                {renderPriceList(enterprisePrices, '🏭 企业收购价', null, `${token.colorWarning}08`)}
                                                                {renderPriceList(portPrices, '⚓ 港口价格', null, `${token.colorInfo}08`)}
                                                                {renderPriceList(regionalPrices, '🌍 地域市场价', null, `${token.colorSuccess}08`)}
                                                            </div>
                                                            <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
                                                                提交后将自动同步到价格数据库，企业价格会尝试关联系统中的企业档案
                                                            </Text>
                                                        </Card>
                                                    );
                                                })()}

                                                {/* 市场心态分析 (B类扩展) */}
                                                {aiResult.marketSentiment && (
                                                    <Card
                                                        size="small"
                                                        title={
                                                            <Text style={{ fontSize: 12 }}>
                                                                <RadarChartOutlined style={{ color: token.colorWarning }} /> 市场心态分析 (B类)
                                                            </Text>
                                                        }
                                                        style={{
                                                            background: aiResult.marketSentiment.overall === 'bullish'
                                                                ? `${token.colorSuccess}08`
                                                                : aiResult.marketSentiment.overall === 'bearish'
                                                                    ? `${token.colorError}08`
                                                                    : `${token.colorWarning}08`,
                                                        }}
                                                    >
                                                        <Flex gap={8} style={{ marginBottom: 8 }}>
                                                            <Tag
                                                                color={
                                                                    aiResult.marketSentiment.overall === 'bullish'
                                                                        ? 'success'
                                                                        : aiResult.marketSentiment.overall === 'bearish'
                                                                            ? 'error'
                                                                            : 'warning'
                                                                }
                                                            >
                                                                {aiResult.marketSentiment.overall === 'bullish' && '看涨'}
                                                                {aiResult.marketSentiment.overall === 'bearish' && '看跌'}
                                                                {aiResult.marketSentiment.overall === 'neutral' && '中性'}
                                                                {aiResult.marketSentiment.overall === 'mixed' && '分化'}
                                                            </Tag>
                                                            {aiResult.marketSentiment.score !== undefined && (
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    情绪分值: {aiResult.marketSentiment.score}
                                                                </Text>
                                                            )}
                                                        </Flex>
                                                        {aiResult.marketSentiment.summary && (
                                                            <Paragraph style={{ fontSize: 13, margin: 0 }}>
                                                                {aiResult.marketSentiment.summary}
                                                            </Paragraph>
                                                        )}
                                                        {(aiResult.marketSentiment.traders || aiResult.marketSentiment.processors) && (
                                                            <div style={{ marginTop: 8 }}>
                                                                {aiResult.marketSentiment.traders && (
                                                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                                        贸易商: {aiResult.marketSentiment.traders}
                                                                    </Text>
                                                                )}
                                                                {aiResult.marketSentiment.processors && (
                                                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                                        加工企业: {aiResult.marketSentiment.processors}
                                                                    </Text>
                                                                )}
                                                            </div>
                                                        )}
                                                    </Card>
                                                )}

                                                {/* 后市预判 */}
                                                {aiResult.forecast && (aiResult.forecast.shortTerm || aiResult.forecast.keyFactors?.length) && (
                                                    <Card size="small" title={<Text style={{ fontSize: 12 }}>后市预判</Text>}>
                                                        {aiResult.forecast.shortTerm && (
                                                            <Paragraph style={{ fontSize: 13, marginBottom: 4 }}>
                                                                <Text strong>短期: </Text>{aiResult.forecast.shortTerm}
                                                            </Paragraph>
                                                        )}
                                                        {aiResult.forecast.mediumTerm && (
                                                            <Paragraph style={{ fontSize: 13, marginBottom: 4 }}>
                                                                <Text strong>中期: </Text>{aiResult.forecast.mediumTerm}
                                                            </Paragraph>
                                                        )}
                                                        {aiResult.forecast.keyFactors && aiResult.forecast.keyFactors.length > 0 && (
                                                            <Flex wrap="wrap" gap={4}>
                                                                {aiResult.forecast.keyFactors.map((factor, idx) => (
                                                                    <Tag key={idx} color="orange">{factor}</Tag>
                                                                ))}
                                                            </Flex>
                                                        )}
                                                    </Card>
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
                                ),
                            }]}
                            style={{ marginBottom: 24 }}
                        />

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
