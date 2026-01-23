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
        return "请拍摄黑板价格信息，或直接描述：'锦州港 玉米 收购价 2800元/吨，较昨日持平'...";
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
            `【2024年5月20日 东北玉米市场及港口作业日报】

一、价格动态
今日锦州港玉米收购价稳定。主流锦州港平舱价2810元/吨，较昨日持平。
鲅鱼圈港平舱价2815元/吨，微涨5元。
企业方面，梅花味精挂牌收购价2750元/吨，较上周下调20元。
中粮生化（公主岭）二等玉米收购价2730元/吨。

二、市场心态
受阴雨天气影响，基层农户惜售情绪加重，但贸易商出货积极性依然较高。深加工企业库存相对充足，多维持观望态度。整体市场情绪中性偏弱。

三、港口作业与事件
预计明日（5月21日）锦州港开始进行2号泊位检修，预计持续3天，期间装船作业将受限。
鲅鱼圈港今日到货约0.5万吨，积压车辆较多。

四、后市预判
短期内受天气和物流影响，价格可能小幅震荡。建议关注华北地区新粮上市进度。`,
        );
        message.info('已填入标准日报样稿');
    };

    // 模拟文档输入 (样稿2 - 更全面的数据)
    const handleDocDemo2 = () => {
        setContentType(ContentType.DAILY_REPORT);
        setSourceType(IntelSourceType.OFFICIAL);
        setContent(
            `【2024年5月21日 全国玉米市场综合日报】

一、东北产区价格动态

1. 港口价格
锦州港：二等玉米平舱价2810元/吨，较昨日持平；三等玉米2780元/吨，跌5元。
鲅鱼圈港：二等玉米平舱价2815元/吨，涨5元；到港价2795元/吨。
北良港：二等玉米平舱价2808元/吨，持平。
大连港：二等玉米平舱价2820元/吨，涨10元。
营口港：二等玉米到港价2790元/吨，跌5元。

2. 深加工企业收购价
梅花味精（通辽）：一等玉米挂牌价2760元/吨，较上周下调20元；二等2740元/吨。
中粮公主岭：二等玉米收购价2730元/吨，持平。
佳木斯益海：二等玉米收购价2710元/吨，涨10元。
绥化象屿：二等玉米收购价2700元/吨，持平。
吉燃：二等玉米收购价2720元/吨，跌5元。
铁岭国投：二等玉米收购价2715元/吨，持平。
长春大成：二等玉米收购价2725元/吨，涨5元。
松原嘉吉：二等玉米收购价2705元/吨，跌10元。

3. 站台价格
哈尔滨站台：二等玉米发货价2680元/吨，涨5元。
长春站台：二等玉米发货价2695元/吨，持平。
沈阳站台：二等玉米发货价2720元/吨，跌5元。

二、华北销区价格

山东潍坊：二等玉米到货价2880元/吨，涨10元。
河北石家庄：二等玉米到货价2870元/吨，持平。
河南郑州：二等玉米批发价2890元/吨，涨5元。

三、市场心态分析

1. 贸易商心态
受近期价格持续震荡影响，贸易商整体心态偏谨慎。港口贸易商出货积极性较高，部分贸易商急于出货回款，主动下调报价5-10元/吨。内陆贸易商观望情绪浓厚，收购意愿不强。

2. 深加工企业心态
深加工企业库存相对充足，平均库存天数在15-20天。多数企业维持观望态度，采购节奏放缓。部分企业反映当前玉米淀粉销售不畅，利润空间收窄，对后市持谨慎态度。

3. 农户心态
基层农户余粮不足两成，惜售情绪加重。受近期天气影响，部分农户担忧粮食霉变，有加快出货意愿。

四、港口作业与物流

1. 锦州港：今日到货量约0.8万吨，集港车辆约120辆。2号泊位今日开始检修，预计持续3天。
2. 鲅鱼圈港：今日到货量约0.5万吨，积压车辆较多，等候时间约6小时。装船作业正常。
3. 北良港：到货量约0.3万吨，作业正常。
4. 大连港：受大风影响，今日暂停装卸作业。

五、重要市场事件

1. 中储粮本周将在东北地区投放政策性玉米10万吨，预计对市场价格形成一定压制。
2. 黑龙江省发布通知，将于6月1日起实施新的粮食运输补贴政策，补贴标准提高20%。
3. 山东某大型饲料企业宣布新建年产50万吨饲料生产线，预计年底投产。

六、后市预判

短期展望（1周内）：受港口检修和政策性投放双重影响，价格可能小幅下跌10-20元/吨。
中期展望（1个月）：华北新麦即将上市，玉米替代需求将减弱，价格承压。
长期展望（3个月）：关注新季玉米种植面积和生长情况，若天气正常，秋季价格可能回落。

关键关注因素：
1. 中储粮政策性投放节奏
2. 华北新麦上市进度
3. 港口集港量变化
4. 深加工企业开机率`,
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
                                    {/* GPS Badge for First Line */}
                                    {sourceType === IntelSourceType.FIRST_LINE && (
                                        <Alert
                                            type={gpsStatus === 'success' ? 'success' : 'warning'}
                                            showIcon
                                            icon={<EnvironmentOutlined />}
                                            style={{ marginBottom: 12, padding: '4px 12px' }}
                                            message={
                                                <Flex justify="space-between" align="center">
                                                    <Text style={{ fontSize: 12 }}>LBS地理围栏校验</Text>
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        loading={gpsStatus === 'verifying'}
                                                        onClick={handleGpsVerify}
                                                        disabled={gpsStatus === 'success'}
                                                        style={{ height: 22, padding: 0 }}
                                                    >
                                                        {gpsStatus === 'success' ? '已核验' : '重新定位'}
                                                    </Button>
                                                </Flex>
                                            }
                                        />
                                    )}

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
                                <div style={{ marginTop: 24 }}>
                                    <DocumentUploader
                                        contentType={contentType}
                                        sourceType={sourceType}
                                        location={undefined}
                                        onUploadSuccess={() => {
                                            message.success('文档已成功入库');
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
                        size="small"
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
