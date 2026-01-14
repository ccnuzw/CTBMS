import React, { useRef, useState, useMemo } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, App, Grid, Input, Flex, Card, Typography, Space, theme } from 'antd';
import { CategoryResponse, CreateCategoryDto, UpdateCategoryDto } from '@packages/types';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../api/categories';
import { ModalForm, ProFormText, ProFormTextArea, ProFormDigit } from '@ant-design/pro-components';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

export const CategoryList: React.FC = () => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<CategoryResponse | undefined>(undefined);
    const [searchText, setSearchText] = useState('');
    const { containerRef, autoFocusFieldProps, modalProps: categoryModalProps } = useModalAutoFocus();

    const { data: categories, isLoading } = useCategories();
    const createCategory = useCreateCategory();
    const updateCategory = useUpdateCategory();
    const deleteCategory = useDeleteCategory();

    const handleEdit = (record: CategoryResponse) => {
        setCurrentRow(record);
        setEditModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentRow(undefined);
        setEditModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteCategory.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch (error) {
            // Error handled by interceptor
        }
    };

    const handleSubmit = async (values: CreateCategoryDto) => {
        try {
            if (currentRow) {
                // Remove code from update if it's disabled/not meant to be updated
                const { name, description, sortOrder } = values;
                const payload: Record<string, unknown> = {};
                if (name !== undefined) payload.name = name;
                if (description !== undefined) payload.description = description || null;
                if (sortOrder !== undefined && sortOrder !== null) {
                    payload.sortOrder = Number(sortOrder);
                }
                console.log('Sending payload:', payload);
                await updateCategory.mutateAsync({ id: currentRow.id, data: payload as any });
                message.success('更新成功');
            } else {
                await createCategory.mutateAsync(values);
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

    const filteredCategories = useMemo(() => {
        if (!categories) return [];
        if (!searchText) return categories;
        return categories.filter(item =>
            item.name.toLowerCase().includes(searchText.toLowerCase()) ||
            item.code.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [categories, searchText]);

    const columns: ProColumns<CategoryResponse>[] = [
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
            formItemProps: {
                rules: [{ required: true, message: '此项为必填项' }],
            },
        },
        {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
            search: false,
            responsive: ['md'],
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            sorter: (a, b) => a.sortOrder - b.sortOrder,
            search: false,
            responsive: ['xl'],
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
            render: (text, record, _, action) => [
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
                    <Button type="primary" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>,
            ],
        },
    ];

    // 移动端视图
    if (!screens.md) {
        return (
            <>
                <Flex vertical gap="middle" style={{ padding: token.paddingSM }}>
                    {/* 标题栏 */}
                    <Flex justify="space-between" align="center">
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            分类管理
                        </Typography.Title>
                        <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
                            新建
                        </Button>
                    </Flex>

                    {/* 搜索框 */}
                    <Input.Search
                        placeholder="搜索分类名称/编码"
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />

                    {/* 卡片列表 */}
                    <Flex vertical gap="small">
                        {isLoading ? (
                            <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                        ) : filteredCategories.length === 0 ? (
                            <div style={{ textAlign: 'center', color: token.colorTextSecondary, padding: token.paddingLG }}>
                                暂无数据
                            </div>
                        ) : (
                            filteredCategories.map(record => (
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
                                                <TagOutlined style={{ color: token.colorPrimary }} />
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
                                                <Typography.Text type="secondary" style={{ fontSize: 12, minWidth: 40 }}>
                                                    编码:
                                                </Typography.Text>
                                                <Typography.Text copyable style={{ fontSize: 12 }}>
                                                    {record.code}
                                                </Typography.Text>
                                            </Flex>
                                            {record.description && (
                                                <Typography.Text
                                                    type="secondary"
                                                    ellipsis
                                                    style={{ fontSize: 12 }}
                                                >
                                                    {record.description}
                                                </Typography.Text>
                                            )}
                                        </Flex>
                                    </Flex>
                                </Card>
                            ))
                        )}
                    </Flex>
                </Flex>

                <ModalForm
                    title={currentRow ? '编辑分类' : '新建分类'}
                    width="500px"
                    visible={editModalVisible}
                    onVisibleChange={setEditModalVisible}
                    onFinish={handleSubmit}
                    initialValues={currentRow}
                    modalProps={{
                        ...categoryModalProps,
                        destroyOnClose: true,
                        focusTriggerAfterClose: false,
                    }}
                >
                    <div ref={containerRef}>
                        <ProFormText
                            name="name"
                            label="分类名称"
                            placeholder="请输入名称"
                            rules={[{ required: true, message: '请输入名称' }]}
                            fieldProps={autoFocusFieldProps}
                        />
                        <ProFormText
                            name="code"
                            label="分类编码"
                            placeholder="请输入编码"
                            rules={[{ required: true, message: '请输入编码' }]}
                            disabled={!!currentRow}
                        />
                        <ProFormDigit
                            name="sortOrder"
                            label="排序"
                            placeholder="请输入排序号"
                        />
                        <ProFormTextArea
                            name="description"
                            label="描述"
                            placeholder="请输入描述"
                        />
                    </div>
                </ModalForm>
            </>
        );
    }

    // 桌面端视图
    return (
        <>
            <ProTable<CategoryResponse>
                headerTitle="分类管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
                    filterType: 'query',
                }}
                toolBarRender={() => [
                    <Button
                        type="primary"
                        key="primary"
                        onClick={handleAdd}
                    >
                        <PlusOutlined /> 新建
                    </Button>,
                ]}
                dataSource={categories}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑分类' : '新建分类'}
                width="500px"
                visible={editModalVisible}
                onVisibleChange={setEditModalVisible}
                onFinish={handleSubmit}
                initialValues={currentRow}
                modalProps={{
                    ...categoryModalProps,
                    destroyOnClose: true,
                    focusTriggerAfterClose: false,
                }}
            >
                <div ref={containerRef}>
                    <ProFormText
                        name="name"
                        label="分类名称"
                        placeholder="请输入名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                        fieldProps={autoFocusFieldProps}
                    />
                    <ProFormText
                        name="code"
                        label="分类编码"
                        placeholder="请输入编码"
                        rules={[{ required: true, message: '请输入编码' }]}
                        disabled={!!currentRow}
                    />
                    <ProFormDigit
                        name="sortOrder"
                        label="排序"
                        placeholder="请输入排序号"
                    />
                    <ProFormTextArea
                        name="description"
                        label="描述"
                        placeholder="请输入描述"
                    />
                </div>
            </ModalForm>
        </>
    );
};
