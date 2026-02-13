import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DecisionRecordDto,
  DecisionRecordQueryDto,
  CreateDecisionRecordDto,
  UpdateDecisionRecordDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface DecisionRecordPageResponse {
  data: DecisionRecordDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DecisionRecordQuery {
  workflowExecutionId?: string;
  workflowDefinitionId?: string;
  action?: string;
  riskLevel?: string;
  isPublished?: boolean;
  keyword?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  page?: number;
  pageSize?: number;
}

export const useDecisionRecords = (query?: DecisionRecordQuery) => {
  return useQuery<DecisionRecordPageResponse>({
    queryKey: ['decision-records', query],
    queryFn: async () => {
      const res = await apiClient.get<DecisionRecordPageResponse>('/decision-records', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useDecisionRecordDetail = (id?: string) => {
  return useQuery<DecisionRecordDto>({
    queryKey: ['decision-record-detail', id],
    queryFn: async () => {
      const res = await apiClient.get<DecisionRecordDto>(`/decision-records/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useDecisionRecordsByExecution = (executionId?: string) => {
  return useQuery<DecisionRecordDto[]>({
    queryKey: ['decision-records-by-execution', executionId],
    queryFn: async () => {
      const res = await apiClient.get<DecisionRecordDto[]>(
        `/decision-records/execution/${executionId}`,
      );
      return res.data;
    },
    enabled: Boolean(executionId),
  });
};

export const useCreateDecisionRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateDecisionRecordDto) => {
      const res = await apiClient.post<DecisionRecordDto>('/decision-records', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-records'] });
    },
  });
};

export const useUpdateDecisionRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateDecisionRecordDto }) => {
      const res = await apiClient.put<DecisionRecordDto>(`/decision-records/${id}`, dto);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-records'] });
      queryClient.invalidateQueries({ queryKey: ['decision-record-detail', data.id] });
    },
  });
};

export const useDeleteDecisionRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/decision-records/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-records'] });
    },
  });
};

export const usePublishDecisionRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<DecisionRecordDto>(`/decision-records/${id}/publish`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-records'] });
      queryClient.invalidateQueries({ queryKey: ['decision-record-detail', data.id] });
    },
  });
};

export const useReviewDecisionRecord = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const res = await apiClient.post<DecisionRecordDto>(`/decision-records/${id}/review`, {
        comment,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-records'] });
      queryClient.invalidateQueries({ queryKey: ['decision-record-detail', data.id] });
    },
  });
};
