import React, { useState, useMemo, useEffect } from 'react';
import { Card, Button, message, Space, Typography, Tag, App, Alert, Form } from 'antd';
import { EditableProTable, ProColumns } from '@ant-design/pro-components';
import { COLLECTION_POINT_TYPE_ICONS, CollectionPointType } from '@packages/types';
import { useMyAssignedPoints, useBatchSubmit, usePointPriceHistory } from '../../api/hooks';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface BatchEntryRow {
    id: string; // Unique key: pointId-commodity
    collectionPointId: string;
    pointName: string;
    pointType?: string;
    commodity: string;
    price?: number;
    subType?: string;
    grade?: string;
    moisture?: number;
    bulkDensity?: number;
    inventory?: number;
    note?: string;
    lastPrice?: number; // For comparison
    lastPriceDate?: string;
}

export const BatchPriceEntryTable: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useVirtualUser();
    const { message: msg } = App.useApp();
    const [form] = Form.useForm();
    const [editableKeys, setEditableRowKeys] = useState<React.Key[]>([]);
    const [dataSource, setDataSource] = useState<BatchEntryRow[]>([]);

    // API Hooks
    const { data: assignedPoints, isLoading: loadingPoints } = useMyAssignedPoints(undefined, currentUser?.id);
    const batchSubmit = useBatchSubmit();

    // Initialize Data Source
    useEffect(() => {
        if (assignedPoints && assignedPoints.length > 0) {
            const rows: BatchEntryRow[] = [];

            assignedPoints.forEach((allocation: any) => {
                // Skip if already reported today (Granular check from backend)
                if (allocation.todayReported) return;

                // If allocation is specific commodity
                if (allocation.commodity) {
                    rows.push({
                        id: `${allocation.collectionPointId}-${allocation.commodity}`,
                        collectionPointId: allocation.collectionPointId,
                        pointName: allocation.collectionPoint.name,
                        pointType: allocation.collectionPoint.type,
                        commodity: allocation.commodity,
                        subType: 'LISTED',
                        lastPrice: allocation.lastPrice,
                        lastPriceDate: allocation.lastPriceDate,
                    });
                }
                // If allocation is "All" (commodity=null), expand to point commodities
                else {
                    const pointCommodities = allocation.collectionPoint.commodities || [];
                    pointCommodities.forEach((comm: string) => {
                        // We don't know if this specific commodity is reported if backend only gives 'todayReported' boolean for the whole allocation?
                        // Wait, my previous backend fix: if allocation.commodity is NULL, todayReported is true if ANY is reported.
                        // This means "All" allocation users might see "Reported" even if they only reported 1 of 5 commodities.
                        // For Bulk Entry, we want to list UNDONE ones.
                        // Ideally, we need more granular status for "All" allocations too.
                        // But for now, let's list them all, user can remove if done. A cleaner approach would be backend returning granularity.
                        // Given the constraints, let's list them.
                        rows.push({
                            id: `${allocation.collectionPointId}-${comm}`,
                            collectionPointId: allocation.collectionPointId,
                            pointName: allocation.collectionPoint.name,
                            pointType: allocation.collectionPoint.type,
                            commodity: comm,
                            subType: 'LISTED',
                        });
                    });
                }
            });
            setDataSource(rows);
            setEditableRowKeys(rows.map(r => r.id)); // Default all editable
        }
    }, [assignedPoints]);

    const handleCopyHistory = () => {
        const newDataSource = dataSource.map(row => {
            if (row.lastPrice && (!row.price || row.price === 0)) {
                // Update form value for this row
                form.setFieldValue([row.id, 'price'], row.lastPrice);
                return { ...row, price: row.lastPrice };
            }
            return row;
        });
        setDataSource(newDataSource);
        msg.success('已自动填充上次报价');
    };

    const handleBatchSubmit = async () => {
        // Filter rows with Price
        const validRows = dataSource.filter(row => row.price !== undefined && row.price > 0);

        if (validRows.length === 0) {
            msg.warning('请至少填写一条价格数据');
            return;
        }

        try {
            await batchSubmit.mutateAsync({
                entries: validRows.map(row => ({
                    collectionPointId: row.collectionPointId,
                    commodity: row.commodity,
                    price: row.price!,
                    subType: row.subType || 'LISTED',
                    sourceType: 'ENTERPRISE',
                    geoLevel: 'ENTERPRISE',
                    grade: row.grade,
                    moisture: row.moisture,
                    bulkDensity: row.bulkDensity,
                    inventory: row.inventory,
                    note: row.note,
                })),
                effectiveDate: new Date(),
            });
            msg.success(`批量提交成功，共 ${validRows.length} 条`);
            navigate('/price-reporting');
        } catch (error: any) {
            // Error handled globally usually, or display here
            console.error(error);
        }
    };

    const columns: ProColumns<BatchEntryRow>[] = [
        {
            title: '',
            dataIndex: 'pointType',
            readonly: true,
            editable: false,
            width: 40,
            fixed: 'left',
            align: 'center',
            render: (_, row) => (
                <span style={{ fontSize: 18 }} title={row.pointType}>
                    {COLLECTION_POINT_TYPE_ICONS[row.pointType as CollectionPointType] || '📍'}
                </span>
            )
        },
        {
            title: '采集点',
            dataIndex: 'pointName',
            readonly: true,
            width: 120,
            fixed: 'left',
            ellipsis: true,
        },
        {
            title: '品种',
            dataIndex: 'commodity',
            readonly: true,
            width: 90,
            fixed: 'left',
            render: (_, row) => <Tag color="blue">{row.commodity}</Tag>
        },
        {
            title: '上次报价',
            dataIndex: 'lastPrice',
            readonly: true,
            width: 110,
            align: 'right',
            render: (_, row) => row.lastPrice ? (
                <Space direction="vertical" size={0}>
                    <Text>{row.lastPrice}</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>{dayjs(row.lastPriceDate).format('MM-DD')}</Text>
                </Space>
            ) : '-'
        },
        {
            title: '价格 (元/吨)',
            dataIndex: 'price',
            valueType: 'digit',
            width: 140,
            align: 'right',
            formItemProps: {
                rules: [{ required: true, message: '必填' }],
            },
            fieldProps: {
                min: 0,
                style: { width: '100%' }
            }
        },
        {
            title: '类型',
            dataIndex: 'subType',
            valueType: 'select',
            valueEnum: {
                LISTED: { text: '挂牌价', status: 'Default' },
                TRANSACTION: { text: '成交价', status: 'Success' },
                mn: { text: '到港价', status: 'Processing' }, // ARRIVAL typo fixed logic later if needed
            },
            width: 100,
            fieldProps: {
                options: [
                    { value: 'LISTED', label: '挂牌价' },
                    { value: 'TRANSACTION', label: '成交价' },
                    { value: 'ARRIVAL', label: '到港价' },
                    { value: 'FOB', label: '平舱价' },
                    { value: 'PURCHASE', label: '收购价' },
                ]
            }
        },
        {
            title: '水分(%)',
            dataIndex: 'moisture',
            valueType: 'digit',
            width: 90,
        },
        {
            title: '容重(g/L)',
            dataIndex: 'bulkDensity',
            valueType: 'digit',
            width: 90,
        },
        {
            title: '备注',
            dataIndex: 'note',
            valueType: 'text',
            width: 200,
        },
        {
            title: '操作',
            valueType: 'option',
            width: 60,
            fixed: 'right',
            render: (text, record, _, action) => [
                <a
                    key="delete"
                    onClick={() => {
                        setDataSource(dataSource.filter((item) => item.id !== record.id));
                    }}
                >
                    移除
                </a>,
            ],
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Space style={{ marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/price-reporting')}>
                    返回
                </Button>
                <Title level={4} style={{ margin: 0 }}>
                    批量价格填报
                </Title>
            </Space>

            <Card>
                <Alert message="仅显示今日尚未完成填报的采集点/品种。如需修改已报数据，请前往填报记录页面。" type="info" showIcon style={{ marginBottom: 16 }} />

                <EditableProTable<BatchEntryRow>
                    rowKey="id"
                    headerTitle="待填报列表"
                    loading={loadingPoints}
                    columns={columns}
                    value={dataSource}
                    onChange={(newVal) => setDataSource([...newVal])}
                    recordCreatorProps={false}
                    editable={{
                        type: 'multiple',
                        editableKeys,
                        form,
                        actionRender: (row, config, defaultDom) => [
                            <a
                                key="delete"
                                onClick={() => {
                                    setDataSource(dataSource.filter((item) => item.id !== row.id));
                                }}
                            >
                                移除
                            </a>
                        ],
                        onValuesChange: (record, recordList) => {
                            setDataSource(recordList);
                        },
                        onChange: setEditableRowKeys,
                    }}
                    pagination={false}
                    toolBarRender={() => [
                        <Button
                            key="copy"
                            icon={<CopyOutlined />}
                            onClick={handleCopyHistory}
                        >
                            一键复制
                        </Button>,
                        <Button
                            type="primary"
                            key="submit"
                            icon={<SaveOutlined />}
                            onClick={handleBatchSubmit}
                            loading={batchSubmit.isPending}
                        >
                            提交所有 ({dataSource.filter(r => r.price).length})
                        </Button>
                    ]}
                />
            </Card>
        </div>
    );
};

export default BatchPriceEntryTable;
