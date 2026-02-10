import React, { useEffect, useMemo, useState } from 'react';
import {
    Card,
    Typography,
    Input,
    Select,
    Segmented,
    DatePicker,
    Checkbox,
    Space,
    Tag,
    Flex,
    Spin,
    Empty,
    Badge,
    Divider,
    theme,
    Tooltip,
    Button,
    Pagination,
} from 'antd';
import {
    FilterOutlined,
    SearchOutlined,
    EnvironmentOutlined,
    BankOutlined,
    ShopOutlined,
    GlobalOutlined,
    AimOutlined,
    ArrowsAltOutlined,
    ShrinkOutlined,
    AppstoreOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { PriceSubType } from '@packages/types';
import { PriceReviewScope, PriceSourceScope } from '@packages/types';
import { useCollectionPoints, useProvinces } from '../../api/hooks';
import { AdvancedPointSelector } from './AdvancedPointSelector';
import { PRICE_QUALITY_TAG_OPTIONS, type PriceQualityTag } from './quality';
import { useDictionary } from '@/hooks/useDictionaries';
import {
    normalizePriceSubTypeCodes,
    usePriceSubTypeOptions,
} from '@/utils/priceSubType';

const { Title, Text } = Typography;

// 采集点类型图标映射
const POINT_TYPE_ICONS: Record<string, React.ReactNode> = {
    PORT: <AimOutlined style={{ color: '#1890ff' }} />,
    ENTERPRISE: <BankOutlined style={{ color: '#52c41a' }} />,
    MARKET: <ShopOutlined style={{ color: '#faad14' }} />,
    REGION: <GlobalOutlined style={{ color: '#722ed1' }} />,
    STATION: <EnvironmentOutlined style={{ color: '#13c2c2' }} />,
};

const POINT_TYPE_LABELS_FALLBACK: Record<string, string> = {
    PORT: '港口',
    ENTERPRISE: '企业',
    MARKET: '市场',
    REGION: '地域(市/县)',
    STATION: '站台',
};

const POINT_TYPE_COLORS: Record<string, string> = {
    PORT: 'blue',
    ENTERPRISE: 'green',
    MARKET: 'orange',
    REGION: 'purple',
    STATION: 'cyan',
};

const COMMODITY_LABELS_FALLBACK: Record<string, string> = {
    CORN: '玉米',
    WHEAT: '小麦',
    SOYBEAN: '大豆',
    RICE: '稻谷',
    SORGHUM: '高粱',
    BARLEY: '大麦',
};



const TIME_RANGES_FALLBACK = [
    { label: '7天', value: 7 },
    { label: '1月', value: 30 },
    { label: '3月', value: 90 },
    { label: '6月', value: 180 },
    { label: '1年', value: 365 },
];

const POINT_PAGE_SIZE = 40;

interface FilterPanelProps {
    commodity: string;
    onCommodityChange: (value: string) => void;
    dateRange: [Dayjs, Dayjs] | null;
    onDateRangeChange: (range: [Dayjs, Dayjs] | null) => void;
    selectedPointIds: string[];
    onSelectedPointIdsChange: (ids: string[]) => void;
    selectedProvince?: string;
    onSelectedProvinceChange: (code: string | undefined) => void;
    pointTypeFilter: string[];
    onPointTypeFilterChange: (types: string[]) => void;
    selectedSubTypes: PriceSubType[];
    onSelectedSubTypesChange: (types: PriceSubType[]) => void;
    selectedQualityTags: PriceQualityTag[];
    onSelectedQualityTagsChange: (types: PriceQualityTag[]) => void;
    reviewScope: PriceReviewScope;
    onReviewScopeChange: (scope: PriceReviewScope) => void;
    sourceScope: PriceSourceScope;
    onSourceScopeChange: (scope: PriceSourceScope) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
    commodity,
    onCommodityChange,
    dateRange,
    onDateRangeChange,
    selectedPointIds,
    onSelectedPointIdsChange,
    selectedProvince,
    onSelectedProvinceChange,
    pointTypeFilter,
    onPointTypeFilterChange,
    selectedSubTypes,
    onSelectedSubTypesChange,
    selectedQualityTags,
    onSelectedQualityTagsChange,
    reviewScope,
    onReviewScopeChange,
    sourceScope,
    onSourceScopeChange,
}) => {
    const { token } = theme.useToken();
    const [searchKeyword, setSearchKeyword] = useState('');
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const { data: commodityDict } = useDictionary('COMMODITY');
    const { data: priceSubTypeDict } = useDictionary('PRICE_SUB_TYPE');
    const { data: pointTypeDict } = useDictionary('COLLECTION_POINT_TYPE');
    const { data: timeRangeDict } = useDictionary('TIME_RANGE');

    // 将 TIME_RANGE 字典转换为适用于 Segmented/RangePicker 的格式
    // 只显示常用的时间范围（7天/1月/3月/6月/1年）
    const COMMON_TIME_RANGES = [7, 30, 90, 180, 365];
    const timeRangeOptions = useMemo(() => {
        const items = (timeRangeDict || []).filter(
            (item) => item.isActive && COMMON_TIME_RANGES.includes((item.meta as any)?.days)
        );
        if (!items.length) return TIME_RANGES_FALLBACK;
        return items
            .sort((a, b) => ((a.meta as any)?.days || 0) - ((b.meta as any)?.days || 0))
            .map((item) => ({
                label: item.label,
                value: (item.meta as any)?.days || 0,
            }));
    }, [timeRangeDict]);

    // 品种选项：仅显示4个主要品种（玉米、小麦、大豆、稻谷）
    const MAIN_COMMODITIES = ['CORN', 'WHEAT', 'SOYBEAN', 'RICE'];
    const commodityOptions = useMemo(() => {
        const items = (commodityDict || []).filter(
            (item) => item.isActive && MAIN_COMMODITIES.includes(item.code)
        );
        if (!items.length) {
            return MAIN_COMMODITIES.map((code) => ({
                label: COMMODITY_LABELS_FALLBACK[code] || code,
                value: code,
            }));
        }
        // 按预设顺序排序
        return items
            .sort((a, b) => MAIN_COMMODITIES.indexOf(a.code) - MAIN_COMMODITIES.indexOf(b.code))
            .map((item) => ({
                // 对核心品种固定中文显示，避免字典被改成英文 code 后影响业务界面
                label: COMMODITY_LABELS_FALLBACK[item.code] || item.label || item.code,
                value: item.code,
            }));
    }, [commodityDict]);

    const priceSubTypeOptions = usePriceSubTypeOptions(priceSubTypeDict);

    const pointTypeLabels = useMemo(() => {
        const items = (pointTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return POINT_TYPE_LABELS_FALLBACK;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [pointTypeDict]);

    const pointTypeOrder = useMemo(() => {
        const items = (pointTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return Object.keys(POINT_TYPE_LABELS_FALLBACK);
        return items
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((item) => item.code);
    }, [pointTypeDict]);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({}); // 新增：控制每个类型组的展开/收起
    const [pointPage, setPointPage] = useState(1);
    const [pointCache, setPointCache] = useState<
        Record<string, { id: string; name: string; type: string }>
    >({});

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedKeyword(searchKeyword.trim());
        }, 400);
        return () => clearTimeout(handler);
    }, [searchKeyword]);

    // 获取采集点列表
    // 只有当有类型过滤或有搜索关键词时才加载数据
    const keywordReady = debouncedKeyword.length >= 2;
    const shouldFetch = pointTypeFilter.length > 0 || keywordReady;
    const collectionPointQuery = useMemo(
        () => ({
            types: pointTypeFilter.length > 0 ? pointTypeFilter : undefined,
            keyword: keywordReady ? debouncedKeyword : undefined,
            isActive: true,
            page: pointPage,
            pageSize: POINT_PAGE_SIZE,
        }),
        [pointTypeFilter, keywordReady, debouncedKeyword, pointPage],
    );
    const { data: collectionPointsData, isLoading: isLoadingPoints } = useCollectionPoints(
        collectionPointQuery,
        undefined,
        { enabled: shouldFetch },
    );
    const collectionPoints = collectionPointsData?.data || [];

    useEffect(() => {
        setPointPage(1);
    }, [pointTypeFilter, debouncedKeyword]);

    useEffect(() => {
        if (collectionPoints.length === 0) return;
        setPointCache((prev) => {
            const next = { ...prev };
            collectionPoints.forEach((point) => {
                next[point.id] = { id: point.id, name: point.name, type: point.type };
            });
            return next;
        });
    }, [collectionPoints]);

    // 获取省份列表
    const { data: provinces } = useProvinces();

    // 按类型分组的采集点
    const groupedPoints = React.useMemo(() => {
        // 按类型分组
        const groups: Record<string, typeof collectionPoints> = {};
        collectionPoints.forEach((point) => {
            if (!groups[point.type]) {
                groups[point.type] = [];
            }
            groups[point.type].push(point);
        });

        return groups;
    }, [collectionPoints]);

    const presetValue = useMemo(() => {
        if (!dateRange) return null;
        const days = dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1;
        const preset = timeRangeOptions.find((item) => item.value === days);
        return preset?.value ?? null;
    }, [dateRange]);

    const togglePoint = (id: string) => {
        if (selectedPointIds.includes(id)) {
            onSelectedPointIdsChange(selectedPointIds.filter((pid) => pid !== id));
        } else {
            onSelectedPointIdsChange([...selectedPointIds, id]);
        }
    };

    const selectAllInGroup = (type: string) => {
        const groupPoints = groupedPoints[type] || [];
        const groupIds = groupPoints.map((p) => p.id);
        const allSelected = groupIds.every((id) => selectedPointIds.includes(id));

        if (allSelected) {
            onSelectedPointIdsChange(selectedPointIds.filter((id) => !groupIds.includes(id)));
        } else {
            const newIds = new Set([...selectedPointIds, ...groupIds]);
            onSelectedPointIdsChange(Array.from(newIds));
        }
    };

    return (
        <>
            <Card
                style={{
                    width: expanded ? 400 : 280, // 动态宽度
                    height: '100%',
                    overflow: 'auto',
                    borderRadius: 0,
                    borderRight: `1px solid ${token.colorBorderSecondary}`,
                    transition: 'width 0.3s ease',
                    position: 'relative'
                }}
                bodyStyle={{ padding: 16 }}
            >
                <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>
                        <FilterOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                        多维筛选
                    </Title>
                    <Tooltip title={expanded ? "收起面板" : "展开面板"}>
                        <Button
                            type="text"
                            size="small"
                            icon={expanded ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
                            onClick={() => setExpanded(!expanded)}
                        />
                    </Tooltip>
                </Flex>

                {/* 品种切换 */}
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                        品种
                    </Text>
                    <Segmented
                        block
                        options={commodityOptions}
                        value={commodity}
                        onChange={(val) => onCommodityChange(String(val))}
                        style={{ marginTop: 8 }}
                        size="small"
                    />
                </div>

                {/* 时间范围 */}
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                        时间范围
                    </Text>
                    <Segmented
                        block
                        options={timeRangeOptions}
                        value={presetValue ?? undefined}
                        onChange={(val) => {
                            const days = Number(val);
                            const end = dayjs();
                            const start = end.subtract(days - 1, 'day');
                            onDateRangeChange([start, end]);
                        }}
                        style={{ marginTop: 8, marginBottom: 8 }}
                        size="small"
                    />
                    <DatePicker.RangePicker
                        value={dateRange ?? undefined}
                        onChange={(val) => {
                            if (!val || val.length !== 2 || !val[0] || !val[1]) {
                                onDateRangeChange(null);
                                return;
                            }
                            onDateRangeChange([val[0], val[1]]);
                        }}
                        presets={timeRangeOptions.map((item) => ({
                            label: item.label,
                            value: [dayjs().subtract(item.value - 1, 'day'), dayjs()],
                        }))}
                        size="small"
                        style={{ width: '100%' }}
                        allowClear
                    />
                </div>

                {/* ===== 价格类型 ===== */}
                <div
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        background: token.colorFillQuaternary,
                        borderRadius: token.borderRadius,
                    }}
                >
                    <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                        <FilterOutlined style={{ color: token.colorPrimary }} />
                        <Text strong style={{ fontSize: 12 }}>价格类型</Text>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        可多选，留空表示全部类型
                    </Text>
                    <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择价格类型"
                        style={{ width: '100%' }}
                        value={selectedSubTypes}
                        onChange={(vals) =>
                            onSelectedSubTypesChange(
                                normalizePriceSubTypeCodes(vals as string[]) as PriceSubType[],
                            )
                        }
                        options={priceSubTypeOptions}
                        size="small"
                        maxTagCount="responsive"
                    />
                </div>

                {/* ===== 数据质量 ===== */}
                <div
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        background: token.colorFillQuaternary,
                        borderRadius: token.borderRadius,
                    }}
                >
                    <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                        <FilterOutlined style={{ color: token.colorPrimary }} />
                        <Text strong style={{ fontSize: 12 }}>数据质量</Text>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        可多选，留空表示全部质量标签
                    </Text>
                    <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择质量标签"
                        style={{ width: '100%' }}
                        value={selectedQualityTags}
                        onChange={(vals) => onSelectedQualityTagsChange(vals as PriceQualityTag[])}
                        options={PRICE_QUALITY_TAG_OPTIONS}
                        size="small"
                        maxTagCount="responsive"
                    />
                </div>

                {/* ===== 数据口径 ===== */}
                <div
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        background: token.colorFillQuaternary,
                        borderRadius: token.borderRadius,
                    }}
                >
                    <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                        <FilterOutlined style={{ color: token.colorPrimary }} />
                        <Text strong style={{ fontSize: 12 }}>数据口径</Text>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        控制审核状态与数据来源范围
                    </Text>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Select
                            size="small"
                            value={reviewScope}
                            onChange={(value) => onReviewScopeChange(value as PriceReviewScope)}
                            options={[
                                { label: '审核通过+待审', value: PriceReviewScope.APPROVED_AND_PENDING },
                                { label: '仅审核通过', value: PriceReviewScope.APPROVED_ONLY },
                                { label: '全部状态', value: PriceReviewScope.ALL },
                            ]}
                        />
                        <Select
                            size="small"
                            value={sourceScope}
                            onChange={(value) => onSourceScopeChange(value as PriceSourceScope)}
                            options={[
                                { label: '全部来源', value: PriceSourceScope.ALL },
                                { label: '仅AI提取', value: PriceSourceScope.AI_ONLY },
                                { label: '仅人工填报', value: PriceSourceScope.MANUAL_ONLY },
                            ]}
                        />
                    </Space>
                </div>

                {/* ===== 区域参考 ===== */}
                <div
                    style={{
                        marginBottom: 16,
                        padding: 12,
                        background: token.colorFillQuaternary,
                        borderRadius: token.borderRadius,
                    }}
                >
                    <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                        <GlobalOutlined style={{ color: '#722ed1' }} />
                        <Text strong style={{ fontSize: 12 }}>区域参考</Text>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        选择省份后，图表将显示该区域的聚合均价参考线
                    </Text>
                    <Select
                        allowClear
                        placeholder="选择省份"
                        style={{ width: '100%' }}
                        value={selectedProvince}
                        onChange={(val) => onSelectedProvinceChange(val)}
                        options={provinces?.map((p) => ({ label: p.name, value: p.code })) || []}
                        size="small"
                        showSearch
                        optionFilterProp="label"
                    />
                </div>

                {/* ===== 采集点对比 ===== */}
                <div
                    style={{
                        padding: 12,
                        background: token.colorFillQuaternary,
                        borderRadius: token.borderRadius,
                        marginBottom: 12,
                    }}
                >
                    <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                        <Flex align="center" gap={6}>
                            <EnvironmentOutlined style={{ color: token.colorPrimary }} />
                            <Text strong style={{ fontSize: 12 }}>采集点对比</Text>
                        </Flex>
                        <Tooltip title="在大窗口中批量选择">
                            <Button
                                type="link"
                                size="small"
                                icon={<AppstoreOutlined />}
                                onClick={() => setSelectorVisible(true)}
                                style={{ padding: 0, fontSize: 12 }}
                            >
                                高级选择
                            </Button>
                        </Tooltip>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        选择具体采集点，图表将显示各点位的价格曲线
                    </Text>

                    {/* 采集点类型过滤 */}
                    <Checkbox.Group
                        value={pointTypeFilter}
                        onChange={(vals) => {
                            const newTypes = vals as string[];
                            // 联动逻辑：取消勾选类型时，同时取消该类型下已选中的采集点
                            const removedTypes = pointTypeFilter.filter(t => !newTypes.includes(t));
                            if (removedTypes.length > 0) {
                                // 基于本地缓存中的点位类型做联动移除
                                const newSelectedIds = selectedPointIds.filter((id) => {
                                    const cached = pointCache[id];
                                    if (!cached) return true;
                                    return !removedTypes.includes(cached.type);
                                });
                                if (newSelectedIds.length !== selectedPointIds.length) {
                                    onSelectedPointIdsChange(newSelectedIds);
                                }
                            }
                            onPointTypeFilterChange(newTypes);
                        }}
                        style={{ marginBottom: 8 }}
                    >
                        <Space wrap size={4}>
                            {pointTypeOrder.map((key) => (
                                <Checkbox key={key} value={key}>
                                    <Flex align="center" gap={4}>
                                        {POINT_TYPE_ICONS[key]}
                                        <span style={{ fontSize: 12 }}>{pointTypeLabels[key] || key}</span>
                                    </Flex>
                                </Checkbox>
                            ))}
                        </Space>
                    </Checkbox.Group>
                </div>

                {/* 采集点搜索 */}
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索采集点（至少2个字）..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    size="small"
                    style={{ marginBottom: 12 }}
                />

                {/* 采集点列表 */}
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    {!shouldFetch ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={<span style={{ fontSize: 12 }}>请选择类型或输入至少2个字</span>}
                        />
                    ) : isLoadingPoints ? (
                        <Flex justify="center" style={{ padding: 32 }}>
                            <Spin size="small" />
                        </Flex>
                    ) : Object.keys(groupedPoints).length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配采集点" />
                    ) : (
                        Object.entries(groupedPoints).map(([type, points]) => (
                            <div key={type} style={{ marginBottom: 12 }}>
                                <Flex
                                    justify="space-between"
                                    align="center"
                                    style={{ marginBottom: 4 }}
                                >
                                    <Flex align="center" gap={6}>
                                        {POINT_TYPE_ICONS[type]}
                                        <Text strong style={{ fontSize: 12 }}>
                                            {pointTypeLabels[type] || type}
                                        </Text>
                                        <Badge
                                            count={points.length}
                                            style={{ backgroundColor: token.colorTextQuaternary }}
                                        />
                                    </Flex>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: 10, cursor: 'pointer' }}
                                        onClick={() => selectAllInGroup(type)}
                                    >
                                        {points.every((p) => selectedPointIds.includes(p.id))
                                            ? '取消全选'
                                            : '全选'}
                                    </Text>
                                </Flex>
                                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                    {points.slice(0, expandedGroups[type] ? 50 : 8).map((point) => (
                                        <Flex
                                            key={point.id}
                                            align="center"
                                            style={{
                                                padding: '6px 8px',
                                                borderRadius: token.borderRadius,
                                                cursor: 'pointer',
                                                background: selectedPointIds.includes(point.id)
                                                    ? `${token.colorPrimary}10`
                                                    : undefined,
                                            }}
                                            onClick={() => togglePoint(point.id)}
                                        >
                                            <Checkbox
                                                checked={selectedPointIds.includes(point.id)}
                                                style={{ marginRight: 8 }}
                                            />
                                            <Tooltip title={point.region?.name || point.code}>
                                                <Text
                                                    ellipsis
                                                    style={{
                                                        flex: 1,
                                                        fontSize: 12,
                                                        color: selectedPointIds.includes(point.id)
                                                            ? token.colorPrimary
                                                            : undefined,
                                                    }}
                                                >
                                                    {point.name}
                                                </Text>
                                            </Tooltip>
                                        </Flex>
                                    ))}
                                    {points.length > 8 && (
                                        <Text
                                            type="secondary"
                                            style={{ fontSize: 11, paddingLeft: 8, cursor: 'pointer', color: token.colorPrimary }}
                                            onClick={() => setExpandedGroups({ ...expandedGroups, [type]: !expandedGroups[type] })}
                                        >
                                            {expandedGroups[type] ? '收起' : `展开剩余 ${points.length - 8} 个...`}
                                        </Text>
                                    )}
                                </Space>
                            </div>
                        ))
                    )}
                </div>

                {shouldFetch && (
                    <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            共 {collectionPointsData?.total || 0} 个
                        </Text>
                        <Pagination
                            size="small"
                            simple
                            current={collectionPointsData?.page || pointPage}
                            pageSize={collectionPointsData?.pageSize || POINT_PAGE_SIZE}
                            total={collectionPointsData?.total || 0}
                            showSizeChanger={false}
                            onChange={(page) => setPointPage(page)}
                        />
                    </Flex>
                )}

                <Divider style={{ margin: '12px 0' }} />

                {/* 已选采集点详情列表 */}
                {selectedPointIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>已选采集点</Text>
                            <Button size="small" type="link" onClick={() => onSelectedPointIdsChange([])} style={{ padding: 0, fontSize: 11 }}>
                                清空全部
                            </Button>
                        </Flex>
                        <Space size={[4, 4]} wrap>
                            {selectedPointIds.map(id => {
                                const point = pointCache[id];
                                return (
                                    <Tag
                                        key={id}
                                        closable
                                        color={point ? POINT_TYPE_COLORS[point.type] : undefined}
                                        onClose={() => togglePoint(id)}
                                        style={{ fontSize: 11, margin: 0 }}
                                    >
                                        {point?.name || id.slice(0, 8)}
                                    </Tag>
                                );
                            })}
                        </Space>
                    </div>
                )}

                {selectedPointIds.length === 0 && (
                    <Flex justify="center" vertical align="center" gap={8}>
                        <Tag>未选择采集点</Tag>
                    </Flex>
                )}
            </Card>

            {/* 高级选择弹窗 */}
            <AdvancedPointSelector
                open={selectorVisible}
                onCancel={() => setSelectorVisible(false)}
                selectedIds={selectedPointIds}
                onOk={onSelectedPointIdsChange}
                currentPointTypeFilter={pointTypeFilter}
            />
        </>
    );
};

export default FilterPanel;
