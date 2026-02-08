import React, { useMemo, useState } from 'react';
import { Card, Select, Radio, Empty, theme, Spin, Typography, Space } from 'antd';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { RiseOutlined, FallOutlined, LineChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ChartContainer } from '../../../ChartContainer';
import { usePriceTrend } from '../../../../api/hooks';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Text } = Typography;

interface PriceMonitorWidgetProps {
    defaultCommodity?: string;
    defaultLocation?: string;
}

// 品种 fallback（与字典 COMMODITY 保持一致）
const COMMODITY_OPTIONS_FALLBACK = [
    { label: '玉米', value: 'CORN' },
    { label: '小麦', value: 'WHEAT' },
    { label: '大豆', value: 'SOYBEAN' },
    { label: '稻谷', value: 'RICE' },
    { label: '高粱', value: 'SORGHUM' },
    { label: '大麦', value: 'BARLEY' },
];

const LOCATION_OPTIONS_FALLBACK = [
    { label: '锦州港', value: 'JINZHOU_PORT' },
    { label: '鲅鱼圈', value: 'BAYUQUAN_PORT' },
    { label: '深加工', value: 'DEEP_PROCESSING' },
    { label: '全国均价', value: 'NATIONAL' }
];

export const PriceMonitorWidget: React.FC<PriceMonitorWidgetProps> = ({
    defaultCommodity = 'CORN',
    defaultLocation = 'JINZHOU_PORT'
}) => {
    const { token } = theme.useToken();
    const [commodity, setCommodity] = useState(defaultCommodity);
    const [location, setLocation] = useState(defaultLocation);
    const [days, setDays] = useState(30);
    const { data: dictionaries } = useDictionaries(['COMMODITY', 'PRICE_MONITOR_LOCATION']);

    const commodityOptions = useMemo(() => {
        const items = dictionaries?.COMMODITY?.filter((item) => item.isActive) || [];
        if (!items.length) return COMMODITY_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const locationOptions = useMemo(() => {
        const items = dictionaries?.PRICE_MONITOR_LOCATION?.filter((item) => item.isActive) || [];
        if (!items.length) return LOCATION_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const { data, isLoading } = usePriceTrend(commodity, location, days);

    const stats = useMemo(() => {
        if (!data || data.length < 2) return null;
        const current = data[data.length - 1].price;
        const prev = data[data.length - 2].price;
        const change = current - prev;
        const pct = (change / prev) * 100;

        const min = Math.min(...data.map((d: any) => d.price));
        const max = Math.max(...data.map((d: any) => d.price));

        return { current, change, pct, min, max };
    }, [data]);

    return (
        <Card
            title={
                <Space>
                    <LineChartOutlined style={{ color: token.colorPrimary }} />
                    <span>价格监测中心</span>
                </Space>
            }
            extra={
                <Space>
                    <Select
                        value={commodity}
                        onChange={setCommodity}
                        options={commodityOptions}
                        size="small"
                        style={{ width: 80 }}
                        bordered={false}
                    />
                    <Select
                        value={location}
                        onChange={setLocation}
                        options={locationOptions}
                        size="small"
                        style={{ width: 90 }}
                        bordered={false}
                    />
                    <Radio.Group
                        value={days}
                        onChange={e => setDays(e.target.value)}
                        size="small"
                        optionType="button"
                    >
                        <Radio.Button value={7}>7天</Radio.Button>
                        <Radio.Button value={30}>30天</Radio.Button>
                    </Radio.Group>
                </Space>
            }
            bodyStyle={{ padding: '12px 24px' }}
        >
            <div style={{ marginBottom: 16 }}>
                {stats && (
                    <Space size="large">
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>最新价格</Text>
                            <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                                {stats.current}
                                <span style={{ fontSize: 14, fontWeight: 'normal', marginLeft: 4 }}>元/吨</span>
                            </div>
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>日涨跌</Text>
                            <div style={{ color: stats.change >= 0 ? '#f5222d' : '#52c41a', fontSize: 16, display: 'flex', alignItems: 'center' }}>
                                {stats.change >= 0 ? <RiseOutlined /> : <FallOutlined />}
                                <span style={{ marginLeft: 4 }}>{Math.abs(stats.change).toFixed(0)} ({Math.abs(stats.pct).toFixed(2)}%)</span>
                            </div>
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>区间波动</Text>
                            <div style={{ fontSize: 14 }}>
                                {stats.min} - {stats.max}
                            </div>
                        </div>
                    </Space>
                )}
            </div>

            <ChartContainer height={200}>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <Spin />
                    </div>
                ) : !data || data.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无价格数据" />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={token.colorPrimary} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={token.colorPrimary} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={val => dayjs(val).format('MM-DD')}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                mirror={true}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                labelFormatter={val => dayjs(val).format('YYYY-MM-DD')}
                                formatter={(val: any) => [`${val} 元/吨`, '价格']}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke={token.colorPrimary}
                                fillOpacity={1}
                                fill="url(#colorPrice)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </ChartContainer>
        </Card>
    );
};
