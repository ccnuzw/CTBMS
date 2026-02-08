import React, { useEffect, useMemo, useState } from 'react';
import {
    Calendar,
    Popover,
    Space,
    theme,
    Tag,
    Button,
    Drawer,
    List,
    Typography,
    Select,
    Radio,
    Table,
    Form,
    Checkbox,
    Modal,
    Input,
    Switch,
    Row,
    Col,
    Divider,
    Segmented,
    Tooltip,
    Empty,
    Grid,
    Descriptions,
    Spin,
} from 'antd';
import {
    FilterOutlined,
    SaveOutlined,
    EditOutlined,
    DeleteOutlined,
    LeftOutlined,
    RightOutlined,
} from '@ant-design/icons';
import VirtualList from 'rc-virtual-list';
import { ProCard } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {
    IntelTaskPriority,
    IntelTaskStatus,
    IntelTaskType,
    INTEL_TASK_PRIORITY_LABELS,
    INTEL_TASK_TYPE_LABELS,
} from '@packages/types';
import { INTEL_TASK_STATUS_LABELS } from '@/constants';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import { useTasks, useCompleteTask, useCalendarPreview, useCalendarSummary } from '../../../api/tasks';
import { useUsers } from '../../../../users/api/users';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';

const { Text, Link } = Typography;

const PRIORITY_META: Array<{ value: IntelTaskPriority; label: string; color: string }> = [
    { value: IntelTaskPriority.URGENT, label: '紧急', color: 'red' },
    { value: IntelTaskPriority.HIGH, label: '高', color: 'orange' },
    { value: IntelTaskPriority.MEDIUM, label: '中', color: 'blue' },
    { value: IntelTaskPriority.LOW, label: '低', color: 'green' },
];

const PRIORITY_COLOR_MAP = new Map(
    PRIORITY_META.map(item => [item.value, item.color]),
);
const PRIORITY_RANK: Record<IntelTaskPriority, number> = {
    [IntelTaskPriority.URGENT]: 0,
    [IntelTaskPriority.HIGH]: 1,
    [IntelTaskPriority.MEDIUM]: 2,
    [IntelTaskPriority.LOW]: 3,
};

const DEFAULT_DAY_PAGE_SIZE = 50;
const PENDING_STATUSES = new Set([IntelTaskStatus.PENDING, IntelTaskStatus.SUBMITTED, IntelTaskStatus.RETURNED]);

const INITIAL_FILTERS = {
    type: undefined as IntelTaskType | undefined,
    priority: undefined as IntelTaskPriority | undefined,
    assigneeId: undefined as string | undefined,
    status: undefined as IntelTaskStatus | undefined,
    assigneeOrgId: undefined as string | undefined,
    assigneeDeptId: undefined as string | undefined,
    orgSummary: false,
    includePreview: false,
};

export const TaskCalendarView: React.FC = () => {
    const { token } = theme.useToken();
    const [form] = Form.useForm();
    const {
        containerRef: saveModalContainerRef,
        focusRef: saveNameInputRef,
        modalProps: saveModalProps,
    } = useModalAutoFocus();
    const {
        containerRef: advancedDrawerContainerRef,
        focusRef: advancedDrawerFocusRef,
        modalProps: advancedDrawerProps,
    } = useModalAutoFocus();
    const {
        containerRef: taskDrawerContainerRef,
        focusRef: taskDrawerFocusRef,
        modalProps: taskDrawerProps,
    } = useModalAutoFocus();
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const screens = Grid.useBreakpoint();
    const isWideDrawer = !!(screens.lg || screens.md);

    const [viewDate, setViewDate] = useState(dayjs());
    const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'calendar' | 'agenda'>('calendar');
    const [dayPageSize, setDayPageSize] = useState(DEFAULT_DAY_PAGE_SIZE);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [drawerFilter, setDrawerFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'PREVIEW'>('ALL');
    const [drawerSort, setDrawerSort] = useState<'DUE' | 'PRIORITY' | 'ASSIGNEE'>('DUE');
    const [drawerGroup, setDrawerGroup] = useState<'NONE' | 'ASSIGNEE' | 'TYPE'>('NONE');
    const [savedFilters, setSavedFilters] = useState<Array<{ id: string; name: string; values: typeof INITIAL_FILTERS }>>([]);
    const [selectedSavedFilterId, setSelectedSavedFilterId] = useState<string | undefined>();
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveMode, setSaveMode] = useState<'create' | 'rename'>('create');
    const [saveName, setSaveName] = useState('');

    const blurActiveElement = () => {
        if (typeof document === 'undefined') return;
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    };

    const openAdvancedDrawer = () => {
        blurActiveElement();
        setAdvancedOpen(true);
    };

    const closeAdvancedDrawer = () => {
        blurActiveElement();
        setAdvancedOpen(false);
    };

    const openTaskDrawer = () => {
        blurActiveElement();
        setDrawerOpen(true);
    };

    const closeTaskDrawer = () => {
        blurActiveElement();
        setDrawerOpen(false);
    };

    // Data Hooks
    const { data: users = [] } = useUsers({ status: 'ACTIVE', organizationId: filters.assigneeOrgId, departmentId: filters.assigneeDeptId });
    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments(filters.assigneeOrgId);
    const completeMutation = useCompleteTask();

    const rangeStart = viewDate.startOf('month').startOf('week').toDate();
    const rangeEnd = viewDate.endOf('month').endOf('week').toDate();

    const normalizedFilters = useMemo(() => {
        const { orgSummary, includePreview, ...restFilters } = filters;
        return {
            ...restFilters,
            assigneeDeptId: orgSummary ? undefined : restFilters.assigneeDeptId,
            assigneeId: orgSummary ? undefined : restFilters.assigneeId,
        };
    }, [filters]);

    const summaryQuery = useMemo(() => {
        return {
            ...normalizedFilters,
            startDate: rangeStart,
            endDate: rangeEnd,
            includePreview: filters.includePreview,
        };
    }, [normalizedFilters, rangeStart, rangeEnd, filters.includePreview]);

    const { data: summaryData, isLoading: summaryLoading } = useCalendarSummary(summaryQuery);
    const summaryList = summaryData?.summary || [];
    const typeStats = summaryData?.typeStats || [];
    const summaryMap = useMemo(() => new Map(summaryList.map(item => [item.date, item])), [summaryList]);

    const dayQuery = useMemo(() => {
        if (!selectedDate) {
            return {
                ...normalizedFilters,
                page: 1,
                pageSize: 1,
            };
        }
        return {
            ...normalizedFilters,
            dueStart: selectedDate.startOf('day').toDate(),
            dueEnd: selectedDate.endOf('day').toDate(),
            page: 1,
            pageSize: dayPageSize,
        };
    }, [normalizedFilters, selectedDate, dayPageSize]);

    const { data: dayTasksData, isLoading: dayTasksLoading } = useTasks(dayQuery, { enabled: !!selectedDate });

    const includePreview = filters.includePreview && !filters.status;
    const previewQuery = useMemo(() => {
        return {
            startDate: selectedDate ? selectedDate.startOf('day').toDate() : rangeStart,
            endDate: selectedDate ? selectedDate.endOf('day').toDate() : rangeStart,
            assigneeId: normalizedFilters.assigneeId,
            assigneeOrgId: normalizedFilters.assigneeOrgId,
            assigneeDeptId: normalizedFilters.assigneeDeptId,
        };
    }, [selectedDate, normalizedFilters, rangeStart]);

    const { data: previewTasks = [] } = useCalendarPreview(previewQuery, { enabled: includePreview && !!selectedDate });

    const previewTasksForDay = useMemo(() => {
        if (!includePreview || !selectedDate) return [];
        return previewTasks
            .filter(task => {
                if (filters.type && task.type !== filters.type) return false;
                if (filters.priority && task.priority !== filters.priority) return false;
                return true;
            })
            .map(task => {
                const assignee = users.find(u => u.id === task.assigneeId);
                return {
                    ...task,
                    assignee: assignee ? { name: assignee.name, avatar: assignee.avatar } : undefined,
                    createdById: 'system',
                    status: 'PREVIEW',
                    isLate: false,
                    description: null,
                    requirements: null,
                    attachmentUrls: [],
                };
            });
    }, [previewTasks, includePreview, selectedDate, filters, users]);

    const selectedDateTasks = useMemo(() => {
        const realTasks = dayTasksData?.data || [];
        return [...realTasks, ...previewTasksForDay].sort((a, b) => {
            const aTime = dayjs(a.dueAt || a.deadline).valueOf();
            const bTime = dayjs(b.dueAt || b.deadline).valueOf();
            return aTime - bTime;
        });
    }, [dayTasksData, previewTasksForDay]);

    useEffect(() => {
        setDayPageSize(DEFAULT_DAY_PAGE_SIZE);
        setSelectedTaskIds([]);
        setSelectedTaskId(null);
        setDrawerFilter('ALL');
        setDrawerSort('DUE');
        setDrawerGroup('NONE');
    }, [selectedDate, normalizedFilters]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem('market-intel-task-calendar-filters');
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as Array<{ id: string; name: string; values: typeof INITIAL_FILTERS }>;
                setSavedFilters(parsed);
            } catch {
                setSavedFilters([]);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('market-intel-task-calendar-filters', JSON.stringify(savedFilters));
    }, [savedFilters]);

    const handleBatchComplete = async () => {
        if (!selectedTaskIds.length) return;
        const uniqueIds = Array.from(new Set(selectedTaskIds));
        await Promise.all(uniqueIds.map(id => completeMutation.mutateAsync({ id })));
        setSelectedTaskIds([]);
    };

    const handleSaveFilters = () => {
        const name = saveName.trim();
        if (!name) return;
        if (saveMode === 'rename' && selectedSavedFilterId) {
            setSavedFilters((prev) => prev.map(item => (
                item.id === selectedSavedFilterId ? { ...item, name } : item
            )));
        } else {
            const entry = { id: `${Date.now()}`, name, values: filters };
            setSavedFilters((prev) => [...prev, entry]);
            setSelectedSavedFilterId(entry.id);
        }
        setSaveName('');
        blurActiveElement();
        setSaveModalOpen(false);
    };

    const handleApplySavedFilter = (id?: string) => {
        setSelectedSavedFilterId(id);
        const target = savedFilters.find(item => item.id === id);
        if (target) {
            setFilterValues(target.values);
        }
    };

    const handleDeleteSavedFilter = () => {
        if (!selectedSavedFilterId) return;
        setSavedFilters((prev) => prev.filter(item => item.id !== selectedSavedFilterId));
        setSelectedSavedFilterId(undefined);
    };

    const selectedSavedFilter = useMemo(() => {
        return savedFilters.find(item => item.id === selectedSavedFilterId);
    }, [savedFilters, selectedSavedFilterId]);

    const areFiltersEqual = (left: typeof INITIAL_FILTERS, right: typeof INITIAL_FILTERS) => {
        return (Object.keys(INITIAL_FILTERS) as Array<keyof typeof INITIAL_FILTERS>)
            .every((key) => left[key] === right[key]);
    };

    const isFilterDirty = useMemo(() => {
        if (!selectedSavedFilter) return false;
        return !areFiltersEqual(filters, selectedSavedFilter.values);
    }, [filters, selectedSavedFilter]);

    const handleOpenSaveModal = (mode: 'create' | 'rename') => {
        setSaveMode(mode);
        setSaveName(mode === 'rename' ? selectedSavedFilter?.name || '' : '');
        blurActiveElement();
        setSaveModalOpen(true);
    };

    const handleOverwriteSavedFilter = () => {
        if (!selectedSavedFilterId) return;
        setSavedFilters((prev) => prev.map(item => (
            item.id === selectedSavedFilterId ? { ...item, values: filters } : item
        )));
    };

    const daySummary = useMemo(() => {
        if (!selectedDate) return undefined;
        return summaryMap.get(selectedDate.format('YYYY-MM-DD'));
    }, [selectedDate, summaryMap]);

    const getHeatColor = (count: number) => {
        if (count >= 15) return token.colorErrorBg;
        if (count >= 8) return token.colorWarningBg;
        if (count >= 4) return token.colorPrimaryBg;
        if (count >= 1) return token.colorFillAlter;
        return 'transparent';
    };

    const dateCellRender = (value: dayjs.Dayjs) => {
        const dateStr = value.format('YYYY-MM-DD');
        const summary = summaryMap.get(dateStr);
        if (!summary) return null;

        const total = summary.total || 0;
        const preview = summary.preview || 0;
        const countForHeat = total + preview;
        const content = (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Text style={{ fontSize: 12 }}>{total}</Text>
                {preview > 0 && <Tag color="cyan" style={{ marginInlineEnd: 0 }}>+{preview}</Tag>}
            </div>
        );

        return (
            <Popover
                title="当日统计"
                content={
                    <div style={{ minWidth: 160 }}>
                        <div>总数: {total}</div>
                        <div>完成: {summary.completed || 0}</div>
                        <div>逾期: {summary.overdue || 0}</div>
                        <div>紧急: {summary.urgent || 0}</div>
                        {preview > 0 && <div>预览: {preview}</div>}
                    </div>
                }
            >
                <div
                    style={{
                        background: getHeatColor(countForHeat),
                        borderRadius: 6,
                        padding: '2px 4px',
                        display: 'inline-flex',
                    }}
                >
                    {content}
                </div>
            </Popover>
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

    const handleFiltersChange = (changedValues: Record<string, any>, values: typeof INITIAL_FILTERS) => {
        const nextValues = { ...values };
        if (Object.prototype.hasOwnProperty.call(changedValues, 'assigneeOrgId')
            && changedValues.assigneeOrgId !== filters.assigneeOrgId) {
            nextValues.assigneeDeptId = undefined;
            nextValues.assigneeId = undefined;
            form.setFieldsValue({ assigneeDeptId: undefined, assigneeId: undefined });
        }
        if (Object.prototype.hasOwnProperty.call(changedValues, 'assigneeDeptId')
            && changedValues.assigneeDeptId !== filters.assigneeDeptId) {
            nextValues.assigneeId = undefined;
            form.setFieldsValue({ assigneeId: undefined });
        }
        if (changedValues?.status && changedValues.status) {
            nextValues.includePreview = false;
            form.setFieldsValue({ includePreview: false });
        }
        if (nextValues.orgSummary) {
            nextValues.assigneeDeptId = undefined;
            nextValues.assigneeId = undefined;
            if (changedValues?.orgSummary) {
                form.setFieldsValue({ assigneeDeptId: undefined, assigneeId: undefined });
            }
        }
        setFilters(nextValues);
    };

    const setFilterValues = (nextValues: typeof INITIAL_FILTERS) => {
        const normalized = { ...nextValues };
        if (!normalized.assigneeOrgId) {
            normalized.assigneeDeptId = undefined;
            normalized.assigneeId = undefined;
        }
        if (normalized.status) {
            normalized.includePreview = false;
        }
        if (normalized.orgSummary) {
            normalized.assigneeDeptId = undefined;
            normalized.assigneeId = undefined;
        }
        setFilters(normalized);
        form.setFieldsValue(normalized);
    };

    const handleClearAll = () => {
        setFilterValues(INITIAL_FILTERS);
        setSelectedSavedFilterId(undefined);
    };

    const handleClearField = (field: keyof typeof INITIAL_FILTERS) => {
        if (field === 'assigneeOrgId') {
            setFilterValues({
                ...filters,
                assigneeOrgId: undefined,
                assigneeDeptId: undefined,
                assigneeId: undefined,
            });
            return;
        }
        if (field === 'assigneeDeptId') {
            setFilterValues({
                ...filters,
                assigneeDeptId: undefined,
                assigneeId: undefined,
            });
            return;
        }
        setFilterValues({
            ...filters,
            [field]: field === 'orgSummary' || field === 'includePreview' ? false : undefined,
        });
    };

    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
        const orgName = organizations.find(o => o.id === filters.assigneeOrgId)?.name;
        const deptName = departments.find(d => d.id === filters.assigneeDeptId)?.name;
        const userName = users.find(u => u.id === filters.assigneeId)?.name;

        if (filters.assigneeOrgId) {
            chips.push({
                key: 'assigneeOrgId',
                label: `组织: ${orgName || filters.assigneeOrgId}`,
                onClear: () => handleClearField('assigneeOrgId'),
            });
        }
        if (filters.assigneeDeptId) {
            chips.push({
                key: 'assigneeDeptId',
                label: `部门: ${deptName || filters.assigneeDeptId}`,
                onClear: () => handleClearField('assigneeDeptId'),
            });
        }
        if (filters.assigneeId) {
            chips.push({
                key: 'assigneeId',
                label: `负责人: ${userName || filters.assigneeId}`,
                onClear: () => handleClearField('assigneeId'),
            });
        }
        if (filters.type) {
            chips.push({
                key: 'type',
                label: `类型: ${INTEL_TASK_TYPE_LABELS[filters.type]}`,
                onClear: () => handleClearField('type'),
            });
        }
        if (filters.priority) {
            chips.push({
                key: 'priority',
                label: `优先级: ${INTEL_TASK_PRIORITY_LABELS[filters.priority]}`,
                onClear: () => handleClearField('priority'),
            });
        }
        if (filters.status) {
            chips.push({
                key: 'status',
                label: `状态: ${INTEL_TASK_STATUS_LABELS[filters.status]}`,
                onClear: () => handleClearField('status'),
            });
        }
        if (filters.orgSummary) {
            chips.push({
                key: 'orgSummary',
                label: '组织汇总',
                onClear: () => handleClearField('orgSummary'),
            });
        }
        if (filters.includePreview) {
            chips.push({
                key: 'includePreview',
                label: '包含预览任务',
                onClear: () => handleClearField('includePreview'),
            });
        }

        return chips;
    }, [filters, organizations, departments, users]);

    const filteredTypeStats = useMemo(() => {
        return typeStats.filter(row => row.total > 0);
    }, [typeStats]);

    const totalDayTasks = dayTasksData?.total || 0;
    const loadedRealTasks = dayTasksData?.data?.length || 0;

    const drawerCounts = useMemo(() => {
        const counts = {
            all: selectedDateTasks.length,
            pending: 0,
            completed: 0,
            overdue: 0,
            preview: 0,
        };
        selectedDateTasks.forEach((task) => {
            const isPreview = (task as any).isPreview;
            if (isPreview) {
                counts.preview += 1;
                return;
            }
            if (task.status === IntelTaskStatus.COMPLETED) {
                counts.completed += 1;
                return;
            }
            if (task.status === IntelTaskStatus.OVERDUE) {
                counts.overdue += 1;
                return;
            }
            if (PENDING_STATUSES.has(task.status as IntelTaskStatus)) {
                counts.pending += 1;
            }
        });
        return counts;
    }, [selectedDateTasks]);

    const filteredDrawerTasks = useMemo(() => {
        return selectedDateTasks.filter((task) => {
            const isPreview = (task as any).isPreview;
            if (drawerFilter === 'PREVIEW') return isPreview;
            if (drawerFilter === 'COMPLETED') return !isPreview && task.status === IntelTaskStatus.COMPLETED;
            if (drawerFilter === 'OVERDUE') return !isPreview && task.status === IntelTaskStatus.OVERDUE;
            if (drawerFilter === 'PENDING') return !isPreview && PENDING_STATUSES.has(task.status as IntelTaskStatus);
            return true;
        });
    }, [selectedDateTasks, drawerFilter]);

    const selectableTaskIds = useMemo(() => {
        return filteredDrawerTasks
            .filter(item => !(item as any).isPreview && item.status !== IntelTaskStatus.COMPLETED)
            .map(item => item.id);
    }, [filteredDrawerTasks]);

    const sortedDrawerTasks = useMemo(() => {
        const items = [...filteredDrawerTasks];
        const getDueTime = (task: any) => dayjs(task.dueAt || task.deadline).valueOf();
        items.sort((a, b) => {
            if (drawerSort === 'PRIORITY') {
                const rankDiff = (PRIORITY_RANK[a.priority as IntelTaskPriority] ?? 99)
                    - (PRIORITY_RANK[b.priority as IntelTaskPriority] ?? 99);
                if (rankDiff !== 0) return rankDiff;
                return getDueTime(a) - getDueTime(b);
            }
            if (drawerSort === 'ASSIGNEE') {
                const aName = a.assignee?.name || '';
                const bName = b.assignee?.name || '';
                const nameDiff = aName.localeCompare(bName);
                if (nameDiff !== 0) return nameDiff;
                return getDueTime(a) - getDueTime(b);
            }
            return getDueTime(a) - getDueTime(b);
        });
        return items;
    }, [filteredDrawerTasks, drawerSort]);

    const groupedDrawerTasks = useMemo(() => {
        if (drawerGroup === 'NONE') {
            return [{ key: 'all', label: '全部任务', tasks: sortedDrawerTasks }];
        }
        const groupMap = new Map<string, { key: string; label: string; tasks: typeof sortedDrawerTasks }>();
        sortedDrawerTasks.forEach((task) => {
            const key = drawerGroup === 'ASSIGNEE'
                ? (task.assignee?.name || '未分配')
                : (INTEL_TASK_TYPE_LABELS[task.type as IntelTaskType] || task.type);
            if (!groupMap.has(key)) {
                groupMap.set(key, { key, label: key, tasks: [] });
            }
            groupMap.get(key)?.tasks.push(task);
        });
        return Array.from(groupMap.values());
    }, [sortedDrawerTasks, drawerGroup]);

    const selectedTask = useMemo(() => {
        if (!selectedTaskId) return null;
        return selectedDateTasks.find(task => task.id === selectedTaskId) || null;
    }, [selectedTaskId, selectedDateTasks]);

    useEffect(() => {
        if (filteredDrawerTasks.length === 0) {
            setSelectedTaskId(null);
            return;
        }
        if (selectedTaskId && filteredDrawerTasks.some(task => task.id === selectedTaskId)) return;
        setSelectedTaskId(filteredDrawerTasks[0].id);
    }, [filteredDrawerTasks, selectedTaskId]);

    useEffect(() => {
        setSelectedTaskIds((prev) => {
            const filteredIdSet = new Set(filteredDrawerTasks.map(task => task.id));
            const next = prev.filter(id => filteredIdSet.has(id));
            if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
                return prev;
            }
            return next;
        });
    }, [filteredDrawerTasks]);

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

    const handleFocusDate = (date: dayjs.Dayjs, openDrawer = true) => {
        setViewDate(date);
        setSelectedDate(date);
        if (openDrawer) openTaskDrawer();
    };

    const handleFocusWeek = () => {
        setViewMode('agenda');
        setViewDate(dayjs().startOf('week'));
    };

    const handleApplyPresetFilter = (preset: 'OVERDUE' | 'PENDING' | 'PREVIEW' | 'URGENT') => {
        if (preset === 'OVERDUE') {
            setFilterValues({
                ...filters,
                status: filters.status === IntelTaskStatus.OVERDUE ? undefined : IntelTaskStatus.OVERDUE,
            });
            return;
        }
        if (preset === 'PENDING') {
            setFilterValues({
                ...filters,
                status: filters.status === IntelTaskStatus.PENDING ? undefined : IntelTaskStatus.PENDING,
            });
            return;
        }
        if (preset === 'PREVIEW') {
            setFilterValues({
                ...filters,
                status: undefined,
                includePreview: !filters.includePreview,
            });
            return;
        }
        if (preset === 'URGENT') {
            setFilterValues({
                ...filters,
                priority: filters.priority === IntelTaskPriority.URGENT ? undefined : IntelTaskPriority.URGENT,
            });
        }
    };

    const renderTaskItem = (item: any) => {
        const isPreview = (item as any).isPreview;
        const isCompleted = item.status === IntelTaskStatus.COMPLETED;
        const isSelected = selectedTaskIds.includes(item.id);
        const isActive = selectedTaskId === item.id;
        const dueTime = dayjs(item.dueAt || item.deadline).format('HH:mm');

        return (
            <List.Item
                key={item.id}
                style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    padding: '8px 12px',
                    background: isActive ? token.colorFillSecondary : undefined,
                }}
                onClick={() => setSelectedTaskId(item.id)}
                actions={[
                    <Button
                        key="complete"
                        type="link"
                        disabled={isCompleted || isPreview}
                        onClick={(event) => {
                            event.stopPropagation();
                            completeMutation.mutate({ id: item.id });
                        }}
                    >
                        完成
                    </Button>,
                ]}
            >
                <List.Item.Meta
                    title={
                        <Space>
                            <Checkbox
                                disabled={isCompleted || isPreview}
                                checked={isSelected}
                                onChange={(event) => {
                                    event.stopPropagation();
                                    if (event.target.checked) {
                                        setSelectedTaskIds((prev) => Array.from(new Set([...prev, item.id])));
                                    } else {
                                        setSelectedTaskIds((prev) => prev.filter(id => id !== item.id));
                                    }
                                }}
                            />
                            <Text delete={isCompleted}>{item.title}</Text>
                            <Tag>{INTEL_TASK_TYPE_LABELS[item.type as IntelTaskType]}</Tag>
                            {item.priority && (
                                <Tag color={PRIORITY_COLOR_MAP.get(item.priority as IntelTaskPriority)}>
                                    {INTEL_TASK_PRIORITY_LABELS[item.priority as IntelTaskPriority]}
                                </Tag>
                            )}
                            {INTEL_TASK_STATUS_LABELS[(item.status as IntelTaskStatus)] && (
                                <Tag>{INTEL_TASK_STATUS_LABELS[item.status as IntelTaskStatus]}</Tag>
                            )}
                            {isPreview && <Tag color="cyan">预览</Tag>}
                        </Space>
                    }
                    description={
                        <Space direction="vertical" size={0}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                负责人: {item.assignee?.name || '未分配'}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                截止: {dueTime}
                            </Text>
                        </Space>
                    }
                />
            </List.Item>
        );
    };

    const selectedTaskDetails = selectedTask as any;

    return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Modal
                title={saveMode === 'rename' ? '重命名筛选' : '保存筛选'}
                open={saveModalOpen}
                onCancel={() => {
                    blurActiveElement();
                    setSaveModalOpen(false);
                    setSaveName('');
                }}
                onOk={handleSaveFilters}
                okText={saveMode === 'rename' ? '保存名称' : '保存'}
                cancelText="取消"
                okButtonProps={{ disabled: !saveName.trim() }}
                focusTriggerAfterClose={false}
                afterOpenChange={saveModalProps.afterOpenChange}
            >
                <div ref={saveModalContainerRef}>
                    <Input
                        ref={saveNameInputRef}
                        placeholder="筛选名称"
                        value={saveName}
                        onChange={(event) => setSaveName(event.target.value)}
                    />
                </div>
            </Modal>
            <Form
                form={form}
                layout="vertical"
                initialValues={INITIAL_FILTERS}
                onValuesChange={handleFiltersChange}
            >
                <ProCard ghost>
                    <div
                        style={{
                            position: 'sticky',
                            top: 8,
                            zIndex: 2,
                            background: token.colorBgLayout,
                            paddingBottom: 8,
                        }}
                    >
                        <ProCard>
                            <Row gutter={[12, 8]}>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeOrgId" label="组织">
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder="选择组织"
                                            optionFilterProp="label"
                                            options={organizations.map(o => ({ label: o.name, value: o.id }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeDeptId" label="部门">
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder={filters.assigneeOrgId ? '选择部门' : '先选组织'}
                                            optionFilterProp="label"
                                            disabled={!filters.assigneeOrgId || filters.orgSummary}
                                            options={departments.map(d => ({ label: d.name, value: d.id }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeId" label="负责人">
                                        <Select
                                            allowClear
                                            showSearch
                                            placeholder={filters.assigneeOrgId ? '选择负责人' : '先选组织'}
                                            optionFilterProp="label"
                                            disabled={!filters.assigneeOrgId || filters.orgSummary}
                                            options={users.map(u => ({ label: u.name, value: u.id }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="status" label="状态">
                                        <Select
                                            allowClear
                                            options={Object.entries(INTEL_TASK_STATUS_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="type" label="任务类型">
                                        <Select
                                            allowClear
                                            options={Object.entries(INTEL_TASK_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="priority" label="优先级">
                                        <Select
                                            allowClear
                                            options={Object.entries(INTEL_TASK_PRIORITY_LABELS).map(([v, l]) => ({ label: l, value: v }))}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider style={{ margin: '8px 0' }} />

                            <Row align="middle" justify="space-between" gutter={[12, 8]}>
                                <Col flex="auto">
                                    <Space wrap size="small">
                                        <Button icon={<FilterOutlined />} onClick={openAdvancedDrawer}>
                                            高级筛选
                                        </Button>
                                        <Divider type="vertical" />
                                        <Text type="secondary">快速定位</Text>
                                        <Tooltip title="定位到今天并打开列表">
                                            <Button
                                                size="small"
                                                type={selectedDate?.isSame(dayjs(), 'day') ? 'primary' : 'default'}
                                                onClick={() => handleFocusDate(dayjs())}
                                            >
                                                今天
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title="定位到明天并打开列表">
                                            <Button
                                                size="small"
                                                type={selectedDate?.isSame(dayjs().add(1, 'day'), 'day') ? 'primary' : 'default'}
                                                onClick={() => handleFocusDate(dayjs().add(1, 'day'))}
                                            >
                                                明天
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title="切换到议程视图并聚焦本周">
                                            <Button size="small" onClick={handleFocusWeek}>
                                                本周
                                            </Button>
                                        </Tooltip>
                                        <Divider type="vertical" />
                                        <Text type="secondary">快捷筛选</Text>
                                        <Button
                                            size="small"
                                            type={filters.status === IntelTaskStatus.OVERDUE ? 'primary' : 'default'}
                                            onClick={() => handleApplyPresetFilter('OVERDUE')}
                                        >
                                            逾期
                                        </Button>
                                        <Button
                                            size="small"
                                            type={filters.status === IntelTaskStatus.PENDING ? 'primary' : 'default'}
                                            onClick={() => handleApplyPresetFilter('PENDING')}
                                        >
                                            待办
                                        </Button>
                                        <Button
                                            size="small"
                                            type={filters.includePreview && !filters.status ? 'primary' : 'default'}
                                            onClick={() => handleApplyPresetFilter('PREVIEW')}
                                        >
                                            预览
                                        </Button>
                                        <Button
                                            size="small"
                                            type={filters.priority === IntelTaskPriority.URGENT ? 'primary' : 'default'}
                                            onClick={() => handleApplyPresetFilter('URGENT')}
                                        >
                                            紧急
                                        </Button>
                                    </Space>
                                </Col>
                                <Col>
                                    <Space size="small" wrap>
                                        {activeFilterChips.length > 0 && (
                                            <Text type="secondary">已筛选 {activeFilterChips.length} 项</Text>
                                        )}
                                        <Button size="small" onClick={handleClearAll} disabled={activeFilterChips.length === 0}>
                                            清空
                                        </Button>
                                    </Space>
                                </Col>
                            </Row>

                            <Divider style={{ margin: '8px 0' }} />

                            <Space size="small" wrap>
                                <Text type="secondary">我的筛选</Text>
                                <Select
                                    size="small"
                                    placeholder="选择筛选"
                                    style={{ minWidth: 160 }}
                                    value={selectedSavedFilterId}
                                    onChange={handleApplySavedFilter}
                                    options={savedFilters.map(item => ({ label: item.name, value: item.id }))}
                                    allowClear
                                    onClear={() => setSelectedSavedFilterId(undefined)}
                                />
                                {isFilterDirty && selectedSavedFilterId && <Tag color="orange">已修改</Tag>}
                                <Button size="small" icon={<SaveOutlined />} onClick={() => handleOpenSaveModal('create')}>
                                    保存为
                                </Button>
                                <Button
                                    size="small"
                                    disabled={!selectedSavedFilterId || !isFilterDirty}
                                    onClick={handleOverwriteSavedFilter}
                                >
                                    更新
                                </Button>
                                <Button
                                    size="small"
                                    icon={<EditOutlined />}
                                    disabled={!selectedSavedFilterId}
                                    onClick={() => handleOpenSaveModal('rename')}
                                >
                                    重命名
                                </Button>
                                <Button
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    disabled={!selectedSavedFilterId}
                                    onClick={handleDeleteSavedFilter}
                                >
                                    删除
                                </Button>
                            </Space>

                            {activeFilterChips.length > 0 && (
                                <Space wrap size={[6, 6]} style={{ marginTop: 8 }}>
                                    {activeFilterChips.map(chip => (
                                        <Tag
                                            key={chip.key}
                                            closable
                                            onClose={(event) => {
                                                event.preventDefault();
                                                chip.onClear();
                                            }}
                                        >
                                            {chip.label}
                                        </Tag>
                                    ))}
                                </Space>
                            )}
                        </ProCard>
                    </div>
                </ProCard>

                <Drawer
                    title="高级筛选"
                    placement="left"
                    width={360}
                    open={advancedOpen}
                    onClose={closeAdvancedDrawer}
                    afterOpenChange={advancedDrawerProps.afterOpenChange}
                >
                    <div ref={advancedDrawerContainerRef}>
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                            <Text strong>视图与汇总</Text>
                            <Form.Item name="orgSummary" label="组织汇总" valuePropName="checked">
                                <Switch ref={advancedDrawerFocusRef} />
                            </Form.Item>
                            <Form.Item
                                name="includePreview"
                                label="包含预览任务"
                                valuePropName="checked"
                                tooltip={filters.status ? '已选择状态时不可包含预览任务' : ''}
                            >
                                <Switch disabled={!!filters.status} />
                            </Form.Item>

                            <Divider style={{ margin: '4px 0' }} />
                            <Text strong>快捷筛选</Text>
                            <Space wrap>
                                <Button onClick={() => handleApplyPresetFilter('OVERDUE')}>仅看逾期</Button>
                                <Button onClick={() => handleApplyPresetFilter('PENDING')}>仅看待办</Button>
                                <Button onClick={() => handleApplyPresetFilter('PREVIEW')}>仅看预览</Button>
                                <Button onClick={() => handleApplyPresetFilter('URGENT')}>仅看紧急</Button>
                            </Space>
                            <Text type="secondary">
                                高级筛选会与主筛选条叠加生效，组织汇总开启时将清空部门与负责人。
                            </Text>
                        </Space>
                    </div>
                </Drawer>
            </Form>

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
                    dataSource={filteredTypeStats}
                    rowKey="type"
                    pagination={false}
                    loading={summaryLoading}
                    style={{ marginTop: 8 }}
                    locale={{ emptyText: '当前筛选无任务统计' }}
                />
            </ProCard>

            <ProCard ghost>
                <Spin spinning={summaryLoading}>
                    {viewMode === 'calendar' ? (
                        <Calendar
                            value={viewDate}
                            onChange={setViewDate}
                            onSelect={(date, { source }) => {
                                if (source === 'date') {
                                    setSelectedDate(date);
                                    openTaskDrawer();
                                }
                                setViewDate(date);
                            }}
                            fullCellRender={fullCellRender}
                            headerRender={({ value, onChange }) => {
                                return (
                                    <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Space wrap>
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
                                            <Radio.Group
                                                value={viewMode}
                                                onChange={(e) => setViewMode(e.target.value)}
                                                optionType="button"
                                                buttonStyle="solid"
                                            >
                                                <Radio.Button value="calendar">日历</Radio.Button>
                                                <Radio.Button value="agenda">议程</Radio.Button>
                                            </Radio.Group>
                                        </Space>
                                        <Space size="small" wrap>
                                            <Text type="secondary">密度</Text>
                                            {[
                                                { label: '1-3', color: token.colorFillAlter },
                                                { label: '4-7', color: token.colorPrimaryBg },
                                                { label: '8-14', color: token.colorWarningBg },
                                                { label: '15+', color: token.colorErrorBg },
                                            ].map(item => (
                                                <Tag
                                                    key={item.label}
                                                    style={{ background: item.color, borderColor: item.color, color: token.colorText }}
                                                >
                                                    {item.label}
                                                </Tag>
                                            ))}
                                            {filters.includePreview && <Tag color="cyan">预览</Tag>}
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
                    ) : (
                        <>
                            <Space style={{ padding: '12px 16px' }} wrap>
                                <Button onClick={() => setViewDate(viewDate.subtract(1, 'month'))}>上个月</Button>
                                <Button onClick={() => setViewDate(viewDate.add(1, 'month'))}>下个月</Button>
                                <Button onClick={() => setViewDate(dayjs())}>今天</Button>
                                <Select
                                    value={viewDate.year()}
                                    onChange={(year) => setViewDate(viewDate.year(year))}
                                    options={yearOptions.map(year => ({ label: `${year}年`, value: year }))}
                                    style={{ width: 110 }}
                                />
                                <Select
                                    value={viewDate.month() + 1}
                                    onChange={(month) => setViewDate(viewDate.month(month - 1))}
                                    options={Array.from({ length: 12 }, (_, idx) => ({
                                        label: `${idx + 1}月`,
                                        value: idx + 1,
                                    }))}
                                    style={{ width: 90 }}
                                />
                                <Radio.Group
                                    value={viewMode}
                                    onChange={(e) => setViewMode(e.target.value)}
                                    optionType="button"
                                    buttonStyle="solid"
                                >
                                    <Radio.Button value="calendar">日历</Radio.Button>
                                    <Radio.Button value="agenda">议程</Radio.Button>
                                </Radio.Group>
                            </Space>
                            <List
                                dataSource={summaryList}
                                locale={{ emptyText: '当前月份无任务' }}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                key="open"
                                                type="link"
                                                onClick={() => {
                                                    setSelectedDate(dayjs(item.date));
                                                    openTaskDrawer();
                                                }}
                                            >
                                                查看任务
                                            </Button>
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <Space>
                                                    <Text>{dayjs(item.date).format('MM月DD日')}</Text>
                                                    <Tag>总数 {item.total}</Tag>
                                                    <Tag color="green">完成 {item.completed}</Tag>
                                                    <Tag color="red">逾期 {item.overdue}</Tag>
                                                    <Tag color="orange">紧急 {item.urgent}</Tag>
                                                    {item.preview ? <Tag color="cyan">预览 {item.preview}</Tag> : null}
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        </>
                    )}
                </Spin>
            </ProCard>

            <Drawer
                title={selectedDate ? `${selectedDate.format('MM月DD日')} 任务工作台` : '任务工作台'}
                placement="right"
                width={isWideDrawer ? 860 : '100%'}
                onClose={closeTaskDrawer}
                open={drawerOpen}
                afterOpenChange={taskDrawerProps.afterOpenChange}
            >
                <div ref={taskDrawerContainerRef}>
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space wrap>
                            <Button
                                ref={taskDrawerFocusRef}
                                icon={<LeftOutlined />}
                                disabled={!selectedDate}
                                onClick={() => selectedDate && handleFocusDate(selectedDate.subtract(1, 'day'), false)}
                            >
                                前一天
                            </Button>
                            <Button
                                icon={<RightOutlined />}
                                disabled={!selectedDate}
                                onClick={() => selectedDate && handleFocusDate(selectedDate.add(1, 'day'), false)}
                            >
                                后一天
                            </Button>
                            <Button onClick={() => handleFocusDate(dayjs(), false)}>今天</Button>
                        </Space>
                        {selectedDate && <Text type="secondary">{selectedDate.format('YYYY-MM-DD')}</Text>}
                    </Space>

                    {daySummary && (
                        <Space wrap size={[6, 6]}>
                            <Tag>总数 {daySummary.total || 0}</Tag>
                            <Tag color="green">完成 {daySummary.completed || 0}</Tag>
                            <Tag color="red">逾期 {daySummary.overdue || 0}</Tag>
                            <Tag color="orange">紧急 {daySummary.urgent || 0}</Tag>
                            {daySummary.preview ? <Tag color="cyan">预览 {daySummary.preview}</Tag> : null}
                        </Space>
                    )}

                    <Segmented
                        value={drawerFilter}
                        onChange={(value) => setDrawerFilter(value as typeof drawerFilter)}
                        options={[
                            {
                                label: (
                                    <Space size={4}>
                                        <span>全部</span>
                                        <Tag>{drawerCounts.all}</Tag>
                                    </Space>
                                ),
                                value: 'ALL',
                            },
                            {
                                label: (
                                    <Space size={4}>
                                        <span>待办</span>
                                        <Tag>{drawerCounts.pending}</Tag>
                                    </Space>
                                ),
                                value: 'PENDING',
                            },
                            {
                                label: (
                                    <Space size={4}>
                                        <span>已完成</span>
                                        <Tag>{drawerCounts.completed}</Tag>
                                    </Space>
                                ),
                                value: 'COMPLETED',
                            },
                            {
                                label: (
                                    <Space size={4}>
                                        <span>逾期</span>
                                        <Tag>{drawerCounts.overdue}</Tag>
                                    </Space>
                                ),
                                value: 'OVERDUE',
                            },
                            {
                                label: (
                                    <Space size={4}>
                                        <span>预览</span>
                                        <Tag color="cyan">{drawerCounts.preview}</Tag>
                                    </Space>
                                ),
                                value: 'PREVIEW',
                            },
                        ]}
                    />

                    <Space wrap align="center" size="small">
                        <Text type="secondary">排序</Text>
                        <Select
                            size="small"
                            value={drawerSort}
                            style={{ minWidth: 120 }}
                            onChange={(value) => setDrawerSort(value as typeof drawerSort)}
                            options={[
                                { label: '截止时间', value: 'DUE' },
                                { label: '优先级', value: 'PRIORITY' },
                                { label: '负责人', value: 'ASSIGNEE' },
                            ]}
                        />
                        <Text type="secondary">分组</Text>
                        <Select
                            size="small"
                            value={drawerGroup}
                            style={{ minWidth: 120 }}
                            onChange={(value) => setDrawerGroup(value as typeof drawerGroup)}
                            options={[
                                { label: '不分组', value: 'NONE' },
                                { label: '按负责人', value: 'ASSIGNEE' },
                                { label: '按类型', value: 'TYPE' },
                            ]}
                        />
                        <Divider type="vertical" />
                        <Text type="secondary">已选 {selectedTaskIds.length} 项</Text>
                    </Space>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: isWideDrawer ? 'minmax(320px, 1.3fr) minmax(280px, 1fr)' : '1fr',
                            gap: 12,
                        }}
                    >
                        <div>
                            <Space style={{ marginBottom: 12 }} wrap>
                                <Checkbox
                                    indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < selectableTaskIds.length}
                                    checked={selectableTaskIds.length > 0 && selectedTaskIds.length === selectableTaskIds.length}
                                    disabled={selectableTaskIds.length === 0}
                                    onChange={(event) => {
                                        if (event.target.checked) {
                                            setSelectedTaskIds(selectableTaskIds);
                                        } else {
                                            setSelectedTaskIds([]);
                                        }
                                    }}
                                >
                                    全选
                                </Checkbox>
                                <Button
                                    type="primary"
                                    disabled={selectedTaskIds.length === 0}
                                    loading={completeMutation.isLoading}
                                    onClick={handleBatchComplete}
                                >
                                    批量完成
                                </Button>
                            </Space>

                            {drawerGroup === 'NONE' ? (
                                dayTasksLoading ? (
                                    <Spin />
                                ) : sortedDrawerTasks.length === 0 ? (
                                    <Empty description="今日无任务" />
                                ) : (
                                    <List locale={{ emptyText: '今日无任务' }}>
                                        <VirtualList
                                            data={sortedDrawerTasks}
                                            height={520}
                                            itemHeight={76}
                                            itemKey="id"
                                        >
                                            {(item) => renderTaskItem(item)}
                                        </VirtualList>
                                    </List>
                                )
                            ) : (
                                <>
                                    {dayTasksLoading ? (
                                        <Spin />
                                    ) : groupedDrawerTasks.length === 0 ? (
                                        <Empty description="今日无任务" />
                                    ) : (
                                        groupedDrawerTasks.map(group => (
                                            <div key={group.key} style={{ marginBottom: 12 }}>
                                                <Divider orientation="left">
                                                    {group.label} <Tag>{group.tasks.length}</Tag>
                                                </Divider>
                                                <List
                                                    dataSource={group.tasks}
                                                    locale={{ emptyText: '无匹配任务' }}
                                                    renderItem={(item) => renderTaskItem(item)}
                                                />
                                            </div>
                                        ))
                                    )}
                                </>
                            )}

                            {totalDayTasks > loadedRealTasks && (
                                <Button
                                    block
                                    style={{ marginTop: 12 }}
                                    onClick={() => setDayPageSize((prev) => prev + DEFAULT_DAY_PAGE_SIZE)}
                                >
                                    加载更多 ({loadedRealTasks}/{totalDayTasks})
                                </Button>
                            )}
                        </div>

                        {isWideDrawer && (
                            <div
                                style={{
                                    border: `1px solid ${token.colorSplit}`,
                                    borderRadius: 8,
                                    padding: 12,
                                    minHeight: 520,
                                    background: token.colorBgContainer,
                                }}
                            >
                                {selectedTask ? (
                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                        <Text strong>{selectedTask.title}</Text>
                                        <Space wrap>
                                            <Tag>{INTEL_TASK_TYPE_LABELS[selectedTask.type as IntelTaskType]}</Tag>
                                            {selectedTask.priority && (
                                                <Tag color={PRIORITY_COLOR_MAP.get(selectedTask.priority as IntelTaskPriority)}>
                                                    {INTEL_TASK_PRIORITY_LABELS[selectedTask.priority as IntelTaskPriority]}
                                                </Tag>
                                            )}
                                            {INTEL_TASK_STATUS_LABELS[(selectedTask.status as IntelTaskStatus)] && (
                                                <Tag>{INTEL_TASK_STATUS_LABELS[selectedTask.status as IntelTaskStatus]}</Tag>
                                            )}
                                            {(selectedTask as any).isPreview && <Tag color="cyan">预览</Tag>}
                                        </Space>
                                        <Descriptions column={1} size="small" bordered={false}>
                                            <Descriptions.Item label="负责人">
                                                {selectedTask.assignee?.name || '未分配'}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="截止时间">
                                                {dayjs(selectedTask.dueAt || selectedTask.deadline).format('YYYY-MM-DD HH:mm')}
                                            </Descriptions.Item>
                                            <Descriptions.Item label="任务ID">
                                                {selectedTask.id}
                                            </Descriptions.Item>
                                        </Descriptions>
                                        {selectedTaskDetails?.description && (
                                            <div>
                                                <Text type="secondary">任务描述</Text>
                                                <div>{selectedTaskDetails.description}</div>
                                            </div>
                                        )}
                                        {selectedTaskDetails?.requirements && (
                                            <div>
                                                <Text type="secondary">任务要求</Text>
                                                <div>{selectedTaskDetails.requirements}</div>
                                            </div>
                                        )}
                                        {selectedTaskDetails?.attachmentUrls?.length > 0 && (
                                            <div>
                                                <Text type="secondary">附件</Text>
                                                <Space direction="vertical" size={4}>
                                                    {selectedTaskDetails.attachmentUrls.map((url: string) => (
                                                        <Link key={url} href={url} target="_blank" rel="noreferrer">
                                                            {url}
                                                        </Link>
                                                    ))}
                                                </Space>
                                            </div>
                                        )}
                                        <Space>
                                            <Button
                                                type="primary"
                                                disabled={(selectedTask as any).isPreview || selectedTask.status === IntelTaskStatus.COMPLETED}
                                                onClick={() => completeMutation.mutate({ id: selectedTask.id })}
                                            >
                                                标记完成
                                            </Button>
                                            <Button onClick={() => setSelectedTaskId(null)}>取消选中</Button>
                                        </Space>
                                    </Space>
                                ) : (
                                    <Empty description="请选择任务查看详情" />
                                )}
                            </div>
                        )}
                    </div>

                    {!isWideDrawer && (
                        <div
                            style={{
                                border: `1px solid ${token.colorSplit}`,
                                borderRadius: 8,
                                padding: 12,
                                background: token.colorBgContainer,
                            }}
                        >
                            {selectedTask ? (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                    <Text strong>{selectedTask.title}</Text>
                                    <Space wrap>
                                        <Tag>{INTEL_TASK_TYPE_LABELS[selectedTask.type as IntelTaskType]}</Tag>
                                        {selectedTask.priority && (
                                            <Tag color={PRIORITY_COLOR_MAP.get(selectedTask.priority as IntelTaskPriority)}>
                                                {INTEL_TASK_PRIORITY_LABELS[selectedTask.priority as IntelTaskPriority]}
                                            </Tag>
                                        )}
                                        {INTEL_TASK_STATUS_LABELS[(selectedTask.status as IntelTaskStatus)] && (
                                            <Tag>{INTEL_TASK_STATUS_LABELS[selectedTask.status as IntelTaskStatus]}</Tag>
                                        )}
                                        {(selectedTask as any).isPreview && <Tag color="cyan">预览</Tag>}
                                    </Space>
                                    <Descriptions column={1} size="small" bordered={false}>
                                        <Descriptions.Item label="负责人">
                                            {selectedTask.assignee?.name || '未分配'}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="截止时间">
                                            {dayjs(selectedTask.dueAt || selectedTask.deadline).format('YYYY-MM-DD HH:mm')}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="任务ID">
                                            {selectedTask.id}
                                        </Descriptions.Item>
                                    </Descriptions>
                                    {selectedTaskDetails?.description && (
                                        <div>
                                            <Text type="secondary">任务描述</Text>
                                            <div>{selectedTaskDetails.description}</div>
                                        </div>
                                    )}
                                    {selectedTaskDetails?.requirements && (
                                        <div>
                                            <Text type="secondary">任务要求</Text>
                                            <div>{selectedTaskDetails.requirements}</div>
                                        </div>
                                    )}
                                    {selectedTaskDetails?.attachmentUrls?.length > 0 && (
                                        <div>
                                            <Text type="secondary">附件</Text>
                                            <Space direction="vertical" size={4}>
                                                {selectedTaskDetails.attachmentUrls.map((url: string) => (
                                                    <Link key={url} href={url} target="_blank" rel="noreferrer">
                                                        {url}
                                                    </Link>
                                                ))}
                                            </Space>
                                        </div>
                                    )}
                                    <Space>
                                        <Button
                                            type="primary"
                                            disabled={(selectedTask as any).isPreview || selectedTask.status === IntelTaskStatus.COMPLETED}
                                            onClick={() => completeMutation.mutate({ id: selectedTask.id })}
                                        >
                                            标记完成
                                        </Button>
                                        <Button onClick={() => setSelectedTaskId(null)}>取消选中</Button>
                                    </Space>
                                </Space>
                            ) : (
                                <Empty description="请选择任务查看详情" />
                            )}
                        </div>
                    )}
                    </Space>
                </div>
            </Drawer>
        </Space>
    );
};
