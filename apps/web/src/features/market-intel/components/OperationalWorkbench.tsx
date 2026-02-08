import React, { useState, useMemo } from 'react';
import {
    Card,
    Typography,
    Button,
    Tag,
    Flex,
    Segmented,
    Empty,
    Switch,
    theme,
    Row,
    Col,
    Badge,
    Spin,
} from 'antd';
import {
    ThunderboltOutlined,
    FilterOutlined,
    ClockCircleOutlined,
    AlertOutlined,
    UnorderedListOutlined,
    AppstoreOutlined,
    RightOutlined,
    FireOutlined,
    TagOutlined,
    SoundOutlined,
    PlusOutlined,
    RiseOutlined,
    FallOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, Cell, Tooltip } from 'recharts';
import { useMarketIntels } from '../api/hooks';
import { IntelCategory, IntelSourceType, MarketIntelResponse, INTEL_SOURCE_TYPE_LABELS } from '@packages/types';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Title, Text, Paragraph } = Typography;

type TimeRange = '24H' | '3D' | '7D';
type ViewMode = 'CLUSTER' | 'STREAM';

export const OperationalWorkbench: React.FC = () => {
    const { token } = theme.useToken();
    const { data: dictionaries } = useDictionaries(['INTEL_SOURCE_TYPE']);

    const sourceTypeMeta = useMemo(() => {
        const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
        const fallbackColors: Record<string, string> = {
            [IntelSourceType.FIRST_LINE]: 'blue',
            [IntelSourceType.COMPETITOR]: 'volcano',
            [IntelSourceType.OFFICIAL]: 'green',
            [IntelSourceType.RESEARCH_INST]: 'purple',
            [IntelSourceType.MEDIA]: 'orange',
            [IntelSourceType.INTERNAL_REPORT]: 'geekblue',
        };
        if (!items.length) {
            return {
                labels: INTEL_SOURCE_TYPE_LABELS,
                colors: fallbackColors,
            };
        }
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'default';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    // 视图状态
    const [activeView, setActiveView] = useState<ViewMode>('CLUSTER');

    // 筛选状态
    const [timeRange, setTimeRange] = useState<TimeRange>('24H');
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [onlyUrgent, setOnlyUrgent] = useState(false);

    // 使用真实 API 获取 B 类数据
    const { data: intelsResult, isLoading } = useMarketIntels({
        category: IntelCategory.B_SEMI_STRUCTURED,
        pageSize: 100,
    });

    const allIntels = intelsResult?.data || [];

    // 筛选逻辑
    const filteredData = useMemo(() => {
        let res = allIntels;
        const now = Date.now();

        // 时间筛选
        const hours = timeRange === '24H' ? 24 : timeRange === '3D' ? 72 : 168;
        res = res.filter((c) => new Date(c.effectiveTime).getTime() > now - 1000 * 60 * 60 * hours);

        // 信源筛选
        if (selectedSources.size > 0) {
            res = res.filter((c) => selectedSources.has(c.sourceType));
        }

        // 标签筛选
        if (selectedTags.size > 0) {
            res = res.filter((c) => {
                const aiAnalysis = c.aiAnalysis as any || {};
                return (aiAnalysis.tags || []).some((t: string) => selectedTags.has(t));
            });
        }

        // 异常筛选
        if (onlyUrgent) {
            res = res.filter((c) => {
                const aiAnalysis = c.aiAnalysis as any || {};
                return aiAnalysis.sentiment === 'BEARISH' || aiAnalysis.sentiment === 'negative';
            });
        }

        return res.sort(
            (a, b) => new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime(),
        );
    }, [allIntels, timeRange, selectedSources, selectedTags, onlyUrgent]);

    // 智能聚类
    const clusters = useMemo(() => {
        const groups: Record<string, { title: string; count: number; sentiment: string; latestTime: string; cards: MarketIntelResponse[] }> = {};

        filteredData.forEach((intel) => {
            const aiAnalysis = intel.aiAnalysis as any || {};
            const tags = aiAnalysis.tags || [];
            let groupKey = tags.find((t: string) => t.includes('物流') || t.includes('停收') || t.includes('补贴') || t.includes('检修')) || tags[0] || '其他动态';
            groupKey = groupKey.replace('#', '');

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    title: `${groupKey} 相关聚合`,
                    count: 0,
                    sentiment: aiAnalysis.sentiment || 'NEUTRAL',
                    latestTime: intel.effectiveTime as unknown as string,
                    cards: [],
                };
            }
            groups[groupKey].count++;
            groups[groupKey].cards.push(intel);
            if (new Date(intel.effectiveTime) > new Date(groups[groupKey].latestTime)) {
                groups[groupKey].latestTime = intel.effectiveTime as unknown as string;
            }
        });

        return Object.values(groups).sort((a, b) => b.count - a.count);
    }, [filteredData]);

    // 情绪统计
    const sentimentStats = useMemo(
        () => [
            { name: '利好', value: filteredData.filter((c) => (c.aiAnalysis as any)?.sentiment === 'BULLISH' || (c.aiAnalysis as any)?.sentiment === 'positive').length, color: token.colorSuccess },
            { name: '中性', value: filteredData.filter((c) => (c.aiAnalysis as any)?.sentiment === 'NEUTRAL' || (c.aiAnalysis as any)?.sentiment === 'neutral' || !(c.aiAnalysis as any)?.sentiment).length, color: token.colorTextSecondary },
            { name: '利空', value: filteredData.filter((c) => (c.aiAnalysis as any)?.sentiment === 'BEARISH' || (c.aiAnalysis as any)?.sentiment === 'negative').length, color: token.colorError },
        ],
        [filteredData, token],
    );

    // 热门标签
    const topTags = useMemo(() => {
        const counts: Record<string, number> = {};
        allIntels.forEach((c) => {
            const aiAnalysis = c.aiAnalysis as any || {};
            (aiAnalysis.tags || []).forEach((t: string) => (counts[t] = (counts[t] || 0) + 1));
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map((e) => e[0]);
    }, [allIntels]);

    const toggleSource = (s: string) => {
        const next = new Set(selectedSources);
        if (next.has(s)) next.delete(s);
        else next.add(s);
        setSelectedSources(next);
    };

    const toggleTag = (t: string) => {
        const next = new Set(selectedTags);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        setSelectedTags(next);
    };

    // 自选指标数据
    const watchlistItems = [
        { name: '锦州港容重720', val: '2820', chg: '+10', type: 'UP' as const },
        { name: '鲅鱼圈水分15', val: '2815', chg: '0', type: 'STABLE' as const },
        { name: '淀粉加工利润', val: '-50', chg: '-12', type: 'DOWN' as const },
        { name: '大连港到货量', val: '1.2万', chg: '+0.2', type: 'UP' as const },
    ];

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧筛选面板 */}
            <Card
                style={{ width: 260, height: '100%', overflow: 'auto', borderRadius: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <Flex align="center" gap={8} style={{ marginBottom: 20 }}>
                    <FilterOutlined style={{ color: token.colorPrimary }} />
                    <Text strong>战术切片 (Tactical)</Text>
                </Flex>

                {/* 时间窗口 */}
                <div style={{ marginBottom: 24 }}>
                    <Text
                        type="secondary"
                        style={{ fontSize: 10, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                    >
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        时间窗口
                    </Text>
                    <Segmented
                        block
                        options={[
                            { label: '24小时', value: '24H' },
                            { label: '近3天', value: '3D' },
                            { label: '近1周', value: '7D' },
                        ]}
                        value={timeRange}
                        onChange={(val) => setTimeRange(val as TimeRange)}
                        size="small"
                    />
                </div>

                {/* 异常开关 */}
                <Card
                    size="small"
                    style={{
                        marginBottom: 24,
                        background: onlyUrgent ? token.colorErrorBg : undefined,
                        borderColor: onlyUrgent ? token.colorErrorBorder : undefined,
                        cursor: 'pointer',
                    }}
                    bodyStyle={{ padding: 12 }}
                    onClick={() => setOnlyUrgent(!onlyUrgent)}
                >
                    <Flex justify="space-between" align="center">
                        <Flex align="center" gap={8}>
                            <AlertOutlined style={{ color: onlyUrgent ? token.colorError : token.colorTextSecondary }} />
                            <Text strong style={{ color: onlyUrgent ? token.colorError : undefined }}>
                                仅看异常/阻断
                            </Text>
                        </Flex>
                        <Switch checked={onlyUrgent} size="small" />
                    </Flex>
                </Card>

                {/* 信源分级 */}
                <div style={{ marginBottom: 24 }}>
                    <Text
                        type="secondary"
                        style={{ fontSize: 10, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                    >
                        <SoundOutlined style={{ marginRight: 4 }} />
                        信源分级
                    </Text>
                    <Flex vertical gap={8}>
                        {[IntelSourceType.FIRST_LINE, IntelSourceType.COMPETITOR, IntelSourceType.OFFICIAL].map((src) => (
                            <Button
                                key={src}
                                size="small"
                                type={selectedSources.has(src) ? 'primary' : 'default'}
                                ghost={selectedSources.has(src)}
                                onClick={() => toggleSource(src)}
                                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                            >
                                {sourceTypeMeta.labels[src] || src}
                            </Button>
                        ))}
                    </Flex>
                </div>

                {/* 业务标签 */}
                <div>
                    <Text
                        type="secondary"
                        style={{ fontSize: 10, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}
                    >
                        <TagOutlined style={{ marginRight: 4 }} />
                        业务标签
                    </Text>
                    <Flex wrap="wrap" gap={8}>
                        {topTags.length > 0 ? (
                            topTags.map((tag) => (
                                <Tag
                                    key={tag}
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedTags.has(tag) ? `${token.colorPrimary}15` : undefined,
                                        borderColor: selectedTags.has(tag) ? token.colorPrimary : undefined,
                                        color: selectedTags.has(tag) ? token.colorPrimary : undefined,
                                    }}
                                    onClick={() => toggleTag(tag)}
                                >
                                    {tag}
                                </Tag>
                            ))
                        ) : (
                            <Text type="secondary">暂无标签</Text>
                        )}
                    </Flex>
                </div>
            </Card>

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 顶部工具栏 */}
                <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: '16px 24px' }}>
                    <Flex justify="space-between" align="center">
                        <div>
                            <Flex align="center" gap={8}>
                                <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 24 }} />
                                <Title level={4} style={{ margin: 0 }}>
                                    业务工作台 (Ops Center)
                                </Title>
                            </Flex>
                            <Flex gap={16} style={{ marginTop: 8 }}>
                                <Text type="secondary">
                                    待流转束: <Text strong>{filteredData.length}</Text> 条情报
                                </Text>
                                <Text type="secondary">
                                    聚合主题: <Text strong>{clusters.length}</Text> 个
                                </Text>
                                {onlyUrgent && (
                                    <Text type="danger" strong>
                                        <AlertOutlined style={{ marginRight: 4 }} />
                                        异常过滤已开启
                                    </Text>
                                )}
                            </Flex>
                        </div>

                        <Flex align="center" gap={16}>
                            {/* 情绪分布图 */}
                            <div style={{ width: 100, height: 32 }}>
                                <BarChart data={sentimentStats} width={100} height={32}>
                                    <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                                        {sentimentStats.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Bar>
                                    <Tooltip cursor={{ fill: 'transparent' }} />
                                </BarChart>
                            </div>

                            {/* 视图切换 */}
                            <Segmented
                                options={[
                                    { label: <><AppstoreOutlined /> 智能聚合</>, value: 'CLUSTER' },
                                    { label: <><UnorderedListOutlined /> 实时流</>, value: 'STREAM' },
                                ]}
                                value={activeView}
                                onChange={(val) => setActiveView(val as ViewMode)}
                            />
                        </Flex>
                    </Flex>
                </Card>

                {/* 内容区 */}
                <Flex style={{ flex: 1, overflow: 'hidden' }}>
                    {/* 主列表 */}
                    <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                        {isLoading ? (
                            <Flex justify="center" align="center" style={{ height: 200 }}>
                                <Spin size="large" />
                            </Flex>
                        ) : activeView === 'CLUSTER' ? (
                            clusters.length > 0 ? (
                                <Row gutter={[16, 16]}>
                                    {clusters.map((cluster, idx) => (
                                        <Col key={idx} xs={24} md={12} xl={8}>
                                            <Card
                                                hoverable
                                                style={{
                                                    height: '100%',
                                                    borderTop: `3px solid ${cluster.sentiment === 'BEARISH' || cluster.sentiment === 'negative'
                                                        ? token.colorError
                                                        : cluster.sentiment === 'BULLISH' || cluster.sentiment === 'positive'
                                                            ? token.colorSuccess
                                                            : token.colorBorder
                                                        }`,
                                                }}
                                            >
                                                {/* 头部 */}
                                                <Flex justify="space-between" align="flex-start" style={{ marginBottom: 12 }}>
                                                    <div>
                                                        <Flex align="center" gap={8}>
                                                            {cluster.count >= 3 && (
                                                                <FireOutlined style={{ color: token.colorWarning }} />
                                                            )}
                                                            <Text strong style={{ fontSize: 16 }}>
                                                                {cluster.title}
                                                            </Text>
                                                        </Flex>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                            更新:{' '}
                                                            {new Date(cluster.latestTime).toLocaleTimeString('zh-CN', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </Text>
                                                    </div>
                                                    <Badge
                                                        count={cluster.count}
                                                        style={{
                                                            background: token.colorBgContainer,
                                                            color: token.colorText,
                                                            border: `1px solid ${token.colorBorder}`,
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                        }}
                                                    />
                                                </Flex>

                                                {/* 内容摘要 */}
                                                <div style={{ marginBottom: 16 }}>
                                                    {cluster.cards.slice(0, 3).map((intel) => {
                                                        const aiAnalysis = intel.aiAnalysis as any || {};
                                                        return (
                                                            <div
                                                                key={intel.id}
                                                                style={{
                                                                    borderLeft: `2px solid ${aiAnalysis.sentiment === 'BULLISH' || aiAnalysis.sentiment === 'positive'
                                                                        ? token.colorSuccess
                                                                        : aiAnalysis.sentiment === 'BEARISH' || aiAnalysis.sentiment === 'negative'
                                                                            ? token.colorError
                                                                            : token.colorBorderSecondary
                                                                        }`,
                                                                    paddingLeft: 12,
                                                                    marginBottom: 8,
                                                                }}
                                                            >
                                                                <Paragraph
                                                                    type="secondary"
                                                                    ellipsis={{ rows: 2 }}
                                                                    style={{ margin: 0, fontSize: 12 }}
                                                                >
                                                                    {intel.summary || aiAnalysis.summary || intel.rawContent.slice(0, 100)}
                                                                </Paragraph>
                                                                <Flex align="center" gap={8} style={{ marginTop: 4 }}>
                                                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                                                        {intel.author?.name || '系统'}
                                                                    </Text>
                                                                </Flex>
                                                            </div>
                                                        );
                                                    })}
                                                    {cluster.count > 3 && (
                                                        <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center' }}>
                                                            ... 还有 {cluster.count - 3} 条相关动态
                                                        </Text>
                                                    )}
                                                </div>

                                                {/* 底部 */}
                                                <Flex justify="space-between" align="center">
                                                    <Tag
                                                        color={
                                                            cluster.sentiment === 'BULLISH' || cluster.sentiment === 'positive'
                                                                ? 'success'
                                                                : cluster.sentiment === 'BEARISH' || cluster.sentiment === 'negative'
                                                                    ? 'error'
                                                                    : 'default'
                                                        }
                                                    >
                                                        {cluster.sentiment === 'BULLISH' || cluster.sentiment === 'positive'
                                                            ? '利好偏多'
                                                            : cluster.sentiment === 'BEARISH' || cluster.sentiment === 'negative'
                                                                ? '利空预警'
                                                                : '多空交织'}
                                                    </Tag>
                                                    <Button type="link" size="small">
                                                        查看详情 <RightOutlined />
                                                    </Button>
                                                </Flex>
                                            </Card>
                                        </Col>
                                    ))}
                                </Row>
                            ) : (
                                <Empty description="无相关聚类数据，请调整左侧筛选条件" />
                            )
                        ) : (
                            <Card>
                                {filteredData.length > 0 ? (
                                    filteredData.map((intel) => {
                                        const aiAnalysis = intel.aiAnalysis as any || {};
                                        return (
                                            <Card.Grid key={intel.id} style={{ width: '100%', padding: 16 }}>
                                                <Flex gap={16} align="flex-start">
                                                    <div style={{ textAlign: 'center', minWidth: 50 }}>
                                                        <Text strong>
                                                            {new Date(intel.effectiveTime).toLocaleTimeString('zh-CN', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </Text>
                                                        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                                                            {new Date(intel.effectiveTime).getMonth() + 1}-
                                                            {new Date(intel.effectiveTime).getDate()}
                                                        </Text>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <Flex gap={8} style={{ marginBottom: 4 }}>
                                                            <Tag>{intel.location}</Tag>
                                                            <Tag color={sourceTypeMeta.colors[intel.sourceType] || 'default'}>
                                                                {sourceTypeMeta.labels[intel.sourceType] || intel.sourceType}
                                                            </Tag>
                                                        </Flex>
                                                        <Text strong>{intel.summary || aiAnalysis.summary || intel.rawContent.slice(0, 100)}</Text>
                                                        {aiAnalysis.structuredEvent && (
                                                            <Card size="small" style={{ marginTop: 8, background: token.colorBgTextHover }}>
                                                                <Flex gap={16}>
                                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                                        动作: <Text style={{ color: token.colorPrimary }}>{aiAnalysis.structuredEvent.action}</Text>
                                                                    </Text>
                                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                                        影响: <Text style={{ color: token.colorWarning }}>{aiAnalysis.structuredEvent.impact}</Text>
                                                                    </Text>
                                                                </Flex>
                                                            </Card>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div
                                                            style={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                background:
                                                                    aiAnalysis.sentiment === 'BULLISH' || aiAnalysis.sentiment === 'positive'
                                                                        ? token.colorSuccess
                                                                        : aiAnalysis.sentiment === 'BEARISH' || aiAnalysis.sentiment === 'negative'
                                                                            ? token.colorError
                                                                            : token.colorTextSecondary,
                                                            }}
                                                        />
                                                    </div>
                                                </Flex>
                                            </Card.Grid>
                                        );
                                    })
                                ) : (
                                    <Empty description="没有符合筛选条件的即时情报" />
                                )}
                            </Card>
                        )}
                    </div>

                    {/* 右侧监控面板 */}
                    <Card
                        style={{ width: 280, height: '100%', overflow: 'auto', borderRadius: 0 }}
                        bodyStyle={{ padding: 0 }}
                    >
                        {/* 重点监控 */}
                        <div style={{ padding: 16, borderBottom: `1px solid ${token.colorBorder}` }}>
                            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                                <Flex align="center" gap={8}>
                                    <AlertOutlined style={{ color: token.colorError }} />
                                    <Text strong>重点监控 (Alerts)</Text>
                                </Flex>
                                <Tag color="error">2</Tag>
                            </Flex>

                            <Card
                                size="small"
                                style={{ background: token.colorErrorBg, borderColor: token.colorErrorBorder, marginBottom: 12 }}
                            >
                                <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                    <Text strong style={{ color: token.colorError, fontSize: 12 }}>
                                        通辽梅花停收
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                        10分钟前
                                    </Text>
                                </Flex>
                                <Text style={{ fontSize: 11, color: token.colorError }}>
                                    因设备故障暂停收购潮粮，排队车辆积压严重。
                                </Text>
                            </Card>

                            <Card
                                size="small"
                                style={{ background: token.colorWarningBg, borderColor: token.colorWarningBorder }}
                            >
                                <Flex justify="space-between" style={{ marginBottom: 4 }}>
                                    <Text strong style={{ color: '#d97706', fontSize: 12 }}>
                                        北港价格倒挂
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                        1小时前
                                    </Text>
                                </Flex>
                                <Text style={{ fontSize: 11, color: '#d97706' }}>
                                    集港成本已高于平舱价20元/吨。
                                </Text>
                            </Card>
                        </div>

                        {/* 自选指标 */}
                        <div style={{ padding: 16 }}>
                            <Text
                                type="secondary"
                                style={{ fontSize: 10, textTransform: 'uppercase', display: 'block', marginBottom: 16 }}
                            >
                                我的自选指标
                            </Text>

                            {watchlistItems.map((item, idx) => (
                                <Flex
                                    key={idx}
                                    justify="space-between"
                                    align="center"
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: token.borderRadius,
                                        marginBottom: 4,
                                        cursor: 'pointer',
                                    }}
                                    className="hover-bg"
                                >
                                    <Text style={{ fontSize: 12 }}>{item.name}</Text>
                                    <div style={{ textAlign: 'right' }}>
                                        <Text strong style={{ fontFamily: 'monospace' }}>
                                            {item.val}
                                        </Text>
                                        <div style={{ fontSize: 10 }}>
                                            {item.type === 'UP' && (
                                                <Text type="danger">
                                                    <RiseOutlined /> {item.chg}
                                                </Text>
                                            )}
                                            {item.type === 'DOWN' && (
                                                <Text type="success">
                                                    <FallOutlined /> {item.chg}
                                                </Text>
                                            )}
                                            {item.type === 'STABLE' && <Text type="secondary">{item.chg}</Text>}
                                        </div>
                                    </div>
                                </Flex>
                            ))}

                            <Button
                                type="dashed"
                                block
                                icon={<PlusOutlined />}
                                style={{ marginTop: 16 }}
                            >
                                添加监控指标
                            </Button>
                        </div>
                    </Card>
                </Flex>
            </Flex>
        </Flex>
    );
};

export default OperationalWorkbench;
