import React, { useMemo, useState } from 'react';
import { Modal, Tag, Flex, theme, Empty, Button, Space, Checkbox, Input, Divider, Badge, Collapse, Spin } from 'antd';
import {
    FilterOutlined,
    AimOutlined,
    BankOutlined,
    ShopOutlined,
    GlobalOutlined,
    EnvironmentOutlined,
    SearchOutlined,
    CheckSquareOutlined,
    CloseOutlined,
    PlusOutlined,
    MinusOutlined,
} from '@ant-design/icons';
import PinyinMatch from 'pinyin-match';
import { useCollectionPoints } from '../../api/hooks';

interface AdvancedPointSelectorProps {
    open: boolean;
    onCancel: () => void;
    selectedIds: string[];
    onOk: (ids: string[]) => void;
    currentPointTypeFilter: string[];
}

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
    REGION: '地域',
    STATION: '站台',
};

const POINT_TYPE_COLORS: Record<string, string> = {
    PORT: 'blue',
    ENTERPRISE: 'green',
    MARKET: 'orange',
    REGION: 'purple',
    STATION: 'cyan',
};

const POINT_TYPE_ORDER = ['PORT', 'ENTERPRISE', 'MARKET', 'REGION', 'STATION'];

interface PointItem {
    id: string;
    name: string;
    shortName?: string;
    type: string;
    regionName?: string;
    code?: string;
}

export const AdvancedPointSelector: React.FC<AdvancedPointSelectorProps> = ({
    open,
    onCancel,
    selectedIds,
    onOk,
    currentPointTypeFilter
}) => {
    const { token } = theme.useToken();
    const [targetKeys, setTargetKeys] = useState<string[]>(selectedIds);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [internalTypeFilter, setInternalTypeFilter] = useState<string[]>(currentPointTypeFilter);

    // 同步外部选中的ID
    React.useEffect(() => {
        if (open) {
            setTargetKeys(selectedIds);
            setInternalTypeFilter(currentPointTypeFilter);
            setSearchKeyword('');
        }
    }, [open, selectedIds, currentPointTypeFilter]);

    // 获取所有采集点数据
    const { data: allPointsData, isLoading } = useCollectionPoints(
        undefined,
        undefined,
        { enabled: open }
    );

    const allPoints: PointItem[] = useMemo(() => {
        if (!allPointsData?.data) return [];
        return allPointsData.data.map(item => ({
            id: item.id,
            name: item.name,
            shortName: item.shortName ?? undefined,
            type: item.type,
            regionName: item.region?.name,
            code: item.code
        }));
    }, [allPointsData]);

    // 按类型分组的可用采集点（应用筛选）
    const groupedAvailablePoints = useMemo(() => {
        const groups: Record<string, PointItem[]> = {};

        allPoints.forEach(point => {
            // 类型过滤
            if (internalTypeFilter.length > 0 && !internalTypeFilter.includes(point.type)) {
                return;
            }
            // 搜索过滤
            if (searchKeyword) {
                const displayName = point.name;
                const titleMatch = PinyinMatch.match(displayName, searchKeyword);
                if (!Array.isArray(titleMatch) || titleMatch[0] !== 0) {
                    return;
                }
            }
            // 排除已选中的
            if (targetKeys.includes(point.id)) {
                return;
            }

            if (!groups[point.type]) {
                groups[point.type] = [];
            }
            groups[point.type].push(point);
        });

        return groups;
    }, [allPoints, internalTypeFilter, searchKeyword, targetKeys]);

    // 已选中的采集点列表
    const selectedPoints = useMemo(() => {
        return allPoints.filter(p => targetKeys.includes(p.id));
    }, [allPoints, targetKeys]);

    // 已选统计（按类型）
    const selectedStats = useMemo(() => {
        const stats: Record<string, number> = {};
        selectedPoints.forEach(p => {
            stats[p.type] = (stats[p.type] || 0) + 1;
        });
        return stats;
    }, [selectedPoints]);

    // 可用数量统计
    const availableCount = useMemo(() => {
        return Object.values(groupedAvailablePoints).flat().length;
    }, [groupedAvailablePoints]);

    // 选中单个
    const handleSelect = (id: string) => {
        setTargetKeys([...targetKeys, id]);
    };

    // 取消选中单个
    const handleDeselect = (id: string) => {
        setTargetKeys(targetKeys.filter(k => k !== id));
    };

    // 全选某类型
    const handleSelectAllOfType = (type: string) => {
        const typePoints = groupedAvailablePoints[type] || [];
        const newKeys = [...targetKeys, ...typePoints.map(p => p.id)];
        setTargetKeys([...new Set(newKeys)]);
    };

    // 取消某类型全选
    const handleDeselectAllOfType = (type: string) => {
        const typePointIds = allPoints.filter(p => p.type === type).map(p => p.id);
        setTargetKeys(targetKeys.filter(k => !typePointIds.includes(k)));
    };

    // 全选当前筛选结果
    const handleSelectAllVisible = () => {
        const visibleIds = Object.values(groupedAvailablePoints).flat().map(p => p.id);
        const newKeys = [...targetKeys, ...visibleIds];
        setTargetKeys([...new Set(newKeys)]);
    };

    // 清空已选
    const handleClearAll = () => {
        setTargetKeys([]);
    };

    const handleOk = () => {
        onOk(targetKeys);
        onCancel();
    };

    // 渲染左侧（待选列表）
    const renderAvailableList = () => {
        if (isLoading) {
            return <Flex justify="center" align="center" style={{ height: 300 }}><Spin /></Flex>;
        }

        const orderedTypes = POINT_TYPE_ORDER.filter(t => groupedAvailablePoints[t]?.length > 0);

        if (orderedTypes.length === 0) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配采集点" />;
        }

        return (
            <Collapse
                defaultActiveKey={orderedTypes}
                ghost
                size="small"
                items={orderedTypes.map(type => ({
                    key: type,
                    label: (
                        <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                            <Space>
                                {POINT_TYPE_ICONS[type]}
                                <span>{POINT_TYPE_LABELS[type]}</span>
                                <Badge count={groupedAvailablePoints[type]?.length || 0} style={{ backgroundColor: token.colorTextQuaternary }} />
                            </Space>
                            <Button
                                type="link"
                                size="small"
                                onClick={(e) => { e.stopPropagation(); handleSelectAllOfType(type); }}
                                style={{ fontSize: 11, padding: 0 }}
                            >
                                全选
                            </Button>
                        </Flex>
                    ),
                    children: (
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            {groupedAvailablePoints[type]?.slice(0, 50).map(point => (
                                <Flex
                                    key={point.id}
                                    align="center"
                                    justify="space-between"
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: token.borderRadius,
                                        cursor: 'pointer',
                                        background: token.colorFillQuaternary,
                                    }}
                                    onClick={() => handleSelect(point.id)}
                                >
                                    <Space>
                                        <PlusOutlined style={{ color: token.colorPrimary, fontSize: 10 }} />
                                        <span style={{ fontSize: 12 }}>{point.name}</span>
                                    </Space>
                                    <Tag bordered={false} style={{ fontSize: 10, margin: 0 }}>
                                        {point.regionName || '-'}
                                    </Tag>
                                </Flex>
                            ))}
                            {(groupedAvailablePoints[type]?.length || 0) > 50 && (
                                <Flex justify="center">
                                    <Tag>还有 {(groupedAvailablePoints[type]?.length || 0) - 50} 个未显示</Tag>
                                </Flex>
                            )}
                        </Space>
                    ),
                }))}
            />
        );
    };

    // 渲染右侧（已选列表）
    const renderSelectedList = () => {
        if (selectedPoints.length === 0) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
        }

        // 按类型分组显示
        const groupedSelected: Record<string, PointItem[]> = {};
        selectedPoints.forEach(p => {
            if (!groupedSelected[p.type]) groupedSelected[p.type] = [];
            groupedSelected[p.type].push(p);
        });

        return (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {POINT_TYPE_ORDER.filter(t => groupedSelected[t]?.length > 0).map(type => (
                    <div key={type}>
                        <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                            <Space size={4}>
                                {POINT_TYPE_ICONS[type]}
                                <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                    {POINT_TYPE_LABELS[type]} ({groupedSelected[type]?.length})
                                </span>
                            </Space>
                            <Button
                                type="link"
                                size="small"
                                danger
                                onClick={() => handleDeselectAllOfType(type)}
                                style={{ fontSize: 10, padding: 0 }}
                            >
                                移除全部
                            </Button>
                        </Flex>
                        <Space size={[4, 4]} wrap>
                            {groupedSelected[type]?.map(point => (
                                <Tag
                                    key={point.id}
                                    closable
                                    color={POINT_TYPE_COLORS[type]}
                                    onClose={() => handleDeselect(point.id)}
                                    style={{ fontSize: 11, margin: 0 }}
                                >
                                    {point.name}
                                </Tag>
                            ))}
                        </Space>
                    </div>
                ))}
            </Space>
        );
    };

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <FilterOutlined style={{ color: token.colorPrimary }} />
                    <span>选择分析采集点</span>
                    <Tag>{allPoints.length} 个可用</Tag>
                </Flex>
            }
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            width={900}
            styles={{ body: { padding: 0 } }}
            centered
        >
            {/* 顶部类型筛选器 */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <Flex justify="space-between" align="center">
                    <Checkbox.Group
                        value={internalTypeFilter}
                        onChange={(vals) => setInternalTypeFilter(vals as string[])}
                    >
                        <Space size={8}>
                            {POINT_TYPE_ORDER.map(type => (
                                <Checkbox key={type} value={type}>
                                    <Space size={4}>
                                        {POINT_TYPE_ICONS[type]}
                                        <span style={{ fontSize: 12 }}>{POINT_TYPE_LABELS[type]}</span>
                                    </Space>
                                </Checkbox>
                            ))}
                        </Space>
                    </Checkbox.Group>
                    <Button
                        size="small"
                        icon={<CheckSquareOutlined />}
                        onClick={handleSelectAllVisible}
                        disabled={availableCount === 0}
                    >
                        全选筛选结果
                    </Button>
                </Flex>
            </div>

            {/* 双栏布局 */}
            <Flex style={{ height: 420 }}>
                {/* 左侧：待选列表 */}
                <div style={{ flex: 1, borderRight: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <Input
                            prefix={<SearchOutlined />}
                            placeholder="搜索采集点名称或首字母..."
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            size="small"
                            allowClear
                        />
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                        {renderAvailableList()}
                    </div>
                    <Flex justify="center" style={{ padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                        <Tag>{availableCount} 项待选</Tag>
                    </Flex>
                </div>

                {/* 右侧：已选列表 */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Flex justify="space-between" align="center" style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>已选采集点</span>
                        {targetKeys.length > 0 && (
                            <Button type="link" size="small" danger onClick={handleClearAll} style={{ padding: 0, fontSize: 11 }}>
                                清空全部
                            </Button>
                        )}
                    </Flex>
                    <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                        {renderSelectedList()}
                    </div>
                    <Flex justify="center" style={{ padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                        <Space size={8}>
                            {Object.entries(selectedStats).map(([type, count]) => (
                                <Tag key={type} icon={POINT_TYPE_ICONS[type]} style={{ fontSize: 11 }}>
                                    {count}
                                </Tag>
                            ))}
                            {targetKeys.length === 0 && <Tag>未选择</Tag>}
                        </Space>
                    </Flex>
                </div>
            </Flex>

            {/* 底部提示 */}
            <Flex justify="space-between" align="center" style={{ padding: '8px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextSecondary, fontSize: 12 }}>
                <span>提示: 点击左侧条目添加，点击右侧标签的 × 移除</span>
                <span>共选中 <strong style={{ color: token.colorPrimary }}>{targetKeys.length}</strong> 个采集点</span>
            </Flex>
        </Modal>
    );
};
