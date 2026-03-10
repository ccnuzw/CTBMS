import React, { useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useCollectionPoints } from '../../../api/collection-point';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import type { CollectionPointType } from '@packages/types';
import { POINT_TYPE_OPTIONS, POINT_TYPE_LABELS } from './templateFormConstants';

const { Text } = Typography;

interface CollectionPointPickerProps {
    value?: string[];
    onChange?: (ids: string[]) => void;
}

const CollectionPointPicker: React.FC<CollectionPointPickerProps> = ({ value = [], onChange }) => {
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [types, setTypes] = useState<CollectionPointType[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [cache, setCache] = useState(
        new Map<
            string,
            {
                id: string;
                name: string;
                code?: string | null;
                type?: string;
                regionName?: string | null;
                owners?: number;
            }
        >(),
    );
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const normalizedKeyword = keyword.trim();
    const { data, isLoading } = useCollectionPoints({
        page,
        pageSize,
        keyword: normalizedKeyword || undefined,
        types: types.length ? types : undefined,
        isActive: true,
    });

    React.useEffect(() => {
        if (!data?.data?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            data.data.forEach((point) => {
                next.set(point.id, {
                    id: point.id,
                    name: point.name,
                    code: point.code,
                    type: point.type,
                    regionName: point.region?.name ?? point.regionCode ?? null,
                    owners: point.allocations?.length ?? 0,
                });
            });
            return next;
        });
    }, [data]);

    const selectedIds = value || [];
    const updateSelected = (ids: string[]) => {
        onChange?.(ids);
    };

    const pageIds = (data?.data || []).map((item) => item.id);

    const handleSelectPage = () => {
        const next = Array.from(new Set([...selectedIds, ...pageIds]));
        updateSelected(next);
    };

    const handleUnselectPage = () => {
        const next = selectedIds.filter((id) => !pageIds.includes(id));
        updateSelected(next);
    };

    const selectedSummary = selectedIds.map((id) => cache.get(id) || { id, name: id });

    const columns = [
        {
            title: '采集点',
            dataIndex: 'name',
            render: (_: string, record: Record<string, any>) => (
                <Space direction="vertical" size={0}>
                    <span>{record.name}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.code || record.id}
                    </Text>
                </Space>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 100,
            render: (value: string) => POINT_TYPE_LABELS[value] || value,
        },
        {
            title: '区域',
            dataIndex: 'region',
            width: 140,
            render: (_: any, record: Record<string, any>) =>
                record.region?.name || record.regionCode || '--',
        },
        {
            title: '负责人',
            dataIndex: 'allocations',
            width: 90,
            render: (value: any[]) => value?.length ?? 0,
        },
    ];

    return (
        <div>
            <Space wrap>
                <Button type="primary" onClick={() => setOpen(true)}>
                    选择采集点
                </Button>
                <Text type="secondary">已选 {selectedIds.length} 个</Text>
                {selectedIds.length > 0 && (
                    <Button onClick={() => updateSelected([])} size="small">
                        清空
                    </Button>
                )}
            </Space>
            {selectedIds.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Space wrap size={[4, 8]}>
                        {selectedSummary.slice(0, 6).map((item) => (
                            <Tag key={item.id}>{item.name}</Tag>
                        ))}
                        {selectedSummary.length > 6 && <Tag>+{selectedSummary.length - 6}</Tag>}
                    </Space>
                </div>
            )}
            <Modal
                title="选择采集点"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => setOpen(false)}
                width={900}
                destroyOnClose
                {...modalProps}
            >
                <div ref={containerRef}>
                    <Space wrap style={{ marginBottom: 12 }}>
                        <Input
                            allowClear
                            placeholder="搜索名称/编码/别名"
                            style={{ width: 220 }}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            {...autoFocusFieldProps}
                        />
                        <Select
                            mode="multiple"
                            allowClear
                            placeholder="采集点类型"
                            style={{ minWidth: 200 }}
                            value={types}
                            onChange={(vals) => {
                                setTypes(vals as CollectionPointType[]);
                                setPage(1);
                            }}
                            options={POINT_TYPE_OPTIONS.map((item) => ({
                                value: item.value,
                                label: `${item.icon} ${item.label}`,
                            }))}
                        />
                        <Button onClick={handleSelectPage}>全选当前页</Button>
                        <Button onClick={handleUnselectPage}>取消当前页</Button>
                    </Space>
                    <Table
                        rowKey="id"
                        loading={isLoading}
                        dataSource={data?.data || []}
                        columns={columns}
                        pagination={{
                            current: data?.page || page,
                            pageSize: data?.pageSize || pageSize,
                            total: data?.total || 0,
                            showSizeChanger: true,
                            onChange: (nextPage, nextSize) => {
                                setPage(nextPage);
                                setPageSize(nextSize);
                            },
                        }}
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            preserveSelectedRowKeys: true,
                            onChange: (keys) => updateSelected(keys as string[]),
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default CollectionPointPicker;
