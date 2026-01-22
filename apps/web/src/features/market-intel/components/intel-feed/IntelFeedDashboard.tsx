import React, { useState, useCallback } from 'react';
import { Flex, theme, Spin, Drawer } from 'antd';
import { FeedHeader } from './components/FeedHeader';
import { AdvancedFilter } from './components/AdvancedFilter';
import { RelationPanel } from './components/RelationPanel';
import { StatsBar } from './components/StatsBar';
import { FeedView } from './components/views/FeedView';
import { DashboardView } from './components/views/DashboardView';
import { TimelineView } from './components/views/TimelineView';
import { TableView } from './components/views/TableView';
import { IntelViewType, IntelFilterState, DEFAULT_FILTER_STATE, IntelItem } from './types';

export const IntelFeedDashboard: React.FC = () => {
    const { token } = theme.useToken();

    // 状态管理
    const [viewType, setViewType] = useState<IntelViewType>('FEED');
    const [filterState, setFilterState] = useState<IntelFilterState>(DEFAULT_FILTER_STATE);
    const [filterPanelVisible, setFilterPanelVisible] = useState(true);
    const [relationDrawerVisible, setRelationDrawerVisible] = useState(false);
    const [selectedIntel, setSelectedIntel] = useState<IntelItem | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // 处理筛选变更
    const handleFilterChange = useCallback((newFilter: Partial<IntelFilterState>) => {
        setFilterState(prev => ({ ...prev, ...newFilter }));
    }, []);

    // 处理情报选中 - 选中时自动打开关联抽屉
    const handleIntelSelect = useCallback((intel: IntelItem | null) => {
        setSelectedIntel(intel);
        if (intel) {
            setRelationDrawerVisible(true);
        }
    }, []);

    // 渲染当前视图
    const renderView = () => {
        const viewProps = {
            filterState,
            onIntelSelect: handleIntelSelect,
            selectedIntelId: selectedIntel?.id,
        };

        switch (viewType) {
            case 'FEED':
                return <FeedView {...viewProps} />;
            case 'DASHBOARD':
                return <DashboardView {...viewProps} />;
            case 'TIMELINE':
                return <TimelineView {...viewProps} />;
            case 'TABLE':
                return <TableView {...viewProps} />;
            default:
                return <FeedView {...viewProps} />;
        }
    };

    return (
        <Flex vertical style={{ height: '100%', overflow: 'hidden', background: token.colorBgLayout }}>
            {/* 顶部控制栏 */}
            <FeedHeader
                viewType={viewType}
                onViewChange={setViewType}
                filterState={filterState}
                onFilterChange={handleFilterChange}
                filterPanelVisible={filterPanelVisible}
                onFilterPanelToggle={() => setFilterPanelVisible(!filterPanelVisible)}
                relationPanelVisible={relationDrawerVisible}
                onRelationPanelToggle={() => setRelationDrawerVisible(!relationDrawerVisible)}
            />

            {/* 主工作区 */}
            <Flex style={{ flex: 1, overflow: 'hidden' }}>
                {/* 左侧筛选面板 */}
                {filterPanelVisible && (
                    <AdvancedFilter
                        filterState={filterState}
                        onChange={handleFilterChange}
                        onClose={() => setFilterPanelVisible(false)}
                    />
                )}

                {/* 中央内容区 */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: viewType === 'DASHBOARD' ? 0 : 16,
                        background: token.colorBgLayout,
                    }}
                >
                    {isLoading ? (
                        <Flex justify="center" align="center" style={{ height: '100%' }}>
                            <Spin size="large" tip="加载中..." />
                        </Flex>
                    ) : (
                        renderView()
                    )}
                </div>
            </Flex>

            {/* 底部统计栏 */}
            <StatsBar filterState={filterState} />

            {/* 右侧关联面板抽屉 - 点击后弹出 */}
            <Drawer
                title="🔗 关联分析"
                placement="right"
                width={400}
                open={relationDrawerVisible}
                onClose={() => setRelationDrawerVisible(false)}
                styles={{ body: { padding: 0 } }}
            >
                <RelationPanel
                    selectedIntel={selectedIntel}
                    onClose={() => setRelationDrawerVisible(false)}
                    onIntelSelect={handleIntelSelect}
                />
            </Drawer>
        </Flex>
    );
};

export default IntelFeedDashboard;

