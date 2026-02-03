import React, { useMemo } from 'react';
import { Badge, Button, Space, Typography, Tag, Select, Segmented, Table, Tooltip } from 'antd';
import { ProCard, ProTable } from '@ant-design/pro-components';
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, AppstoreOutlined, BarsOutlined, FormOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    IntelTaskStatus,
    INTEL_TASK_TYPE_LABELS,
    IntelTaskResponse,
    IntelTaskPriority
} from '@packages/types';
import { useCompleteTask, useTasks } from '../../../api/tasks';
import { useUsers } from '../../../../users/api/users';
import { useVirtualUser, ADMIN_USER } from '@/features/auth/virtual-user';

const { Text } = Typography;

export const MyTaskBoard: React.FC = () => {
    const { currentUser, isVirtual } = useVirtualUser();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const [viewMode, setViewMode] = React.useState<'BOARD' | 'TABLE'>('BOARD');

    const taskQuery = {
        page: 1,
        pageSize: 500,
        ...(currentUser?.id ? { assigneeId: currentUser.id } : {}),
    };
    const { data } = useTasks(taskQuery); // Get all my tasks
    const tasks = data?.data || [];
    const completeMutation = useCompleteTask();

    const columns = [
        { title: '待办任务', status: IntelTaskStatus.PENDING, color: 'blue', icon: <ClockCircleOutlined /> },
        { title: '即将超时', status: IntelTaskStatus.OVERDUE, color: 'red', icon: <ExclamationCircleOutlined /> }, // Logic: Overdue or near deadline
        { title: '已完成', status: IntelTaskStatus.COMPLETED, color: 'green', icon: <CheckCircleOutlined /> },
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
                                            <Tag color={task.priority === IntelTaskPriority.URGENT ? 'red' : 'blue'}>
                                                {task.priority === IntelTaskPriority.URGENT ? '紧急' : '普通'}
                                            </Tag>
                                        </div>
                                        <Space size="small" style={{ fontSize: 12, color: '#888' }}>
                                            <Tag>{INTEL_TASK_TYPE_LABELS[task.type]}</Tag>
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
                            render: (_, r) => <Tag>{INTEL_TASK_TYPE_LABELS[r.type]}</Tag>
                        },
                        {
                            title: '截止时间',
                            dataIndex: 'dueAt',
                            valueType: 'dateTime',
                        },
                        {
                            title: '状态',
                            dataIndex: 'status',
                            valueEnum: {
                                [IntelTaskStatus.PENDING]: { text: '待办', status: 'Processing' },
                                [IntelTaskStatus.OVERDUE]: { text: '已逾期', status: 'Error' },
                                [IntelTaskStatus.COMPLETED]: { text: '已完成', status: 'Success' },
                            }
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
