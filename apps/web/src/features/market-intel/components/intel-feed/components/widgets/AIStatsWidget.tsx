import React from 'react';
import { Card, Row, Col, Statistic, Progress, theme, Space, Typography } from 'antd';
import { RobotOutlined, ThunderboltOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const AIStatsWidget: React.FC = () => {
    const { token } = theme.useToken();

    // Mock data for AI stats - ideally this comes from an API
    const aiStats = {
        processingSpeed: 0.8, // seconds per item
        accuracy: 92, // percentage
        dailyProcessed: 1250,
        manualInterventionRate: 5, // percentage
    };

    return (
        <Card
            title={
                <Space>
                    <RobotOutlined style={{ color: token.colorPrimary }} />
                    <span>AI 处理效能</span>
                </Space>
            }
            bodyStyle={{ padding: 20 }}
        >
            <Row gutter={[24, 24]}>
                <Col span={12}>
                    <Statistic
                        title="日处理量"
                        value={aiStats.dailyProcessed}
                        suffix="条"
                        valueStyle={{ fontSize: 20 }}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="平均耗时"
                        value={aiStats.processingSpeed}
                        suffix="s/条"
                        prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />}
                        valueStyle={{ fontSize: 20 }}
                    />
                </Col>
                <Col span={24}>
                    <div style={{ marginBottom: 8 }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text type="secondary">准确率 (Accuracy)</Text>
                            <Text strong>{aiStats.accuracy}%</Text>
                        </Space>
                        <Progress
                            percent={aiStats.accuracy}
                            strokeColor={token.colorSuccess}
                            showInfo={false}
                            size="small"
                        />
                    </div>
                    <div>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Text type="secondary">人工干预率</Text>
                            <Text strong>{aiStats.manualInterventionRate}%</Text>
                        </Space>
                        <Progress
                            percent={aiStats.manualInterventionRate}
                            strokeColor={token.colorWarning}
                            showInfo={false}
                            size="small"
                        />
                    </div>
                </Col>
            </Row>
        </Card>
    );
};
