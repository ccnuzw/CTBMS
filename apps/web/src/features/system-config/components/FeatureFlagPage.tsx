import { useState } from 'react';
import {
    Card,
    Table,
    Switch,
    Button,
    Modal,
    Form,
    Input,
    InputNumber,
    Space,
    Tag,
    Popconfirm,
    message,
    Slider,
    Typography,
    Tooltip,
    Flex,
} from 'antd';
import {
    PlusOutlined,
    ThunderboltOutlined,
    DeleteOutlined,
    EditOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useFeatureFlags,
    useCreateFeatureFlag,
    useUpdateFeatureFlag,
    useDeleteFeatureFlag,
    useSeedFeatureFlags,
    type FeatureFlag,
    type CreateFeatureFlagDto,
} from '../api/featureFlags';

const { Text, Title } = Typography;

export const FeatureFlagPage = () => {
    const { data: flags = [], isLoading } = useFeatureFlags();
    const createMutation = useCreateFeatureFlag();
    const updateMutation = useUpdateFeatureFlag();
    const deleteMutation = useDeleteFeatureFlag();
    const seedMutation = useSeedFeatureFlags();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
    const [form] = Form.useForm();

    const handleToggle = (flag: FeatureFlag, checked: boolean) => {
        updateMutation.mutate(
            { flagKey: flag.flagKey, data: { isEnabled: checked } },
            { onSuccess: () => message.success(`${flag.flagKey} 已${checked ? '启用' : '禁用'}`) },
        );
    };

    const handleCreate = () => {
        setEditingFlag(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    const handleEdit = (flag: FeatureFlag) => {
        setEditingFlag(flag);
        form.setFieldsValue({
            flagKey: flag.flagKey,
            description: flag.description,
            isEnabled: flag.isEnabled,
            rolloutPercent: flag.rolloutPercent,
            allowUserIds: (flag.allowUserIds ?? []).join(', '),
            environments: (flag.environments ?? []).join(', '),
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const dto: CreateFeatureFlagDto = {
            flagKey: values.flagKey,
            description: values.description,
            isEnabled: values.isEnabled ?? false,
            rolloutPercent: values.rolloutPercent ?? 0,
            allowUserIds: values.allowUserIds
                ? String(values.allowUserIds).split(',').map((s: string) => s.trim()).filter(Boolean)
                : [],
            environments: values.environments
                ? String(values.environments).split(',').map((s: string) => s.trim()).filter(Boolean)
                : ['production'],
        };

        if (editingFlag) {
            updateMutation.mutate(
                { flagKey: editingFlag.flagKey, data: dto },
                {
                    onSuccess: () => {
                        message.success('更新成功');
                        setIsModalOpen(false);
                    },
                },
            );
        } else {
            createMutation.mutate(dto, {
                onSuccess: () => {
                    message.success('创建成功');
                    setIsModalOpen(false);
                },
            });
        }
    };

    const handleSeed = () => {
        seedMutation.mutate(undefined, {
            onSuccess: () => message.success('默认开关已初始化'),
        });
    };

    const columns: ColumnsType<FeatureFlag> = [
        {
            title: '开关 Key',
            dataIndex: 'flagKey',
            key: 'flagKey',
            render: (key: string) => <Text strong copyable>{key}</Text>,
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: '状态',
            dataIndex: 'isEnabled',
            key: 'isEnabled',
            width: 100,
            render: (isEnabled: boolean, record: FeatureFlag) => (
                <Switch
                    checked={isEnabled}
                    onChange={(checked) => handleToggle(record, checked)}
                    loading={updateMutation.isPending}
                />
            ),
        },
        {
            title: (
                <Space>
                    灰度比例
                    <Tooltip title="基于用户 ID 哈希的稳定百分比分桶">
                        <InfoCircleOutlined />
                    </Tooltip>
                </Space>
            ),
            dataIndex: 'rolloutPercent',
            key: 'rolloutPercent',
            width: 120,
            render: (pct: number) => <Tag color={pct === 100 ? 'green' : pct > 0 ? 'orange' : 'default'}>{pct}%</Tag>,
        },
        {
            title: '白名单用户',
            dataIndex: 'allowUserIds',
            key: 'allowUserIds',
            width: 160,
            render: (ids: string[]) =>
                ids?.length > 0 ? (
                    <Text type="secondary">{ids.length} 人</Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: '环境',
            dataIndex: 'environments',
            key: 'environments',
            width: 180,
            render: (envs: string[]) =>
                envs?.map((env: string) => <Tag key={env}>{env}</Tag>),
        },
        {
            title: '操作',
            key: 'actions',
            width: 120,
            render: (_: unknown, record: FeatureFlag) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm
                        title="确定删除此开关？"
                        onConfirm={() =>
                            deleteMutation.mutate(record.flagKey, {
                                onSuccess: () => message.success('已删除'),
                            })
                        }
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <ThunderboltOutlined />
                    <Title level={5} style={{ margin: 0 }}>Feature Flags 灰度开关</Title>
                </Flex>
            }
            extra={
                <Space>
                    <Button onClick={handleSeed} loading={seedMutation.isPending}>
                        初始化默认开关
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                        新建开关
                    </Button>
                </Space>
            }
        >
            <Table
                columns={columns}
                dataSource={flags}
                rowKey="id"
                loading={isLoading}
                pagination={false}
                size="middle"
            />

            <Modal
                title={editingFlag ? `编辑: ${editingFlag.flagKey}` : '新建 Feature Flag'}
                open={isModalOpen}
                onOk={handleSubmit}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                forceRender
                destroyOnClose
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="flagKey"
                        label="Flag Key"
                        rules={[{ required: true, message: '请输入 flagKey' }]}
                    >
                        <Input placeholder="e.g. enable-subscription" disabled={Boolean(editingFlag)} />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name="isEnabled" label="启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item name="rolloutPercent" label="灰度百分比">
                        <Slider min={0} max={100} marks={{ 0: '0%', 50: '50%', 100: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="allowUserIds"
                        label="白名单用户 (逗号分隔)"
                    >
                        <Input placeholder="userId1, userId2" />
                    </Form.Item>
                    <Form.Item
                        name="environments"
                        label="目标环境 (逗号分隔)"
                    >
                        <Input placeholder="production, staging" />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};
