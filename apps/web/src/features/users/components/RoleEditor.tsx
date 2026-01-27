import React from 'react';
import {
    PageContainer,
    ProForm,
    ProFormText,
    ProFormTextArea,
    ProFormDigit,
    ProFormSelect,
    ProFormSwitch,
} from '@ant-design/pro-components';
import { App, Card, Grid } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { CreateRoleDto, UpdateRoleDto } from '@packages/types';
import { useCreateRole, useUpdateRole } from '../api/roles';

export const RoleEditor: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const isEdit = !!id;

    const createRole = useCreateRole();
    const updateRole = useUpdateRole();

    const loadData = async () => {
        if (!isEdit || !id) {
            return { isSystem: false, status: 'ACTIVE' };
        }
        try {
            const res = await fetch(`/api/roles/${id}`);
            if (!res.ok) {
                throw new Error('加载失败');
            }
            return await res.json();
        } catch {
            message.error('加载失败');
            return {};
        }
    };

    const handleFinish = async (values: CreateRoleDto | UpdateRoleDto) => {
        try {
            if (isEdit && id) {
                await updateRole.mutateAsync({ id, data: values as UpdateRoleDto });
                message.success('更新成功');
            } else {
                await createRole.mutateAsync(values as CreateRoleDto);
                message.success('创建成功');
            }
            navigate('/roles');
            return true;
        } catch (error: unknown) {
            const err = error as Error;
            message.error(err.message || '操作失败');
            return false;
        }
    };

    return (
        <PageContainer
            title={!isMobile ? (isEdit ? '编辑角色' : '新建角色') : undefined}
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
                <ProForm<CreateRoleDto>
                    key={isEdit ? id : 'new'}
                    request={loadData}
                    onFinish={handleFinish}
                    layout="vertical"
                    submitter={{
                        searchConfig: { submitText: '保存', resetText: '取消' },
                        resetButtonProps: {
                            onClick: (event) => {
                                event.preventDefault();
                                navigate('/roles');
                            },
                        },
                    }}
                >
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
                        disabled={isEdit}
                    />
                    <ProFormSwitch
                        name="isSystem"
                        label="系统内置"
                        tooltip="系统内置角色不可删除"
                    />
                    <ProFormDigit name="sortOrder" label="排序" placeholder="请输入排序号" />
                    <ProFormSelect
                        name="status"
                        label="状态"
                        options={[
                            { value: 'ACTIVE', label: '启用' },
                            { value: 'INACTIVE', label: '禁用' },
                        ]}
                    />
                    <ProFormTextArea name="description" label="描述" placeholder="请输入描述" />
                </ProForm>
            </Card>
        </PageContainer>
    );
};
