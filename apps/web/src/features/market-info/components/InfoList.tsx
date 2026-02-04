import React, { useRef, useMemo, useState } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined, FilterOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Popconfirm, Tag, App, Grid, Input, Flex, Card, Typography, Space, Select, Collapse, Badge, theme } from 'antd';
import { InfoResponse, TagScope, TagResponse } from '@packages/types';
import { useInfos, useDeleteInfo } from '../api/info';
import { useCategories } from '../api/categories';
import { useGlobalTags } from '../../tags/api/tags';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useDictionary } from '@/hooks/useDictionaries';

export const InfoList: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();

    // 移动端筛选状态
    const [searchText, setSearchText] = useState('');
    const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined);
    const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

    const { data: infos, isLoading } = useInfos();
    const { data: categories } = useCategories();
    const { data: tags } = useGlobalTags({ scope: TagScope.MARKET_INFO });
    const { data: infoStatusDict } = useDictionary('INFO_STATUS');
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
        tags?.forEach((t: TagResponse) => {
            enumObj[t.id] = t.name;
        });
        return enumObj;
    }, [tags]);

    const infoStatusValueEnum = useMemo(() => {
        const items = (infoStatusDict || []).filter((item) => item.isActive);
        const fallback = {
            DRAFT: { text: '草稿', status: 'Default' },
            PUBLISHED: { text: '已发布', status: 'Success' },
            ARCHIVED: { text: '已归档', status: 'Warning' },
        };
        if (!items.length) return fallback;
        const statusMap: Record<string, string> = {
            processing: 'Processing',
            success: 'Success',
            warning: 'Warning',
            error: 'Error',
            default: 'Default',
        };
        return items.reduce<Record<string, { text: string; status: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color || 'default';
            acc[item.code] = { text: item.label, status: statusMap[color] || 'Default' };
            return acc;
        }, {});
    }, [infoStatusDict]);

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
            responsive: ['md'],
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
            responsive: ['lg'],
        },
        {
            title: '状态',
            dataIndex: 'status',
            valueEnum: infoStatusValueEnum,
            responsive: ['md'],
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
            responsive: ['xl'],
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

    const request = async (params: any) => {
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
    };

    const toolBarRender = () => [
        <Button
            type="primary"
            key="primary"
            onClick={() => navigate('/market/info/new')}
        >
            <PlusOutlined /> {screens.md ? '新建信息' : '新建'}
        </Button>,
    ];

    // 移动端筛选数据
    const filteredMobileData = useMemo(() => {
        let result = infos || [];

        if (searchText) {
            result = result.filter(item =>
                item.title.toLowerCase().includes(searchText.toLowerCase())
            );
        }

        if (filterCategory) {
            result = result.filter(item => item.category?.id === filterCategory);
        }

        if (filterStatus) {
            result = result.filter(item => item.status === filterStatus);
        }

        return result;
    }, [infos, searchText, filterCategory, filterStatus]);

    // 计算当前筛选条件数量
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filterCategory) count++;
        if (filterStatus) count++;
        return count;
    }, [filterCategory, filterStatus]);

    // 状态配置
    const statusConfig = useMemo(() => {
        const items = (infoStatusDict || []).filter((item) => item.isActive);
        const fallback: Record<string, { text: string; color: string }> = {
            DRAFT: { text: '草稿', color: 'default' },
            PUBLISHED: { text: '已发布', color: 'success' },
            ARCHIVED: { text: '已归档', color: 'warning' },
        };
        if (!items.length) return fallback;
        return items.reduce<Record<string, { text: string; color: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color || 'default';
            acc[item.code] = { text: item.label, color };
            return acc;
        }, {});
    }, [infoStatusDict]);

    // 移动端视图
    if (!screens.md) {
        return (
            <Flex vertical gap="middle" style={{ padding: token.paddingSM }}>
                {/* 标题栏 */}
                <Flex justify="space-between" align="center">
                    <Typography.Title level={4} style={{ margin: 0 }}>
                        信息采集
                    </Typography.Title>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/market/info/new')}
                    >
                        新建
                    </Button>
                </Flex>

                {/* 搜索框 */}
                <Input.Search
                    placeholder="搜索信息标题..."
                    allowClear
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ borderRadius: token.borderRadiusLG }}
                />

                {/* 可折叠筛选区 */}
                <Collapse
                    ghost
                    expandIconPosition="end"
                    items={[{
                        key: 'filter',
                        label: (
                            <Space>
                                <FilterOutlined />
                                <span>高级筛选</span>
                                {activeFilterCount > 0 && (
                                    <Badge count={activeFilterCount} size="small" />
                                )}
                            </Space>
                        ),
                        children: (
                            <Flex vertical gap="small">
                                <Select
                                    placeholder="选择分类"
                                    allowClear
                                    value={filterCategory}
                                    onChange={setFilterCategory}
                                    options={categories?.map(c => ({ label: c.name, value: c.id }))}
                                    style={{ width: '100%' }}
                                />
                                <Select
                                    placeholder="选择状态"
                                    allowClear
                                    value={filterStatus}
                                    onChange={setFilterStatus}
                                    options={[
                                        { label: '草稿', value: 'DRAFT' },
                                        { label: '已发布', value: 'PUBLISHED' },
                                        { label: '已归档', value: 'ARCHIVED' },
                                    ]}
                                    style={{ width: '100%' }}
                                />
                                {activeFilterCount > 0 && (
                                    <Button
                                        type="link"
                                        size="small"
                                        onClick={() => {
                                            setFilterCategory(undefined);
                                            setFilterStatus(undefined);
                                        }}
                                    >
                                        清除筛选
                                    </Button>
                                )}
                            </Flex>
                        ),
                    }]}
                />

                {/* 卡片列表 */}
                <Flex vertical gap="small">
                    {isLoading ? (
                        <Card loading style={{ borderRadius: token.borderRadiusLG }} />
                    ) : filteredMobileData.length === 0 ? (
                        <div style={{ textAlign: 'center', color: token.colorTextSecondary, padding: token.paddingLG }}>
                            暂无数据
                        </div>
                    ) : (
                        filteredMobileData.map(record => (
                            <Card
                                key={record.id}
                                size="small"
                                hoverable
                                style={{
                                    borderRadius: token.borderRadiusLG,
                                    borderLeft: `3px solid ${token.colorPrimary}`,
                                }}
                                onClick={() => navigate(`/market/info/edit/${record.id}`)}
                            >
                                <Flex vertical gap="small">
                                    {/* 标题行 */}
                                    <Flex justify="space-between" align="flex-start" gap="small">
                                        <Typography.Text strong ellipsis style={{ flex: 1 }}>
                                            {record.title}
                                        </Typography.Text>
                                        <Tag color={statusConfig[record.status]?.color || 'default'}>
                                            {statusConfig[record.status]?.text || record.status}
                                        </Tag>
                                    </Flex>

                                    {/* 分类和标签 */}
                                    <Flex wrap="wrap" gap="small" align="center">
                                        {record.category && (
                                            <Tag color="blue">{record.category.name}</Tag>
                                        )}
                                        {record.tags?.slice(0, 2).map(tag => (
                                            <Tag key={tag.id} color={tag.color || 'default'}>
                                                {tag.name}
                                            </Tag>
                                        ))}
                                        {(record.tags?.length || 0) > 2 && (
                                            <Tag>+{(record.tags?.length || 0) - 2}</Tag>
                                        )}
                                    </Flex>

                                    {/* 时间和操作 */}
                                    <Flex justify="space-between" align="center">
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}
                                        </Typography.Text>
                                        <Space size="small">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<EditOutlined />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/market/info/edit/${record.id}`);
                                                }}
                                            />
                                            <Popconfirm
                                                title="确定删除吗?"
                                                onConfirm={(e) => {
                                                    e?.stopPropagation();
                                                    handleDelete(record.id);
                                                }}
                                                onCancel={(e) => e?.stopPropagation()}
                                            >
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </Popconfirm>
                                        </Space>
                                    </Flex>
                                </Flex>
                            </Card>
                        ))
                    )}
                </Flex>
            </Flex>
        );
    }

    return (
        <ProTable<InfoResponse>
            headerTitle="信息采集列表"
            actionRef={actionRef}
            rowKey="id"
            search={{
                labelWidth: 120,
                filterType: 'query',
            }}
            cardBordered
            toolBarRender={toolBarRender}
            request={request}
            params={{ _refresh: infos }}
            loading={isLoading}
            columns={columns}
        />
    );
};
