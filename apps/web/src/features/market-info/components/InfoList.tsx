import React, { useRef, useMemo } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Popconfirm, Tag, App } from 'antd';
import { InfoResponse } from '@packages/types';
import { useInfos, useDeleteInfo } from '../api/info';
import { useCategories } from '../api/categories';
import { useTags } from '../api/tags';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

export const InfoList: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const navigate = useNavigate();
    const { message } = App.useApp();

    const { data: infos, isLoading } = useInfos();
    const { data: categories } = useCategories();
    const { data: tags } = useTags();
    const deleteInfo = useDeleteInfo();

    // 构建分类筛选选项
    const categoryValueEnum = useMemo(() => {
        const enumObj: Record<string, string> = {};
        categories?.forEach(c => {
            enumObj[c.id] = c.name;
        });
        return enumObj;
    }, [categories]);

    // 构建标签筛选选项
    const tagValueEnum = useMemo(() => {
        const enumObj: Record<string, string> = {};
        tags?.forEach(t => {
            enumObj[t.id] = t.name;
        });
        return enumObj;
    }, [tags]);

    const handleDelete = async (id: string) => {
        try {
            await deleteInfo.mutateAsync(id);
            message.success('删除成功');
            actionRef.current?.reload();
        } catch (error) {
            // Error handled by interceptor
        }
    };

    const columns: ProColumns<InfoResponse>[] = [
        {
            title: '标题',
            dataIndex: 'title',
            copyable: true,
            ellipsis: true,
        },
        {
            title: '分类',
            dataIndex: 'categoryId',
            valueType: 'select',
            valueEnum: categoryValueEnum,
            render: (_, record) => record.category?.name || '-',
        },
        {
            title: '标签',
            dataIndex: 'tagIds',
            valueType: 'select',
            valueEnum: tagValueEnum,
            fieldProps: {
                mode: 'multiple',
            },
            render: (_, record) => (
                <>
                    {record.tags?.map((tag) => (
                        <Tag color={tag.color || 'blue'} key={tag.id}>
                            {tag.name}
                        </Tag>
                    ))}
                </>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            valueEnum: {
                DRAFT: { text: '草稿', status: 'Default' },
                PUBLISHED: { text: '已发布', status: 'Success' },
                ARCHIVED: { text: '已归档', status: 'Warning' },
            },
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateRange',
            render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss'),
            search: {
                transform: (value) => {
                    return {
                        startTime: value[0],
                        endTime: value[1],
                    };
                },
            },
        },
        {
            title: '操作',
            valueType: 'option',
            key: 'option',
            width: 180,
            render: (text, record) => [
                <Button
                    key="edit"
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => navigate(`/market/info/edit/${record.id}`)}
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

    // 前端筛选逻辑
    const filterData = (params: Record<string, any>) => {
        let result = infos || [];

        if (params.title) {
            result = result.filter(item =>
                item.title.toLowerCase().includes(params.title.toLowerCase())
            );
        }

        if (params.categoryId) {
            result = result.filter(item => item.category?.id === params.categoryId);
        }

        if (params.tagIds && params.tagIds.length > 0) {
            result = result.filter(item =>
                item.tags?.some(tag => params.tagIds.includes(tag.id))
            );
        }

        if (params.status) {
            result = result.filter(item => item.status === params.status);
        }

        if (params.startTime && params.endTime) {
            const start = dayjs(params.startTime).startOf('day');
            const end = dayjs(params.endTime).endOf('day');
            result = result.filter(item => {
                const created = dayjs(item.createdAt);
                return created.isAfter(start) && created.isBefore(end);
            });
        }

        return result;
    };

    return (
        <ProTable<InfoResponse>
            headerTitle="信息采集列表"
            actionRef={actionRef}
            rowKey="id"
            search={{ labelWidth: 120 }}
            toolBarRender={() => [
                <Button
                    type="primary"
                    key="primary"
                    onClick={() => navigate('/market/info/new')}
                >
                    <PlusOutlined /> 新建信息
                </Button>,
            ]}
            request={async (params) => {
                // 等待数据加载完成
                if (!infos) {
                    return { data: [], success: true };
                }
                const filteredData = filterData(params);
                return {
                    data: filteredData,
                    success: true,
                    total: filteredData.length,
                };
            }}
            params={{ _refresh: infos }} // 当 infos 变化时触发 request
            loading={isLoading}
            columns={columns}
        />
    );
};
