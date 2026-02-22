import React from 'react';
import { Row, Col, Card, Flex, Typography, Tag, Button, Empty, theme } from 'antd';
import { LineChartOutlined, FullscreenOutlined, FullscreenExitOutlined, FileTextOutlined, CalendarOutlined, BulbOutlined, AlertOutlined } from '@ant-design/icons';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Line } from 'recharts';
import { ChartContainer } from '../ChartContainer';
import { useUniversalSearchViewModel } from './useUniversalSearchViewModel';
import { highlightKeywords, stripHtml } from './utils';

const { Text } = Typography;

interface Props {
    viewModel: ReturnType<typeof useUniversalSearchViewModel>;
}

export const UniversalSearchColumns: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: {
            expandedSection, prices, docs, intels, chartData, uniqueLocations, groupedChartData,
            sortedDocs, sortedIntels, debouncedQuery, sourceTypeLabels
        },
        actions: { toggleExpand, setSelectedItem }
    } = viewModel;

    return (
        <Row gutter={24}>
            {/* 数据趋势 */}
            {(expandedSection === null || expandedSection === 'price') && (
                <Col xs={24} lg={expandedSection === 'price' ? 24 : 8}>
                    <Card
                        title={<Flex align="center" gap={8}><LineChartOutlined style={{ color: token.colorPrimary }} /><Text strong>数据趋势 (Data)</Text><Tag color="blue">{prices.length}</Tag></Flex>}
                        extra={<Button type="text" icon={expandedSection === 'price' ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => toggleExpand('price')} />}
                        style={{ height: '100%' }}
                    >
                        {prices.length > 0 ? (
                            <>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>价格走势概览</Text>
                                <div style={{ height: expandedSection === 'price' ? 500 : 280, marginBottom: 16, transition: 'height 0.3s' }}>
                                    <ChartContainer height={expandedSection === 'price' ? 500 : 280}>
                                        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                            <LineChart data={uniqueLocations.length > 1 ? groupedChartData : chartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={token.colorBorderSecondary} />
                                                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                                <YAxis domain={['auto', 'auto']} hide />
                                                <RechartsTooltip />
                                                {uniqueLocations.length > 1 ? (
                                                    <>
                                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                                        {uniqueLocations.map((loc, idx) => (
                                                            <Line key={loc} type="monotone" dataKey={loc} name={loc} stroke={[token.colorPrimary, token.colorSuccess, token.colorWarning, token.colorError, (token as any).purple || token.colorPrimary][idx % 5]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                                        ))}
                                                    </>
                                                ) : <Line type="monotone" dataKey="price" stroke={token.colorPrimary} strokeWidth={2} dot={{ r: 3, fill: token.colorPrimary }} />}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </ChartContainer>
                                </div>
                                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                                    {prices.map((p) => (
                                        <Flex key={p.id} justify="space-between" align="center" style={{ padding: 12, background: token.colorBgTextHover, borderRadius: token.borderRadius, marginBottom: 8, cursor: 'pointer' }}>
                                            <div>
                                                <Text strong>{p.location}</Text>
                                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{new Date(p.effectiveDate).toLocaleDateString()}</Text>
                                            </div>
                                            <Text strong>{p.price.toLocaleString()}<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>元 ({p.commodity})</Text></Text>
                                        </Flex>
                                    ))}
                                </div>
                            </>
                        ) : <Empty description="未找到相关结构化数据" />}
                    </Card>
                </Col>
            )}

            {/* 相关文档 */}
            {(expandedSection === null || expandedSection === 'doc') && (
                <Col xs={24} lg={expandedSection === 'doc' ? 24 : 8}>
                    <Card
                        title={<Flex align="center" gap={8}><FileTextOutlined style={{ color: token.colorWarning }} /><Text strong>相关文档 (Docs)</Text><Tag color="orange">{docs.length}</Tag></Flex>}
                        extra={<Button type="text" icon={expandedSection === 'doc' ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => toggleExpand('doc')} />}
                        style={{ height: '100%' }}
                    >
                        {sortedDocs.length > 0 ? (
                            <div style={{ maxHeight: expandedSection === 'doc' ? 800 : 400, overflow: 'auto', transition: 'max-height 0.3s' }}>
                                {sortedDocs.map((c: any) => (
                                    <Card key={c.id} size="small" hoverable style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => setSelectedItem(c)}>
                                        <Flex gap={8} align="flex-start">
                                            <FileTextOutlined style={{ color: token.colorWarning, marginTop: 4 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong ellipsis style={{ display: 'block' }}>{highlightKeywords(stripHtml(c.rawContent || '').substring(0, 50), debouncedQuery, token.colorWarningBg)}...</Text>
                                                {c.aiAnalysis?.summary && (
                                                    <Card size="small" style={{ background: `${token.colorWarning}08`, marginTop: 8, marginBottom: 8 }} bodyStyle={{ padding: 8 }}>
                                                        <Flex gap={4}>
                                                            <BulbOutlined style={{ color: token.colorWarning, fontSize: 12 }} />
                                                            <Text type="secondary" style={{ fontSize: 12 }}>{highlightKeywords(stripHtml(c.aiAnalysis.summary).substring(0, 80), debouncedQuery, token.colorWarningBg)}...</Text>
                                                        </Flex>
                                                    </Card>
                                                )}
                                                <Flex justify="space-between" align="center">
                                                    <Text type="secondary" style={{ fontSize: 11 }}><CalendarOutlined style={{ marginRight: 4 }} />{new Date(c.effectiveTime).toLocaleDateString()}</Text>
                                                    <Tag style={{ fontSize: 10 }}>{sourceTypeLabels[c.sourceType as keyof typeof sourceTypeLabels] || c.sourceType}</Tag>
                                                </Flex>
                                            </div>
                                        </Flex>
                                    </Card>
                                ))}
                            </div>
                        ) : <Empty description="未找到相关文档" />}
                    </Card>
                </Col>
            )}

            {/* 市场情报 */}
            {(expandedSection === null || expandedSection === 'intel') && (
                <Col xs={24} lg={expandedSection === 'intel' ? 24 : 8}>
                    <Card
                        title={<Flex align="center" gap={8}><AlertOutlined style={{ color: (token as any).purple || token.colorPrimary }} /><Text strong>市场情报 (Intel)</Text><Tag color="purple">{intels.length}</Tag></Flex>}
                        extra={<Button type="text" icon={expandedSection === 'intel' ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => toggleExpand('intel')} />}
                        style={{ height: '100%' }}
                    >
                        {intels.length > 0 ? (
                            <div style={{ maxHeight: 800, overflow: 'auto', borderLeft: `2px solid ${token.colorBorderSecondary}`, paddingLeft: 16, marginLeft: 8 }}>
                                {sortedIntels.map((c: any) => (
                                    <div key={c.id} style={{ position: 'relative', marginBottom: 16 }}>
                                        <div style={{ position: 'absolute', left: -22, top: 8, width: 10, height: 10, borderRadius: '50%', background: token.colorBgContainer, border: `2px solid ${c.aiAnalysis?.sentiment === 'positive' ? token.colorSuccess : c.aiAnalysis?.sentiment === 'negative' ? token.colorError : ((token as any).purple || token.colorPrimary)}` }} />
                                        <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => setSelectedItem(c)}>
                                            <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                                <Text type="secondary" style={{ fontSize: 11 }}>{new Date(c.effectiveTime).toLocaleDateString()}</Text>
                                                {c.isFlagged && <AlertOutlined style={{ color: token.colorError, fontSize: 12 }} />}
                                            </Flex>
                                            <Text strong style={{ display: 'block', marginBottom: 8 }}>{highlightKeywords((c.aiAnalysis?.summary || c.rawContent).substring(0, 80), debouncedQuery, token.colorWarningBg)}...</Text>
                                            <Flex gap={4} wrap="wrap">{(c.aiAnalysis?.tags || []).slice(0, 3).map((t: string) => <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>)}</Flex>
                                        </Card>
                                    </div>
                                ))}
                            </div>
                        ) : <Empty description="未找到相关情报" />}
                    </Card>
                </Col>
            )}
        </Row>
    );
};
