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
    FullscreenOutlined,
    FullscreenExitOutlined,
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
import { IntelCategory, INTEL_SOURCE_TYPE_LABELS } from '../types';
import { useMarketIntels, usePriceData, useAnalyzeContent } from '../api/hooks';
import { ChartContainer } from './ChartContainer';

const { Title, Text, Paragraph } = Typography;

type TimeRange = 'ALL' | '24H' | '7D' | '30D';
type SentimentFilter = 'ALL' | 'positive' | 'negative';

export const UniversalSearch: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [query, setQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [dateRange, setDateRange] = useState<TimeRange>('ALL');
    const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('ALL');
    const [isAiSummarizing, setIsAiSummarizing] = useState(false);
    const analyzeMutation = useAnalyzeContent();
    const [expandedSection, setExpandedSection] = useState<'price' | 'doc' | 'intel' | null>(null);

    const toggleExpand = (section: 'price' | 'doc' | 'intel') => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    // 1. Price Data
    const { data: priceData } = usePriceData({ keyword: query, pageSize: 50 });
    const prices = priceData?.data || [];

    // 2. Market Intel (Semi-structured)
    const { data: intelData } = useMarketIntels({
        keyword: query,
        category: IntelCategory.B_SEMI_STRUCTURED,
        pageSize: 20
    });
    const intels = intelData?.data || [];

    // 3. Documents
    const { data: docData } = useMarketIntels({
        keyword: query,
        category: IntelCategory.C_DOCUMENT,
        pageSize: 20
    });
    const docs = docData?.data || [];

    // Combined Results for Analysis
    const combinedResults = useMemo(() => {
        return [...intels, ...docs];
    }, [intels, docs]);

    const hasResults = prices.length > 0 || intels.length > 0 || docs.length > 0;

    // 图表数据
    const chartData = useMemo(() => {
        return prices
            .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())
            .map((p) => ({
                date: new Date(p.effectiveDate).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                }),
                price: p.price,
                location: p.location,
            }));
    }, [prices]);

    // 价格区间计算
    const priceRange = useMemo(() => {
        return chartData.length > 0
            ? `${Math.min(...chartData.map((d) => d.price))} - ${Math.max(...chartData.map((d) => d.price))}`
            : '--';
    }, [chartData]);


    // 相关实体提取
    const relatedTags = useMemo(() => {
        const tags = new Map<string, number>();
        combinedResults.forEach((c) => {
            if (c.aiAnalysis) {
                c.aiAnalysis.tags.forEach((t) => {
                    if (!t.toLowerCase().includes(query.toLowerCase()))
                        tags.set(t, (tags.get(t) || 0) + 1);
                });
                c.aiAnalysis.entities?.forEach((e) => {
                    if (!e.toLowerCase().includes(query.toLowerCase()))
                        tags.set(e, (tags.get(e) || 0) + 1);
                });
            }
        });
        return Array.from(tags.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
    }, [combinedResults, query]);


    // AI 分析刷新
    const handleAiRefresh = () => {
        if (!combinedResults.length) return;

        // 收集前 5 条相关情报的内容进行综合分析
        const topContent = combinedResults
            .slice(0, 5)
            .map(r => r.aiAnalysis?.summary || r.rawContent)
            .join('\n---\n');

        analyzeMutation.mutate({
            content: `关键词：${query}\n相关数据：\n${topContent}`,
            category: IntelCategory.B_SEMI_STRUCTURED, // 使用商情分类进行综述
        });
    };

    const aiSummaryResult = analyzeMutation.data;
    const isSummarizing = analyzeMutation.isPending;

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

                {hasResults ? (
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

                                    {isSummarizing ? (
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
                                                AI 正在阅读 {prices.length + intels.length} 条情报并生成结论...
                                            </Text>
                                        </Flex>
                                    ) : (
                                        <div>
                                            <Paragraph style={{ marginBottom: 8 }}>
                                                <Text strong>市场共识：</Text>
                                                {aiSummaryResult ? aiSummaryResult.summary : (
                                                    <>
                                                        基于检索到的 {prices.length + intels.length + docs.length} 条记录，当前围绕"
                                                        <Text strong style={{ borderBottom: `2px solid ${token.colorPrimary}` }}>
                                                            {query || '当前市场'}
                                                        </Text>
                                                        "的市场情绪整体呈现{' '}
                                                        <Text strong style={{ color: token.colorTextSecondary }}>
                                                            观察
                                                        </Text>{' '}
                                                        态势。
                                                    </>
                                                )}
                                            </Paragraph>
                                            <ul style={{ margin: 0, paddingLeft: 20, color: token.colorTextSecondary }}>
                                                <li>
                                                    <Text strong>数据面：</Text> {aiSummaryResult?.extractedData?.price ? `发现价格 ${aiSummaryResult.extractedData.price} 元/吨` : `相关价格在 ${priceRange} 元/吨区间波动。`}
                                                </li>
                                                <li>
                                                    <Text strong>关注点：</Text> 主要涉及{' '}
                                                    {(aiSummaryResult?.tags || relatedTags.slice(0, 3).map(t => t[0])).join('、') || '暂无其他'}{' '}
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
                                    loading={isSummarizing}
                                >
                                    刷新分析 <RightOutlined />
                                </Button>
                            </Flex>
                        </Card>

                        {/* 相关实体推荐 */}
                        {relatedTags.length > 0 && (
                            <Flex align="center" gap={12} style={{ marginBottom: 24, overflowX: 'auto' }}>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}>
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
                            {(expandedSection === null || expandedSection === 'price') && (
                                <Col xs={24} lg={expandedSection === 'price' ? 24 : 8}>
                                    <Card
                                        title={
                                            <Flex align="center" gap={8}>
                                                <LineChartOutlined style={{ color: token.colorPrimary }} />
                                                <Text strong>数据趋势 (Data)</Text>
                                                <Tag color="blue">{prices.length}</Tag>
                                            </Flex>
                                        }
                                        extra={
                                            <Button
                                                type="text"
                                                icon={expandedSection === 'price' ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                                onClick={() => toggleExpand('price')}
                                            />
                                        }
                                        style={{ height: '100%' }}
                                    >
                                        {prices.length > 0 ? (
                                            <>
                                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                                                    价格走势概览
                                                </Text>
                                                <div style={{ height: expandedSection === 'price' ? 500 : 280, marginBottom: 16, transition: 'height 0.3s' }}>
                                                    <ChartContainer height={expandedSection === 'price' ? 500 : 280}>
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
                                                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                                                    {prices.map((p) => (
                                                        <Flex
                                                            key={p.id}
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
                                                                <Text strong>{p.location}</Text>
                                                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                                    {new Date(p.effectiveDate).toLocaleDateString()}
                                                                </Text>
                                                            </div>
                                                            <Text strong>
                                                                {p.price.toLocaleString()}
                                                                <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                                                    元 ({p.commodity})
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
                            )}

                            {/* 相关文档 */}
                            {(expandedSection === null || expandedSection === 'doc') && (
                                <Col xs={24} lg={expandedSection === 'doc' ? 24 : 8}>
                                    <Card
                                        title={
                                            <Flex align="center" gap={8}>
                                                <FileTextOutlined style={{ color: token.colorWarning }} />
                                                <Text strong>相关文档 (Docs)</Text>
                                                <Tag color="orange">{docs.length}</Tag>
                                            </Flex>
                                        }
                                        extra={
                                            <Button
                                                type="text"
                                                icon={expandedSection === 'doc' ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                                onClick={() => toggleExpand('doc')}
                                            />
                                        }
                                        style={{ height: '100%' }}
                                    >
                                        {docs.length > 0 ? (
                                            <div style={{ maxHeight: 800, overflow: 'auto' }}>
                                                {docs.map((c) => (
                                                    <Card key={c.id} size="small" hoverable style={{ marginBottom: 12 }}>
                                                        <Flex gap={8} align="flex-start">
                                                            <FileTextOutlined style={{ color: token.colorWarning, marginTop: 4 }} />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <Text strong ellipsis style={{ display: 'block' }}>
                                                                    {c.rawContent.substring(0, 30)}...
                                                                </Text>
                                                                {c.aiAnalysis?.summary && (
                                                                    <Card size="small" style={{ background: `${token.colorWarning}08`, marginTop: 8, marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
                                                                        <Text style={{ fontSize: 12 }}>
                                                                            <Text strong style={{ color: token.colorWarning }}>AI摘要: </Text>
                                                                            {c.aiAnalysis.summary}
                                                                        </Text>
                                                                    </Card>
                                                                )}
                                                                <Flex justify="space-between" align="center">
                                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                                        <CalendarOutlined style={{ marginRight: 4 }} />
                                                                        {new Date(c.effectiveTime).toLocaleDateString()}
                                                                    </Text>
                                                                    <Tag style={{ fontSize: 10 }}>{INTEL_SOURCE_TYPE_LABELS[c.sourceType]}</Tag>
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
                            )}

                            {/* 市场情报 */}
                            {(expandedSection === null || expandedSection === 'intel') && (
                                <Col xs={24} lg={expandedSection === 'intel' ? 24 : 8}>
                                    <Card
                                        title={
                                            <Flex align="center" gap={8}>
                                                <AlertOutlined style={{ color: '#722ed1' }} />
                                                <Text strong>市场情报 (Intel)</Text>
                                                <Tag color="purple">{intels.length}</Tag>
                                            </Flex>
                                        }
                                        extra={
                                            <Button
                                                type="text"
                                                icon={expandedSection === 'intel' ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                                onClick={() => toggleExpand('intel')}
                                            />
                                        }
                                        style={{ height: '100%' }}
                                    >
                                        {intels.length > 0 ? (
                                            <div style={{ maxHeight: 800, overflow: 'auto', borderLeft: `2px solid ${token.colorBorderSecondary}`, paddingLeft: 16, marginLeft: 8 }}>
                                                {intels.map((c) => (
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
                                                                border: `2px solid ${c.aiAnalysis?.sentiment === 'positive' ? token.colorSuccess : c.aiAnalysis?.sentiment === 'negative' ? token.colorError : '#722ed1'}`,
                                                            }}
                                                        />
                                                        <Card size="small" hoverable>
                                                            <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    {new Date(c.effectiveTime).toLocaleDateString()}
                                                                </Text>
                                                                {c.isFlagged && <AlertOutlined style={{ color: token.colorError, fontSize: 12 }} />}
                                                            </Flex>
                                                            <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                                {c.aiAnalysis?.summary || c.rawContent.substring(0, 50)}...
                                                            </Text>
                                                            <Flex gap={4} wrap="wrap">
                                                                {c.aiAnalysis?.tags.slice(0, 3).map((t) => (
                                                                    <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>
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
                            )}
                        </Row>
                    </>
                ) : (
                    <Card style={{ textAlign: 'center', padding: 48 }}>
                        <SearchOutlined style={{ fontSize: 64, color: token.colorTextQuaternary, marginBottom: 16 }} />
                        <Title level={4} type="secondary">
                            输入关键词，开始全维度检索...
                        </Title>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default UniversalSearch;
