import React, { useEffect, useMemo, useState } from 'react';
import {
    PageContainer,
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormDigit,
    ProFormTextArea,
    ProFormTreeSelect,
} from '@ant-design/pro-components';
import { App, Card, Form, Grid, TreeSelect } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import {
    CreateDepartmentDto,
    DepartmentDto,
    DepartmentTreeNode,
} from '@packages/types';
import {
    useDepartmentTree,
    useCreateDepartment,
    useUpdateDepartment,
} from '../api/departments';
import { useOrganizations } from '../api/organizations';
import { apiClient } from '../../../api/client';
import { DeptFormFields } from './DeptFormFields';

// TreeSelect 数据节点类型
interface TreeSelectNode {
    value: string;
    title: string;
    label: string;
    children?: TreeSelectNode[];
}

// 将树形数据转换为 TreeSelect 格式
const convertToTreeSelectData = (
    nodes: DepartmentTreeNode[],
    excludeId?: string,
): TreeSelectNode[] => {
    return nodes
        .filter((node) => node.id !== excludeId)
        .map((node) => ({
            value: node.id,
            title: node.name,
            label: node.name,
            children: node.children?.length
                ? convertToTreeSelectData(node.children, excludeId)
                : undefined,
        }));
};

export const DeptEditor: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const isEdit = !!id;

    const [form] = Form.useForm<CreateDepartmentDto>();
    const [currentDept, setCurrentDept] = useState<DepartmentDto | undefined>(undefined);

    useEffect(() => {
        if (!isEdit) {
            setCurrentDept(undefined);
        }
    }, [isEdit]);

    const { data: organizations } = useOrganizations();
    const orgOptions = useMemo(
        () =>
            organizations?.map((org) => ({
                value: org.id,
                label: org.name,
            })) || [],
        [organizations],
    );

    const orgIdFromForm = Form.useWatch('organizationId', form);
    const orgIdForTree = currentDept?.organizationId || orgIdFromForm;
    const { data: deptTree } = useDepartmentTree(orgIdForTree || '', !!orgIdForTree);
    const createDept = useCreateDepartment();
    const updateDept = useUpdateDepartment();

    const treeData = useMemo(() => {
        if (!orgIdForTree) {
            return [];
        }
        return convertToTreeSelectData(deptTree || [], currentDept?.id);
    }, [deptTree, currentDept, orgIdForTree]);

    const loadData = async () => {
        if (!isEdit || !id) {
            return { status: 'ACTIVE' };
        }
        try {
            const res = await apiClient.get<DepartmentDto>(`/departments/${id}`);
            setCurrentDept(res.data);
            return res.data;
        } catch {
            message.error('加载失败');
            return {};
        }
    };

    const handleFinish = async (values: CreateDepartmentDto) => {
        const payload = {
            ...values,
            description: values.description || null,
            parentId: values.parentId || null,
        };

        try {
            if (isEdit && id) {
                const { code, organizationId, ...updatePayload } = payload;
                await updateDept.mutateAsync({
                    id,
                    data: updatePayload,
                });
                message.success('更新成功');
            } else {
                await createDept.mutateAsync(payload);
                message.success('创建成功');
            }
            navigate('/organization/departments');
            return true;
        } catch {
            message.error('操作失败');
            return false;
        }
    };

    return (
        <PageContainer
            title={!isMobile ? (isEdit ? '编辑部门' : '新建部门') : undefined}
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
                <ProForm<CreateDepartmentDto>
                    form={form}
                    key={isEdit ? id : 'new'}
                    request={async () => {
                        const data = await loadData();
                        return data as unknown as CreateDepartmentDto;
                    }}
                    onFinish={handleFinish}
                    layout="vertical"
                    grid={isMobile}
                    colProps={isMobile ? { span: 24 } : undefined}
                    submitter={{
                        searchConfig: { submitText: '保存', resetText: '取消' },
                        resetButtonProps: {
                            onClick: (event) => {
                                event.preventDefault();
                                navigate('/organization/departments');
                            },
                        },
                    }}
                >
                    <DeptFormFields
                        isEdit={isEdit}
                        orgOptions={orgOptions}
                        treeData={treeData}
                        orgIdForTree={orgIdForTree}
                    />
                </ProForm>
            </Card>
        </PageContainer >
    );
};
