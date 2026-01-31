import React, { useMemo } from 'react';
import { Card, Typography, Row, Col, Statistic, Button, List, Tag, Flex, theme, Space, Empty } from 'antd';
import {
    FileTextOutlined,
    FileSearchOutlined,
    ReadOutlined,
    CloudUploadOutlined,
    DashboardOutlined, // [NEW]
    ArrowRightOutlined,
    BarChartOutlined,
    ClockCircleOutlined,
    LikeOutlined,
    EyeOutlined,
    DownloadOutlined,
    GlobalOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { stripHtml } from '@packages/utils';
import { useNavigate } from 'react-router-dom';
import { useResearchReports, useMarketIntels, useResearchReportStats, useMarketIntelStats, useHotTopics } from '../api/hooks';
import { IntelCategory, ReportType, IntelSourceType, ReviewStatus } from '@packages/types';

const { Title, Text, Paragraph } = Typography;

const REPORT_TYPE_LABELS: Record<string, string> = {
    POLICY: '政策解读',
    MARKET: '市场行情',
    RESEARCH: '深度研究',
    INDUSTRY: '行业分析',
};

const REPORT_TYPE_COLORS: Record<string, string> = {
    POLICY: 'volcano',
    MARKET: 'blue',
    RESEARCH: 'purple',
    INDUSTRY: 'cyan',
};



export const KnowledgePortal: React.FC = () => {
    const { token } = theme.useToken();
    const navigate = useNavigate();

    // 获取最新研报
    const { data: reportsData, isLoading: reportsLoading } = useResearchReports({
        pageSize: 5,
        reviewStatus: ReviewStatus.APPROVED,
    });

    // 获取最新C类文档
    const { data: docsData, isLoading: docsLoading } = useMarketIntels({
        category: IntelCategory.C_DOCUMENT,
        pageSize: 5,
    });

    // 获取研报统计
    const { data: reportStats } = useResearchReportStats();

    // 获取情报统计
    const { data: intelStats } = useMarketIntelStats();

    // 获取热门话题
    const { data: hotTopicsData } = useHotTopics(10);

    // 整合统计数据
    const stats = {
        totalReports: reportStats?.total || 0,
        totalDocs: intelStats?.totalSubmissions || 0,
        weeklyNew: (reportStats?.recent?.length || 0) + (intelStats?.todaySubmissions || 0), // 简略计算
        totalViews: reportStats?.totalViews || 0
    };

    const renderActionCard = (title: string, desc: string, icon: React.ReactNode, path: string, color: string) => (
        <Card
            hoverable
            onClick={() => navigate(path)}
            bodyStyle={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            style={{ height: 140, cursor: 'pointer', borderColor: 'transparent' }}
        >
            <Flex gap={16} align="center">
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: `${color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: color,
                    fontSize: 24
                }}>
                    {icon}
                </div>
                <div>
                    <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>{title}</Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
                </div>
            </Flex>
        </Card>
    );

    return (
        <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
            {/* 顶部欢迎区 */}
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>商情知识库</Title>
                    <Text type="secondary">集成研报管理、市场洞察与非结构化文档的统一知识中心</Text>
                </div>
                <Space>
                    <Button icon={<CloudUploadOutlined />} onClick={() => navigate('/intel/entry')}>
                        上传文档
                    </Button>
                    <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate('/intel/knowledge/reports/create')}>
                        新建研报
                    </Button>
                </Space>
            </Flex>

            {/* 快捷入口 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} md={8}>
                    {renderActionCard('知识库', '浏览文档与研报', <FileTextOutlined />, '/intel/knowledge?tab=library', '#1890ff')}
                </Col>
                <Col xs={24} sm={12} md={8}>
                    {renderActionCard('研报管理', '研究报告审阅与发布', <FileSearchOutlined />, '/intel/knowledge?tab=library&content=reports', '#722ed1')}
                </Col>
                <Col xs={24} sm={12} md={8}>
                    {renderActionCard('工作台', '统一工作台与数据看板', <DashboardOutlined />, '/intel/knowledge?tab=workbench', '#13c2c2')}
                </Col>
            </Row>

            {/* 统计概览 */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }} bodyStyle={{ padding: '24px 32px' }}>
                <Row gutter={48}>
                    <Col span={6}>
                        <Statistic
                            title="累计收录研报"
                            value={stats.totalReports}
                            prefix={<ReadOutlined />}
                            suffix="篇"
                            valueStyle={{ color: token.colorPrimary, fontWeight: 'bold' }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="累计归档文档"
                            value={stats.totalDocs}
                            prefix={<FileTextOutlined />}
                            suffix="份"
                            valueStyle={{ color: token.colorSuccess, fontWeight: 'bold' }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="本周新增"
                            value={stats.weeklyNew}
                            prefix={<CloudUploadOutlined />}
                            suffix="份"
                            valueStyle={{ color: token.colorWarning, fontWeight: 'bold' }}
                        />
                    </Col>
                    <Col span={6}>
                        <Statistic
                            title="总浏览量"
                            value={stats.totalViews}
                            groupSeparator=","
                            prefix={<EyeOutlined />}
                            valueStyle={{ color: '#722ED1', fontWeight: 'bold' }}
                        />
                    </Col>
                </Row>
            </Card>

            <Row gutter={24}>
                {/* 左侧：最新研报 */}
                <Col xs={24} lg={14} xl={16}>
                    <Card
                        title={<Space><ReadOutlined style={{ color: token.colorPrimary }} />最新发布研报</Space>}
                        extra={<Button type="link" onClick={() => navigate('/intel/knowledge?tab=library&content=reports')}>查看全部 <ArrowRightOutlined /></Button>}
                        style={{ height: '100%' }}
                    >
                        <List
                            loading={reportsLoading}
                            itemLayout="vertical"
                            dataSource={reportsData?.data || []}
                            renderItem={(item) => (
                                <List.Item
                                    key={item.id}
                                    actions={[
                                        <Space key="views"><EyeOutlined /> {item.viewCount}</Space>,
                                        <Space key="downloads"><DownloadOutlined /> {item.downloadCount}</Space>,
                                        <Space key="date"><ClockCircleOutlined /> {new Date(item.publishDate || item.createdAt).toLocaleDateString()}</Space>
                                    ]}
                                    extra={
                                        <div style={{ marginLeft: 24 }}>
                                            <Tag color={REPORT_TYPE_COLORS[item.reportType] || 'default'}>
                                                {REPORT_TYPE_LABELS[item.reportType] || item.reportType}
                                            </Tag>
                                        </div>
                                    }
                                >
                                    <List.Item.Meta
                                        title={<a onClick={() => navigate(`/intel/knowledge/reports/${item.id}`)}>{item.title}</a>}
                                        description={
                                            <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                                                {stripHtml(item.summary || '') || '暂无摘要'}
                                            </Paragraph>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    </Card>
                </Col>

                {/* 右侧：热门与快速访问 */}
                <Col xs={24} lg={10} xl={8}>
                    <Flex vertical gap={24}>
                        {/* 热门话题 */}
                        <Card title={<Space><BarChartOutlined style={{ color: token.colorError }} />热门话题风向</Space>}>
                            <Flex wrap="wrap" gap={8} style={{ minHeight: 120 }}>
                                {hotTopicsData?.map((topic: any) => (
                                    <Tag
                                        key={topic.topic}
                                        color="blue"
                                        style={{
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            margin: 0,
                                            userSelect: 'none'
                                        }}
                                        onClick={() => navigate(`/intel/search?q=${topic.topic}`)}
                                    >
                                        {topic.topic} <span style={{ opacity: 0.6, fontSize: 11 }}>{topic.count}</span>
                                    </Tag>
                                ))}
                                {(!hotTopicsData || hotTopicsData.length === 0) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热门话题" />}
                            </Flex>
                        </Card>

                        {/* 最新C类文档 */}
                        <Card
                            title={<Space><FileTextOutlined style={{ color: token.colorSuccess }} />最新归档文档</Space>}
                            extra={<Button type="link" onClick={() => navigate('/intel/knowledge?tab=library&content=documents')}>查看全部</Button>}
                        >
                            <List
                                loading={docsLoading}
                                size="small"
                                dataSource={docsData?.data || []}
                                renderItem={(item) => (
                                    <List.Item
                                        onClick={() => navigate('/intel/knowledge?tab=library&content=documents')}
                                        style={{ cursor: 'pointer', padding: '12px 0' }}
                                    >
                                        <List.Item.Meta
                                            avatar={
                                                <div style={{
                                                    padding: 8,
                                                    background: token.colorFillTertiary,
                                                    borderRadius: 6
                                                }}>
                                                    <FileTextOutlined />
                                                </div>
                                            }
                                            title={
                                                <Text ellipsis style={{ width: 180 }}>
                                                    {stripHtml(item.rawContent || '').split('\n')[0].substring(0, 20) || '未命名文件'}
                                                </Text>
                                            }
                                            description={
                                                <Space size={4}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        {new Date(item.effectiveTime).toLocaleDateString()}
                                                    </Text>
                                                    <Tag style={{ fontSize: 10, lineHeight: '18px' }}>
                                                        {item.sourceType}
                                                    </Tag>
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        </Card>
                    </Flex>
                </Col>
            </Row>
        </div >
    );
};
