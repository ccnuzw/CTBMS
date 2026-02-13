import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  WorkflowExperimentDto,
  WorkflowExperimentPageDto,
  CreateWorkflowExperimentDto,
  UpdateWorkflowExperimentDto,
  ExperimentRunPageDto,
  ExperimentEvaluationDto,
  ConcludeExperimentDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface ExperimentQuery {
  workflowDefinitionId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ExperimentRunQuery {
  variant?: string;
  success?: boolean;
  page?: number;
  pageSize?: number;
}

// ── 实验列表 ──

export const useExperiments = (query?: ExperimentQuery) => {
  return useQuery<WorkflowExperimentPageDto>({
    queryKey: ['workflow-experiments', query],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowExperimentPageDto>('/workflow-experiments', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useExperimentDetail = (id?: string) => {
  return useQuery<WorkflowExperimentDto>({
    queryKey: ['workflow-experiment-detail', id],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowExperimentDto>(`/workflow-experiments/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

// ── 实验评估 ──

export const useExperimentEvaluation = (id?: string) => {
  return useQuery<ExperimentEvaluationDto>({
    queryKey: ['workflow-experiment-evaluation', id],
    queryFn: async () => {
      const res = await apiClient.get<ExperimentEvaluationDto>(
        `/workflow-experiments/${id}/evaluation`,
      );
      return res.data;
    },
    enabled: Boolean(id),
  });
};

// ── 实验运行明细 ──

export const useExperimentRuns = (experimentId?: string, query?: ExperimentRunQuery) => {
  return useQuery<ExperimentRunPageDto>({
    queryKey: ['workflow-experiment-runs', experimentId, query],
    queryFn: async () => {
      const res = await apiClient.get<ExperimentRunPageDto>(
        `/workflow-experiments/${experimentId}/runs`,
        { params: query },
      );
      return res.data;
    },
    enabled: Boolean(experimentId),
  });
};

// ── 变更操作 ──

export const useCreateExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateWorkflowExperimentDto) => {
      const res = await apiClient.post<WorkflowExperimentDto>('/workflow-experiments', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
    },
  });
};

export const useUpdateExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateWorkflowExperimentDto }) => {
      const res = await apiClient.put<WorkflowExperimentDto>(`/workflow-experiments/${id}`, dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
    },
  });
};

export const useDeleteExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/workflow-experiments/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
    },
  });
};

export const useStartExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<WorkflowExperimentDto>(`/workflow-experiments/${id}/start`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-evaluation', id] });
    },
  });
};

export const usePauseExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<WorkflowExperimentDto>(`/workflow-experiments/${id}/pause`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-detail', id] });
    },
  });
};

export const useAbortExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<WorkflowExperimentDto>(`/workflow-experiments/${id}/abort`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-detail', id] });
    },
  });
};

export const useConcludeExperiment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: ConcludeExperimentDto }) => {
      const res = await apiClient.post<WorkflowExperimentDto>(
        `/workflow-experiments/${id}/conclude`,
        dto,
      );
      return res.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-experiment-evaluation', id] });
    },
  });
};
