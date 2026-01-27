import React, { useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Space, Tag, Drawer, Timeline, Divider, Popconfirm } from 'antd';
import {
    ProTable,
    ActionType,
    ProColumns,
    ModalForm,
    ProFormText,
    ProFormSelect,
    ProFormRadio,
    ProFormDigit,
    ProFormSwitch,
    ProFormDependency,
    ProFormDatePicker,
    ProFormTextArea,
} from '@ant-design/pro-components';
import { PlusOutlined, HistoryOutlined, EditOutlined, ScheduleOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    IntelTaskType,
    IntelTaskPriority,
    TaskCycleType,
    INTEL_TASK_TYPE_LABELS,
    INTEL_TASK_PRIORITY_LABELS,
    TASK_CYCLE_TYPE_LABELS,
    IntelTaskTemplateResponse,
} from '@packages/types';
import { useTaskTemplates, useCreateTaskTemplate, useUpdateTaskTemplate, useDeleteTaskTemplate, useDistributeTasks } from '../../../api/tasks';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';
import { useUsers } from '../../../../users/api/users';
import { TemplateScheduleGrid } from './TemplateScheduleGrid';
import { useModalAutoFocus } from '../../../../../hooks/useModalAutoFocus';

// 简化的调度预览逻辑
const computeNextRuns = (template: IntelTaskTemplateResponse, count = 5) => {
    // 这里简化为直接展示 nextRunAt，实际项目中应复用后端或共享库的 cron 计算逻辑
    // 为演示 UI，这里仅展示基于 nextRunAt 的简单推算
    if (!template.nextRunAt) return [];

    const runs = [];
    let current = dayjs(template.nextRunAt);

    for (let i = 0; i < count; i++) {
        runs.push(current.format('YYYY-MM-DD HH:mm'));
        // 简单推算，不严谨
        if (template.cycleType === TaskCycleType.DAILY) current = current.add(1, 'day');
        if (template.cycleType === TaskCycleType.WEEKLY) current = current.add(1, 'week');
        if (template.cycleType === TaskCycleType.MONTHLY) current = current.add(1, 'month');
    }
    return runs;
};

const DEFAULT_TEMPLATE_VALUES = {
    priority: IntelTaskPriority.MEDIUM,
    assigneeMode: 'MANUAL',
    cycleType: TaskCycleType.WEEKLY,
    runAtMinute: 540,
    dueAtMinute: 1080,
    allowLate: true,
    maxBackfillPeriods: 3,
    isActive: true,
    runDayOfWeek: 1,
    runDayOfMonth: 1,
    dueDayOfWeek: 7,
    dueDayOfMonth: 0
};

export const TaskTemplateList: React.FC = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const [previewDrawerVisible, setPreviewDrawerVisible] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentTemplate, setCurrentTemplate] = useState<IntelTaskTemplateResponse | null>(null);

    const { focusRef, modalProps: focusModalProps } = useModalAutoFocus();

    const { data: templates = [] } = useTaskTemplates();
    const createMutation = useCreateTaskTemplate();
    const updateMutation = useUpdateTaskTemplate();
    const deleteMutation = useDeleteTaskTemplate();
    const distributeMutation = useDistributeTasks();
    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const orgMap = useMemo(() => new Map(organizations.map(org => [org.id, org.name])), [organizations]);
    const deptMap = useMemo(() => new Map(departments.map(dept => [dept.id, dept.name])), [departments]);
    const userMap = useMemo(() => new Map(users.map(user => [user.id, user.name])), [users]);

    const timeOptions = useMemo(() => {
        const options = [];
        for (let hour = 0; hour < 24; hour += 1) {
            for (let minute = 0; minute < 60; minute += 30) {
                const value = hour * 60 + minute;
                const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                options.push({ label, value });
            }
        }
        return options;
    }, []);

    const weekDayOptions = [
        { label: '周一', value: 1 },
        { label: '周二', value: 2 },
        { label: '周三', value: 3 },
        { label: '周四', value: 4 },
        { label: '周五', value: 5 },
        { label: '周六', value: 6 },
        { label: '周日', value: 7 },
    ];
    const monthDayOptions = [
        { label: '月末', value: 0 },
        ...Array.from({ length: 31 }, (_, idx) => ({
            label: `${idx + 1} 日`,
            value: idx + 1,
        })),
    ];

    const normalizeTemplatePayload = (values: any) => {
        // 剔除 UI 辅助字段 placeholder，防止 Prisma 报错
        const { placeholder, ...rest } = values;
        return {
            ...rest,
            activeFrom: rest.activeFrom ? dayjs(rest.activeFrom).toDate() : undefined,
            activeUntil: rest.activeUntil ? dayjs(rest.activeUntil).toDate() : undefined,
            assigneeIds: rest.assigneeMode === 'MANUAL' ? (rest.assigneeIds || []) : [],
            departmentIds: rest.assigneeMode === 'BY_DEPARTMENT' ? (rest.departmentIds || []) : [],
            organizationIds: rest.assigneeMode === 'BY_ORGANIZATION' ? (rest.organizationIds || []) : [],
        };
    };

    const handleCreate = async (values: any) => {
        await createMutation.mutateAsync(normalizeTemplatePayload(values));
        message.success('模板创建成功');
        actionRef.current?.reload();
        return true;
    };

    const handleUpdate = async (values: any) => {
        if (!currentTemplate) return false;
        await updateMutation.mutateAsync({ id: currentTemplate.id, data: normalizeTemplatePayload(values) });
        message.success('模板更新成功');
        actionRef.current?.reload();
        return true;
    };

    const columns: ProColumns<IntelTaskTemplateResponse>[] = [
        {
            title: '模板名称',
            dataIndex: 'name',
            copyable: true,
            formItemProps: { rules: [{ required: true }] },
        },
        {
            title: '生成任务类型',
            dataIndex: 'taskType',
            valueType: 'select',
            valueEnum: Object.entries(INTEL_TASK_TYPE_LABELS).reduce((acc, [k, v]) => ({ ...acc, [k]: { text: v } }), {}),
            render: (_, r) => <Tag>{INTEL_TASK_TYPE_LABELS[r.taskType]}</Tag>
        },
        {
            title: '分配对象',
            dataIndex: 'assigneeMode',
            render: (_, r) => {
                if (r.assigneeMode === 'ALL_ACTIVE') {
                    return <Tag color="green">全员</Tag>;
                }
                if (r.assigneeMode === 'BY_ORGANIZATION') {
                    return (
                        <Space wrap>
                            {(r.organizationIds || []).slice(0, 3).map((id: string) => (
                                <Tag key={id}>{orgMap.get(id) || id}</Tag>
                            ))}
                            {(r.organizationIds || []).length > 3 && <Tag>+{(r.organizationIds || []).length - 3}</Tag>}
                        </Space>
                    );
                }
                if (r.assigneeMode === 'BY_DEPARTMENT') {
                    return (
                        <Space wrap>
                            {(r.departmentIds || []).slice(0, 3).map((id: string) => (
                                <Tag key={id}>{deptMap.get(id) || id}</Tag>
                            ))}
                            {(r.departmentIds || []).length > 3 && <Tag>+{(r.departmentIds || []).length - 3}</Tag>}
                        </Space>
                    );
                }
                return (
                    <Space wrap>
                        {(r.assigneeIds || []).slice(0, 3).map((id: string) => (
                            <Tag key={id}>{userMap.get(id) || id}</Tag>
                        ))}
                        {(r.assigneeIds || []).length > 3 && <Tag>+{(r.assigneeIds || []).length - 3}</Tag>}
                    </Space>
                );
            },
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            valueType: 'select',
            valueEnum: Object.entries(INTEL_TASK_PRIORITY_LABELS).reduce((acc, [k, v]) => ({ ...acc, [k]: { text: v } }), {}),
            render: (_, r) => <Tag color={r.priority === IntelTaskPriority.URGENT ? 'red' : 'blue'}>{INTEL_TASK_PRIORITY_LABELS[r.priority]}</Tag>
        },
        {
            title: '周期',
            dataIndex: 'cycleType',
            valueType: 'select',
            valueEnum: Object.entries(TASK_CYCLE_TYPE_LABELS).reduce((acc, [k, v]) => ({ ...acc, [k]: { text: v } }), {}),
            render: (_, r) => <Tag color="geekblue">{TASK_CYCLE_TYPE_LABELS[r.cycleType]}</Tag>
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            valueType: 'select',
            valueEnum: {
                true: { text: '启用', status: 'Success' },
                false: { text: '禁用', status: 'Default' },
            },
        },
        {
            title: '下次运行',
            dataIndex: 'nextRunAt',
            valueType: 'dateTime',
            search: false,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateTime',
            sorter: true,
            hideInSearch: true,
            width: 160,
        },
        // Search-only fields
        {
            title: '分配给用户',
            dataIndex: 'assigneeId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                showSearch: true,
                options: users.map(u => ({ label: u.name, value: u.id })),
            },
        },
        {
            title: '分配给部门',
            dataIndex: 'departmentId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: departments.map(d => ({ label: d.name, value: d.id })),
            },
        },
        {
            title: '分配给组织',
            dataIndex: 'organizationId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: organizations.map(o => ({ label: o.name, value: o.id })),
            },
        },
        {
            title: '操作',
            valueType: 'option',
            render: (_text, record, _, action) => [
                <Space key="actions" size="small">
                    <Button
                        key="edit"
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                            setCurrentTemplate(record);
                            // Set isEditModalOpen to true
                            setIsEditModalOpen(true);
                        }}
                    >
                        编辑
                    </Button>
                    <Button
                        key="preview"
                        size="small"
                        icon={<ScheduleOutlined />}
                        onClick={() => {
                            setCurrentTemplate(record);
                            setPreviewDrawerVisible(true);
                        }}
                    >
                        预览
                    </Button>
                    <Button
                        key="distribute"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={async () => {
                            await distributeMutation.mutateAsync({ templateId: record.id });
                            message.success('手动分发任务触发成功');
                        }}
                    >
                        分发
                    </Button>
                    <Popconfirm
                        title="确定要删除该模板吗？"
                        description="删除后将无法恢复，且不再生成新任务。"
                        onConfirm={async () => {
                            await deleteMutation.mutateAsync(record.id);
                            message.success('模板已删除');
                            action?.reload();
                        }}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            key="delete"
                            type="primary"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ],
        },
    ];

    const TemplateFormItems = () => (
        <>
            <ProFormText
                name="name"
                label="模板名称"
                rules={[{ required: true }]}
                colProps={{ span: 24 }}
                fieldProps={{ ref: focusRef }}
            />
            <ProFormSelect
                name="taskType"
                label="任务类型"
                tooltip="模板分发出的任务类型"
                options={Object.entries(INTEL_TASK_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                rules={[{ required: true }]}
                colProps={{ span: 12 }}
            />
            <ProFormRadio.Group
                name="priority"
                label="默认优先级"
                options={Object.entries(INTEL_TASK_PRIORITY_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                colProps={{ span: 12 }}
            />

            <Divider style={{ margin: '12px 0' }} />

            <ProFormSelect
                name="assigneeMode"
                label="分配方式"
                options={[
                    { label: '手动指定', value: 'MANUAL' },
                    { label: '全员', value: 'ALL_ACTIVE' },
                    { label: '按部门', value: 'BY_DEPARTMENT' },
                    { label: '按组织', value: 'BY_ORGANIZATION' },
                ]}
                rules={[{ required: true }]}
                colProps={{ span: 8 }}
            />
            <ProFormDependency name={['assigneeMode']}>
                {({ assigneeMode }) => {
                    if (assigneeMode === 'MANUAL') {
                        return (
                            <ProFormSelect
                                name="assigneeIds"
                                label="指定业务员"
                                fieldProps={{ mode: 'multiple', optionFilterProp: 'label' }}
                                options={users.map(user => ({ label: user.name, value: user.id }))}
                                colProps={{ span: 16 }}
                            />
                        );
                    }
                    if (assigneeMode === 'BY_DEPARTMENT') {
                        return (
                            <ProFormSelect
                                name="departmentIds"
                                label="选择部门"
                                fieldProps={{ mode: 'multiple' }}
                                options={departments.map(dept => ({ label: dept.name, value: dept.id }))}
                                colProps={{ span: 16 }}
                            />
                        );
                    }
                    if (assigneeMode === 'BY_ORGANIZATION') {
                        return (
                            <ProFormSelect
                                name="organizationIds"
                                label="选择组织"
                                fieldProps={{ mode: 'multiple' }}
                                options={organizations.map(org => ({ label: org.name, value: org.id }))}
                                colProps={{ span: 16 }}
                            />
                        );
                    }
                    return <ProFormSelect name="placeholder" label=" " disabled fieldProps={{ placeholder: '将分发给所有活跃用户' }} colProps={{ span: 16 }} />;
                }}
            </ProFormDependency>

            <Divider style={{ margin: '12px 0' }} />

            <ProFormSelect
                name="cycleType"
                label="周期类型"
                options={Object.entries(TASK_CYCLE_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                rules={[{ required: true }]}
                colProps={{ span: 8 }}
            />
            <ProFormSelect
                name="runAtMinute"
                label="分发时间"
                options={timeOptions}
                rules={[{ required: true }]}
                colProps={{ span: 8 }}
            />
            <ProFormSelect
                name="dueAtMinute"
                label="截止时间"
                options={timeOptions}
                rules={[{ required: true }]}
                colProps={{ span: 8 }}
            />

            <ProFormDependency name={['cycleType']}>
                {({ cycleType }) => {
                    if (cycleType === TaskCycleType.WEEKLY) {
                        return (
                            <ProFormSelect
                                name="runDayOfWeek"
                                label="每周分发日"
                                options={weekDayOptions}
                                colProps={{ span: 12 }}
                            />
                        );
                    }
                    if (cycleType === TaskCycleType.MONTHLY) {
                        return (
                            <ProFormSelect
                                name="runDayOfMonth"
                                label="每月分发日"
                                options={monthDayOptions}
                                colProps={{ span: 12 }}
                            />
                        );
                    }
                    return null;
                }}
            </ProFormDependency>
            <ProFormDependency name={['cycleType']}>
                {({ cycleType }) => {
                    if (cycleType === TaskCycleType.WEEKLY) {
                        return (
                            <ProFormSelect
                                name="dueDayOfWeek"
                                label="每周截止日"
                                options={weekDayOptions}
                                colProps={{ span: 12 }}
                            />
                        );
                    }
                    if (cycleType === TaskCycleType.MONTHLY) {
                        return (
                            <ProFormSelect
                                name="dueDayOfMonth"
                                label="每月截止日"
                                options={monthDayOptions}
                                colProps={{ span: 12 }}
                            />
                        );
                    }
                    return null;
                }}
            </ProFormDependency>

            <ProFormDatePicker
                name="activeFrom"
                label="生效时间"
                fieldProps={{ showTime: true, style: { width: '100%' } }}
                colProps={{ span: 12 }}
            />
            <ProFormDatePicker
                name="activeUntil"
                label="停止时间"
                fieldProps={{ showTime: true, style: { width: '100%' } }}
                colProps={{ span: 12 }}
            />

            <Divider style={{ margin: '12px 0' }} />

            <ProFormSwitch name="allowLate" label="允许补报" colProps={{ span: 6 }} />
            <ProFormDigit name="maxBackfillPeriods" label="最大补发期数" min={0} max={365} colProps={{ span: 6 }} />
            <ProFormSwitch name="isActive" label="是否启用" colProps={{ span: 6 }} />

            <ProFormTextArea
                name="description"
                label="模板描述"
                colProps={{ span: 24 }}
                fieldProps={{ rows: 3 }}
            />

            <div style={{ width: '100%' }}>
                <Alert
                    type="info"
                    showIcon
                    message="模板说明"
                    description="模板任务将由后台调度服务自动生成。修改生效时间可能影响下一次生成。"
                    style={{ marginTop: 16 }}
                />
            </div>
        </>
    );

    return (
        <>
            <ProTable<IntelTaskTemplateResponse>
                headerTitle="任务模板管理"
                actionRef={actionRef}
                rowKey="id"
                dataSource={templates}
                columns={columns}
                search={{
                    labelWidth: 'auto',
                }}
                toolBarRender={() => [
                    <ModalForm
                        key="create"
                        title="创建任务模板"
                        trigger={
                            <Button type="primary" icon={<PlusOutlined />}>
                                新建模板
                            </Button>
                        }
                        onFinish={handleCreate}
                        width={800}
                        grid={true}
                        modalProps={{
                            destroyOnClose: true,
                            centered: true,
                            ...focusModalProps,
                        }}
                        initialValues={DEFAULT_TEMPLATE_VALUES}
                    >
                        <TemplateFormItems />
                    </ModalForm>
                ]}
            />

            <ModalForm
                key="edit"
                title="编辑任务模板"
                open={isEditModalOpen}
                onOpenChange={setIsEditModalOpen}
                onFinish={handleUpdate}
                width={800}
                grid={true}
                modalProps={{
                    destroyOnClose: true,
                    centered: true,
                    ...focusModalProps,
                }}
                initialValues={currentTemplate ? {
                    ...DEFAULT_TEMPLATE_VALUES,
                    ...currentTemplate,
                    activeFrom: currentTemplate.activeFrom ? dayjs(currentTemplate.activeFrom) : undefined,
                    activeUntil: currentTemplate.activeUntil ? dayjs(currentTemplate.activeUntil) : undefined,
                } : {}}
            >
                <TemplateFormItems />
            </ModalForm>

            <Drawer
                title="调度预览"
                width={800}
                open={previewDrawerVisible}
                onClose={() => setPreviewDrawerVisible(false)}
            >
                {currentTemplate && (
                    <>
                        <Timeline
                            items={computeNextRuns(currentTemplate).map((time, idx) => ({
                                color: idx === 0 ? 'green' : 'blue',
                                children: (
                                    <>
                                        {time} {idx === 0 && <Tag color="green">下次运行</Tag>}
                                    </>
                                ),
                            }))}
                        />
                        <Divider />
                        <TemplateScheduleGrid template={currentTemplate} weeks={4} />
                    </>
                )}
            </Drawer>
        </>
    );
};
