import React, { useRef, useState, useMemo } from 'react';
import { ProTable, ProColumns, ActionType, ModalForm } from '@ant-design/pro-components';
import {
    Button,
    App,
    Popconfirm,
    Grid,
    Card,
    Space,
    Tag,
    Avatar,
    Flex,
    Typography,
    theme,
    Select,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    UserOutlined,
    ManOutlined,
    WomanOutlined,
} from '@ant-design/icons';
import { useUsers, useDeleteUser, useAssignRoles, UserWithRelations } from '../api/users';
import { useRoles } from '../api/roles';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';
import { UserFormModal } from './UserFormModal';

const { Text } = Typography;

// 性别显示
const genderMap: Record<string, { text: string; icon: React.ReactNode; color: string }> = {
    MALE: { text: '男', icon: <ManOutlined />, color: 'blue' },
    FEMALE: { text: '女', icon: <WomanOutlined />, color: 'magenta' },
    OTHER: { text: '其他', icon: null, color: 'default' },
};

// 状态显示
const statusMap: Record<string, { text: string; color: string }> = {
    ACTIVE: { text: '在职', color: 'success' },
    PROBATION: { text: '试用期', color: 'processing' },
    RESIGNED: { text: '离职', color: 'default' },
    SUSPENDED: { text: '停职', color: 'error' },
};

export const UserList: React.FC = () => {
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const { message } = App.useApp();

    const { data: users, isLoading, refetch } = useUsers();
    const { data: roles } = useRoles();
    const deleteUserMutation = useDeleteUser();
    const assignRolesMutation = useAssignRoles();

    const [modalVisible, setModalVisible] = useState(false);
    const [roleModalVisible, setRoleModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<UserWithRelations | undefined>(undefined);
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
    const { focusRef: roleSelectRef, modalProps: roleModalProps } = useModalAutoFocus();

    // 角色选项
    const roleOptions = useMemo(() => {
        return roles?.map((r) => ({ label: r.name, value: r.id })) || [];
    }, [roles]);

    const handleEdit = (record: UserWithRelations) => {
        setCurrentRow(record);
        setModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setModalVisible(true);
    };

    const handleAssignRoles = (record: UserWithRelations) => {
        setCurrentRow(record);
        setSelectedRoleIds(record.roles?.map((r) => r.role.id) || []);
        setRoleModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteUserMutation.mutateAsync(id);
            message.success('用户删除成功');
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '删除失败');
        }
    };

    const handleAssignRolesSubmit = async () => {
        if (!currentRow) return;
        try {
            await assignRolesMutation.mutateAsync({
                id: currentRow.id,
                data: { roleIds: selectedRoleIds },
            });
            message.success('角色分配成功');
            setRoleModalVisible(false);
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '分配失败');
        }
    };

    // 移动端卡片渲染
    const renderMobileCard = (user: UserWithRelations) => (
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
                        src={user.avatar}
                        icon={!user.avatar && <UserOutlined />}
                        style={{ backgroundColor: token.colorPrimary }}
                    />
                    <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap={token.marginXS}>
                            <Text strong ellipsis style={{ maxWidth: 100 }}>
                                {user.name}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                @{user.username}
                            </Text>
                        </Flex>
                        <Flex gap={4} wrap="wrap">
                            {user.gender && (
                                <Tag color={genderMap[user.gender]?.color}>
                                    {genderMap[user.gender]?.icon} {genderMap[user.gender]?.text}
                                </Tag>
                            )}
                            {user.status && (
                                <Tag color={statusMap[user.status]?.color}>
                                    {statusMap[user.status]?.text}
                                </Tag>
                            )}
                        </Flex>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {user.email}
                        </Text>
                    </Flex>
                </Flex>
                <Space size="small">
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(user)} />
                    <Popconfirm
                        title="确定删除该用户吗?"
                        onConfirm={() => handleDelete(user.id)}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            </Flex>
        </Card>
    );

    const columns: ProColumns<UserWithRelations>[] = [
        {
            title: '头像',
            dataIndex: 'avatar',
            search: false,
            width: 80,
            render: (_, record) => (
                <Avatar
                    src={record.avatar}
                    icon={!record.avatar && <UserOutlined />}
                    style={{ backgroundColor: token.colorPrimary }}
                />
            ),
        },
        {
            title: '用户名',
            dataIndex: 'username',
            width: 180,
        },
        {
            title: '姓名',
            dataIndex: 'name',
            width: 100,
        },
        {
            title: '性别',
            dataIndex: 'gender',
            width: 80,
            search: false,
            render: (_, record) =>
                record.gender ? (
                    <Tag color={genderMap[record.gender]?.color}>
                        {genderMap[record.gender]?.icon} {genderMap[record.gender]?.text}
                    </Tag>
                ) : (
                    '-'
                ),
        },
        {
            title: '电话',
            dataIndex: 'phone',
            width: 130,
            responsive: ['md'],
        },
        {
            title: '邮箱',
            dataIndex: 'email',
            ellipsis: true,
            responsive: ['lg'],
        },
        {
            title: '角色',
            dataIndex: 'roles',
            width: 200,
            search: false,
            render: (_, record) =>
                record.roles && record.roles.length > 0 ? (
                    <Space size={4} wrap>
                        {record.roles.slice(0, 2).map((r) => (
                            <Tag key={r.role.id} color="purple">
                                {r.role.name}
                            </Tag>
                        ))}
                        {record.roles.length > 2 && <Tag>+{record.roles.length - 2}</Tag>}
                    </Space>
                ) : (
                    <Text type="secondary">-</Text>
                ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            valueEnum: {
                ACTIVE: { text: '在职', status: 'Success' },
                PROBATION: { text: '试用期', status: 'Processing' },
                RESIGNED: { text: '离职', status: 'Default' },
                SUSPENDED: { text: '停职', status: 'Error' },
            },
        },
        {
            title: '操作',
            valueType: 'option',
            width: 220,
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
                <Button
                    key="roles"
                    size="small"
                    onClick={() => handleAssignRoles(record)}
                >
                    角色
                </Button>,
                <Popconfirm
                    key="delete"
                    title="确定删除吗?"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                    </Button>
                </Popconfirm>,
            ],
        },
    ];

    return (
        <>
            <ProTable<UserWithRelations>
                headerTitle="用户管理"
                actionRef={actionRef}
                rowKey="id"
                search={{ filterType: screens.md ? 'query' : 'light' }}
                cardBordered
                dataSource={users}
                loading={isLoading}
                columns={columns}
                pagination={{
                    defaultPageSize: 10,
                    showSizeChanger: true,
                }}
                tableRender={(_, dom) => {
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
                        onClick={handleAdd}
                    >
                        {screens.md ? '新建用户' : '新建'}
                    </Button>,
                ]}
            />

            {/* 新建/编辑用户表单 */}
            <UserFormModal
                open={modalVisible}
                onOpenChange={setModalVisible}
                user={currentRow}
                onSuccess={() => refetch()}
            />

            {/* 角色分配弹窗 */}
            <ModalForm
                title={`分配角色 - ${currentRow?.name}`}
                visible={roleModalVisible}
                onVisibleChange={setRoleModalVisible}
                modalProps={{
                    ...roleModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
                onFinish={handleAssignRolesSubmit}
                width={500}
                submitter={{
                    searchConfig: { submitText: '保存', resetText: '取消' },
                }}
            >
                <Select
                    ref={roleSelectRef}
                    mode="multiple"
                    style={{ width: '100%' }}
                    placeholder="选择角色"
                    value={selectedRoleIds}
                    onChange={setSelectedRoleIds}
                    options={roleOptions}
                    optionFilterProp="label"
                />
            </ModalForm>
        </>
    );
};
