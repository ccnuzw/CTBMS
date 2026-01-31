import React, { useState } from 'react';
import { Row, Col, Card, Typography, Spin, Empty, Radio, Flex, Statistic } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    TagsOutlined,
    PieChartOutlined
} from '@ant-design/icons';
import { Pie, Area, WordCloud } from '@ant-design/plots';
import { StatCard } from './StatCard';
import { useDocumentStats } from '../api/hooks';

const { Title, Text } = Typography;

export const DocumentStatsDashboard: React.FC = () => {
    const [days, setDays] = useState(30);
    const { data: stats, isLoading } = useDocumentStats(days);

    if (isLoading) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (!stats) {
        return <Empty description="暂无统计数据" />;
    }

    // Configs for charts
    const sourcePieConfig = {
        data: stats.bySource,
        angleField: 'value',
        colorField: 'name',
        radius: 0.8,
        label: {
            text: 'value',
            position: 'outside',
        },
        legend: {
            position: 'bottom',
        },
    };

    const trendConfig = {
        data: stats.trend,
        xField: 'date',
        yField: 'count',
        areaStyle: () => {
            return {
                fillOpacity: 0.2,
            };
        },
        smooth: true,
    };

    const wordCloudConfig = {
        data: stats.topTags,
        layout: { spiral: 'rectangular' },
        colorField: 'tag',
        textField: 'tag',
        weightField: 'count',
    };

    return (
        <div style={{ padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <Title level={4} style={{ margin: 0 }}>文档归档统计</Title>
                <Radio.Group value={days} onChange={e => setDays(e.target.value)}>
                    <Radio.Button value={7}>近7天</Radio.Button>
                    <Radio.Button value={30}>近30天</Radio.Button>
                    <Radio.Button value={90}>近3季度</Radio.Button>
                </Radio.Group>
            </Flex>

            {/* 核心指标 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="文档总数"
                        value={stats.total}
                        icon={<FileTextOutlined />}
                        color="#1890ff"
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="本月新增"
                        value={stats.monthlyNew}
                        icon={<RiseOutlined />}
                        color="#52c41a"
                        trend={12.5} // Mock trend for now
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="来源渠道"
                        value={stats.bySource.length}
                        icon={<PieChartOutlined />}
                        color="#faad14"
                        suffix="个"
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="热门标签"
                        value={stats.topTags.length}
                        icon={<TagsOutlined />}
                        color="#eb2f96"
                        suffix="个"
                    />
                </Col>
            </Row>

            {/* 图表区域 */}
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <Card title="归档趋势" bordered={false}>
                        <div style={{ height: 350 }}>
                            <Area {...trendConfig} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card title="来源分布" bordered={false}>
                        <div style={{ height: 350 }}>
                            <Pie {...sourcePieConfig} />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Card title="热门标签云" bordered={false}>
                        <div style={{ height: 300 }}>
                            <WordCloud {...wordCloudConfig} />
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
