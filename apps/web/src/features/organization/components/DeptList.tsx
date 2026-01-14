import React, { useRef, useState, useMemo } from 'react';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    TeamOutlined,
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
    Select,
    TreeSelect,
    Form,
} from 'antd';
import {
    DepartmentDto,
    CreateDepartmentDto,
    DepartmentTreeNode,
} from '@packages/types';
import {
    useDepartments,
    useDepartmentTree,
    useCreateDepartment,
    useUpdateDepartment,
    useDeleteDepartment,
} from '../api/departments';
import { useOrganizations } from '../api/organizations';
import {
    ModalForm,
    ProFormText,
    ProFormTextArea,
    ProFormDigit,
    ProFormSelect,
} from '@ant-design/pro-components';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

// 扩展类型
interface DepartmentWithRelations extends DepartmentDto {
    organization?: { id: string; name: string };
    parent?: DepartmentDto | null;
    _count?: { children: number };
}

// TreeSelect 数据节点类型
interface TreeSelectNode {
    value: string;
    title: string;
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
            children: node.children?.length
                ? convertToTreeSelectData(node.children, excludeId)
                : undefined,
        }));
};

export const DeptList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<DepartmentWithRelations | undefined>(undefined);
    const [searchText, setSearchText] = useState('');
    const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
    const { containerRef, autoFocusFieldProps, modalProps: deptModalProps } = useModalAutoFocus();

    const { data: organizations } = useOrganizations();
    const { data: departments, isLoading } = useDepartments(selectedOrgId);
    const { data: deptTree } = useDepartmentTree(selectedOrgId || '', !!selectedOrgId);
    const createDept = useCreateDepartment();
    const updateDept = useUpdateDepartment();
    const deleteDept = useDeleteDepartment();

    const handleEdit = (record: DepartmentWithRelations) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDept.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch {
            // Error handled by interceptor
        }
    };

    const handleSubmit = async (values: CreateDepartmentDto) => {
        try {
            if (currentRow) {
                const { name, code, description, parentId, sortOrder, status } = values;
                const payload: Record<string, unknown> = {};
                if (name !== undefined) payload.name = name;
                if (code !== undefined) payload.code = code;
                if (description !== undefined) payload.description = description || null;
                if (parentId !== undefined) payload.parentId = parentId || null;
                if (sortOrder !== undefined && sortOrder !== null) {
                    payload.sortOrder = Number(sortOrder);
                }
                if (status !== undefined) payload.status = status;

                await updateDept.mutateAsync({
                    id: currentRow.id,
                    data: payload as CreateDepartmentDto,
                });
                message.success('更新成功');
            } else {
                await createDept.mutateAsync(values);
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

    const filteredDepartments = useMemo(() => {
        if (!departments) return [];
        if (!searchText) return departments;
        return departments.filter(
            (item) =>
                item.name.toLowerCase().includes(searchText.toLowerCase()) ||
                item.code.toLowerCase().includes(searchText.toLowerCase()),
        );
    }, [departments, searchText]);

    const columns: ProColumns<DepartmentWithRelations>[] = [
        {
            title: '名称',
            dataIndex: 'name',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '编码',
            dataIndex: 'code',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '所属组织',
            dataIndex: ['organization', 'name'],
            ellipsis: true,
            search: false,
            responsive: ['md'],
        },
        {
            title: '上级部门',
            dataIndex: ['parent', 'name'],
            ellipsis: true,
            search: false,
            responsive: ['md'],
        },
        {
            title: '子部门',
            dataIndex: ['_count', 'children'],
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
                label="部门名称"
                placeholder="请输入名称"
                rules={[{ required: true, message: '请输入名称' }]}
                fieldProps={autoFocusFieldProps}
            />
            <ProFormText
                name="code"
                label="部门编码"
                placeholder="请输入编码"
                rules={[{ required: true, message: '请输入编码' }]}
                disabled={!!currentRow}
            />
            <ProFormSelect
                name="organizationId"
                label="所属组织"
                placeholder="请选择所属组织"
                rules={[{ required: true, message: '请选择所属组织' }]}
                disabled={!!currentRow}
                options={
                    organizations?.map((org) => ({
                        value: org.id,
                        label: org.name,
                    })) || []
                }
            />
            <Form.Item name="parentId" label="上级部门">
                <TreeSelect
                    placeholder="请选择上级部门（可选）"
                    allowClear
                    treeDefaultExpandAll
                    treeData={convertToTreeSelectData(deptTree || [], currentRow?.id)}
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
                            部门管理
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    {/* 筛选栏 */}
                    <Flex gap="small" vertical>
                        <Select
                            placeholder="筛选组织"
                            allowClear
                            style={{ width: '100%' }}
                            value={selectedOrgId}
                            onChange={setSelectedOrgId}
                            options={
                                organizations?.map((org) => ({
                                    value: org.id,
                                    label: org.name,
                                })) || []
                            }
                        />
                        <Input.Search
                            placeholder="搜索部门名称/编码"
                            allowClear
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ borderRadius: token.borderRadiusLG }}
                        />
                    </Flex>

                    {/* 卡片列表 */}
                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredDepartments.length === 0 ? (
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
                            filteredDepartments.map((record) => (
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
                                                <TeamOutlined style={{ color: token.colorPrimary }} />
                                                <Typography.Text strong>{record.name}</Typography.Text>
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
                                            {record.organization && (
                                                <Flex gap="small">
                                                    <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 50 }}>
                                                        组织:
                                                    </Typography.Text>
                                                    <Typography.Text style={{ fontSize: 12 }}>
                                                        {record.organization.name}
                                                    </Typography.Text>
                                                </Flex>
                                            )}
                                            {record.parent && (
                                                <Flex gap="small">
                                                    <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 50 }}>
                                                        上级:
                                                    </Typography.Text>
                                                    <Typography.Text style={{ fontSize: 12 }}>
                                                        {record.parent.name}
                                                    </Typography.Text>
                                                </Flex>
                                            )}
                                            <Space size={4}>
                                                <ApartmentOutlined style={{ color: token.colorTextSecondary }} />
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    {record._count?.children || 0} 个子部门
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
                    title={currentRow ? '编辑部门' : '新建部门'}
                    width="500px"
                    visible={editModalVisible}
                    onVisibleChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow || { status: 'ACTIVE' }}
                    modalProps={{
                        ...deptModalProps,
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
            <ProTable<DepartmentWithRelations>
                headerTitle="部门管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
                    filterType: 'query',
                }}
                toolbar={{
                    filter: (
                        <Select
                            placeholder="筛选组织"
                            allowClear
                            style={{ width: 200 }}
                            value={selectedOrgId}
                            onChange={setSelectedOrgId}
                            options={
                                organizations?.map((org) => ({
                                    value: org.id,
                                    label: org.name,
                                })) || []
                            }
                        />
                    ),
                }}
                toolBarRender={() => [
                    <Button type="primary" key="primary" onClick={handleAdd}>
                        <PlusOutlined /> 新建
                    </Button>,
                ]}
                dataSource={departments}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑部门' : '新建部门'}
                width="500px"
                visible={editModalVisible}
                onVisibleChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow || { status: 'ACTIVE' }}
                modalProps={{
                    ...deptModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
            >
                <FormContent />
            </ModalForm>
        </>
    );
};
