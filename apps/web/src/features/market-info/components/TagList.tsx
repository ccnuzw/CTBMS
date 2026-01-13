import React, { useRef, useState } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Tag, App, ColorPicker, Form } from 'antd';
import { TagResponse, CreateTagDto } from '@packages/types';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../api/tags';
import { ModalForm, ProFormText } from '@ant-design/pro-components';

export const TagList: React.FC = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<TagResponse | undefined>(undefined);

    const { data: tags, isLoading } = useTags();
    const createTag = useCreateTag();
    const updateTag = useUpdateTag();
    const deleteTag = useDeleteTag();

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
        } catch (error) {
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
        } catch (error) {
            return false;
        }
    };

    const columns: ProColumns<TagResponse>[] = [
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
            title: '颜色',
            dataIndex: 'color',
            render: (text) => text ? <Tag color={text as string}>{text}</Tag> : '-',
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
            <ProTable<TagResponse>
                headerTitle="标签管理"
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
                dataSource={tags}
                loading={isLoading}
                columns={columns}
            />

            <ModalForm
                title={currentRow ? '编辑标签' : '新建标签'}
                width="400px"
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
                    label="标签名称"
                    placeholder="请输入名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                />
                <Form.Item
                    name="color"
                    label="颜色"
                    getValueFromEvent={(color) => color?.toHexString?.() || color}
                >
                    <ColorPicker showText allowClear />
                </Form.Item>
            </ModalForm>
        </>
    );
};
