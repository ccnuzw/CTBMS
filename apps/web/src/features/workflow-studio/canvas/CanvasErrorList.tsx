import React, { useRef, useState } from 'react';
import { Alert, Card, Drawer, Input, List, Typography, Badge, Button, Select, Space, Tooltip, theme, message, Segmented, Checkbox } from 'antd';
import { WarningOutlined, AimOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

const { Text } = Typography;

type ChangeSummary = {
    addedNodeIds: string[];
    removedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    updatedRuntimePolicyNodeIds: string[];
};

type ChangeDetailViewMode = 'ALL' | 'ADDED' | 'REMOVED' | 'RUNTIME';
type BatchActionScopeMode = 'ALL' | 'CURRENT_VIEW';
type ChangeDetailSectionKey =
    | 'focus-node-added'
    | 'focus-node-removed'
    | 'focus-node-runtime'
    | 'focus-edge-added'
    | 'focus-edge-removed';

export interface ValidationError {
    message: string;
    nodeId?: string;
    edgeId?: string;
    severity?: 'ERROR' | 'WARNING';
}

interface CanvasErrorListProps {
    errors: ValidationError[];
    onFocusNode?: (nodeId: string) => void;
    onFocusEdge?: (edgeId: string) => void;
    onAutoFix?: () => void;
    autoFixEnabled?: boolean;
    onStepAutoFix?: () => void;
    stepAutoFixLoading?: boolean;
    stepAutoFixEnabled?: boolean;
    stepAutoFixReport?: {
        generatedAt: string;
        finalIssueCount: number;
        steps: Array<{
            title: string;
            codes: string[];
            actions: string[];
            remainingIssueCount: number;
            changeSummary: ChangeSummary;
        }>;
    } | null;
    onClearStepAutoFixReport?: () => void;
    onPreviewAutoFix?: () => void;
    previewAutoFixLoading?: boolean;
    previewAutoFixEnabled?: boolean;
    autoFixPreview?: {
        actions: string[];
        remainingIssueCount: number;
        generatedAt: string;
        changeSummary: ChangeSummary;
    } | null;
    onClearAutoFixPreview?: () => void;
    autoFixCodeOptions?: string[];
    selectedAutoFixCodes?: string[];
    onSelectedAutoFixCodesChange?: (codes: string[]) => void;
    lastAutoFixActions?: string[];
    onClearAutoFixActions?: () => void;
}

const VALIDATION_GUIDANCE_MAP: Record<string, string> = {
    WF001: '请补齐流程基础信息（流程ID、名称、模式、节点与连线）。',
    WF002: '节点ID或连线ID重复，请修改为唯一标识。',
    WF003: '存在指向不存在节点的连线，请检查连线起点/终点。',
    WF004: '存在悬空节点，请补连线或删除无效节点。',
    WF005: '线性模式需要保持单主链路，当前链路存在分叉。',
    WF101: '辩论模式必须包含：上下文构建、辩论回合、裁判节点。',
    WF102: 'DAG 模式需包含汇聚节点（join）。',
    WF103: '审批节点后仅允许连接输出节点。',
    WF104: '发布前必须配置风险闸门（risk-gate）。',
    WF105: '当 joinPolicy=QUORUM 时，需要设置 quorumBranches 且 >= 2。',
    WF106: '请补齐运行策略（超时、重试、退避、错误策略）。',
    WF201: '数据连线类型不兼容，请调整上下游字段类型。',
    WF202: '输入绑定引用了不存在字段，请重新选择变量。',
    WF203: '表达式引用了未解析参数，请检查参数包绑定。',
    WF301: '规则包依赖未发布或不可访问，请先发布/启用规则包。',
    WF302: '参数包依赖未发布或不可访问，请先发布/启用参数包。',
    WF303: '智能体依赖未发布或未启用，请先处理智能体状态。',
};

const extractIssueCode = (message: string): string | undefined => {
    const matched = message.match(/(WF\d{3})/);
    return matched?.[1];
};

const summarizeIds = (ids: string[]): string => {
    if (ids.length === 0) {
        return '0';
    }
    if (ids.length <= 3) {
        return ids.join(', ');
    }
    return `${ids.slice(0, 3).join(', ')} 等 ${ids.length} 项`;
};

const filterIdsByKeyword = (ids: string[], keyword: string): string[] => {
    if (!keyword) {
        return ids;
    }
    return ids.filter((id) => id.toLowerCase().includes(keyword));
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BATCH_LOCATE_LIMIT = 20;
const BATCH_LOCATE_INTERVAL_MS = 180;
const NODE_SECTION_KEYS: ChangeDetailSectionKey[] = ['focus-node-added', 'focus-node-removed', 'focus-node-runtime'];
const EDGE_SECTION_KEYS: ChangeDetailSectionKey[] = ['focus-edge-added', 'focus-edge-removed'];
const ALL_SECTION_KEYS: ChangeDetailSectionKey[] = [...NODE_SECTION_KEYS, ...EDGE_SECTION_KEYS];

const getVisibleSectionKeysByViewMode = (viewMode: ChangeDetailViewMode): ChangeDetailSectionKey[] => {
    if (viewMode === 'ADDED') {
        return ['focus-node-added', 'focus-edge-added'];
    }
    if (viewMode === 'REMOVED') {
        return ['focus-node-removed', 'focus-edge-removed'];
    }
    if (viewMode === 'RUNTIME') {
        return ['focus-node-runtime'];
    }
    return ALL_SECTION_KEYS;
};

export const CanvasErrorList: React.FC<CanvasErrorListProps> = ({
    errors,
    onFocusNode,
    onFocusEdge,
    onAutoFix,
    autoFixEnabled = false,
    onStepAutoFix,
    stepAutoFixLoading = false,
    stepAutoFixEnabled = false,
    stepAutoFixReport = null,
    onClearStepAutoFixReport,
    onPreviewAutoFix,
    previewAutoFixLoading = false,
    previewAutoFixEnabled = false,
    autoFixPreview = null,
    onClearAutoFixPreview,
    autoFixCodeOptions = [],
    selectedAutoFixCodes = [],
    onSelectedAutoFixCodesChange,
    lastAutoFixActions = [],
    onClearAutoFixActions,
}) => {
    const { token } = theme.useToken();
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

    if (errors.length === 0) return null;

    const errorCount = errors.filter(e => e.severity !== 'WARNING').length;
    const warningCount = errors.length - errorCount;
    const normalizedChangeDetailKeyword = changeDetailKeyword.trim().toLowerCase();

    const filterDetailIds = (ids: string[]): string[] => filterIdsByKeyword(ids, normalizedChangeDetailKeyword);

    const renderHighlightedId = (id: string): React.ReactNode => {
        const rawKeyword = changeDetailKeyword.trim();
        if (!rawKeyword) {
            return <Text code>{id}</Text>;
        }
        const keywordRegex = new RegExp(`(${escapeRegExp(rawKeyword)})`, 'ig');
        const chunks = id.split(keywordRegex);
        return (
            <Text code>
                {chunks.map((chunk, index) => {
                    const matched = chunk.toLowerCase() === rawKeyword.toLowerCase() && rawKeyword.length > 0;
                    return matched ? (
                        <span
                            key={`${id}-${chunk}-${index}`}
                            style={{
                                backgroundColor: token.colorWarningBg,
                                color: token.colorText,
                                borderRadius: 2,
                                padding: '0 2px',
                            }}
                        >
                            {chunk}
                        </span>
                    ) : (
                        <span key={`${id}-${chunk}-${index}`}>{chunk}</span>
                    );
                })}
            </Text>
        );
    };

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

    const handleExportIds = ({
        ids,
        label,
        format,
    }: {
        ids: string[];
        label: string;
        format: 'CSV' | 'JSON';
    }): void => {
        if (ids.length === 0) {
            message.warning(`${label}无可导出项`);
            return;
        }
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            message.error('当前环境不支持导出');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedLabel = label.replace(/[^\w-]+/g, '-');
        const filename = format === 'CSV'
            ? `workflow-change-${sanitizedLabel}-${timestamp}.csv`
            : `workflow-change-${sanitizedLabel}-${timestamp}.json`;
        const content = format === 'CSV'
            ? ['id', ...ids.map((id) => `"${id.replace(/"/g, '""')}"`)].join('\n')
            : JSON.stringify({
                exportedAt: new Date().toISOString(),
                label,
                count: ids.length,
                ids,
            }, null, 2);
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

    const handleBatchLocate = async ({
        ids,
        onFocus,
        locateKey,
        label,
    }: {
        ids: string[];
        onFocus?: (id: string) => void;
        locateKey: string;
        label: string;
    }): Promise<void> => {
        if (!onFocus) {
            return;
        }
        if (ids.length === 0) {
            message.warning(`${label}无可定位项`);
            return;
        }
        if (batchLocatingByKey[locateKey]) {
            return;
        }

        const limitedIds = ids.slice(0, BATCH_LOCATE_LIMIT);
        if (ids.length > BATCH_LOCATE_LIMIT) {
            message.info(`为避免频繁跳转，已限制定位前 ${BATCH_LOCATE_LIMIT} 项（当前共 ${ids.length} 项）`);
        }

        batchLocateCancelFlagsRef.current[locateKey] = false;
        setBatchLocatingByKey((previous) => ({ ...previous, [locateKey]: true }));
        let locatedCount = 0;
        let canceled = false;
        try {
            for (let index = 0; index < limitedIds.length; index += 1) {
                if (batchLocateCancelFlagsRef.current[locateKey]) {
                    canceled = true;
                    break;
                }
                onFocus(limitedIds[index]);
                locatedCount += 1;
                if (index < limitedIds.length - 1) {
                    await new Promise<void>((resolve) => {
                        window.setTimeout(resolve, BATCH_LOCATE_INTERVAL_MS);
                    });
                }
            }
            if (canceled) {
                message.warning(`已停止定位${label}，已完成 ${locatedCount} 项`);
            } else {
                message.success(`已定位${label} ${locatedCount} 项`);
            }
        } finally {
            batchLocateCancelFlagsRef.current[locateKey] = false;
            setBatchLocatingByKey((previous) => ({ ...previous, [locateKey]: false }));
        }
    };

    const handleCancelBatchLocate = (locateKey: string, label: string): void => {
        if (!batchLocatingByKey[locateKey]) {
            return;
        }
        batchLocateCancelFlagsRef.current[locateKey] = true;
        message.info(`正在停止${label}定位`);
    };

    const handleCancelAllBatchLocate = (): void => {
        const activeLocateKeys = Object.keys(batchLocatingByKey).filter((locateKey) => batchLocatingByKey[locateKey]);
        if (activeLocateKeys.length === 0) {
            return;
        }
        activeLocateKeys.forEach((locateKey) => {
            batchLocateCancelFlagsRef.current[locateKey] = true;
        });
        message.info('正在停止全部定位');
    };

    const handleToggleChangeDetailSectionCollapsed = (sectionKey: string): void => {
        setCollapsedChangeDetailSections((previous) => ({
            ...previous,
            [sectionKey]: !previous[sectionKey],
        }));
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

    const handleToggleSectionItemSelected = ({
        sectionKey,
        id,
        selected,
    }: {
        sectionKey: ChangeDetailSectionKey;
        id: string;
        selected: boolean;
    }): void => {
        setSelectedChangeDetailIdsBySection((previous) => {
            const currentIds = previous[sectionKey] ?? [];
            if (selected) {
                if (currentIds.includes(id)) {
                    return previous;
                }
                return {
                    ...previous,
                    [sectionKey]: [...currentIds, id],
                };
            }
            const nextIds = currentIds.filter((currentId) => currentId !== id);
            return {
                ...previous,
                [sectionKey]: nextIds,
            };
        });
    };

    const handleSelectAllFilteredInSection = (sectionKey: ChangeDetailSectionKey, ids: string[]): void => {
        if (ids.length === 0) {
            return;
        }
        setSelectedChangeDetailIdsBySection((previous) => {
            const currentIds = previous[sectionKey] ?? [];
            const mergedIds = Array.from(new Set([...currentIds, ...ids]));
            return {
                ...previous,
                [sectionKey]: mergedIds,
            };
        });
    };

    const handleInvertFilteredInSection = (sectionKey: ChangeDetailSectionKey, ids: string[]): void => {
        if (ids.length === 0) {
            return;
        }
        setSelectedChangeDetailIdsBySection((previous) => {
            const currentIds = previous[sectionKey] ?? [];
            const currentIdSet = new Set(currentIds);
            ids.forEach((id) => {
                if (currentIdSet.has(id)) {
                    currentIdSet.delete(id);
                } else {
                    currentIdSet.add(id);
                }
            });
            return {
                ...previous,
                [sectionKey]: Array.from(currentIdSet),
            };
        });
    };

    const handleSelectAllFilteredInSections = (
        sectionKeys: ChangeDetailSectionKey[],
        filteredIdsBySection: Record<ChangeDetailSectionKey, string[]>,
    ): void => {
        if (sectionKeys.length === 0) {
            return;
        }
        setSelectedChangeDetailIdsBySection((previous) => {
            const next = { ...previous };
            sectionKeys.forEach((sectionKey) => {
                const filteredIds = filteredIdsBySection[sectionKey];
                if (filteredIds.length === 0) {
                    return;
                }
                next[sectionKey] = Array.from(new Set([...(next[sectionKey] ?? []), ...filteredIds]));
            });
            return next;
        });
    };

    const handleInvertFilteredInSections = (
        sectionKeys: ChangeDetailSectionKey[],
        filteredIdsBySection: Record<ChangeDetailSectionKey, string[]>,
    ): void => {
        if (sectionKeys.length === 0) {
            return;
        }
        setSelectedChangeDetailIdsBySection((previous) => {
            const next = { ...previous };
            sectionKeys.forEach((sectionKey) => {
                const filteredIds = filteredIdsBySection[sectionKey];
                if (filteredIds.length === 0) {
                    return;
                }
                const currentIdSet = new Set(next[sectionKey] ?? []);
                filteredIds.forEach((id) => {
                    if (currentIdSet.has(id)) {
                        currentIdSet.delete(id);
                    } else {
                        currentIdSet.add(id);
                    }
                });
                next[sectionKey] = Array.from(currentIdSet);
            });
            return next;
        });
    };

    const handleClearSectionSelection = (sectionKey: ChangeDetailSectionKey): void => {
        setSelectedChangeDetailIdsBySection((previous) => ({
            ...previous,
            [sectionKey]: [],
        }));
    };

    const handleClearSelectionInSections = (sectionKeys: ChangeDetailSectionKey[]): void => {
        if (sectionKeys.length === 0) {
            return;
        }
        setSelectedChangeDetailIdsBySection((previous) => {
            const next = { ...previous };
            sectionKeys.forEach((sectionKey) => {
                next[sectionKey] = [];
            });
            return next;
        });
    };

    const renderChangeDetailSection = ({
        title,
        ids,
        onFocus,
        focusActionKeyPrefix,
    }: {
        title: string;
        ids: string[];
        onFocus?: (id: string) => void;
        focusActionKeyPrefix: ChangeDetailSectionKey;
    }): React.ReactNode => {
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
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            筛选 {filteredIds.length} / 总 {ids.length}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            已选 {selectedIds.length}
                        </Text>
                    </Space>
                    <Space size={0}>
                        <Button
                            size="small"
                            type="link"
                            onClick={() => handleToggleChangeDetailSectionCollapsed(focusActionKeyPrefix)}
                        >
                            {collapsed ? '展开' : '收起'}
                        </Button>
                        <Tooltip title={locateFirstDisabled ? locateDisabledReason : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={locateFirstDisabled}
                                    onClick={() => {
                                        if (onFocus && firstFilteredId) {
                                            onFocus(firstFilteredId);
                                        }
                                    }}
                                >
                                    定位首个
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={locateAllDisabled ? locateDisabledReason : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    loading={locatingAll}
                                    disabled={locateAllDisabled}
                                    onClick={() => {
                                        void handleBatchLocate({
                                            ids: filteredIds,
                                            onFocus,
                                            locateKey: focusActionKeyPrefix,
                                            label: `${title}ID`,
                                        });
                                    }}
                                >
                                    定位全部
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={locateSelectedDisabled ? locateSelectedDisabledReason : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={locateSelectedDisabled}
                                    onClick={() => {
                                        void handleBatchLocate({
                                            ids: selectedIds,
                                            onFocus,
                                            locateKey: `${focusActionKeyPrefix}-selected`,
                                            label: `${title}已选ID`,
                                        });
                                    }}
                                >
                                    定位已选
                                </Button>
                            </span>
                        </Tooltip>
                        {onFocus && batchLocatingByKey[`${focusActionKeyPrefix}-selected`] ? (
                            <Button
                                size="small"
                                type="link"
                                onClick={() => handleCancelBatchLocate(`${focusActionKeyPrefix}-selected`, `${title}已选ID`)}
                            >
                                停止已选
                            </Button>
                        ) : null}
                        {onFocus && locatingAll ? (
                            <Button
                                size="small"
                                type="link"
                                onClick={() => handleCancelBatchLocate(focusActionKeyPrefix, `${title}ID`)}
                            >
                                停止
                            </Button>
                        ) : null}
                        <Tooltip title={copyDisabled ? '当前筛选无可复制项' : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={copyDisabled}
                                    onClick={() => {
                                        void handleCopyIds(filteredIds, `${title}ID`);
                                    }}
                                >
                                    复制本组
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={copySelectedDisabled ? '当前分组无已选项' : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={copySelectedDisabled}
                                    onClick={() => {
                                        void handleCopyIds(selectedIds, `${title}已选ID`);
                                    }}
                                >
                                    复制已选
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={selectingAllDisabled ? '当前筛选无可选项' : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={selectingAllDisabled}
                                    onClick={() => handleSelectAllFilteredInSection(focusActionKeyPrefix, filteredIds)}
                                >
                                    全选筛选
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={invertSelectingDisabled ? '当前筛选无可选项' : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={invertSelectingDisabled}
                                    onClick={() => handleInvertFilteredInSection(focusActionKeyPrefix, filteredIds)}
                                >
                                    反选筛选
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={clearSelectedDisabled ? '当前分组无已选项' : undefined}>
                            <span>
                                <Button
                                    size="small"
                                    type="link"
                                    disabled={clearSelectedDisabled}
                                    onClick={() => handleClearSectionSelection(focusActionKeyPrefix)}
                                >
                                    清空已选
                                </Button>
                            </span>
                        </Tooltip>
                    </Space>
                </div>
                {!collapsed ? (
                    <List
                        size="small"
                        bordered
                        dataSource={filteredIds}
                        locale={{ emptyText: '无' }}
                        renderItem={(item) => {
                            const actions: React.ReactNode[] = [
                                <Tooltip key={`locate-tip-${focusActionKeyPrefix}-${item}`} title={onFocus ? undefined : '当前场景不支持定位'}>
                                    <span>
                                        <Button
                                            key={`${focusActionKeyPrefix}-${item}`}
                                            size="small"
                                            type="link"
                                            disabled={!onFocus}
                                            onClick={() => onFocus?.(item)}
                                        >
                                            定位
                                        </Button>
                                    </span>
                                </Tooltip>,
                                <Button
                                    key={`copy-${focusActionKeyPrefix}-${item}`}
                                    size="small"
                                    type="link"
                                    onClick={() => {
                                        void handleCopyIds([item], `${title}ID`);
                                    }}
                                >
                                    复制
                                </Button>,
                            ];
                            return (
                                <List.Item actions={actions}>
                                    <Space size={8}>
                                        <Checkbox
                                            checked={selectedIdSet.has(item)}
                                            onChange={(event) => {
                                                handleToggleSectionItemSelected({
                                                    sectionKey: focusActionKeyPrefix,
                                                    id: item,
                                                    selected: event.target.checked,
                                                });
                                            }}
                                        />
                                        {renderHighlightedId(item)}
                                    </Space>
                                </List.Item>
                            );
                        }}
                    />
                ) : null}
            </>
        );
    };

    const filteredIdsBySection: Record<ChangeDetailSectionKey, string[]> = {
        'focus-node-added': changeDetail ? filterDetailIds(changeDetail.summary.addedNodeIds) : [],
        'focus-edge-added': changeDetail ? filterDetailIds(changeDetail.summary.addedEdgeIds) : [],
        'focus-node-removed': changeDetail ? filterDetailIds(changeDetail.summary.removedNodeIds) : [],
        'focus-edge-removed': changeDetail ? filterDetailIds(changeDetail.summary.removedEdgeIds) : [],
        'focus-node-runtime': changeDetail ? filterDetailIds(changeDetail.summary.updatedRuntimePolicyNodeIds) : [],
    };
    const selectedIdsBySection: Record<ChangeDetailSectionKey, string[]> = {
        'focus-node-added': selectedChangeDetailIdsBySection['focus-node-added'] ?? [],
        'focus-edge-added': selectedChangeDetailIdsBySection['focus-edge-added'] ?? [],
        'focus-node-removed': selectedChangeDetailIdsBySection['focus-node-removed'] ?? [],
        'focus-edge-removed': selectedChangeDetailIdsBySection['focus-edge-removed'] ?? [],
        'focus-node-runtime': selectedChangeDetailIdsBySection['focus-node-runtime'] ?? [],
    };
    const showAddedSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'ADDED';
    const showRemovedSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'REMOVED';
    const showRuntimeSections = changeDetailViewMode === 'ALL' || changeDetailViewMode === 'RUNTIME';
    const visibleSectionKeys = getVisibleSectionKeysByViewMode(changeDetailViewMode);
    const scopeSectionKeys = batchActionScopeMode === 'CURRENT_VIEW' ? visibleSectionKeys : ALL_SECTION_KEYS;

    const scopedFilteredNodeChangeDetailIds = Array.from(new Set(
        scopeSectionKeys
            .filter((sectionKey) => NODE_SECTION_KEYS.includes(sectionKey))
            .flatMap((sectionKey) => filteredIdsBySection[sectionKey]),
    ));
    const scopedFilteredEdgeChangeDetailIds = Array.from(new Set(
        scopeSectionKeys
            .filter((sectionKey) => EDGE_SECTION_KEYS.includes(sectionKey))
            .flatMap((sectionKey) => filteredIdsBySection[sectionKey]),
    ));
    const scopedFilteredAllChangeDetailIds = Array.from(new Set([
        ...scopedFilteredNodeChangeDetailIds,
        ...scopedFilteredEdgeChangeDetailIds,
    ]));

    const selectedNodeChangeDetailIds = Array.from(new Set(
        NODE_SECTION_KEYS.flatMap((sectionKey) => selectedIdsBySection[sectionKey]),
    ));
    const selectedEdgeChangeDetailIds = Array.from(new Set(
        EDGE_SECTION_KEYS.flatMap((sectionKey) => selectedIdsBySection[sectionKey]),
    ));
    const selectedAllChangeDetailIds = Array.from(new Set([
        ...selectedNodeChangeDetailIds,
        ...selectedEdgeChangeDetailIds,
    ]));
    const scopedSelectedNodeChangeDetailIds = Array.from(new Set(
        scopeSectionKeys
            .filter((sectionKey) => NODE_SECTION_KEYS.includes(sectionKey))
            .flatMap((sectionKey) => selectedIdsBySection[sectionKey]),
    ));
    const scopedSelectedEdgeChangeDetailIds = Array.from(new Set(
        scopeSectionKeys
            .filter((sectionKey) => EDGE_SECTION_KEYS.includes(sectionKey))
            .flatMap((sectionKey) => selectedIdsBySection[sectionKey]),
    ));
    const scopedSelectedAllChangeDetailIds = Array.from(new Set([
        ...scopedSelectedNodeChangeDetailIds,
        ...scopedSelectedEdgeChangeDetailIds,
    ]));
    const batchScopeLabel = batchActionScopeMode === 'CURRENT_VIEW' ? '当前视图' : '全部视图';
    const hasScopedFilteredIds = scopedFilteredAllChangeDetailIds.length > 0;
    const hasScopedSelectedIds = scopedSelectedAllChangeDetailIds.length > 0;

    return (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320 }}>
            {expanded ? (
                <Card
                    size="small"
                    title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Badge count={errors.length} showZero={false}>
                                    <WarningOutlined style={{ color: token.colorError, fontSize: 16 }} />
                                </Badge>
                                <span style={{ marginLeft: 8 }}>校验问题</span>
                            </div>
                            <Button
                                type="text"
                                size="small"
                                icon={<UpOutlined />}
                                onClick={() => setExpanded(false)}
                            />
                        </div>
                    }
                    extra={onAutoFix || onPreviewAutoFix || onStepAutoFix ? (
                        <Space size={6}>
                            {onPreviewAutoFix ? (
                                <Button
                                    size="small"
                                    loading={previewAutoFixLoading}
                                    disabled={!previewAutoFixEnabled}
                                    onClick={onPreviewAutoFix}
                                >
                                    预览修复
                                </Button>
                            ) : null}
                            {onStepAutoFix ? (
                                <Button
                                    size="small"
                                    loading={stepAutoFixLoading}
                                    disabled={!stepAutoFixEnabled}
                                    onClick={onStepAutoFix}
                                >
                                    分步修复
                                </Button>
                            ) : null}
                            {onAutoFix ? (
                                <Button
                                    size="small"
                                    type="primary"
                                    disabled={!autoFixEnabled}
                                    onClick={onAutoFix}
                                >
                                    一键修复
                                </Button>
                            ) : null}
                        </Space>
                    ) : null}
                    bodyStyle={{ padding: 0, maxHeight: 400, overflowY: 'auto' }}
                    style={{ boxShadow: token.boxShadowSecondary }}
                >
                    {autoFixCodeOptions.length > 0 ? (
                        <div style={{ padding: 8, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                修复范围
                            </Text>
                            <Select
                                mode="multiple"
                                size="small"
                                style={{ width: '100%', marginTop: 4 }}
                                value={selectedAutoFixCodes}
                                onChange={(codes) => onSelectedAutoFixCodesChange?.(codes)}
                                placeholder="选择要修复的问题码"
                                options={autoFixCodeOptions.map((code) => ({ label: code, value: code }))}
                            />
                        </div>
                    ) : null}
                    {stepAutoFixReport ? (
                        <Alert
                            type={stepAutoFixReport.finalIssueCount === 0 ? 'success' : 'info'}
                            showIcon
                            message={
                                stepAutoFixReport.finalIssueCount === 0
                                    ? `分步修复完成（${stepAutoFixReport.steps.length} 步），当前无剩余问题`
                                    : `分步修复完成（${stepAutoFixReport.steps.length} 步），剩余 ${stepAutoFixReport.finalIssueCount} 项问题`
                            }
                            style={{ margin: 8 }}
                            action={
                                <Space size={0}>
                                    {onClearStepAutoFixReport ? (
                                        <Button size="small" type="link" onClick={onClearStepAutoFixReport}>
                                            清除记录
                                        </Button>
                                    ) : null}
                                </Space>
                            }
                            description={(
                                <Space direction="vertical" size={2}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        生成时间: {stepAutoFixReport.generatedAt}
                                    </Text>
                                    {stepAutoFixReport.steps.map((step, index) => (
                                        <Text key={`${step.title}-${index}`} type="secondary" style={{ fontSize: 12 }}>
                                            {index + 1}. {step.title} ({step.codes.join(', ')})，执行 {step.actions.length} 项，
                                            剩余 {step.remainingIssueCount} 项
                                        </Text>
                                    ))}
                                    {stepAutoFixReport.steps.map((step, index) => (
                                        <Space key={`${step.title}-${index}-delta`} size={0} wrap>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                变更: 节点 +{step.changeSummary.addedNodeIds.length}/-{step.changeSummary.removedNodeIds.length}，
                                                连线 +{step.changeSummary.addedEdgeIds.length}/-{step.changeSummary.removedEdgeIds.length}，
                                                策略更新 {step.changeSummary.updatedRuntimePolicyNodeIds.length}
                                            </Text>
                                            <Button
                                                size="small"
                                                type="link"
                                                onClick={() => {
                                                    setChangeDetail({
                                                        title: `${step.title} 变更详情`,
                                                        summary: step.changeSummary,
                                                    });
                                                    setChangeDetailKeyword('');
                                                    setChangeDetailViewMode('ALL');
                                                    setBatchActionScopeMode('ALL');
                                                    setSelectedChangeDetailIdsBySection({});
                                                }}
                                            >
                                                查看详情
                                            </Button>
                                        </Space>
                                    ))}
                                </Space>
                            )}
                        />
                    ) : null}
                    {autoFixPreview ? (
                        <Alert
                            type={autoFixPreview.remainingIssueCount === 0 ? 'success' : 'info'}
                            showIcon
                            message={
                                autoFixPreview.remainingIssueCount === 0
                                    ? '预览结果：应用后预计无剩余问题'
                                    : `预览结果：应用后预计剩余 ${autoFixPreview.remainingIssueCount} 项问题`
                            }
                            style={{ margin: 8 }}
                            action={
                                <Space size={0}>
                                    <Button
                                        size="small"
                                        type="link"
                                        onClick={() => {
                                            if (autoFixPreview) {
                                                setChangeDetail({
                                                    title: '预览修复变更详情',
                                                    summary: autoFixPreview.changeSummary,
                                                });
                                                setChangeDetailKeyword('');
                                                setChangeDetailViewMode('ALL');
                                                setBatchActionScopeMode('ALL');
                                                setSelectedChangeDetailIdsBySection({});
                                            }
                                        }}
                                    >
                                        查看详情
                                    </Button>
                                    {onClearAutoFixPreview ? (
                                        <Button size="small" type="link" onClick={onClearAutoFixPreview}>
                                            清除预览
                                        </Button>
                                    ) : null}
                                </Space>
                            }
                            description={(
                                <Space direction="vertical" size={2}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        生成时间: {autoFixPreview.generatedAt}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        变更: 节点 +{autoFixPreview.changeSummary.addedNodeIds.length}/-{autoFixPreview.changeSummary.removedNodeIds.length}，
                                        连线 +{autoFixPreview.changeSummary.addedEdgeIds.length}/-{autoFixPreview.changeSummary.removedEdgeIds.length}，
                                        策略更新 {autoFixPreview.changeSummary.updatedRuntimePolicyNodeIds.length}
                                    </Text>
                                    {autoFixPreview.changeSummary.addedNodeIds.length > 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            新增节点: {summarizeIds(autoFixPreview.changeSummary.addedNodeIds)}
                                        </Text>
                                    ) : null}
                                    {autoFixPreview.changeSummary.removedNodeIds.length > 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            删除节点: {summarizeIds(autoFixPreview.changeSummary.removedNodeIds)}
                                        </Text>
                                    ) : null}
                                    {autoFixPreview.changeSummary.addedEdgeIds.length > 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            新增连线: {summarizeIds(autoFixPreview.changeSummary.addedEdgeIds)}
                                        </Text>
                                    ) : null}
                                    {autoFixPreview.changeSummary.removedEdgeIds.length > 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            删除连线: {summarizeIds(autoFixPreview.changeSummary.removedEdgeIds)}
                                        </Text>
                                    ) : null}
                                    {autoFixPreview.actions.map((action, index) => (
                                        <Text key={`${action}-${index}`} type="secondary" style={{ fontSize: 12 }}>
                                            {index + 1}. {action}
                                        </Text>
                                    ))}
                                </Space>
                            )}
                        />
                    ) : null}
                    {lastAutoFixActions.length > 0 ? (
                        <Alert
                            type="success"
                            showIcon
                            message={`最近已自动修复 ${lastAutoFixActions.length} 项`}
                            style={{ margin: 8 }}
                            action={onClearAutoFixActions ? (
                                <Button size="small" type="link" onClick={onClearAutoFixActions}>
                                    清除记录
                                </Button>
                            ) : null}
                            description={(
                                <Space direction="vertical" size={2}>
                                    {lastAutoFixActions.map((action, index) => (
                                        <Text key={`${action}-${index}`} type="secondary" style={{ fontSize: 12 }}>
                                            {action}
                                        </Text>
                                    ))}
                                </Space>
                            )}
                        />
                    ) : null}
                    <List
                        size="small"
                        dataSource={errors}
                        renderItem={(item) => {
                            const issueCode = extractIssueCode(item.message);
                            const guidance = issueCode ? VALIDATION_GUIDANCE_MAP[issueCode] : undefined;
                            return (
                                <List.Item
                                    actions={[
                                        (item.nodeId || item.edgeId) && (
                                            <Tooltip title="定位到画布">
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<AimOutlined />}
                                                    onClick={() => {
                                                        if (item.nodeId) onFocusNode?.(item.nodeId);
                                                        else if (item.edgeId) onFocusEdge?.(item.edgeId);
                                                    }}
                                                />
                                            </Tooltip>
                                        )
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={
                                            <WarningOutlined
                                                style={{ color: item.severity === 'WARNING' ? token.colorWarning : token.colorError }}
                                            />
                                        }
                                        title={
                                            <Text style={{ fontSize: 13 }}>
                                                {item.nodeId ? `节点: ${item.nodeId}` : (item.edgeId ? `连线: ${item.edgeId}` : '全局问题')}
                                                {issueCode ? (
                                                    <Text type="secondary" style={{ marginLeft: 6 }}>
                                                        ({issueCode})
                                                    </Text>
                                                ) : null}
                                            </Text>
                                        }
                                        description={(
                                            <Space direction="vertical" size={2}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {item.message}
                                                </Text>
                                                {guidance ? (
                                                    <Text style={{ fontSize: 12, color: token.colorInfo }}>
                                                        修复建议: {guidance}
                                                    </Text>
                                                ) : null}
                                            </Space>
                                        )}
                                    />
                                </List.Item>
                            );
                        }}
                    />
                </Card>
            ) : (
                <Card
                    size="small"
                    bodyStyle={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpanded(true)}
                    style={{ boxShadow: token.boxShadowSecondary }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge count={errors.length} />
                        <span style={{ fontWeight: 500 }}>
                            校验问题
                            <Text type="secondary" style={{ marginLeft: 6 }}>
                                {errorCount}错 / {warningCount}警告
                            </Text>
                        </span>
                    </div>
                    <DownOutlined />
                </Card>
            )}
            <Drawer
                width={560}
                title={changeDetail?.title || '变更详情'}
                open={Boolean(changeDetail)}
                onClose={() => {
                    handleCancelAllBatchLocate();
                    setChangeDetail(null);
                    setChangeDetailKeyword('');
                    setChangeDetailViewMode('ALL');
                    setBatchActionScopeMode('ALL');
                    setSelectedChangeDetailIdsBySection({});
                }}
                destroyOnClose
            >
                {changeDetail ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Alert
                            type="info"
                            showIcon
                            message={`节点 +${changeDetail.summary.addedNodeIds.length}/-${changeDetail.summary.removedNodeIds.length}，连线 +${changeDetail.summary.addedEdgeIds.length}/-${changeDetail.summary.removedEdgeIds.length}，策略更新 ${changeDetail.summary.updatedRuntimePolicyNodeIds.length}`}
                        />
                        <div
                            style={{
                                position: 'sticky',
                                top: -8,
                                zIndex: 2,
                                paddingBottom: 8,
                                background: token.colorBgElevated,
                                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                        >
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Input
                                    size="small"
                                    allowClear
                                    placeholder="按 ID 关键字筛选"
                                    value={changeDetailKeyword}
                                    onChange={(event) => setChangeDetailKeyword(event.target.value)}
                                />
                                <Segmented
                                    size="small"
                                    block
                                    value={changeDetailViewMode}
                                    onChange={(value) => setChangeDetailViewMode(value as ChangeDetailViewMode)}
                                    options={[
                                        { label: '全部', value: 'ALL' },
                                        { label: '新增', value: 'ADDED' },
                                        { label: '删除', value: 'REMOVED' },
                                        { label: '策略', value: 'RUNTIME' },
                                    ]}
                                />
                                <Segmented
                                    size="small"
                                    block
                                    value={batchActionScopeMode}
                                    onChange={(value) => setBatchActionScopeMode(value as BatchActionScopeMode)}
                                    options={[
                                        { label: '批处理: 全部视图', value: 'ALL' },
                                        { label: '批处理: 仅当前视图', value: 'CURRENT_VIEW' },
                                    ]}
                                />
                                <Space size={8} wrap>
                                    <Tooltip
                                        title={
                                            !onFocusNode
                                                ? '当前场景不支持节点定位'
                                                : scopedFilteredNodeChangeDetailIds.length === 0
                                                    ? `当前${batchScopeLabel}无可定位节点`
                                                    : undefined
                                        }
                                    >
                                        <span>
                                            <Button
                                                size="small"
                                                loading={Boolean(batchLocatingByKey.allFilteredNodes)}
                                                onClick={() => {
                                                    void handleBatchLocate({
                                                        ids: scopedFilteredNodeChangeDetailIds,
                                                        onFocus: onFocusNode,
                                                        locateKey: 'allFilteredNodes',
                                                        label: `${batchScopeLabel}筛选节点`,
                                                    });
                                                }}
                                                disabled={!onFocusNode || scopedFilteredNodeChangeDetailIds.length === 0}
                                            >
                                                定位筛选节点
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {batchLocatingByKey.allFilteredNodes ? (
                                        <Button
                                            size="small"
                                            onClick={() => handleCancelBatchLocate('allFilteredNodes', '筛选节点')}
                                        >
                                            停止节点定位
                                        </Button>
                                    ) : null}
                                    <Tooltip
                                        title={
                                            !onFocusEdge
                                                ? '当前场景不支持连线定位'
                                                : scopedFilteredEdgeChangeDetailIds.length === 0
                                                    ? `当前${batchScopeLabel}无可定位连线`
                                                    : undefined
                                        }
                                    >
                                        <span>
                                            <Button
                                                size="small"
                                                loading={Boolean(batchLocatingByKey.allFilteredEdges)}
                                                onClick={() => {
                                                    void handleBatchLocate({
                                                        ids: scopedFilteredEdgeChangeDetailIds,
                                                        onFocus: onFocusEdge,
                                                        locateKey: 'allFilteredEdges',
                                                        label: `${batchScopeLabel}筛选连线`,
                                                    });
                                                }}
                                                disabled={!onFocusEdge || scopedFilteredEdgeChangeDetailIds.length === 0}
                                            >
                                                定位筛选连线
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {batchLocatingByKey.allFilteredEdges ? (
                                        <Button
                                            size="small"
                                            onClick={() => handleCancelBatchLocate('allFilteredEdges', '筛选连线')}
                                        >
                                            停止连线定位
                                        </Button>
                                    ) : null}
                                    <Tooltip
                                        title={
                                            !onFocusNode
                                                ? '当前场景不支持节点定位'
                                                : scopedSelectedNodeChangeDetailIds.length === 0
                                                    ? `当前${batchScopeLabel}无已选节点`
                                                    : undefined
                                        }
                                    >
                                        <span>
                                            <Button
                                                size="small"
                                                loading={Boolean(batchLocatingByKey.selectedNodes)}
                                                onClick={() => {
                                                    void handleBatchLocate({
                                                        ids: scopedSelectedNodeChangeDetailIds,
                                                        onFocus: onFocusNode,
                                                        locateKey: 'selectedNodes',
                                                        label: `${batchScopeLabel}已选节点`,
                                                    });
                                                }}
                                                disabled={!onFocusNode || scopedSelectedNodeChangeDetailIds.length === 0}
                                            >
                                                定位已选节点
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {batchLocatingByKey.selectedNodes ? (
                                        <Button
                                            size="small"
                                            onClick={() => handleCancelBatchLocate('selectedNodes', '已选节点')}
                                        >
                                            停止已选节点
                                        </Button>
                                    ) : null}
                                    <Tooltip
                                        title={
                                            !onFocusEdge
                                                ? '当前场景不支持连线定位'
                                                : scopedSelectedEdgeChangeDetailIds.length === 0
                                                    ? `当前${batchScopeLabel}无已选连线`
                                                    : undefined
                                        }
                                    >
                                        <span>
                                            <Button
                                                size="small"
                                                loading={Boolean(batchLocatingByKey.selectedEdges)}
                                                onClick={() => {
                                                    void handleBatchLocate({
                                                        ids: scopedSelectedEdgeChangeDetailIds,
                                                        onFocus: onFocusEdge,
                                                        locateKey: 'selectedEdges',
                                                        label: `${batchScopeLabel}已选连线`,
                                                    });
                                                }}
                                                disabled={!onFocusEdge || scopedSelectedEdgeChangeDetailIds.length === 0}
                                            >
                                                定位已选连线
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {batchLocatingByKey.selectedEdges ? (
                                        <Button
                                            size="small"
                                            onClick={() => handleCancelBatchLocate('selectedEdges', '已选连线')}
                                        >
                                            停止已选连线
                                        </Button>
                                    ) : null}
                                    <Tooltip title={scopedFilteredAllChangeDetailIds.length === 0 ? `当前${batchScopeLabel}无可复制项` : undefined}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    void handleCopyIds(scopedFilteredAllChangeDetailIds, `${batchScopeLabel}筛选结果ID`);
                                                }}
                                                disabled={scopedFilteredAllChangeDetailIds.length === 0}
                                            >
                                                复制筛选结果
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={scopedFilteredAllChangeDetailIds.length === 0 ? `当前${batchScopeLabel}无可导出项` : undefined}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    handleExportIds({
                                                        ids: scopedFilteredAllChangeDetailIds,
                                                        label: `${batchScopeLabel}-filtered`,
                                                        format: 'CSV',
                                                    });
                                                }}
                                                disabled={scopedFilteredAllChangeDetailIds.length === 0}
                                            >
                                                导出筛选CSV
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={scopedSelectedAllChangeDetailIds.length === 0 ? `当前${batchScopeLabel}无已选项` : undefined}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    void handleCopyIds(scopedSelectedAllChangeDetailIds, `${batchScopeLabel}已选结果ID`);
                                                }}
                                                disabled={scopedSelectedAllChangeDetailIds.length === 0}
                                            >
                                                复制已选结果
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={scopedSelectedAllChangeDetailIds.length === 0 ? `当前${batchScopeLabel}无可导出项` : undefined}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    handleExportIds({
                                                        ids: scopedSelectedAllChangeDetailIds,
                                                        label: `${batchScopeLabel}-selected`,
                                                        format: 'JSON',
                                                    });
                                                }}
                                                disabled={scopedSelectedAllChangeDetailIds.length === 0}
                                            >
                                                导出已选JSON
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={hasScopedFilteredIds ? undefined : `当前${batchScopeLabel}无可选项`}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => handleSelectAllFilteredInSections(scopeSectionKeys, filteredIdsBySection)}
                                                disabled={!hasScopedFilteredIds}
                                            >
                                                全选筛选
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={hasScopedFilteredIds ? undefined : `当前${batchScopeLabel}无可选项`}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => handleInvertFilteredInSections(scopeSectionKeys, filteredIdsBySection)}
                                                disabled={!hasScopedFilteredIds}
                                            >
                                                反选筛选
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={hasScopedSelectedIds ? undefined : `当前${batchScopeLabel}无已选项`}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={() => handleClearSelectionInSections(scopeSectionKeys)}
                                                disabled={!hasScopedSelectedIds}
                                            >
                                                清空已选
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Button
                                        size="small"
                                        onClick={() => handleSetAllChangeDetailSectionsCollapsed(true)}
                                    >
                                        收起全部分组
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() => handleSetAllChangeDetailSectionsCollapsed(false)}
                                    >
                                        展开全部分组
                                    </Button>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        作用域({batchScopeLabel})筛选: 节点 {scopedFilteredNodeChangeDetailIds.length}，连线 {scopedFilteredEdgeChangeDetailIds.length}，合计 {scopedFilteredAllChangeDetailIds.length}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        作用域({batchScopeLabel})已选: 节点 {scopedSelectedNodeChangeDetailIds.length}，连线 {scopedSelectedEdgeChangeDetailIds.length}，合计 {scopedSelectedAllChangeDetailIds.length}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        全量已选: 节点 {selectedNodeChangeDetailIds.length}，连线 {selectedEdgeChangeDetailIds.length}，合计 {selectedAllChangeDetailIds.length}
                                    </Text>
                                </Space>
                            </Space>
                        </div>
                        {showAddedSections ? renderChangeDetailSection({
                            title: '新增节点',
                            ids: changeDetail.summary.addedNodeIds,
                            onFocus: onFocusNode,
                            focusActionKeyPrefix: 'focus-node-added',
                        }) : null}
                        {showAddedSections ? renderChangeDetailSection({
                            title: '新增连线',
                            ids: changeDetail.summary.addedEdgeIds,
                            onFocus: onFocusEdge,
                            focusActionKeyPrefix: 'focus-edge-added',
                        }) : null}
                        {showRemovedSections ? renderChangeDetailSection({
                            title: '删除节点',
                            ids: changeDetail.summary.removedNodeIds,
                            onFocus: onFocusNode,
                            focusActionKeyPrefix: 'focus-node-removed',
                        }) : null}
                        {showRemovedSections ? renderChangeDetailSection({
                            title: '删除连线',
                            ids: changeDetail.summary.removedEdgeIds,
                            onFocus: onFocusEdge,
                            focusActionKeyPrefix: 'focus-edge-removed',
                        }) : null}
                        {showRuntimeSections ? renderChangeDetailSection({
                            title: '运行策略更新节点',
                            ids: changeDetail.summary.updatedRuntimePolicyNodeIds,
                            onFocus: onFocusNode,
                            focusActionKeyPrefix: 'focus-node-runtime',
                        }) : null}
                    </Space>
                ) : null}
            </Drawer>
        </div>
    );
};
