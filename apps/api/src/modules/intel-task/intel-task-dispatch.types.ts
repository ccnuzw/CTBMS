import { Prisma, CollectionPointType } from '@prisma/client';
import { IntelTaskRule, IntelTaskTemplate } from '@prisma/client';
import { IntelTaskPriority, IntelTaskType } from '@packages/types';

export type TemplateRecord = IntelTaskTemplate & { rules?: IntelTaskRule[] };
export type RuleRecord = IntelTaskRule & { template?: IntelTaskTemplate };

export interface TaskCreatePayload {
    createdById?: string;
    templateId?: string;
    ruleId?: string;
    collectionPointId?: string;
    commodity?: string;
    assigneeId: string;
    assigneeOrgId?: string;
    assigneeDeptId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    dueAt?: Date;
    periodKey?: string;
    taskGroupId?: string;
    formId?: string;
    workflowId?: string;
    title: string;
    description?: string;
    requirements?: string;
    attachmentUrls?: string[];
    notifyConfig?: Prisma.JsonValue;
    type: IntelTaskType;
    priority: IntelTaskPriority;
    deadline: Date;
    isLate?: boolean;
}

export interface TaskKeyInput {
    templateId?: string | null;
    periodKey?: string | null;
    assigneeId?: string | null;
    collectionPointId?: string | null;
    commodity?: string | null;
}

export interface RuleScopeQuery {
    userIds?: string[];
    departmentIds?: string[];
    organizationIds?: string[];
    roleIds?: string[];
    roleCodes?: string[];
    collectionPointIds?: string[];
    collectionPointId?: string;
    targetPointType?: string | string[];
}

export interface ShiftConfig {
    dates?: string[];
    weekdays?: number[];
    monthDays?: number[];
    intervalDays?: number | string;
    startDate?: string;
}

export interface AllocationLike {
    userId: string;
    commodity?: string | null;
}

export interface PointScheduleLike {
    dispatchAtMinute?: number | null;
    frequencyType?: string | null;
    weekdays?: number[] | null;
    monthDays?: number[] | null;
    shiftConfig?: Prisma.JsonValue | string | null;
}

export interface AllocationWithUser {
    userId: string;
    commodity?: string | null;
    user?: {
        id: string;
        name?: string | null;
        department?: { name?: string | null } | null;
        organization?: { name?: string | null } | null;
        avatar?: string | null;
    };
    id: string;
    name?: string | null;
    department?: { name?: string | null } | null;
    organization?: { name?: string | null } | null;
}

export interface PointWithAllocations extends PointScheduleLike {
    id: string;
    name: string;
    type: CollectionPointType | string;
    allocations: AllocationWithUser[];
    commodities?: string[] | null;
}

export interface PreviewAssignee {
    userId: string;
    userName?: string | null;
    departmentName?: string | null;
    organizationName?: string | null;
    collectionPoints: Array<{
        id: string;
        name: string;
        type: string;
        commodity?: string | null;
        count: number;
    }>;
    taskCount: number;
}

export interface PreviewResult {
    totalTasks: number;
    totalAssignees: number;
    assignees: PreviewAssignee[];
    unassignedPoints: Array<{ id: string; name: string; type: string }>;
}
