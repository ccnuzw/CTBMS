import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Popconfirm,
    message,
    Select,
    Input,
    Switch,
    Flex,
    Typography,
    Statistic,
    Row,
    Col,
    theme,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useCollectionPoints,
    useDeleteCollectionPoint,
    useCollectionPointStats,
} from '../api/collection-point';
import { CollectionPointEditor } from './CollectionPointEditor';
import { CollectionPointConfigHelp } from './CollectionPointConfigHelp';
import {
    CollectionPointType,
    COLLECTION_POINT_TYPE_LABELS,
    COLLECTION_POINT_TYPE_ICONS,
    type CollectionPointResponse,
} from '@packages/types';

const { Title, Text } = Typography;

export const CollectionPointManager: React.FC = () => {
    const { token } = theme.useToken();
    const [filters, setFilters] = useState<{
        type?: CollectionPointType;
        keyword?: string;
        isActive?: boolean;
        page: number;
        pageSize: number;
    }>({
        page: 1,
        pageSize: 20,
        isActive: true,
    });

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | undefined>();

    const { data, isLoading, refetch } = useCollectionPoints(filters);
    const { data: stats } = useCollectionPointStats();
    const deleteMutation = useDeleteCollectionPoint();

    const blurActiveElement = () => {
        if (typeof document === 'undefined') return;
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    };

    const handleEdit = (id?: string) => {
        // 避免触发按钮在 aria-hidden 切换过程中保留焦点导致控制台警告
        blurActiveElement();
        setEditingId(id);
        setEditorOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('删除成功');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error object from catch
        } catch (error: any) {
            message.error(error.message || '删除失败');
        }
    };

    const handleEditorClose = (success?: boolean) => {
        // 关闭前清理当前焦点，避免焦点停留在即将被隐藏的 modal 内容
        blurActiveElement();
        setEditorOpen(false);
        setEditingId(undefined);
        if (success) refetch();
    };

    const columns: ColumnsType<CollectionPointResponse> = [
        {
            title: '编码',
            dataIndex: 'code',
            width: 120,
            render: (code) => <Text code>{code}</Text>,
        },
        {
            title: '名称',
            dataIndex: 'name',
            width: 180,
            render: (name, record) => (
                <Space>
                    <span>{COLLECTION_POINT_TYPE_ICONS[record.type]}</span>
                    <Text strong>{name}</Text>
                </Space>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 100,
            render: (type: CollectionPointType) => (
                <Tag
                    color={
                        type === CollectionPointType.ENTERPRISE ? 'orange' :
                            type === CollectionPointType.PORT ? 'blue' :
                                type === CollectionPointType.STATION ? 'purple' :
                                    type === CollectionPointType.MARKET ? 'green' : 'default'
                    }
                >
                    {COLLECTION_POINT_TYPE_LABELS[type]}
                </Tag>
            ),
        },
        {
            title: '行政区划',
            dataIndex: 'region',
            width: 120,
            render: (region) => region?.name || '-',
        },
        {
            title: '别名',
            dataIndex: 'aliases',
            width: 180,
            render: (aliases: string[]) => (
                <Flex wrap="wrap" gap={4}>
                    {aliases.slice(0, 3).map((alias) => (
                        <Tag key={alias} style={{ fontSize: 11, margin: 0 }}>{alias}</Tag>
                    ))}
                    {aliases.length > 3 && (
                        <Tag style={{ fontSize: 11, margin: 0 }}>+{aliases.length - 3}</Tag>
                    )}
                </Flex>
            ),
        },
        {
            title: '主营品种',
            dataIndex: 'commodities',
            width: 120,
            render: (commodities: string[]) => commodities.join('、') || '-',
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            width: 80,
            sorter: true,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 80,
            render: (isActive) => (
                <Tag color={isActive ? 'success' : 'default'}>
                    {isActive ? '启用' : '禁用'}
                </Tag>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record.id)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定删除此采集点？"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>🎯 采集点配置管理</Title>
                    <Text type="secondary">配置 AI 智能识别所需的企业、港口、地域等关键词库</Text>
                </div>
                <Space>
                    <CollectionPointConfigHelp />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleEdit()}
                    >
                        新增采集点
                    </Button>
                </Space>
            </Flex>

            {/* 统计卡片 */}
            {stats && stats.length > 0 && (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {stats.map((stat) => (
                        <Col key={stat.type} xs={12} sm={8} md={4}>
                            <Card size="small">
                                <Statistic
                                    title={
                                        <Space>
                                            <span>{COLLECTION_POINT_TYPE_ICONS[stat.type]}</span>
                                            {COLLECTION_POINT_TYPE_LABELS[stat.type]}
                                        </Space>
                                    }
                                    value={stat.count}
                                    valueStyle={{ color: token.colorPrimary }}
                                />
                            </Card>
                        </Col>
                    ))}
                    <Col xs={12} sm={8} md={4}>
                        <Card size="small">
                            <Statistic
                                title="总计"
                                value={stats.reduce((sum, s) => sum + s.count, 0)}
                                valueStyle={{ color: token.colorSuccess }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* 筛选区 */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Flex gap={16} wrap="wrap" align="center">
                    <Select
                        placeholder="类型"
                        allowClear
                        style={{ width: 150 }}
                        value={filters.type}
                        onChange={(type) => setFilters((f) => ({ ...f, type, page: 1 }))}
                        options={Object.entries(COLLECTION_POINT_TYPE_LABELS).map(([value, label]) => ({
                            value,
                            label: (
                                <Space>
                                    {COLLECTION_POINT_TYPE_ICONS[value as CollectionPointType]}
                                    {label}
                                </Space>
                            ),
                        }))}
                    />
                    <Input.Search
                        placeholder="搜索名称、编码、别名"
                        allowClear
                        style={{ width: 250 }}
                        value={filters.keyword}
                        onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                        onSearch={() => setFilters((f) => ({ ...f, page: 1 }))}
                    />
                    <Space>
                        <Text>仅显示启用:</Text>
                        <Switch
                            checked={filters.isActive}
                            onChange={(isActive) => setFilters((f) => ({ ...f, isActive, page: 1 }))}
                        />
                    </Space>
                    <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                        刷新
                    </Button>
                </Flex>
            </Card>

            {/* 表格 */}
            <Card>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={data?.data}
                    loading={isLoading}
                    scroll={{ x: 1200 }}
                    pagination={{
                        current: filters.page,
                        pageSize: filters.pageSize,
                        total: data?.total,
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 条`,
                        onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, pageSize })),
                    }}
                />
            </Card>

            {/* 编辑弹窗 */}
            <CollectionPointEditor
                open={editorOpen}
                editId={editingId}
                onClose={handleEditorClose}
            />
        </div>
    );
};

export default CollectionPointManager;
