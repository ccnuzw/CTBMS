import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TriggerConfigDto,
  TriggerLogDto,
  CreateTriggerConfigDto,
  UpdateTriggerConfigDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface TriggerConfigPageResponse {
  data: TriggerConfigDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TriggerLogWithConfig extends TriggerLogDto {
  triggerConfig?: { id: string; name: string; triggerType: string };
}

export interface TriggerLogPageResponse {
  data: TriggerLogWithConfig[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TriggerConfigQuery {
  workflowDefinitionId?: string;
  triggerType?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface TriggerLogQuery {
  triggerConfigId?: string;
  triggerType?: string;
  status?: string;
  triggeredAtFrom?: string;
  triggeredAtTo?: string;
  page?: number;
  pageSize?: number;
}

export const useTriggerConfigs = (query?: TriggerConfigQuery) => {
  return useQuery<TriggerConfigPageResponse>({
    queryKey: ['trigger-configs', query],
    queryFn: async () => {
      const res = await apiClient.get<TriggerConfigPageResponse>('/trigger-configs', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useTriggerConfigDetail = (id?: string) => {
  return useQuery<TriggerConfigDto>({
    queryKey: ['trigger-config-detail', id],
    queryFn: async () => {
      const res = await apiClient.get<TriggerConfigDto>(`/trigger-configs/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useCreateTriggerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTriggerConfigDto) => {
      const res = await apiClient.post<TriggerConfigDto>('/trigger-configs', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trigger-configs'] });
    },
  });
};

export const useUpdateTriggerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateTriggerConfigDto }) => {
      const res = await apiClient.patch<TriggerConfigDto>(`/trigger-configs/${id}`, dto);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trigger-configs'] });
      queryClient.invalidateQueries({ queryKey: ['trigger-config-detail', data.id] });
    },
  });
};

export const useDeleteTriggerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/trigger-configs/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trigger-configs'] });
    },
  });
};

export const useActivateTriggerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<TriggerConfigDto>(`/trigger-configs/${id}/activate`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trigger-configs'] });
      queryClient.invalidateQueries({ queryKey: ['trigger-config-detail', data.id] });
    },
  });
};

export const useDeactivateTriggerConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<TriggerConfigDto>(`/trigger-configs/${id}/deactivate`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trigger-configs'] });
      queryClient.invalidateQueries({ queryKey: ['trigger-config-detail', data.id] });
    },
  });
};

export const useTriggerLogs = (query?: TriggerLogQuery) => {
  return useQuery<TriggerLogPageResponse>({
    queryKey: ['trigger-logs', query],
    queryFn: async () => {
      const res = await apiClient.get<TriggerLogPageResponse>('/trigger-configs/logs', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useTriggerLogsByConfig = (configId?: string, query?: TriggerLogQuery) => {
  return useQuery<TriggerLogPageResponse>({
    queryKey: ['trigger-logs-by-config', configId, query],
    queryFn: async () => {
      const res = await apiClient.get<TriggerLogPageResponse>(
        `/trigger-configs/${configId}/logs`,
        { params: query },
      );
      return res.data;
    },
    enabled: Boolean(configId),
  });
};
