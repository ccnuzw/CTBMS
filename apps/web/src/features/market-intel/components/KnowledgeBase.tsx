import React, { useState, useMemo } from 'react';
import {
    Card,
    Typography,
    Input,
    Button,
    Tag,
    Flex,
    Drawer,
    Space,
    theme,
    Spin,
    Segmented,
    Tooltip,
} from 'antd';
import {
    SearchOutlined,
    DownloadOutlined,
    FileTextOutlined,
    AppstoreOutlined,
    BarsOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    DeleteOutlined,
} from '@ant-design/icons';
import { useMarketIntels, useSearchAttachments, useBatchDeleteMarketIntel } from '../api/hooks';
import { IntelCategory, IntelSourceType } from '@packages/types';
import { FilterPanel, TimeRange } from './knowledge-base/FilterPanel';
import { DocumentCardView, DocItem } from './knowledge-base/DocumentCardView';
import { DocumentListView } from './knowledge-base/DocumentListView';
import { DocumentPreviewDrawer } from './knowledge-base/DocumentPreviewDrawer';
import { INTEL_SOURCE_TYPE_LABELS } from '@packages/types';

const { Title, Text, Paragraph } = Typography;



export const KnowledgeBase: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [searchTerm, setSearchTerm] = useState('');
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
    const [filterCollapsed, setFilterCollapsed] = useState(false);
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

    const batchDeleteMutation = useBatchDeleteMarketIntel();

    // 计算时间范围
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

    // API 调用 - 获取 C 类文档
    const { data: intelsResult, isLoading } = useMarketIntels({
        category: IntelCategory.C_DOCUMENT,
        pageSize: 100,
    });

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
        }));
    }, [intelsResult]);

    // 标签云
    const tagCloud = useMemo(() => {
        const counts: Record<string, number> = {};
        allDocs.forEach((doc) => {
            const tags = doc.aiAnalysis?.tags || [];
            tags.forEach((tag: string) => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [allDocs]);

    // 筛选
    const filteredDocs = useMemo(() => {
        return allDocs.filter((doc) => {
            // 搜索
            const matchesSearch =
                searchTerm === '' ||
                doc.rawContent.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (doc.summary?.toLowerCase() || '').includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            // 时间筛选
            const docDate = new Date(doc.effectiveTime);
            if (docDate < dateRange.startDate) return false;

            // 来源筛选
            if (selectedSources.size > 0 && !selectedSources.has(doc.sourceType)) {
                return false;
            }

            // 标签筛选
            if (selectedTags.size > 0) {
                const hasTag = (doc.aiAnalysis?.tags || []).some((t: string) => selectedTags.has(t));
                if (!hasTag) return false;
            }

            return true;
        });
    }, [allDocs, searchTerm, dateRange, selectedSources, selectedTags]);

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
            setSelectedDocIds(new Set(filteredDocs.map(d => d.id)));
        } else {
            setSelectedDocIds(new Set());
        }
    };

    const handleBatchDelete = () => {
        if (selectedDocIds.size === 0) return;
        batchDeleteMutation.mutate(Array.from(selectedDocIds), {
            onSuccess: () => {
                setSelectedDocIds(new Set());
            }
        });
    };

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧边栏 (可折叠) */}
            <div style={{
                width: filterCollapsed ? 0 : 280,
                transition: 'width 0.2s',
                overflow: 'hidden',
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                position: 'relative'
            }}>
                <FilterPanel
                    totalDocs={allDocs.length}
                    timeRange={timeRange}
                    setTimeRange={setTimeRange}
                    selectedSources={selectedSources}
                    toggleSource={toggleSource}
                    selectedTags={selectedTags}
                    toggleTag={toggleTag}
                    tagCloud={tagCloud}
                    width={280}
                />
            </div>

            {/* 折叠按钮 (悬浮在交界处) */}
            {/* <div style={{ width: 1, position: 'relative', zIndex: 10 }}>
                <Button 
                    size="small"
                    shape="circle"
                    icon={filterCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => setFilterCollapsed(!filterCollapsed)}
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: -12,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                />
            </div> */}

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 搜索与工具栏 */}
                <Card style={{ borderRadius: 0, borderBottom: `1px solid ${token.colorBorderSecondary}` }} bodyStyle={{ padding: '12px 24px' }}>
                    <Flex justify="space-between" align="center">
                        <Flex align="center" gap={12}>
                            <Button
                                type="text"
                                icon={filterCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                                onClick={() => setFilterCollapsed(!filterCollapsed)}
                            />
                            <div>
                                <Title level={4} style={{ margin: 0 }}>
                                    商情知识库
                                </Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {filteredDocs.length} 份文档
                                </Text>
                            </div>
                            {selectedDocIds.size > 0 && (
                                <Button
                                    danger
                                    type="primary"
                                    icon={<DeleteOutlined />}
                                    onClick={handleBatchDelete}
                                    loading={batchDeleteMutation.isPending}
                                >
                                    批量删除 ({selectedDocIds.size})
                                </Button>
                            )}
                        </Flex>

                        <Flex gap={16} align="center">
                            <Input
                                prefix={<SearchOutlined />}
                                placeholder="搜索标题、摘要或OCR原文..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: 300 }}
                                allowClear
                            />
                            <Segmented
                                value={viewMode}
                                onChange={(val) => setViewMode(val as 'list' | 'card')}
                                options={[
                                    { value: 'list', icon: <BarsOutlined />, label: '列表' },
                                    { value: 'card', icon: <AppstoreOutlined />, label: '卡片' },
                                ]}
                            />
                        </Flex>
                    </Flex>
                </Card>

                {/* 文档内容区域 */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                    {viewMode === 'card' ? (
                        <DocumentCardView
                            docs={filteredDocs}
                            isLoading={isLoading}
                            onPreview={setPreviewDoc}
                            previewDocId={previewDoc?.id}
                            selectedIds={selectedDocIds}
                            onSelect={handleSelectDoc}
                        />
                    ) : (
                        <DocumentListView
                            docs={filteredDocs}
                            isLoading={isLoading}
                            onPreview={setPreviewDoc}
                            selectedIds={selectedDocIds}
                            onSelect={handleSelectDoc}
                            onSelectAll={handleSelectAll}
                        />
                    )}
                </div>
            </Flex>

            {/* 文档预览抽屉 */}
            <DocumentPreviewDrawer
                doc={previewDoc}
                onClose={() => setPreviewDoc(null)}
            />
        </Flex>
    );
};

export default KnowledgeBase;
