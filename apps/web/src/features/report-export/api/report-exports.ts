import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExportTaskDto,
  ExportTaskPageDto,
  ExportDebateReportDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface ExportTaskQuery {
  workflowExecutionId?: string;
  format?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const useExportTasks = (query?: ExportTaskQuery) => {
  return useQuery<ExportTaskPageDto>({
    queryKey: ['report-exports', query],
    queryFn: async () => {
      const res = await apiClient.get<ExportTaskPageDto>('/report-exports', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useExportTaskDetail = (taskId?: string) => {
  return useQuery<ExportTaskDto>({
    queryKey: ['report-export-detail', taskId],
    queryFn: async () => {
      const res = await apiClient.get<ExportTaskDto>(`/report-exports/${taskId}`);
      return res.data;
    },
    enabled: Boolean(taskId),
  });
};

export const useCreateExportTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ExportDebateReportDto) => {
      const res = await apiClient.post<ExportTaskDto>('/report-exports', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-exports'] });
    },
  });
};

export const useDeleteExportTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiClient.delete(`/report-exports/${taskId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-exports'] });
    },
  });
};
