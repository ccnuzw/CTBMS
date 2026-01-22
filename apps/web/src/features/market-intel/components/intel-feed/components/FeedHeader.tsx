import React, { useState } from 'react';
import {
    Card,
    Input,
    Button,
    Segmented,
    Space,
    Dropdown,
    Tooltip,
    Badge,
    Flex,
    theme,
    Typography,
} from 'antd';
import {
    SearchOutlined,
    FilterOutlined,
    ReloadOutlined,
    DownloadOutlined,
    SettingOutlined,
    UnorderedListOutlined,
    AppstoreOutlined,
    FieldTimeOutlined,
    TableOutlined,
    EnvironmentOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    LinkOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { IntelViewType, IntelFilterState } from '../types';

const { Title } = Typography;

interface FeedHeaderProps {
    viewType: IntelViewType;
    onViewChange: (view: IntelViewType) => void;
    filterState: IntelFilterState;
    onFilterChange: (filter: Partial<IntelFilterState>) => void;
    filterPanelVisible: boolean;
    onFilterPanelToggle: () => void;
    relationPanelVisible: boolean;
    onRelationPanelToggle: () => void;
}

const VIEW_OPTIONS = [
    { label: '信息流', value: 'FEED', icon: <UnorderedListOutlined /> },
    { label: '仪表盘', value: 'DASHBOARD', icon: <AppstoreOutlined /> },
    { label: '时间线', value: 'TIMELINE', icon: <FieldTimeOutlined /> },
    { label: '表格', value: 'TABLE', icon: <TableOutlined /> },
];

export const FeedHeader: React.FC<FeedHeaderProps> = ({
    viewType,
    onViewChange,
    filterState,
    onFilterChange,
    filterPanelVisible,
    onFilterPanelToggle,
    relationPanelVisible,
    onRelationPanelToggle,
}) => {
    const { token } = theme.useToken();
    const [searchValue, setSearchValue] = useState(filterState.keyword || '');

    const handleSearch = () => {
        onFilterChange({ keyword: searchValue || undefined });
    };

    // 计算激活的筛选数量
    const activeFilterCount = [
        filterState.contentTypes.length > 0,
        filterState.sourceTypes.length > 0,
        filterState.commodities.length > 0,
        filterState.regions.length > 0,
        filterState.collectionPointIds.length > 0,
        filterState.eventTypeIds.length > 0,
        filterState.status.length > 0,
        filterState.qualityLevel.length > 0,
        filterState.confidenceRange[0] > 0 || filterState.confidenceRange[1] < 100,
    ].filter(Boolean).length;

    // 导出菜单
    const exportMenuItems: MenuProps['items'] = [
        { key: 'excel', label: '导出为 Excel' },
        { key: 'csv', label: '导出为 CSV' },
        { key: 'pdf', label: '导出为 PDF 报告' },
    ];

    return (
        <Card
            style={{
                borderRadius: 0,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
            bodyStyle={{ padding: '12px 16px' }}
        >
            <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                {/* 左侧: 标题 + 搜索 */}
                <Flex align="center" gap={16}>
                    <Tooltip title={filterPanelVisible ? '隐藏筛选' : '显示筛选'}>
                        <Button
                            type="text"
                            icon={filterPanelVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                            onClick={onFilterPanelToggle}
                        />
                    </Tooltip>

                    <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        🏛️ B类情报中枢
                    </Title>

                    <Input.Search
                        placeholder="搜索情报内容、关键词..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        onSearch={handleSearch}
                        style={{ width: 300 }}
                        allowClear
                        enterButton={
                            <Button type="primary" icon={<SearchOutlined />}>
                                搜索
                            </Button>
                        }
                    />

                    {activeFilterCount > 0 && (
                        <Badge count={activeFilterCount} size="small">
                            <Button
                                icon={<FilterOutlined />}
                                onClick={onFilterPanelToggle}
                            >
                                筛选
                            </Button>
                        </Badge>
                    )}
                </Flex>

                {/* 中间: 视图切换 */}
                <Segmented
                    options={VIEW_OPTIONS.map(opt => ({
                        label: (
                            <Flex align="center" gap={4}>
                                {opt.icon}
                                <span>{opt.label}</span>
                            </Flex>
                        ),
                        value: opt.value,
                    }))}
                    value={viewType}
                    onChange={(val) => onViewChange(val as IntelViewType)}
                />

                {/* 右侧: 操作按钮 */}
                <Space>
                    <Tooltip title="刷新数据">
                        <Button icon={<ReloadOutlined />} />
                    </Tooltip>

                    <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
                        <Button icon={<DownloadOutlined />}>导出</Button>
                    </Dropdown>

                    <Tooltip title={relationPanelVisible ? '隐藏关联面板' : '显示关联面板'}>
                        <Button
                            type={relationPanelVisible ? 'primary' : 'default'}
                            icon={<LinkOutlined />}
                            onClick={onRelationPanelToggle}
                        />
                    </Tooltip>

                    <Tooltip title="设置">
                        <Button icon={<SettingOutlined />} />
                    </Tooltip>
                </Space>
            </Flex>
        </Card>
    );
};
