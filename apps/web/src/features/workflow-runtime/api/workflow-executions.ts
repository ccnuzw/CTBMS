import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    NodeExecutionDto,
    WorkflowExecutionDto,
    WorkflowExecutionStatus,
    WorkflowTriggerType,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface WorkflowExecutionWithRelations extends WorkflowExecutionDto {
    workflowVersion?: {
        id: string;
        versionCode: string;
        workflowDefinition?: {
            id: string;
            workflowId: string;
            name: string;
        };
    };
}

export interface WorkflowExecutionDetail extends WorkflowExecutionWithRelations {
    nodeExecutions: NodeExecutionDto[];
}

export interface WorkflowExecutionPageResponse {
    data: WorkflowExecutionWithRelations[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface WorkflowExecutionQuery {
    workflowDefinitionId?: string;
    workflowVersionId?: string;
    versionCode?: string;
    triggerType?: WorkflowTriggerType;
    status?: WorkflowExecutionStatus;
    hasSoftFailure?: boolean;
    hasErrorRoute?: boolean;
    keyword?: string;
    startedAtFrom?: string;
    startedAtTo?: string;
    page?: number;
    pageSize?: number;
}

export const useWorkflowExecutions = (query?: WorkflowExecutionQuery) => {
    return useQuery<WorkflowExecutionPageResponse>({
        queryKey: ['workflow-executions', query],
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExecutionPageResponse>('/workflow-executions', {
                params: query,
            });
            return res.data;
        },
    });
};

export const useWorkflowExecutionDetail = (executionId?: string) => {
    return useQuery<WorkflowExecutionDetail>({
        queryKey: ['workflow-execution-detail', executionId],
        queryFn: async () => {
            const res = await apiClient.get<WorkflowExecutionDetail>(
                `/workflow-executions/${executionId}`,
            );
            return res.data;
        },
        enabled: Boolean(executionId),
    });
};

export const useRerunWorkflowExecution = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (executionId: string) => {
            const res = await apiClient.post<WorkflowExecutionDetail>(
                `/workflow-executions/${executionId}/rerun`,
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
        },
    });
};
