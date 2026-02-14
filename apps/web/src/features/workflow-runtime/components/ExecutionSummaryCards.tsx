import React from 'react';
import { Card, Col, Row, Statistic, theme } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    StopOutlined,
} from '@ant-design/icons';

interface ExecutionSummaryCardsProps {
    total: number;
    successCount?: number; // Optional until backend supports it
    blockedCount?: number;  // Optional until backend supports it
    avgDuration?: number;   // Optional until backend supports it
}

export const ExecutionSummaryCards: React.FC<ExecutionSummaryCardsProps> = ({
    total,
    successCount,
    blockedCount,
    avgDuration,
}) => {
    const { token } = theme.useToken();

    return (
        <Row gutter={16}>
            <Col span={6}>
                <Card bordered={false}>
                    <Statistic
                        title="总执行次数"
                        value={total}
                        prefix={<ClockCircleOutlined />}
                    />
                </Card>
            </Col>
            <Col span={6}>
                <Card bordered={false}>
                    <Statistic
                        title="成功率"
                        value={total > 0 && successCount !== undefined ? Math.round((successCount / total) * 100) : '-'}
                        suffix="%"
                        valueStyle={{ color: token.colorSuccess }}
                        prefix={<CheckCircleOutlined />}
                    />
                </Card>
            </Col>
            <Col span={6}>
                <Card bordered={false}>
                    <Statistic
                        title="风控阻断"
                        value={blockedCount ?? '-'}
                        valueStyle={{ color: token.colorError }}
                        prefix={<StopOutlined />}
                    />
                </Card>
            </Col>
            <Col span={6}>
                <Card bordered={false}>
                    <Statistic
                        title="平均耗时"
                        value={avgDuration ? `${avgDuration}ms` : '-'}
                        prefix={<ExclamationCircleOutlined />}
                    />
                </Card>
            </Col>
        </Row>
    );
};
