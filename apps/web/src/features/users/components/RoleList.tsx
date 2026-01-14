import React, { useRef, useState, useMemo } from 'react';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SafetyCertificateOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import {
    Button,
    Popconfirm,
    App,
    Grid,
    Input,
    Flex,
    Card,
    Typography,
    Space,
    theme,
    Tag,
} from 'antd';
import { CreateRoleDto } from '@packages/types';
import {
    useRoles,
    useCreateRole,
    useUpdateRole,
    useDeleteRole,
    RoleWithCount,
} from '../api/roles';
import {
    ModalForm,
    ProFormText,
    ProFormTextArea,
    ProFormDigit,
    ProFormSelect,
    ProFormSwitch,
} from '@ant-design/pro-components';

export const RoleList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<RoleWithCount | undefined>(undefined);
    const [searchText, setSearchText] = useState('');

    const { data: roles, isLoading } = useRoles();
    const createRole = useCreateRole();
    const updateRole = useUpdateRole();
    const deleteRole = useDeleteRole();

    const handleEdit = (record: RoleWithCount) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteRole.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '删除失败');
        }
    };

    const handleSubmit = async (values: CreateRoleDto) => {
        try {
            if (currentRow) {
                await updateRole.mutateAsync({ id: currentRow.id, data: values });
                message.success('更新成功');
            } else {
                await createRole.mutateAsync(values);
                message.success('创建成功');
            }
            setEditModalVisible(false);
            actionRef.current?.reload();
            return true;
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '操作失败');
            return false;
        }
    };

    const filteredRoles = useMemo(() => {
        if (!roles) return [];
        if (!searchText) return roles;
        return roles.filter(
            (item) =>
                item.name.toLowerCase().includes(searchText.toLowerCase()) ||
                item.code.toLowerCase().includes(searchText.toLowerCase()),
        );
    }, [roles, searchText]);

    const columns: ProColumns<RoleWithCount>[] = [
        {
            title: '角色名称',
            dataIndex: 'name',
            ellipsis: true,
        },
        {
            title: '角色代码',
            dataIndex: 'code',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '用户数',
            dataIndex: ['_count', 'users'],
            search: false,
        },
        {
            title: '系统角色',
            dataIndex: 'isSystem',
            render: (_, record) =>
                record.isSystem ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
            search: false,
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            search: false,
            responsive: ['lg'],
        },
        {
            title: '操作',
            valueType: 'option',
            key: 'option',
            width: 180,
            render: (_, record) => [
                <Button
                    key="editable"
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    编辑
                </Button>,
                <Popconfirm
                    key="delete"
                    title="确定删除吗?"
                    onConfirm={() => handleDelete(record.id)}
                    disabled={record.isSystem}
                >
                    <Button
                        type="primary"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={record.isSystem}
                    >
                        删除
                    </Button>
                </Popconfirm>,
            ],
        },
    ];

    // 表单组件
    const FormContent = () => (
        <>
            <ProFormText
                name="name"
                label="角色名称"
                placeholder="请输入角色名称"
                rules={[{ required: true, message: '请输入角色名称' }]}
            />
            <ProFormText
                name="code"
                label="角色代码"
                placeholder="请输入角色代码（如 MANAGER）"
                rules={[{ required: true, message: '请输入角色代码' }]}
                disabled={!!currentRow}
            />
            <ProFormSwitch
                name="isSystem"
                label="系统内置"
                tooltip="系统内置角色不可删除"
                initialValue={false}
            />
            <ProFormDigit name="sortOrder" label="排序" placeholder="请输入排序号" />
            <ProFormSelect
                name="status"
                label="状态"
                options={[
                    { value: 'ACTIVE', label: '启用' },
                    { value: 'INACTIVE', label: '禁用' },
                ]}
                initialValue="ACTIVE"
            />
            <ProFormTextArea name="description" label="描述" placeholder="请输入描述" />
        </>
    );

    // 移动端视图
    if (!screens.md) {
        return (
            <>
                <Flex vertical gap="middle" style={{ padding: token.paddingSM }}>
                    <Flex justify="space-between" align="center">
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            角色管理
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    <Input.Search
                        placeholder="搜索角色名称/代码"
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />

                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredRoles.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: token.colorTextSecondary,
                                    padding: token.paddingLG,
                                }}
                            >
                                暂无数据
                            </div>
                        ) : (
                            filteredRoles.map((record) => (
                                <Card
                                    key={record.id}
                                    size="small"
                                    hoverable
                                    style={{
                                        borderRadius: token.borderRadiusLG,
                                        borderLeft: `3px solid ${token.colorPrimary}`,
                                    }}
                                >
                                    <Flex vertical gap="small">
                                        <Flex justify="space-between" align="center">
                                            <Space>
                                                <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
                                                <Typography.Text strong>{record.name}</Typography.Text>
                                                {record.isSystem && <Tag color="blue">系统</Tag>}
                                            </Space>
                                            <Space size="small">
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => handleEdit(record)}
                                                />
                                                {!record.isSystem && (
                                                    <Popconfirm
                                                        title="确定删除吗?"
                                                        onConfirm={() => handleDelete(record.id)}
                                                    >
                                                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                )}
                                            </Space>
                                        </Flex>

                                        <Flex vertical gap={4}>
                                            <Flex gap="small">
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    代码: {record.code}
                                                </Typography.Text>
                                            </Flex>
                                            <Space size={4}>
                                                <UserOutlined style={{ color: token.colorTextSecondary }} />
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    {record._count?.users || 0} 位用户
                                                </Typography.Text>
                                            </Space>
                                        </Flex>
                                    </Flex>
                                </Card>
                            ))
                        )}
                    </Flex>
                </Flex>

                <ModalForm
                    title={currentRow ? '编辑角色' : '新建角色'}
                    width="500px"
                    open={editModalVisible}
                    onOpenChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow}
                    modalProps={{ destroyOnClose: true }}
                >
                    <FormContent />
                </ModalForm>
            </>
        );
    }

    // 桌面端视图
    return (
        <>
            <ProTable<RoleWithCount>
                headerTitle="角色管理"
                actionRef={actionRef}
                rowKey="id"
                search={{ labelWidth: 120, filterType: 'query' }}
                toolBarRender={() => [
                    <Button type="primary" key="primary" onClick={handleAdd}>
                        <PlusOutlined /> 新建
                    </Button>,
                ]}
                dataSource={roles}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑角色' : '新建角色'}
                width="500px"
                open={editModalVisible}
                onOpenChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow}
                modalProps={{ destroyOnClose: true }}
            >
                <FormContent />
            </ModalForm>
        </>
    );
};
