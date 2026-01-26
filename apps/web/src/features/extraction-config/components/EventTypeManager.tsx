import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Modal,
    Form,
    Input,
    Select,
    Switch,
    Popconfirm,
    Typography,
    Flex,
    ColorPicker,
    InputNumber,
    theme,
    App,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useEventTypes,
    useCreateEventType,
    useUpdateEventType,
    useDeleteEventType,
    EventTypeConfig,
} from '../api/hooks';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

const { Title, Text } = Typography;

const CATEGORY_OPTIONS = [
    { label: '市场', value: 'Market', color: '#f5222d' },
    { label: '供给', value: 'Supply', color: '#fa8c16' },
    { label: '需求', value: 'Demand', color: '#1890ff' },
    { label: '库存', value: 'Inventory', color: '#eb2f96' },
    { label: '物流', value: 'Logistics', color: '#722ed1' },
    { label: '政策', value: 'Policy', color: '#faad14' },
    { label: '天气', value: 'Weather', color: '#13c2c2' },
    { label: '情绪', value: 'Sentiment', color: '#52c41a' },
    { label: '企业', value: 'Enterprise', color: '#2f54eb' },
    { label: '成本', value: 'Cost', color: '#fa541c' },
];

export const EventTypeManager: React.FC = () => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<EventTypeConfig | null>(null);
    const [form] = Form.useForm();
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    useEffect(() => {
        if (modalVisible) {
            if (editingItem) {
                form.setFieldsValue({
                    ...editingItem,
                    color: editingItem.color || '#1890ff',
                });
            } else {
                form.resetFields();
            }
        }
    }, [modalVisible, editingItem, form]);

    const { data: eventTypes, isLoading } = useEventTypes();
    const createMutation = useCreateEventType();
    const updateMutation = useUpdateEventType();
    const deleteMutation = useDeleteEventType();

    const handleCreate = () => {
        setEditingItem(null);
        setModalVisible(true);
    };

    const handleEdit = (record: EventTypeConfig) => {
        setEditingItem(record);
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('删除成功');
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const colorValue = typeof values.color === 'string' ? values.color : values.color?.toHexString();

            if (editingItem) {
                await updateMutation.mutateAsync({ id: editingItem.id, ...values, color: colorValue });
                message.success('更新成功');
            } else {
                await createMutation.mutateAsync({ ...values, color: colorValue });
                message.success('创建成功');
            }
            setModalVisible(false);
        } catch (error) {
            message.error('操作失败');
        }
    };

    const columns: ColumnsType<EventTypeConfig> = [
        {
            title: '编码',
            dataIndex: 'code',
            key: 'code',
            width: 180,
            render: (code: string) => <Text code style={{ fontSize: 12 }}>{code}</Text>,
        },
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 120,
            render: (name: string, record: EventTypeConfig) => (
                <Flex align="center" gap={8}>
                    <span
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            backgroundColor: record.color || token.colorPrimary,
                        }}
                    />
                    <Text strong>{name}</Text>
                </Flex>
            ),
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category',
            width: 70,
            render: (category: string) => {
                const opt = CATEGORY_OPTIONS.find((o) => o.value === category);
                return <Tag color={opt?.color}>{opt?.label || category}</Tag>;
            },
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 60,
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'green' : 'default'}>{isActive ? '启用' : '禁用'}</Tag>
            ),
        },
        {
            title: '关联数',
            key: 'count',
            width: 130,
            render: (_, record: EventTypeConfig) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {record._count?.events || 0} 事件 / {record._count?.extractionRules || 0} 规则
                </Text>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 80,
            fixed: 'right' as const,
            render: (_, record: EventTypeConfig) => (
                <Space size="small">
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm
                        title="确定删除吗？"
                        onConfirm={() => handleDelete(record.id)}
                        disabled={(record._count?.events || 0) > 0}
                    >
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={(record._count?.events || 0) > 0}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <SettingOutlined style={{ color: token.colorPrimary }} />
                    <span>事件类型配置</span>
                </Flex>
            }
            extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    新增类型
                </Button>
            }
        >
            <Table
                dataSource={eventTypes || []}
                columns={columns}
                rowKey="id"
                loading={isLoading}
                size="small"
                pagination={false}
            />

            <Modal
                title={editingItem ? '编辑事件类型' : '新增事件类型'}
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={() => setModalVisible(false)}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnClose
                afterOpenChange={modalProps.afterOpenChange}
            >
                <div ref={containerRef}>
                    <Form form={form} layout="vertical">
                        <Form.Item
                            name="code"
                            label="编码"
                            rules={[{ required: true, message: '请输入编码' }]}
                        >
                            <Input
                                placeholder="如：ENTERPRISE_ACTION"
                                disabled={!!editingItem}
                                {...(!editingItem ? autoFocusFieldProps : {})}
                            />
                        </Form.Item>
                        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                            <Input placeholder="如：企业动态" {...(editingItem ? autoFocusFieldProps : {})} />
                        </Form.Item>
                        <Form.Item
                            name="category"
                            label="分类"
                            rules={[{ required: true, message: '请选择分类' }]}
                        >
                            <Select options={CATEGORY_OPTIONS} placeholder="选择分类" />
                        </Form.Item>
                        <Form.Item name="description" label="描述">
                            <Input.TextArea placeholder="类型描述" rows={2} />
                        </Form.Item>
                        <Flex gap={16}>
                            <Form.Item name="color" label="颜色">
                                <ColorPicker />
                            </Form.Item>
                            <Form.Item name="sortOrder" label="排序" initialValue={0}>
                                <InputNumber min={0} />
                            </Form.Item>
                            <Form.Item name="isActive" label="启用" valuePropName="checked" initialValue={true}>
                                <Switch />
                            </Form.Item>
                        </Flex>
                    </Form>
                </div>
            </Modal>
        </Card>
    );
};

export default EventTypeManager;
