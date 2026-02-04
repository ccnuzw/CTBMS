import React, { useMemo } from 'react';
import { Badge, Button, Space, Typography, Tag, Select, Segmented, Table, Tooltip } from 'antd';
import { ProCard, ProTable } from '@ant-design/pro-components';
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, AppstoreOutlined, BarsOutlined, FormOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    IntelTaskStatus,
    IntelTaskResponse,
    IntelTaskPriority
} from '@packages/types';
import { useCompleteTask, useTasks } from '../../../api/tasks';
import { useUsers } from '../../../../users/api/users';
import { useVirtualUser, ADMIN_USER } from '@/features/auth/virtual-user';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Text } = Typography;

export const MyTaskBoard: React.FC = () => {
    const { currentUser, isVirtual } = useVirtualUser();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const [viewMode, setViewMode] = React.useState<'BOARD' | 'TABLE'>('BOARD');
    const { data: dictionaries } = useDictionaries(['INTEL_TASK_TYPE', 'INTEL_TASK_STATUS', 'INTEL_TASK_PRIORITY']);

    const taskQuery = {
        page: 1,
        pageSize: 500,
        ...(currentUser?.id ? { assigneeId: currentUser.id } : {}),
    };
    const { data } = useTasks(taskQuery); // Get all my tasks
    const tasks = data?.data || [];
    const completeMutation = useCompleteTask();

    const taskTypeLabels = useMemo(() => {
        const items = dictionaries?.INTEL_TASK_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return {} as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    const taskPriorityMeta = useMemo(() => {
        const items = dictionaries?.INTEL_TASK_PRIORITY?.filter((item) => item.isActive) || [];
        if (!items.length) return { labels: {} as Record<string, string>, colors: {} as Record<string, string> };
        return items.reduce<{ labels: Record<string, string>; colors: Record<string, string> }>(
            (acc, item) => {
                acc.labels[item.code] = item.label;
                const color = (item.meta as { color?: string } | null)?.color || 'default';
                acc.colors[item.code] = color;
                return acc;
            },
            { labels: {}, colors: {} },
        );
    }, [dictionaries]);

    const taskStatusMeta = useMemo(() => {
        const items = dictionaries?.INTEL_TASK_STATUS?.filter((item) => item.isActive) || [];
        const fallbackLabels: Record<string, string> = {
            [IntelTaskStatus.PENDING]: '待办',
            [IntelTaskStatus.OVERDUE]: '已逾期',
            [IntelTaskStatus.COMPLETED]: '已完成',
        };
        if (!items.length) {
            return {
                labels: fallbackLabels,
                valueEnum: {
                    [IntelTaskStatus.PENDING]: { text: fallbackLabels[IntelTaskStatus.PENDING], status: 'Processing' },
                    [IntelTaskStatus.OVERDUE]: { text: fallbackLabels[IntelTaskStatus.OVERDUE], status: 'Error' },
                    [IntelTaskStatus.COMPLETED]: { text: fallbackLabels[IntelTaskStatus.COMPLETED], status: 'Success' },
                },
            };
        }
        const statusMap: Record<string, string> = {
            processing: 'Processing',
            success: 'Success',
            warning: 'Warning',
            error: 'Error',
            default: 'Default',
        };
        const labels = items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
        const valueEnum = items.reduce<Record<string, { text: string; status: string }>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color || 'default';
            acc[item.code] = { text: item.label, status: statusMap[color] || 'Default' };
            return acc;
        }, {});
        return { labels, valueEnum };
    }, [dictionaries]);

    const columns = [
        { title: taskStatusMeta.labels[IntelTaskStatus.PENDING] || '待办任务', status: IntelTaskStatus.PENDING, color: 'blue', icon: <ClockCircleOutlined /> },
        { title: taskStatusMeta.labels[IntelTaskStatus.OVERDUE] || '即将超时', status: IntelTaskStatus.OVERDUE, color: 'red', icon: <ExclamationCircleOutlined /> },
        { title: taskStatusMeta.labels[IntelTaskStatus.COMPLETED] || '已完成', status: IntelTaskStatus.COMPLETED, color: 'green', icon: <CheckCircleOutlined /> },
    ];

    // Group tasks
    const groupedTasks = useMemo(() => {
        const groups: Record<string, IntelTaskResponse[]> = {
            [IntelTaskStatus.PENDING]: [],
            [IntelTaskStatus.OVERDUE]: [],
            [IntelTaskStatus.COMPLETED]: [],
        };
        tasks.forEach(t => {
            // Check if overdue manually if status is pending but time passed
            // The backend usually updates status to OVERDUE via cron, but frontend can display it too.
            // For this board, we rely on backend status.
            if (groups[t.status]) {
                groups[t.status].push(t);
            }
        });
        return groups;
    }, [tasks]);

    return (
        <div style={{ overflowX: 'auto', paddingBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Space>
                    <Text type="secondary">当前登录：</Text>
                    <Select
                        style={{ minWidth: 220 }}
                        value={currentUser?.id}
                        disabled
                        options={[
                            { label: ADMIN_USER.name, value: ADMIN_USER.id },
                            ...users.map(user => ({ label: user.name, value: user.id })),
                        ]}
                    />
                    {isVirtual && (
                        <Tag color="blue" style={{ margin: 0 }}>
                            虚拟登录
                        </Tag>
                    )}
                </Space>
                <Segmented
                    value={viewMode}
                    onChange={(v) => setViewMode(v as any)}
                    options={[
                        { label: '看板视图', value: 'BOARD', icon: <AppstoreOutlined /> },
                        { label: '列表视图 (批量)', value: 'TABLE', icon: <BarsOutlined /> },
                    ]}
                />
            </div>

            {viewMode === 'BOARD' ? (
                <ProCard ghost gutter={16} direction="row" style={{ minWidth: 1000 }}>
                    {columns.map(col => (
                        <ProCard
                            key={col.status}
                            title={<Space>{col.icon} {col.title}</Space>}
                            extra={<Badge count={groupedTasks[col.status]?.length} style={{ backgroundColor: col.color }} />}
                            headStyle={{ borderBottom: `2px solid ${col.color}` }}
                            style={{ height: '100%', backgroundColor: '#f5f5f5' }}
                            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}
                        >
                            {groupedTasks[col.status]?.map(task => (
                                <ProCard
                                    key={task.id}
                                    bordered
                                    hoverable
                                    size="small"
                                    style={{ borderRadius: 8 }}
                                    onClick={() => {
                                        // TODO: Navigate to detail or open drawer
                                    }}
                                >
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <Text strong ellipsis={{ tooltip: task.title }} style={{ maxWidth: 180 }}>{task.title}</Text>
                                            <Tag color={taskPriorityMeta.colors[task.priority] || (task.priority === IntelTaskPriority.URGENT ? 'red' : 'blue')}>
                                                {taskPriorityMeta.labels[task.priority] || task.priority}
                                            </Tag>
                                        </div>
                                        <Space size="small" style={{ fontSize: 12, color: '#888' }}>
                                            <Tag>{taskTypeLabels[task.type] || task.type}</Tag>
                                            <span>{dayjs(task.dueAt || task.deadline).format('MM-DD HH:mm')}</span>
                                        </Space>
                                        {(task as any).metadata?.collectionPointName && (
                                            <Tag icon={<ClockCircleOutlined />} color="cyan" style={{ marginTop: 4 }}>
                                                {(task as any).metadata.collectionPointName}
                                            </Tag>
                                        )}

                                        {col.status !== IntelTaskStatus.COMPLETED && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                                <Button
                                                    size="small"
                                                    type={col.status === IntelTaskStatus.OVERDUE ? 'primary' : 'default'}
                                                    danger={col.status === IntelTaskStatus.OVERDUE}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        completeMutation.mutate({ id: task.id });
                                                    }}
                                                >
                                                    完成
                                                </Button>
                                            </div>
                                        )}
                                    </Space>
                                </ProCard>
                            ))}
                        </ProCard>
                    ))}
                </ProCard>
            ) : (
                <ProTable<IntelTaskResponse>
                    dataSource={tasks}
                    rowKey="id"
                    pagination={{ pageSize: 20 }}
                    toolBarRender={() => [
                        <Button key="batch" type="primary">批量填报 (开发中)</Button>
                    ]}
                    columns={[
                        {
                            title: '任务名称',
                            dataIndex: 'title',
                            render: (dom, entity) => (
                                <Space direction="vertical" size={0}>
                                    <Text strong>{entity.title}</Text>
                                    {(entity as any).metadata?.collectionPointName && (
                                        <Tag color="cyan">{(entity as any).metadata.collectionPointName}</Tag>
                                    )}
                                </Space>
                            )
                        },
                        {
                            title: '类型',
                            dataIndex: 'type',
                            render: (_, r) => <Tag>{taskTypeLabels[r.type] || r.type}</Tag>
                        },
                        {
                            title: '截止时间',
                            dataIndex: 'dueAt',
                            valueType: 'dateTime',
                        },
                        {
                            title: '状态',
                            dataIndex: 'status',
                            valueEnum: taskStatusMeta.valueEnum
                        },
                        {
                            title: '操作',
                            valueType: 'option',
                            render: (_, record) => [
                                <Button
                                    key="fill"
                                    type="link"
                                    size="small"
                                    icon={<FormOutlined />}
                                    disabled={record.status === IntelTaskStatus.COMPLETED}
                                >
                                    去填报
                                </Button>,
                                <Button
                                    key="done"
                                    type="text"
                                    size="small"
                                    disabled={record.status === IntelTaskStatus.COMPLETED}
                                    onClick={() => completeMutation.mutate({ id: record.id })}
                                >
                                    完成
                                </Button>
                            ]
                        }
                    ]}
                />
            )}
        </div>
    );
};
