import React, { useMemo } from 'react';
import { Table, Tag, Space, Typography, Button, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { IntelSourceType, INTEL_SOURCE_TYPE_LABELS, ReviewStatus } from '@packages/types';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS } from '@/constants';
import { DocItem } from './DocumentCardView';
import { stripHtml } from '@packages/utils';
import { useFavoritesStore } from '../../stores/useFavoritesStore';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Text } = Typography;



interface DocumentListViewProps {
    docs: DocItem[];
    isLoading: boolean;
    onPreview: (doc: DocItem) => void;
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
    onSelectAll: (checked: boolean) => void;
    pagination?: {
        current: number;
        pageSize: number;
        total: number;
        onChange: (page: number, pageSize: number) => void;
    };
}

export const DocumentListView: React.FC<DocumentListViewProps> = ({
    docs,
    isLoading,
    onPreview,
    selectedIds,
    onSelect,
    onSelectAll,
    pagination
}) => {
    const { isFavorite, toggleFavorite } = useFavoritesStore();
    const { data: dictionaries } = useDictionaries(['INTEL_SOURCE_TYPE']);

    const sourceTypeMeta = useMemo(() => {
        const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
        const fallbackColors: Record<string, string> = {
            [IntelSourceType.FIRST_LINE]: 'blue',
            [IntelSourceType.COMPETITOR]: 'warning',
            [IntelSourceType.OFFICIAL]: 'error',
            [IntelSourceType.RESEARCH_INST]: 'purple',
            [IntelSourceType.MEDIA]: 'orange',
            [IntelSourceType.INTERNAL_REPORT]: 'geekblue',
        };
        if (!items.length) {
            return {
                labels: INTEL_SOURCE_TYPE_LABELS as Record<string, string>,
                colors: fallbackColors,
            };
        }
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'default';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    const reviewStatusMeta = {
        labels: REVIEW_STATUS_LABELS,
        colors: REVIEW_STATUS_COLORS,
    };

    const columns: ColumnsType<DocItem> = [
        {
            title: '',
            key: 'favorite',
            width: 50,
            render: (_, record) => (
                <Tooltip title={isFavorite(record.id) ? '取消收藏' : '添加收藏'}>
                    <Button
                        type="text"
                        size="small"
                        icon={isFavorite(record.id) ?
                            <StarFilled style={{ color: '#faad14' }} /> :
                            <StarOutlined />
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(record.id);
                        }}
                    />
                </Tooltip>
            ),
        },
        {
            title: '类型',
            key: 'itemType',
            width: 80,
            render: (_, record) => (
                <Tag color={record.itemType === 'report' ? 'green' : 'blue'}>
                    {record.itemType === 'report' ? '研报' : '文档'}
                </Tag>
            ),
        },
        {
            title: '标题',
            key: 'name',
            render: (_, record) => {
                const title = stripHtml(record.rawContent || '').split('\n')[0]?.replace(/\[|\]/g, '') || '';
                const displayTitle = title
                    ? (title.length > 50 ? title.substring(0, 50) + '...' : title)
                    : '未命名文档';
                return (
                    <Text strong onClick={() => onPreview(record)} style={{ cursor: 'pointer', color: '#1890ff' }}>
                        {displayTitle}
                    </Text>
                );
            },
        },
        {
            title: '来源/机构',
            dataIndex: 'sourceType',
            key: 'source',
            width: 140,
            render: (type: string, record) => {
                if (record.itemType === 'report') {
                    return record.reportData?.source || '-';
                }
                return (
                    <Tag color={sourceTypeMeta.colors[type] || 'default'}>
                        {sourceTypeMeta.labels[type] || type}
                    </Tag>
                );
            },
        },
        {
            title: '审核状态',
            key: 'reviewStatus',
            width: 100,
            render: (_, record) => {
                if (record.itemType !== 'report') return '-';
                const status = record.reportData?.reviewStatus as ReviewStatus | undefined;
                if (!status) return '-';
                return (
                    <Tag color={reviewStatusMeta.colors[status] || 'default'}>
                        {reviewStatusMeta.labels[status] || status}
                    </Tag>
                );
            },
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            key: 'summary',
            ellipsis: true,
            render: (text, record) => stripHtml(text || record.aiAnalysis?.summary || '') || '-',
        },
        {
            title: '归档时间',
            dataIndex: 'effectiveTime',
            key: 'effectiveTime',
            width: 150,
            render: (time: string) => new Date(time).toLocaleDateString(),
            sorter: (a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime(),
        },
        {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_, record) => (
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => onPreview(record)}
                >
                    预览
                </Button>
            ),
        },
    ];

    return (
        <Table
            columns={columns}
            dataSource={docs}
            rowKey="id"
            loading={isLoading}
            pagination={pagination ? {
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                onChange: pagination.onChange,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
            } : { pageSize: 20 }}
            size="middle"
            rowSelection={{
                type: 'checkbox',
                selectedRowKeys: Array.from(selectedIds),
                onSelect: (record, selected) => onSelect(record.id, selected),
                onSelectAll: (selected) => onSelectAll(selected),
            }}
        />
    );
};
