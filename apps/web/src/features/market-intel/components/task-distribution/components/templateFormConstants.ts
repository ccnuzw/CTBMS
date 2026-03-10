import { TaskScheduleMode } from '@packages/types';

// 任务类型选项
export const TASK_TYPE_OPTIONS = [
    { value: 'COLLECTION', label: '采集任务', color: 'blue' },
    { value: 'REPORT', label: '报告任务', color: 'orange' },
    { value: 'VERIFICATION', label: '核实任务', color: 'red' },
];


// 周期类型选项
export const CYCLE_TYPE_OPTIONS = [
    { value: 'DAILY', label: '每日', description: '每天自动执行' },
    { value: 'WEEKLY', label: '每周', description: '每周执行一次' },
    { value: 'MONTHLY', label: '每月', description: '每月执行一次' },
    { value: 'ONE_TIME', label: '一次性', description: '仅执行一次' },
];

export const SCHEDULE_MODE_OPTIONS = [
    { value: TaskScheduleMode.POINT_DEFAULT, label: '继承采集点频率' },
    { value: TaskScheduleMode.TEMPLATE_OVERRIDE, label: '模板覆盖频率' },
];

// 优先级选项
export const PRIORITY_OPTIONS = [
    { value: 'LOW', label: '低', color: 'default' },
    { value: 'MEDIUM', label: '中', color: 'blue' },
    { value: 'HIGH', label: '高', color: 'orange' },
    { value: 'URGENT', label: '紧急', color: 'red' },
];

export const WEEKDAY_OPTIONS = [
    { value: 1, label: '周一' },
    { value: 2, label: '周二' },
    { value: 3, label: '周三' },
    { value: 4, label: '周四' },
    { value: 5, label: '周五' },
    { value: 6, label: '周六' },
    { value: 7, label: '周日' },
];

export const MONTH_DAY_OPTIONS = [
    ...Array.from({ length: 31 }, (_, index) => ({
        value: index + 1,
        label: `${index + 1}日`,
    })),
    { value: 0, label: '月末' },
];

// 采集点类型选项
export const POINT_TYPE_OPTIONS = [
    { value: 'PORT', label: '港口', icon: '⚓' },
    { value: 'ENTERPRISE', label: '企业', icon: '🏭' },
    { value: 'STATION', label: '站台', icon: '🚂' },
    { value: 'MARKET', label: '市场', icon: '🏪' },
    { value: 'REGION', label: '区域', icon: '📍' },
];

export const POINT_TYPE_LABELS = POINT_TYPE_OPTIONS.reduce<Record<string, string>>((acc, item) => {
    acc[item.value] = item.label;
    return acc;
}, {});

// 分配模式选项
export const ASSIGNEE_MODE_OPTIONS = [
    {
        value: 'BY_COLLECTION_POINT',
        label: '按采集点负责人',
        description: '按采集点类型或指定采集点分配负责人',
    },
    { value: 'MANUAL', label: '手动指定', description: '手动选择分配人员' },
    { value: 'BY_DEPARTMENT', label: '按部门', description: '分配给指定部门的所有成员' },
    { value: 'BY_ORGANIZATION', label: '按组织', description: '分配给指定组织的所有成员' },
];

// ─── Utility Functions ─────────────────────────────────────────────────────

export const getTaskTypeInfo = (type: string) =>
    TASK_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, color: 'default' };

export const getCycleTypeInfo = (type: string) =>
    CYCLE_TYPE_OPTIONS.find((t) => t.value === type) || { label: type };

export const getPriorityInfo = (priority: string) =>
    PRIORITY_OPTIONS.find((p) => p.value === priority) || { label: priority, color: 'default' };

export const getPointTypeInfo = (type: string) =>
    POINT_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, icon: '📍' };

/** 格式化时间（分钟 -> HH:MM） */
export const formatMinuteToTime = (minute: number) => {
    const hours = Math.floor(minute / 60);
    const mins = minute % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};
