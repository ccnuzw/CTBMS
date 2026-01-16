import React, { useState, useMemo, useEffect } from 'react';
import {
    Card,
    Typography,
    Button,
    Space,
    Input,
    Checkbox,
    Table,
    Tag,
    theme,
    Flex,
    Segmented,
    Empty,
    Badge,
    Spin,
    Alert,
} from 'antd';
import {
    FilterOutlined,
    DownloadOutlined,
    SearchOutlined,
    LineChartOutlined,
    TableOutlined,
    ClockCircleOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
} from 'recharts';
import { usePriceData, usePriceTrend } from '../api/hooks';
import { LINE_COLORS } from '../types';
import type { PriceDataResponse } from '@packages/types';
import { ChartContainer } from './ChartContainer';

const { Title, Text } = Typography;

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'ALL';

export const MarketData: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [selectedCommodity, setSelectedCommodity] = useState<string>('玉米');
    const [timeRange, setTimeRange] = useState<TimeRange>('3M');
    const [locationFilter, setLocationFilter] = useState('');
    const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());

    // 计算日期范围
    const dateRange = useMemo(() => {
        const now = new Date();
        const startDate = new Date();

        switch (timeRange) {
            case '1M':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case 'YTD':
                startDate.setMonth(0);
                startDate.setDate(1);
                break;
            case 'ALL':
                startDate.setFullYear(2000);
                break;
        }

        return { startDate, endDate: now };
    }, [timeRange]);

    // API 调用 - 获取价格数据列表
    const {
        data: priceDataResult,
        isLoading: isLoadingData,
        error: dataError,
        refetch,
    } = usePriceData({
        commodity: selectedCommodity,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        pageSize: 100,
    });

    const priceDataList = priceDataResult?.data || [];

    // 动态可用地点
    const availableLocations = useMemo(() => {
        const counts: Record<string, number> = {};

        priceDataList.forEach((item) => {
            const loc = item.location;
            counts[loc] = (counts[loc] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [priceDataList]);

    // 初始化选择前 3 个地点
    useEffect(() => {
        if (availableLocations.length > 0 && selectedLocations.size === 0) {
            setSelectedLocations(new Set(availableLocations.slice(0, 3).map((l) => l.name)));
        }
    }, [availableLocations, selectedLocations.size]);

    // 获取第一个选中地点的趋势数据 (用于K线图)
    const firstSelectedLocation = Array.from(selectedLocations)[0] || '';
    const { data: trendData } = usePriceTrend(
        selectedCommodity,
        firstSelectedLocation,
        timeRange === '1M' ? 30 : timeRange === '3M' ? 90 : timeRange === '6M' ? 180 : 365,
    );

    // 表格数据 - 筛选选中的地点
    const tableData = useMemo(() => {
        return priceDataList.filter((item) => selectedLocations.has(item.location));
    }, [priceDataList, selectedLocations]);

    // 图表数据
    const chartData = useMemo(() => {
        if (selectedLocations.size === 0) return [];

        // 按日期分组
        const dateMap = new Map<string, Record<string, number | string>>();
        const relevantData = priceDataList
            .filter((item) => selectedLocations.has(item.location))
            .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());

        relevantData.forEach((item) => {
            const d = new Date(item.effectiveDate);
            const dateKey = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;

            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, { name: dateKey });
            }
            const entry = dateMap.get(dateKey)!;
            entry[item.location] = item.price;
        });

        return Array.from(dateMap.values());
    }, [priceDataList, selectedLocations]);

    // 导出 CSV
    const handleExport = () => {
        const headers = '日期,地点,品种,价格(元/吨),水分(%)\n';
        const csvContent = tableData
            .map(
                (item) =>
                    `${new Date(item.effectiveDate).toLocaleDateString()},${item.location},${item.commodity},${item.price},${item.moisture || ''}`,
            )
            .join('\n');
        const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${selectedCommodity}_行情_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const toggleLocation = (loc: string) => {
        const newSet = new Set(selectedLocations);
        if (newSet.has(loc)) {
            newSet.delete(loc);
        } else {
            newSet.add(loc);
        }
        setSelectedLocations(newSet);
    };

    // 表格列
    const columns = [
        {
            title: '日期',
            dataIndex: 'effectiveDate',
            key: 'date',
            render: (date: string) => new Date(date).toLocaleDateString(),
        },
        {
            title: '地点',
            dataIndex: 'location',
            key: 'location',
            render: (location: string) => {
                const locArr = Array.from(selectedLocations);
                const idx = locArr.indexOf(location);
                return (
                    <Flex align="center" gap={8}>
                        <div
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: LINE_COLORS[idx % LINE_COLORS.length],
                            }}
                        />
                        {location}
                    </Flex>
                );
            },
        },
        {
            title: '价格 (元/吨)',
            dataIndex: 'price',
            key: 'price',
            align: 'right' as const,
            render: (price: number) => (
                <Text strong style={{ fontFamily: 'monospace' }}>
                    {price?.toLocaleString()}
                </Text>
            ),
        },
        {
            title: '水分',
            dataIndex: 'moisture',
            key: 'moisture',
            align: 'right' as const,
            render: (moisture: number | null) => (moisture ? `${moisture}%` : '-'),
        },
        {
            title: '日涨跌',
            dataIndex: 'dayChange',
            key: 'dayChange',
            align: 'right' as const,
            render: (change: number | null) => {
                if (change === null) return '-';
                const color = change > 0 ? token.colorError : change < 0 ? token.colorSuccess : token.colorTextSecondary;
                return (
                    <Text style={{ color, fontFamily: 'monospace' }}>
                        {change > 0 ? '+' : ''}{change}
                    </Text>
                );
            },
        },
    ];

    // 错误处理
    if (dataError) {
        return (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
                <Alert
                    type="error"
                    message="加载失败"
                    description="无法获取价格数据，请检查后端服务是否正常运行"
                    action={<Button onClick={() => refetch()}>重试</Button>}
                />
            </Flex>
        );
    }

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧边栏 */}
            <Card
                style={{ width: 260, height: '100%', overflow: 'auto', borderRadius: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <Title level={5}>
                    <FilterOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                    维度切片 (Dimension)
                </Title>

                {/* 品种切换 */}
                <Segmented
                    block
                    options={['玉米', '大豆', '水稻']}
                    value={selectedCommodity}
                    onChange={(val) => {
                        setSelectedCommodity(String(val));
                        setSelectedLocations(new Set());
                    }}
                    style={{ marginBottom: 16 }}
                />

                {/* 地点搜索 */}
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索县市/库点..."
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    style={{ marginBottom: 16 }}
                    size="small"
                />

                {/* 地点列表 */}
                <div>
                    <Flex justify="space-between" style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                            可选地点 ({availableLocations.length})
                        </Text>
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            样本数
                        </Text>
                    </Flex>

                    {isLoadingData ? (
                        <Flex justify="center" style={{ padding: 32 }}>
                            <Spin />
                            <div style={{ marginTop: 8 }}>加载中...</div>
                        </Flex>
                    ) : availableLocations.length > 0 ? (
                        availableLocations
                            .filter((loc) => loc.name.includes(locationFilter))
                            .map((loc) => (
                                <Flex
                                    key={loc.name}
                                    justify="space-between"
                                    align="center"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: token.borderRadius,
                                        marginBottom: 4,
                                        cursor: 'pointer',
                                        background: selectedLocations.has(loc.name)
                                            ? `${token.colorPrimary}10`
                                            : undefined,
                                    }}
                                    onClick={() => toggleLocation(loc.name)}
                                >
                                    <Flex align="center" gap={8}>
                                        <Checkbox checked={selectedLocations.has(loc.name)} />
                                        <Text
                                            style={{
                                                color: selectedLocations.has(loc.name) ? token.colorPrimary : undefined,
                                            }}
                                        >
                                            {loc.name}
                                        </Text>
                                    </Flex>
                                    <Badge
                                        count={loc.count}
                                        style={{
                                            background: selectedLocations.has(loc.name)
                                                ? token.colorPrimary
                                                : token.colorBgTextHover,
                                            color: selectedLocations.has(loc.name) ? '#fff' : token.colorTextSecondary,
                                        }}
                                    />
                                </Flex>
                            ))
                    ) : (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="当前时间段内无该品种报价数据"
                        />
                    )}
                </div>

                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 16, textAlign: 'center' }}>
                    已对比 {selectedLocations.size} 个节点
                </Text>
            </Card>

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 顶部工具栏 */}
                <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: '16px 24px' }}>
                    <Flex justify="space-between" align="center">
                        <Title level={4} style={{ margin: 0 }}>
                            <LineChartOutlined style={{ marginRight: 8 }} />
                            价格走势复盘
                        </Title>

                        <Space>
                            {/* 时间切片器 */}
                            <Flex align="center" gap={8}>
                                <ClockCircleOutlined />
                                <Segmented
                                    options={[
                                        { label: '近1月', value: '1M' },
                                        { label: '近3月', value: '3M' },
                                        { label: '近半年', value: '6M' },
                                        { label: '今年', value: 'YTD' },
                                        { label: '全部', value: 'ALL' },
                                    ]}
                                    value={timeRange}
                                    onChange={(val) => setTimeRange(val as TimeRange)}
                                    size="small"
                                />
                            </Flex>

                            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoadingData}>
                                刷新
                            </Button>
                            <Button icon={<DownloadOutlined />} onClick={handleExport}>
                                导出
                            </Button>
                        </Space>
                    </Flex>
                </Card>

                {/* 图表和表格 */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {/* K线图 */}
                    <Card
                        title="趋势曲线 (Trend)"
                        extra={
                            chartData.length > 0 ? (
                                <Text type="secondary">
                                    展示区间: {chartData[0]?.name} ~ {chartData[chartData.length - 1]?.name}
                                </Text>
                            ) : null
                        }
                        style={{ marginBottom: 24 }}
                    >
                        {selectedLocations.size > 0 ? (
                            chartData.length > 0 ? (
                                <div style={{ height: 320 }}>
                                    <ChartContainer height={320}>
                                        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                                            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="name"
                                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                                    axisLine={{ stroke: '#e2e8f0' }}
                                                    tickLine={false}
                                                    dy={10}
                                                    minTickGap={30}
                                                />
                                                <YAxis
                                                    domain={['auto', 'auto']}
                                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={40}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />

                                                {Array.from(selectedLocations).map((loc, index) => (
                                                    <Line
                                                        key={loc}
                                                        type="monotone"
                                                        dataKey={loc}
                                                        stroke={LINE_COLORS[index % LINE_COLORS.length]}
                                                        strokeWidth={2}
                                                        dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                                                        activeDot={{ r: 6 }}
                                                        connectNulls
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </ChartContainer>
                                </div>
                            ) : (
                                <Empty description="所选时间段内暂无数据" />
                            )
                        ) : (
                            <Empty
                                image={<FilterOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />}
                                description="请在左侧勾选至少一个地点进行查看"
                            />
                        )}
                    </Card>

                    {/* 明细表格 */}
                    <Card
                        title={
                            <Flex align="center" gap={8}>
                                <TableOutlined />
                                原始报价明细 (Data Ledger)
                            </Flex>
                        }
                        extra={<Text type="secondary">共 {tableData.length} 条记录</Text>}
                    >
                        <Table
                            dataSource={tableData}
                            columns={columns}
                            rowKey="id"
                            size="small"
                            loading={isLoadingData}
                            pagination={{ pageSize: 10 }}
                            scroll={{ x: 600 }}
                        />
                    </Card>
                </div>
            </Flex>
        </Flex>
    );
};

export default MarketData;
