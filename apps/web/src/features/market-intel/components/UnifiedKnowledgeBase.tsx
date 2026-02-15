import React, { useState, useMemo } from 'react';
import {
    Card,
    Typography,
    Input,
    Button,
    Flex,
    Space,
    theme,
    Segmented,
    Grid,
    Empty,
    message,
    Pagination,
} from 'antd';
import {
    SearchOutlined,
    FileTextOutlined,
    FileSearchOutlined,
    ThunderboltOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    DeleteOutlined,
    StarFilled,
    TagsOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMarketIntels, useBatchDeleteMarketIntel, useResearchReports, useBatchUpdateTags, useBatchDeleteResearchReports } from '../api/hooks';
import { useGenerateWeeklyRollup } from '../api/knowledge-hooks';
import { IntelCategory, IntelSourceType } from '@packages/types';
import { FilterPanel, TimeRange } from './knowledge-base/FilterPanel';
import { DocumentCardView, DocItem } from './knowledge-base/DocumentCardView';
import { DocumentListView } from './knowledge-base/DocumentListView';
import { DocumentPreviewDrawer } from './knowledge-base/DocumentPreviewDrawer';
import { BatchTagModal } from './knowledge-base/BatchTagModal';
import { useFavoritesStore } from '../stores/useFavoritesStore';

const { Title, Text } = Typography;

type ContentType = 'all' | 'documents' | 'reports' | 'favorites';

const normalizeTag = (tag: string) => tag.replace(/^#/, '').trim();

export const UnifiedKnowledgeBase: React.FC = () => {
    const { token } = theme.useToken();
    const screens = Grid.useBreakpoint();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const parseContentType = (value: string | null): ContentType => {
        if (value === 'documents' || value === 'reports' || value === 'favorites' || value === 'all') {
            return value;
        }
        return 'all';
    };

    const parseTimeRange = (value: string | null): TimeRange => {
        if (value === '1M' || value === '3M' || value === '6M' || value === 'YTD' || value === 'ALL') {
            return value;
        }
        return 'ALL';
    };

    const searchTerm = searchParams.get('q') || '';
    const timeRange = parseTimeRange(searchParams.get('range'));
    const contentType = parseContentType(searchParams.get('content'));
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
    const [filterCollapsed, setFilterCollapsed] = useState(false);
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
    const [batchTagModalOpen, setBatchTagModalOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const batchDeleteMutation = useBatchDeleteMarketIntel();
    const batchDeleteReportsMutation = useBatchDeleteResearchReports();
    const batchUpdateTagsMutation = useBatchUpdateTags();
    const weeklyRollupMutation = useGenerateWeeklyRollup();

    // Calculate time range
    const dateRange = useMemo(() => {
        const now = new Date();
        const startDate = new Date();

        switch (timeRange) {
            case '1M':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case 'YTD':
                startDate.setMonth(0);
                startDate.setDate(1);
                break;
            case 'ALL':
                startDate.setFullYear(2000);
                break;
        }

        return { startDate, endDate: now };
    }, [timeRange]);

    const updateParams = (updater: (params: URLSearchParams) => void) => {
        const next = new URLSearchParams(searchParams);
        updater(next);
        next.set('tab', 'library');
        if (next.toString() !== searchParams.toString()) {
            setSearchParams(next, { replace: true });
        }
    };

    // Reset selection & paging when filters change
    React.useEffect(() => {
        setSelectedDocIds(new Set());
        setPage(1);
    }, [contentType, searchTerm, timeRange, selectedSources, selectedTags]);

    const queryPageSize = contentType === 'all' || contentType === 'favorites' ? pageSize * 2 : pageSize;

    // API calls (server-side pagination)
    const { data: intelsResult, isLoading: docsLoading } = useMarketIntels({
        category: IntelCategory.C_DOCUMENT,
        page,
        pageSize: queryPageSize,
        keyword: searchTerm || undefined,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        sourceTypes: selectedSources.size > 0 ? (Array.from(selectedSources) as IntelSourceType[]) : undefined,
    });

    const { data: reportsResult, isLoading: reportsLoading } = useResearchReports({
        page,
        pageSize: queryPageSize,
        keyword: searchTerm || undefined,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        // 显示所有研报，不限制审核状态
    });

    const isLoading = docsLoading || reportsLoading;

    // Transform documents
    const allDocs: DocItem[] = useMemo(() => {
        return (intelsResult?.data || []).map((intel) => ({
            id: intel.id,
            category: intel.category,
            sourceType: intel.sourceType,
            rawContent: intel.rawContent,
            summary: intel.summary || null,
            aiAnalysis: intel.aiAnalysis || {},
            effectiveTime: intel.effectiveTime as unknown as string,
            author: intel.author || null,
            attachments: (intel as any).attachments || [],
            itemType: 'document' as const,
        }));
    }, [intelsResult]);

    // Transform reports to doc-like items for unified display
    const allReports: DocItem[] = useMemo(() => {
        return (reportsResult?.data || []).map((report) => ({
            id: report.id,
            category: 'REPORT' as any,
            sourceType: report.source || 'INTERNAL',
            rawContent: report.title || '',
            summary: report.summary || null,
            aiAnalysis: { tags: report.commodities || [] },
            effectiveTime: String(report.publishDate || report.createdAt),
            author: null,
            attachments: [],
            itemType: 'report' as const,
            reportData: report,
        }));
    }, [reportsResult]);

    // Favorites store
    const { favorites, toggleFavorite, isFavorite } = useFavoritesStore();
    const favoriteCount = favorites.size;

    // Combined items based on content type
    const allItems = useMemo(() => {
        const combined = [...allDocs, ...allReports].sort((a, b) =>
            new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime()
        );
        const pagedCombined = combined.slice(0, pageSize);

        switch (contentType) {
            case 'documents':
                return allDocs;
            case 'reports':
                return allReports;
            case 'favorites':
                return pagedCombined.filter(item => favorites.has(item.id));
            default:
                return pagedCombined;
        }
    }, [contentType, allDocs, allReports, favorites, pageSize]);

    // Tag cloud from all items
    const tagCloud = useMemo(() => {
        const counts: Record<string, number> = {};
        allItems.forEach((doc) => {
            const tags = doc.aiAnalysis?.tags || [];
            tags.forEach((tag: string) => {
                const normalizedTag = normalizeTag(tag);
                if (!normalizedTag) return;
                counts[normalizedTag] = (counts[normalizedTag] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [allItems]);

    // Filter items
    const filteredItems = useMemo(() => {
        return allItems.filter((doc) => {
            if (doc.itemType !== 'report' && selectedSources.size > 0 && !selectedSources.has(doc.sourceType)) {
                return false;
            }
            if (selectedTags.size > 0) {
                const hasTag = (doc.aiAnalysis?.tags || []).some((t: string) => selectedTags.has(normalizeTag(t)));
                if (!hasTag) return false;
            }
            return true;
        });
    }, [allItems, selectedSources, selectedTags]);

    const toggleSource = (source: string) => {
        const next = new Set(selectedSources);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        setSelectedSources(next);
    };

    const toggleTag = (tag: string) => {
        const next = new Set(selectedTags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        setSelectedTags(next);
    };

    const handleSelectDoc = (id: string, checked: boolean) => {
        const next = new Set(selectedDocIds);
        if (checked) next.add(id);
        else next.delete(id);
        setSelectedDocIds(next);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedDocIds(new Set(filteredItems.map(d => d.id)));
        } else {
            setSelectedDocIds(new Set());
        }
    };

    const handleBatchDelete = () => {
        if (selectedDocIds.size === 0) return;
        const selectedItems = Array.from(selectedDocIds)
            .map(id => filteredItems.find(item => item.id === id))
            .filter(Boolean) as DocItem[];

        const docIds = selectedItems.filter(item => item.itemType !== 'report').map(item => item.id);
        const reportIds = selectedItems.filter(item => item.itemType === 'report').map(item => item.id);

        const runDelete = async () => {
            try {
                if (docIds.length > 0) {
                    await batchDeleteMutation.mutateAsync(docIds);
                }
                if (reportIds.length > 0) {
                    await batchDeleteReportsMutation.mutateAsync(reportIds);
                }
                message.success(`已删除 文档${docIds.length}篇、研报${reportIds.length}篇`);
                setSelectedDocIds(new Set());
            } catch (error) {
                message.error('批量删除失败');
            }
        };

        runDelete();
    };

    // Get all available tags for batch tag modal
    const allAvailableTags = useMemo(() => {
        const tags = new Set<string>();
        [...allDocs, ...allReports].forEach((doc) => {
            (doc.aiAnalysis?.tags || []).forEach((tag: string) => tags.add(tag));
        });
        return Array.from(tags);
    }, [allDocs, allReports]);

    // Handle batch tag application (placeholder - would need API integration)
    const handleApplyBatchTags = async (ids: string[], addTags: string[], removeTags: string[]) => {
        const selectedItems = ids
            .map(id => filteredItems.find(item => item.id === id))
            .filter(Boolean) as DocItem[];

        const docIds = selectedItems.filter(item => item.itemType !== 'report').map(item => item.id);
        const reportIds = selectedItems.filter(item => item.itemType === 'report').map(item => item.id);

        if (docIds.length === 0) {
            message.warning('当前仅支持对文档批量修改标签');
            return;
        }

        try {
            await batchUpdateTagsMutation.mutateAsync({ ids: docIds, addTags, removeTags });
            if (reportIds.length > 0) {
                message.warning('研报标签批量修改暂未支持，已跳过');
            }
            setBatchTagModalOpen(false);
            setSelectedDocIds(new Set());
        } catch (error) {
            message.error('批量标签更新失败');
        }
    };

    // Handle item click - navigate for reports, preview for documents
    const handleItemClick = (doc: DocItem) => {
        if (doc.itemType === 'report') {
            // Navigate to report detail page
            navigate(`/intel/knowledge/reports/${doc.id}`);
        } else {
            // Open preview drawer for documents
            setPreviewDoc(doc);
        }
    };

    // Auto-select view mode based on screen size (responsive)
    const isMobile = !screens.md;

    // Count by type for display
    const docCount = intelsResult?.total || 0;
    const reportCount = reportsResult?.total || 0;
    const totalCount = useMemo(() => {
        if (contentType === 'documents') return intelsResult?.total || 0;
        if (contentType === 'reports') return reportsResult?.total || 0;
        if (contentType === 'favorites') return favorites.size;
        return (intelsResult?.total || 0) + (reportsResult?.total || 0);
    }, [contentType, intelsResult?.total, reportsResult?.total, favorites.size]);

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* Left sidebar (collapsible) */}
            <div style={{
                width: filterCollapsed ? 0 : 280,
                transition: 'width 0.2s',
                overflow: 'hidden',
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                position: 'relative'
            }}>
                <FilterPanel
                    totalDocs={totalCount}
                    timeRange={timeRange}
                    setTimeRange={(range) => {
                        updateParams((next) => {
                            if (range && range !== 'ALL') next.set('range', range);
                            else next.delete('range');
                        });
                    }}
                    selectedSources={selectedSources}
                    toggleSource={toggleSource}
                    selectedTags={selectedTags}
                    toggleTag={toggleTag}
                    tagCloud={tagCloud}
                    width={280}
                />
            </div>

            {/* Main content area */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* Search and toolbar */}
                <Card style={{ borderRadius: 0, borderBottom: `1px solid ${token.colorBorderSecondary}` }} bodyStyle={{ padding: '12px 24px' }}>
                    <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                        <Flex align="center" gap={12}>
                            <Button
                                type="text"
                                icon={filterCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                                onClick={() => setFilterCollapsed(!filterCollapsed)}
                            />
                            <div>
                                <Title level={4} style={{ margin: 0 }}>
                                    知识库
                                </Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {filteredItems.length} 条内容（共 {totalCount}）
                                </Text>
                            </div>
                            <Button
                                icon={<ThunderboltOutlined />}
                                onClick={() => {
                                    weeklyRollupMutation.mutate({ triggerAnalysis: true }, {
                                        onSuccess: () => message.success('周报生成任务已提交'),
                                        onError: () => message.error('提交失败')
                                    });
                                }}
                                loading={weeklyRollupMutation.isPending}
                            >
                                生成本周周报
                            </Button>
                            {selectedDocIds.size > 0 && (
                                <Space>
                                    <Button
                                        icon={<TagsOutlined />}
                                        onClick={() => setBatchTagModalOpen(true)}
                                    >
                                        批量标签 ({selectedDocIds.size})
                                    </Button>
                                    <Button
                                        danger
                                        type="primary"
                                        icon={<DeleteOutlined />}
                                        onClick={handleBatchDelete}
                                        loading={batchDeleteMutation.isPending || batchDeleteReportsMutation.isPending}
                                    >
                                        批量删除 ({selectedDocIds.size})
                                    </Button>
                                </Space>
                            )}
                        </Flex>

                        <Flex gap={16} align="center" wrap="wrap">
                            <Segmented
                                value="library"
                                onChange={(val) => {
                                    const next = new URLSearchParams(searchParams);
                                    next.set('tab', val as string);
                                    setSearchParams(next);
                                }}
                                options={[
                                    { value: 'workbench', label: <span><ThunderboltOutlined /> 工作台</span> },
                                    { value: 'library', label: <span><FileTextOutlined /> 知识库</span> },
                                ]}
                                size="small"
                            />
                            <Segmented
                                value={contentType}
                                onChange={(val) => {
                                    const nextValue = val as ContentType;
                                    updateParams((next) => {
                                        if (nextValue && nextValue !== 'all') next.set('content', nextValue);
                                        else next.delete('content');
                                    });
                                }}
                                options={[
                                    { value: 'all', label: `全部 (${docCount + reportCount})` },
                                    { value: 'documents', icon: <FileTextOutlined />, label: `文档 (${docCount})` },
                                    { value: 'reports', icon: <FileSearchOutlined />, label: `研报 (${reportCount})` },
                                    { value: 'favorites', icon: <StarFilled style={{ color: '#faad14' }} />, label: `收藏 (${favoriteCount})` },
                                ]}
                            />
                            <Input
                                prefix={<SearchOutlined />}
                                placeholder="搜索标题、摘要或内容..."
                                value={searchTerm}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    updateParams((next) => {
                                        if (value) next.set('q', value);
                                        else next.delete('q');
                                    });
                                }}
                                style={{ width: 280 }}
                                allowClear
                            />
                        </Flex>
                    </Flex>
                </Card>

                {/* Content area */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                    {filteredItems.length === 0 ? (
                        <Empty description="暂无内容" />
                    ) : isMobile ? (
                        // Mobile: Card view
                        <>
                            <DocumentCardView
                                docs={filteredItems}
                                isLoading={isLoading}
                                onPreview={handleItemClick}
                                previewDocId={previewDoc?.id}
                                selectedIds={selectedDocIds}
                                onSelect={handleSelectDoc}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                                <Pagination
                                    current={page}
                                    pageSize={pageSize}
                                    total={totalCount}
                                    onChange={(nextPage, nextSize) => {
                                        setPage(nextPage);
                                        setPageSize(nextSize);
                                    }}
                                    showSizeChanger
                                    pageSizeOptions={[10, 20, 50, 100]}
                                />
                            </div>
                        </>
                    ) : (
                        // Desktop: List view
                        <DocumentListView
                            docs={filteredItems}
                            isLoading={isLoading}
                            onPreview={handleItemClick}
                            selectedIds={selectedDocIds}
                            onSelect={handleSelectDoc}
                            onSelectAll={handleSelectAll}
                            pagination={{
                                current: page,
                                pageSize,
                                total: totalCount,
                                onChange: (nextPage, nextSize) => {
                                    setPage(nextPage);
                                    setPageSize(nextSize);
                                },
                            }}
                        />
                    )}
                </div>
            </Flex>

            {/* Document preview drawer */}
            <DocumentPreviewDrawer
                doc={previewDoc}
                onClose={() => setPreviewDoc(null)}
            />

            {/* Batch tag modal */}
            <BatchTagModal
                open={batchTagModalOpen}
                onClose={() => setBatchTagModalOpen(false)}
                selectedIds={selectedDocIds}
                availableTags={allAvailableTags}
                onApplyTags={handleApplyBatchTags}
                isLoading={batchUpdateTagsMutation.isPending}
            />
        </Flex>
    );
};

export default UnifiedKnowledgeBase;
