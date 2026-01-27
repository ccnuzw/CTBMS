import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Button, Space, Tag, Typography, message, DatePicker, Card, Table, Input } from 'antd';
import { ActionType, ProColumns, ProTable, StatisticCard } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {
    IntelTaskPriority,
    IntelTaskStatus,
    IntelTaskType,
    INTEL_TASK_PRIORITY_LABELS,
    INTEL_TASK_STATUS_LABELS,
    INTEL_TASK_TYPE_LABELS,
    IntelTaskResponse
} from '@packages/types';
import { useCompleteTask, useTaskMetrics, useTaskMetricsByOrg, useTaskMetricsByDept } from '../../../api/tasks';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';
import { useUsers } from '../../../../users/api/users';
import {
    PlusOutlined,
    FileTextTwoTone,
    CheckCircleTwoTone,
    ClockCircleTwoTone,
    WarningTwoTone
} from '@ant-design/icons';
import { CreateTaskModal } from './CreateTaskModal';
import { useCreateTask } from '../../../api/tasks';
import { apiClient } from '../../../../../api/client';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const KPI_PRESET_KEY = 'task_kpi_presets';

const getDefaultPresets = () => ([
    { label: '近7天', range: [dayjs().subtract(6, 'day'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: '近30天', range: [dayjs().subtract(29, 'day'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: '本月', range: [dayjs().startOf('month'), dayjs().endOf('month')] as [dayjs.Dayjs, dayjs.Dayjs] },
]);

const loadPresetRanges = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(KPI_PRESET_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Array<{ label: string; days: number }>;
        return parsed
            .filter(item => item && typeof item.label === 'string' && typeof item.days === 'number')
            .map(item => ({
                label: item.label,
                range: [dayjs().subtract(item.days - 1, 'day'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs],
            }));
    } catch {
        return null;
    }
};

const savePresetRanges = (presets: Array<{ label: string; range: [dayjs.Dayjs, dayjs.Dayjs] }>) => {
    if (typeof window === 'undefined') return;
    const payload = presets.map(item => ({
        label: item.label,
        days: item.range[1].diff(item.range[0], 'day') + 1,
    }));
    window.localStorage.setItem(KPI_PRESET_KEY, JSON.stringify(payload));
};

export const TaskList: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [presetLabel, setPresetLabel] = useState('');
    const [activePreset, setActivePreset] = useState<string | null>(null);

    // Auxiliary Data
    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });

    // Mutations
    const completeMutation = useCompleteTask();
    const createMutation = useCreateTask();

    // Metrics Query (Global stats, separate from table filters for now, or sync them?)
    // Making metrics reflect the general overview (e.g. this month) is usually better than syncing strictly with table page
    // Let's stick to a default "This Month" view or just simple counts if simpler.
    // For now, let's just fetch global metrics to show on top. 
    // Ideally this should react to the filter, but ProTable request is encapsulated. 
    // We can use `formRef` to get current filters if needed, but for simplicity let's show overall stats or stats for "This Month".
    const [metricsRange, setMetricsRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [metricsPresets, setMetricsPresets] = useState(() => {
        const saved = loadPresetRanges();
        if (saved && saved.length > 0) return saved;
        return getDefaultPresets();
    });

    const metricsQuery = useMemo(() => ({
        metricsStart: metricsRange[0].toDate(),
        metricsEnd: metricsRange[1].toDate(),
        page: 1, pageSize: 1
    }), [metricsRange]);

    const { data: metrics, isLoading: metricsLoading } = useTaskMetrics(metricsQuery);
    const { data: orgMetrics = [], isLoading: orgMetricsLoading } = useTaskMetricsByOrg(metricsQuery);
    const { data: deptMetrics = [], isLoading: deptMetricsLoading } = useTaskMetricsByDept(metricsQuery);

    // Columns Definition
    const columns: ProColumns<IntelTaskResponse>[] = [
        {
            title: '任务名称',
            dataIndex: 'title',
            copyable: true,
            ellipsis: true,
            formItemProps: {
                rules: [{ required: true, message: '此项为必填项' }],
            },
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.title}</Text>
                    {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description.slice(0, 30)}...</Text>}
                </Space>
            )
        },
        {
            title: '类型',
            dataIndex: 'type',
            valueType: 'select',
            valueEnum: Object.entries(INTEL_TASK_TYPE_LABELS).reduce((acc, [key, label]) => {
                acc[key] = { text: label };
                return acc;
            }, {} as Record<string, { text: string }>),
            render: (_, record) => <Tag>{INTEL_TASK_TYPE_LABELS[record.type as IntelTaskType]}</Tag>
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            valueType: 'select',
            valueEnum: Object.entries(INTEL_TASK_PRIORITY_LABELS).reduce((acc, [key, label]) => {
                acc[key] = { text: label, status: key === 'URGENT' || key === 'HIGH' ? 'Error' : 'Default' };
                return acc;
            }, {} as Record<string, { text: string; status: string }>),
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
            title: '状态',
            dataIndex: 'status',
            valueType: 'select',
            valueEnum: Object.entries(INTEL_TASK_STATUS_LABELS).reduce((acc, [key, label]) => {
                let status = 'Default';
                if (key === 'COMPLETED') status = 'Success';
                if (key === 'OVERDUE') status = 'Error';
                if (key === 'PENDING') status = 'Processing';
                acc[key] = { text: label, status };
                return acc;
            }, {} as Record<string, { text: string; status: string }>),
        },
        {
            title: '负责人',
            dataIndex: 'assigneeId',
            valueType: 'select',
            fieldProps: {
                showSearch: true,
                options: users.map(u => ({ label: u.name, value: u.id })),
            },
            render: (_, record) => record.assignee?.name || '-'
        },
        {
            title: '所属组织',
            dataIndex: 'assigneeOrgId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: organizations.map(o => ({ label: o.name, value: o.id })),
            },
        },
        {
            title: '所属部门',
            dataIndex: 'assigneeDeptId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: departments.map(d => ({ label: d.name, value: d.id })),
            },
        },
        {
            title: '截止时间',
            dataIndex: 'dueAt',
            valueType: 'date',
            sorter: true,
            render: (_, record) => {
                const date = record.dueAt || record.deadline;
                return (
                    <Space direction="vertical" size={0}>
                        <span>{dayjs(date).format('YYYY-MM-DD HH:mm')}</span>
                        {record.isLate && <Tag color="volcano" style={{ marginTop: 4 }}>逾期完成</Tag>}
                    </Space>
                )
            },
            search: false, // Use dueRange for search
        },
        {
            title: '截止日期范围',
            dataIndex: 'dueRange',
            hideInTable: true,
            valueType: 'dateRange',
            search: {
                transform: (value) => {
                    return {
                        dueStart: value[0],
                        dueEnd: value[1],
                    };
                },
            },
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'date',
            sorter: true,
            hideInSearch: true,
            render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD')
        },
        {
            title: '操作',
            valueType: 'option',
            key: 'option',
            render: (text, record, _, action) => [
                <Button
                    key="complete"
                    type="link"
                    size="small"
                    disabled={record.status === IntelTaskStatus.COMPLETED}
                    onClick={async () => {
                        await completeMutation.mutateAsync({ id: record.id });
                        message.success('任务已完成');
                        action?.reload();
                    }}
                >
                    完成
                </Button>,

                // Add more actions here like Edit/Delete
            ],
        },
    ];

    const requestTasks = async (params: any, sort: any, filter: any) => {
        // Construct query
        const query: any = {
            page: params.current,
            pageSize: params.pageSize,
            status: params.status,
            type: params.type,
            priority: params.priority,
            assigneeId: params.assigneeId,
            assigneeOrgId: params.assigneeOrgId,
            assigneeDeptId: params.assigneeDeptId,
            dueStart: params.dueStart ?? (params.dueRange ? params.dueRange[0] : undefined),
            dueEnd: params.dueEnd ?? (params.dueRange ? params.dueRange[1] : undefined),
            ...sort,
        };

        const { data } = await (apiClient as any).get('/intel-tasks', { params: query });

        return {
            data: data.data,
            success: true,
            total: data.total,
        };
    };

    const handleCreateTask = async (values: any) => {
        await createMutation.mutateAsync(values);
        message.success('任务创建成功');
        setIsCreateModalOpen(false);
        actionRef.current?.reload();
    };

    const orgColumns = [
        { title: '组织', dataIndex: 'orgName', key: 'orgName' },
        { title: '总数', dataIndex: 'total', key: 'total' },
        { title: '待完成', dataIndex: 'pending', key: 'pending' },
        { title: '已完成', dataIndex: 'completed', key: 'completed' },
        { title: '超时', dataIndex: 'overdue', key: 'overdue' },
        { title: '逾期', dataIndex: 'late', key: 'late' },
        {
            title: '完成率',
            dataIndex: 'completionRate',
            key: 'completionRate',
            render: (value: number) => `${(value * 100).toFixed(1)}%`,
        },
    ];

    const deptColumns = [
        { title: '部门', dataIndex: 'deptName', key: 'deptName' },
        { title: '总数', dataIndex: 'total', key: 'total' },
        { title: '待完成', dataIndex: 'pending', key: 'pending' },
        { title: '已完成', dataIndex: 'completed', key: 'completed' },
        { title: '超时', dataIndex: 'overdue', key: 'overdue' },
        { title: '逾期', dataIndex: 'late', key: 'late' },
        {
            title: '完成率',
            dataIndex: 'completionRate',
            key: 'completionRate',
            render: (value: number) => `${(value * 100).toFixed(1)}%`,
        },
    ];

    useEffect(() => {
        savePresetRanges(metricsPresets);
    }, [metricsPresets]);

    const metricsRangeLabel = useMemo(() => {
        return `${metricsRange[0].format('YYYY-MM-DD')} ~ ${metricsRange[1].format('YYYY-MM-DD')}`;
    }, [metricsRange]);

    const applyPreset = (label: string) => {
        const preset = metricsPresets.find(item => item.label === label);
        if (!preset) return;
        setMetricsRange([preset.range[0], preset.range[1]]);
        setActivePreset(label);
    };

    const handleRangeChange = (dates: null | [dayjs.Dayjs, dayjs.Dayjs]) => {
        if (!dates) return;
        setMetricsRange([dates[0].startOf('day'), dates[1].endOf('day')]);
        setActivePreset(null);
    };

    const handleAddPreset = () => {
        const label = presetLabel.trim();
        if (!label) {
            message.warning('请输入快捷范围名称');
            return;
        }
        const next = metricsPresets.some(item => item.label === label)
            ? metricsPresets.map(item => (item.label === label ? { ...item, range: metricsRange } : item))
            : [...metricsPresets, { label, range: metricsRange }];
        setMetricsPresets(next);
        setActivePreset(label);
        setPresetLabel('');
        message.success('快捷范围已保存');
    };

    const handleResetPresets = () => {
        setMetricsPresets(getDefaultPresets());
        setActivePreset(null);
        message.success('快捷范围已重置');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Card size="small" title="KPI 统计范围">
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Space wrap>
                        <Text type="secondary">统计范围：</Text>
                        <RangePicker
                            value={metricsRange}
                            allowClear={false}
                            onChange={(dates) => handleRangeChange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                            presets={metricsPresets.map(item => ({ label: item.label, value: item.range }))}
                        />
                        <Space size="small">
                            <Input
                                placeholder="快捷名称"
                                value={presetLabel}
                                onChange={(e) => setPresetLabel(e.target.value)}
                                style={{ width: 160 }}
                            />
                            <Button onClick={handleAddPreset}>保存快捷</Button>
                            <Button onClick={handleResetPresets}>恢复默认</Button>
                        </Space>
                    </Space>
                    <Space wrap>
                        <Text type="secondary">快捷范围：</Text>
                        {metricsPresets.map(item => (
                            <Tag
                                key={item.label}
                                color={activePreset === item.label ? 'blue' : 'default'}
                                closable
                                onClose={() => setMetricsPresets(prev => prev.filter(p => p.label !== item.label))}
                                onClick={() => applyPreset(item.label)}
                                style={{ cursor: 'pointer' }}
                            >
                                {item.label}
                            </Tag>
                        ))}
                    </Space>
                </Space>
            </Card>

            {/* KPI Cards */}
            <StatisticCard.Group direction="row">
                <StatisticCard
                    statistic={{
                        title: `统计范围任务总数`,
                        value: metrics?.total || 0,
                        icon: <FileTextTwoTone style={{ fontSize: '24px' }} twoToneColor="#1890ff" />,
                    }}
                    loading={metricsLoading}
                    chart={<Text type="secondary">{metricsRangeLabel}</Text>}
                />
                <StatisticCard.Divider />
                <StatisticCard
                    statistic={{
                        title: '完成率',
                        value: metrics ? (metrics.completionRate * 100).toFixed(1) : 0,
                        suffix: '%',
                        icon: <CheckCircleTwoTone style={{ fontSize: '24px' }} twoToneColor="#52c41a" />,
                    }}
                    loading={metricsLoading}
                />
                <StatisticCard.Divider />
                <StatisticCard
                    statistic={{
                        title: '待完成',
                        value: metrics?.pending || 0,
                        icon: <ClockCircleTwoTone style={{ fontSize: '24px' }} twoToneColor="#faad14" />,
                    }}
                    loading={metricsLoading}
                />
                <StatisticCard.Divider />
                <StatisticCard
                    statistic={{
                        title: '超时未完',
                        value: metrics?.overdue || 0,
                        status: 'error',
                        icon: <WarningTwoTone style={{ fontSize: '24px' }} twoToneColor="#ff4d4f" />,
                    }}
                    loading={metricsLoading}
                />
            </StatisticCard.Group>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <Card size="small" title={`组织统计（${metricsRangeLabel}）`}>
                    <Table
                        size="small"
                        columns={orgColumns}
                        dataSource={orgMetrics}
                        rowKey="orgId"
                        pagination={false}
                        loading={orgMetricsLoading}
                        locale={{ emptyText: '暂无统计数据' }}
                    />
                </Card>
                <Card size="small" title={`部门统计（${metricsRangeLabel}）`}>
                    <Table
                        size="small"
                        columns={deptColumns}
                        dataSource={deptMetrics}
                        rowKey="deptId"
                        pagination={false}
                        loading={deptMetricsLoading}
                        locale={{ emptyText: '暂无统计数据' }}
                    />
                </Card>
            </div>

            {/* Main Table */}
            <ProTable<IntelTaskResponse>
                headerTitle="任务列表"
                actionRef={actionRef}
                rowKey="id"
                request={requestTasks}
                columns={columns}
                pagination={{
                    defaultPageSize: 20,
                    showSizeChanger: true,
                }}
                dateFormatter="string"
                search={{
                    labelWidth: 'auto',
                    defaultCollapsed: false,
                }}
                toolBarRender={() => [
                    <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
                        创建任务
                    </Button>
                ]}
            />

            <CreateTaskModal
                open={isCreateModalOpen}
                onCancel={() => setIsCreateModalOpen(false)}
                onCreate={handleCreateTask}
            />
        </div>
    );
};
