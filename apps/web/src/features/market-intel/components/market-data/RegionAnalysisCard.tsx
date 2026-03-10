import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
    Card,
    Typography,
    Flex,
    Row,
    Col,
    Tag,
    Empty,
    theme,
    Input,
    Segmented,
    Tooltip,
} from 'antd';
import {
    ArrowUpOutlined,
    ArrowDownOutlined,
    BarChartOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// =============================================
// 区域分析卡片的数据结构
// =============================================

interface RegionItem {
    region: string;
    avgPrice: number;
    count: number;
    minPrice: number;
    maxPrice: number;
    q1: number;
    median: number;
    q3: number;
    std: number;
    volatility: number;
    missingRate: number;
    latestTs: number;
    hasPrev: boolean;
    delta: number;
    deltaPct: number;
}

interface RegionSummary {
    list: RegionItem[];
    overallAvg: number | null;
    minAvg: number;
    maxAvg: number;
    rangeMin: number;
    rangeMax: number;
    windowLabel: string;
    expectedDays: number;
}

interface RegionAnalysisCardProps {
    regionSummary: RegionSummary;
    showAdvanced: boolean;
    onDrilldownRegion?: (regionName: string, level: 'province' | 'city' | 'district') => void;
}

export const RegionAnalysisCard: React.FC<RegionAnalysisCardProps> = ({
    regionSummary,
    showAdvanced,
    onDrilldownRegion,
}) => {
    const { token } = theme.useToken();
    const [regionSort, setRegionSort] = useState<'avg' | 'count' | 'delta' | 'volatility'>('avg');
    const [regionWindow, setRegionWindow] = useState<'7' | '30' | '90' | 'all'>('30');
    const [regionView, setRegionView] = useState<'all' | 'top' | 'bottom'>('all');
    const [regionKeyword, setRegionKeyword] = useState('');
    const [regionLevel, setRegionLevel] = useState<'province' | 'city' | 'district'>('city');
    const [regionDetail, setRegionDetail] = useState<'compact' | 'detail'>('compact');

    const regionList = useMemo(() => {
        const keyword = regionKeyword.trim();
        const filtered = regionSummary.list.filter((item) => {
            if (!keyword) return true;
            return item.region.includes(keyword);
        });

        if (regionSort === 'count') {
            filtered.sort((a, b) => b.count - a.count);
        } else if (regionSort === 'delta') {
            filtered.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        } else if (regionSort === 'volatility') {
            filtered.sort((a, b) => b.volatility - a.volatility);
        } else {
            filtered.sort((a, b) => b.avgPrice - a.avgPrice);
        }

        if (regionView === 'all') return filtered;
        const topN = 8;
        if (regionView === 'top') {
            return filtered.slice(0, topN);
        }
        return filtered.slice(-topN);
    }, [regionSummary.list, regionSort, regionKeyword, regionView]);

    const clampPct = (value: number) => Math.max(0, Math.min(100, value));

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <BarChartOutlined style={{ color: token.colorPrimary }} />
                    <span>各省/区域均价对比 (参考)</span>
                </Flex>
            }
            bodyStyle={{ padding: '16px 20px' }}
        >
            <div
                style={{
                    background: token.colorFillQuaternary,
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: `1px solid ${token.colorBorderSecondary}`,
                    marginBottom: 16,
                }}
            >
                <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                    <Input
                        allowClear
                        size="small"
                        placeholder="搜索区域"
                        value={regionKeyword}
                        onChange={(e) => setRegionKeyword(e.target.value)}
                        style={{ width: 220 }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {regionSummary.windowLabel}
                        {regionSummary.overallAvg !== null
                            ? ` · 全局均价 ${regionSummary.overallAvg.toFixed(0)} 元/吨`
                            : ''}
                        · 共 {regionSummary.list.length} 个区域
                    </Text>
                </Flex>
                <Flex align="center" gap={10} wrap="wrap" style={{ marginTop: 10 }}>
                    <Segmented
                        size="small"
                        value={regionWindow}
                        onChange={(val) => setRegionWindow(val as '7' | '30' | '90' | 'all')}
                        options={[
                            { label: '近7天', value: '7' },
                            { label: '近30天', value: '30' },
                            { label: '近90天', value: '90' },
                            { label: '全量', value: 'all' },
                        ]}
                    />
                    <Segmented
                        size="small"
                        value={regionLevel}
                        onChange={(val) => setRegionLevel(val as 'province' | 'city' | 'district')}
                        options={[
                            { label: '省', value: 'province' },
                            { label: '市', value: 'city' },
                            { label: '区县', value: 'district' },
                        ]}
                    />
                    <Segmented
                        size="small"
                        value={regionSort}
                        onChange={(val) => setRegionSort(val as 'avg' | 'count' | 'delta' | 'volatility')}
                        options={[
                            { label: '按均价', value: 'avg' },
                            { label: '按样本', value: 'count' },
                            { label: '偏离度', value: 'delta' },
                            { label: '波动率', value: 'volatility' },
                        ]}
                    />
                    {showAdvanced && (
                        <Segmented
                            size="small"
                            value={regionView}
                            onChange={(val) => setRegionView(val as 'all' | 'top' | 'bottom')}
                            options={[
                                { label: '全部', value: 'all' },
                                { label: 'Top', value: 'top' },
                                { label: 'Bottom', value: 'bottom' },
                            ]}
                        />
                    )}
                    {showAdvanced && (
                        <Segmented
                            size="small"
                            value={regionDetail}
                            onChange={(val) => setRegionDetail(val as 'compact' | 'detail')}
                            options={[
                                { label: '简洁', value: 'compact' },
                                { label: '详情', value: 'detail' },
                            ]}
                        />
                    )}
                </Flex>
            </div>
            <Row gutter={[16, 16]}>
                {regionList.map((item, index) => {
                    const deltaColor =
                        Math.abs(item.deltaPct) < 0.3
                            ? token.colorTextSecondary
                            : item.delta >= 0
                                ? token.colorSuccess
                                : token.colorError;
                    const sampleHint =
                        item.count < 5 ? '样本偏少' : item.count < 10 ? '样本较少' : null;
                    const missingHint =
                        item.missingRate > 0.3
                            ? '缺失偏高'
                            : item.missingRate > 0.15
                                ? '缺失较高'
                                : null;
                    const rankTone = index < 3 ? token.colorPrimary : token.colorBorderSecondary;
                    const rangeSpan = regionSummary.rangeMax - regionSummary.rangeMin || 1;
                    const minPct = clampPct(
                        ((item.minPrice - regionSummary.rangeMin) / rangeSpan) * 100,
                    );
                    const maxPct = clampPct(
                        ((item.maxPrice - regionSummary.rangeMin) / rangeSpan) * 100,
                    );
                    const q1Pct = clampPct(((item.q1 - regionSummary.rangeMin) / rangeSpan) * 100);
                    const q3Pct = clampPct(((item.q3 - regionSummary.rangeMin) / rangeSpan) * 100);
                    const medianPct = clampPct(
                        ((item.median - regionSummary.rangeMin) / rangeSpan) * 100,
                    );
                    const cardAccent = index < 3 ? token.colorPrimary : token.colorBorderSecondary;

                    return (
                        <Col
                            key={item.region}
                            xs={24}
                            sm={12}
                            md={8}
                            lg={6}
                            xl={6}
                            style={{ display: 'flex' }}
                        >
                            <div
                                style={{
                                    borderRadius: 14,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    padding: '12px 14px',
                                    background: token.colorBgContainer,
                                    boxShadow:
                                        index < 3 ? `0 8px 24px rgba(22, 119, 255, 0.08)` : 'none',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    cursor: onDrilldownRegion ? 'pointer' : 'default',
                                }}
                                onClick={() => onDrilldownRegion?.(item.region, regionLevel)}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        height: 3,
                                        width: '100%',
                                        background: cardAccent,
                                        opacity: index < 3 ? 1 : 0.5,
                                    }}
                                />
                                <Flex
                                    justify="space-between"
                                    align="center"
                                    style={{ marginBottom: 6 }}
                                >
                                    <Text style={{ fontWeight: 600, fontSize: 13 }} ellipsis>
                                        {item.region}
                                    </Text>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            color: rankTone,
                                            border: `1px solid ${rankTone}`,
                                            borderRadius: 999,
                                            padding: '0 8px',
                                            lineHeight: '18px',
                                        }}
                                    >
                                        #{index + 1}
                                    </span>
                                </Flex>
                                <Flex align="baseline" gap={6} style={{ marginTop: 6 }}>
                                    <Text style={{ fontSize: 20, fontWeight: 600 }}>
                                        {Number(item.avgPrice).toLocaleString()}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        元/吨
                                    </Text>
                                </Flex>
                                <Tooltip
                                    overlayStyle={{ maxWidth: 260 }}
                                    title={
                                        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                                {item.region}
                                            </div>
                                            <div>最小值：{item.minPrice.toFixed(0)}</div>
                                            <div>P25：{item.q1.toFixed(0)}</div>
                                            <div>中位数：{item.median.toFixed(0)}</div>
                                            <div>P75：{item.q3.toFixed(0)}</div>
                                            <div>最大值：{item.maxPrice.toFixed(0)}</div>
                                        </div>
                                    }
                                >
                                    <div style={{ marginTop: 10, cursor: 'help' }}>
                                        <div
                                            style={{
                                                position: 'relative',
                                                height: 8,
                                                borderRadius: 999,
                                                background: token.colorFillSecondary,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: `${minPct}%`,
                                                    width: `${Math.max(2, maxPct - minPct)}%`,
                                                    top: 3,
                                                    height: 2,
                                                    background: token.colorPrimary,
                                                    opacity: 0.8,
                                                }}
                                            />
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: `${q1Pct}%`,
                                                    width: `${Math.max(2, q3Pct - q1Pct)}%`,
                                                    top: 1,
                                                    height: 6,
                                                    borderRadius: 6,
                                                    background: token.colorPrimaryBg,
                                                    border: `1px solid ${token.colorPrimary}`,
                                                }}
                                            />
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: `${medianPct}%`,
                                                    width: 2,
                                                    top: 0,
                                                    height: 8,
                                                    borderRadius: 2,
                                                    background: token.colorPrimary,
                                                }}
                                            />
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            min {Math.round(item.minPrice)} · median{' '}
                                            {Math.round(item.median)} · max {Math.round(item.maxPrice)}
                                        </Text>
                                    </div>
                                </Tooltip>
                                <Flex
                                    justify="space-between"
                                    align="center"
                                    style={{ marginTop: 10 }}
                                >
                                    <Flex gap={6} align="center" wrap="wrap">
                                        <Tag
                                            color="blue"
                                            style={{ margin: 0, borderRadius: 999 }}
                                        >
                                            {item.count} 样本
                                        </Tag>
                                        {sampleHint && (
                                            <Tag
                                                color="orange"
                                                style={{ margin: 0, borderRadius: 999 }}
                                            >
                                                {sampleHint}
                                            </Tag>
                                        )}
                                        {missingHint && (
                                            <Tag
                                                color="orange"
                                                style={{ margin: 0, borderRadius: 999 }}
                                            >
                                                {missingHint}
                                            </Tag>
                                        )}
                                    </Flex>
                                    {item.hasPrev ? (
                                        <Text style={{ fontSize: 11, color: deltaColor }}>
                                            {item.delta >= 0 ? (
                                                <ArrowUpOutlined />
                                            ) : (
                                                <ArrowDownOutlined />
                                            )}
                                            {Math.abs(item.delta).toFixed(0)} (
                                            {Math.abs(item.deltaPct).toFixed(1)}%)
                                        </Text>
                                    ) : (
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            —
                                        </Text>
                                    )}
                                </Flex>
                                {regionDetail === 'detail' && (
                                    <>
                                        <Flex
                                            justify="space-between"
                                            align="center"
                                            style={{ marginTop: 8 }}
                                        >
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                P25 {item.q1.toFixed(0)} / P50 {item.median.toFixed(0)}{' '}
                                                / P75 {item.q3.toFixed(0)}
                                            </Text>
                                        </Flex>
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                columnGap: 10,
                                                rowGap: 6,
                                                marginTop: 6,
                                                fontSize: 11,
                                                color: token.colorTextSecondary,
                                            }}
                                        >
                                            <div>波动率 {(item.volatility * 100).toFixed(1)}%</div>
                                            <div>
                                                区间 {Math.round(item.maxPrice - item.minPrice)}
                                            </div>
                                            <div>
                                                箱体高度 {Math.round(item.q3 - item.q1)}
                                            </div>
                                            <div>
                                                更新 {dayjs(item.latestTs).format('MM-DD')}
                                            </div>
                                            <div>
                                                {regionWindow === 'all'
                                                    ? '对比上期 —'
                                                    : '对比上期'}
                                            </div>
                                            <div>{item.hasPrev ? '有上期' : '无上期'}</div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Col>
                    );
                })}
                {regionSummary.list.length === 0 && (
                    <Col span={24}>
                        <Empty description="暂无区域统计数据" />
                    </Col>
                )}
            </Row>
        </Card>
    );
};
