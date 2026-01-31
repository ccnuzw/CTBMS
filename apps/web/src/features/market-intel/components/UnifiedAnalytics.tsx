import React, { useState } from 'react';
import { Row, Col, Card, Typography, Spin, Empty, Radio, Flex, Statistic, Space, Button, Progress, theme } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    TagsOutlined,
    PieChartOutlined,
    EyeOutlined,
    DownloadOutlined,
    ReloadOutlined,
    FileSearchOutlined,
    ArrowUpOutlined,
    CompassOutlined,
} from '@ant-design/icons';
import { Pie, Area, WordCloud } from '@ant-design/plots';
import { StatCard } from './StatCard';
import { useDocumentStats, useResearchReportStats } from '../api/hooks';
import { ReportTrendChart } from './research-report-dashboard/ReportTrendChart';
import { ReportDistributionCharts } from './research-report-dashboard/ReportDistributionCharts';
import { RecentReportsList } from './research-report-dashboard/RecentReportsList';
import { REPORT_TYPE_LABELS } from '@packages/types';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

type AnalyticsView = 'all' | 'documents' | 'reports';

export const UnifiedAnalytics: React.FC = () => {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const [view, setView] = useState<AnalyticsView>('all');

    // Fetch both stats
    const { data: docStats, isLoading: docLoading } = useDocumentStats(days);
    const { data: reportStats, isLoading: reportLoading, refetch: refetchReports } = useResearchReportStats({ days });

    const isLoading = docLoading || reportLoading;

    // Transform report type data for charts
    const typeData = reportStats?.byType
        ? Object.entries(reportStats.byType).map(([type, value]) => ({
            type: REPORT_TYPE_LABELS[type as keyof typeof REPORT_TYPE_LABELS] || type,
            value: value as number,
        }))
        : [];

    const sourceData = reportStats?.bySource || [];
    const trendData = reportStats?.trend || [];
    const recentReports = reportStats?.recent || [];
    const topRegions = reportStats?.topRegions || [];

    // Document chart configs
    const sourcePieConfig = {
        data: docStats?.bySource || [],
        angleField: 'value',
        colorField: 'name',
        radius: 0.8,
        label: {
            text: 'value',
            position: 'outside' as const,
        },
        legend: {
            position: 'bottom' as const,
        },
    };

    const docTrendConfig = {
        data: docStats?.trend || [],
        xField: 'date',
        yField: 'count',
        areaStyle: () => ({
            fillOpacity: 0.2,
        }),
        smooth: true,
    };

    const wordCloudConfig = {
        data: docStats?.topTags || [],
        layout: { spiral: 'rectangular' as const },
        colorField: 'tag',
        textField: 'tag',
        weightField: 'count',
    };

    const handleRefresh = () => {
        refetchReports();
    };

    // Render overview cards for combined view
    const renderOverviewCards = () => (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title="研报总数"
                    value={reportStats?.total || 0}
                    icon={<FileSearchOutlined />}
                    color={token.colorPrimary}
                    suffix="篇"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title="文档总数"
                    value={docStats?.total || 0}
                    icon={<FileTextOutlined />}
                    color={token.colorSuccess}
                    suffix="份"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title="总浏览量"
                    value={reportStats?.totalViews || 0}
                    icon={<EyeOutlined />}
                    color={token.colorWarning}
                    suffix="次"
                />
            </Col>
            <Col xs={24} sm={12} lg={6}>
                <StatCard
                    title="总下载量"
                    value={reportStats?.totalDownloads || 0}
                    icon={<DownloadOutlined />}
                    color="#722ed1"
                    suffix="次"
                />
            </Col>
        </Row>
    );

    // Render document-specific stats
    const renderDocumentStats = () => (
        <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="文档总数"
                        value={docStats?.total || 0}
                        icon={<FileTextOutlined />}
                        color="#1890ff"
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="本月新增"
                        value={docStats?.monthlyNew || 0}
                        icon={<RiseOutlined />}
                        color="#52c41a"
                        trend={12.5}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="来源渠道"
                        value={docStats?.bySource?.length || 0}
                        icon={<PieChartOutlined />}
                        color="#faad14"
                        suffix="个"
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="热门标签"
                        value={docStats?.topTags?.length || 0}
                        icon={<TagsOutlined />}
                        color="#eb2f96"
                        suffix="个"
                    />
                </Col>
            </Row>

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <Card title="归档趋势" bordered={false}>
                        <div style={{ height: 350 }}>
                            <Area {...docTrendConfig} />
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
        </>
    );

    // Render report-specific stats
    const renderReportStats = () => (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} bodyStyle={{ padding: 24 }}>
                        <Statistic
                            title={
                                <Space>
                                    <span style={{
                                        backgroundColor: `${token.colorPrimary}15`,
                                        padding: 8,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 4
                                    }}>
                                        <FileTextOutlined style={{ color: token.colorPrimary }} />
                                    </span>
                                    <span>研报总数</span>
                                </Space>
                            }
                            value={reportStats?.total || 0}
                            suffix="篇"
                            valueStyle={{ fontWeight: 'bold' }}
                            loading={isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} bodyStyle={{ padding: 24 }}>
                        <Statistic
                            title={
                                <Space>
                                    <span style={{
                                        backgroundColor: `${token.colorSuccess}15`,
                                        padding: 8,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 4
                                    }}>
                                        <EyeOutlined style={{ color: token.colorSuccess }} />
                                    </span>
                                    <span>总浏览量</span>
                                </Space>
                            }
                            value={reportStats?.totalViews || 0}
                            suffix="次"
                            valueStyle={{ fontWeight: 'bold' }}
                            loading={isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} bodyStyle={{ padding: 24 }}>
                        <Statistic
                            title={
                                <Space>
                                    <span style={{
                                        backgroundColor: `${token.colorWarning}15`,
                                        padding: 8,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 4
                                    }}>
                                        <DownloadOutlined style={{ color: token.colorWarning }} />
                                    </span>
                                    <span>总下载量</span>
                                </Space>
                            }
                            value={reportStats?.totalDownloads || 0}
                            suffix="次"
                            valueStyle={{ fontWeight: 'bold' }}
                            loading={isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} bodyStyle={{ padding: 24 }}>
                        <Statistic
                            title={
                                <Space>
                                    <span style={{
                                        backgroundColor: '#faad1415',
                                        padding: 8,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 4
                                    }}>
                                        <FileSearchOutlined style={{ color: '#faad14' }} />
                                    </span>
                                    <span>待审核</span>
                                </Space>
                            }
                            value={reportStats?.byStatus?.PENDING || 0}
                            suffix="篇"
                            valueStyle={{ fontWeight: 'bold' }}
                            loading={isLoading}
                        />
                    </Card>
                </Col>
            </Row>

            <ReportTrendChart
                data={trendData}
                loading={isLoading}
                days={days}
                onDaysChange={setDays}
            />

            <ReportDistributionCharts
                typeData={typeData}
                sourceData={sourceData}
                loading={isLoading}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={10}>
                    <RecentReportsList data={recentReports} loading={isLoading} />
                </Col>
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
                                    {reportStats?.topCommodities?.slice(0, 6).map((item: { name: string; count: number }, index: number) => {
                                        const maxCount = reportStats.topCommodities[0]?.count || 1;
                                        const percent = (item.count / maxCount) * 100;
                                        return (
                                            <div key={index}>
                                                <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                                                    <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>{item.count} 篇</span>
                                                </Flex>
                                                <Progress percent={percent} showInfo={false} size="small" strokeColor={token.colorPrimary} />
                                            </div>
                                        );
                                    })}
                                    {(!reportStats?.topCommodities || reportStats.topCommodities.length === 0) && (
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
                                        );
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
    );

    // Render combined view
    const renderCombinedStats = () => (
        <>
            {renderOverviewCards()}

            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title="文档归档趋势" bordered={false}>
                        <div style={{ height: 300 }}>
                            <Area {...docTrendConfig} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <ReportTrendChart
                        data={trendData}
                        loading={isLoading}
                        days={days}
                        onDaysChange={setDays}
                    />
                </Col>
            </Row>

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={8}>
                    <Card title="文档来源分布" bordered={false}>
                        <div style={{ height: 300 }}>
                            <Pie {...sourcePieConfig} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={16}>
                    <ReportDistributionCharts
                        typeData={typeData}
                        sourceData={sourceData}
                        loading={isLoading}
                    />
                </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title="热门标签云" bordered={false}>
                        <div style={{ height: 250 }}>
                            <WordCloud {...wordCloudConfig} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <RecentReportsList data={recentReports} loading={isLoading} />
                </Col>
            </Row>
        </>
    );

    if (isLoading && !docStats && !reportStats) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    return (
        <div style={{ padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>数据分析</Title>
                    <Text type="secondary">统计文档和研报的数据指标与趋势</Text>
                </div>
                <Space>
                    <Radio.Group value={view} onChange={e => setView(e.target.value)} buttonStyle="solid">
                        <Radio.Button value="all">综合</Radio.Button>
                        <Radio.Button value="documents">文档</Radio.Button>
                        <Radio.Button value="reports">研报</Radio.Button>
                    </Radio.Group>
                    <Radio.Group value={days} onChange={e => setDays(e.target.value)}>
                        <Radio.Button value={7}>近7天</Radio.Button>
                        <Radio.Button value={30}>近30天</Radio.Button>
                        <Radio.Button value={90}>近3月</Radio.Button>
                    </Radio.Group>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={handleRefresh}
                        loading={isLoading}
                    >
                        刷新
                    </Button>
                </Space>
            </Flex>

            {view === 'all' && renderCombinedStats()}
            {view === 'documents' && renderDocumentStats()}
            {view === 'reports' && renderReportStats()}
        </div>
    );
};
