import React, { useMemo, useState, useEffect } from 'react';
import {
    PageContainer,
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormDigit,
    ProFormTextArea,
} from '@ant-design/pro-components';
import { App, Card, Form, Grid, TreeSelect } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import {
    OrganizationDto,
    OrganizationTreeNode,
    OrganizationType,
    CreateOrganizationDto,
} from '@packages/types';
import {
    useOrganizationTree,
    useCreateOrganization,
    useUpdateOrganization,
} from '../api/organizations';
import { apiClient } from '../../../api/client';

// 组织类型映射
const ORG_TYPE_MAP: Record<OrganizationType, { label: string; color: string }> = {
    HEADQUARTERS: { label: '总部', color: 'red' },
    REGION: { label: '大区', color: 'orange' },
    BRANCH: { label: '经营部', color: 'blue' },
    SUBSIDIARY: { label: '子公司', color: 'green' },
};

// TreeSelect 数据节点类型
interface TreeSelectNode {
    value: string;
    title: string;
    children?: TreeSelectNode[];
}

// 将树形数据转换为 TreeSelect 格式
const convertToTreeSelectData = (
    nodes: OrganizationTreeNode[],
    excludeId?: string,
): TreeSelectNode[] => {
    return nodes
        .filter((node) => node.id !== excludeId)
        .map((node) => ({
            value: node.id,
            title: node.name,
            children: node.children?.length
                ? convertToTreeSelectData(node.children, excludeId)
                : undefined,
        }));
};

export const OrgEditor: React.FC = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const isEdit = !!id;

    const [currentId, setCurrentId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!isEdit) {
            setCurrentId(undefined);
        }
    }, [isEdit]);

    const { data: orgTree } = useOrganizationTree();
    const createOrg = useCreateOrganization();
    const updateOrg = useUpdateOrganization();

    const treeData = useMemo(
        () => convertToTreeSelectData(orgTree || [], currentId),
        [orgTree, currentId],
    );

    const loadData = async () => {
        if (!isEdit || !id) {
            return { status: 'ACTIVE' };
        }
        try {
            const res = await apiClient.get<OrganizationDto>(`/organizations/${id}`);
            setCurrentId(res.data.id);
            return res.data;
        } catch {
            message.error('加载失败');
            return {};
        }
    };

    const handleFinish = async (values: CreateOrganizationDto) => {
        const payload = {
            ...values,
            description: values.description || null,
            parentId: values.parentId || null,
        };

        try {
            if (isEdit && id) {
                const { code, ...updatePayload } = payload;
                await updateOrg.mutateAsync({
                    id,
                    data: updatePayload,
                });
                message.success('更新成功');
            } else {
                await createOrg.mutateAsync(payload);
                message.success('创建成功');
            }
            navigate('/organization');
            return true;
        } catch {
            message.error('操作失败');
            return false;
        }
    };

    return (
        <PageContainer
            title={!isMobile ? (isEdit ? '编辑组织' : '新建组织') : undefined}
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
                <ProForm<CreateOrganizationDto>
                    key={isEdit ? id : 'new'}
                    request={loadData}
                    onFinish={handleFinish}
                    layout="vertical"
                    grid={isMobile}
                    colProps={isMobile ? { span: 24 } : undefined}
                    submitter={{
                        searchConfig: { submitText: '保存', resetText: '取消' },
                        resetButtonProps: {
                            onClick: (event) => {
                                event.preventDefault();
                                navigate('/organization');
                            },
                        },
                    }}
                >
                    <ProFormText
                        name="name"
                        label="组织名称"
                        placeholder="请输入名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                    />
                    <ProFormText
                        name="code"
                        label="组织编码"
                        placeholder="请输入编码"
                        rules={[{ required: true, message: '请输入编码' }]}
                        disabled={isEdit}
                    />
                    <ProFormSelect
                        name="type"
                        label="组织类型"
                        placeholder="请选择类型"
                        rules={[{ required: true, message: '请选择类型' }]}
                        options={Object.entries(ORG_TYPE_MAP).map(([key, val]) => ({
                            value: key,
                            label: val.label,
                        }))}
                    />
                    <Form.Item name="parentId" label="上级组织">
                        <TreeSelect
                            placeholder="请选择上级组织（可选）"
                            allowClear
                            treeDefaultExpandAll
                            treeData={treeData}
                        />
                    </Form.Item>
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
