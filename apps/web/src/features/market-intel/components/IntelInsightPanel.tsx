import React from 'react';
import { Card, Empty, Skeleton, Typography, Tag, Descriptions, Space, Divider, Alert, Steps } from 'antd';
import {
    BarChartOutlined,
    LineChartOutlined,
    FileSearchOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    BulbOutlined,
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
    // 1. Loading State
    if (isLoading) {
        return (
            <Card
                style={{ height: '100%', minHeight: 600 }}
                bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <SyncOutlined spin style={{ fontSize: 48, color: '#1890ff', marginBottom: 24 }} />
                    <Title level={4}>AI 正在深度解析...</Title>
                    <Text type="secondary">正在提取实体、识别价格点、构建知识图谱关联</Text>
                </div>
                <div style={{ padding: '0 40px' }}>
                    <Steps
                        current={1}
                        items={[
                            { title: '文档预处理', status: 'finish', icon: <FileSearchOutlined /> },
                            { title: 'NLP 实体提取', status: 'process', icon: <SyncOutlined spin /> },
                            { title: '知识图谱关联', status: 'wait', icon: <LineChartOutlined /> },
                            { title: '结果生成', status: 'wait', icon: <CheckCircleOutlined /> },
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
