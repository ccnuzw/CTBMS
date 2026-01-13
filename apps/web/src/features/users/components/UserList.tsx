
import React, { useRef, useState } from 'react';
import { ProTable, ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, App } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { UserDto } from '@packages/types';
import { useUsers, useCreateUser, useUpdateUser } from '../api/users';
import { ModalForm, ProFormText, ProFormSelect } from '@ant-design/pro-components';

export const UserList: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const { data: users, isLoading } = useUsers();
    const createUserMutation = useCreateUser();
    const updateUserMutation = useUpdateUser();
    const { message } = App.useApp();

    const [modalVisible, setModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<UserDto | undefined>(undefined);

    const handleEdit = (record: UserDto) => {
        setCurrentRow(record);
        setModalVisible(true);
    };

    const columns: ProColumns<UserDto>[] = [
        {
            title: '用户 ID',
            dataIndex: 'id',
            copyable: true,
            ellipsis: true,
            width: 300,
        },
        {
            title: '姓名',
            dataIndex: 'name',
        },
        {
            title: '邮箱',
            dataIndex: 'email',
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
        },
        {
            title: '操作',
            valueType: 'option',
            width: 100,
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
            ],
        },
    ];

    return (
        <>
            <ProTable<UserDto>
                headerTitle="用户管理"
                actionRef={actionRef}
                rowKey="id"
                search={false}
                dataSource={users}
                loading={isLoading}
                columns={columns}
                toolBarRender={() => [
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setCurrentRow(undefined);
                            setModalVisible(true);
                        }}
                    >
                        新建用户
                    </Button>
                ]}
            />
            <ModalForm
                title={currentRow ? "编辑用户" : "新建用户"}
                open={modalVisible}
                onOpenChange={setModalVisible}
                modalProps={{
                    destroyOnHidden: true,
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

