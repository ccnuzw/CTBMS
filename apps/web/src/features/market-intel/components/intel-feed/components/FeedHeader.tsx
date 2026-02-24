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
    Modal,
    Spin,
    message
} from 'antd';
import Markdown from 'react-markdown';
import { useDebounce } from '@/hooks/useDebounce';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import { useIntelSmartBriefing } from '../../../api/hooks';
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
    RobotOutlined,
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

    // ... (existing code)

    const [searchValue, setSearchValue] = useState(filterState.keyword || '');
    const debouncedSearchValue = useDebounce(searchValue, 600); // 600ms delays

    // AI 简报相关状态
    const [briefingModalVisible, setBriefingModalVisible] = useState(false);
    const [briefingResult, setBriefingResult] = useState<string>('');
    const { mutate: generateBriefing, isPending: isGeneratingBriefing } = useIntelSmartBriefing();
    const { containerRef, focusRef, modalProps } = useModalAutoFocus();

    // 自动触发搜索
    React.useEffect(() => {
        // 防止初始加载时的重复触发（如果在父组件已有初始值，这里相等就不会触发）
        // 或者如果需求是只有输入变了才变，这已经满足
        if (debouncedSearchValue !== filterState.keyword && (debouncedSearchValue || filterState.keyword)) {
            onFilterChange({ keyword: debouncedSearchValue || undefined });
        }
    }, [debouncedSearchValue]);

    const handleGenerateBriefing = () => {
        setBriefingModalVisible(true);
        // 如果已有结果且未改变筛选，可能不需要重新生成？这里简化为每次打开都重新生成或显示加载
        // 实际上最好有一个 "生成" 按钮在 Modal 里，或者打开 Modal 自动生成
        if (!briefingResult) {
            doGenerate();
        }
    };

    const doGenerate = () => {
        generateBriefing(
            {
                startDate: filterState.timeRange === 'CUSTOM' && filterState.customDateRange ? filterState.customDateRange[0] : undefined,
                // Converting filterState to API query format
                commodities: filterState.commodities,
                regionCodes: filterState.regions,
                limit: 20
            },
            {
                onSuccess: (data) => {
                    setBriefingResult(data.summary);
                },
                onError: () => {
                    message.error('生成简报失败');
                    setBriefingModalVisible(false);
                }
            }
        );
    };

    const handleSearch = () => {
        // 立即触发（点击按钮或回车）
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

                    <Tooltip title="AI 智能分析">
                        <Button
                            icon={<RobotOutlined />}
                            style={{
                                background: 'linear-gradient(135deg, #6253E1, #04BEFE)',
                                color: 'white',
                                border: 'none'
                            }}
                            onClick={handleGenerateBriefing}
                        >
                            生成简报
                        </Button>
                    </Tooltip>
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

            {/* AI 简报 Modal */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <RobotOutlined style={{ color: token.colorPrimary }} />
                        <span>市场动态智能简报</span>
                    </Flex>
                }
                open={briefingModalVisible}
                onCancel={() => setBriefingModalVisible(false)}
                footer={null}
                width={700}
                styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
                {...modalProps}
            >
                <div ref={containerRef}>
                    {isGeneratingBriefing ? (
                        <Flex justify="center" align="center" style={{ padding: 40 }} vertical gap={16}>
                            <Spin size="large" />
                            <Typography.Text type="secondary">正在分析最新市场情报...</Typography.Text>
                        </Flex>
                    ) : (
                        <div style={{ lineHeight: 1.6 }}>
                            {briefingResult ? (
                                <Markdown components={{
                                    h1: ({ node, ...props }) => <h3 style={{ marginTop: 16, marginBottom: 8 }} {...props} />,
                                    h2: ({ node, ...props }) => <h4 style={{ marginTop: 12, marginBottom: 8 }} {...props} />,
                                    ul: ({ node, ...props }) => <ul style={{ paddingLeft: 20 }} {...props} />,
                                    li: ({ node, ...props }) => <li style={{ marginBottom: 4 }} {...props} />,
                                }}>
                                    {briefingResult}
                                </Markdown>
                            ) : (
                                <Flex justify="center" style={{ padding: 20 }}>
                                    <Button type="primary" onClick={doGenerate} ref={focusRef}>开始生成</Button>
                                </Flex>
                            )}
                            <div style={{ marginTop: 24, textAlign: 'right' }}>
                                <Space>
                                    <Button onClick={() => setBriefingResult('')} size="small">重新生成</Button>
                                    <Button type="primary" onClick={() => setBriefingModalVisible(false)} ref={briefingResult ? focusRef : undefined}>关闭</Button>
                                </Space>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </Card >
    );
};
