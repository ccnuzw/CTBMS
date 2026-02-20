import React from 'react';
import {
    CheckCircleOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Statistic, Tag, Typography, theme } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export type StatsOverviewBarProps = {
    todayDocs: number;
    weeklyReports: number;
    weeklyReady: boolean;
    weeklyReportId?: string;
    generatingWeekly?: boolean;
    onGenerateWeekly: () => void;
};

export const StatsOverviewBar: React.FC<StatsOverviewBarProps> = ({
    todayDocs,
    weeklyReports,
    weeklyReady,
    weeklyReportId,
    generatingWeekly,
    onGenerateWeekly,
}) => {
    const { token } = theme.useToken();
    const navigate = useNavigate();

    return (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
                <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 12, borderColor: token.colorBorderSecondary, height: '100%' }}>
                    <Statistic title="今日采集" value={todayDocs} suffix="条" prefix={<FileTextOutlined />} />
                </Card>
            </Col>
            <Col xs={24} sm={8}>
                <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 12, borderColor: token.colorBorderSecondary, height: '100%' }}>
                    <Statistic
                        title="本周研报"
                        value={weeklyReports}
                        suffix="篇"
                        prefix={<CheckCircleOutlined />}
                    />
                </Card>
            </Col>
            <Col xs={24} sm={8}>
                <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 12, borderColor: token.colorBorderSecondary, height: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Text type="secondary" style={{ marginBottom: 4, fontSize: 14 }}>📅 本周周报</Text>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                            {weeklyReady ? (
                                <Space>
                                    <Tag color="success">✅ 已生成</Tag>
                                    <Button type="link" onClick={() => weeklyReportId && navigate(`/intel/knowledge/items/${weeklyReportId}`)} style={{ padding: 0 }}>查看</Button>
                                </Space>
                            ) : (
                                <Space>
                                    <Tag color="warning">⏳ 未生成</Tag>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<ThunderboltOutlined />}
                                        loading={generatingWeekly}
                                        onClick={onGenerateWeekly}
                                    >
                                        一键生成
                                    </Button>
                                </Space>
                            )}
                        </div>
                    </div>
                </Card>
            </Col>
        </Row>
    );
};
