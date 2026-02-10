import React, { useMemo, useState } from 'react';
import {
    Card,
    Typography,
    Button,
    Input,
    Select,
    Tag,
    Space,
    theme,
    Flex,
    Result,
    Divider,
    App,
} from 'antd';
import {
    FileTextOutlined,
    CalendarOutlined,
    SendOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    EditOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useSubmitReport, useUpdateReport, KnowledgeItem } from '../api/knowledge-hooks';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const REPORT_TYPE_META: Record<ReportType, { label: string; color: string; icon: string }> = {
    DAILY: { label: '日报', color: 'blue', icon: '📋' },
    WEEKLY: { label: '周报', color: 'cyan', icon: '📊' },
    MONTHLY: { label: '月报', color: 'purple', icon: '📑' },
};

const COMMODITY_OPTIONS = [
    { value: '玉米', label: '玉米' },
    { value: '大豆', label: '大豆' },
    { value: '小麦', label: '小麦' },
    { value: '水稻', label: '水稻' },
    { value: '豆粕', label: '豆粕' },
    { value: '菜粕', label: '菜粕' },
    { value: '棉花', label: '棉花' },
    { value: '白糖', label: '白糖' },
];

const REGION_OPTIONS = [
    { value: '华北', label: '华北' },
    { value: '东北', label: '东北' },
    { value: '华东', label: '华东' },
    { value: '华南', label: '华南' },
    { value: '华中', label: '华中' },
    { value: '西南', label: '西南' },
    { value: '西北', label: '西北' },
    { value: '全国', label: '全国' },
];

const REPORT_TEMPLATES: Record<ReportType, string> = {
    DAILY: `## 一、市场概况

今日市场整体表现平稳/波动，主要品种价格...

## 二、重点品种分析

### 1. [品种名]
- 现货价格：
- 涨跌幅：
- 成交情况：

## 三、市场要闻

1. 
2. 

## 四、后市展望

根据当前市场情况分析...`,
    WEEKLY: `## 一、本周市场回顾

本周（${dayjs().startOf('week').add(1, 'day').format('MM/DD')}-${dayjs().endOf('week').add(1, 'day').format('MM/DD')}）市场...

## 二、价格走势分析

| 品种 | 周初价 | 周末价 | 涨跌幅 |
|------|--------|--------|--------|
|      |        |        |        |

## 三、供需分析

### 供应端
- 

### 需求端
- 

## 四、政策与消息面

1. 
2. 

## 五、下周展望

`,
    MONTHLY: `## 一、${dayjs().format('YYYY年M月')}市场总结

本月市场整体运行情况...

## 二、价格月度走势

### 主要品种月度表现
| 品种 | 月初价 | 月末价 | 月涨跌幅 | 均价 |
|------|--------|--------|----------|------|
|      |        |        |          |      |

## 三、月度供需平衡分析

### 供应分析
- 

### 需求分析
- 

### 库存变化
- 

## 四、政策环境

1. 
2. 

## 五、下月展望

`,
};

export const ReportEntryForm: React.FC = () => {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const { type: routeType } = useParams<{ type: string }>();
    const [searchParams] = useSearchParams();
    const taskId = searchParams.get('taskId') || undefined;
    const { currentUser } = useVirtualUser();
    const { message } = App.useApp();

    const reportType = (
        ['DAILY', 'WEEKLY', 'MONTHLY'].includes(routeType?.toUpperCase() || '')
            ? routeType!.toUpperCase()
            : 'DAILY'
    ) as ReportType;

    const meta = REPORT_TYPE_META[reportType];
    const submitReport = useSubmitReport();
    const updateReport = useUpdateReport();

    // Edit Mode Check
    const reportId = searchParams.get('reportId');
    const isEditMode = !!reportId;

    // Fetch existing report if editing
    const { data: existingReport } = useQuery({
        queryKey: ['knowledge', reportId],
        queryFn: async () => {
            if (!reportId) return null;
            const res = await apiClient.get<KnowledgeItem>(`/knowledge/items/${reportId}`);
            return res.data;
        },
        enabled: isEditMode,
    });

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [commodities, setCommodities] = useState<string[]>([]);
    const [region, setRegion] = useState<string[]>([]);
    const [isSubmitted, setIsSubmitted] = useState(false);

    // Initialize form with existing data
    React.useEffect(() => {
        if (existingReport) {
            setTitle(existingReport.title);
            setContent(existingReport.contentPlain);
            setCommodities(existingReport.commodities || []);
            setRegion(existingReport.region || []);
        }
    }, [existingReport]);

    // Auto-generate title
    const autoTitle = useMemo(() => {
        const dateStr = dayjs().format('YYYY-MM-DD');
        const commodityStr = commodities.length > 0 ? commodities.join('/') : '综合';
        return `${dateStr} ${commodityStr}市场${meta.label}`;
    }, [commodities, meta.label]);

    const handleLoadTemplate = () => {
        setContent(REPORT_TEMPLATES[reportType]);
    };

    const handleSubmit = async () => {
        const finalTitle = title.trim() || autoTitle;

        if (!content.trim()) {
            message.warning('请填写报告内容');
            return;
        }

        if (!currentUser?.id) {
            message.error('未检测到当前用户');
            return;
        }

        try {
            if (isEditMode && reportId) {
                await updateReport.mutateAsync({
                    id: reportId,
                    type: reportType,
                    title: finalTitle,
                    contentPlain: content,
                    commodities: commodities.length > 0 ? commodities : undefined,
                    region: region.length > 0 ? region : undefined,
                    authorId: currentUser.id,
                    triggerAnalysis: true,
                });
                message.success('报告修改成功！');
            } else {
                await submitReport.mutateAsync({
                    type: reportType,
                    title: finalTitle,
                    contentPlain: content,
                    commodities: commodities.length > 0 ? commodities : undefined,
                    region: region.length > 0 ? region : undefined,
                    authorId: currentUser.id,
                    taskId,
                    triggerAnalysis: true,
                });
                message.success('报告提交成功！等待审核...');
            }
            setIsSubmitted(true);
        } catch (err: any) {
            message.error(err.response?.data?.message || '提交失败，请重试');
        }
    };

    if (isSubmitted) {
        return (
            <Result
                status="success"
                icon={<CheckCircleOutlined style={{ color: token.colorSuccess }} />}
                title="报告提交成功"
                subTitle={
                    <Space direction="vertical" align="center">
                        <Text>
                            {isEditMode
                                ? '报告已更新，AI 正在重新分析内容'
                                : '报告已提交至审核队列，AI 正在后台分析内容'}
                        </Text>
                        {taskId && <Tag color="green">关联任务已自动标记为「已提交」</Tag>}
                    </Space>
                }
                extra={[
                    <Button key="back" onClick={() => navigate('/workstation')}>
                        返回工作台
                    </Button>,
                    <Button key="knowledge" type="primary" onClick={() => navigate('/intel/knowledge/items')}>
                        查看知识库
                    </Button>,
                ]}
            />
        );
    }

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
            {/* 顶部导航 */}
            <Flex align="center" gap={12} style={{ marginBottom: 24 }}>
                <Button
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate(-1)}
                    style={{ color: token.colorTextSecondary }}
                />
                <Flex align="center" gap={8}>
                    <span style={{ fontSize: 24 }}>{meta.icon}</span>
                    <Title level={4} style={{ margin: 0 }}>
                        {isEditMode ? '编辑' : '填写'}{meta.label}
                    </Title>
                    <Tag color={meta.color}>{meta.label}</Tag>
                    {taskId && <Tag color="orange">任务关联</Tag>}
                </Flex>
            </Flex>

            {/* 主表单 */}
            <Card
                style={{
                    borderRadius: token.borderRadiusLG,
                    boxShadow: token.boxShadowSecondary,
                }}
            >
                {/* 标题 */}
                <Flex vertical gap={8} style={{ marginBottom: 24 }}>
                    <Text strong>报告标题</Text>
                    <Input
                        size="large"
                        placeholder={autoTitle}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        prefix={isEditMode ? <EditOutlined style={{ color: token.colorTextQuaternary }} /> : <FileTextOutlined style={{ color: token.colorTextQuaternary }} />}
                        allowClear
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {isEditMode ? '修改标题' : `留空将自动生成标题：${autoTitle}`}
                    </Text>
                </Flex>

                {/* 品种 + 区域 */}
                <Flex gap={16} wrap="wrap" style={{ marginBottom: 24 }}>
                    <Flex vertical gap={8} style={{ flex: 1, minWidth: 200 }}>
                        <Text strong>
                            涉及品种 <Text type="secondary" style={{ fontWeight: 'normal' }}>(可多选)</Text>
                        </Text>
                        <Select
                            mode="multiple"
                            placeholder="选择涉及品种"
                            value={commodities}
                            onChange={setCommodities}
                            options={COMMODITY_OPTIONS}
                            style={{ width: '100%' }}
                        />
                    </Flex>
                    <Flex vertical gap={8} style={{ flex: 1, minWidth: 200 }}>
                        <Text strong>
                            涉及区域 <Text type="secondary" style={{ fontWeight: 'normal' }}>(可多选)</Text>
                        </Text>
                        <Select
                            mode="multiple"
                            placeholder="选择涉及区域"
                            value={region}
                            onChange={setRegion}
                            options={REGION_OPTIONS}
                            style={{ width: '100%' }}
                        />
                    </Flex>
                </Flex>

                <Divider />

                {/* 内容区 */}
                <Flex vertical gap={8} style={{ marginBottom: 24 }}>
                    <Flex justify="space-between" align="center">
                        <Text strong>报告内容</Text>
                        <Button
                            size="small"
                            type="dashed"
                            onClick={handleLoadTemplate}
                            disabled={content.length > 0}
                        >
                            📝 加载{meta.label}模板
                        </Button>
                    </Flex>
                    <TextArea
                        rows={18}
                        placeholder={`请输入${meta.label}内容...\n\n支持 Markdown 格式，可使用标题、列表、表格等`}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                            fontSize: 14,
                            lineHeight: 1.6,
                        }}
                    />
                    <Flex justify="space-between">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <CalendarOutlined /> {dayjs().format('YYYY-MM-DD HH:mm')}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {content.length} 字
                        </Text>
                    </Flex>
                </Flex>

                <Divider />

                {/* 提交区 */}
                <Flex justify="space-between" align="center">
                    <Text type="secondary">
                        提交后将自动创建知识条目并触发 AI 智能分析
                    </Text>
                    <Space>
                        <Button onClick={() => navigate(-1)}>取消</Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleSubmit}
                            loading={submitReport.isPending}
                            disabled={!content.trim()}
                            size="large"
                        >
                            提交{meta.label}
                        </Button>
                    </Space>
                </Flex>
            </Card>
        </div>
    );
};

export default ReportEntryForm;
