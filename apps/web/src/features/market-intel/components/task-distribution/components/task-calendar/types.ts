import { IntelTaskPriority, IntelTaskStatus, IntelTaskType } from '@packages/types';
import dayjs from 'dayjs';

export interface DefaultFilterState {
    type?: IntelTaskType;
    priority?: IntelTaskPriority;
    assigneeId?: string;
    status?: IntelTaskStatus;
    assigneeOrgId?: string;
    assigneeDeptId?: string;
    orgSummary: boolean;
    includePreview: boolean;
}

export interface SavedFilter {
    id: string;
    name: string;
    values: DefaultFilterState;
}

export interface DaySummaryCounts {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
    urgent: number;
    preview: number;
    completionRate: number;
}
