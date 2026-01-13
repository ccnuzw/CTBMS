import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { UserOutlined, RiseOutlined, TeamOutlined } from '@ant-design/icons';

export const DashboardPage: React.FC = () => {
    return (
        <div>

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card variant="borderless">
                        <Statistic title="总用户数" value={1128} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card variant="borderless">
                        <Statistic title="活跃会话" value={93} prefix={<RiseOutlined />} valueStyle={{ color: '#cf1322' }} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card variant="borderless">
                        <Statistic title="新增注册" value={25} suffix="/ 天" />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card variant="borderless">
                        <Statistic title="总收入" value={9850} prefix="¥" precision={2} />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Card title="活动趋势" variant="borderless">
                        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9', borderRadius: 8 }}>
                            <span style={{ color: '#999' }}>图表占位符 (使用 @ant-design/charts 或 Recharts)</span>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
