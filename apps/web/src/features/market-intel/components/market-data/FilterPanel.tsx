import React from 'react';
import {
    Card,
    Typography,
    Input,
    Select,
    Segmented,
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
} from 'antd';
import {
    FilterOutlined,
    SearchOutlined,
    EnvironmentOutlined,
    BankOutlined,
    ShopOutlined,
    GlobalOutlined,
    AimOutlined,
} from '@ant-design/icons';
import { useCollectionPoints, useProvinces } from '../../api/hooks';

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
    REGION: '区域',
    STATION: '站台',
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
    days: number;
    onDaysChange: (value: number) => void;
    selectedPointIds: string[];
    onSelectedPointIdsChange: (ids: string[]) => void;
    selectedProvince?: string;
    onSelectedProvinceChange: (code: string | undefined) => void;
    pointTypeFilter: string[];
    onPointTypeFilterChange: (types: string[]) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
    commodity,
    onCommodityChange,
    days,
    onDaysChange,
    selectedPointIds,
    onSelectedPointIdsChange,
    selectedProvince,
    onSelectedProvinceChange,
    pointTypeFilter,
    onPointTypeFilterChange,
}) => {
    const { token } = theme.useToken();
    const [searchKeyword, setSearchKeyword] = React.useState('');

    // 获取采集点列表
    const { data: collectionPointsData, isLoading: isLoadingPoints } = useCollectionPoints();
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
            if (searchKeyword) {
                const keyword = searchKeyword.toLowerCase();
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
    }, [collectionPoints, pointTypeFilter, searchKeyword]);

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
        <Card
            style={{
                width: 280,
                height: '100%',
                overflow: 'auto',
                borderRadius: 0,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
            }}
            bodyStyle={{ padding: 16 }}
        >
            <Title level={5} style={{ margin: 0, marginBottom: 16 }}>
                <FilterOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                多维筛选
            </Title>

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
                    value={days}
                    onChange={(val) => onDaysChange(Number(val))}
                    style={{ marginTop: 8 }}
                    size="small"
                />
            </div>

            {/* 省份筛选 */}
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                    区域筛选
                </Text>
                <Select
                    allowClear
                    placeholder="选择省份"
                    style={{ width: '100%', marginTop: 8 }}
                    value={selectedProvince}
                    onChange={(val) => onSelectedProvinceChange(val)}
                    options={provinces?.map((p) => ({ label: p.name, value: p.code })) || []}
                    size="small"
                    showSearch
                    optionFilterProp="label"
                />
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 采集点类型过滤 */}
            <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                    采集点类型
                </Text>
                <Checkbox.Group
                    value={pointTypeFilter}
                    onChange={(vals) => onPointTypeFilterChange(vals as string[])}
                    style={{ marginTop: 8 }}
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
                placeholder="搜索采集点..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                size="small"
                style={{ marginBottom: 12 }}
            />

            {/* 采集点列表 */}
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {isLoadingPoints ? (
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
                                {points.slice(0, 20).map((point) => (
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
                                                {point.shortName || point.name}
                                            </Text>
                                        </Tooltip>
                                    </Flex>
                                ))}
                                {points.length > 20 && (
                                    <Text type="secondary" style={{ fontSize: 10, paddingLeft: 8 }}>
                                        还有 {points.length - 20} 个...
                                    </Text>
                                )}
                            </Space>
                        </div>
                    ))
                )}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 已选统计 */}
            <Flex justify="center">
                <Tag color={selectedPointIds.length > 0 ? 'blue' : undefined}>
                    已选择 {selectedPointIds.length} 个采集点
                </Tag>
            </Flex>
        </Card>
    );
};

export default FilterPanel;
