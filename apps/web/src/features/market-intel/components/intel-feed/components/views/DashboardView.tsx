import React from 'react';
import { Card, Row, Col, Statistic, Typography, Flex, theme, Progress, Tag, Space } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    FallOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    FireOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { IntelFilterState, IntelItem } from '../../types';
import { ChartContainer } from '../../../ChartContainer';

const { Title, Text } = Typography;

interface DashboardViewProps {
    filterState: IntelFilterState;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

// 模拟数据
const TREND_DATA = [
    { date: '01-15', daily: 12, research: 2, policy: 1 },
    { date: '01-16', daily: 18, research: 3, policy: 0 },
    { date: '01-17', daily: 15, research: 1, policy: 2 },
    { date: '01-18', daily: 22, research: 4, policy: 1 },
    { date: '01-19', daily: 19, research: 2, policy: 0 },
    { date: '01-20', daily: 25, research: 5, policy: 3 },
    { date: '01-21', daily: 23, research: 3, policy: 2 },
];

const SOURCE_DISTRIBUTION = [
    { name: '一线采集', value: 65, color: '#1890ff' },
    { name: '官方发布', value: 15, color: '#52c41a' },
    { name: '研究机构', value: 12, color: '#722ed1' },
    { name: '媒体报道', value: 8, color: '#faad14' },
];

const COMMODITY_DATA = [
    { name: '玉米', count: 89, change: 12 },
    { name: '大豆', count: 45, change: -5 },
    { name: '小麦', count: 32, change: 8 },
    { name: '高粱', count: 18, change: 3 },
    { name: '豆粕', count: 12, change: -2 },
];

const REGION_DATA = [
    { region: '辽宁', count: 45 },
    { region: '吉林', count: 38 },
    { region: '黑龙江', count: 52 },
    { region: '山东', count: 28 },
    { region: '河南', count: 22 },
    { region: '河北', count: 18 },
];

export const DashboardView: React.FC<DashboardViewProps> = ({ filterState }) => {
    const { token } = theme.useToken();

    return (
        <div style={{ padding: 16 }}>
            {/* 核心指标 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="今日新增"
                            value={23}
                            prefix={<FileTextOutlined style={{ color: token.colorPrimary }} />}
                            valueStyle={{ color: token.colorPrimary }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="本周情报"
                            value={156}
                            prefix={<FileTextOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="高价值"
                            value={42}
                            prefix={<FireOutlined style={{ color: '#faad14' }} />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="待处理"
                            value={18}
                            prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
                            valueStyle={{ color: '#fa8c16' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="已确认"
                            value={138}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} lg={4}>
                    <Card>
                        <Statistic
                            title="平均质量分"
                            value={82}
                            suffix="/100"
                            prefix={<TrophyOutlined style={{ color: '#722ed1' }} />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 图表区域 */}
            <Row gutter={[16, 16]}>
                {/* 情报趋势 */}
                <Col xs={24} lg={14}>
                    <Card title="情报趋势 (近7天)" bordered={false}>
                        <ChartContainer height={280}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={TREND_DATA}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Area type="monotone" dataKey="daily" name="日报" stackId="1" stroke="#1890ff" fill="#1890ff" fillOpacity={0.6} />
                                    <Area type="monotone" dataKey="research" name="研报" stackId="1" stroke="#52c41a" fill="#52c41a" fillOpacity={0.6} />
                                    <Area type="monotone" dataKey="policy" name="政策" stackId="1" stroke="#722ed1" fill="#722ed1" fillOpacity={0.6} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>

                {/* 来源分布 */}
                <Col xs={24} lg={10}>
                    <Card title="信源分布" bordered={false}>
                        <ChartContainer height={280}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={SOURCE_DISTRIBUTION}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    >
                                        {SOURCE_DISTRIBUTION.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>

                {/* 品种热度 */}
                <Col xs={24} lg={12}>
                    <Card title="品种热度" bordered={false}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {COMMODITY_DATA.map(item => (
                                <Flex key={item.name} align="center" gap={12}>
                                    <Text style={{ width: 50 }}>{item.name}</Text>
                                    <Progress
                                        percent={(item.count / 100) * 100}
                                        showInfo={false}
                                        strokeColor={token.colorPrimary}
                                        style={{ flex: 1 }}
                                    />
                                    <Text style={{ width: 40 }}>{item.count}</Text>
                                    <Tag
                                        color={item.change > 0 ? 'green' : 'red'}
                                        icon={item.change > 0 ? <RiseOutlined /> : <FallOutlined />}
                                    >
                                        {item.change > 0 ? '+' : ''}{item.change}
                                    </Tag>
                                </Flex>
                            ))}
                        </Space>
                    </Card>
                </Col>

                {/* 区域分布 */}
                <Col xs={24} lg={12}>
                    <Card title="区域分布" bordered={false}>
                        <ChartContainer height={200}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={REGION_DATA} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="region" type="category" width={60} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill={token.colorPrimary} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
