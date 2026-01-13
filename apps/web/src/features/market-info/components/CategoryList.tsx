import React, { useRef, useState } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, App } from 'antd';
import { CategoryResponse, CreateCategoryDto, UpdateCategoryDto } from '@packages/types';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../api/categories';
import { ModalForm, ProFormText, ProFormTextArea, ProFormDigit } from '@ant-design/pro-components';

export const CategoryList: React.FC = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<CategoryResponse | undefined>(undefined);

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
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            sorter: (a, b) => a.sortOrder - b.sortOrder,
            search: false,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateTime',
            search: false,
            editable: false,
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

    return (
        <>
            <ProTable<CategoryResponse>
                headerTitle="分类管理"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
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
                // Use client-side data for small lists, or implement server-side pagination if needed.
                // Since our API currently returns all, we pass dataSource directly.
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
                    destroyOnHidden: true,
                }}
            >
                <ProFormText
                    name="name"
                    label="分类名称"
                    placeholder="请输入名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                />
                <ProFormText
                    name="code"
                    label="分类编码"
                    placeholder="请输入编码"
                    rules={[{ required: true, message: '请输入编码' }]}
                    disabled={!!currentRow} // Code usually immutable or handled carefully
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
            </ModalForm>
        </>
    );
};
