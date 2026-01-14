import React, { useRef, useState, useMemo } from 'react';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    TagsOutlined,
} from '@ant-design/icons';
import { ActionType, ProColumns, ProTable, ModalForm, ProFormText, ProFormSelect, ProFormTextArea } from '@ant-design/pro-components';
import {
    Button,
    Popconfirm,
    Tag,
    App,
    ColorPicker,
    Form,
    Grid,
    Input,
    Flex,
    Card,
    Typography,
    Space,
    theme,
} from 'antd';
import { TagResponse, CreateTagDto, TagScope } from '@packages/types';
import {
    useGlobalTags,
    useCreateGlobalTag,
    useUpdateGlobalTag,
    useDeleteGlobalTag,
} from '../api/tags';
import { useTagGroups } from '../api/tag-groups';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

// 作用域选项
const SCOPE_OPTIONS = [
    { label: '全局', value: TagScope.GLOBAL },
    { label: '客户', value: TagScope.CUSTOMER },
    { label: '供应商', value: TagScope.SUPPLIER },
    { label: '物流供应商', value: TagScope.LOGISTICS },
    { label: '合同', value: TagScope.CONTRACT },
    { label: '信息采集', value: TagScope.MARKET_INFO },
];

// 作用域颜色映射
const SCOPE_COLOR_MAP: Record<TagScope, string> = {
    [TagScope.GLOBAL]: 'blue',
    [TagScope.CUSTOMER]: 'green',
    [TagScope.SUPPLIER]: 'orange',
    [TagScope.LOGISTICS]: 'purple',
    [TagScope.CONTRACT]: 'cyan',
    [TagScope.MARKET_INFO]: 'magenta',
};

export const GlobalTagList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<TagResponse | undefined>(undefined);
    const [searchText, setSearchText] = useState('');
    const { containerRef, autoFocusFieldProps, modalProps: tagModalProps } = useModalAutoFocus();

    const { data: tags, isLoading } = useGlobalTags();
    const { data: tagGroups } = useTagGroups();
    const createTag = useCreateGlobalTag();
    const updateTag = useUpdateGlobalTag();
    const deleteTag = useDeleteGlobalTag();

    const handleEdit = (record: TagResponse) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteTag.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch {
            // Error handled by interceptor
        }
    };

    const handleSubmit = async (values: CreateTagDto) => {
        try {
            if (currentRow) {
                await updateTag.mutateAsync({ id: currentRow.id, data: values });
                message.success('更新成功');
            } else {
                await createTag.mutateAsync(values);
                message.success('创建成功');
            }
            setEditModalVisible(false);
            actionRef.current?.reload();
            return true;
        } catch {
            return false;
        }
    };

    const filteredTags = useMemo(() => {
        if (!tags) return [];
        if (!searchText) return tags;
        return tags.filter((item) =>
            item.name.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [tags, searchText]);

    const columns: ProColumns<TagResponse>[] = [
        {
            title: '名称',
            dataIndex: 'name',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '颜色',
            dataIndex: 'color',
            render: (text) => (text ? <Tag color={text as string}>{text}</Tag> : '-'),
            search: false,
        },
        {
            title: '作用域',
            dataIndex: 'scopes',
            render: (_, record) => (
                <Space wrap size={4}>
                    {record.scopes?.map((scope) => (
                        <Tag key={scope} color={SCOPE_COLOR_MAP[scope]}>
                            {SCOPE_OPTIONS.find((o) => o.value === scope)?.label || scope}
                        </Tag>
                    ))}
                </Space>
            ),
            search: false,
        },
        {
            title: '标签组',
            dataIndex: ['group', 'name'],
            render: (text) => text || '-',
            search: false,
            responsive: ['md'],
        },
        {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
            search: false,
            responsive: ['lg'],
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
                            全局标签管理
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    <Input.Search
                        placeholder="搜索标签名称"
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />

                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredTags.length === 0 ? (
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
                            filteredTags.map((record) => (
                                <Card
                                    key={record.id}
                                    size="small"
                                    hoverable
                                    style={{
                                        borderRadius: token.borderRadiusLG,
                                        borderLeft: `3px solid ${record.color || token.colorPrimary}`,
                                    }}
                                >
                                    <Flex justify="space-between" align="center">
                                        <Space direction="vertical" size={4}>
                                            <Space>
                                                <TagsOutlined style={{ color: record.color || token.colorPrimary }} />
                                                <Typography.Text strong>{record.name}</Typography.Text>
                                                {record.color && (
                                                    <Tag color={record.color}>{record.color}</Tag>
                                                )}
                                            </Space>
                                            <Space wrap size={4}>
                                                {record.scopes?.map((scope) => (
                                                    <Tag key={scope} color={SCOPE_COLOR_MAP[scope]} style={{ fontSize: 10 }}>
                                                        {SCOPE_OPTIONS.find((o) => o.value === scope)?.label || scope}
                                                    </Tag>
                                                ))}
                                            </Space>
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
                    title={currentRow ? '编辑标签' : '新建标签'}
                    width="400px"
                    open={editModalVisible}
                    onOpenChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow || { scopes: [TagScope.GLOBAL] }}
                    modalProps={{
                        ...tagModalProps,
                        destroyOnClose: true,
                    }}
                >
                    <div ref={containerRef}>
                        <ProFormText
                            name="name"
                            label="标签名称"
                            placeholder="请输入名称"
                            rules={[{ required: true, message: '请输入名称' }]}
                            fieldProps={autoFocusFieldProps as any}
                        />
                        <Form.Item
                            name="color"
                            label="颜色"
                            getValueFromEvent={(color) => color?.toHexString?.() || color}
                        >
                            <ColorPicker showText allowClear />
                        </Form.Item>
                        <ProFormSelect
                            name="scopes"
                            label="作用域"
                            mode="multiple"
                            options={SCOPE_OPTIONS}
                            placeholder="选择作用域"
                        />
                        <ProFormSelect
                            name="groupId"
                            label="标签组"
                            options={tagGroups?.map((g) => ({ label: g.name, value: g.id })) || []}
                            placeholder="选择标签组（可选）"
                            allowClear
                        />
                        <ProFormTextArea name="description" label="描述" placeholder="标签描述（可选）" />
                    </div>
                </ModalForm>
            </>
        );
    }

    // 桌面端视图
    return (
        <>
            <ProTable<TagResponse>
                headerTitle="全局标签管理"
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
                dataSource={tags}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑标签' : '新建标签'}
                width="500px"
                open={editModalVisible}
                onOpenChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow || { scopes: [TagScope.GLOBAL] }}
                modalProps={{
                    ...tagModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
            >
                <div ref={containerRef}>
                    <ProFormText
                        name="name"
                        label="标签名称"
                        placeholder="请输入名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                        fieldProps={autoFocusFieldProps as any}
                    />
                    <Form.Item
                        name="color"
                        label="颜色"
                        getValueFromEvent={(color) => color?.toHexString?.() || color}
                    >
                        <ColorPicker showText allowClear />
                    </Form.Item>
                    <ProFormSelect
                        name="scopes"
                        label="作用域"
                        mode="multiple"
                        options={SCOPE_OPTIONS}
                        placeholder="选择作用域（可多选）"
                        rules={[{ required: true, message: '请选择至少一个作用域' }]}
                    />
                    <ProFormSelect
                        name="groupId"
                        label="标签组"
                        options={tagGroups?.map((g) => ({ label: g.name, value: g.id })) || []}
                        placeholder="选择标签组（可选，用于互斥逻辑）"
                        allowClear
                    />
                    <ProFormTextArea name="description" label="描述" placeholder="标签描述（可选）" />
                </div>
            </ModalForm>
        </>
    );
};
