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
    Flex,
    Typography,
    Statistic,
    Row,
    Col,
    theme,
    Tabs,
    Modal,
    Form,
    InputNumber,
    Switch,
    Segmented,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ReloadOutlined,
    UnorderedListOutlined,
    ApartmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useRegions,
    useRegionStats,
    useCreateRegion,
    useUpdateRegion,
    useDeleteRegion,
} from '../api/region';
import {
    RegionLevel,
    REGION_LEVEL_LABELS,
    type AdministrativeRegion,
} from '@packages/types';
import { RegionCascader } from './RegionCascader';

const { Title, Text } = Typography;

export const RegionManager: React.FC = () => {
    const { token } = theme.useToken();
    const [viewMode, setViewMode] = useState<'list' | 'cascader'>('list');
    const [filters, setFilters] = useState<{
        level?: RegionLevel;
        parentCode?: string;
        keyword?: string;
    }>({});

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<AdministrativeRegion | null>(null);
    const [form] = Form.useForm();

    const { data: regions, isLoading, refetch } = useRegions(filters);
    const { data: stats } = useRegionStats();
    const createMutation = useCreateRegion();
    const updateMutation = useUpdateRegion();
    const deleteMutation = useDeleteRegion();

    const handleEdit = (record?: AdministrativeRegion) => {
        setEditingRecord(record || null);
        if (record) {
            form.setFieldsValue(record);
        } else {
            form.resetFields();
            form.setFieldsValue({ isActive: true, sortOrder: 0 });
        }
        setEditorOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('删除成功');
        } catch (error: any) {
            message.error(error.message || '删除失败');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingRecord) {
                await updateMutation.mutateAsync({ id: editingRecord.id, dto: values });
                message.success('更新成功');
            } else {
                await createMutation.mutateAsync(values);
                message.success('创建成功');
            }
            setEditorOpen(false);
            setEditingRecord(null);
        } catch (error: any) {
            if (error.message) {
                message.error(error.message);
            }
        }
    };

    const columns: ColumnsType<AdministrativeRegion> = [
        {
            title: '区划代码',
            dataIndex: 'code',
            width: 120,
            render: (code) => <Text code>{code}</Text>,
        },
        {
            title: '名称',
            dataIndex: 'name',
            width: 150,
            render: (name, record) => (
                <Space>
                    <Text strong>{name}</Text>
                    {record.shortName && (
                        <Text type="secondary">({record.shortName})</Text>
                    )}
                </Space>
            ),
        },
        {
            title: '层级',
            dataIndex: 'level',
            width: 120,
            render: (level: RegionLevel) => (
                <Tag
                    color={
                        level === RegionLevel.PROVINCE ? 'blue' :
                            level === RegionLevel.CITY ? 'green' :
                                level === RegionLevel.DISTRICT ? 'orange' : 'default'
                    }
                >
                    {REGION_LEVEL_LABELS[level]}
                </Tag>
            ),
        },
        {
            title: '上级区划',
            dataIndex: 'parentCode',
            width: 100,
            render: (code) => code || '-',
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            width: 80,
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
                        onClick={() => handleEdit(record)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定删除此区划？"
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
                    <Title level={4} style={{ margin: 0 }}>🗺️ 行政区划管理</Title>
                    <Text type="secondary">管理全国省、市、区县等行政区划数据</Text>
                </div>
                <Space>
                    <Segmented
                        value={viewMode}
                        onChange={(val) => setViewMode(val as 'list' | 'cascader')}
                        options={[
                            { label: '列表视图', value: 'list', icon: <UnorderedListOutlined /> },
                            { label: '层级视图', value: 'cascader', icon: <ApartmentOutlined /> },
                        ]}
                    />
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleEdit()}
                    >
                        新增区划
                    </Button>
                </Space>
            </Flex>

            {/* 统计卡片 */}
            {stats && stats.length > 0 && (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {stats.map((stat) => (
                        <Col key={stat.level} xs={12} sm={8} md={4}>
                            <Card size="small">
                                <Statistic
                                    title={REGION_LEVEL_LABELS[stat.level]}
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

            <Card>
                {viewMode === 'list' ? (
                    <>
                        {/* 筛选区 */}
                        <Flex gap={16} wrap="wrap" align="center" style={{ marginBottom: 16 }}>
                            <Select
                                placeholder="层级"
                                allowClear
                                style={{ width: 150 }}
                                value={filters.level}
                                onChange={(level) => setFilters((f) => ({ ...f, level }))}
                                options={Object.entries(REGION_LEVEL_LABELS).map(([value, label]) => ({
                                    value,
                                    label,
                                }))}
                            />
                            <Input.Search
                                placeholder="搜索名称、代码"
                                allowClear
                                style={{ width: 250 }}
                                value={filters.keyword}
                                onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                                onSearch={() => refetch()}
                            />
                            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                                刷新
                            </Button>
                        </Flex>

                        <Table
                            rowKey="id"
                            columns={columns}
                            dataSource={regions}
                            loading={isLoading}
                            scroll={{ x: 800 }}
                            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
                        />
                    </>
                ) : (
                    <RegionCascader
                        onEdit={(record) => handleEdit(record)}
                        onDelete={(id) => handleDelete(id)}
                    />
                )}
            </Card>

            {/* 编辑弹窗 */}
            <Modal
                title={editingRecord ? '编辑行政区划' : '新增行政区划'}
                open={editorOpen}
                onCancel={() => {
                    setEditorOpen(false);
                    setEditingRecord(null);
                }}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                width={500}
            >
                <Form form={form} layout="vertical">
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="code"
                                label="区划代码"
                                rules={[{ required: true, message: '请输入区划代码' }]}
                            >
                                <Input placeholder="如 110000" disabled={!!editingRecord} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="name"
                                label="名称"
                                rules={[{ required: true, message: '请输入名称' }]}
                            >
                                <Input placeholder="如 北京市" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="shortName" label="简称">
                                <Input placeholder="如 京" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="level"
                                label="层级"
                                rules={[{ required: true, message: '请选择层级' }]}
                            >
                                <Select
                                    placeholder="选择层级"
                                    options={Object.entries(REGION_LEVEL_LABELS).map(([value, label]) => ({
                                        value,
                                        label,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="parentCode" label="上级区划代码">
                        <Input placeholder="如 110000（北京市的区县填写此代码）" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="sortOrder" label="排序">
                                <InputNumber style={{ width: '100%' }} min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="isActive" label="启用" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default RegionManager;
