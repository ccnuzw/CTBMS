import { useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import { ActionType } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {
    IntelTaskType,
    TaskCycleType,
    TaskScheduleMode,
    IntelTaskTemplateResponse,
    IntelTaskRuleScopeType,
    IntelTaskAssigneeStrategy,
    IntelTaskCompletionPolicy,
    IntelTaskRuleResponse,
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    IntelTaskPriority,
} from '@packages/types';
import { useTaskTemplates, useCreateTaskTemplate, useUpdateTaskTemplate, useDeleteTaskTemplate, useDistributeTasks, usePreviewDistribution, useTaskRules, useCreateTaskRule, useUpdateTaskRule, useDeleteTaskRule, useRuleMetrics } from '../../../api/tasks';
import { useCollectionPoints } from '../../../api/collection-point';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';
import { useUsers } from '../../../../users/api/users';
import { useRoles } from '../../../../users/api/roles';
import { useModalAutoFocus } from '../../../../../hooks/useModalAutoFocus';
import { useDictionaries } from '@/hooks/useDictionaries';

export const computeNextRuns = (template: IntelTaskTemplateResponse, count = 5) => {
    if (!template.nextRunAt) return [];
    if (template.scheduleMode === TaskScheduleMode.POINT_DEFAULT) return [];

    const runs = [];
    let current = dayjs(template.nextRunAt);

    for (let i = 0; i < count; i++) {
        runs.push(current.format('YYYY-MM-DD HH:mm'));
        if (template.cycleType === TaskCycleType.DAILY) current = current.add(1, 'day');
        if (template.cycleType === TaskCycleType.WEEKLY) current = current.add(1, 'week');
        if (template.cycleType === TaskCycleType.MONTHLY) current = current.add(1, 'month');
    }
    return runs;
};

export const formatMinute = (minute: number | null | undefined) => {
    if (minute == null || Number.isNaN(minute)) return '--:--';
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const DEFAULT_TEMPLATE_VALUES = {
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

export const SCHEDULE_MODE_LABELS: Record<TaskScheduleMode, string> = {
    [TaskScheduleMode.POINT_DEFAULT]: '采集点频率',
    [TaskScheduleMode.TEMPLATE_OVERRIDE]: '模板覆盖',
};

export const normalizeTemplateForForm = (template: Record<string, any>) => {
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
        description: template.description ?? undefined,
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

export function useTaskTemplateListViewModel() {
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
    const [distributionPreviewData, setDistributionPreviewData] = useState<any>(null);
    const [isDistributionPreviewOpen, setIsDistributionPreviewOpen] = useState(false);

    // Focus state
    const createFocus = useModalAutoFocus();
    const editFocus = useModalAutoFocus();
    const ruleFocus = useModalAutoFocus();
    const ruleLogFocus = useModalAutoFocus();

    // Data fetching
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

    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments();
    const { data: users = [] } = useUsers({ status: 'ACTIVE' });
    const { data: roles = [] } = useRoles();
    const { data: collectionPointsResult } = useCollectionPoints({ isActive: true, pageSize: 1000 });
    const collectionPoints = collectionPointsResult?.data || [];
    const { data: dictionaries } = useDictionaries([
        'INTEL_TASK_TYPE',
        'INTEL_TASK_PRIORITY',
        'TASK_CYCLE_TYPE',
        'COLLECTION_POINT_TYPE',
        'ASSIGNEE_MODE',
    ]);

    const orgMap = useMemo(() => new Map(organizations.map((org) => [org.id, org.name])), [organizations]);
    const deptMap = useMemo(() => new Map(departments.map((dept) => [dept.id, dept.name])), [departments]);
    const userMap = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);
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
        const map = new Map<string, unknown[]>();
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
        blurActiveElement();
        setEditingRule(rule || null);
        const minute = rule?.dispatchAtMinute ?? 540;
        const rawScope = rule?.scopeQuery;
        let parsedScope: Record<string, any> = {};
        if (typeof rawScope === 'string') {
            try {
                parsedScope = JSON.parse(rawScope);
            } catch {
                parsedScope = {};
            }
        } else if (rawScope) {
            parsedScope = rawScope;
        }
        const pointMode = parsedScope?.targetPointType
            ? 'TYPE'
            : (parsedScope?.collectionPointIds?.length || parsedScope?.collectionPointId)
                ? 'POINTS'
                : 'TYPE';

        setRulePointScope(pointMode);
        setUseAdvancedScope(false);

        let duePolicy: Record<string, any> | undefined = rule?.duePolicy;
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
            scopeTargetPointType: Array.isArray(parsedScope?.targetPointType) ? parsedScope.targetPointType : (parsedScope?.targetPointType ? [parsedScope.targetPointType] : []),
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

        let parsedScopeQuery: Record<string, any> | undefined = undefined;
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
                if (rulePointScope === 'TYPE' && scopeTargetPointType?.length) {
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
                if (rulePointScope === 'TYPE' && scopeTargetPointType?.length) {
                    parsedScopeQuery.targetPointType = scopeTargetPointType;
                }
                if (rulePointScope === 'POINTS' && scopePointIds?.length) {
                    parsedScopeQuery.collectionPointIds = scopePointIds;
                }
            }
        }

        let duePolicy: Record<string, any> | undefined = undefined;
        if (rest.completionPolicy === IntelTaskCompletionPolicy.QUORUM) {
            if (quorumCount) {
                duePolicy = { quorum: Number(quorumCount) };
            } else if (quorumRatio) {
                duePolicy = { ratio: Number(quorumRatio) };
            }
        }
        const payload: any = {
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

    const normalizeTemplatePayload = (values: Record<string, any>) => {
        const {
            placeholder,
            pointSelectionMode,
            runAtHour,
            runAtMin,
            dueAtHour,
            dueAtMin,
            ...rest
        } = values;

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
            finalTargetPointTypes = [];
            finalCollectionPointIds = [];
        }

        const taskType = rest.taskType;
        const scheduleMode = taskType === IntelTaskType.COLLECTION
            ? (rest.scheduleMode || TaskScheduleMode.POINT_DEFAULT)
            : TaskScheduleMode.TEMPLATE_OVERRIDE;

        return {
            ...rest,
            description: rest.description ?? undefined,
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

    const handleCreate = async (values: Record<string, any>) => {
        await createMutation.mutateAsync(normalizeTemplatePayload(values) as CreateIntelTaskTemplateDto);
        message.success('模板创建成功');
        actionRef.current?.reload();
        return true;
    };

    const handleUpdate = async (values: Record<string, any>) => {
        if (!currentTemplate) return false;
        await updateMutation.mutateAsync({
            id: currentTemplate.id,
            data: normalizeTemplatePayload(values) as UpdateIntelTaskTemplateDto,
        });
        message.success('模板更新成功');
        actionRef.current?.reload();
        return true;
    };

    return {
        refs: {
            actionRef,
            createFocus,
            editFocus,
            ruleFocus,
            ruleLogFocus,
        },
        state: {
            previewDrawerVisible,
            isCreateModalOpen,
            isEditModalOpen,
            currentTemplate,
            rulesDrawerOpen,
            ruleTemplate,
            isRuleModalOpen,
            editingRule,
            rulePointScope,
            useAdvancedScope,
            ruleLogOpen,
            ruleLogTarget,
            ruleForm,
            createForm,
            editForm,
            distributionPreviewData,
            isDistributionPreviewOpen,
        },
        data: {
            templates,
            rules,
            rulesLoading,
            ruleMetrics,
            organizations,
            departments,
            users,
            roles,
            collectionPoints,
        },
        computed: {
            orgMap,
            deptMap,
            userMap,
            taskTypeLabels,
            taskPriorityMeta,
            cycleTypeLabels,
            cycleTypeOptions,
            collectionPointTypeLabels,
            assigneeModeLabels,
            ruleScopeLabels,
            ruleAssigneeLabels,
            ruleCompletionLabels,
            ruleMetricsMap,
            ruleDailyMap,
            taskTypeValueEnum,
            taskPriorityValueEnum,
            cycleTypeValueEnum,
            ruleFrequencyType,
            ruleScopeType,
            ruleCompletionPolicy,
        },
        mutations: {
            createMutation,
            updateMutation,
            deleteMutation,
            distributeMutation,
            previewMutation,
            deleteRuleMutation,
        },
        actions: {
            blurActiveElement,
            openRulesDrawer,
            closeRulesDrawer,
            handleRulePointScopeChange,
            openRuleModal,
            handleSaveRule,
            handleCreate,
            handleUpdate,
        },
        setters: {
            setPreviewDrawerVisible,
            setIsCreateModalOpen,
            setIsEditModalOpen,
            setCurrentTemplate,
            setRulesDrawerOpen,
            setRuleTemplate,
            setIsRuleModalOpen,
            setEditingRule,
            setRulePointScope,
            setUseAdvancedScope,
            setRuleLogOpen,
            setRuleLogTarget,
            setDistributionPreviewData,
            setIsDistributionPreviewOpen,
        }
    };
}
