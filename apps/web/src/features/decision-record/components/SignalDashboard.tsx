import React from 'react';
import { Card, Col, Row, Statistic, Table, theme, Empty, Spin } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DatabaseOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Pie, Line } from '@ant-design/plots';
import { useDecisionRecordStats } from '../api';

export const SignalDashboard: React.FC = () => {
    const { token } = theme.useToken();
    const { data: stats, isLoading } = useDecisionRecordStats();

    if (isLoading) {
        return <Spin size="large" style={{ display: 'block', margin: '50px auto' }} />;
    }

    if (!stats) {
        return <Empty description="暂无数据" />;
    }

    // Transform data for charts
    const actionData = Object.entries(stats.actionDistribution).map(([type, value]) => ({
        type,
        value,
    }));

    const riskData = Object.entries(stats.riskDistribution).map(([type, value]) => ({
        type,
        value,
    }));

    return (
        <div style={{ padding: 24 }}>
            {/* ── Key Metrics ── */}
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false}>
                        <Statistic
                            title="近30天信号总数"
                            value={stats.total}
                            prefix={<DatabaseOutlined />}
                            valueStyle={{ color: token.colorPrimary }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false}>
                        <Statistic
                            title="高风险信号 (HIGH+)"
                            value={(stats.riskDistribution['HIGH'] || 0) + (stats.riskDistribution['EXTREME'] || 0)}
                            prefix={<SafetyCertificateOutlined />}
                            valueStyle={{ color: token.colorError }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false}>
                        <Statistic
                            title="买入建议 (BUY)"
                            value={stats.actionDistribution['BUY'] || 0}
                            prefix={<ArrowUpOutlined />}
                            valueStyle={{ color: token.colorSuccess }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false}>
                        <Statistic
                            title="卖出建议 (SELL)"
                            value={stats.actionDistribution['SELL'] || 0}
                            prefix={<ArrowDownOutlined />}
                            valueStyle={{ color: token.colorWarning }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* ── Charts ── */}
            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title="决策分布 (近30天)" bordered={false}>
                        {actionData.length > 0 ? (
                            <Pie
                                data={actionData}
                                angleField="value"
                                colorField="type"
                                radius={0.8}
                                label={{
                                    text: 'value',
                                    style: {
                                        fontWeight: 'bold',
                                    },
                                }}
                                legend={{
                                    color: {
                                        title: false,
                                        position: 'right',
                                        rowPadding: 5,
                                    },
                                }}
                                height={300}
                            />
                        ) : (
                            <Empty />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="日信号趋势 (近14天)" bordered={false}>
                        {stats.dailyTrend.length > 0 ? (
                            <Line
                                data={stats.dailyTrend}
                                xField="date"
                                yField="count"
                                point={{
                                    shapeField: 'circle',
                                    sizeField: 4,
                                }}
                                interaction={{
                                    tooltip: {
                                        marker: false,
                                    },
                                }}
                                style={{
                                    lineWidth: 2,
                                }}
                                height={300}
                            />
                        ) : (
                            <Empty />
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ── Risk Distribution (Optional) ── */}
            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Card title="风险等级分布" bordered={false}>
                        {riskData.length > 0 ? (
                            <Pie
                                data={riskData}
                                angleField="value"
                                colorField="type"
                                innerRadius={0.6}
                                label={{
                                    text: 'value',
                                    style: {
                                        fontWeight: 'bold',
                                    },
                                }}
                                legend={{
                                    color: {
                                        title: false,
                                        position: 'top',
                                        rowPadding: 5,
                                    },
                                }}
                                height={250}
                            />
                        ) : <Empty />}
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
