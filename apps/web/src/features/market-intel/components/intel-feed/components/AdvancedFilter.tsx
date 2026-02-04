import React, { useState } from 'react';
import {
    Card,
    Typography,
    Space,
    Checkbox,
    Select,
    Slider,
    Segmented,
    DatePicker,
    Button,
    Divider,
    Collapse,
    Tag,
    Flex,
    theme,
    Tooltip,
    Badge,
} from 'antd';
import {
    CloseOutlined,
    SaveOutlined,
    ClearOutlined,
    StarOutlined,
    ClockCircleOutlined,
    FileTextOutlined,
    TeamOutlined,
    ShoppingOutlined,
    GlobalOutlined,
    AimOutlined,
    ThunderboltOutlined,
    BulbOutlined,
    CheckCircleOutlined,
    TrophyOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { IntelFilterState, DEFAULT_FILTER_STATE, BUILT_IN_PRESETS, FilterPreset } from '../types';
import { IntelSourceType } from '../../../types';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface AdvancedFilterProps {
    filterState: IntelFilterState;
    onChange: (filter: Partial<IntelFilterState>) => void;
    onClose: () => void;
}

// 常量定义
const SOURCE_TYPE_OPTIONS = [
    { label: '市场信息', value: IntelSourceType.FIRST_LINE },
    { label: '官方发布', value: IntelSourceType.OFFICIAL },
    { label: '研究机构', value: IntelSourceType.RESEARCH_INST },
    { label: '媒体报道', value: IntelSourceType.MEDIA },
];

const COMMODITY_OPTIONS_FALLBACK = ['CORN', 'SOYBEAN', 'WHEAT', 'SORGHUM', 'SOYMEAL', 'RICE', 'RAPESEED'];

const TIME_RANGE_OPTIONS_FALLBACK = [
    { label: '日', value: '1D' },
    { label: '周', value: '7D' },
    { label: '月', value: '30D' },
    { label: '季', value: '90D' },
    { label: '年', value: 'YTD' },
    { label: <CalendarOutlined />, value: 'CUSTOM' },
];

const STATUS_OPTIONS_FALLBACK = [
    { label: '待处理', value: 'pending', color: 'orange' },
    { label: '已确认', value: 'confirmed', color: 'green' },
    { label: '已标记', value: 'flagged', color: 'red' },
    { label: '已归档', value: 'archived', color: 'default' },
];

const QUALITY_OPTIONS_FALLBACK = [
    { label: '高质量', value: 'HIGH', color: 'gold' },
    { label: '中等', value: 'MEDIUM', color: 'blue' },
    { label: '低质量', value: 'LOW', color: 'default' },
];

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({
    filterState,
    onChange,
    onClose,
}) => {
    const { token } = theme.useToken();
    const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const { data: dictionaries } = useDictionaries(['COMMODITY', 'INTEL_FEED_STATUS', 'QUALITY_LEVEL', 'TIME_RANGE']);

    const commodityOptions = React.useMemo(() => {
        const items = dictionaries?.COMMODITY?.filter((item) => item.isActive) || [];
        if (!items.length) return COMMODITY_OPTIONS_FALLBACK.map(c => ({ label: c, value: c }));
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const statusOptions = React.useMemo(() => {
        const items = dictionaries?.INTEL_FEED_STATUS?.filter((item) => item.isActive) || [];
        if (!items.length) return STATUS_OPTIONS_FALLBACK;
        return items.map((item) => ({
            label: item.label,
            value: item.code,
            color: (item.meta as { color?: string } | null)?.color || 'default',
        }));
    }, [dictionaries]);

    const qualityOptions = React.useMemo(() => {
        const items = dictionaries?.QUALITY_LEVEL?.filter((item) => item.isActive) || [];
        if (!items.length) return QUALITY_OPTIONS_FALLBACK;
        return items.map((item) => ({
            label: item.label,
            value: item.code,
            color: (item.meta as { color?: string } | null)?.color || 'default',
        }));
    }, [dictionaries]);

    const timeRangeOptions = React.useMemo(() => {
        const items = dictionaries?.TIME_RANGE?.filter((item) => item.isActive) || [];
        if (!items.length) return TIME_RANGE_OPTIONS_FALLBACK;
        return items.map((item) => ({
            label: item.code === 'CUSTOM' ? <CalendarOutlined /> : item.label,
            value: item.code,
        }));
    }, [dictionaries]);

    // 重置筛选
    const handleReset = () => {
        onChange(DEFAULT_FILTER_STATE);
        setCustomDateRange(null);
    };

    // 应用预设
    const handleApplyPreset = (preset: FilterPreset) => {
        onChange({ ...DEFAULT_FILTER_STATE, ...preset.filter });
    };

    // 计算激活筛选数
    const getActiveCount = () => {
        let count = 0;
        if (filterState.contentTypes.length > 0) count++;
        if (filterState.sourceTypes.length > 0) count++;
        if (filterState.commodities.length > 0) count++;
        if (filterState.regions.length > 0) count++;
        if (filterState.collectionPointIds.length > 0) count++;
        if (filterState.eventTypeIds.length > 0) count++;
        if (filterState.status.length > 0) count++;
        if (filterState.qualityLevel.length > 0) count++;
        if (filterState.confidenceRange[0] > 0 || filterState.confidenceRange[1] < 100) count++;
        return count;
    };

    const collapseItems = [
        {
            key: 'presets',
            label: (
                <Flex align="center" gap={6}>
                    <StarOutlined />
                    <span>快捷筛选</span>
                </Flex>
            ),
            children: (
                <Space wrap size={[8, 8]}>
                    {BUILT_IN_PRESETS.map(preset => (
                        <Tag
                            key={preset.id}
                            style={{ cursor: 'pointer', padding: '4px 12px' }}
                            onClick={() => handleApplyPreset(preset)}
                        >
                            {preset.name}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            key: 'time',
            label: (
                <Flex align="center" gap={6}>
                    <ClockCircleOutlined />
                    <span>时间范围</span>
                </Flex>
            ),
            children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Segmented
                        block
                        size="small"
                        options={timeRangeOptions}
                        value={filterState.timeRange}
                        onChange={(val) => onChange({ timeRange: val as any })}
                    />
                    {filterState.timeRange === 'CUSTOM' && (
                        <RangePicker
                            size="small"
                            style={{ width: '100%' }}
                            value={customDateRange}
                            onChange={(dates) => {
                                setCustomDateRange(dates as any);
                                if (dates) {
                                    onChange({
                                        customDateRange: [dates[0]!.toDate(), dates[1]!.toDate()],
                                    });
                                }
                            }}
                        />
                    )}
                </Space>
            ),
        },
        {
            key: 'sourceType',
            label: (
                <Flex align="center" gap={6}>
                    <TeamOutlined />
                    <span>信源类型</span>
                    {filterState.sourceTypes.length > 0 && (
                        <Badge count={filterState.sourceTypes.length} size="small" />
                    )}
                </Flex>
            ),
            children: (
                <Checkbox.Group
                    value={filterState.sourceTypes}
                    onChange={(vals) => onChange({ sourceTypes: vals as IntelSourceType[] })}
                    style={{ width: '100%' }}
                >
                    <Space direction="vertical">
                        {SOURCE_TYPE_OPTIONS.map(opt => (
                            <Checkbox key={opt.value} value={opt.value}>
                                {opt.label}
                            </Checkbox>
                        ))}
                    </Space>
                </Checkbox.Group>
            ),
        },
        {
            key: 'commodity',
            label: (
                <Flex align="center" gap={6}>
                    <ShoppingOutlined />
                    <span>品种</span>
                    {filterState.commodities.length > 0 && (
                        <Badge count={filterState.commodities.length} size="small" />
                    )}
                </Flex>
            ),
            children: (
                <Select
                    mode="multiple"
                    allowClear
                    placeholder="选择品种"
                    style={{ width: '100%' }}
                    size="small"
                    value={filterState.commodities}
                    onChange={(vals) => onChange({ commodities: vals })}
                    options={commodityOptions}
                />
            ),
        },
        {
            key: 'region',
            label: (
                <Flex align="center" gap={6}>
                    <GlobalOutlined />
                    <span>区域</span>
                    {filterState.regions.length > 0 && (
                        <Badge count={filterState.regions.length} size="small" />
                    )}
                </Flex>
            ),
            children: (
                <Select
                    mode="multiple"
                    allowClear
                    placeholder="选择区域"
                    style={{ width: '100%' }}
                    size="small"
                    value={filterState.regions}
                    onChange={(vals) => onChange({ regions: vals })}
                    options={[
                        { label: '辽宁省', value: '辽宁省' },
                        { label: '吉林省', value: '吉林省' },
                        { label: '黑龙江省', value: '黑龙江省' },
                        { label: '山东省', value: '山东省' },
                        { label: '河南省', value: '河南省' },
                        { label: '河北省', value: '河北省' },
                    ]}
                />
            ),
        },
        {
            key: 'confidence',
            label: (
                <Flex align="center" gap={6}>
                    <AimOutlined />
                    <span>AI可信度</span>
                </Flex>
            ),
            children: (
                <div style={{ padding: '0 8px' }}>
                    <Slider
                        range
                        min={0}
                        max={100}
                        value={filterState.confidenceRange}
                        onChange={(val) => onChange({ confidenceRange: val as [number, number] })}
                        marks={{ 0: '0%', 50: '50%', 100: '100%' }}
                    />
                </div>
            ),
        },
        {
            key: 'status',
            label: (
                <Flex align="center" gap={6}>
                    <CheckCircleOutlined />
                    <span>处理状态</span>
                    {filterState.status.length > 0 && (
                        <Badge count={filterState.status.length} size="small" />
                    )}
                </Flex>
            ),
            children: (
                <Space wrap>
                    {statusOptions.map(opt => (
                        <Tag.CheckableTag
                            key={opt.value}
                            checked={filterState.status.includes(opt.value as any)}
                            onChange={(checked) => {
                                const newStatus = checked
                                    ? [...filterState.status, opt.value]
                                    : filterState.status.filter(s => s !== opt.value);
                                onChange({ status: newStatus as any });
                            }}
                            style={{ padding: '4px 12px' }}
                        >
                            {opt.label}
                        </Tag.CheckableTag>
                    ))}
                </Space>
            ),
        },
        {
            key: 'quality',
            label: (
                <Flex align="center" gap={6}>
                    <TrophyOutlined />
                    <span>质量评级</span>
                    {filterState.qualityLevel.length > 0 && (
                        <Badge count={filterState.qualityLevel.length} size="small" />
                    )}
                </Flex>
            ),
            children: (
                <Space wrap>
                    {qualityOptions.map(opt => (
                        <Tag.CheckableTag
                            key={opt.value}
                            checked={filterState.qualityLevel.includes(opt.value as any)}
                            onChange={(checked) => {
                                const newQuality = checked
                                    ? [...filterState.qualityLevel, opt.value]
                                    : filterState.qualityLevel.filter(q => q !== opt.value);
                                onChange({ qualityLevel: newQuality as any });
                            }}
                            style={{ padding: '4px 12px' }}
                        >
                            {opt.label}
                        </Tag.CheckableTag>
                    ))}
                </Space>
            ),
        },
    ];

    return (
        <Card
            style={{
                width: 280,
                height: '100%',
                overflow: 'auto',
                borderRadius: 0,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
            }}
            bodyStyle={{ padding: 0 }}
        >
            {/* 头部 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    position: 'sticky',
                    top: 0,
                    background: token.colorBgContainer,
                    zIndex: 10,
                }}
            >
                <Flex align="center" gap={8}>
                    <Title level={5} style={{ margin: 0 }}>高级筛选</Title>
                    {getActiveCount() > 0 && (
                        <Badge count={getActiveCount()} size="small" style={{ backgroundColor: token.colorPrimary }} />
                    )}
                </Flex>
                <Space>
                    <Tooltip title="重置">
                        <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleReset} />
                    </Tooltip>
                    <Tooltip title="关闭">
                        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
                    </Tooltip>
                </Space>
            </Flex>

            {/* 筛选项 */}
            <Collapse
                ghost
                defaultActiveKey={['presets', 'time', 'sourceType']}
                items={collapseItems}
                style={{ padding: '8px 0' }}
            />

            {/* 底部操作 */}
            <Flex
                justify="space-between"
                style={{
                    padding: '12px 16px',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    position: 'sticky',
                    bottom: 0,
                    background: token.colorBgContainer,
                }}
            >
                <Button size="small" icon={<SaveOutlined />}>
                    保存筛选
                </Button>
                <Button size="small" type="primary" onClick={handleReset}>
                    重置
                </Button>
            </Flex>
        </Card>
    );
};
