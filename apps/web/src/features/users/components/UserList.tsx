
import React, { useRef, useState } from 'react';
import { ProTable, ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, App, Popconfirm, Grid, Card, Space, Tag, Avatar, Flex, Typography, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { UserDto } from '@packages/types';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../api/users';
import { ModalForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import dayjs from 'dayjs';

const { Text } = Typography;

export const UserList: React.FC = () => {
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const { data: users, isLoading } = useUsers();
    const createUserMutation = useCreateUser();
    const updateUserMutation = useUpdateUser();
    const deleteUserMutation = useDeleteUser();
    const { message } = App.useApp();

    const [modalVisible, setModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<UserDto | undefined>(undefined);

    const handleEdit = (record: UserDto) => {
        setCurrentRow(record);
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteUserMutation.mutateAsync(id);
            message.success('用户删除成功');
        } catch (error) {
            message.error('删除失败');
        }
    };

    // 移动端卡片渲染
    const renderMobileCard = (user: UserDto) => (
        <Card
            key={user.id}
            size="small"
            style={{ marginBottom: token.marginSM }}
            bodyStyle={{ padding: token.paddingSM }}
        >
            <Flex justify="space-between" align="flex-start">
                <Flex gap={token.marginSM} align="center" style={{ flex: 1 }}>
                    <Avatar
                        size={48}
                        icon={<UserOutlined />}
                        style={{ backgroundColor: user.role === 'ADMIN' ? token.colorError : token.colorPrimary }}
                    />
                    <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap={token.marginXS}>
                            <Text strong ellipsis style={{ maxWidth: 120 }}>{user.name}</Text>
                            <Tag color={user.role === 'ADMIN' ? 'error' : 'success'}>
                                {user.role === 'ADMIN' ? '管理员' : '普通用户'}
                            </Tag>
                        </Flex>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }} ellipsis>
                            {user.email}
                        </Text>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            {dayjs(user.createdAt).format('YYYY-MM-DD HH:mm')}
                        </Text>
                    </Flex>
                </Flex>
                <Space size={4}>
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(user)}
                    />
                    <Popconfirm
                        title="确定删除该用户吗?"
                        onConfirm={() => handleDelete(user.id)}
                    >
                        <Button type="primary" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            </Flex>
        </Card>
    );

    const columns: ProColumns<UserDto>[] = [
        {
            title: '用户 ID',
            dataIndex: 'id',
            copyable: true,
            ellipsis: true,
            width: 300,
            search: false,
            responsive: ['lg'],
        },
        {
            title: '姓名',
            dataIndex: 'name',
        },
        {
            title: '邮箱',
            dataIndex: 'email',
            responsive: ['md'],
        },
        {
            title: '角色',
            dataIndex: 'role',
            valueEnum: {
                ADMIN: { text: '管理员', status: 'Error' },
                USER: { text: '普通用户', status: 'Success' },
            },
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateTime',
            search: false,
            responsive: ['xl'],
        },
        {
            title: '操作',
            valueType: 'option',
            width: 180,
            render: (_, record) => [
                <Button
                    key="edit"
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    编辑
                </Button>,
                <Popconfirm
                    key="delete"
                    title="确定删除该用户吗?"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <Button type="primary" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>,
            ],
        },
    ];

    return (
        <>
            <ProTable<UserDto>
                headerTitle="用户管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    filterType: screens.md ? 'query' : 'light',
                }}
                cardBordered
                dataSource={users}
                loading={isLoading}
                columns={columns}
                tableRender={(_, dom) => {
                    // 移动端使用卡片列表
                    if (!screens.md && users && users.length > 0) {
                        return (
                            <div style={{ padding: token.paddingSM }}>
                                {users.map(renderMobileCard)}
                            </div>
                        );
                    }
                    return dom;
                }}
                toolBarRender={() => [
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setCurrentRow(undefined);
                            setModalVisible(true);
                        }}
                    >
                        {screens.md ? '新建用户' : '新建'}
                    </Button>
                ]}
            />
            <ModalForm
                title={currentRow ? "编辑用户" : "新建用户"}
                open={modalVisible}
                onOpenChange={setModalVisible}
                modalProps={{
                    destroyOnClose: true,
                }}
                initialValues={currentRow}
                onFinish={async (values) => {
                    if (currentRow) {
                        await updateUserMutation.mutateAsync({ id: currentRow.id, data: values });
                        message.success('用户更新成功');
                    } else {
                        await createUserMutation.mutateAsync(values as any);
                        message.success('用户创建成功');
                    }
                    return true;
                }}
            >
                <ProFormText name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]} />
                <ProFormText name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效的邮箱地址' }]} />
                <ProFormSelect
                    name="role"
                    label="角色"
                    valueEnum={{ USER: '普通用户', ADMIN: '管理员' }}
                    rules={[{ required: true, message: '请选择角色' }]}
                />
            </ModalForm>
        </>
    );
};

