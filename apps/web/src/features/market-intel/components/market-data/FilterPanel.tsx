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
import { useCollectionPoints, useProvinces } from '../../api/hooks';
import { AdvancedPointSelector } from './AdvancedPointSelector';

const { Title, Text } = Typography;

// 采集点类型图标映射
const POINT_TYPE_ICONS: Record<string, React.ReactNode> = {
    PORT: <AimOutlined style={{ color: '#1890ff' }} />,
    ENTERPRISE: <BankOutlined style={{ color: '#52c41a' }} />,
    MARKET: <ShopOutlined style={{ color: '#faad14' }} />,
    REGION: <GlobalOutlined style={{ color: '#722ed1' }} />,
    STATION: <EnvironmentOutlined style={{ color: '#13c2c2' }} />,
};

const POINT_TYPE_LABELS: Record<string, string> = {
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

const PRICE_SUB_TYPE_LABELS: Record<string, string> = {
    LISTED: '挂牌价',
    TRANSACTION: '成交价',
    ARRIVAL: '到港价',
    FOB: '平舱价',
    STATION_ORIGIN: '产区站台',
    STATION_DEST: '销区站台',
    PURCHASE: '收购价',
    WHOLESALE: '批发价',
    OTHER: '其他',
};

const COMMODITIES = ['玉米', '大豆', '小麦', '高粱', '豆粕'];

const TIME_RANGES = [
    { label: '7天', value: 7 },
    { label: '1月', value: 30 },
    { label: '3月', value: 90 },
    { label: '6月', value: 180 },
    { label: '1年', value: 365 },
];

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
}) => {
    const { token } = theme.useToken();
    const [searchKeyword, setSearchKeyword] = useState('');
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const [selectorVisible, setSelectorVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({}); // 新增：控制每个类型组的展开/收起

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
    const { data: collectionPointsData, isLoading: isLoadingPoints } = useCollectionPoints(
        undefined,
        undefined,
        { enabled: shouldFetch },
    );
    const collectionPoints = collectionPointsData?.data || [];

    // 获取省份列表
    const { data: provinces } = useProvinces();

    // 按类型分组的采集点
    const groupedPoints = React.useMemo(() => {
        const filtered = collectionPoints.filter((point) => {
            // 类型过滤
            if (pointTypeFilter.length > 0 && !pointTypeFilter.includes(point.type)) {
                return false;
            }
            // 关键词过滤
            if (keywordReady) {
                const keyword = debouncedKeyword.toLowerCase();
                return (
                    point.name.toLowerCase().includes(keyword) ||
                    (point.shortName?.toLowerCase().includes(keyword) ?? false) ||
                    point.code.toLowerCase().includes(keyword)
                );
            }
            return true;
        });

        // 按类型分组
        const groups: Record<string, typeof filtered> = {};
        filtered.forEach((point) => {
            if (!groups[point.type]) {
                groups[point.type] = [];
            }
            groups[point.type].push(point);
        });

        return groups;
    }, [collectionPoints, pointTypeFilter, debouncedKeyword, keywordReady]);

    const presetValue = useMemo(() => {
        if (!dateRange) return null;
        const days = dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1;
        const preset = TIME_RANGES.find((item) => item.value === days);
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
                        options={COMMODITIES}
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
                        options={TIME_RANGES}
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
                        presets={TIME_RANGES.map((item) => ({
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
                        onChange={(vals) => onSelectedSubTypesChange(vals as PriceSubType[])}
                        options={Object.entries(PRICE_SUB_TYPE_LABELS).map(([value, label]) => ({
                            label,
                            value,
                        }))}
                        size="small"
                        maxTagCount="responsive"
                    />
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
                                // 找到要移除的类型下的所有采集点ID
                                const pointsToRemove = collectionPoints
                                    .filter(p => removedTypes.includes(p.type))
                                    .map(p => p.id);
                                const newSelectedIds = selectedPointIds.filter(id => !pointsToRemove.includes(id));
                                if (newSelectedIds.length !== selectedPointIds.length) {
                                    onSelectedPointIdsChange(newSelectedIds);
                                }
                            }
                            onPointTypeFilterChange(newTypes);
                        }}
                        style={{ marginBottom: 8 }}
                    >
                        <Space wrap size={4}>
                            {Object.entries(POINT_TYPE_LABELS).map(([key, label]) => (
                                <Checkbox key={key} value={key}>
                                    <Flex align="center" gap={4}>
                                        {POINT_TYPE_ICONS[key]}
                                        <span style={{ fontSize: 12 }}>{label}</span>
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
                            description={<span style={{ fontSize: 12 }}>请选择类型或使用"高级选择"</span>}
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
                                            {POINT_TYPE_LABELS[type] || type}
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
                                const point = collectionPoints.find(p => p.id === id);
                                if (!point) return null;
                                return (
                                    <Tag
                                        key={id}
                                        closable
                                        color={POINT_TYPE_COLORS[point.type]}
                                        onClose={() => togglePoint(id)}
                                        style={{ fontSize: 11, margin: 0 }}
                                    >
                                        {point.name}
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
