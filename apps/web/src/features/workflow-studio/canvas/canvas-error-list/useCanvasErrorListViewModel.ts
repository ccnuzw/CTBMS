import { useState, useRef, useMemo } from 'react';
import { message } from 'antd';
import {
    ChangeSummary, ChangeDetailViewMode, BatchActionScopeMode, ChangeDetailSectionKey,
    ValidationError
} from './types';
import {
    filterIdsByKeyword, BATCH_LOCATE_LIMIT, BATCH_LOCATE_INTERVAL_MS,
    getVisibleSectionKeysByViewMode, NODE_SECTION_KEYS, EDGE_SECTION_KEYS, ALL_SECTION_KEYS,
} from './utils';

export const useCanvasErrorListViewModel = (
    errors: ValidationError[],
    onFocusNode?: (nodeId: string) => void,
    onFocusEdge?: (edgeId: string) => void
) => {
    const [expanded, setExpanded] = useState(true);
    const [changeDetail, setChangeDetail] = useState<{
        title: string;
        summary: ChangeSummary;
    } | null>(null);
    const [changeDetailKeyword, setChangeDetailKeyword] = useState('');
    const [changeDetailViewMode, setChangeDetailViewMode] = useState<ChangeDetailViewMode>('ALL');
    const [batchActionScopeMode, setBatchActionScopeMode] = useState<BatchActionScopeMode>('ALL');
    const [batchLocatingByKey, setBatchLocatingByKey] = useState<Record<string, boolean>>({});
    const [collapsedChangeDetailSections, setCollapsedChangeDetailSections] = useState<Record<string, boolean>>({});
    const [selectedChangeDetailIdsBySection, setSelectedChangeDetailIdsBySection] = useState<Record<string, string[]>>({});
    const batchLocateCancelFlagsRef = useRef<Record<string, boolean>>({});

    const errorCount = useMemo(() => errors.filter(e => e.severity !== 'WARNING').length, [errors]);
    const warningCount = useMemo(() => errors.length - errorCount, [errors, errorCount]);

    const handleCopyIds = async (ids: string[], label: string): Promise<void> => {
        if (ids.length === 0) {
            message.warning(`${label}无可复制项`);
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            message.error('当前环境不支持剪贴板复制');
            return;
        }
        try {
            await navigator.clipboard.writeText(ids.join('\n'));
            message.success(`已复制${label}（${ids.length} 项）`);
        } catch (error) {
            message.error('复制失败，请检查浏览器剪贴板权限');
        }
    };

    const handleExportIds = ({ ids, label, format }: { ids: string[]; label: string; format: 'CSV' | 'JSON' }): void => {
        if (ids.length === 0) {
            message.warning(`${label}无可导出项`);
            return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedLabel = label.replace(/[^\w-]+/g, '-');
        const filename = format === 'CSV' ? `workflow-change-${sanitizedLabel}-${timestamp}.csv` : `workflow-change-${sanitizedLabel}-${timestamp}.json`;
        const content = format === 'CSV'
            ? ['id', ...ids.map((id) => `"${id.replace(/"/g, '""')}"`)].join('\n')
            : JSON.stringify({ exportedAt: new Date().toISOString(), label, count: ids.length, ids }, null, 2);

        const blob = new Blob([content], { type: format === 'CSV' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
        message.success(`已导出${label}（${ids.length} 项）`);
    };

    const handleBatchLocate = async ({ ids, onFocus, locateKey, label }: { ids: string[]; onFocus?: (id: string) => void; locateKey: string; label: string }): Promise<void> => {
        if (!onFocus) return;
        if (ids.length === 0) {
            message.warning(`${label}无可定位项`);
            return;
        }
        if (batchLocatingByKey[locateKey]) return;

        const limitedIds = ids.slice(0, BATCH_LOCATE_LIMIT);
        if (ids.length > BATCH_LOCATE_LIMIT) {
            message.info(`为避免频繁跳转，已限制定位前 ${BATCH_LOCATE_LIMIT} 项（当前共 ${ids.length} 项）`);
        }

        batchLocateCancelFlagsRef.current[locateKey] = false;
        setBatchLocatingByKey((prev) => ({ ...prev, [locateKey]: true }));

        let locatedCount = 0;
        let canceled = false;
        try {
            for (let i = 0; i < limitedIds.length; i++) {
                if (batchLocateCancelFlagsRef.current[locateKey]) {
                    canceled = true;
                    break;
                }
                onFocus(limitedIds[i]);
                locatedCount++;
                if (i < limitedIds.length - 1) {
                    await new Promise<void>((r) => window.setTimeout(r, BATCH_LOCATE_INTERVAL_MS));
                }
            }
            if (canceled) message.warning(`已停止定位${label}，已完成 ${locatedCount} 项`);
            else message.success(`已定位${label} ${locatedCount} 项`);
        } finally {
            batchLocateCancelFlagsRef.current[locateKey] = false;
            setBatchLocatingByKey((prev) => ({ ...prev, [locateKey]: false }));
        }
    };

    const handleCancelBatchLocate = (locateKey: string, label: string): void => {
        if (!batchLocatingByKey[locateKey]) return;
        batchLocateCancelFlagsRef.current[locateKey] = true;
        message.info(`正在停止${label}定位`);
    };

    const handleCancelAllBatchLocate = (): void => {
        const activeKeys = Object.keys(batchLocatingByKey).filter((k) => batchLocatingByKey[k]);
        if (!activeKeys.length) return;
        activeKeys.forEach((k) => { batchLocateCancelFlagsRef.current[k] = true; });
        message.info('正在停止全部定位');
    };

    const handleToggleChangeDetailSectionCollapsed = (sectionKey: string): void => {
        setCollapsedChangeDetailSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
    };

    const handleSetAllChangeDetailSectionsCollapsed = (collapsed: boolean): void => {
        setCollapsedChangeDetailSections({
            'focus-node-added': collapsed,
            'focus-edge-added': collapsed,
            'focus-node-removed': collapsed,
            'focus-edge-removed': collapsed,
            'focus-node-runtime': collapsed,
        });
    };

    const handleToggleSectionItemSelected = ({ sectionKey, id, selected }: { sectionKey: ChangeDetailSectionKey; id: string; selected: boolean }): void => {
        setSelectedChangeDetailIdsBySection((prev) => {
            const currentIds = prev[sectionKey] ?? [];
            if (selected && !currentIds.includes(id)) return { ...prev, [sectionKey]: [...currentIds, id] };
            if (!selected) return { ...prev, [sectionKey]: currentIds.filter((c) => c !== id) };
            return prev;
        });
    };

    const handleSelectAllFilteredInSection = (sectionKey: ChangeDetailSectionKey, ids: string[]): void => {
        if (!ids.length) return;
        setSelectedChangeDetailIdsBySection((prev) => {
            const currentIds = prev[sectionKey] ?? [];
            return { ...prev, [sectionKey]: Array.from(new Set([...currentIds, ...ids])) };
        });
    };

    const handleInvertFilteredInSection = (sectionKey: ChangeDetailSectionKey, ids: string[]): void => {
        if (!ids.length) return;
        setSelectedChangeDetailIdsBySection((prev) => {
            const currentIdSet = new Set(prev[sectionKey] ?? []);
            ids.forEach((id) => currentIdSet.has(id) ? currentIdSet.delete(id) : currentIdSet.add(id));
            return { ...prev, [sectionKey]: Array.from(currentIdSet) };
        });
    };

    const handleSelectAllFilteredInSections = (sectionKeys: ChangeDetailSectionKey[], filteredIdsBySection: Record<ChangeDetailSectionKey, string[]>): void => {
        if (!sectionKeys.length) return;
        setSelectedChangeDetailIdsBySection((prev) => {
            const next = { ...prev };
            sectionKeys.forEach((key) => {
                if (filteredIdsBySection[key].length) {
                    next[key] = Array.from(new Set([...(next[key] ?? []), ...filteredIdsBySection[key]]));
                }
            });
            return next;
        });
    };

    const handleInvertFilteredInSections = (sectionKeys: ChangeDetailSectionKey[], filteredIdsBySection: Record<ChangeDetailSectionKey, string[]>): void => {
        if (!sectionKeys.length) return;
        setSelectedChangeDetailIdsBySection((prev) => {
            const next = { ...prev };
            sectionKeys.forEach((key) => {
                if (filteredIdsBySection[key].length) {
                    const idSet = new Set(next[key] ?? []);
                    filteredIdsBySection[key].forEach((id) => idSet.has(id) ? idSet.delete(id) : idSet.add(id));
                    next[key] = Array.from(idSet);
                }
            });
            return next;
        });
    };

    const handleClearSectionSelection = (sectionKey: ChangeDetailSectionKey): void => {
        setSelectedChangeDetailIdsBySection((prev) => ({ ...prev, [sectionKey]: [] }));
    };

    const handleClearSelectionInSections = (sectionKeys: ChangeDetailSectionKey[]): void => {
        if (!sectionKeys.length) return;
        setSelectedChangeDetailIdsBySection((prev) => {
            const next = { ...prev };
            sectionKeys.forEach((k) => { next[k] = []; });
            return next;
        });
    };

    const openChangeDetail = (title: string, summary: ChangeSummary) => {
        setChangeDetail({ title, summary });
        setChangeDetailKeyword('');
        setChangeDetailViewMode('ALL');
        setBatchActionScopeMode('ALL');
        setSelectedChangeDetailIdsBySection({});
    };

    const closeChangeDetail = () => {
        handleCancelAllBatchLocate();
        setChangeDetail(null);
        setChangeDetailKeyword('');
        setChangeDetailViewMode('ALL');
        setBatchActionScopeMode('ALL');
        setSelectedChangeDetailIdsBySection({});
    };

    const normalizedKeyword = changeDetailKeyword.trim().toLowerCase();
    const filterDetailIds = (ids: string[]) => filterIdsByKeyword(ids, normalizedKeyword);

    const filteredIdsBySection: Record<ChangeDetailSectionKey, string[]> = useMemo(() => ({
        'focus-node-added': changeDetail ? filterDetailIds(changeDetail.summary.addedNodeIds) : [],
        'focus-edge-added': changeDetail ? filterDetailIds(changeDetail.summary.addedEdgeIds) : [],
        'focus-node-removed': changeDetail ? filterDetailIds(changeDetail.summary.removedNodeIds) : [],
        'focus-edge-removed': changeDetail ? filterDetailIds(changeDetail.summary.removedEdgeIds) : [],
        'focus-node-runtime': changeDetail ? filterDetailIds(changeDetail.summary.updatedRuntimePolicyNodeIds) : [],
    }), [changeDetail, normalizedKeyword]);

    const visibleSectionKeys = useMemo(() => getVisibleSectionKeysByViewMode(changeDetailViewMode), [changeDetailViewMode]);
    const scopeSectionKeys = batchActionScopeMode === 'CURRENT_VIEW' ? visibleSectionKeys : ALL_SECTION_KEYS;

    const computeScopedFilteredIds = (keys: ChangeDetailSectionKey[], sectionGroup: ChangeDetailSectionKey[]) =>
        Array.from(new Set(keys.filter((k) => sectionGroup.includes(k)).flatMap((k) => filteredIdsBySection[k])));

    const computeSelectedIds = (keys: ChangeDetailSectionKey[], sectionGroup: ChangeDetailSectionKey[], sources: Record<string, string[]>) =>
        Array.from(new Set(keys.filter((k) => sectionGroup.includes(k)).flatMap((k) => sources[k] ?? [])));

    const scopedFilteredNodeIds = computeScopedFilteredIds(scopeSectionKeys, NODE_SECTION_KEYS);
    const scopedFilteredEdgeIds = computeScopedFilteredIds(scopeSectionKeys, EDGE_SECTION_KEYS);
    const scopedFilteredAllIds = Array.from(new Set([...scopedFilteredNodeIds, ...scopedFilteredEdgeIds]));

    const selectedNodeIds = computeSelectedIds(NODE_SECTION_KEYS, NODE_SECTION_KEYS, selectedChangeDetailIdsBySection);
    const selectedEdgeIds = computeSelectedIds(EDGE_SECTION_KEYS, EDGE_SECTION_KEYS, selectedChangeDetailIdsBySection);
    const selectedAllIds = Array.from(new Set([...selectedNodeIds, ...selectedEdgeIds]));

    const scopedSelectedNodeIds = computeSelectedIds(scopeSectionKeys, NODE_SECTION_KEYS, selectedChangeDetailIdsBySection);
    const scopedSelectedEdgeIds = computeSelectedIds(scopeSectionKeys, EDGE_SECTION_KEYS, selectedChangeDetailIdsBySection);
    const scopedSelectedAllIds = Array.from(new Set([...scopedSelectedNodeIds, ...scopedSelectedEdgeIds]));

    return {
        state: {
            expanded, changeDetail, changeDetailKeyword, changeDetailViewMode, batchActionScopeMode,
            batchLocatingByKey, collapsedChangeDetailSections, selectedChangeDetailIdsBySection,
            errorCount, warningCount,
            filteredIdsBySection, visibleSectionKeys, scopeSectionKeys,
            scopedFilteredNodeIds, scopedFilteredEdgeIds, scopedFilteredAllIds,
            selectedNodeIds, selectedEdgeIds, selectedAllIds,
            scopedSelectedNodeIds, scopedSelectedEdgeIds, scopedSelectedAllIds,
            normalizedKeyword,
        },
        actions: {
            setExpanded, openChangeDetail, closeChangeDetail, setChangeDetailKeyword, setChangeDetailViewMode,
            setBatchActionScopeMode, handleCopyIds, handleExportIds, handleBatchLocate, handleCancelBatchLocate,
            handleCancelAllBatchLocate, handleToggleChangeDetailSectionCollapsed, handleSetAllChangeDetailSectionsCollapsed,
            handleToggleSectionItemSelected, handleSelectAllFilteredInSection, handleInvertFilteredInSection,
            handleSelectAllFilteredInSections, handleInvertFilteredInSections, handleClearSectionSelection,
            handleClearSelectionInSections, filterDetailIds
        }
    };
};
