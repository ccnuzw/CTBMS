import { useState, useMemo, useEffect } from 'react';
import { Form, Grid } from 'antd';
import dayjs from 'dayjs';
import { IntelTaskStatus, IntelTaskType, IntelTaskPriority, CalendarSummaryItem } from '@packages/types';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import { useTasks, useCompleteTask, useCalendarPreview, useCalendarSummary } from '../../../../api/tasks';
import { useUsers } from '../../../../../users/api/users';
import { useOrganizations } from '../../../../../organization/api/organizations';
import { useDepartments } from '../../../../../organization/api/departments';

import { INITIAL_FILTERS, DEFAULT_DAY_PAGE_SIZE, PENDING_STATUSES, PRIORITY_RANK } from './constants';
import { DefaultFilterState, SavedFilter, DaySummaryCounts } from './types';

export const useTaskCalendarViewModel = () => {
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

    const screens = Grid.useBreakpoint();
    const isWideDrawer = !!(screens.lg || screens.md);

    const [filters, setFilters] = useState<DefaultFilterState>(INITIAL_FILTERS);
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

    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [selectedSavedFilterId, setSelectedSavedFilterId] = useState<string | undefined>();
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [saveMode, setSaveMode] = useState<'create' | 'rename'>('create');
    const [saveName, setSaveName] = useState('');

    const blurActiveElement = () => {
        if (typeof document === 'undefined') return;
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
    };

    const openAdvancedDrawer = () => { blurActiveElement(); setAdvancedOpen(true); };
    const closeAdvancedDrawer = () => { blurActiveElement(); setAdvancedOpen(false); };
    const openTaskDrawer = () => { blurActiveElement(); setDrawerOpen(true); };
    const closeTaskDrawer = () => { blurActiveElement(); setDrawerOpen(false); };

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

    const summaryQuery = useMemo(() => ({
        ...normalizedFilters,
        startDate: rangeStart,
        endDate: rangeEnd,
        includePreview: filters.includePreview,
    }), [normalizedFilters, rangeStart, rangeEnd, filters.includePreview]);

    const { data: summaryData, isLoading: summaryLoading } = useCalendarSummary(summaryQuery);
    const summaryList = summaryData?.summary || [];
    const typeStats = summaryData?.typeStats || [];
    const summaryMap = useMemo(() => new Map(summaryList.map(item => [item.date, item])), [summaryList]);

    const dayQuery = useMemo(() => {
        if (!selectedDate) {
            return { ...normalizedFilters, page: 1, pageSize: 1 };
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
    const previewQuery = useMemo(() => ({
        startDate: selectedDate ? selectedDate.startOf('day').toDate() : rangeStart,
        endDate: selectedDate ? selectedDate.endOf('day').toDate() : rangeStart,
        assigneeId: normalizedFilters.assigneeId,
        assigneeOrgId: normalizedFilters.assigneeOrgId,
        assigneeDeptId: normalizedFilters.assigneeDeptId,
    }), [selectedDate, normalizedFilters, rangeStart]);

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
                    status: 'PREVIEW' as any,
                    isLate: false,
                    description: null,
                    requirements: null,
                    attachmentUrls: [],
                    isPreview: true, // internal marker
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
                const parsed = JSON.parse(raw);
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
            setSavedFilters(prev => prev.map(item => item.id === selectedSavedFilterId ? { ...item, name } : item));
        } else {
            const entry = { id: `${Date.now()}`, name, values: filters };
            setSavedFilters(prev => [...prev, entry]);
            setSelectedSavedFilterId(entry.id);
        }
        setSaveName('');
        blurActiveElement();
        setSaveModalOpen(false);
    };

    const setFilterValues = (nextValues: DefaultFilterState) => {
        const normalized = { ...nextValues };
        if (!normalized.assigneeOrgId) {
            normalized.assigneeDeptId = undefined;
            normalized.assigneeId = undefined;
        }
        if (normalized.status) normalized.includePreview = false;
        if (normalized.orgSummary) {
            normalized.assigneeDeptId = undefined;
            normalized.assigneeId = undefined;
        }
        setFilters(normalized);
        form.setFieldsValue(normalized);
    };

    const handleApplySavedFilter = (id?: string) => {
        setSelectedSavedFilterId(id);
        const target = savedFilters.find(item => item.id === id);
        if (target) setFilterValues(target.values);
    };

    const handleDeleteSavedFilter = () => {
        if (!selectedSavedFilterId) return;
        setSavedFilters(prev => prev.filter(item => item.id !== selectedSavedFilterId));
        setSelectedSavedFilterId(undefined);
    };

    const selectedSavedFilter = useMemo(() => savedFilters.find(item => item.id === selectedSavedFilterId), [savedFilters, selectedSavedFilterId]);

    const isFilterDirty = useMemo(() => {
        if (!selectedSavedFilter) return false;
        const keys = Object.keys(INITIAL_FILTERS) as Array<keyof typeof INITIAL_FILTERS>;
        return !keys.every(key => filters[key] === selectedSavedFilter.values[key]);
    }, [filters, selectedSavedFilter]);

    const handleOpenSaveModal = (mode: 'create' | 'rename') => {
        setSaveMode(mode);
        setSaveName(mode === 'rename' ? selectedSavedFilter?.name || '' : '');
        blurActiveElement();
        setSaveModalOpen(true);
    };

    const handleOverwriteSavedFilter = () => {
        if (!selectedSavedFilterId) return;
        setSavedFilters(prev => prev.map(item => item.id === selectedSavedFilterId ? { ...item, values: filters } : item));
    };

    const handleFiltersChange = (changedValues: Record<string, any>, values: DefaultFilterState) => {
        const nextValues = { ...values };
        if ('assigneeOrgId' in changedValues && changedValues.assigneeOrgId !== filters.assigneeOrgId) {
            nextValues.assigneeDeptId = undefined;
            nextValues.assigneeId = undefined;
            form.setFieldsValue({ assigneeDeptId: undefined, assigneeId: undefined });
        }
        if ('assigneeDeptId' in changedValues && changedValues.assigneeDeptId !== filters.assigneeDeptId) {
            nextValues.assigneeId = undefined;
            form.setFieldsValue({ assigneeId: undefined });
        }
        if (changedValues?.status) {
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

    const handleClearAll = () => {
        setFilterValues(INITIAL_FILTERS);
        setSelectedSavedFilterId(undefined);
    };

    const handleFocusDate = (date: dayjs.Dayjs, shouldOpenDrawer = true) => {
        setViewDate(date);
        setSelectedDate(date);
        if (shouldOpenDrawer) openTaskDrawer();
    };

    const handleFocusWeek = () => {
        setViewMode('agenda');
        setViewDate(dayjs().startOf('week'));
    };

    const handleApplyPresetFilter = (preset: 'OVERDUE' | 'PENDING' | 'PREVIEW' | 'URGENT') => {
        const nextFilters = { ...filters };
        if (preset === 'OVERDUE') nextFilters.status = filters.status === IntelTaskStatus.OVERDUE ? undefined : IntelTaskStatus.OVERDUE;
        if (preset === 'PENDING') nextFilters.status = filters.status === IntelTaskStatus.PENDING ? undefined : IntelTaskStatus.PENDING;
        if (preset === 'PREVIEW') {
            nextFilters.status = undefined;
            nextFilters.includePreview = !filters.includePreview;
        }
        if (preset === 'URGENT') nextFilters.priority = filters.priority === IntelTaskPriority.URGENT ? undefined : IntelTaskPriority.URGENT;
        setFilterValues(nextFilters);
    };

    const getSummaryCounts = (summary: CalendarSummaryItem): DaySummaryCounts => {
        const total = summary.total || 0;
        const completed = summary.completed || 0;
        const overdue = summary.overdue || 0;
        const pending = Math.max(total - completed - overdue, 0);
        const urgent = summary.urgent || 0;
        const preview = summary.preview || 0;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, overdue, pending, urgent, preview, completionRate };
    };

    const daySummary = useMemo(() => selectedDate ? summaryMap.get(selectedDate.format('YYYY-MM-DD')) : undefined, [selectedDate, summaryMap]);
    const daySummaryCounts = daySummary ? getSummaryCounts(daySummary) : undefined;

    const filteredDrawerTasks = useMemo(() => {
        return selectedDateTasks.filter((task: Record<string, any>) => {
            const isPreview = task.isPreview;
            if (drawerFilter === 'PREVIEW') return isPreview;
            if (drawerFilter === 'COMPLETED') return !isPreview && task.status === IntelTaskStatus.COMPLETED;
            if (drawerFilter === 'OVERDUE') return !isPreview && task.status === IntelTaskStatus.OVERDUE;
            if (drawerFilter === 'PENDING') return !isPreview && PENDING_STATUSES.has(task.status as IntelTaskStatus);
            return true;
        });
    }, [selectedDateTasks, drawerFilter]);

    const selectableTaskIds = useMemo(() => {
        return filteredDrawerTasks
            .filter((item: Record<string, any>) => !item.isPreview && item.status !== IntelTaskStatus.COMPLETED)
            .map(item => item.id);
    }, [filteredDrawerTasks]);

    const sortedDrawerTasks = useMemo(() => {
        const items = [...filteredDrawerTasks];
        const getDueTime = (task: Record<string, any>) => dayjs(task.dueAt || task.deadline).valueOf();
        items.sort((a, b) => {
            if (drawerSort === 'PRIORITY') {
                const rankDiff = (PRIORITY_RANK[a.priority as IntelTaskPriority] ?? 99) - (PRIORITY_RANK[b.priority as IntelTaskPriority] ?? 99);
                if (rankDiff !== 0) return rankDiff;
                return getDueTime(a) - getDueTime(b);
            }
            if (drawerSort === 'ASSIGNEE') {
                const nameDiff = (a.assignee?.name || '').localeCompare(b.assignee?.name || '');
                if (nameDiff !== 0) return nameDiff;
                return getDueTime(a) - getDueTime(b);
            }
            return getDueTime(a) - getDueTime(b);
        });
        return items;
    }, [filteredDrawerTasks, drawerSort]);

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
            if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
            return next;
        });
    }, [filteredDrawerTasks]);

    return {
        state: {
            filters, viewDate, selectedDate, drawerOpen, calendarMode,
            advancedOpen, viewMode, dayPageSize, selectedTaskIds, selectedTaskId,
            drawerFilter, drawerSort, drawerGroup, savedFilters, selectedSavedFilterId,
            saveModalOpen, saveMode, saveName, isWideDrawer
        },
        refs: {
            form, saveModalContainerRef, saveNameInputRef, saveModalProps,
            advancedDrawerContainerRef, advancedDrawerFocusRef, advancedDrawerProps,
            taskDrawerContainerRef, taskDrawerFocusRef, taskDrawerProps
        },
        actions: {
            setViewDate, setSelectedDate, setDrawerOpen, setCalendarMode,
            setAdvancedOpen, setViewMode, setDayPageSize, setSelectedTaskIds,
            setSelectedTaskId, setDrawerFilter, setDrawerSort, setDrawerGroup,
            setSaveModalOpen, setSaveMode, setSaveName,
            handleFiltersChange, handleClearAll, handleApplyPresetFilter,
            handleFocusDate, handleFocusWeek, handleBatchComplete,
            handleSaveFilters, handleApplySavedFilter, handleDeleteSavedFilter,
            handleOpenSaveModal, handleOverwriteSavedFilter, setFilterValues,
            openAdvancedDrawer, closeAdvancedDrawer, openTaskDrawer, closeTaskDrawer
        },
        queries: {
            users, organizations, departments, completeMutation,
            summaryList, typeStats, summaryMap, summaryLoading,
            dayTasksData, dayTasksLoading, selectedDateTasks,
            daySummaryCounts, getSummaryCounts
        },
        computed: {
            isFilterDirty, selectableTaskIds, sortedDrawerTasks,
            totalDayTasks: dayTasksData?.total || 0,
            loadedRealTasks: dayTasksData?.data?.length || 0,
            drawerCounts: (() => {
                const counts = { all: selectedDateTasks.length, pending: 0, completed: 0, overdue: 0, preview: 0 };
                selectedDateTasks.forEach((task: Record<string, any>) => {
                    if (task.isPreview) counts.preview++;
                    else if (task.status === IntelTaskStatus.COMPLETED) counts.completed++;
                    else if (task.status === IntelTaskStatus.OVERDUE) counts.overdue++;
                    else if (PENDING_STATUSES.has(task.status as IntelTaskStatus)) counts.pending++;
                });
                return counts;
            })(),
            groupedDrawerTasks: (() => {
                if (drawerGroup === 'NONE') return [{ key: 'all', label: '全部任务', tasks: sortedDrawerTasks }];
                const groupMap = new Map();
                sortedDrawerTasks.forEach((task) => {
                    const key = drawerGroup === 'ASSIGNEE' ? (task.assignee?.name || '未分配') : task.type;
                    if (!groupMap.has(key)) groupMap.set(key, { key, label: key, tasks: [] });
                    groupMap.get(key)?.tasks.push(task);
                });
                return Array.from(groupMap.values());
            })(),
            selectedTask: selectedTaskId ? selectedDateTasks.find(task => task.id === selectedTaskId) : null,
        }
    };
};
