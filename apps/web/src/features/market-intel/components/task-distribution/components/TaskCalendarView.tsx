import React, { useMemo, useState } from 'react';
import { Calendar, Badge, Popover, Space, theme, Tag, Button, Drawer, List, Typography, Select, Radio, Table } from 'antd';
import { ProCard, QueryFilter, ProFormSelect, ProFormSwitch, ProFormDependency } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {
    IntelTaskResponse,
    IntelTaskPriority,
    IntelTaskStatus,
    IntelTaskType,
    INTEL_TASK_PRIORITY_LABELS,
    INTEL_TASK_STATUS_LABELS,
    INTEL_TASK_TYPE_LABELS,
} from '@packages/types';
import { useTasks, useCompleteTask } from '../../../api/tasks';
import { useUsers } from '../../../../users/api/users';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';

const { Text } = Typography;

const PRIORITY_META: Array<{ value: IntelTaskPriority; label: string; color: string }> = [
    { value: IntelTaskPriority.URGENT, label: '紧急', color: 'red' },
    { value: IntelTaskPriority.HIGH, label: '高', color: 'orange' },
    { value: IntelTaskPriority.MEDIUM, label: '中', color: 'blue' },
    { value: IntelTaskPriority.LOW, label: '低', color: 'green' },
];

export const TaskCalendarView: React.FC = () => {
    const { token } = theme.useToken();
    const [filters, setFilters] = useState({
        type: undefined as IntelTaskType | undefined,
        priority: undefined as IntelTaskPriority | undefined,
        assigneeId: undefined as string | undefined,
        status: undefined as IntelTaskStatus | undefined,
        assigneeOrgId: undefined as string | undefined,
        assigneeDeptId: undefined as string | undefined,
        orgSummary: false,
    });

    const [viewDate, setViewDate] = useState(dayjs());
    const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');

    // Data Hooks
    const { data: users = [] } = useUsers({ status: 'ACTIVE', organizationId: filters.assigneeOrgId, departmentId: filters.assigneeDeptId });
    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments(filters.assigneeOrgId);
    const completeMutation = useCompleteTask();

    // Query coverage
    const rangeStart = viewDate.startOf('month').subtract(1, 'week').toDate();
    const rangeEnd = viewDate.endOf('month').add(1, 'week').toDate();

    const query = useMemo(() => {
        const { orgSummary, ...restFilters } = filters;
        return {
            ...restFilters,
            assigneeDeptId: orgSummary ? undefined : restFilters.assigneeDeptId,
            assigneeId: orgSummary ? undefined : restFilters.assigneeId,
            startDate: rangeStart,
            endDate: rangeEnd,
            page: 1,
            pageSize: 200,
        };
    }, [filters, viewDate]);

    const { data } = useTasks(query);
    const tasks = data?.data || [];

    const typeStats = useMemo(() => {
        const typeKeys = Object.keys(INTEL_TASK_TYPE_LABELS) as IntelTaskType[];
        const stats: Record<string, Record<string, number>> = {};
        typeKeys.forEach(type => {
            stats[type] = {};
            PRIORITY_META.forEach(({ value }) => {
                stats[type][value] = 0;
            });
        });
        tasks.forEach(task => {
            const type = task.type as IntelTaskType;
            const priority = task.priority as IntelTaskPriority;
            if (!stats[type]) {
                stats[type] = {};
            }
            stats[type][priority] = (stats[type][priority] || 0) + 1;
        });

        const rows = typeKeys
            .map(type => {
                const row: any = { key: type, type };
                let total = 0;
                PRIORITY_META.forEach(({ value }) => {
                    const count = stats[type]?.[value] || 0;
                    row[value] = count;
                    total += count;
                });
                row.total = total;
                return row;
            })
            .filter(row => row.total > 0);

        return rows;
    }, [tasks]);

    // Filter tasks for the selected date (for Drawer)
    const selectedDateTasks = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = selectedDate.format('YYYY-MM-DD');
        return tasks.filter(task => {
            const due = dayjs(task.dueAt || task.deadline);
            return due.format('YYYY-MM-DD') === dateStr;
        });
    }, [selectedDate, tasks]);

    const dateCellRender = (value: dayjs.Dayjs) => {
        const dateStr = value.format('YYYY-MM-DD');
        const dayTasks = tasks.filter(task => {
            const due = dayjs(task.dueAt || task.deadline);
            return due.format('YYYY-MM-DD') === dateStr;
        });

        if (dayTasks.length === 0) return null;

        return (
            <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                {dayTasks.map(task => (
                    <li key={task.id} style={{ marginBottom: 4 }}>
                        <Popover
                            title={<Space>{task.title} {task.isLate && <Tag color="error">逾期</Tag>}</Space>}
                            content={
                                <div style={{ maxWidth: 300 }}>
                                    <p>负责人: {task.assignee?.name}</p>
                                    <p>类型: {INTEL_TASK_TYPE_LABELS[task.type]}</p>
                                    <p>状态: {INTEL_TASK_STATUS_LABELS[task.status]}</p>
                                    <p>截止: {dayjs(task.dueAt || task.deadline).format('HH:mm')}</p>
                                    {task.description && <p style={{ color: token.colorTextSecondary }}>{task.description}</p>}
                                </div>
                            }
                        >
                            <div
                                style={{
                                    background: getTaskColor(task.priority, token).bg,
                                    borderLeft: `3px solid ${getTaskColor(task.priority, token).border}`,
                                    padding: '2px 4px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: token.colorText,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}
                            >
                                <Badge status={task.status === IntelTaskStatus.COMPLETED ? 'success' : (task.isLate ? 'error' : 'processing')} />
                                <span>{task.title}</span>
                            </div>
                        </Popover>
                    </li>
                ))}
            </ul>
        );
    };

    const fullCellRender = (value: dayjs.Dayjs, info: any) => {
        if (info.type !== 'date') return info.originNode;
        return (
            <div className="ant-picker-cell-inner ant-picker-calendar-date">
                <div className="ant-picker-calendar-date-value">{value.date()}</div>
                <div className="ant-picker-calendar-date-content">{dateCellRender(value)}</div>
            </div>
        );
    };

    const getTaskColor = (priority: IntelTaskPriority, token: any) => {
        switch (priority) {
            case IntelTaskPriority.URGENT: return { bg: token.colorErrorBg, border: token.colorError };
            case IntelTaskPriority.HIGH: return { bg: token.colorWarningBg, border: token.colorWarning };
            case IntelTaskPriority.MEDIUM: return { bg: token.colorPrimaryBg, border: token.colorPrimary };
            case IntelTaskPriority.LOW: default: return { bg: token.colorFillAlter, border: token.colorTextSecondary };
        }
    };

    const yearOptions = useMemo(() => {
        const currentYear = dayjs().year();
        return Array.from({ length: 11 }, (_, idx) => currentYear - 5 + idx);
    }, []);

    const typeStatsColumns = [
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            render: (value: IntelTaskType) => INTEL_TASK_TYPE_LABELS[value] || value,
        },
        ...PRIORITY_META.map(({ value, label, color }) => ({
            title: <Tag color={color}>{label}</Tag>,
            dataIndex: value,
            key: value,
            align: 'center' as const,
            render: (count: number) => (count ? <Tag color={color}>{count}</Tag> : <Text type="secondary">0</Text>),
        })),
        {
            title: '合计',
            dataIndex: 'total',
            key: 'total',
            align: 'center' as const,
        },
    ];

    return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <QueryFilter
                onFinish={async (values) => setFilters(values as any)}
                onReset={() => setFilters({} as any)}
                onValuesChange={(_, values) => setFilters(values as any)}
                style={{ marginBottom: 0 }}
                submitter={false}
                span={6}
                defaultCollapsed={false}
            >
                <ProFormSelect
                    name="assigneeOrgId"
                    label="所属组织"
                    options={organizations.map(o => ({ label: o.name, value: o.id }))}
                />
                <ProFormSwitch
                    name="orgSummary"
                    label="组织汇总"
                    fieldProps={{ defaultChecked: false }}
                />
                <ProFormDependency name={['orgSummary', 'assigneeOrgId']}>
                    {({ orgSummary }) => (
                        <ProFormSelect
                            name="assigneeDeptId"
                            label="所属部门"
                            options={departments.map(d => ({ label: d.name, value: d.id }))}
                            fieldProps={{ disabled: orgSummary }}
                        />
                    )}
                </ProFormDependency>
                <ProFormDependency name={['orgSummary', 'assigneeOrgId', 'assigneeDeptId']}>
                    {({ orgSummary }) => (
                        <ProFormSelect
                            name="assigneeId"
                            label="负责人"
                            showSearch
                            options={users.map(u => ({ label: u.name, value: u.id }))}
                            fieldProps={{ disabled: orgSummary }}
                        />
                    )}
                </ProFormDependency>
                <ProFormSelect
                    name="type"
                    label="任务类型"
                    options={Object.entries(INTEL_TASK_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                />
                <ProFormSelect
                    name="priority"
                    label="优先级"
                    options={Object.entries(INTEL_TASK_PRIORITY_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                />
                <ProFormSelect
                    name="status"
                    label="状态"
                    options={Object.entries(INTEL_TASK_STATUS_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                />
            </QueryFilter>

            <ProCard ghost>
                <Space wrap>
                    <Text type="secondary">类型统计：</Text>
                    {PRIORITY_META.map(item => (
                        <Tag key={item.value} color={item.color}>
                            {item.label}
                        </Tag>
                    ))}
                </Space>
                <Table
                    size="small"
                    columns={typeStatsColumns as any}
                    dataSource={typeStats}
                    pagination={false}
                    style={{ marginTop: 8 }}
                    locale={{ emptyText: '当前筛选无任务统计' }}
                />
            </ProCard>

            <ProCard ghost>
                <Calendar
                    value={viewDate}
                    onChange={setViewDate}
                    onSelect={(date, { source }) => {
                        if (source === 'date') {
                            setSelectedDate(date);
                            setDrawerOpen(true);
                        }
                        setViewDate(date);
                    }}
                    fullCellRender={fullCellRender}
                    headerRender={({ value, onChange }) => {
                        return (
                            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                    <Button onClick={() => onChange(value.subtract(1, 'month'))}>上个月</Button>
                                    <Button onClick={() => onChange(value.add(1, 'month'))}>下个月</Button>
                                    <Button onClick={() => onChange(dayjs())}>今天</Button>
                                    <Select
                                        value={value.year()}
                                        onChange={(year) => onChange(value.year(year))}
                                        options={yearOptions.map(year => ({ label: `${year}年`, value: year }))}
                                        style={{ width: 110 }}
                                    />
                                    <Select
                                        value={value.month() + 1}
                                        onChange={(month) => onChange(value.month(month - 1))}
                                        options={Array.from({ length: 12 }, (_, idx) => ({
                                            label: `${idx + 1}月`,
                                            value: idx + 1,
                                        }))}
                                        style={{ width: 90 }}
                                    />
                                    <Radio.Group
                                        value={calendarMode}
                                        onChange={(e) => setCalendarMode(e.target.value)}
                                        optionType="button"
                                        buttonStyle="solid"
                                    >
                                        <Radio.Button value="month">月</Radio.Button>
                                        <Radio.Button value="year">年</Radio.Button>
                                    </Radio.Group>
                                </Space>
                                <Space size="large">
                                    <Badge color={token.colorError} text="紧急" />
                                    <Badge color={token.colorWarning} text="高" />
                                    <Badge color={token.colorPrimary} text="中" />
                                    <Badge color={token.colorTextSecondary} text="低" />
                                </Space>
                            </div>
                        );
                    }}
                    mode={calendarMode}
                    onPanelChange={(date, mode) => {
                        setViewDate(date);
                        setCalendarMode(mode);
                    }}
                />
            </ProCard>

            <Drawer
                title={`${selectedDate?.format('MM月DD日')} 任务列表`}
                placement="right"
                width={400}
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
            >
                <List
                    dataSource={selectedDateTasks}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button
                                    key="complete"
                                    type="link"
                                    disabled={item.status === IntelTaskStatus.COMPLETED}
                                    onClick={() => completeMutation.mutate({ id: item.id })}
                                >
                                    完成
                                </Button>
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <Space>
                                        <Text delete={item.status === IntelTaskStatus.COMPLETED}>{item.title}</Text>
                                        <Tag>{INTEL_TASK_TYPE_LABELS[item.type]}</Tag>
                                    </Space>
                                }
                                description={
                                    <Space direction="vertical" size={0}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>负责人: {item.assignee?.name}</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>截止: {dayjs(item.dueAt || item.deadline).format('HH:mm')}</Text>
                                    </Space>
                                }
                            />
                        </List.Item>
                    )}
                    locale={{ emptyText: '今日无任务' }}
                />
            </Drawer>
        </Space>
    );
};
