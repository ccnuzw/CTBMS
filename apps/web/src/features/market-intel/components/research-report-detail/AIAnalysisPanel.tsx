
import React from 'react';
import { Card, Typography, Space, Statistic, List, Tag, Empty, Descriptions, Row, Col } from 'antd';
import { ResearchReportResponse } from '@packages/types';
import { RobotOutlined, RiseOutlined, FallOutlined, MinusOutlined, BulbOutlined, LineChartOutlined } from '@ant-design/icons';

import { PREDICTION_DIRECTION_LABELS, PREDICTION_TIMEFRAME_LABELS } from '../../constants';

const { Text } = Typography;

interface AIAnalysisPanelProps {
    report: ResearchReportResponse;
    mode?: 'summary' | 'data';
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ report, mode = 'summary' }) => {
    // Helper to safely access AI data which might be mapped to top-level fields or inside aiAnalysis
    // Based on previous tasks, we mapped keyPoints, prediction, dataPoints to the root of ResearchReportResponse
    // but schema.prisma definitions are Json? type.

    // Check types first. ResearchReportResponse (from types packages) defines:
    // keyPoints: any; prediction: any; dataPoints: any;

    const keyPoints = report.keyPoints as any[] || [];
    const prediction = report.prediction as any;
    const dataPoints = report.dataPoints as any[] || [];

    const getSentimentIcon = (sentiment?: string) => {
        if (sentiment === 'bullish' || sentiment === 'positive') return <RiseOutlined style={{ color: '#cf1322' }} />;
        if (sentiment === 'bearish' || sentiment === 'negative') return <FallOutlined style={{ color: '#3f8600' }} />;
        return <MinusOutlined style={{ color: '#d9d9d9' }} />;
    };

    if (mode === 'data') {
        return (
            <Card title={<Space><LineChartOutlined />关键数据指标</Space>} bordered={false} className="shadow-sm">
                {dataPoints.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                        {dataPoints.map((dp: any, idx: number) => (
                            <Card key={idx} size="small" type="inner">
                                <Statistic
                                    title={dp.metric}
                                    value={dp.value}
                                    suffix={<span style={{ fontSize: '12px', color: '#8c8c8c' }}>{dp.unit}</span>}
                                    valueStyle={{ fontSize: '18px' }}
                                />
                            </Card>
                        ))}
                    </div>
                ) : <Empty description="暂无数据提取" />}
            </Card>
        );
    }

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} lg={15}>
                <Card bordered={false} className="shadow-sm" title={<Space><BulbOutlined style={{ color: '#faad14' }} /> 关键观点</Space>}>
                    {keyPoints.length > 0 ? (
                        <List
                            dataSource={keyPoints}
                            renderItem={(item: any) => (
                                <List.Item>
                                    <Space align="start">
                                        <div style={{ marginTop: 4 }}>{getSentimentIcon(item.sentiment)}</div>
                                        <div>
                                            <Text strong>{item.point}</Text>
                                            {item.confidence && <Tag style={{ marginLeft: 8 }} color="blue">置信度: {item.confidence}%</Tag>}
                                        </div>
                                    </Space>
                                </List.Item>
                            )}
                        />
                    ) : <Empty description="暂无关键观点" />}
                </Card>
            </Col>
            <Col xs={24} lg={9}>
                <Card bordered={false} className="shadow-sm" title={<Space><RobotOutlined />AI 结论</Space>}>
                    {prediction ? (
                        <Descriptions bordered column={1} size="small">
                            <Descriptions.Item label="预测方向">
                                <Space>
                                    {getSentimentIcon(prediction.direction)}
                                    {PREDICTION_DIRECTION_LABELS[prediction.direction] || prediction.direction || '震荡'}
                                </Space>
                            </Descriptions.Item>
                            <Descriptions.Item label="时间周期">
                                {PREDICTION_TIMEFRAME_LABELS[prediction.timeframe] || prediction.timeframe || '未知'}
                            </Descriptions.Item>
                            <Descriptions.Item label="结论逻辑">{prediction.logic || prediction.reasoning || '-'}</Descriptions.Item>
                        </Descriptions>
                    ) : <Empty description="暂无 AI 结论" />}
                </Card>
            </Col>
        </Row>
    );
};
