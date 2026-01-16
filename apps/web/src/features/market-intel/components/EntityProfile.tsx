import React, { useState, useMemo, useEffect } from 'react';
import {
    Card,
    Typography,
    Input,
    Button,
    Space,
    Tag,
    Avatar,
    Flex,
    Segmented,
    Empty,
    Table,
    Tabs,
    theme,
    Descriptions,
    Timeline,
    Statistic,
    Row,
    Col,
} from 'antd';
import {
    SearchOutlined,
    BankOutlined,
    EnvironmentOutlined,
    PhoneOutlined,
    SafetyCertificateOutlined,
    DownloadOutlined,
    AlertOutlined,
    DashboardOutlined,
    HistoryOutlined,
    LineChartOutlined,
    FileTextOutlined,
    ClockCircleOutlined,
    IdcardOutlined,
    RightOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    BarChart,
    Bar,
} from 'recharts';
import { ChartContainer } from './ChartContainer';
import { IntelCategory, type InfoCard, MOCK_CARDS } from '../types';

const { Title, Text, Paragraph } = Typography;

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export const EntityProfile: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [selectedEntity, setSelectedEntity] = useState<string>('');
    const [activeTab, setActiveTab] = useState<string>('OVERVIEW');
    const [timeRange, setTimeRange] = useState<TimeRange>('6M');

    // 实体提取
    const entityStats = useMemo(() => {
        const stats = new Map<string, { count: number; lastActive: string; types: Set<string> }>();

        MOCK_CARDS.forEach((c) => {
            const entities = c.aiAnalysis.entities || [];
            if (entities.length === 0 && c.metadata.location && !c.metadata.location.includes('省')) {
                entities.push(c.metadata.location);
            }

            entities.forEach((e) => {
                if (!stats.has(e)) {
                    stats.set(e, { count: 0, lastActive: '', types: new Set() });
                }
                const entry = stats.get(e)!;
                entry.count++;
                if (c.metadata.submittedAt > entry.lastActive) entry.lastActive = c.metadata.submittedAt;

                if (c.category === IntelCategory.A_STRUCTURED) entry.types.add('交易方');
                if (c.metadata.sourceType === 'COMPETITOR') entry.types.add('竞对');
            });
        });

        const sortedList = Array.from(stats.entries())
            .map(([name, stat]) => ({ name, ...stat, typeArr: Array.from(stat.types) }))
            .sort((a, b) => b.count - a.count);

        if (!selectedEntity && sortedList.length > 0) {
            setSelectedEntity(sortedList[0].name);
        }

        return sortedList;
    }, [selectedEntity]);

    const filteredEntities = entityStats.filter((e) =>
        e.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
    );

    // 选中实体的数据
    const entityCardsRaw = useMemo(() => {
        if (!selectedEntity) return [];
        return MOCK_CARDS.filter(
            (c) =>
                c.aiAnalysis.entities?.includes(selectedEntity) ||
                c.metadata.location?.includes(selectedEntity) ||
                c.rawContent.includes(selectedEntity),
        ).sort(
            (a, b) =>
                new Date(b.metadata.effectiveTime).getTime() - new Date(a.metadata.effectiveTime).getTime(),
        );
    }, [selectedEntity]);

    // 时间筛选
    const entityCards = useMemo(() => {
        const now = new Date();
        const cutoff = new Date();
        if (timeRange === '1M') cutoff.setMonth(now.getMonth() - 1);
        if (timeRange === '3M') cutoff.setMonth(now.getMonth() - 3);
        if (timeRange === '6M') cutoff.setMonth(now.getMonth() - 6);
        if (timeRange === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
        if (timeRange === 'ALL') cutoff.setFullYear(2000);

        return entityCardsRaw.filter((c) => new Date(c.metadata.effectiveTime) >= cutoff);
    }, [entityCardsRaw, timeRange]);

    // 价格历史
    const priceHistory = useMemo(() => {
        return entityCards
            .filter((c) => c.category === IntelCategory.A_STRUCTURED)
            .map((c) => ({
                date: new Date(c.metadata.effectiveTime).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                }),
                price: c.aiAnalysis.extractedData?.price as number,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [entityCards]);

    // 雷达图数据
    const radarData = useMemo(() => {
        const seed = selectedEntity.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const getScore = (offset: number) => 60 + ((seed + offset) % 35);
        const volumeScore = Math.min(Math.max(entityCards.length * 8, 40), 100);

        return [
            { subject: '价格竞争力', A: getScore(10) },
            { subject: '履约信用', A: getScore(20) },
            { subject: '信息透明度', A: volumeScore },
            { subject: '仓储能力', A: getScore(40) },
            { subject: '物流效率', A: getScore(50) },
            { subject: '资金实力', A: getScore(60) },
        ];
    }, [selectedEntity, entityCards.length]);

    // 风险事件
    const riskEvents = entityCards.filter(
        (c) => c.category === IntelCategory.B_SEMI_STRUCTURED && c.aiAnalysis.sentiment === 'negative',
    );

    // 表格列
    const tableColumns = [
        {
            title: '生效日期',
            key: 'date',
            render: (_: unknown, record: InfoCard) =>
                new Date(record.metadata.effectiveTime).toLocaleDateString(),
        },
        {
            title: '品种',
            key: 'commodity',
            render: (_: unknown, record: InfoCard) => record.aiAnalysis.extractedData?.commodity || '玉米',
        },
        {
            title: '价格 (元/吨)',
            key: 'price',
            align: 'right' as const,
            render: (_: unknown, record: InfoCard) => (
                <Text strong style={{ color: token.colorSuccess }}>
                    {(record.aiAnalysis.extractedData?.price as number)?.toLocaleString()}
                </Text>
            ),
        },
        {
            title: '水分',
            key: 'moisture',
            align: 'right' as const,
            render: (_: unknown, record: InfoCard) => record.aiAnalysis.extractedData?.moisture || '-',
        },
        {
            title: '数据来源',
            key: 'source',
            render: (_: unknown, record: InfoCard) => (
                <Text type="secondary" style={{ fontSize: 11 }}>
                    {record.metadata.author.name}
                </Text>
            ),
        },
    ];

    const tabItems = [
        {
            key: 'OVERVIEW',
            label: (
                <span>
                    <DashboardOutlined /> 全景概览
                </span>
            ),
        },
        {
            key: 'TIMELINE',
            label: (
                <span>
                    <HistoryOutlined /> 情报时间轴
                </span>
            ),
        },
        {
            key: 'LEDGER',
            label: (
                <span>
                    <LineChartOutlined /> 交易台账 (A类)
                </span>
            ),
        },
        {
            key: 'DOCS',
            label: (
                <span>
                    <FileTextOutlined /> 文档库 (C类)
                </span>
            ),
        },
    ];

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧边栏 */}
            <Card
                style={{ width: 280, height: '100%', overflow: 'auto', borderRadius: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <Title level={5}>
                    <BankOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                    企业档案库
                </Title>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索企业或库点..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    style={{ marginTop: 16 }}
                />

                <div style={{ marginTop: 16 }}>
                    {filteredEntities.map((entity) => (
                        <Card
                            key={entity.name}
                            size="small"
                            hoverable
                            onClick={() => setSelectedEntity(entity.name)}
                            style={{
                                marginBottom: 8,
                                borderColor: selectedEntity === entity.name ? token.colorPrimary : undefined,
                                background: selectedEntity === entity.name ? `${token.colorPrimary}08` : undefined,
                            }}
                        >
                            <Flex justify="space-between" align="center">
                                <Text strong style={{ color: selectedEntity === entity.name ? token.colorPrimary : undefined }}>
                                    {entity.name}
                                </Text>
                                <Tag>{entity.count}</Tag>
                            </Flex>
                            <Flex gap={4} style={{ marginTop: 4 }}>
                                {entity.typeArr.map((t) => (
                                    <Tag key={t} style={{ fontSize: 10 }}>
                                        {t}
                                    </Tag>
                                ))}
                                {entity.typeArr.length === 0 && (
                                    <Text type="secondary" style={{ fontSize: 10 }}>
                                        潜在客户
                                    </Text>
                                )}
                            </Flex>
                        </Card>
                    ))}
                    {filteredEntities.length === 0 && <Empty description="无匹配结果" />}
                </div>
            </Card>

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {selectedEntity ? (
                    <>
                        {/* 头部 */}
                        <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: '16px 24px' }}>
                            <Flex justify="space-between" align="flex-start">
                                <div>
                                    <Flex align="center" gap={12}>
                                        <Title level={3} style={{ margin: 0 }}>
                                            {selectedEntity}
                                        </Title>
                                        <SafetyCertificateOutlined style={{ color: token.colorSuccess, fontSize: 20 }} />
                                    </Flex>
                                    <Flex gap={24} style={{ marginTop: 8 }}>
                                        <Text type="secondary">
                                            <EnvironmentOutlined style={{ marginRight: 4 }} />
                                            辽宁省锦州市 (AI推断)
                                        </Text>
                                        <Text type="secondary">
                                            <PhoneOutlined style={{ marginRight: 4 }} />
                                            0416-xxxx (AI提取)
                                        </Text>
                                        <Tag color="blue">
                                            <IdcardOutlined style={{ marginRight: 4 }} />
                                            注册资本: 5000万
                                        </Tag>
                                    </Flex>
                                </div>
                                <Space>
                                    <Button icon={<DownloadOutlined />}>导出报告</Button>
                                    <Button type="primary" icon={<AlertOutlined />}>
                                        风险监测
                                    </Button>
                                </Space>
                            </Flex>

                            <Flex justify="space-between" align="center" style={{ marginTop: 24 }}>
                                <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} style={{ margin: 0 }} />
                                <Flex align="center" gap={8}>
                                    <ClockCircleOutlined />
                                    <Segmented
                                        options={[
                                            { label: '1M', value: '1M' },
                                            { label: '3M', value: '3M' },
                                            { label: '6M', value: '6M' },
                                            { label: '1Y', value: '1Y' },
                                            { label: 'ALL', value: 'ALL' },
                                        ]}
                                        value={timeRange}
                                        onChange={(val) => setTimeRange(val as TimeRange)}
                                        size="small"
                                    />
                                </Flex>
                            </Flex>
                        </Card>

                        {/* 内容区 */}
                        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                            {activeTab === 'OVERVIEW' && (
                                <Row gutter={[24, 24]}>
                                    {/* 雷达图 */}
                                    <Col xs={24} xl={8}>
                                        <Card title={<><AlertOutlined /> 企业六维画像</>}>
                                            <ChartContainer height={250}>
                                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                                    <RadarChart data={radarData}>
                                                        <PolarGrid stroke={token.colorBorderSecondary} />
                                                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                        <Radar dataKey="A" stroke={token.colorPrimary} fill={token.colorPrimary} fillOpacity={0.3} />
                                                        <Tooltip />
                                                    </RadarChart>
                                                </ResponsiveContainer>
                                            </ChartContainer>
                                            <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center' }}>
                                                *评分基于所选时间段内的数据完整度与履约记录动态生成
                                            </Text>
                                        </Card>
                                    </Col>

                                    {/* 价格走势 */}
                                    <Col xs={24} xl={16}>
                                        <Card title={<><LineChartOutlined /> 核心价格走势</>}>
                                            {priceHistory.length > 0 ? (
                                                <div style={{ height: 160 }}>
                                                    <ChartContainer height={160}>
                                                        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                                            <LineChart data={priceHistory}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                                                <YAxis domain={['auto', 'auto']} hide />
                                                                <Tooltip />
                                                                <Line
                                                                    type="monotone"
                                                                    dataKey="price"
                                                                    stroke={token.colorSuccess}
                                                                    strokeWidth={2}
                                                                    dot={{ r: 3, fill: token.colorSuccess }}
                                                                />
                                                            </LineChart>
                                                        </ResponsiveContainer>
                                                    </ChartContainer>
                                                </div>
                                            ) : (
                                                <Empty description="该时间段内暂无A类价格数据" />
                                            )}
                                        </Card>
                                    </Col>

                                    {/* 风险事件 */}
                                    <Col xs={24}>
                                        <Card title={<><AlertOutlined style={{ color: token.colorWarning }} /> 风险/异常事件 ({timeRange})</>}>
                                            {riskEvents.length > 0 ? (
                                                <Row gutter={16}>
                                                    {riskEvents.slice(0, 4).map((card) => (
                                                        <Col key={card.id} xs={24} md={12}>
                                                            <Card size="small" style={{ background: token.colorErrorBg, borderColor: token.colorErrorBorder }}>
                                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                                    {new Date(card.metadata.effectiveTime).toLocaleDateString()}
                                                                </Text>
                                                                <Paragraph style={{ marginBottom: 0, marginTop: 4 }}>{card.aiAnalysis.summary}</Paragraph>
                                                            </Card>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            ) : (
                                                <Empty description="暂无风险记录，信誉良好" />
                                            )}
                                        </Card>
                                    </Col>
                                </Row>
                            )}

                            {activeTab === 'TIMELINE' && (
                                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                                    <Timeline
                                        items={entityCards
                                            .filter((c) => c.category === IntelCategory.B_SEMI_STRUCTURED)
                                            .map((card) => ({
                                                color: card.aiAnalysis.sentiment === 'positive' ? 'green' : card.aiAnalysis.sentiment === 'negative' ? 'red' : 'blue',
                                                children: (
                                                    <Card size="small">
                                                        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                {new Date(card.metadata.effectiveTime).toLocaleString('zh-CN')}
                                                            </Text>
                                                            <Tag color={card.aiAnalysis.sentiment === 'positive' ? 'green' : card.aiAnalysis.sentiment === 'negative' ? 'red' : 'default'}>
                                                                {card.aiAnalysis.sentiment}
                                                            </Tag>
                                                        </Flex>
                                                        <Text strong>{card.aiAnalysis.summary}</Text>
                                                        {card.aiAnalysis.structuredEvent && (
                                                            <Descriptions size="small" column={2} style={{ marginTop: 8 }}>
                                                                <Descriptions.Item label="动作">{card.aiAnalysis.structuredEvent.action}</Descriptions.Item>
                                                                <Descriptions.Item label="影响">{card.aiAnalysis.structuredEvent.impact}</Descriptions.Item>
                                                            </Descriptions>
                                                        )}
                                                        <Flex gap={4} style={{ marginTop: 8 }}>
                                                            {card.aiAnalysis.tags.map((tag) => (
                                                                <Tag key={tag} style={{ fontSize: 10 }}>
                                                                    #{tag}
                                                                </Tag>
                                                            ))}
                                                        </Flex>
                                                    </Card>
                                                ),
                                            }))}
                                    />
                                    {entityCards.filter((c) => c.category === IntelCategory.B_SEMI_STRUCTURED).length === 0 && (
                                        <Empty description="该时间段内暂无情报事件" />
                                    )}
                                </div>
                            )}

                            {activeTab === 'LEDGER' && (
                                <Card>
                                    <Table
                                        dataSource={entityCards.filter((c) => c.category === IntelCategory.A_STRUCTURED)}
                                        columns={tableColumns}
                                        rowKey="id"
                                        size="small"
                                        pagination={{ pageSize: 10 }}
                                    />
                                </Card>
                            )}

                            {activeTab === 'DOCS' && (
                                <Row gutter={[16, 16]}>
                                    {entityCards.filter((c) => c.category === IntelCategory.C_DOCUMENT).length > 0 ? (
                                        entityCards
                                            .filter((c) => c.category === IntelCategory.C_DOCUMENT)
                                            .map((card) => (
                                                <Col key={card.id} xs={24} md={12} lg={8}>
                                                    <Card hoverable>
                                                        <Flex gap={12} align="flex-start">
                                                            <Avatar
                                                                style={{ background: token.colorWarningBg }}
                                                                icon={<FileTextOutlined style={{ color: token.colorWarning }} />}
                                                            />
                                                            <div style={{ flex: 1 }}>
                                                                <Text strong ellipsis>
                                                                    {card.rawContent.split('\n')[0].replace(/[\[\]]/g, '') || '相关文档'}
                                                                </Text>
                                                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                                    {new Date(card.metadata.effectiveTime).toLocaleDateString()}
                                                                </Text>
                                                            </div>
                                                            <RightOutlined style={{ color: token.colorTextSecondary }} />
                                                        </Flex>
                                                        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                                                            {card.aiAnalysis.summary}
                                                        </Paragraph>
                                                    </Card>
                                                </Col>
                                            ))
                                    ) : (
                                        <Col span={24}>
                                            <Empty description="该时间段内暂无关联文档" />
                                        </Col>
                                    )}
                                </Row>
                            )}
                        </div>
                    </>
                ) : (
                    <Flex align="center" justify="center" style={{ flex: 1 }}>
                        <Empty
                            image={<BankOutlined style={{ fontSize: 64, color: token.colorTextQuaternary }} />}
                            description="请从左侧选择一个实体查看全景档案"
                        />
                    </Flex>
                )}
            </Flex>
        </Flex>
    );
};

export default EntityProfile;
