import React, { useMemo, useState } from 'react';
import { Row, Col, Card, Statistic, Space, Button, Progress, theme, Flex } from 'antd';
import {
    FileTextOutlined,
    EyeOutlined,
    DownloadOutlined,
    ReloadOutlined,
    FileSearchOutlined,
    RiseOutlined,
    ArrowUpOutlined,
    CompassOutlined,
    TagsOutlined
} from '@ant-design/icons';
import { useResearchReportStats } from '../api/hooks';
import { ReportTrendChart } from './research-report-dashboard/ReportTrendChart';
import { ReportDistributionCharts } from './research-report-dashboard/ReportDistributionCharts';
import { RecentReportsList } from './research-report-dashboard/RecentReportsList';
import { REPORT_TYPE_LABELS } from '@packages/types';
import { useDictionaries } from '@/hooks/useDictionaries';
import { useNavigate } from 'react-router-dom';

export const ResearchReportDashboard: React.FC = () => {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const { data: stats, isLoading, refetch } = useResearchReportStats({ days });
    const { data: dictionaries } = useDictionaries(['REPORT_TYPE']);

    const reportTypeLabels = useMemo(() => {
        const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return REPORT_TYPE_LABELS as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    // 转换类型数据为图表格式
    const typeData = stats?.byType
        ? Object.entries(stats.byType).map(([type, value]) => ({
            type: reportTypeLabels[type] || type,
            value: value as number,
        }))
        : [];

    // 转换来源数据
    const sourceData = stats?.bySource || [];

    // 趋势数据
    const trendData = stats?.trend || [];

    // 最近更新
    const recentReports = stats?.recent || [];

    // 热门地区
    const topRegions = stats?.topRegions || [];

    const renderOverviewCard = (title: string, value: number, icon: React.ReactNode, color: string, suffix?: string, trend?: number) => (
        <Card bordered={false} bodyStyle={{ padding: 24 }}>
            <Statistic
                title={
                    <Space>
                        <span style={{
                            backgroundColor: `${color}15`,
                            padding: 8,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 4
                        }}>
                            {React.cloneElement(icon as React.ReactElement, { style: { color } })}
                        </span>
                        <span>{title}</span>
                    </Space>
                }
                value={value}
                suffix={suffix}
                valueStyle={{ fontWeight: 'bold' }}
                loading={isLoading}
            />
            {trend !== undefined && (
                <div style={{ marginTop: 8, color: trend >= 0 ? token.colorSuccess : token.colorError, fontSize: 12 }}>
                    <Space size={4}>
                        {trend >= 0 ? <ArrowUpOutlined /> : <ArrowUpOutlined rotate={180} />}
                        <span>{Math.abs(trend)}%</span>
                        <span style={{ color: token.colorTextSecondary }}>较上期</span>
                    </Space>
                </div>
            )}
        </Card>
    );

    return (
        <div style={{ padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <h4 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>研报统计仪表盘</h4>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={() => refetch()}
                    loading={isLoading}
                >
                    刷新
                </Button>
            </Flex>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 概览卡片 */}
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={6}>
                        {renderOverviewCard("研报总数", stats?.total || 0, <FileTextOutlined />, token.colorPrimary, "篇")}
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        {renderOverviewCard("总浏览量", stats?.totalViews || 0, <EyeOutlined />, token.colorSuccess, "次")}
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        {renderOverviewCard("总下载量", stats?.totalDownloads || 0, <DownloadOutlined />, token.colorWarning, "次")}
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        {renderOverviewCard("待审核", stats?.byStatus?.PENDING || 0, <FileSearchOutlined />, '#faad14', "篇")}
                    </Col>
                </Row>

                {/* 趋势图 */}
                <ReportTrendChart
                    data={trendData}
                    loading={isLoading}
                    days={days}
                    onDaysChange={setDays}
                />

                {/* 分布图 */}
                <ReportDistributionCharts
                    typeData={typeData}
                    sourceData={sourceData}
                    loading={isLoading}
                />

                {/* 底部详情 */}
                <Row gutter={[16, 16]}>
                    {/* 最近更新 */}
                    <Col xs={24} lg={10}>
                        <RecentReportsList data={recentReports} loading={isLoading} />
                    </Col>

                    {/* 热门分析 */}
                    <Col xs={24} lg={14}>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={12}>
                                <Card
                                    title={<Space><TagsOutlined style={{ color: token.colorPrimary }} />热门品种</Space>}
                                    bordered={false}
                                    loading={isLoading}
                                    style={{ height: '100%' }}
                                >
                                    <Flex vertical gap={16}>
                                        {stats?.topCommodities?.slice(0, 6).map((item: { name: string; count: number }, index: number) => {
                                            const maxCount = stats.topCommodities[0]?.count || 1;
                                            const percent = (item.count / maxCount) * 100;
                                            return (
                                                <div key={index}>
                                                    <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                                                        <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>{item.count} 篇</span>
                                                    </Flex>
                                                    <Progress percent={percent} showInfo={false} size="small" strokeColor={token.colorPrimary} />
                                                </div>
                                            )
                                        })}
                                        {(!stats?.topCommodities || stats.topCommodities.length === 0) && (
                                            <div style={{ textAlign: 'center', padding: '20px 0', color: token.colorTextQuaternary }}>暂无数据</div>
                                        )}
                                    </Flex>
                                </Card>
                            </Col>
                            <Col xs={24} md={12}>
                                <Card
                                    title={<Space><CompassOutlined style={{ color: token.colorSuccess }} />热门地区</Space>}
                                    bordered={false}
                                    loading={isLoading}
                                    style={{ height: '100%' }}
                                >
                                    <Flex vertical gap={16}>
                                        {topRegions?.slice(0, 6).map((item: { name: string; count: number }, index: number) => {
                                            const maxCount = topRegions[0]?.count || 1;
                                            const percent = (item.count / maxCount) * 100;
                                            return (
                                                <div key={index}>
                                                    <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                                                        <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>{item.count} 篇</span>
                                                    </Flex>
                                                    <Progress percent={percent} showInfo={false} size="small" strokeColor={token.colorSuccess} />
                                                </div>
                                            )
                                        })}
                                        {(!topRegions || topRegions.length === 0) && (
                                            <div style={{ textAlign: 'center', padding: '20px 0', color: token.colorTextQuaternary }}>暂无数据</div>
                                        )}
                                    </Flex>
                                </Card>
                            </Col>
                        </Row>
                        <Card
                            style={{ marginTop: 16, textAlign: 'center', cursor: 'pointer', borderColor: token.colorPrimary, borderStyle: 'dashed' }}
                            bodyStyle={{ padding: 12 }}
                            onClick={() => navigate('/intel/knowledge/reports/create')}
                        >
                            <Space>
                                <FileTextOutlined style={{ color: token.colorPrimary }} />
                                <span style={{ color: token.colorPrimary, fontWeight: 500 }}>发布新研报</span>
                            </Space>
                        </Card>
                    </Col>
                </Row>
            </Space>
        </div>
    );
};
