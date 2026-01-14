import React from 'react';
import {
    PageContainer,
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormDatePicker,
} from '@ant-design/pro-components';
import { App, Card, Grid } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { CreateUserDto, UpdateUserDto } from '@packages/types';
import { useCreateUser, useUpdateUser } from '../api/users';

export const UserEditor: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const isEdit = !!id;

    const createUserMutation = useCreateUser();
    const updateUserMutation = useUpdateUser();

    const loadData = async () => {
        if (!isEdit || !id) {
            return { status: 'ACTIVE' };
        }
        try {
            const res = await fetch(`/api/users/${id}`);
            if (!res.ok) {
                throw new Error('加载失败');
            }
            const data = await res.json();
            return {
                ...data,
                birthday: data.birthday ? dayjs(data.birthday) : undefined,
            };
        } catch {
            message.error('加载失败');
            return {};
        }
    };

    const handleFinish = async (values: CreateUserDto | UpdateUserDto) => {
        try {
            if (isEdit && id) {
                await updateUserMutation.mutateAsync({ id, data: values as UpdateUserDto });
                message.success('用户更新成功');
            } else {
                await createUserMutation.mutateAsync(values as CreateUserDto);
                message.success('用户创建成功');
            }
            navigate('/users');
            return true;
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '操作失败');
            return false;
        }
    };

    return (
        <PageContainer
            title={!isMobile ? (isEdit ? '编辑用户' : '新建用户') : undefined}
            header={isMobile ? { title: undefined, breadcrumb: undefined } : undefined}
            style={isMobile ? { padding: 0, margin: 0 } : undefined}
        >
            <Card
                bordered={!isMobile}
                style={
                    isMobile
                        ? {
                            borderRadius: 0,
                            boxShadow: 'none',
                            margin: 0,
                        }
                        : undefined
                }
                bodyStyle={isMobile ? { padding: '12px' } : undefined}
            >
                <ProForm<CreateUserDto>
                    key={isEdit ? id : 'new'}
                    request={loadData}
                    onFinish={handleFinish}
                    layout="vertical"
                    submitter={{
                        searchConfig: { submitText: '保存', resetText: '取消' },
                        resetButtonProps: {
                            onClick: (event) => {
                                event.preventDefault();
                                navigate('/users');
                            },
                        },
                    }}
                >
                    <ProForm.Group>
                        <ProFormText
                            name="username"
                            label="用户名"
                            width="sm"
                            placeholder="用于登录"
                            rules={[{ required: true, message: '请输入用户名' }]}
                            disabled={isEdit}
                        />
                        <ProFormText
                            name="name"
                            label="姓名"
                            width="sm"
                            rules={[{ required: true, message: '请输入姓名' }]}
                        />
                    </ProForm.Group>
                    <ProForm.Group>
                        <ProFormText
                            name="email"
                            label="邮箱"
                            width="sm"
                            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
                            disabled={isEdit}
                        />
                        <ProFormText name="phone" label="电话" width="sm" />
                    </ProForm.Group>
                    <ProForm.Group>
                        <ProFormSelect
                            name="gender"
                            label="性别"
                            width="xs"
                            options={[
                                { value: 'MALE', label: '男' },
                                { value: 'FEMALE', label: '女' },
                                { value: 'OTHER', label: '其他' },
                            ]}
                        />
                        <ProFormDatePicker name="birthday" label="生日" width="sm" />
                        <ProFormText name="employeeNo" label="工号" width="sm" />
                    </ProForm.Group>
                    <ProForm.Group>
                        <ProFormSelect
                            name="status"
                            label="状态"
                            width="sm"
                            options={[
                                { value: 'ACTIVE', label: '在职' },
                                { value: 'PROBATION', label: '试用期' },
                                { value: 'RESIGNED', label: '离职' },
                                { value: 'SUSPENDED', label: '停职' },
                            ]}
                        />
                    </ProForm.Group>
                </ProForm>
            </Card>
        </PageContainer>
    );
};
