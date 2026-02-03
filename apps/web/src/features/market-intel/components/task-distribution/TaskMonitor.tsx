import React, { useRef, useState } from 'react';
import { Button, Tag, Space, Typography, message, Modal, Input, Tabs } from 'antd';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {
    IntelTaskStatus,
    IntelTaskPriority,
    IntelTaskType,
    INTEL_TASK_STATUS_LABELS,
    INTEL_TASK_PRIORITY_LABELS,
    INTEL_TASK_TYPE_LABELS,
    IntelTaskResponse
} from '@packages/types';
import { useReviewTask } from '../../api/tasks';
import { useUsers } from '../../../users/api/users';
import { apiClient } from '../../../../api/client';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { CheckCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

export const TaskMonitor: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const { currentUser } = useVirtualUser();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const reviewMutation = useReviewTask();

    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentTask, setCurrentTask] = useState<IntelTaskResponse | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null);
    const [activeTab, setActiveTab] = useState('all');

    const handleReview = (task: IntelTaskResponse, action: 'APPROVE' | 'REJECT') => {
        setCurrentTask(task);
        setReviewAction(action);
        if (action === 'APPROVE') {
            Modal.confirm({
                title: '确认通过任务？',
                content: `任务：${task.title}`,
                onOk: async () => {
                    await reviewMutation.mutateAsync({
                        id: task.id,
                        operatorId: currentUser?.id || 'admin',
                        approved: true
                    });
                    message.success('任务已通过');
                    actionRef.current?.reload();
                }
            });
        } else {
            setRejectReason('');
            setReviewModalOpen(true);
        }
    };

    const handleViewDetail = (task: IntelTaskResponse) => {
        setCurrentTask(task);
        setDetailModalOpen(true);
    };

    const submitReject = async () => {
        if (!currentTask) return;
        if (!rejectReason.trim()) {
            message.error('请输入驳回原因');
            return;
        }
        await reviewMutation.mutateAsync({
            id: currentTask.id,
            operatorId: currentUser?.id || 'admin',
            approved: false,
            reason: rejectReason
        });
        message.success('任务已驳回');
        setReviewModalOpen(false);
        actionRef.current?.reload();
    };

    const columns: ProColumns<IntelTaskResponse>[] = [
        {
            title: '任务名称',
            dataIndex: 'title',
            copyable: true,
            ellipsis: true,
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.title}</Text>
                    {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description.slice(0, 30)}...</Text>}
                </Space>
            )
        },
        {
            title: '执行人',
            dataIndex: 'assigneeId',
            valueType: 'select',
            fieldProps: {
                showSearch: true,
                options: users.map(u => ({ label: u.name, value: u.id })),
            },
            render: (_, record) => (
                <Space>
                    {record.assignee?.avatar && <img src={record.assignee.avatar} alt="avatar" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                    <span>{record.assignee?.name || '-'}</span>
                </Space>
            )
        },
        {
            title: '类型',
            dataIndex: 'type',
            valueType: 'select',
            valueEnum: INTEL_TASK_TYPE_LABELS,
            render: (_, record) => <Tag>{INTEL_TASK_TYPE_LABELS[record.type as IntelTaskType]}</Tag>
        },
        {
            title: '状态',
            dataIndex: 'status',
            valueType: 'select',
            valueEnum: INTEL_TASK_STATUS_LABELS,
            render: (_, record) => {
                const colorMap = {
                    [IntelTaskStatus.PENDING]: 'default',
                    [IntelTaskStatus.SUBMITTED]: 'processing',
                    [IntelTaskStatus.RETURNED]: 'error',
                    [IntelTaskStatus.COMPLETED]: 'success',
                    [IntelTaskStatus.OVERDUE]: 'warning',
                };
                return <Tag color={colorMap[record.status]}>{INTEL_TASK_STATUS_LABELS[record.status]}</Tag>;
            }
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            valueType: 'select',
            valueEnum: INTEL_TASK_PRIORITY_LABELS,
            render: (_, record) => {
                const colorMap = {
                    [IntelTaskPriority.LOW]: 'blue',
                    [IntelTaskPriority.MEDIUM]: 'geekblue',
                    [IntelTaskPriority.HIGH]: 'orange',
                    [IntelTaskPriority.URGENT]: 'red',
                };
                return <Tag color={colorMap[record.priority]}>{INTEL_TASK_PRIORITY_LABELS[record.priority]}</Tag>;
            }
        },
        {
            title: '截止时间',
            dataIndex: 'deadline',
            valueType: 'date',
            sorter: true,
            render: (_, record) => {
                const isOverdue = dayjs().isAfter(dayjs(record.deadline)) && record.status !== IntelTaskStatus.COMPLETED;
                return (
                    <Text type={isOverdue ? 'danger' : undefined}>
                        {dayjs(record.deadline).format('YYYY-MM-DD HH:mm')}
                    </Text>
                );
            }
        },
        {
            title: '操作',
            valueType: 'option',
            key: 'option',
            render: (text, record) => {
                if (record.status === IntelTaskStatus.SUBMITTED) {
                    return [
                        <Button
                            key="approve"
                            type="link"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleReview(record, 'APPROVE')}
                        >
                            通过
                        </Button>,
                        <Button
                            key="reject"
                            type="link"
                            danger
                            size="small"
                            icon={<CloseCircleOutlined />}
                            onClick={() => handleReview(record, 'REJECT')}
                        >
                            驳回
                        </Button>
                    ];
                }
                return [
                    <Button
                        key="view"
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => handleViewDetail(record)}
                    >
                        详情
                    </Button>
                ];
            },
        },
    ];

    const requestTasks = async (params: any, sort: any) => {
        const query: any = {
            page: params.current,
            pageSize: params.pageSize,
            status: params.status,
            assigneeId: params.assigneeId,
            type: params.type,
            priority: params.priority,
            ...sort,
        };

        // Apply Tab Filters
        if (activeTab === 'pending') {
            query.status = IntelTaskStatus.SUBMITTED;
        } else if (activeTab === 'overdue') {
            query.status = IntelTaskStatus.OVERDUE;
        }

        const { data } = await (apiClient as any).get('/intel-tasks', { params: query });
        return {
            data: data.data,
            success: true,
            total: data.total,
        };
    };

    return (
        <div>
            <ProTable<IntelTaskResponse>
                headerTitle="任务监控台"
                actionRef={actionRef}
                rowKey="id"
                request={requestTasks}
                columns={columns}
                pagination={{ defaultPageSize: 10 }}
                search={{ labelWidth: 'auto' }}
                toolbar={{
                    menu: {
                        type: 'tab',
                        activeKey: activeTab,
                        items: [
                            { key: 'all', label: '全部任务' },
                            { key: 'pending', label: '待审核' },
                            { key: 'overdue', label: '已超时' },
                        ],
                        onChange: (key) => {
                            setActiveTab(key as string);
                            actionRef.current?.setPageInfo?.({ current: 1 });
                            actionRef.current?.reload();
                        }
                    }
                }}
            />

            <Modal
                title="驳回任务"
                open={reviewModalOpen}
                onOk={submitReject}
                onCancel={() => setReviewModalOpen(false)}
            >
                <p>请输入驳回原因，将通知执行人修改：</p>
                <TextArea
                    rows={4}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="例如：价格数据与市场行情偏差较大，请核实..."
                />
            </Modal>
            <Modal
                title="任务详情"
                open={detailModalOpen}
                onCancel={() => setDetailModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailModalOpen(false)}>
                        关闭
                    </Button>
                ]}
            >
                {currentTask && (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Space>
                            <Text strong>任务名称:</Text>
                            <Text>{currentTask.title}</Text>
                        </Space>
                        <Space>
                            <Text strong>执行人:</Text>
                            <Text>{currentTask.assignee?.name || '-'}</Text>
                        </Space>
                        <Space>
                            <Text strong>截止时间:</Text>
                            <Text>{dayjs(currentTask.deadline).format('YYYY-MM-DD HH:mm')}</Text>
                        </Space>
                        <Space>
                            <Text strong>状态:</Text>
                            <Tag>{INTEL_TASK_STATUS_LABELS[currentTask.status]}</Tag>
                        </Space>
                        <div>
                            <Text strong>任务描述:</Text>
                            <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                                {currentTask.description || '无描述'}
                            </div>
                        </div>
                        {currentTask.requirements && (
                            <div>
                                <Text strong>任务要求:</Text>
                                <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                                    {currentTask.requirements}
                                </div>
                            </div>
                        )}
                    </Space>
                )}
            </Modal>
        </div>
    );
};
