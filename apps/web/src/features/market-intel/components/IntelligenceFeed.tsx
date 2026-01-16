import React, { useState, useMemo, useEffect } from 'react';
import {
    Card,
    Typography,
    Input,
    Select,
    Button,
    Space,
    Tag,
    Avatar,
    Badge,
    Flex,
    Segmented,
    Progress,
    theme,
    Empty,
    Statistic,
    Row,
    Col,
    Spin,
} from 'antd';
import {
    SearchOutlined,
    FilterOutlined,
    UnorderedListOutlined,
    AppstoreOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    FireOutlined,
    EnvironmentOutlined,
    ClockCircleOutlined,
    MessageOutlined,
    BankOutlined,
    RiseOutlined,
    FallOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useMarketIntels } from '../api/hooks';
import { IntelCategory, MarketIntelResponse } from '@packages/types';
import { ChartContainer } from './ChartContainer';

const { Title, Text, Paragraph } = Typography;

type TimeRange = '24H' | '7D' | '30D' | 'ALL';
type ViewMode = 'LIST' | 'GRID';

// 情报卡片组件
const IntelCard: React.FC<{ intel: MarketIntelResponse; viewMode: ViewMode }> = ({ intel, viewMode }) => {
    const { token } = theme.useToken();

    // 解析 AI 分析结果
    const aiAnalysis = intel.aiAnalysis as any || {};
    const sentiment = aiAnalysis.sentiment || 'neutral';
    const summary = intel.summary || aiAnalysis.summary || intel.rawContent.slice(0, 100);
    const tags = aiAnalysis.tags || [];
    const confidenceScore = aiAnalysis.confidenceScore || 80;
    const structuredEvent = aiAnalysis.structuredEvent;

    const sentimentConfig = {
        positive: { color: token.colorSuccess, bg: token.colorSuccessBg, text: '利好' },
        negative: { color: token.colorError, bg: token.colorErrorBg, text: '利空' },
        neutral: { color: token.colorTextSecondary, bg: token.colorBgTextHover, text: '中性' },
    };

    const sentimentInfo = sentimentConfig[sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;

    // 作者信息
    const authorName = intel.author?.name || '系统';

    return (
        <Card
            size="small"
            hoverable
            style={viewMode === 'GRID' ? { height: '100%' } : { marginBottom: 16 }}
        >
            {/* 头部 */}
            <Flex justify="space-between" align="flex-start" style={{ marginBottom: 12 }}>
                <Flex gap={12} align="flex-start">
                    <Avatar style={{ background: '#1677ff' }}>
                        {authorName[0]}
                    </Avatar>
                    <div>
                        <Flex align="center" gap={8}>
                            <Text strong>{authorName}</Text>
                            <Tag style={{ fontSize: 10 }}>{intel.sourceType}</Tag>
                        </Flex>
                        <Flex align="center" gap={4} style={{ marginTop: 4 }}>
                            <EnvironmentOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {intel.location}
                            </Text>
                            <ClockCircleOutlined
                                style={{ fontSize: 10, marginLeft: 8, color: token.colorTextSecondary }}
                            />
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(intel.effectiveTime).toLocaleString('zh-CN', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </Text>
                        </Flex>
                    </div>
                </Flex>

                <Tag color={sentimentInfo.color} style={{ margin: 0 }}>
                    {sentimentInfo.text}
                </Tag>
            </Flex>

            {/* 结构化事件 */}
            {structuredEvent && (
                <Card
                    size="small"
                    style={{ background: token.colorBgTextHover, marginBottom: 12 }}
                    bodyStyle={{ padding: 12 }}
                >
                    <Flex vertical gap={4}>
                        <Flex gap={8}>
                            <Text type="secondary" style={{ fontSize: 11, width: 32 }}>
                                主体:
                            </Text>
                            <Text strong style={{ fontSize: 12 }}>
                                {structuredEvent.subject}
                            </Text>
                        </Flex>
                        <Flex gap={8}>
                            <Text type="secondary" style={{ fontSize: 11, width: 32 }}>
                                动作:
                            </Text>
                            <Text style={{ fontSize: 12, color: token.colorPrimary }}>
                                {structuredEvent.action}
                            </Text>
                        </Flex>
                        <Flex gap={8}>
                            <Text type="secondary" style={{ fontSize: 11, width: 32 }}>
                                影响:
                            </Text>
                            <Text style={{ fontSize: 12, color: token.colorWarning }}>
                                {structuredEvent.impact}
                            </Text>
                        </Flex>
                    </Flex>
                </Card>
            )}

            {/* 摘要 */}
            <Paragraph
                strong
                ellipsis={viewMode === 'GRID' ? { rows: 3 } : false}
                style={{ marginBottom: 8 }}
            >
                {summary}
            </Paragraph>

            {viewMode === 'LIST' && (
                <Paragraph type="secondary" italic ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>
                    "{intel.rawContent}"
                </Paragraph>
            )}

            {/* 标签 */}
            <Flex justify="space-between" align="center">
                <Flex wrap="wrap" gap={4}>
                    {tags.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} style={{ fontSize: 10 }}>
                            {tag}
                        </Tag>
                    ))}
                </Flex>

                {viewMode === 'LIST' && (
                    <Flex gap={16}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            <SafetyCertificateOutlined style={{ marginRight: 4 }} />
                            {confidenceScore}%
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11, cursor: 'pointer' }}>
                            <MessageOutlined style={{ marginRight: 4 }} />
                            评论
                        </Text>
                    </Flex>
                )}
            </Flex>
        </Card>
    );
};

export const IntelligenceFeed: React.FC = () => {
    const { token } = theme.useToken();

    const [searchTerm, setSearchTerm] = useState('');
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
    const [viewMode, setViewMode] = useState<ViewMode>('LIST');

    // 使用真实 API 获取 B 类数据
    const { data: intelsResult, isLoading } = useMarketIntels({
        category: IntelCategory.B_SEMI_STRUCTURED,
        pageSize: 100,
    });

    const allIntels = intelsResult?.data || [];

    // 综合筛选
    const filteredCards = useMemo(() => {
        let res = allIntels;
        const now = Date.now();

        // 时间筛选
        if (timeRange === '24H')
            res = res.filter((c) => new Date(c.effectiveTime).getTime() > now - 86400000);
        if (timeRange === '7D')
            res = res.filter((c) => new Date(c.effectiveTime).getTime() > now - 86400000 * 7);
        if (timeRange === '30D')
            res = res.filter((c) => new Date(c.effectiveTime).getTime() > now - 86400000 * 30);

        // 区域筛选
        if (selectedRegion !== 'ALL') {
            res = res.filter(
                (c) =>
                    c.region?.some((r) => r.includes(selectedRegion)) ||
                    c.location.includes(selectedRegion),
            );
        }

        // 搜索
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            res = res.filter(
                (c) =>
                    c.rawContent.toLowerCase().includes(lower) ||
                    (c.summary?.toLowerCase() || '').includes(lower) ||
                    c.author?.name?.includes(lower),
            );
        }

        return [...res].sort(
            (a, b) =>
                new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime(),
        );
    }, [allIntels, timeRange, selectedRegion, searchTerm]);

    // 统计数据
    const stats = useMemo(() => {
        const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
        const regionCounts: Record<string, number> = {};
        const authorCounts: Record<string, number> = {};
        let highConfidenceCount = 0;

        filteredCards.forEach((c) => {
            const aiAnalysis = c.aiAnalysis as any || {};
            const sentiment = aiAnalysis.sentiment || 'neutral';
            sentimentCounts[sentiment as keyof typeof sentimentCounts]++;

            const region = c.region?.[0] || '未知区域';
            regionCounts[region] = (regionCounts[region] || 0) + 1;

            const author = c.author?.name || '系统';
            authorCounts[author] = (authorCounts[author] || 0) + 1;

            if ((aiAnalysis.confidenceScore || 0) > 90) highConfidenceCount++;
        });

        const topRegions = Object.entries(regionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, value]) => ({ name, value }));

        const topAuthors = Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, value]) => ({ name, value }));

        const sentimentData = [
            { name: '利好', value: sentimentCounts.positive, color: token.colorSuccess },
            { name: '中性', value: sentimentCounts.neutral, color: token.colorTextSecondary },
            { name: '利空', value: sentimentCounts.negative, color: token.colorError },
        ];

        return { sentimentData, topRegions, topAuthors, highConfidenceCount };
    }, [filteredCards, token]);

    // 热门话题（从情报中提取）
    const hotTopics = useMemo(() => {
        const tagCounts: Record<string, number> = {};
        filteredCards.forEach((c) => {
            const aiAnalysis = c.aiAnalysis as any || {};
            (aiAnalysis.tags || []).forEach((tag: string) => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        return Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name]) => name);
    }, [filteredCards]);

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 顶部统计 */}
                <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: 16 }}>
                    <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>
                                <BankOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                                情报流看板 (Intelligence Feed)
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                全国业务网络实时提报 • AI 结构化清洗 • 组织架构联动
                            </Text>
                        </div>
                        <Segmented
                            options={[
                                { label: <UnorderedListOutlined />, value: 'LIST' },
                                { label: <AppstoreOutlined />, value: 'GRID' },
                            ]}
                            value={viewMode}
                            onChange={(val) => setViewMode(val as ViewMode)}
                        />
                    </Flex>

                    {/* KPI 卡片 */}
                    <Row gutter={16}>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic
                                    title="当前筛选总量"
                                    value={filteredCards.length}
                                    suffix="条"
                                    valueStyle={{ color: token.colorPrimary }}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic
                                    title="活跃提报人"
                                    value={stats.topAuthors.length}
                                    suffix="人"
                                    prefix={<TeamOutlined />}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Statistic
                                    title="高置信度占比"
                                    value={
                                        filteredCards.length
                                            ? Math.round((stats.highConfidenceCount / filteredCards.length) * 100)
                                            : 0
                                    }
                                    suffix="%"
                                    prefix={<SafetyCertificateOutlined />}
                                />
                            </Card>
                        </Col>
                        <Col xs={12} md={6}>
                            <Card size="small">
                                <Flex align="center" gap={16}>
                                    <div style={{ width: 48, height: 48 }}>
                                        {stats.sentimentData.some(d => d.value > 0) && (
                                            <ChartContainer height={48} width={48}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={stats.sentimentData}
                                                            dataKey="value"
                                                            innerRadius={12}
                                                            outerRadius={20}
                                                            paddingAngle={2}
                                                        >
                                                            {stats.sentimentData.map((entry, index) => (
                                                                <Cell key={index} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </ChartContainer>
                                        )}
                                    </div>
                                    <Flex vertical gap={2}>
                                        <Flex align="center" gap={4}>
                                            <RiseOutlined style={{ color: token.colorSuccess, fontSize: 10 }} />
                                            <Text style={{ fontSize: 11 }}>利好 {stats.sentimentData[0].value}</Text>
                                        </Flex>
                                        <Flex align="center" gap={4}>
                                            <FallOutlined style={{ color: token.colorError, fontSize: 10 }} />
                                            <Text style={{ fontSize: 11 }}>利空 {stats.sentimentData[2].value}</Text>
                                        </Flex>
                                    </Flex>
                                </Flex>
                            </Card>
                        </Col>
                    </Row>
                </Card>

                {/* 筛选栏 */}
                <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: '12px 16px' }}>
                    <Flex gap={16} wrap="wrap" align="center">
                        <Input
                            prefix={<SearchOutlined />}
                            placeholder="搜索内容、标签或提报人..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: 240 }}
                            allowClear
                        />

                        <Segmented
                            options={[
                                { label: '24H', value: '24H' },
                                { label: '7D', value: '7D' },
                                { label: '30D', value: '30D' },
                                { label: '全部', value: 'ALL' },
                            ]}
                            value={timeRange}
                            onChange={(val) => setTimeRange(val as TimeRange)}
                            size="small"
                        />

                        <Select
                            value={selectedRegion}
                            onChange={setSelectedRegion}
                            style={{ width: 120 }}
                            size="small"
                            options={[
                                { label: '全部大区', value: 'ALL' },
                                { label: '辽宁大区', value: '辽宁' },
                                { label: '吉林大区', value: '吉林' },
                                { label: '内蒙大区', value: '内蒙古' },
                                { label: '黑龙江大区', value: '黑龙江' },
                            ]}
                        />

                        <Button icon={<FilterOutlined />} size="small" style={{ marginLeft: 'auto' }}>
                            更多筛选
                        </Button>
                    </Flex>
                </Card>

                {/* 内容区 */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                    {isLoading ? (
                        <Flex justify="center" align="center" style={{ height: 200 }}>
                            <Spin size="large" />
                        </Flex>
                    ) : filteredCards.length > 0 ? (
                        viewMode === 'GRID' ? (
                            <Row gutter={[16, 16]}>
                                {filteredCards.map((intel) => (
                                    <Col key={intel.id} xs={24} md={12} xl={8}>
                                        <IntelCard intel={intel} viewMode={viewMode} />
                                    </Col>
                                ))}
                            </Row>
                        ) : (
                            <div style={{ maxWidth: 800, margin: '0 auto' }}>
                                {/* 时间轴样式 */}
                                <div
                                    style={{
                                        borderLeft: `2px solid ${token.colorBorderSecondary}`,
                                        paddingLeft: 24,
                                        marginLeft: 8,
                                    }}
                                >
                                    {filteredCards.map((intel) => (
                                        <div key={intel.id} style={{ position: 'relative' }}>
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: -31,
                                                    top: 24,
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: '50%',
                                                    background: token.colorBgContainer,
                                                    border: `2px solid ${token.colorPrimary}`,
                                                }}
                                            />
                                            <IntelCard intel={intel} viewMode={viewMode} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : (
                        <Empty description="没有找到符合条件的情报数据" />
                    )}
                </div>
            </Flex>

            {/* 右侧边栏 */}
            <Card
                style={{ width: 300, height: '100%', overflow: 'auto', borderRadius: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <Title level={5}>
                    <BankOutlined style={{ marginRight: 8 }} />
                    组织贡献看板 (Org Pulse)
                </Title>

                {/* 区域活跃度 */}
                <div style={{ marginTop: 24 }}>
                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                        区域活跃度 Top 5
                    </Text>
                    <div style={{ marginTop: 12 }}>
                        {stats.topRegions.length > 0 ? (
                            stats.topRegions.map((region, idx) => (
                                <Flex key={region.name} justify="space-between" align="center" style={{ marginBottom: 12 }}>
                                    <Flex align="center" gap={8}>
                                        <Badge
                                            count={idx + 1}
                                            style={{
                                                background: idx === 0 ? token.colorWarning : token.colorBgTextHover,
                                                color: idx === 0 ? '#fff' : token.colorTextSecondary,
                                            }}
                                        />
                                        <Text>{region.name}</Text>
                                    </Flex>
                                    <Flex align="center" gap={8}>
                                        <Progress
                                            percent={(region.value / stats.topRegions[0].value) * 100}
                                            showInfo={false}
                                            size="small"
                                            style={{ width: 60 }}
                                        />
                                        <Text strong>{region.value}</Text>
                                    </Flex>
                                </Flex>
                            ))
                        ) : (
                            <Text type="secondary">暂无数据</Text>
                        )}
                    </div>
                </div>

                {/* 王牌情报员 */}
                <div style={{ marginTop: 32 }}>
                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                        王牌情报员 (Top Contributors)
                    </Text>
                    <div style={{ marginTop: 12 }}>
                        {stats.topAuthors.length > 0 ? (
                            stats.topAuthors.map((author) => (
                                <Flex
                                    key={author.name}
                                    justify="space-between"
                                    align="center"
                                    style={{ marginBottom: 12, cursor: 'pointer' }}
                                >
                                    <Flex align="center" gap={12}>
                                        <Avatar size="small">{author.name[0]}</Avatar>
                                        <div>
                                            <Text strong style={{ display: 'block' }}>
                                                {author.name}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                情报员
                                            </Text>
                                        </div>
                                    </Flex>
                                    <div style={{ textAlign: 'right' }}>
                                        <Text strong style={{ color: token.colorPrimary }}>
                                            {author.value}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                                            条提报
                                        </Text>
                                    </div>
                                </Flex>
                            ))
                        ) : (
                            <Text type="secondary">暂无数据</Text>
                        )}
                    </div>
                </div>

                {/* 热门话题 */}
                <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${token.colorBorder}` }}>
                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                        <FireOutlined style={{ marginRight: 4, color: token.colorWarning }} />
                        热门话题 (Hot Topics)
                    </Text>
                    <Flex wrap="wrap" gap={8} style={{ marginTop: 12 }}>
                        {hotTopics.length > 0 ? (
                            hotTopics.map((tag) => (
                                <Tag key={tag} style={{ cursor: 'pointer' }}>
                                    #{tag}
                                </Tag>
                            ))
                        ) : (
                            <Text type="secondary">暂无热门话题</Text>
                        )}
                    </Flex>
                </div>
            </Card>
        </Flex>
    );
};

export default IntelligenceFeed;
