import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Row, Col, Card, Statistic, Space, Button } from 'antd';
import {
    FileTextOutlined,
    EyeOutlined,
    DownloadOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import { useResearchReportStats } from '../api/hooks';
import { ReportTrendChart } from './research-report-dashboard/ReportTrendChart';
import { ReportDistributionCharts } from './research-report-dashboard/ReportDistributionCharts';
import { RecentReportsList } from './research-report-dashboard/RecentReportsList';
import { REPORT_TYPE_LABELS } from '@packages/types';

export const ResearchReportDashboard: React.FC = () => {
    const { data: stats, isLoading, refetch } = useResearchReportStats();

    // 转换类型数据为图表格式
    const typeData = stats?.byType
        ? Object.entries(stats.byType).map(([type, value]) => ({
            type: REPORT_TYPE_LABELS[type as keyof typeof REPORT_TYPE_LABELS] || type,
            value: value as number,
        }))
        : [];

    // 转换来源数据
    const sourceData = stats?.bySource || [];

    // 趋势数据
    const trendData = stats?.trend || [];

    // 最近更新
    const recentReports = stats?.recent || [];

    return (
        <PageContainer
            header={{
                title: '研报统计仪表盘',
                extra: [
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined />}
                        onClick={() => refetch()}
                        loading={isLoading}
                    >
                        刷新
                    </Button>
                ],
            }}
        >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 概览卡片 */}
                <Row gutter={16}>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false}>
                            <Statistic
                                title="研报总数"
                                value={stats?.total || 0}
                                prefix={<FileTextOutlined />}
                                loading={isLoading}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false}>
                            <Statistic
                                title="总浏览量"
                                value={stats?.totalViews || 0}
                                prefix={<EyeOutlined />}
                                loading={isLoading}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false}>
                            <Statistic
                                title="总下载量"
                                value={stats?.totalDownloads || 0}
                                prefix={<DownloadOutlined />}
                                loading={isLoading}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false}>
                            <Statistic
                                title="待审核"
                                value={stats?.byStatus?.PENDING || 0}
                                valueStyle={{ color: '#faad14' }}
                                loading={isLoading}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* 趋势图 */}
                <ReportTrendChart data={trendData} loading={isLoading} />

                {/* 分布图 */}
                <ReportDistributionCharts
                    typeData={typeData}
                    sourceData={sourceData}
                    loading={isLoading}
                />

                {/* 最近更新 */}
                <Row gutter={16}>
                    <Col xs={24} lg={12}>
                        <RecentReportsList data={recentReports} loading={isLoading} />
                    </Col>
                    <Col xs={24} lg={12}>
                        <Card title="热门品种" bordered={false} loading={isLoading}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {stats?.topCommodities?.slice(0, 5).map((item: { name: string; count: number }, index: number) => (
                                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{item.name}</span>
                                        <span style={{ color: '#8c8c8c' }}>{item.count} 篇</span>
                                    </div>
                                ))}
                            </Space>
                        </Card>
                    </Col>
                </Row>
            </Space>
        </PageContainer>
    );
};
