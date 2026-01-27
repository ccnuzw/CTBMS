import React, { useRef, useState, useMemo } from 'react';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FolderOutlined,
} from '@ant-design/icons';
import { ActionType, ProColumns, ProTable, ModalForm, ProFormText, ProFormTextArea, ProFormSwitch } from '@ant-design/pro-components';
import {
    Button,
    Popconfirm,
    Tag,
    App,
    Grid,
    Input,
    Flex,
    Card,
    Typography,
    Space,
    theme,
} from 'antd';
import { TagGroupResponse, CreateTagGroupDto } from '@packages/types';
import {
    useTagGroups,
    useCreateTagGroup,
    useUpdateTagGroup,
    useDeleteTagGroup,
} from '../api/tag-groups';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

export const TagGroupList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<TagGroupResponse | undefined>(undefined);
    const [searchText, setSearchText] = useState('');
    const { containerRef, autoFocusFieldProps, modalProps: groupModalProps } = useModalAutoFocus();

    const { data: groups, isLoading } = useTagGroups();
    const createGroup = useCreateTagGroup();
    const updateGroup = useUpdateTagGroup();
    const deleteGroup = useDeleteTagGroup();

    const handleEdit = (record: TagGroupResponse) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteGroup.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch {
            // Error handled by interceptor
        }
    };

    const handleSubmit = async (values: CreateTagGroupDto) => {
        try {
            if (currentRow) {
                await updateGroup.mutateAsync({ id: currentRow.id, data: values });
                message.success('更新成功');
            } else {
                await createGroup.mutateAsync(values);
                message.success('创建成功');
            }
            setEditModalVisible(false);
            actionRef.current?.reload();
            return true;
        } catch {
            return false;
        }
    };

    const filteredGroups = useMemo(() => {
        if (!groups) return [];
        if (!searchText) return groups;
        return groups.filter((item) =>
            item.name.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [groups, searchText]);

    const columns: ProColumns<TagGroupResponse>[] = [
        {
            title: '组名称',
            dataIndex: 'name',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '互斥',
            dataIndex: 'isExclusive',
            render: (_, record) =>
                record.isExclusive ? (
                    <Tag color="warning">互斥</Tag>
                ) : (
                    <Tag color="default">非互斥</Tag>
                ),
            search: false,
        },
        {
            title: '标签数量',
            dataIndex: ['_count', 'tags'],
            render: (text) => <Tag color="blue">{text || 0} 个</Tag>,
            search: false,
        },
        {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
            search: false,
            responsive: ['md'],
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateTime',
            search: false,
            editable: false,
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
                    description="删除标签组不会删除其中的标签"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <Button type="primary" size="small" danger icon={<DeleteOutlined />}>
                        删除
                    </Button>
                </Popconfirm>,
            ],
        },
    ];

    // 移动端视图
    if (!screens.md) {
        return (
            <>
                <Flex vertical gap="middle" style={{ padding: token.paddingSM }}>
                    <Flex justify="space-between" align="center">
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            标签组管理
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    <Input.Search
                        placeholder="搜索标签组名称"
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />

                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredGroups.length === 0 ? (
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
                            filteredGroups.map((record) => (
                                <Card
                                    key={record.id}
                                    size="small"
                                    hoverable
                                    style={{
                                        borderRadius: token.borderRadiusLG,
                                        borderLeft: `3px solid ${record.isExclusive ? token.colorWarning : token.colorPrimary}`,
                                    }}
                                >
                                    <Flex justify="space-between" align="center">
                                        <Space direction="vertical" size={4}>
                                            <Space>
                                                <FolderOutlined style={{ color: token.colorPrimary }} />
                                                <Typography.Text strong>{record.name}</Typography.Text>
                                                {record.isExclusive ? (
                                                    <Tag color="warning">互斥</Tag>
                                                ) : (
                                                    <Tag color="default">非互斥</Tag>
                                                )}
                                            </Space>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                {record._count?.tags || 0} 个标签
                                            </Typography.Text>
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
                                </Card>
                            ))
                        )}
                    </Flex>
                </Flex>

                <ModalForm
                    title={currentRow ? '编辑标签组' : '新建标签组'}
                    width="400px"
                    open={editModalVisible}
                    onOpenChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow || { isExclusive: true }}
                    modalProps={{
                        ...groupModalProps,
                        destroyOnClose: true,
                    }}
                >
                    <div ref={containerRef}>
                        <ProFormText
                            name="name"
                            label="组名称"
                            placeholder="请输入名称"
                            rules={[{ required: true, message: '请输入名称' }]}
                            fieldProps={autoFocusFieldProps as any}
                        />
                        <ProFormSwitch
                            name="isExclusive"
                            label="互斥"
                            tooltip="开启后，同一实体只能选择该组中的一个标签"
                        />
                        <ProFormTextArea name="description" label="描述" placeholder="标签组描述（可选）" />
                    </div>
                </ModalForm>
            </>
        );
    }

    // 桌面端视图
    return (
        <>
            <ProTable<TagGroupResponse>
                headerTitle="标签组管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
                    filterType: 'query',
                }}
                cardBordered
                toolBarRender={() => [
                    <Button type="primary" key="primary" onClick={handleAdd}>
                        <PlusOutlined /> 新建
                    </Button>,
                ]}
                dataSource={groups}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑标签组' : '新建标签组'}
                width="500px"
                open={editModalVisible}
                onOpenChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow || { isExclusive: true }}
                modalProps={{
                    ...groupModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
            >
                <div ref={containerRef}>
                    <ProFormText
                        name="name"
                        label="组名称"
                        placeholder="请输入名称（如：信用等级、客户类型）"
                        rules={[{ required: true, message: '请输入名称' }]}
                        fieldProps={autoFocusFieldProps as any}
                    />
                    <ProFormSwitch
                        name="isExclusive"
                        label="互斥"
                        tooltip="开启后，同一实体只能选择该组中的一个标签（如：高信用/低信用只能选一个）"
                    />
                    <ProFormTextArea name="description" label="描述" placeholder="标签组描述（可选）" />
                </div>
            </ModalForm>
        </>
    );
};
