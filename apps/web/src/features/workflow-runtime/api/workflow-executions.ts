import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NodeExecutionDto,
  WorkflowFailureCategory,
  WorkflowRiskDegradeAction,
  WorkflowRiskLevel,
  WorkflowExecutionDto,
  WorkflowExecutionStatus,
  WorkflowTriggerType,
  WorkflowRuntimeEventDto,
  WorkflowRuntimeEventLevel,
  DebateRoundTraceDto,
  DebateTimelineDto,
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
  runtimeEvents?: WorkflowRuntimeEventDto[];
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
  failureCategory?: WorkflowFailureCategory;
  failureCode?: string;
  riskLevel?: WorkflowRiskLevel;
  degradeAction?: WorkflowRiskDegradeAction;
  riskProfileCode?: string;
  riskReasonKeyword?: string;
  hasSoftFailure?: boolean;
  hasErrorRoute?: boolean;
  hasRiskBlocked?: boolean;
  hasRiskGateNode?: boolean;
  hasRiskSummary?: boolean;
  keyword?: string;
  startedAtFrom?: string;
  startedAtTo?: string;
  page?: number;
  pageSize?: number;
}

export interface WorkflowRuntimeTimelineQuery {
  eventType?: string;
  level?: WorkflowRuntimeEventLevel;
  page?: number;
  pageSize?: number;
}

export interface WorkflowRuntimeTimelineResponse {
  data: WorkflowRuntimeEventDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ReplayLineageEntry {
  expression: string;
  resolvedValue: unknown;
  sourceNodeId: string | null;
  sourceFieldPath: string;
  resolvedAt: string;
}

export interface WorkflowExecutionReplayBundle {
  version: string;
  dataLineage: Record<string, ReplayLineageEntry[]>;
}

export interface WorkflowDebateTraceQuery {
  roundNumber?: number;
  participantCode?: string;
  participantRole?: string;
  isJudgement?: boolean;
  keyword?: string;
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

export const useWorkflowExecutionTimeline = (
  executionId?: string,
  query?: WorkflowRuntimeTimelineQuery,
) => {
  return useQuery<WorkflowRuntimeTimelineResponse>({
    queryKey: ['workflow-execution-timeline', executionId, query],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowRuntimeTimelineResponse>(
        `/workflow-executions/${executionId}/timeline`,
        {
          params: query,
        },
      );
      return res.data;
    },
    enabled: Boolean(executionId),
  });
};

export const useWorkflowExecutionDebateTraces = (
  executionId?: string,
  query?: WorkflowDebateTraceQuery,
) => {
  return useQuery<DebateRoundTraceDto[]>({
    queryKey: ['workflow-execution-debate-traces', executionId, query],
    queryFn: async () => {
      const res = await apiClient.get<DebateRoundTraceDto[]>(
        `/workflow-executions/${executionId}/debate-traces`,
        { params: query },
      );
      return res.data;
    },
    enabled: Boolean(executionId),
  });
};

export const useWorkflowExecutionDebateTimeline = (executionId?: string) => {
  return useQuery<DebateTimelineDto>({
    queryKey: ['workflow-execution-debate-timeline', executionId],
    queryFn: async () => {
      const res = await apiClient.get<DebateTimelineDto>(
        `/workflow-executions/${executionId}/debate-timeline`,
      );
      return res.data;
    },
    enabled: Boolean(executionId),
  });
};

export const useWorkflowExecutionReplay = (executionId?: string) => {
  return useQuery<WorkflowExecutionReplayBundle>({
    queryKey: ['workflow-execution-replay', executionId],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowExecutionReplayBundle>(
        `/workflow-executions/${executionId}/replay`,
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

export const useCancelWorkflowExecution = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ executionId, reason }: { executionId: string; reason?: string }) => {
      const res = await apiClient.post<WorkflowExecutionDetail>(
        `/workflow-executions/${executionId}/cancel`,
        { reason },
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-execution-detail', data.id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-execution-timeline', data.id] });
    },
  });
};
