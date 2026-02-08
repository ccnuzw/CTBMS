import React, { useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Space, Tag, Drawer, Timeline, Divider, Popconfirm, Form, Modal, Table, Select, Switch, TimePicker, Input, Segmented, InputNumber } from 'antd';
import {
    ProTable,
    ActionType,
    ProColumns,
} from '@ant-design/pro-components';
import { PlusOutlined, HistoryOutlined, EditOutlined, ScheduleOutlined, SendOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    IntelTaskType,
    IntelTaskPriority,
    TaskCycleType,
    TaskScheduleMode,
    IntelTaskTemplateResponse,
    CollectionPointType,
    IntelTaskRuleScopeType,
    IntelTaskAssigneeStrategy,
    IntelTaskCompletionPolicy,
    IntelTaskRuleResponse,
} from '@packages/types';
import { useTaskTemplates, useCreateTaskTemplate, useUpdateTaskTemplate, useDeleteTaskTemplate, useDistributeTasks, usePreviewDistribution, useTaskRules, useCreateTaskRule, useUpdateTaskRule, useDeleteTaskRule, useRuleMetrics } from '../../../api/tasks';
import { useCollectionPoints } from '../../../api/collection-point';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';
import { useUsers } from '../../../../users/api/users';
import { useRoles } from '../../../../users/api/roles';
import { TemplateScheduleGrid } from './TemplateScheduleGrid';
import { DistributionPreview } from '../../DistributionPreview';
import { useModalAutoFocus } from '../../../../../hooks/useModalAutoFocus';
import { useDictionaries } from '@/hooks/useDictionaries';
import { TemplateFormCards } from './TemplateFormCards';
import { OrgDeptTreeSelect } from '../../../../organization/components/OrgDeptTreeSelect';

// 简化的调度预览逻辑
const computeNextRuns = (template: IntelTaskTemplateResponse, count = 5) => {
    // 这里简化为直接展示 nextRunAt，实际项目中应复用后端或共享库的 cron 计算逻辑
    // 为演示 UI，这里仅展示基于 nextRunAt 的简单推算
    if (!template.nextRunAt) return [];
    if (template.scheduleMode === TaskScheduleMode.POINT_DEFAULT) return [];

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

const formatMinute = (minute: number | null | undefined) => {
    if (minute == null || Number.isNaN(minute)) return '--:--';
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const DEFAULT_TEMPLATE_VALUES = {
    priority: IntelTaskPriority.MEDIUM,
    assigneeMode: 'MANUAL',
    scheduleMode: TaskScheduleMode.TEMPLATE_OVERRIDE,
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

const SCHEDULE_MODE_LABELS: Record<TaskScheduleMode, string> = {
    [TaskScheduleMode.POINT_DEFAULT]: '采集点频率',
    [TaskScheduleMode.TEMPLATE_OVERRIDE]: '模板覆盖',
};

const normalizeTemplateForForm = (template: any) => {
    // 确保数组存在
    const assigneeIds = template.assigneeIds || [];
    const departmentIds = template.departmentIds || [];
    const organizationIds = template.organizationIds || [];
    const collectionPointIds = template.collectionPointIds || [];
    const targetPointTypes = Array.isArray(template.targetPointTypes) && template.targetPointTypes.length > 0
        ? template.targetPointTypes
        : (template.targetPointType ? [template.targetPointType] : []);

    const runAtMinute = template.runAtMinute || 0;
    const dueAtMinute = template.dueAtMinute || 0;

    const scheduleMode = template.scheduleMode
        || (template.taskType === IntelTaskType.COLLECTION
            ? TaskScheduleMode.POINT_DEFAULT
            : TaskScheduleMode.TEMPLATE_OVERRIDE);

    return {
        ...template,
        scheduleMode,
        assigneeIds,
        departmentIds,
        organizationIds,
        collectionPointIds,
        targetPointTypes,
        activeFrom: template.activeFrom ? dayjs(template.activeFrom) : undefined,
        activeUntil: template.activeUntil ? dayjs(template.activeUntil) : undefined,
        runAtHour: Math.floor(runAtMinute / 60),
        runAtMin: runAtMinute % 60,
        dueAtHour: Math.floor(dueAtMinute / 60),
        dueAtMin: dueAtMinute % 60,
    };
};

export const TaskTemplateList: React.FC = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const [previewDrawerVisible, setPreviewDrawerVisible] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentTemplate, setCurrentTemplate] = useState<IntelTaskTemplateResponse | null>(null);
    const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
    const [ruleTemplate, setRuleTemplate] = useState<IntelTaskTemplateResponse | null>(null);
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<IntelTaskRuleResponse | null>(null);
    const [rulePointScope, setRulePointScope] = useState<'TYPE' | 'POINTS'>('TYPE');
    const [useAdvancedScope, setUseAdvancedScope] = useState(false);
    const [ruleLogOpen, setRuleLogOpen] = useState(false);
    const [ruleLogTarget, setRuleLogTarget] = useState<IntelTaskRuleResponse | null>(null);
    const [ruleForm] = Form.useForm();
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();

    // 焦点管理
    const { containerRef: createContainerRef, autoFocusFieldProps: createAutoFocusFieldProps, modalProps: createModalProps } = useModalAutoFocus();
    const { containerRef: editContainerRef, autoFocusFieldProps: editAutoFocusFieldProps, modalProps: editModalProps } = useModalAutoFocus();
    const { containerRef: ruleContainerRef, focusRef: ruleScopeSelectRef, modalProps: ruleModalProps } = useModalAutoFocus();
    const { containerRef: ruleLogContainerRef, focusRef: ruleLogCloseBtnRef, modalProps: ruleLogModalProps } = useModalAutoFocus();

    const { data: templates = [] } = useTaskTemplates();
    const createMutation = useCreateTaskTemplate();
    const updateMutation = useUpdateTaskTemplate();
    const deleteMutation = useDeleteTaskTemplate();
    const distributeMutation = useDistributeTasks();
    const previewMutation = usePreviewDistribution();
    const { data: rules = [], isLoading: rulesLoading } = useTaskRules(ruleTemplate?.id);
    const createRuleMutation = useCreateTaskRule();
    const updateRuleMutation = useUpdateTaskRule();
    const deleteRuleMutation = useDeleteTaskRule();
    const { data: ruleMetrics } = useRuleMetrics(ruleTemplate?.id);
    const [distributionPreviewData, setDistributionPreviewData] = useState<any>(null);
    const [isDistributionPreviewOpen, setIsDistributionPreviewOpen] = useState(false);

    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const { data: roles = [] } = useRoles();
    // Fetch all active collection points for selection
    const { data: collectionPointsResult } = useCollectionPoints({ isActive: true, pageSize: 1000 });
    const collectionPoints = collectionPointsResult?.data || [];
    const { data: dictionaries } = useDictionaries([
        'INTEL_TASK_TYPE',
        'INTEL_TASK_PRIORITY',
        'TASK_CYCLE_TYPE',
        'COLLECTION_POINT_TYPE',
        'ASSIGNEE_MODE',
    ]);

    const orgMap = useMemo(() => new Map(organizations.map(org => [org.id, org.name])), [organizations]);
    const deptMap = useMemo(() => new Map(departments.map(dept => [dept.id, dept.name])), [departments]);
    const userMap = useMemo(() => new Map(users.map(user => [user.id, user.name])), [users]);
    const ruleFrequencyType = Form.useWatch('frequencyType', ruleForm);
    const ruleScopeType = Form.useWatch('scopeType', ruleForm);
    const ruleCompletionPolicy = Form.useWatch('completionPolicy', ruleForm);

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

    const cycleTypeLabels = useMemo(() => {
        const items = dictionaries?.TASK_CYCLE_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return {} as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    const cycleTypeOptions = useMemo(() => {
        if (Object.keys(cycleTypeLabels).length) {
            return Object.entries(cycleTypeLabels).map(([value, label]) => ({ value, label }));
        }
        return [
            { value: TaskCycleType.DAILY, label: '每日' },
            { value: TaskCycleType.WEEKLY, label: '每周' },
            { value: TaskCycleType.MONTHLY, label: '每月' },
            { value: TaskCycleType.ONE_TIME, label: '一次性' },
        ];
    }, [cycleTypeLabels]);

    const collectionPointTypeLabels = useMemo(() => {
        const items = dictionaries?.COLLECTION_POINT_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return {} as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    const assigneeModeLabels = useMemo(() => {
        const items = dictionaries?.ASSIGNEE_MODE?.filter((item) => item.isActive) || [];
        if (!items.length) return {} as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    const ruleMetricsMap = useMemo(() => {
        const map = new Map<string, any>();
        if (ruleMetrics?.rules) {
            ruleMetrics.rules.forEach((item) => map.set(item.ruleId, item));
        }
        return map;
    }, [ruleMetrics]);

    const ruleDailyMap = useMemo(() => {
        const map = new Map<string, any[]>();
        if (ruleMetrics?.daily) {
            ruleMetrics.daily.forEach((item) => {
                if (!map.has(item.ruleId)) {
                    map.set(item.ruleId, []);
                }
                map.get(item.ruleId)?.push(item);
            });
        }
        return map;
    }, [ruleMetrics]);

    const blurActiveElement = () => {
        if (typeof document === 'undefined') return;
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    };

    const taskTypeValueEnum = useMemo(() => {
        if (!Object.keys(taskTypeLabels).length) return {};
        return Object.entries(taskTypeLabels).reduce<Record<string, { text: string }>>((acc, [key, label]) => {
            acc[key] = { text: label };
            return acc;
        }, {});
    }, [taskTypeLabels]);

    const taskPriorityValueEnum = useMemo(() => {
        if (!Object.keys(taskPriorityMeta.labels).length) return {};
        return Object.entries(taskPriorityMeta.labels).reduce<Record<string, { text: string }>>((acc, [key, label]) => {
            acc[key] = { text: label };
            return acc;
        }, {});
    }, [taskPriorityMeta.labels]);

    const cycleTypeValueEnum = useMemo(() => {
        if (!Object.keys(cycleTypeLabels).length) return {};
        return Object.entries(cycleTypeLabels).reduce<Record<string, { text: string }>>((acc, [key, label]) => {
            acc[key] = { text: label };
            return acc;
        }, {});
    }, [cycleTypeLabels]);

    const taskTypeOptions = useMemo(() => {
        if (!Object.keys(taskTypeLabels).length) return [];
        return Object.entries(taskTypeLabels).map(([value, label]) => ({ value, label }));
    }, [taskTypeLabels]);

    const taskPriorityOptions = useMemo(() => {
        if (!Object.keys(taskPriorityMeta.labels).length) return [];
        return Object.entries(taskPriorityMeta.labels).map(([value, label]) => ({ value, label }));
    }, [taskPriorityMeta.labels]);

    const assigneeModeOptions = useMemo(() => {
        if (!Object.keys(assigneeModeLabels).length) return [];
        return Object.entries(assigneeModeLabels).map(([value, label]) => ({ value, label }));
    }, [assigneeModeLabels]);

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

    const ruleScopeLabels: Record<string, string> = {
        [IntelTaskRuleScopeType.POINT]: '采集点',
        [IntelTaskRuleScopeType.USER]: '人员',
        [IntelTaskRuleScopeType.DEPARTMENT]: '部门',
        [IntelTaskRuleScopeType.ORGANIZATION]: '组织',
        [IntelTaskRuleScopeType.ROLE]: '角色',
        [IntelTaskRuleScopeType.QUERY]: '条件',
    };

    const ruleAssigneeLabels: Record<string, string> = {
        [IntelTaskAssigneeStrategy.POINT_OWNER]: '负责人',
        [IntelTaskAssigneeStrategy.ROTATION]: '轮转',
        [IntelTaskAssigneeStrategy.BALANCED]: '负载均衡',
        [IntelTaskAssigneeStrategy.USER_POOL]: '人员池',
    };

    const ruleCompletionLabels: Record<string, string> = {
        [IntelTaskCompletionPolicy.EACH]: '每人',
        [IntelTaskCompletionPolicy.ANY_ONE]: '任一人',
        [IntelTaskCompletionPolicy.QUORUM]: '达标数',
        [IntelTaskCompletionPolicy.ALL]: '全员',
    };

    const ruleColumns = [
        {
            title: '范围',
            dataIndex: 'scopeType',
            render: (value: string) => ruleScopeLabels[value] || value,
        },
        {
            title: '频率',
            dataIndex: 'frequencyType',
            render: (value: string) => cycleTypeLabels[value] || value,
        },
        {
            title: '时间',
            dataIndex: 'dispatchAtMinute',
            render: (value: number) => formatMinute(value),
        },
        {
            title: '分配',
            dataIndex: 'assigneeStrategy',
            render: (value: string) => ruleAssigneeLabels[value] || value,
        },
        {
            title: '完成',
            dataIndex: 'completionPolicy',
            render: (value: string) => ruleCompletionLabels[value] || value,
        },
        {
            title: '监控(30天)',
            render: (_: any, record: IntelTaskRuleResponse) => {
                const metrics = ruleMetricsMap.get(record.id);
                if (!metrics) return '--';
                const lastRun = metrics.lastCreatedAt ? dayjs(metrics.lastCreatedAt).format('YYYY-MM-DD') : '--';
                return (
                    <Space wrap>
                        <Tag color="blue">总 {metrics.total}</Tag>
                        <Tag color="green">完 {metrics.completed}</Tag>
                        <Tag color="red">逾 {metrics.overdue}</Tag>
                        <Tag>迟 {metrics.late}</Tag>
                        <Tag>最近 {lastRun}</Tag>
                    </Space>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '禁用'}</Tag>,
        },
        {
            title: '操作',
            render: (_: any, record: IntelTaskRuleResponse) => (
                <Space size="small">
                    <Button size="small" onClick={() => {
                        blurActiveElement();
                        setRuleLogTarget(record);
                        setRuleLogOpen(true);
                    }}>记录</Button>
                    <Button size="small" onClick={() => openRuleModal(record)}>编辑</Button>
                    <Popconfirm
                        title="确定删除该规则吗？"
                        onConfirm={async () => {
                            await deleteRuleMutation.mutateAsync({ id: record.id, templateId: record.templateId });
                        }}
                    >
                        <Button size="small" danger>删除</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const openRulesDrawer = (template: IntelTaskTemplateResponse) => {
        blurActiveElement();
        setRuleTemplate(template);
        setRulesDrawerOpen(true);
    };

    const closeRulesDrawer = () => {
        blurActiveElement();
        setRulesDrawerOpen(false);
        setRuleTemplate(null);
        setEditingRule(null);
        setRuleLogOpen(false);
        setRuleLogTarget(null);
    };

    const handleRulePointScopeChange = (value: 'TYPE' | 'POINTS') => {
        setRulePointScope(value);
        if (value === 'TYPE') {
            ruleForm.setFieldValue('scopePointIds', []);
        } else {
            ruleForm.setFieldValue('scopeTargetPointType', undefined);
        }
    };

    const openRuleModal = (rule?: IntelTaskRuleResponse) => {
        // 避免触发元素在 aria-hidden 切换时保留焦点
        blurActiveElement();
        setEditingRule(rule || null);
        const minute = rule?.dispatchAtMinute ?? 540;
        const rawScope = rule?.scopeQuery;
        let parsedScope: any = {};
        if (typeof rawScope === 'string') {
            try {
                parsedScope = JSON.parse(rawScope);
            } catch {
                parsedScope = {};
            }
        } else if (rawScope) {
            parsedScope = rawScope;
        }
        const pointMode =
            parsedScope?.targetPointType
                ? 'TYPE'
                : (parsedScope?.collectionPointIds?.length || parsedScope?.collectionPointId)
                    ? 'POINTS'
                    : 'TYPE';
        setRulePointScope(pointMode);
        setUseAdvancedScope(false);

        let duePolicy: any = rule?.duePolicy;
        if (typeof duePolicy === 'string') {
            try {
                duePolicy = JSON.parse(duePolicy);
            } catch {
                duePolicy = undefined;
            }
        }
        const quorumCount = duePolicy?.quorum ?? duePolicy?.minComplete;
        const quorumRatio = duePolicy?.ratio;

        ruleForm.setFieldsValue({
            templateId: rule?.templateId || ruleTemplate?.id,
            scopeType: rule?.scopeType || IntelTaskRuleScopeType.POINT,
            scopeQueryJson: rule?.scopeQuery ? JSON.stringify(parsedScope, null, 2) : undefined,
            scopeUserIds: parsedScope?.userIds || [],
            scopeDepartmentIds: parsedScope?.departmentIds || [],
            scopeOrganizationIds: parsedScope?.organizationIds || [],
            scopeRoleIds: parsedScope?.roleIds || [],
            scopePointIds: parsedScope?.collectionPointIds || (parsedScope?.collectionPointId ? [parsedScope.collectionPointId] : []),
            scopeTargetPointType: parsedScope?.targetPointType,
            frequencyType: rule?.frequencyType || TaskCycleType.DAILY,
            weekdays: rule?.weekdays || [],
            monthDays: rule?.monthDays || [],
            dispatchTime: dayjs().hour(Math.floor(minute / 60)).minute(minute % 60),
            assigneeStrategy: rule?.assigneeStrategy || IntelTaskAssigneeStrategy.POINT_OWNER,
            completionPolicy: rule?.completionPolicy || IntelTaskCompletionPolicy.EACH,
            quorumCount,
            quorumRatio,
            grouping: rule?.grouping ?? false,
            isActive: rule?.isActive ?? true,
        });
        setIsRuleModalOpen(true);
    };

    const handleSaveRule = async () => {
        const values = await ruleForm.validateFields();
        const {
            dispatchTime,
            scopeQueryJson,
            scopeUserIds,
            scopeDepartmentIds,
            scopeOrganizationIds,
            scopeRoleIds,
            scopePointIds,
            scopeTargetPointType,
            quorumCount,
            quorumRatio,
            ...rest
        } = values;

        let parsedScopeQuery: any = undefined;
        if (useAdvancedScope) {
            if (typeof scopeQueryJson === 'string' && scopeQueryJson.trim().length > 0) {
                try {
                    parsedScopeQuery = JSON.parse(scopeQueryJson);
                } catch {
                    message.error('范围条件 JSON 格式错误');
                    return;
                }
            }
        } else {
            const scopeType = rest.scopeType;
            if (scopeType === IntelTaskRuleScopeType.POINT) {
                parsedScopeQuery = {};
                if (rulePointScope === 'TYPE' && scopeTargetPointType) {
                    parsedScopeQuery.targetPointType = scopeTargetPointType;
                }
                if (rulePointScope === 'POINTS' && scopePointIds?.length) {
                    parsedScopeQuery.collectionPointIds = scopePointIds;
                }
            } else if (scopeType === IntelTaskRuleScopeType.USER) {
                parsedScopeQuery = { userIds: scopeUserIds || [] };
            } else if (scopeType === IntelTaskRuleScopeType.DEPARTMENT) {
                parsedScopeQuery = { departmentIds: scopeDepartmentIds || [] };
            } else if (scopeType === IntelTaskRuleScopeType.ORGANIZATION) {
                parsedScopeQuery = { organizationIds: scopeOrganizationIds || [] };
            } else if (scopeType === IntelTaskRuleScopeType.ROLE) {
                parsedScopeQuery = { roleIds: scopeRoleIds || [] };
            } else if (scopeType === IntelTaskRuleScopeType.QUERY) {
                parsedScopeQuery = {};
                if (scopeUserIds?.length) parsedScopeQuery.userIds = scopeUserIds;
                if (scopeDepartmentIds?.length) parsedScopeQuery.departmentIds = scopeDepartmentIds;
                if (scopeOrganizationIds?.length) parsedScopeQuery.organizationIds = scopeOrganizationIds;
                if (scopeRoleIds?.length) parsedScopeQuery.roleIds = scopeRoleIds;
                if (rulePointScope === 'TYPE' && scopeTargetPointType) {
                    parsedScopeQuery.targetPointType = scopeTargetPointType;
                }
                if (rulePointScope === 'POINTS' && scopePointIds?.length) {
                    parsedScopeQuery.collectionPointIds = scopePointIds;
                }
            }
        }

        let duePolicy: any = undefined;
        if (rest.completionPolicy === IntelTaskCompletionPolicy.QUORUM) {
            if (quorumCount) {
                duePolicy = { quorum: Number(quorumCount) };
            } else if (quorumRatio) {
                duePolicy = { ratio: Number(quorumRatio) };
            }
        }
        const payload = {
            ...rest,
            scopeQuery: parsedScopeQuery,
            dispatchAtMinute: dispatchTime ? dispatchTime.hour() * 60 + dispatchTime.minute() : 540,
            duePolicy,
        };

        if (editingRule) {
            await updateRuleMutation.mutateAsync({ id: editingRule.id, data: payload });
        } else {
            await createRuleMutation.mutateAsync(payload);
        }
        blurActiveElement();
        setIsRuleModalOpen(false);
        setEditingRule(null);
        ruleForm.resetFields();
    };

    const normalizeTemplatePayload = (values: any) => {
        // 剔除 UI 辅助字段 placeholder，防止 Prisma 报错
        const {
            placeholder,
            pointSelectionMode,
            runAtHour,
            runAtMin,
            dueAtHour,
            dueAtMin,
            ...rest
        } = values;

        // Handle PointSelectionMode logic
        let finalTargetPointTypes = rest.targetPointTypes || [];
        let finalCollectionPointIds = rest.collectionPointIds || [];

        if (rest.assigneeMode === 'BY_COLLECTION_POINT') {
            const hasPointIds = finalCollectionPointIds.length > 0;
            const hasTypes = finalTargetPointTypes.length > 0;
            if (pointSelectionMode === 'TYPE' || (hasTypes && !hasPointIds)) {
                finalCollectionPointIds = [];
            } else if (pointSelectionMode === 'POINTS' || (hasPointIds && !hasTypes)) {
                finalTargetPointTypes = [];
            }
        } else {
            // clear both if mode changed
            finalTargetPointTypes = [];
            finalCollectionPointIds = [];
        }

        const taskType = rest.taskType;
        const scheduleMode = taskType === IntelTaskType.COLLECTION
            ? (rest.scheduleMode || TaskScheduleMode.POINT_DEFAULT)
            : TaskScheduleMode.TEMPLATE_OVERRIDE;

        return {
            ...rest,
            scheduleMode,
            targetPointTypes: finalTargetPointTypes,
            collectionPointIds: finalCollectionPointIds,
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
            valueEnum: taskTypeValueEnum,
            render: (_, r) => <Tag>{taskTypeLabels[r.taskType] || r.taskType}</Tag>
        },
        {
            title: '分配对象',
            dataIndex: 'assigneeMode',
            render: (_, r) => {
                if (r.assigneeMode === 'ALL_ACTIVE') {
                    return <Tag color="green">{assigneeModeLabels[r.assigneeMode] || '全员'}</Tag>;
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
                if (r.assigneeMode === 'BY_COLLECTION_POINT') {
                    const types = (r.targetPointTypes && r.targetPointTypes.length > 0)
                        ? r.targetPointTypes
                        : (r.targetPointType ? [r.targetPointType] : []);
                    if (types.length > 0) {
                        return (
                            <Space wrap>
                                <Tag color="orange">{assigneeModeLabels[r.assigneeMode] || '按采集点分配'}</Tag>
                                {types.slice(0, 3).map((type) => (
                                    <Tag key={type} color="orange">
                                        {collectionPointTypeLabels[type] || type}
                                    </Tag>
                                ))}
                                {types.length > 3 && <Tag>+{types.length - 3}</Tag>}
                            </Space>
                        );
                    }
                    return (
                        <Space wrap>
                            <Tag color="orange">{assigneeModeLabels[r.assigneeMode] || '采集点'}</Tag>
                            {(r.collectionPointIds || []).length} 个
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
            valueEnum: taskPriorityValueEnum,
            render: (_, r) => (
                <Tag color={taskPriorityMeta.colors[r.priority] || (r.priority === IntelTaskPriority.URGENT ? 'red' : 'blue')}>
                    {taskPriorityMeta.labels[r.priority] || r.priority}
                </Tag>
            )
        },
        {
            title: '周期',
            dataIndex: 'cycleType',
            valueType: 'select',
            valueEnum: cycleTypeValueEnum,
            render: (_, r) => {
                if (r.taskType === IntelTaskType.COLLECTION && r.scheduleMode === TaskScheduleMode.POINT_DEFAULT) {
                    return <Tag color="cyan">{SCHEDULE_MODE_LABELS[TaskScheduleMode.POINT_DEFAULT]}</Tag>;
                }
                return <Tag color="geekblue">{cycleTypeLabels[r.cycleType] || r.cycleType}</Tag>;
            }
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
                            blurActiveElement();
                            setCurrentTemplate(record);
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
                            blurActiveElement();
                            setCurrentTemplate(record);
                            setPreviewDrawerVisible(true);
                        }}
                    >
                        调度
                    </Button>
                    <Button
                        key="distribute"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={async () => {
                            blurActiveElement();
                            setCurrentTemplate(record);
                            const data = await previewMutation.mutateAsync(record.id);
                            setDistributionPreviewData(data);
                            setIsDistributionPreviewOpen(true);
                        }}
                    >
                        分发
                    </Button>
                    <Button
                        key="rules"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => openRulesDrawer(record)}
                    >
                        规则
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
                    <Button
                        key="create"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            blurActiveElement();
                            setIsCreateModalOpen(true);
                        }}
                    >
                        新建模板
                    </Button>
                ]}
            />

            {/* 创建模板Modal */}
            <Modal
                title="创建任务模板"
                open={isCreateModalOpen}
                onCancel={() => {
                    blurActiveElement();
                    setIsCreateModalOpen(false);
                }}
                onOk={async () => {
                    try {
                        const values = await createForm.validateFields();
                        await handleCreate({
                            ...values,
                            runAtMinute: (values.runAtHour || 0) * 60 + (values.runAtMin || 0),
                            dueAtMinute: (values.dueAtHour || 0) * 60 + (values.dueAtMin || 0),
                        });
                        blurActiveElement();
                        setIsCreateModalOpen(false);
                    } catch (err) {
                        // 校验失败，不关闭
                    }
                }}
                width={980}
                destroyOnClose
                centered
                confirmLoading={createMutation.isPending}
                focusTriggerAfterClose={false}
                afterOpenChange={createModalProps.afterOpenChange}
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    initialValues={normalizeTemplateForForm(DEFAULT_TEMPLATE_VALUES)}
                >
                    <TemplateFormCards
                        form={createForm}
                        containerRef={createContainerRef}
                        autoFocusFieldProps={createAutoFocusFieldProps}
                    />
                </Form>
            </Modal>

            {/* 编辑模板Modal */}
            <Modal
                title="编辑任务模板"
                open={isEditModalOpen}
                onCancel={() => {
                    blurActiveElement();
                    setIsEditModalOpen(false);
                }}
                onOk={async () => {
                    try {
                        const values = await editForm.validateFields();
                        await handleUpdate({
                            ...values,
                            runAtMinute: (values.runAtHour || 0) * 60 + (values.runAtMin || 0),
                            dueAtMinute: (values.dueAtHour || 0) * 60 + (values.dueAtMin || 0),
                        });
                        blurActiveElement();
                        setIsEditModalOpen(false);
                    } catch (err) {
                        // 校验失败，不关闭
                    }
                }}
                width={980}
                destroyOnClose
                centered
                confirmLoading={updateMutation.isPending}
                focusTriggerAfterClose={false}
                afterOpenChange={editModalProps.afterOpenChange}
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    initialValues={currentTemplate ? normalizeTemplateForForm(currentTemplate) : undefined}
                >
                    <TemplateFormCards
                        form={editForm}
                        containerRef={editContainerRef}
                        autoFocusFieldProps={editAutoFocusFieldProps}
                    />
                </Form>
            </Modal>

            <Drawer
                title="调度预览"
                width={800}
                open={previewDrawerVisible}
                onClose={() => {
                    blurActiveElement();
                    setPreviewDrawerVisible(false);
                }}
            >
                {currentTemplate && (
                    <>
                        {currentTemplate.taskType === IntelTaskType.COLLECTION
                            && currentTemplate.scheduleMode === TaskScheduleMode.POINT_DEFAULT ? (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="该模板按采集点频率下发，调度预览请以采集点配置为准。"
                                />
                            ) : (
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
                    </>
                )}
            </Drawer>

            <DistributionPreview
                open={isDistributionPreviewOpen}
                onCancel={() => {
                    blurActiveElement();
                    setIsDistributionPreviewOpen(false);
                }}
                data={distributionPreviewData}
                loading={distributeMutation.isPending}
                onExecute={async () => {
                    if (currentTemplate) {
                        await distributeMutation.mutateAsync({ templateId: currentTemplate.id });
                        message.success('任务分发成功');
                        blurActiveElement();
                        setIsDistributionPreviewOpen(false);
                    }
                }}
            />

            <Drawer
                title={`规则配置${ruleTemplate ? ` - ${ruleTemplate.name}` : ''}`}
                width={720}
                open={rulesDrawerOpen}
                onClose={closeRulesDrawer}
            >
                <Space style={{ marginBottom: 16 }}>
                    <Button type="primary" onClick={() => openRuleModal()}>新增规则</Button>
                </Space>
                {ruleMetrics && (
                    <Alert
                        type="info"
                        showIcon
                        message={`统计区间：${dayjs(ruleMetrics.rangeStart).format('YYYY-MM-DD')} ~ ${dayjs(ruleMetrics.rangeEnd).format('YYYY-MM-DD')}`}
                        style={{ marginBottom: 16 }}
                    />
                )}
                <Table
                    rowKey="id"
                    columns={ruleColumns as any}
                    dataSource={rules}
                    loading={rulesLoading}
                    pagination={false}
                />
            </Drawer>

            <Modal
                title={editingRule ? '编辑规则' : '新增规则'}
                open={isRuleModalOpen}
                onCancel={() => {
                    blurActiveElement();
                    setIsRuleModalOpen(false);
                }}
                onOk={handleSaveRule}
                destroyOnClose
                focusTriggerAfterClose={false}
                afterOpenChange={ruleModalProps.afterOpenChange}
            >
                <div ref={ruleContainerRef}>
                    <Form form={ruleForm} layout="vertical">
                    <Form.Item name="templateId" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="scopeType"
                        label="范围"
                        rules={[{ required: true, message: '请选择范围' }]}
                    >
                        <Select
                            ref={ruleScopeSelectRef}
                            options={Object.entries(ruleScopeLabels).map(([value, label]) => ({ value, label }))}
                        />
                    </Form.Item>
                    <Form.Item label="范围配置">
                        <Space>
                            <Switch checked={useAdvancedScope} onChange={setUseAdvancedScope} />
                            <span>高级 JSON</span>
                        </Space>
                    </Form.Item>

                    {useAdvancedScope ? (
                        <Form.Item name="scopeQueryJson" label="范围条件（JSON）">
                            <Input.TextArea rows={3} placeholder='例如：{"collectionPointIds":["..."]}' />
                        </Form.Item>
                    ) : (
                        <>
                            {ruleScopeType === IntelTaskRuleScopeType.POINT && (
                                <>
                                    <Form.Item label="采集点范围">
                                        <Segmented
                                            value={rulePointScope}
                                            onChange={(value) => handleRulePointScopeChange(value as 'TYPE' | 'POINTS')}
                                            options={[
                                                { label: '按类型', value: 'TYPE' },
                                                { label: '按采集点', value: 'POINTS' },
                                            ]}
                                        />
                                    </Form.Item>
                                    {rulePointScope === 'TYPE' && (
                                        <Form.Item name="scopeTargetPointType" label="采集点类型">
                                            <Select
                                                allowClear
                                                placeholder="选择采集点类型"
                                                options={Object.entries(collectionPointTypeLabels).map(([value, label]) => ({
                                                    value,
                                                    label,
                                                }))}
                                            />
                                        </Form.Item>
                                    )}
                                    {rulePointScope === 'POINTS' && (
                                        <Form.Item name="scopePointIds" label="指定采集点">
                                            <Select
                                                mode="multiple"
                                                placeholder="搜索并选择采集点"
                                                showSearch
                                                optionFilterProp="label"
                                                maxTagCount={5}
                                                options={collectionPoints.map((point) => ({
                                                    value: point.id,
                                                    label: `${point.name}${point.code ? ` (${point.code})` : ''}`,
                                                }))}
                                            />
                                        </Form.Item>
                                    )}
                                </>
                            )}

                            {ruleScopeType === IntelTaskRuleScopeType.USER && (
                                <Form.Item name="scopeUserIds" label="指定人员">
                                    <Select
                                        mode="multiple"
                                        placeholder="搜索并选择人员"
                                        showSearch
                                        optionFilterProp="label"
                                        maxTagCount={5}
                                        options={users.map((user) => ({
                                            value: user.id,
                                            label: `${user.name}${user.department?.name ? ` (${user.department?.name})` : ''}`,
                                        }))}
                                    />
                                </Form.Item>
                            )}

                            {ruleScopeType === IntelTaskRuleScopeType.DEPARTMENT && (
                                <Form.Item name="scopeDepartmentIds" label="选择部门">
                                    <OrgDeptTreeSelect
                                        mode="dept"
                                        multiple
                                        showUserCount
                                        placeholder="选择目标部门"
                                    />
                                </Form.Item>
                            )}

                            {ruleScopeType === IntelTaskRuleScopeType.ORGANIZATION && (
                                <Form.Item name="scopeOrganizationIds" label="选择组织">
                                    <OrgDeptTreeSelect
                                        mode="org"
                                        multiple
                                        placeholder="选择目标组织"
                                    />
                                </Form.Item>
                            )}

                            {ruleScopeType === IntelTaskRuleScopeType.ROLE && (
                                <Form.Item name="scopeRoleIds" label="选择角色">
                                    <Select
                                        mode="multiple"
                                        placeholder="选择角色"
                                        showSearch
                                        optionFilterProp="label"
                                        maxTagCount={5}
                                        options={roles.map((role) => ({
                                            value: role.id,
                                            label: `${role.name}${role.code ? ` (${role.code})` : ''}`,
                                        }))}
                                    />
                                </Form.Item>
                            )}

                            {ruleScopeType === IntelTaskRuleScopeType.QUERY && (
                                <>
                                    <Divider orientation="left">人员范围</Divider>
                                    <Form.Item name="scopeUserIds" label="指定人员">
                                        <Select
                                            mode="multiple"
                                            placeholder="搜索并选择人员"
                                            showSearch
                                            optionFilterProp="label"
                                            maxTagCount={5}
                                            options={users.map((user) => ({
                                                value: user.id,
                                                label: `${user.name}${user.department?.name ? ` (${user.department?.name})` : ''}`,
                                            }))}
                                        />
                                    </Form.Item>
                                    <Form.Item name="scopeDepartmentIds" label="部门条件">
                                        <OrgDeptTreeSelect
                                            mode="dept"
                                            multiple
                                            showUserCount
                                            placeholder="选择目标部门"
                                        />
                                    </Form.Item>
                                    <Form.Item name="scopeOrganizationIds" label="组织条件">
                                        <OrgDeptTreeSelect
                                            mode="org"
                                            multiple
                                            placeholder="选择目标组织"
                                        />
                                    </Form.Item>
                                    <Form.Item name="scopeRoleIds" label="角色条件">
                                        <Select
                                            mode="multiple"
                                            placeholder="选择角色"
                                            showSearch
                                            optionFilterProp="label"
                                            maxTagCount={5}
                                            options={roles.map((role) => ({
                                                value: role.id,
                                                label: `${role.name}${role.code ? ` (${role.code})` : ''}`,
                                            }))}
                                        />
                                    </Form.Item>

                                    <Divider orientation="left">采集点范围</Divider>
                                    <Form.Item label="采集点范围">
                                        <Segmented
                                            value={rulePointScope}
                                            onChange={(value) => handleRulePointScopeChange(value as 'TYPE' | 'POINTS')}
                                            options={[
                                                { label: '按类型', value: 'TYPE' },
                                                { label: '按采集点', value: 'POINTS' },
                                            ]}
                                        />
                                    </Form.Item>
                                    {rulePointScope === 'TYPE' && (
                                        <Form.Item name="scopeTargetPointType" label="采集点类型">
                                            <Select
                                                allowClear
                                                placeholder="选择采集点类型"
                                                options={Object.entries(collectionPointTypeLabels).map(([value, label]) => ({
                                                    value,
                                                    label,
                                                }))}
                                            />
                                        </Form.Item>
                                    )}
                                    {rulePointScope === 'POINTS' && (
                                        <Form.Item name="scopePointIds" label="指定采集点">
                                            <Select
                                                mode="multiple"
                                                placeholder="搜索并选择采集点"
                                                showSearch
                                                optionFilterProp="label"
                                                maxTagCount={5}
                                                options={collectionPoints.map((point) => ({
                                                    value: point.id,
                                                    label: `${point.name}${point.code ? ` (${point.code})` : ''}`,
                                                }))}
                                            />
                                        </Form.Item>
                                    )}
                                </>
                            )}
                        </>
                    )}
                    <Form.Item
                        name="frequencyType"
                        label="频率"
                        rules={[{ required: true, message: '请选择频率' }]}
                    >
                        <Select options={cycleTypeOptions} />
                    </Form.Item>
                    <Form.Item name="dispatchTime" label="下发时间">
                        <TimePicker format="HH:mm" />
                    </Form.Item>

                    {ruleFrequencyType === TaskCycleType.WEEKLY && (
                        <Form.Item name="weekdays" label="每周">
                            <Select mode="multiple" options={weekDayOptions} />
                        </Form.Item>
                    )}

                    {ruleFrequencyType === TaskCycleType.MONTHLY && (
                        <Form.Item name="monthDays" label="每月">
                            <Select mode="multiple" options={monthDayOptions} />
                        </Form.Item>
                    )}

                    <Form.Item name="assigneeStrategy" label="分配策略">
                        <Select options={Object.entries(ruleAssigneeLabels).map(([value, label]) => ({ value, label }))} />
                    </Form.Item>
                    <Form.Item name="completionPolicy" label="完成策略">
                        <Select options={Object.entries(ruleCompletionLabels).map(([value, label]) => ({ value, label }))} />
                    </Form.Item>
                    {ruleCompletionPolicy === IntelTaskCompletionPolicy.QUORUM && (
                        <Space style={{ display: 'flex', marginBottom: 16 }} size="large" align="start">
                            <Form.Item name="quorumCount" label="达标数" style={{ marginBottom: 0 }}>
                                <InputNumber min={1} placeholder="如 3" />
                            </Form.Item>
                            <Form.Item name="quorumRatio" label="达标比例" style={{ marginBottom: 0 }}>
                                <InputNumber min={0.1} max={1} step={0.1} placeholder="如 0.6" />
                            </Form.Item>
                        </Space>
                    )}
                    <Form.Item name="grouping" label="生成任务组" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item name="isActive" label="启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    </Form>
                </div>
            </Modal>

            <Modal
                title={`执行记录${ruleLogTarget ? ` - ${ruleScopeLabels[ruleLogTarget.scopeType] || ruleLogTarget.scopeType}` : ''}`}
                open={ruleLogOpen}
                onCancel={() => {
                    blurActiveElement();
                    setRuleLogOpen(false);
                }}
                footer={(
                    <Button
                        ref={ruleLogCloseBtnRef}
                        onClick={() => {
                            blurActiveElement();
                            setRuleLogOpen(false);
                        }}
                    >
                        关闭
                    </Button>
                )}
                destroyOnClose
                focusTriggerAfterClose={false}
                afterOpenChange={ruleLogModalProps.afterOpenChange}
            >
                <div ref={ruleLogContainerRef}>
                    {ruleLogTarget ? (
                        (() => {
                            const logs = ruleDailyMap.get(ruleLogTarget.id) || [];
                            if (!logs.length) {
                                return <Alert type="info" showIcon message="当前规则暂无执行记录" />;
                            }
                            return (
                                <Timeline
                                    items={logs.slice(0, 30).map((item) => ({
                                        color: item.overdue > 0 ? 'red' : item.completed > 0 ? 'green' : 'blue',
                                        children: `${item.date} 生成 ${item.total} 完成 ${item.completed} 逾期 ${item.overdue}`,
                                    }))}
                                />
                            );
                        })()
                    ) : (
                        <Alert type="info" showIcon message="请选择规则查看执行记录" />
                    )}
                </div>
            </Modal>
        </>
    );
};
