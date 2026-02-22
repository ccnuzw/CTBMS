import React from 'react';
import { Card, Typography, Row, Col, Empty, Flex, Button, Tag, theme } from 'antd';
import { ThunderboltOutlined, DownloadOutlined, ReloadOutlined, RightOutlined, TagOutlined } from '@ant-design/icons';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Bar } from 'recharts';
import Markdown from 'react-markdown';
import { ChartContainer } from '../ChartContainer';
import { useUniversalSearchViewModel } from './useUniversalSearchViewModel';

const { Title, Text, Paragraph } = Typography;

interface Props {
    viewModel: ReturnType<typeof useUniversalSearchViewModel>;
}

export const UniversalSearchOverview: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: { sentimentTrendData, wordCloudData, aiSummaryResult, isSummarizing, relatedTags },
        actions: { handleAiRefresh, handleExport, setQuery }
    } = viewModel;

    return (
        <>
            <Row gutter={24} style={{ marginBottom: 24 }}>
                <Col span={14}>
                    <Card title="市场情感趋势" bodyStyle={{ padding: '10px 24px' }}>
                        {sentimentTrendData.length > 0 ? (
                            <ChartContainer height={280}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={sentimentTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={11} tickLine={false} axisLine={false} />
                                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                        <Legend />
                                        <Bar dataKey="positive" name="利好" stackId="a" fill={token.colorSuccess} barSize={20} radius={[0, 0, 4, 4]} />
                                        <Bar dataKey="negative" name="利空" stackId="a" fill={token.colorError} barSize={20} radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="neutral" name="中性" stackId="a" fill={token.colorTextQuaternary} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无情感数据" />}
                    </Card>
                </Col>
                <Col span={10}>
                    <Card title="热门关联词" bodyStyle={{ height: 300, padding: 0, overflow: 'hidden' }}>
                        {wordCloudData.length > 0 ? (
                            <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'center', justifyContent: 'center', height: '100%' }}>
                                {wordCloudData.map((item, index) => {
                                    const size = Math.max(12, Math.min(24, 12 + item.value * 2));
                                    const opacity = Math.max(0.4, Math.min(1, item.value / 3));
                                    return (
                                        <Tag key={item.text} color={index % 3 === 0 ? 'blue' : index % 3 === 1 ? 'cyan' : 'geekblue'} style={{ fontSize: size, padding: '4px 8px', margin: 4, opacity, cursor: 'pointer', border: 'none', backgroundColor: `rgba(22, 119, 255, ${opacity * 0.1})` }} onClick={() => setQuery(item.text)}>
                                            {item.text}
                                        </Tag>
                                    );
                                })}
                            </div>
                        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关联词" />}
                    </Card>
                </Col>
            </Row>

            <Card style={{ marginBottom: 24, background: `linear-gradient(135deg, ${token.colorInfoBg} 0%, ${token.colorBgContainer} 100%)`, borderColor: token.colorPrimaryBorder }}>
                <Flex justify="space-between" align="flex-start">
                    <div>
                        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                            <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                            <Text strong style={{ fontSize: 16, color: token.colorPrimary }}>AI 智能综述 (Insight)</Text>
                            <Button type="text" icon={<ThunderboltOutlined />} onClick={handleAiRefresh} loading={isSummarizing} disabled={isSummarizing}>生成综述</Button>
                            <Button type="text" icon={<DownloadOutlined />} onClick={handleExport} style={{ marginLeft: 8 }}>导出 Excel</Button>
                        </Flex>

                        {isSummarizing ? (
                            <div style={{ padding: '20px 0' }}><Paragraph>正在分析全网数据，生成深度综述...</Paragraph></div>
                        ) : !aiSummaryResult ? (
                            <div style={{ padding: '10px 0', color: token.colorTextSecondary }}>点击右侧“生成综述”按钮获取分析报告</div>
                        ) : (
                            <div style={{ backgroundColor: token.colorFillAlter, padding: 16, borderRadius: 8, lineHeight: 1.6 }}>
                                <Markdown components={{
                                    p: ({ node, ...props }) => <p style={{ marginBottom: 10 }} {...props} />,
                                    strong: ({ node, ...props }) => <span style={{ color: token.colorPrimary, fontWeight: 600 }} {...props} />,
                                    ul: ({ node, ...props }) => <ul style={{ paddingLeft: 20, marginBottom: 10 }} {...props} />,
                                    li: ({ node, ...props }) => <li style={{ marginBottom: 4 }} {...props} />,
                                    h1: ({ node, ...props }) => <Title level={4} style={{ marginTop: 16, marginBottom: 12 }} {...props} />,
                                    h2: ({ node, ...props }) => <Title level={5} style={{ marginTop: 14, marginBottom: 10 }} {...props} />
                                }}>
                                    {aiSummaryResult.summary}
                                </Markdown>
                            </div>
                        )}
                    </div>
                    <Button type="text" icon={<ReloadOutlined />} onClick={handleAiRefresh} loading={isSummarizing}>刷新分析 <RightOutlined /></Button>
                </Flex>
            </Card>

            {relatedTags.length > 0 && (
                <Flex align="center" gap={12} style={{ marginBottom: 24, overflowX: 'auto' }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}><TagOutlined style={{ marginRight: 4 }} />相关实体推荐:</Text>
                    {relatedTags.map(([tag, count]) => (
                        <Tag key={tag} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setQuery(tag.replace('#', ''))}>
                            {tag} <span style={{ opacity: 0.5, marginLeft: 4 }}>{count}</span>
                        </Tag>
                    ))}
                </Flex>
            )}
        </>
    );
};
