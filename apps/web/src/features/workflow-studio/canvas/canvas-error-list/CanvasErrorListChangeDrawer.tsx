import React from 'react';
import { Drawer, Space, Alert, Input, Segmented, Tooltip, Button, Typography, Checkbox, List, theme } from 'antd';
import { useCanvasErrorListViewModel } from './useCanvasErrorListViewModel';
import { escapeRegExp } from './utils';
import { ChangeDetailSectionKey, ChangeDetailViewMode, BatchActionScopeMode } from './types';

const { Text } = Typography;

interface Props {
    viewModel: ReturnType<typeof useCanvasErrorListViewModel>;
    onFocusNode?: (nodeId: string) => void;
    onFocusEdge?: (edgeId: string) => void;
}

export const CanvasErrorListChangeDrawer: React.FC<Props> = ({ viewModel, onFocusNode, onFocusEdge }) => {
    const { token } = theme.useToken();
    const {
        state: {
            changeDetail, changeDetailKeyword, changeDetailViewMode, batchActionScopeMode,
            batchLocatingByKey, collapsedChangeDetailSections, selectedChangeDetailIdsBySection,
            filteredIdsBySection, scopeSectionKeys,
            scopedFilteredNodeIds, scopedFilteredEdgeIds, scopedFilteredAllIds,
            selectedNodeIds, selectedEdgeIds, selectedAllIds,
            scopedSelectedNodeIds, scopedSelectedEdgeIds, scopedSelectedAllIds,
            normalizedKeyword
        },
        actions: {
            closeChangeDetail, setChangeDetailKeyword, setChangeDetailViewMode,
            setBatchActionScopeMode, handleCopyIds, handleExportIds, handleBatchLocate, handleCancelBatchLocate,
            handleToggleChangeDetailSectionCollapsed, handleSetAllChangeDetailSectionsCollapsed,
            handleToggleSectionItemSelected, handleSelectAllFilteredInSection, handleInvertFilteredInSection,
            handleSelectAllFilteredInSections, handleInvertFilteredInSections, handleClearSectionSelection,
            handleClearSelectionInSections, filterDetailIds
        }
    } = viewModel;

    const renderHighlightedId = (id: string): React.ReactNode => {
        const rawKeyword = changeDetailKeyword.trim();
        if (!rawKeyword) return <Text code>{id}</Text>;
        const keywordRegex = new RegExp(`(${escapeRegExp(rawKeyword)})`, 'ig');
        const chunks = id.split(keywordRegex);
        return (
            <Text code>
                {chunks.map((chunk, index) => {
                    const matched = chunk.toLowerCase() === rawKeyword.toLowerCase() && rawKeyword.length > 0;
                    return matched ? (
                        <span key={`${id}-${chunk}-${index}`} style={{ backgroundColor: token.colorWarningBg, color: token.colorText, borderRadius: 2, padding: '0 2px' }}>
                            {chunk}
                        </span>
                    ) : <span key={`${id}-${chunk}-${index}`}>{chunk}</span>;
                })}
            </Text>
        );
    };

    const renderChangeDetailSection = (title: string, ids: string[], onFocus: ((id: string) => void) | undefined, focusActionKeyPrefix: ChangeDetailSectionKey): React.ReactNode => {
        const filteredIds = filterDetailIds(ids);
        const firstFilteredId = filteredIds[0];
        const locatingAll = Boolean(batchLocatingByKey[focusActionKeyPrefix]);
        const collapsed = Boolean(collapsedChangeDetailSections[focusActionKeyPrefix]);
        const selectedIds = (selectedChangeDetailIdsBySection[focusActionKeyPrefix] ?? []).filter((id) => ids.includes(id));
        const selectedIdSet = new Set(selectedIds);

        const locateDisabledReason = !onFocus ? '当前场景不支持定位' : '当前筛选无可定位项';
        const locateFirstDisabled = !onFocus || !firstFilteredId;
        const locateAllDisabled = !onFocus || filteredIds.length === 0;
        const copyDisabled = filteredIds.length === 0;
        const locateSelectedDisabled = !onFocus || selectedIds.length === 0;
        const locateSelectedDisabledReason = !onFocus ? '当前场景不支持定位' : '当前分组无已选项';
        const copySelectedDisabled = selectedIds.length === 0;
        const selectingAllDisabled = filteredIds.length === 0;
        const invertSelectingDisabled = filteredIds.length === 0;
        const clearSelectedDisabled = selectedIds.length === 0;

        return (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={4}>
                        <Text strong>{title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>筛选 {filteredIds.length} / 总 {ids.length}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedIds.length}</Text>
                    </Space>
                    <Space size={0}>
                        <Button size="small" type="link" onClick={() => handleToggleChangeDetailSectionCollapsed(focusActionKeyPrefix)}>{collapsed ? '展开' : '收起'}</Button>
                        <Tooltip title={locateFirstDisabled ? locateDisabledReason : undefined}>
                            <span><Button size="small" type="link" disabled={locateFirstDisabled} onClick={() => { if (onFocus && firstFilteredId) onFocus(firstFilteredId); }}>定位首个</Button></span>
                        </Tooltip>
                        <Tooltip title={locateAllDisabled ? locateDisabledReason : undefined}>
                            <span><Button size="small" type="link" loading={locatingAll} disabled={locateAllDisabled} onClick={() => handleBatchLocate({ ids: filteredIds, onFocus, locateKey: focusActionKeyPrefix, label: `${title}ID` })}>定位全部</Button></span>
                        </Tooltip>
                        <Tooltip title={locateSelectedDisabled ? locateSelectedDisabledReason : undefined}>
                            <span><Button size="small" type="link" disabled={locateSelectedDisabled} onClick={() => handleBatchLocate({ ids: selectedIds, onFocus, locateKey: `${focusActionKeyPrefix}-selected`, label: `${title}已选ID` })}>定位已选</Button></span>
                        </Tooltip>
                        {onFocus && batchLocatingByKey[`${focusActionKeyPrefix}-selected`] ? <Button size="small" type="link" onClick={() => handleCancelBatchLocate(`${focusActionKeyPrefix}-selected`, `${title}已选ID`)}>停止已选</Button> : null}
                        {onFocus && locatingAll ? <Button size="small" type="link" onClick={() => handleCancelBatchLocate(focusActionKeyPrefix, `${title}ID`)}>停止</Button> : null}
                        <Tooltip title={copyDisabled ? '当前筛选无可复制项' : undefined}><span><Button size="small" type="link" disabled={copyDisabled} onClick={() => handleCopyIds(filteredIds, `${title}ID`)}>复制本组</Button></span></Tooltip>
                        <Tooltip title={copySelectedDisabled ? '当前分组无已选项' : undefined}><span><Button size="small" type="link" disabled={copySelectedDisabled} onClick={() => handleCopyIds(selectedIds, `${title}已选ID`)}>复制已选</Button></span></Tooltip>
                        <Tooltip title={selectingAllDisabled ? '当前筛选无可选项' : undefined}><span><Button size="small" type="link" disabled={selectingAllDisabled} onClick={() => handleSelectAllFilteredInSection(focusActionKeyPrefix, filteredIds)}>全选筛选</Button></span></Tooltip>
                        <Tooltip title={invertSelectingDisabled ? '当前筛选无可选项' : undefined}><span><Button size="small" type="link" disabled={invertSelectingDisabled} onClick={() => handleInvertFilteredInSection(focusActionKeyPrefix, filteredIds)}>反选筛选</Button></span></Tooltip>
                        <Tooltip title={clearSelectedDisabled ? '当前分组无已选项' : undefined}><span><Button size="small" type="link" disabled={clearSelectedDisabled} onClick={() => handleClearSectionSelection(focusActionKeyPrefix)}>清空已选</Button></span></Tooltip>
                    </Space>
                </div>
                {!collapsed && (
                    <List
                        size="small" bordered dataSource={filteredIds} locale={{ emptyText: '无' }}
                        renderItem={(item) => (
                            <List.Item actions={[
                                <Tooltip key={`locate-tip-${focusActionKeyPrefix}-${item}`} title={onFocus ? undefined : '当前场景不支持定位'}>
                                    <span><Button size="small" type="link" disabled={!onFocus} onClick={() => onFocus?.(item)}>定位</Button></span>
                                </Tooltip>,
                                <Button key={`copy-${focusActionKeyPrefix}-${item}`} size="small" type="link" onClick={() => handleCopyIds([item], `${title}ID`)}>复制</Button>
                            ]}>
                                <Space size={8}>
                                    <Checkbox checked={selectedIdSet.has(item)} onChange={(e) => handleToggleSectionItemSelected({ sectionKey: focusActionKeyPrefix, id: item, selected: e.target.checked })} />
                                    {renderHighlightedId(item)}
                                </Space>
                            </List.Item>
                        )}
                    />
                )}
            </>
        );
    };

    const showAddedSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'ADDED';
    const showRemovedSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'REMOVED';
    const showRuntimeSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'RUNTIME';
    const batchScopeLabel = batchActionScopeMode === 'CURRENT_VIEW' ? '当前视图' : '全部视图';

    return (
        <Drawer width={560} title={changeDetail?.title || '变更详情'} open={Boolean(changeDetail)} onClose={closeChangeDetail} destroyOnClose>
            {changeDetail && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Alert type="info" showIcon message={`节点 +${changeDetail.summary.addedNodeIds.length}/-${changeDetail.summary.removedNodeIds.length}，连线 +${changeDetail.summary.addedEdgeIds.length}/-${changeDetail.summary.removedEdgeIds.length}，策略更新 ${changeDetail.summary.updatedRuntimePolicyNodeIds.length}`} />
                    <div style={{ position: 'sticky', top: -8, zIndex: 2, paddingBottom: 8, background: token.colorBgElevated, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <Input size="small" allowClear placeholder="按 ID 关键字筛选" value={changeDetailKeyword} onChange={(e) => setChangeDetailKeyword(e.target.value)} />
                            <Segmented size="small" block value={changeDetailViewMode} onChange={(v) => setChangeDetailViewMode(v as ChangeDetailViewMode)} options={[{ label: '全部', value: 'ALL' }, { label: '新增', value: 'ADDED' }, { label: '删除', value: 'REMOVED' }, { label: '策略', value: 'RUNTIME' }]} />
                            <Segmented size="small" block value={batchActionScopeMode} onChange={(v) => setBatchActionScopeMode(v as BatchActionScopeMode)} options={[{ label: '批处理: 全部视图', value: 'ALL' }, { label: '批处理: 仅当前视图', value: 'CURRENT_VIEW' }]} />
                            <Space size={8} wrap>
                                <Tooltip title={!onFocusNode ? '当前场景不支持节点定位' : scopedFilteredNodeIds.length === 0 ? `当前${batchScopeLabel}无可定位节点` : undefined}>
                                    <span><Button size="small" loading={Boolean(batchLocatingByKey.allFilteredNodes)} disabled={!onFocusNode || scopedFilteredNodeIds.length === 0} onClick={() => handleBatchLocate({ ids: scopedFilteredNodeIds, onFocus: onFocusNode, locateKey: 'allFilteredNodes', label: `${batchScopeLabel}筛选节点` })}>定位筛选节点</Button></span>
                                </Tooltip>
                                {batchLocatingByKey.allFilteredNodes && <Button size="small" onClick={() => handleCancelBatchLocate('allFilteredNodes', '筛选节点')}>停止节点定位</Button>}

                                <Tooltip title={!onFocusEdge ? '当前场景不支持连线定位' : scopedFilteredEdgeIds.length === 0 ? `当前${batchScopeLabel}无可定位连线` : undefined}>
                                    <span><Button size="small" loading={Boolean(batchLocatingByKey.allFilteredEdges)} disabled={!onFocusEdge || scopedFilteredEdgeIds.length === 0} onClick={() => handleBatchLocate({ ids: scopedFilteredEdgeIds, onFocus: onFocusEdge, locateKey: 'allFilteredEdges', label: `${batchScopeLabel}筛选连线` })}>定位筛选连线</Button></span>
                                </Tooltip>
                                {batchLocatingByKey.allFilteredEdges && <Button size="small" onClick={() => handleCancelBatchLocate('allFilteredEdges', '筛选连线')}>停止连线定位</Button>}

                                <Tooltip title={!onFocusNode ? '当前场景不支持节点定位' : scopedSelectedNodeIds.length === 0 ? `当前${batchScopeLabel}无已选节点` : undefined}>
                                    <span><Button size="small" loading={Boolean(batchLocatingByKey.selectedNodes)} disabled={!onFocusNode || scopedSelectedNodeIds.length === 0} onClick={() => handleBatchLocate({ ids: scopedSelectedNodeIds, onFocus: onFocusNode, locateKey: 'selectedNodes', label: `${batchScopeLabel}已选节点` })}>定位已选节点</Button></span>
                                </Tooltip>
                                {batchLocatingByKey.selectedNodes && <Button size="small" onClick={() => handleCancelBatchLocate('selectedNodes', '已选节点')}>停止已选节点</Button>}

                                <Tooltip title={!onFocusEdge ? '当前场景不支持连线定位' : scopedSelectedEdgeIds.length === 0 ? `当前${batchScopeLabel}无已选连线` : undefined}>
                                    <span><Button size="small" loading={Boolean(batchLocatingByKey.selectedEdges)} disabled={!onFocusEdge || scopedSelectedEdgeIds.length === 0} onClick={() => handleBatchLocate({ ids: scopedSelectedEdgeIds, onFocus: onFocusEdge, locateKey: 'selectedEdges', label: `${batchScopeLabel}已选连线` })}>定位已选连线</Button></span>
                                </Tooltip>
                                {batchLocatingByKey.selectedEdges && <Button size="small" onClick={() => handleCancelBatchLocate('selectedEdges', '已选连线')}>停止已选连线</Button>}

                                <Tooltip title={scopedFilteredAllIds.length === 0 ? `当前${batchScopeLabel}无可复制项` : undefined}>
                                    <span><Button size="small" disabled={scopedFilteredAllIds.length === 0} onClick={() => handleCopyIds(scopedFilteredAllIds, `${batchScopeLabel}筛选结果ID`)}>复制筛选结果</Button></span>
                                </Tooltip>
                                <Tooltip title={scopedFilteredAllIds.length === 0 ? `当前${batchScopeLabel}无可导出项` : undefined}>
                                    <span><Button size="small" disabled={scopedFilteredAllIds.length === 0} onClick={() => handleExportIds({ ids: scopedFilteredAllIds, label: `${batchScopeLabel}-filtered`, format: 'CSV' })}>导出筛选CSV</Button></span>
                                </Tooltip>

                                <Tooltip title={scopedSelectedAllIds.length === 0 ? `当前${batchScopeLabel}无已选项` : undefined}>
                                    <span><Button size="small" disabled={scopedSelectedAllIds.length === 0} onClick={() => handleCopyIds(scopedSelectedAllIds, `${batchScopeLabel}已选结果ID`)}>复制已选结果</Button></span>
                                </Tooltip>
                                <Tooltip title={scopedSelectedAllIds.length === 0 ? `当前${batchScopeLabel}无可导出项` : undefined}>
                                    <span><Button size="small" disabled={scopedSelectedAllIds.length === 0} onClick={() => handleExportIds({ ids: scopedSelectedAllIds, label: `${batchScopeLabel}-selected`, format: 'JSON' })}>导出已选JSON</Button></span>
                                </Tooltip>

                                <Tooltip title={scopedFilteredAllIds.length > 0 ? undefined : `当前${batchScopeLabel}无可选项`}>
                                    <span><Button size="small" disabled={scopedFilteredAllIds.length === 0} onClick={() => handleSelectAllFilteredInSections(scopeSectionKeys, filteredIdsBySection)}>全选筛选</Button></span>
                                </Tooltip>
                                <Tooltip title={scopedFilteredAllIds.length > 0 ? undefined : `当前${batchScopeLabel}无可选项`}>
                                    <span><Button size="small" disabled={scopedFilteredAllIds.length === 0} onClick={() => handleInvertFilteredInSections(scopeSectionKeys, filteredIdsBySection)}>反选筛选</Button></span>
                                </Tooltip>
                                <Tooltip title={scopedSelectedAllIds.length > 0 ? undefined : `当前${batchScopeLabel}无已选项`}>
                                    <span><Button size="small" disabled={scopedSelectedAllIds.length === 0} onClick={() => handleClearSelectionInSections(scopeSectionKeys)}>清空已选</Button></span>
                                </Tooltip>

                                <Button size="small" onClick={() => handleSetAllChangeDetailSectionsCollapsed(true)}>收起全部分组</Button>
                                <Button size="small" onClick={() => handleSetAllChangeDetailSectionsCollapsed(false)}>展开全部分组</Button>

                                <Text type="secondary" style={{ fontSize: 12 }}>作用域({batchScopeLabel})筛选: 节点 {scopedFilteredNodeIds.length}，连线 {scopedFilteredEdgeIds.length}，合计 {scopedFilteredAllIds.length}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>作用域({batchScopeLabel})已选: 节点 {scopedSelectedNodeIds.length}，连线 {scopedSelectedEdgeIds.length}，合计 {scopedSelectedAllIds.length}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>全量已选: 节点 {selectedNodeIds.length}，连线 {selectedEdgeIds.length}，合计 {selectedAllIds.length}</Text>
                            </Space>
                        </Space>
                    </div>

                    {showAddedSections && renderChangeDetailSection('新增节点', changeDetail.summary.addedNodeIds, onFocusNode, 'focus-node-added')}
                    {showAddedSections && renderChangeDetailSection('新增连线', changeDetail.summary.addedEdgeIds, onFocusEdge, 'focus-edge-added')}
                    {showRemovedSections && renderChangeDetailSection('删除节点', changeDetail.summary.removedNodeIds, onFocusNode, 'focus-node-removed')}
                    {showRemovedSections && renderChangeDetailSection('删除连线', changeDetail.summary.removedEdgeIds, onFocusEdge, 'focus-edge-removed')}
                    {showRuntimeSections && renderChangeDetailSection('运行策略更新节点', changeDetail.summary.updatedRuntimePolicyNodeIds, onFocusNode, 'focus-node-runtime')}
                </Space>
            )}
        </Drawer>
    );
};
