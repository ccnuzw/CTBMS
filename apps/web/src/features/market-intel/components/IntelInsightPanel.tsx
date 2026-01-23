import React, { useState, useEffect, useRef } from 'react';
import { Card, Empty, Skeleton, Typography, Tag, Descriptions, Space, Divider, Alert, Steps, theme } from 'antd';
import {
    BarChartOutlined,
    LineChartOutlined,
    FileSearchOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    BulbOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import {
    type AIAnalysisResult,
    ContentType,
    CONTENT_TYPE_LABELS,
    INTEL_SOURCE_TYPE_LABELS,
    IntelSourceType,
} from '../types';
import { DailyReportInsight } from './DailyReportInsight';

const { Title, Text, Paragraph } = Typography;

// 动态提示信息池
const LOADING_TIPS = [
    '正在提取实体、识别价格点、构建知识图谱关联',
    '分析市场情绪和价格趋势...',
    '识别关键企业和采集点信息...',
    '提取结构化价格数据...',
    '构建行业知识图谱关联...',
    '分析市场事件和政策影响...',
    '生成深度洞察和后市预判...',
    '优化数据关联和验证...',
];

interface IntelInsightPanelProps {
    isLoading: boolean;
    aiResult: AIAnalysisResult | null;
    contentType: ContentType;
}

export const IntelInsightPanel: React.FC<IntelInsightPanelProps> = ({
    isLoading,
    aiResult,
    contentType,
}) => {
    const { token } = theme.useToken();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);
    const [currentStep, setCurrentStep] = useState(1);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 计时器和动态提示
    useEffect(() => {
        if (isLoading) {
            // 重置状态
            setElapsedSeconds(0);
            setTipIndex(0);
            setCurrentStep(1);

            // 每秒更新时间
            timerRef.current = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1);
            }, 1000);

            // 每3秒更换提示
            const tipTimer = setInterval(() => {
                setTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
            }, 3000);

            // 模拟步骤进度
            const stepTimer = setInterval(() => {
                setCurrentStep((prev) => Math.min(prev + 1, 3));
            }, 4000);

            return () => {
                if (timerRef.current) clearInterval(timerRef.current);
                clearInterval(tipTimer);
                clearInterval(stepTimer);
            };
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [isLoading]);

    // 1. Loading State
    if (isLoading) {
        return (
            <Card
                style={{ height: '100%', minHeight: 600 }}
                bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <SyncOutlined spin style={{ fontSize: 48, color: token.colorPrimary, marginBottom: 24 }} />
                    <Title level={4}>AI 正在深度解析...</Title>
                    <Text type="secondary" style={{ display: 'block', minHeight: 22, transition: 'opacity 0.3s' }}>
                        {LOADING_TIPS[tipIndex]}
                    </Text>
                    <div style={{ marginTop: 16 }}>
                        <Tag icon={<ClockCircleOutlined />} color="processing" style={{ fontSize: 14, padding: '4px 12px' }}>
                            已等待 {elapsedSeconds} 秒
                        </Tag>
                        {elapsedSeconds > 10 && (
                            <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                                AI 分析需要 10-30 秒，请耐心等待
                            </Text>
                        )}
                    </div>
                </div>
                <div style={{ padding: '0 40px' }}>
                    <Steps
                        current={currentStep}
                        items={[
                            { title: '文档预处理', status: currentStep > 0 ? 'finish' : 'process', icon: <FileSearchOutlined /> },
                            { title: 'NLP 实体提取', status: currentStep > 1 ? 'finish' : currentStep === 1 ? 'process' : 'wait', icon: currentStep === 1 ? <SyncOutlined spin /> : <SyncOutlined /> },
                            { title: '知识图谱关联', status: currentStep > 2 ? 'finish' : currentStep === 2 ? 'process' : 'wait', icon: currentStep === 2 ? <SyncOutlined spin /> : <LineChartOutlined /> },
                            { title: '结果生成', status: currentStep > 3 ? 'finish' : currentStep === 3 ? 'process' : 'wait', icon: currentStep === 3 ? <SyncOutlined spin /> : <CheckCircleOutlined /> },
                        ]}
                    />
                    <Divider />
                    <Skeleton active paragraph={{ rows: 6 }} />
                </div>
            </Card>
        );
    }


    // 2. Result State
    if (aiResult) {
        return (
            <Card
                title={
                    <Space>
                        <BulbOutlined style={{ color: '#faad14' }} />
                        <span>情报透视</span>
                    </Space>
                }
                extra={<Tag color="green">解析成功</Tag>}
                style={{ height: '100%', minHeight: 600, overflow: 'auto' }}
            >
                {/* 校验信息 - Common for all types */}
                {aiResult.validationMessage && (
                    <Alert
                        message="异常检测"
                        description={aiResult.validationMessage}
                        type="warning"
                        showIcon
                        style={{ marginBottom: 24 }}
                    />
                )}

                {/* Specialized View for Daily Reports */}
                {contentType === ContentType.DAILY_REPORT ? (
                    <DailyReportInsight aiResult={aiResult} />
                ) : (
                    // Generic View for other types (Research Report / Policy)
                    <>
                        <Card type="inner" title="核心摘要" size="small" style={{ marginBottom: 16 }}>
                            <Paragraph>{aiResult.summary}</Paragraph>
                            <Space size={[0, 8]} wrap>
                                {aiResult.tags.map((tag) => (
                                    <Tag key={tag} color="blue">#{tag}</Tag>
                                ))}
                            </Space>
                        </Card>

                        <Descriptions
                            title="结构化提取"
                            bordered
                            column={{ xs: 1, sm: 2, lg: 2 }}
                            size="small"
                        >
                            <Descriptions.Item label="置信度">
                                <Text type={aiResult.confidenceScore > 80 ? 'success' : 'warning'}>
                                    {aiResult.confidenceScore}分
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="情感倾向">
                                <Tag color={
                                    aiResult.sentiment === 'positive' ? 'green' :
                                        aiResult.sentiment === 'negative' ? 'red' : 'default'
                                }>
                                    {aiResult.sentiment === 'positive' ? '利多' :
                                        aiResult.sentiment === 'negative' ? '利空' : '中性'}
                                </Tag>
                            </Descriptions.Item>

                            {/* 实体识别 */}
                            {aiResult.entities && aiResult.entities.length > 0 && (
                                <Descriptions.Item label="关联实体" span={2}>
                                    <Space wrap>
                                        {aiResult.entities.map(e => <Tag key={e}>{e}</Tag>)}
                                    </Space>
                                </Descriptions.Item>
                            )}

                            {/* 提取数据 */}
                            {aiResult.extractedData && (
                                <Descriptions.Item label="关键数据" span={2}>
                                    <pre style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, margin: 0 }}>
                                        {JSON.stringify(aiResult.extractedData, null, 2)}
                                    </pre>
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </>
                )}
            </Card>
        );
    }

    // 3. Idle State
    return (
        <Card
            style={{ height: '100%', minHeight: 600 }}
            bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <div style={{ textAlign: 'center' }}>
                        <Title level={4}>等待采集...</Title>
                        <Text type="secondary">
                            请在左侧控制台输入情报或上传文档<br />
                            AI 助手将实时为您解析
                        </Text>
                        <div style={{ marginTop: 24 }}>
                            <Space>
                                <Tag icon={<BarChartOutlined />}>自动提取价格</Tag>
                                <Tag icon={<LineChartOutlined />}>生成趋势分析</Tag>
                                <Tag icon={<FileSearchOutlined />}>知识库归档</Tag>
                            </Space>
                        </div>
                    </div>
                }
            />
        </Card>
    );
};
