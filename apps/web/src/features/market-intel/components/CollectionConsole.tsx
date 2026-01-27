import React, { useRef } from 'react';
import { Card, Segmented, Tabs, Input, Button, Radio, Space, Typography, Tooltip, App, Flex, theme, Tag, Upload, Alert, Divider } from 'antd';
import {
    CloudUploadOutlined,
    AudioOutlined,
    FileTextOutlined,
    SendOutlined,
    ReloadOutlined,
    InboxOutlined,
    InfoCircleOutlined,
    EnvironmentOutlined,
    PictureOutlined,
    CloseOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import {
    ContentType,
    CONTENT_TYPE_LABELS,
    CONTENT_TYPE_DESCRIPTIONS,
    CONTENT_TYPE_SOURCE_OPTIONS,
    IntelSourceType,
    INTEL_SOURCE_TYPE_LABELS,
} from '../types';
import { DocumentUploader } from './DocumentUploader';
import { useTestAI } from '../api';

const { TextArea } = Input;
const { Text } = Typography;

interface ImageData {
    data: string;
    mimeType: string;
    preview: string;
}

interface CollectionConsoleProps {
    contentType: ContentType;
    setContentType: (type: ContentType) => void;
    sourceType: IntelSourceType;
    setSourceType: (type: IntelSourceType) => void;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    content: string;
    setContent: (val: string) => void;
    imageData: ImageData | null;
    setImageData: (data: ImageData | null) => void;
    gpsStatus: 'idle' | 'verifying' | 'success' | 'failed';
    handleGpsVerify: () => void;
    handleAnalyze: () => void;
    handleSubmit: () => void;
    handleReset: () => void;
    isAnalyzing: boolean;
    isSubmitting: boolean;
    aiResultAvailable: boolean;
    previewScore: number;
}

export const CollectionConsole: React.FC<CollectionConsoleProps> = ({
    contentType,
    setContentType,
    sourceType,
    setSourceType,
    activeTab,
    setActiveTab,
    content,
    setContent,
    imageData,
    setImageData,
    gpsStatus,
    handleGpsVerify,
    handleAnalyze,
    handleSubmit,
    handleReset,
    isAnalyzing,
    isSubmitting,
    aiResultAvailable,
    previewScore,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const testAIMutation = useTestAI();

    // 快捷填入 Prompt placeholder
    const getPlaceholder = () => {
        if (contentType === ContentType.RESEARCH_REPORT) return '请输入研报摘要，或切换到“文档上传”Tab直接上传 PDF...';
        if (contentType === ContentType.POLICY_DOC) return '请输入政策文件正文，或上传文件...';
        return "请拍摄黑板价格信息，或直接描述：'锦州港 玉米 收购价 2280元/吨，较昨日持平'...";
    };

    // 模拟语音输入
    const handleVoiceDemo = () => {
        setContentType(ContentType.DAILY_REPORT);
        setSourceType(IntelSourceType.FIRST_LINE);
        setContent('刚才路过锦州港，听说因为环保检查，后面三天集港都要受限，大家都在抛货。');
        message.info('已模拟语音输入');
    };

    // 模拟文档输入 (样稿)
    const handleDocDemo = () => {
        // 使用 DAILY_REPORT 确保停留在文本标签页，并展示新的透视功能
        setContentType(ContentType.DAILY_REPORT);
        setSourceType(IntelSourceType.OFFICIAL);
        setContent(
            `【2026年1月25日 南方销区玉米市场日报（饲料/贸易）】

一、销区港口价格（到汇）

1. 广东港口群
广东黄埔港：二等玉米散船到港价2450元/吨，涨10元；集装箱自提价2470元/吨。下游饲料厂提货积极性尚可。
深圳蛇口港：二等玉米成交价2445元/吨，持平。库存维持中低位。
福建漳州港：二等玉米到货价2440元/吨，稳。

2. 长江流域港口
江苏南通港：二等玉米到港价2410元/吨，跌5元。长江水位偏低，驳船运力略显紧张。
江苏镇江港：主流成交价2415元/吨，持平。
南京港：到港价2420元/吨，稳。

二、销区站点与内陆价格

1. 山东/河南销区（中转集散）
山东沂南站台：到站价2360元/吨，涨10元。当地养殖户补库需求增加。
河南塔铺站台：分销价2350元/吨，持平。
山东沙土集站：到货价2355元/吨，微涨。

2. 南方终端企业收购
海大集团（广州）：玉米进厂接收价2480元/吨，涨20元。采购策略：逢低建库，看好后市需求恢复。
双胞胎集团（南昌）：挂牌收购价2460元/吨，持平。
唐人神集团（株洲）：进厂价2450元/吨，稳。
正大集团（上海）：到厂价2440元/吨，采购节奏放缓。

三、销区市场心态
南方饲料企业节前备货基本结束，目前以刚需补库为主。受北方产区降雪影响，普遍担忧物流受阻，因此对港口现货的采购意愿有所增强，支撑价格坚挺。

四、后市预判
短期来看，销区价格将受物流成本支撑而偏强运行。重点关注广东港口库存去化速度及饲料企业开机率变化。`,
        );
        message.info('已填入标准日报样稿');
    };

    // 模拟文档输入 (样稿2 - 更全面的数据)
    const handleDocDemo2 = () => {
        setContentType(ContentType.DAILY_REPORT);
        setSourceType(IntelSourceType.OFFICIAL);
        setContent(
            `【2026年1月25日 北方产区玉米市场深度研报】

一、北方港口集港动态

1. 辽宁四港
锦州港：主流平舱价2280-2290元/吨，较昨日持平。今日晨间集港量约1.2万吨，车辆排队约5公里。
鲅鱼圈港：平舱价2285元/吨，涨5元。受降雪影响，集港效率下降，部分车辆积压。
北良港：平舱价2290元/吨，持平。**重要通知**：北良港3号泊位明日（1月26日）开始停机检修3天。
大连港：平舱价2300元/吨，涨10元。贸易商对高品质粮源抢收积极。

二、产区深加工收购详情

1. 内蒙古/吉林西部
梅花味精（通辽）：二等新粮挂牌价2230元/吨，下调10元。门前到货车辆激增，排队超100台。
内蒙古伊品（赤峰）：收购价2240元/吨，持平。
松原嘉吉生化：三等14%水挂牌价2205元/吨，跌10元。

2. 黑龙江/吉林中部
中粮生化（公主岭）：收购价2220元/吨，稳。
中粮生化（榆树）：收购价2210元/吨，持平。
黑龙江成福食品（肇东）：挂牌价2190元/吨，大幅下调20元，企业库存已满，可能会停收。
绥化象屿：收购价2190元/吨，持平。
长春大成：收购价2225元/吨，涨5元。

三、产区站台与物流
哈尔滨站台：发货价2180元/吨，涨5元。
长春站台：发货价2200元/吨，持平。
华家站：装车价2205元/吨，稳。
物流预警：黑龙江中东部遭遇大暴雪，高速封路，汽运运费单日上涨15元/吨，基层粮源外运受阻。

四、关键事件与政策
1. 政策托底：传闻中储粮将在吉林长春、四平地区新增5个收储库点，价格预计在2250元/吨左右。
2. 农户心态：受天气和价格下跌双重打击，地趴粮农户恐慌性售粮情绪减弱，转为惜售观望，期待年后价格反弹。

五、后市预判
短期（1周）：受暴雪阻断物流及政策预期支撑，港口及站台价格将止跌企稳，甚至小幅反弹。
中期（1月）：天气转好后，随着地趴粮上市最后窗口期到来，供应压力依然巨大，深加工企业压价意愿强烈。`,
        );
        message.info('已填入综合日报样稿（数据更全面）');
    };

    // 测试 AI 连接
    const handleTestAI = async () => {
        try {
            const result = await testAIMutation.mutateAsync();
            if (result.success) {
                message.success(`${result.message} - ${result.response || ''}`);
            } else {
                message.error(`${result.message}${result.error ? `: ${result.error.substring(0, 100)}` : ''}`);
            }
        } catch (error) {
            message.error('AI 连接测试失败');
        }
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

    return (
        <Card
            bordered={false}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px' }}
        >
            {/* 1. Header: Content Type Selector */}
            <div style={{ marginBottom: 24 }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        采集入库通道
                    </Text>
                </Flex>

                <Segmented
                    block
                    value={contentType}
                    onChange={(val) => setContentType(val as ContentType)}
                    options={Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => ({
                        label,
                        value,
                        icon: value === ContentType.DAILY_REPORT ? <FileTextOutlined style={{ color: '#1890ff' }} /> :
                            value === ContentType.RESEARCH_REPORT ? <InboxOutlined style={{ color: '#722ed1' }} /> :
                                <InfoCircleOutlined style={{ color: '#faad14' }} />,
                    }))}
                    size="large"
                />
                <div style={{ marginTop: 8, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        <InfoCircleOutlined style={{ marginRight: 6 }} />
                        {CONTENT_TYPE_DESCRIPTIONS[contentType]}
                    </Text>
                </div>
            </div>

            {/* 2. Source Type Selector */}
            <div style={{ marginBottom: 16 }}>
                <Flex align="center" gap={12}>
                    <Text strong style={{ fontSize: 12 }}>信源类型</Text>
                    <Radio.Group
                        value={sourceType}
                        onChange={(e) => setSourceType(e.target.value)}
                        size="small"
                        optionType="button"
                        buttonStyle="solid"
                    >
                        {(CONTENT_TYPE_SOURCE_OPTIONS[contentType] || []).map((type) => (
                            <Radio.Button key={type} value={type}>
                                {INTEL_SOURCE_TYPE_LABELS[type]}
                            </Radio.Button>
                        ))}
                    </Radio.Group>
                </Flex>
            </div>

            {/* 3. Omni-Input Area (Tabs) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    type="card"
                    style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                    items={[
                        {
                            key: 'text',
                            label: (
                                <span>
                                    <FileTextOutlined /> 智能文本/语音
                                </span>
                            ),
                            children: (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    {/* Quality Score Indicator - Mini */}
                                    <div style={{ textAlign: 'right', marginBottom: 4 }}>
                                        <Space size="large">
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {content.length} / 5000
                                            </Text>
                                            <span>
                                                <Text type="secondary" style={{ fontSize: 12 }}>预估质量分: </Text>
                                                <Text strong style={{ color: previewScore > 60 ? token.colorPrimary : token.colorWarning }}>{previewScore}</Text>
                                            </span>
                                        </Space>
                                    </div>

                                    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        {imageData && (
                                            <div style={{ marginBottom: 8, position: 'relative', width: 'fit-content' }}>
                                                <img
                                                    src={imageData.preview}
                                                    alt="预览"
                                                    style={{
                                                        height: 80,
                                                        borderRadius: 4,
                                                        border: `1px solid ${token.colorBorder}`
                                                    }}
                                                />
                                                <Button
                                                    type="primary"
                                                    shape="circle"
                                                    size="small"
                                                    icon={<CloseOutlined />}
                                                    onClick={() => setImageData(null)}
                                                    style={{ position: 'absolute', top: -8, right: -8 }}
                                                />
                                            </div>
                                        )}

                                        <TextArea
                                            placeholder={getPlaceholder()}
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            style={{
                                                flex: 1,
                                                minHeight: 300,
                                                resize: 'none',
                                                borderRadius: token.borderRadiusLG,
                                                padding: 12,
                                                fontSize: 14,
                                            }}
                                            maxLength={5000}
                                        />
                                    </div>

                                    {/* Hidden Input */}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleFileSelect}
                                    />

                                    <Flex gap={8} style={{ marginTop: 12 }}>
                                        <Tooltip title="识别图片中的文字">
                                            <Button icon={<PictureOutlined />} onClick={() => fileInputRef.current?.click()}>
                                                传图
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title="语音转文字（模拟）">
                                            <Button icon={<AudioOutlined />} onClick={handleVoiceDemo}>语音</Button>
                                        </Tooltip>
                                        <Tooltip title="粘贴样本文档（基础版）">
                                            <Button icon={<FileTextOutlined />} onClick={handleDocDemo}>样稿</Button>
                                        </Tooltip>
                                        <Tooltip title="粘贴综合日报样稿（数据更全面）">
                                            <Button icon={<FileTextOutlined />} onClick={handleDocDemo2} type="dashed">样稿2</Button>
                                        </Tooltip>
                                    </Flex>
                                </div>
                            ),
                        },
                        {
                            key: 'file',
                            label: (
                                <span>
                                    <InboxOutlined /> 文档一键投递
                                </span>
                            ),
                            children: (
                                <div style={{ marginTop: 0 }}>
                                    <DocumentUploader
                                        contentType={contentType}
                                        sourceType={sourceType}
                                        location={undefined}
                                        onUploadSuccess={() => {
                                            message.success('文档已成功入库');
                                        }}
                                        onStartAnalysis={(extractedText) => {
                                            if (extractedText) {
                                                setContent(extractedText);
                                                setActiveTab('text');
                                                message.success('已提取文档内容，准备进行 AI 分析');
                                            } else {
                                                message.warning('文档未提取到文本内容');
                                            }
                                        }}
                                        onViewDetail={(intelId) => {
                                            message.info(`即将跳转到详情页: ${intelId}`);
                                            // TODO: Navigate to detail view
                                        }}
                                    />
                                </div>
                            ),
                        },
                    ]}
                />
            </div>

            {/* 4. Action Footer */}
            <Divider style={{ margin: '16px 0' }} />
            <Flex gap={12} justify="flex-end">
                <Tooltip title="测试 AI 服务是否配置正确">
                    <Button
                        icon={<ThunderboltOutlined />}
                        loading={testAIMutation.isPending}
                        onClick={handleTestAI}
                    >
                        测试 AI
                    </Button>
                </Tooltip>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                >
                    重置
                </Button>

                {activeTab === 'text' && (
                    <>
                        <Button
                            type="primary"
                            ghost
                            icon={<ThunderboltOutlined />}
                            loading={isAnalyzing}
                            onClick={handleAnalyze}
                            disabled={!content.trim() && !imageData}
                        >
                            AI 分析
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            disabled={!aiResultAvailable}
                            loading={isSubmitting}
                            onClick={handleSubmit}
                        >
                            入库
                        </Button>
                    </>
                )}
            </Flex>
        </Card>
    );
};
