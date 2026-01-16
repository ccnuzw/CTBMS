import React, { useState, useMemo, useEffect } from 'react';
import {
    Card,
    Typography,
    Input,
    Button,
    Tag,
    Flex,
    Segmented,
    Empty,
    theme,
    Row,
    Col,
} from 'antd';
import {
    SearchOutlined,
    FilterOutlined,
    ThunderboltOutlined,
    LineChartOutlined,
    FileTextOutlined,
    AlertOutlined,
    ReloadOutlined,
    RightOutlined,
    CalendarOutlined,
    TagOutlined,
    ControlOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { IntelCategory, INTEL_SOURCE_TYPE_LABELS, type InfoCard, MOCK_CARDS } from '../types';
import { ChartContainer } from './ChartContainer';

const { Title, Text, Paragraph } = Typography;

type TimeRange = 'ALL' | '24H' | '7D' | '30D';
type SentimentFilter = 'ALL' | 'positive' | 'negative';

export const UniversalSearch: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [query, setQuery] = useState('补贴');
    const [showFilters, setShowFilters] = useState(false);
    const [dateRange, setDateRange] = useState<TimeRange>('ALL');
    const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('ALL');
    const [isAiSummarizing, setIsAiSummarizing] = useState(false);


    // 筛选逻辑
    const filteredResults = useMemo(() => {
        if (!query.trim()) return [];

        let res = MOCK_CARDS.filter(
            (c) =>
                c.rawContent.toLowerCase().includes(query.toLowerCase()) ||
                c.aiAnalysis.summary.toLowerCase().includes(query.toLowerCase()) ||
                c.aiAnalysis.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())) ||
                c.aiAnalysis.entities?.some((e) => e.toLowerCase().includes(query.toLowerCase())),
        );

        // 时间筛选
        const now = Date.now();
        if (dateRange === '24H')
            res = res.filter((c) => new Date(c.metadata.submittedAt).getTime() > now - 86400000);
        if (dateRange === '7D')
            res = res.filter((c) => new Date(c.metadata.submittedAt).getTime() > now - 86400000 * 7);
        if (dateRange === '30D')
            res = res.filter((c) => new Date(c.metadata.submittedAt).getTime() > now - 86400000 * 30);

        // 情感筛选
        if (sentimentFilter !== 'ALL')
            res = res.filter((c) => c.aiAnalysis.sentiment === sentimentFilter);

        return res;
    }, [query, dateRange, sentimentFilter]);

    // 分类结果
    const marketResults = filteredResults.filter((c) => c.category === IntelCategory.A_STRUCTURED);
    const docResults = filteredResults.filter((c) => c.category === IntelCategory.C_DOCUMENT);
    const intelResults = filteredResults.filter((c) => c.category === IntelCategory.B_SEMI_STRUCTURED);

    // 相关实体提取
    const relatedTags = useMemo(() => {
        const tags = new Map<string, number>();
        filteredResults.forEach((c) => {
            c.aiAnalysis.tags.forEach((t) => {
                if (!t.toLowerCase().includes(query.toLowerCase()))
                    tags.set(t, (tags.get(t) || 0) + 1);
            });
            c.aiAnalysis.entities?.forEach((e) => {
                if (!e.toLowerCase().includes(query.toLowerCase()))
                    tags.set(e, (tags.get(e) || 0) + 1);
            });
        });
        return Array.from(tags.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
    }, [filteredResults, query]);

    // 图表数据
    const chartData = marketResults
        .sort(
            (a, b) =>
                new Date(a.metadata.effectiveTime).getTime() - new Date(b.metadata.effectiveTime).getTime(),
        )
        .map((c) => ({
            date: new Date(c.metadata.effectiveTime).toLocaleDateString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
            }),
            price: (c.aiAnalysis.extractedData?.price as number) || 0,
        }));

    // AI 分析刷新
    const handleAiRefresh = () => {
        setIsAiSummarizing(true);
        setTimeout(() => setIsAiSummarizing(false), 2000);
    };

    // 价格区间计算
    const priceRange =
        chartData.length > 0
            ? `${Math.min(...chartData.map((d) => d.price))} - ${Math.max(...chartData.map((d) => d.price))}`
            : '--';

    return (
        <div
            style={{
                height: '100%',
                overflow: 'auto',
                padding: '32px 24px',
                background: token.colorBgLayout,
            }}
        >
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                {/* 标题 */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={2} style={{ marginBottom: 8 }}>
                        全景检索 (Universal Search)
                    </Title>
                    <Text type="secondary">穿透数据壁垒，发现隐性关联。</Text>
                </div>

                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    {/* 搜索框 */}
                    <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />}
                            suffix={
                                <Button
                                    type={showFilters ? 'primary' : 'text'}
                                    icon={<ControlOutlined />}
                                    onClick={() => setShowFilters(!showFilters)}
                                    style={{
                                        background: showFilters ? token.colorPrimaryBg : 'transparent',
                                        color: showFilters ? token.colorPrimary : token.colorTextSecondary
                                    }}
                                />
                            }
                            placeholder="输入关键词：'玉米'、'补贴'、'锦州港'..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            size="large"
                            bordered={false}
                            style={{ padding: '16px 20px', fontSize: 16 }}
                        />
                    </Card>

                    {/* 筛选面板 */}
                    {showFilters && (
                        <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: 16 }}>
                            <Flex gap={48}>
                                <div>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                                    >
                                        时间范围
                                    </Text>
                                    <Segmented
                                        options={[
                                            { label: '全部', value: 'ALL' },
                                            { label: '24小时', value: '24H' },
                                            { label: '近7天', value: '7D' },
                                            { label: '近30天', value: '30D' },
                                        ]}
                                        value={dateRange}
                                        onChange={(val) => setDateRange(val as TimeRange)}
                                    />
                                </div>
                                <div>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                                    >
                                        情感倾向
                                    </Text>
                                    <Segmented
                                        options={[
                                            { label: '全部', value: 'ALL' },
                                            { label: '利好', value: 'positive' },
                                            { label: '利空', value: 'negative' },
                                        ]}
                                        value={sentimentFilter}
                                        onChange={(val) => setSentimentFilter(val as SentimentFilter)}
                                    />
                                </div>
                            </Flex>
                        </Card>
                    )}
                </div>

                {filteredResults.length > 0 ? (
                    <>
                        {/* AI 智能综述 */}
                        <Card
                            style={{
                                marginBottom: 24,
                                background: `linear-gradient(135deg, ${token.colorInfoBg} 0%, ${token.colorBgContainer} 100%)`,
                                borderColor: token.colorPrimaryBorder,
                            }}
                        >
                            <Flex justify="space-between" align="flex-start">
                                <div>
                                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                                        <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                                        <Text strong style={{ fontSize: 16, color: token.colorPrimary }}>
                                            AI 智能综述 (Insight)
                                        </Text>
                                    </Flex>

                                    {isAiSummarizing ? (
                                        <Flex align="center" gap={8}>
                                            <div
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    background: token.colorPrimary,
                                                    animation: 'pulse 1s infinite',
                                                }}
                                            />
                                            <Text type="secondary">
                                                AI 正在阅读 {filteredResults.length} 条情报并生成结论...
                                            </Text>
                                        </Flex>
                                    ) : (
                                        <div>
                                            <Paragraph style={{ marginBottom: 8 }}>
                                                <Text strong>市场共识：</Text>
                                                基于检索到的 {filteredResults.length} 条记录，当前围绕"
                                                <Text strong style={{ borderBottom: `2px solid ${token.colorPrimary}` }}>
                                                    {query}
                                                </Text>
                                                "的市场情绪整体呈现{' '}
                                                <Text
                                                    strong
                                                    style={{
                                                        color:
                                                            intelResults.filter((c) => c.aiAnalysis.sentiment === 'positive').length >
                                                                intelResults.filter((c) => c.aiAnalysis.sentiment === 'negative').length
                                                                ? token.colorError
                                                                : token.colorTextSecondary,
                                                    }}
                                                >
                                                    震荡
                                                </Text>{' '}
                                                态势。
                                            </Paragraph>
                                            <ul style={{ margin: 0, paddingLeft: 20, color: token.colorTextSecondary }}>
                                                <li>
                                                    <Text strong>数据面：</Text> 相关价格在 {priceRange} 元/吨区间波动。
                                                </li>
                                                <li>
                                                    <Text strong>关注点：</Text> 主要涉及{' '}
                                                    {relatedTags
                                                        .slice(0, 3)
                                                        .map((t) => t[0])
                                                        .join('、')}{' '}
                                                    等关键实体。
                                                </li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <Button
                                    type="text"
                                    icon={<ReloadOutlined />}
                                    onClick={handleAiRefresh}
                                    loading={isAiSummarizing}
                                >
                                    刷新分析 <RightOutlined />
                                </Button>
                            </Flex>
                        </Card>

                        {/* 相关实体推荐 */}
                        {relatedTags.length > 0 && (
                            <Flex align="center" gap={12} style={{ marginBottom: 24, overflowX: 'auto' }}>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}
                                >
                                    <TagOutlined style={{ marginRight: 4 }} />
                                    相关实体推荐:
                                </Text>
                                {relatedTags.map(([tag, count]) => (
                                    <Tag
                                        key={tag}
                                        style={{ cursor: 'pointer', flexShrink: 0 }}
                                        onClick={() => setQuery(tag.replace('#', ''))}
                                    >
                                        {tag} <span style={{ opacity: 0.5, marginLeft: 4 }}>{count}</span>
                                    </Tag>
                                ))}
                            </Flex>
                        )}

                        {/* 三栏分类展示 */}
                        <Row gutter={24}>
                            {/* 数据趋势 */}
                            <Col xs={24} lg={8}>
                                <Card
                                    title={
                                        <Flex align="center" gap={8}>
                                            <LineChartOutlined style={{ color: token.colorPrimary }} />
                                            <Text strong>数据趋势 (Data)</Text>
                                            <Tag color="blue">{marketResults.length}</Tag>
                                        </Flex>
                                    }
                                    style={{ height: '100%' }}
                                >
                                    {marketResults.length > 0 ? (
                                        <>
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                                            >
                                                价格走势概览
                                            </Text>
                                            <div style={{ height: 140, marginBottom: 16 }}>
                                                <ChartContainer height={140}>
                                                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                                        <LineChart data={chartData}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                                            <YAxis domain={['auto', 'auto']} hide />
                                                            <Tooltip />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="price"
                                                                stroke={token.colorPrimary}
                                                                strokeWidth={2}
                                                                dot={{ r: 3, fill: token.colorPrimary }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </ChartContainer>
                                            </div>
                                            <div style={{ maxHeight: 200, overflow: 'auto' }}>
                                                {marketResults.map((c) => (
                                                    <Flex
                                                        key={c.id}
                                                        justify="space-between"
                                                        align="center"
                                                        style={{
                                                            padding: 12,
                                                            background: token.colorBgTextHover,
                                                            borderRadius: token.borderRadius,
                                                            marginBottom: 8,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div>
                                                            <Text strong>{c.metadata.location}</Text>
                                                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                                {new Date(c.metadata.effectiveTime).toLocaleDateString()}
                                                            </Text>
                                                        </div>
                                                        <Text strong>
                                                            {(c.aiAnalysis.extractedData?.price as number)?.toLocaleString()}
                                                            <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                                                元
                                                            </Text>
                                                        </Text>
                                                    </Flex>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <Empty description="未找到相关结构化数据" />
                                    )}
                                </Card>
                            </Col>

                            {/* 相关文档 */}
                            <Col xs={24} lg={8}>
                                <Card
                                    title={
                                        <Flex align="center" gap={8}>
                                            <FileTextOutlined style={{ color: token.colorWarning }} />
                                            <Text strong>相关文档 (Docs)</Text>
                                            <Tag color="orange">{docResults.length}</Tag>
                                        </Flex>
                                    }
                                    style={{ height: '100%' }}
                                >
                                    {docResults.length > 0 ? (
                                        <div style={{ maxHeight: 400, overflow: 'auto' }}>
                                            {docResults.map((c) => (
                                                <Card
                                                    key={c.id}
                                                    size="small"
                                                    hoverable
                                                    style={{ marginBottom: 12 }}
                                                >
                                                    <Flex gap={8} align="flex-start">
                                                        <FileTextOutlined style={{ color: token.colorWarning, marginTop: 4 }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <Text strong ellipsis style={{ display: 'block' }}>
                                                                {c.rawContent.split(']')[1] || c.rawContent.substring(0, 30)}...
                                                            </Text>
                                                            <Card
                                                                size="small"
                                                                style={{
                                                                    background: `${token.colorWarning}08`,
                                                                    marginTop: 8,
                                                                    marginBottom: 8,
                                                                }}
                                                                bodyStyle={{ padding: 8 }}
                                                            >
                                                                <Text style={{ fontSize: 12 }}>
                                                                    <Text strong style={{ color: token.colorWarning }}>
                                                                        AI摘要:
                                                                    </Text>{' '}
                                                                    {c.aiAnalysis.summary}
                                                                </Text>
                                                            </Card>
                                                            <Flex justify="space-between" align="center">
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    <CalendarOutlined style={{ marginRight: 4 }} />
                                                                    {new Date(c.metadata.effectiveTime).toLocaleDateString()}
                                                                </Text>
                                                                <Tag style={{ fontSize: 10 }}>
                                                                    {INTEL_SOURCE_TYPE_LABELS[c.metadata.sourceType]}
                                                                </Tag>
                                                            </Flex>
                                                        </div>
                                                    </Flex>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty description="未找到相关文档" />
                                    )}
                                </Card>
                            </Col>

                            {/* 市场情报 */}
                            <Col xs={24} lg={8}>
                                <Card
                                    title={
                                        <Flex align="center" gap={8}>
                                            <AlertOutlined style={{ color: '#722ed1' }} />
                                            <Text strong>市场情报 (Intel)</Text>
                                            <Tag color="purple">{intelResults.length}</Tag>
                                        </Flex>
                                    }
                                    style={{ height: '100%' }}
                                >
                                    {intelResults.length > 0 ? (
                                        <div
                                            style={{
                                                maxHeight: 400,
                                                overflow: 'auto',
                                                borderLeft: `2px solid ${token.colorBorderSecondary}`,
                                                paddingLeft: 16,
                                                marginLeft: 8,
                                            }}
                                        >
                                            {intelResults.map((c) => (
                                                <div key={c.id} style={{ position: 'relative', marginBottom: 16 }}>
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: -22,
                                                            top: 8,
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: '50%',
                                                            background: token.colorBgContainer,
                                                            border: `2px solid ${c.aiAnalysis.sentiment === 'positive'
                                                                ? token.colorSuccess
                                                                : c.aiAnalysis.sentiment === 'negative'
                                                                    ? token.colorError
                                                                    : '#722ed1'
                                                                }`,
                                                        }}
                                                    />
                                                    <Card size="small" hoverable>
                                                        <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                {new Date(c.metadata.submittedAt).toLocaleDateString()}
                                                            </Text>
                                                            {c.isFlagged && (
                                                                <AlertOutlined style={{ color: token.colorError, fontSize: 12 }} />
                                                            )}
                                                        </Flex>
                                                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                            {c.aiAnalysis.summary}
                                                        </Text>
                                                        <Flex gap={4} wrap="wrap">
                                                            {c.aiAnalysis.tags.slice(0, 3).map((t) => (
                                                                <Tag key={t} style={{ fontSize: 10 }}>
                                                                    {t}
                                                                </Tag>
                                                            ))}
                                                        </Flex>
                                                    </Card>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty description="未找到相关情报" />
                                    )}
                                </Card>
                            </Col>
                        </Row>
                    </>
                ) : (
                    <Card style={{ textAlign: 'center', padding: 48 }}>
                        <SearchOutlined
                            style={{ fontSize: 64, color: token.colorTextQuaternary, marginBottom: 16 }}
                        />
                        <Title level={4} type="secondary">
                            输入关键词，开始全维度检索...
                        </Title>
                    </Card>
                )}
            </div>
        </div >
    );
};

export default UniversalSearch;
