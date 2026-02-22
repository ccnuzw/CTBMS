import { IntelTaskPriority, IntelTaskStatus, IntelTaskType } from '@packages/types';
import { DefaultFilterState } from './types';

export const PRIORITY_META: Array<{ value: IntelTaskPriority; label: string; color: string }> = [
    { value: IntelTaskPriority.URGENT, label: '紧急', color: 'red' },
    { value: IntelTaskPriority.HIGH, label: '高', color: 'orange' },
    { value: IntelTaskPriority.MEDIUM, label: '中', color: 'blue' },
    { value: IntelTaskPriority.LOW, label: '低', color: 'green' },
];

export const PRIORITY_COLOR_MAP = new Map(
    PRIORITY_META.map(item => [item.value, item.color]),
);

export const PRIORITY_RANK: Record<IntelTaskPriority, number> = {
    [IntelTaskPriority.URGENT]: 0,
    [IntelTaskPriority.HIGH]: 1,
    [IntelTaskPriority.MEDIUM]: 2,
    [IntelTaskPriority.LOW]: 3,
};

export const DEFAULT_DAY_PAGE_SIZE = 50;
export const PENDING_STATUSES = new Set([IntelTaskStatus.PENDING, IntelTaskStatus.SUBMITTED, IntelTaskStatus.RETURNED]);

export const INITIAL_FILTERS: DefaultFilterState = {
    type: undefined,
    priority: undefined,
    assigneeId: undefined,
    status: undefined,
    assigneeOrgId: undefined,
    assigneeDeptId: undefined,
    orgSummary: false,
    includePreview: false,
};
