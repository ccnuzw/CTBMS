import React, { useRef, useState, useMemo } from 'react';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    BankOutlined,
    ApartmentOutlined,
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
    TreeSelect,
    Form,
} from 'antd';
import {
    OrganizationDto,
    CreateOrganizationDto,
    OrganizationType,
    OrganizationTreeNode,
} from '@packages/types';
import {
    useOrganizations,
    useOrganizationTree,
    useCreateOrganization,
    useUpdateOrganization,
    useDeleteOrganization,
} from '../api/organizations';
import {
    ModalForm,
    ProFormText,
    ProFormTextArea,
    ProFormDigit,
    ProFormSelect,
} from '@ant-design/pro-components';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

// 扩展类型
interface OrganizationWithRelations extends OrganizationDto {
    parent?: OrganizationDto | null;
    _count?: { children: number; departments: number };
}

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

export const OrgList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<OrganizationWithRelations | undefined>(undefined);
    const [searchText, setSearchText] = useState('');
    const { containerRef, autoFocusFieldProps, modalProps: orgModalProps } = useModalAutoFocus();

    const { data: organizations, isLoading } = useOrganizations();
    const { data: orgTree } = useOrganizationTree();
    const createOrg = useCreateOrganization();
    const updateOrg = useUpdateOrganization();
    const deleteOrg = useDeleteOrganization();

    const handleEdit = (record: OrganizationWithRelations) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteOrg.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch {
            // Error handled by interceptor
        }
    };

    const handleSubmit = async (values: CreateOrganizationDto) => {
        try {
            if (currentRow) {
                const { name, type, description, parentId, sortOrder, status } = values;
                const payload: Record<string, unknown> = {};
                if (name !== undefined) payload.name = name;
                if (type !== undefined) payload.type = type;
                if (description !== undefined) payload.description = description || null;
                if (parentId !== undefined) payload.parentId = parentId || null;
                if (sortOrder !== undefined && sortOrder !== null) {
                    payload.sortOrder = Number(sortOrder);
                }
                if (status !== undefined) payload.status = status;

                await updateOrg.mutateAsync({ id: currentRow.id, data: payload as CreateOrganizationDto });
                message.success('更新成功');
            } else {
                await createOrg.mutateAsync(values);
                message.success('创建成功');
            }
            setEditModalVisible(false);
            actionRef.current?.reload();
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    };

    const filteredOrganizations = useMemo(() => {
        if (!organizations) return [];
        if (!searchText) return organizations;
        return organizations.filter(
            (item) =>
                item.name.toLowerCase().includes(searchText.toLowerCase()) ||
                item.code.toLowerCase().includes(searchText.toLowerCase()),
        );
    }, [organizations, searchText]);

    const columns: ProColumns<OrganizationWithRelations>[] = [
        {
            title: '名称',
            dataIndex: 'name',
            copyable: true,
            ellipsis: true,
            formItemProps: {
                rules: [{ required: true, message: '此项为必填项' }],
            },
        },
        {
            title: '编码',
            dataIndex: 'code',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '类型',
            dataIndex: 'type',
            render: (_, record) => {
                const typeInfo = ORG_TYPE_MAP[record.type as OrganizationType];
                return <Tag color={typeInfo?.color}>{typeInfo?.label || record.type}</Tag>;
            },
            filters: Object.entries(ORG_TYPE_MAP).map(([key, val]) => ({
                text: val.label,
                value: key,
            })),
            onFilter: (value, record) => record.type === value,
            search: false,
        },
        {
            title: '上级组织',
            dataIndex: ['parent', 'name'],
            ellipsis: true,
            search: false,
            responsive: ['md'],
        },
        {
            title: '子组织',
            dataIndex: ['_count', 'children'],
            search: false,
            responsive: ['lg'],
        },
        {
            title: '部门数',
            dataIndex: ['_count', 'departments'],
            search: false,
            responsive: ['lg'],
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            sorter: (a, b) => a.sortOrder - b.sortOrder,
            search: false,
            responsive: ['xl'],
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
                <Popconfirm key="delete" title="确定删除吗?" onConfirm={() => handleDelete(record.id)}>
                    <Button type="primary" size="small" danger icon={<DeleteOutlined />}>
                        删除
                    </Button>
                </Popconfirm>,
            ],
        },
    ];

    // 表单组件
    const FormContent = () => (
        <div ref={containerRef}>
            <ProFormText
                name="name"
                label="组织名称"
                placeholder="请输入名称"
                rules={[{ required: true, message: '请输入名称' }]}
                fieldProps={autoFocusFieldProps as any}
            />
            <ProFormText
                name="code"
                label="组织编码"
                placeholder="请输入编码"
                rules={[{ required: true, message: '请输入编码' }]}
                disabled={!!currentRow}
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
                    treeData={convertToTreeSelectData(orgTree || [], currentRow?.id)}
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
        </div>
    );

    // 移动端视图
    if (!screens.md) {
        return (
            <>
                <Flex vertical gap="middle" style={{ padding: token.paddingSM }}>
                    {/* 标题栏 */}
                    <Flex justify="space-between" align="center">
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            组织架构
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    {/* 搜索框 */}
                    <Input.Search
                        placeholder="搜索组织名称/编码"
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />

                    {/* 卡片列表 */}
                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredOrganizations.length === 0 ? (
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
                            filteredOrganizations.map((record) => {
                                const typeInfo = ORG_TYPE_MAP[record.type as OrganizationType];
                                return (
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
                                            {/* 标题行 */}
                                            <Flex justify="space-between" align="center">
                                                <Space>
                                                    <BankOutlined style={{ color: token.colorPrimary }} />
                                                    <Typography.Text strong>{record.name}</Typography.Text>
                                                    <Tag color={typeInfo?.color} style={{ marginLeft: 4 }}>
                                                        {typeInfo?.label || record.type}
                                                    </Tag>
                                                </Space>
                                                <Space size="small">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<EditOutlined />}
                                                        onClick={() => handleEdit(record)}
                                                    />
                                                    <Popconfirm
                                                        title="确定删除吗?"
                                                        onConfirm={() => handleDelete(record.id)}
                                                    >
                                                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                </Space>
                                            </Flex>

                                            {/* 信息区 */}
                                            <Flex vertical gap={4}>
                                                <Flex gap="small">
                                                    <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 50 }}>
                                                        编码:
                                                    </Typography.Text>
                                                    <Typography.Text copyable style={{ fontSize: 12 }}>
                                                        {record.code}
                                                    </Typography.Text>
                                                </Flex>
                                                {record.parent && (
                                                    <Flex gap="small">
                                                        <Typography.Text
                                                            type="secondary"
                                                            style={{ fontSize: 12, minWidth: 50 }}
                                                        >
                                                            上级:
                                                        </Typography.Text>
                                                        <Typography.Text style={{ fontSize: 12 }}>
                                                            {record.parent.name}
                                                        </Typography.Text>
                                                    </Flex>
                                                )}
                                                <Flex gap="middle">
                                                    <Space size={4}>
                                                        <ApartmentOutlined style={{ color: token.colorTextSecondary }} />
                                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                            {record._count?.children || 0} 个子组织
                                                        </Typography.Text>
                                                    </Space>
                                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                        {record._count?.departments || 0} 个部门
                                                    </Typography.Text>
                                                </Flex>
                                            </Flex>
                                        </Flex>
                                    </Card>
                                );
                            })
                        )}
                    </Flex>
                </Flex>

                <ModalForm
                    title={currentRow ? '编辑组织' : '新建组织'}
                    width="500px"
                    visible={editModalVisible}
                    onVisibleChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow || { status: 'ACTIVE' }}
                    modalProps={{
                        ...orgModalProps,
                        destroyOnClose: true,
                        focusTriggerAfterClose: false,
                    }}
                >
                    <FormContent />
                </ModalForm>
            </>
        );
    }

    // 桌面端视图
    return (
        <>
            <ProTable<OrganizationWithRelations>
                headerTitle="组织架构管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
                    filterType: 'query',
                }}
                toolBarRender={() => [
                    <Button type="primary" key="primary" onClick={handleAdd}>
                        <PlusOutlined /> 新建
                    </Button>,
                ]}
                dataSource={organizations}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑组织' : '新建组织'}
                width="500px"
                visible={editModalVisible}
                onVisibleChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow || { status: 'ACTIVE' }}
                modalProps={{
                    ...orgModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
            >
                <FormContent />
            </ModalForm>
        </>
    );
};
