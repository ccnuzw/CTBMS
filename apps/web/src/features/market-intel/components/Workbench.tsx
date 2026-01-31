import React, { useState } from 'react';
import { Card, Row, Col, Typography, Space, Button, List, Tag, theme, Flex, Radio, Empty, Divider, Segmented } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    EditOutlined,
    FileAddOutlined,
    FileTextOutlined,
    ClockCircleOutlined,
    RightOutlined,
    ThunderboltOutlined,
    BookOutlined,
    BarChartOutlined,
    ReloadOutlined,
    FileSearchOutlined,
    EyeOutlined,
    PieChartOutlined,
    TagsOutlined,
    DownloadOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import { Area, Pie, WordCloud } from '@ant-design/plots';
import { useResearchReportStats, useDocumentStats, useResearchReports, useMarketIntels, useHotTopics } from '../api/hooks';
import { IntelCategory, ReviewStatus, REPORT_TYPE_LABELS } from '@packages/types';
import { StatCard } from './StatCard';
import { ReportTrendChart } from './research-report-dashboard/ReportTrendChart';
import { ReportDistributionCharts } from './research-report-dashboard/ReportDistributionCharts';
import { stripHtml } from '@packages/utils';

const { Title, Text } = Typography;

interface ActionCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    color: string;
    accent: string;
}

const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick, color, accent }) => {
    return (
        <button className="kb-action-card" type="button" onClick={onClick}>
            <div className="kb-action-icon" style={{ color, background: `${accent}22` }}>
                {icon}
            </div>
            <div className="kb-action-body">
                <div className="kb-action-title">{title}</div>
                <div className="kb-action-desc">{description}</div>
            </div>
            <div className="kb-action-cta">
                <span>开始</span>
                <RightOutlined />
            </div>
        </button>
    );
};

export const Workbench: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { token } = theme.useToken();
    const [days, setDays] = useState(30);

    const { data: reportStats, isLoading: reportLoading, refetch } = useResearchReportStats({ days });
    const { data: docStats, isLoading: docLoading } = useDocumentStats(days);

    const { data: pendingReports, isLoading: pendingLoading } = useResearchReports({
        page: 1,
        pageSize: 5,
        reviewStatus: ReviewStatus.PENDING,
    });

    const { data: latestReports, isLoading: latestLoading } = useResearchReports({
        page: 1,
        pageSize: 5,
        reviewStatus: ReviewStatus.APPROVED,
    });

    const { data: recentDocs, isLoading: docListLoading } = useMarketIntels({
        page: 1,
        pageSize: 5,
        category: IntelCategory.C_DOCUMENT,
    });

    const { data: hotTopics } = useHotTopics(12);

    const isLoading = reportLoading || docLoading;

    const todayDocs = docStats?.trend?.length ? docStats.trend[docStats.trend.length - 1].count : 0;
    const weeklyReports = reportStats?.trend?.slice(-7).reduce((sum: number, item: any) => sum + item.count, 0) || 0;

    const typeData = reportStats?.byType
        ? Object.entries(reportStats.byType).map(([type, value]) => ({
            type: REPORT_TYPE_LABELS[type as keyof typeof REPORT_TYPE_LABELS] || type,
            value: value as number,
        }))
        : [];

    const sourceData = reportStats?.bySource || [];

    const docTrendConfig = {
        data: docStats?.trend || [],
        xField: 'date',
        yField: 'count',
        smooth: true,
        areaStyle: () => ({ fillOpacity: 0.18 }),
        color: token.colorSuccess,
    };

    const sourcePieConfig = {
        data: docStats?.bySource || [],
        angleField: 'value',
        colorField: 'name',
        radius: 0.82,
        label: {
            text: 'value',
            position: 'outside' as const,
        },
        legend: {
            position: 'bottom' as const,
        },
    };

    const wordCloudConfig = {
        data: docStats?.topTags || [],
        layout: { spiral: 'rectangular' as const },
        colorField: 'tag',
        textField: 'tag',
        weightField: 'count',
    };

    const actionCards: ActionCardProps[] = [
        {
            icon: <EditOutlined />,
            title: '快速采集',
            description: '文字/图片一线情报快速录入，AI 自动解析提取',
            onClick: () => navigate('/intel/entry'),
            color: '#0B5FFF',
            accent: '#0B5FFF',
        },
        {
            icon: <FileAddOutlined />,
            title: '上传文档入库',
            description: '上传 PDF/Word/图片，自动解析归档',
            onClick: () => navigate('/intel/entry'),
            color: '#0F7B6C',
            accent: '#22C997',
        },
        {
            icon: <FileSearchOutlined />,
            title: '从文档生成研报',
            description: '选择文档，一键生成结构化研报',
            onClick: () => navigate('/intel/knowledge?tab=library&content=documents'),
            color: '#A34B00',
            accent: '#FFB020',
        },
        {
            icon: <BookOutlined />,
            title: '新建研报',
            description: '空白研报撰写与发布',
            onClick: () => navigate('/intel/knowledge/reports/create'),
            color: '#1B4965',
            accent: '#62B6CB',
        },
    ];

    return (
        <div className="kb-workbench" style={{ background: token.colorBgLayout }}>
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

                .kb-workbench {
                    padding: 24px;
                    min-height: 100%;
                    font-family: 'IBM Plex Sans', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
                    color: ${token.colorText};
                }

                .kb-hero {
                    position: relative;
                    padding: 28px 28px 22px;
                    border-radius: 18px;
                    background: radial-gradient(120% 140% at 10% 0%, rgba(20, 108, 255, 0.18), transparent 55%),
                        radial-gradient(120% 140% at 90% 0%, rgba(34, 197, 148, 0.16), transparent 55%),
                        linear-gradient(135deg, #ffffff 0%, #f6f8fb 100%);
                    border: 1px solid ${token.colorBorderSecondary};
                    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
                    overflow: hidden;
                }

                .kb-hero::after {
                    content: '';
                    position: absolute;
                    right: -80px;
                    top: -80px;
                    width: 180px;
                    height: 180px;
                    background: radial-gradient(circle, rgba(11, 95, 255, 0.18), transparent 70%);
                    border-radius: 50%;
                }

                .kb-hero-title {
                    font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
                    font-size: 28px;
                    font-weight: 700;
                    margin: 0;
                }

                .kb-hero-subtitle {
                    color: ${token.colorTextSecondary};
                    margin-top: 4px;
                }

                .kb-action-card {
                    width: 100%;
                    border: 1px solid ${token.colorBorderSecondary};
                    border-radius: 16px;
                    padding: 16px 18px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    text-align: left;
                    background: #fff;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                    cursor: pointer;
                }

                .kb-action-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
                    border-color: ${token.colorPrimaryBorder};
                }

                .kb-action-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }

                .kb-action-body {
                    flex: 1;
                }

                .kb-action-title {
                    font-weight: 600;
                    font-size: 15px;
                }

                .kb-action-desc {
                    margin-top: 4px;
                    font-size: 12px;
                    color: ${token.colorTextSecondary};
                }

                .kb-action-cta {
                    font-size: 12px;
                    color: ${token.colorTextSecondary};
                    display: flex;
                    gap: 6px;
                    align-items: center;
                }

                .kb-section-card {
                    border-radius: 16px;
                    border: 1px solid ${token.colorBorderSecondary};
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
                }

                .kb-kpi-card {
                    border-radius: 16px;
                    border: 1px solid ${token.colorBorderSecondary};
                    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
                }

                .kb-chip {
                    padding: 2px 8px;
                    border-radius: 999px;
                    font-size: 11px;
                }

                .kb-fade-in {
                    animation: fadeUp 0.6s ease forwards;
                    opacity: 0;
                    transform: translateY(6px);
                }

                @keyframes fadeUp {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .kb-hero {
                        padding: 20px;
                    }
                }
            `}
            </style>

            <div className="kb-hero kb-fade-in" style={{ animationDelay: '0ms' }}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
                    <div>
                        <div className="kb-hero-title">工作台</div>
                        <div className="kb-hero-subtitle">统一采集、研报与知识库的日常运营</div>
                    </div>
                    <Space>
                        <Segmented
                            value="workbench"
                            onChange={(value) => {
                                const next = new URLSearchParams(searchParams);
                                next.set('tab', value as string);
                                setSearchParams(next);
                            }}
                            options={[
                                { value: 'workbench', label: <span><ThunderboltOutlined /> 工作台</span> },
                                { value: 'library', label: <span><FileTextOutlined /> 知识库</span> },
                            ]}
                            size="small"
                            style={{
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                        />
                        <Radio.Group value={days} onChange={(e) => setDays(e.target.value)}>
                            <Radio.Button value={7}>近7天</Radio.Button>
                            <Radio.Button value={30}>近30天</Radio.Button>
                            <Radio.Button value={90}>近3月</Radio.Button>
                        </Radio.Group>
                        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
                            刷新
                        </Button>
                    </Space>
                </Flex>
            </div>

            <Row gutter={[16, 16]} style={{ marginTop: 18, marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="kb-kpi-card kb-fade-in" style={{ animationDelay: '100ms' }}>
                        <StatCard
                            title="今日新增文档"
                            value={todayDocs}
                            icon={<FileTextOutlined />}
                            color="#0F7B6C"
                            suffix="份"
                        />
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="kb-kpi-card kb-fade-in" style={{ animationDelay: '150ms' }}>
                        <StatCard
                            title="近7天研报"
                            value={weeklyReports}
                            icon={<BarChartOutlined />}
                            color="#0B5FFF"
                            suffix="篇"
                        />
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="kb-kpi-card kb-fade-in" style={{ animationDelay: '200ms' }}>
                        <StatCard
                            title="待审核研报"
                            value={reportStats?.byStatus?.PENDING || 0}
                            icon={<ClockCircleOutlined />}
                            color="#FF8A00"
                            suffix="篇"
                        />
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="kb-kpi-card kb-fade-in" style={{ animationDelay: '250ms' }}>
                        <StatCard
                            title="总阅读量"
                            value={reportStats?.totalViews || 0}
                            icon={<EyeOutlined />}
                            color="#1B4965"
                            suffix="次"
                        />
                    </div>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={14}>
                    <Card title={<Space><ThunderboltOutlined />快速开始</Space>} className="kb-section-card kb-fade-in" style={{ animationDelay: '300ms' }}>
                        <Row gutter={[16, 16]}>
                            {actionCards.map((card) => (
                                <Col xs={24} sm={12} key={card.title}>
                                    <ActionCard {...card} />
                                </Col>
                            ))}
                        </Row>
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card title={<Space><ClockCircleOutlined />待审核研报</Space>} className="kb-section-card kb-fade-in" style={{ animationDelay: '350ms' }}>
                        {pendingLoading ? (
                            <div style={{ textAlign: 'center', padding: 24 }}><Text type="secondary">加载中...</Text></div>
                        ) : pendingReports?.data?.length ? (
                            <List
                                dataSource={pendingReports.data}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                key="review"
                                                type="link"
                                                size="small"
                                                onClick={() => navigate(`/intel/knowledge/reports/${item.id}`)}
                                            >
                                                查看
                                            </Button>
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={item.title}
                                            description={
                                                <Space size={8} wrap>
                                                    <Tag color="orange" className="kb-chip">待审核</Tag>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>{item.source || '未知来源'}</Text>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审核研报" />
                        )}
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={16}>
                    <Card
                        title={<Space><BookOutlined />最新发布研报</Space>}
                        extra={<Button type="link" onClick={() => navigate('/intel/knowledge?tab=library&content=reports')}>查看全部 <ArrowRightOutlined /></Button>}
                        className="kb-section-card kb-fade-in"
                        style={{ animationDelay: '400ms' }}
                    >
                        {latestLoading ? (
                            <div style={{ textAlign: 'center', padding: 24 }}><Text type="secondary">加载中...</Text></div>
                        ) : latestReports?.data?.length ? (
                            <List
                                itemLayout="vertical"
                                dataSource={latestReports.data}
                                renderItem={(item) => (
                                    <List.Item
                                        key={item.id}
                                        actions={[
                                            <Space key="views"><EyeOutlined /> {item.viewCount}</Space>,
                                            <Space key="downloads"><DownloadOutlined /> {item.downloadCount}</Space>,
                                            <Space key="date"><ClockCircleOutlined /> {new Date(item.publishDate || item.createdAt).toLocaleDateString()}</Space>
                                        ]}
                                        extra={
                                            <Tag color="blue" className="kb-chip">
                                                {REPORT_TYPE_LABELS[item.reportType] || item.reportType}
                                            </Tag>
                                        }
                                    >
                                        <List.Item.Meta
                                            title={<a onClick={() => navigate(`/intel/knowledge/reports/${item.id}`)}>{item.title}</a>}
                                            description={
                                                <Text type="secondary">
                                                    {stripHtml(item.summary || '').slice(0, 80) || '暂无摘要'}
                                                </Text>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无研报" />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Flex vertical gap={16}>
                        <Card title={<Space><TagsOutlined />热门话题</Space>} className="kb-section-card kb-fade-in" style={{ animationDelay: '450ms' }}>
                            <Flex wrap="wrap" gap={8} style={{ minHeight: 120 }}>
                                {hotTopics?.map((topic: any) => (
                                    <Tag
                                        key={topic.topic}
                                        color="blue"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/intel/search?q=${topic.topic}`)}
                                    >
                                        {topic.topic} <span style={{ opacity: 0.6, fontSize: 11 }}>{topic.count}</span>
                                    </Tag>
                                ))}
                                {(!hotTopics || hotTopics.length === 0) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热门话题" />}
                            </Flex>
                        </Card>
                        <Card
                            title={<Space><FileTextOutlined />最新归档文档</Space>}
                            extra={<Button type="link" onClick={() => navigate('/intel/knowledge?tab=library&content=documents')}>查看全部</Button>}
                            className="kb-section-card kb-fade-in"
                            style={{ animationDelay: '500ms' }}
                        >
                            {docListLoading ? (
                                <div style={{ textAlign: 'center', padding: 24 }}><Text type="secondary">加载中...</Text></div>
                            ) : recentDocs?.data?.length ? (
                                <List
                                    dataSource={recentDocs.data}
                                    renderItem={(item) => (
                                        <List.Item
                                            actions={[
                                                <Button
                                                    key="open"
                                                    type="link"
                                                    size="small"
                                                    onClick={() => navigate(`/intel/knowledge/documents/${item.id}`)}
                                                >
                                                    查看
                                                </Button>
                                            ]}
                                        >
                                            <List.Item.Meta
                                                title={stripHtml(item.rawContent || '').split('\n')[0]?.slice(0, 20) || '未命名文档'}
                                                description={
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        {new Date(item.createdAt).toLocaleDateString()}
                                                    </Text>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文档" />
                            )}
                        </Card>
                    </Flex>
                </Col>
            </Row>

            <Divider style={{ margin: '8px 0 24px' }} />

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={12}>
                    <ReportTrendChart
                        data={reportStats?.trend || []}
                        loading={isLoading}
                        days={days}
                        onDaysChange={setDays}
                    />
                </Col>
                <Col xs={24} lg={12}>
                    <Card title={<Space><FileTextOutlined />文档归档趋势</Space>} className="kb-section-card">
                        <div style={{ height: 320 }}>
                            <Area {...docTrendConfig} />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                    <ReportDistributionCharts
                        typeData={typeData}
                        sourceData={sourceData}
                        loading={isLoading}
                    />
                </Col>
                <Col xs={24} lg={8}>
                    <Flex vertical gap={16}>
                        <Card title={<Space><PieChartOutlined />文档来源分布</Space>} className="kb-section-card">
                            <div style={{ height: 240 }}>
                                <Pie {...sourcePieConfig} />
                            </div>
                        </Card>
                        <Card title={<Space><TagsOutlined />热门标签云</Space>} className="kb-section-card">
                            <div style={{ height: 220 }}>
                                <WordCloud {...wordCloudConfig} />
                            </div>
                        </Card>
                    </Flex>
                </Col>
            </Row>
        </div>
    );
};

export default Workbench;
