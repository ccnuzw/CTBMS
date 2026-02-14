import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateParameterItemDto,
  CreateParameterSetDto,
  PublishParameterSetDto,
  UpdateParameterItemDto,
  ParameterSetDetailDto,
  ParameterSetDto,
  ParameterSetPageDto,
  ParameterSetQueryDto,
  ParameterChangeLogPageDto,
  ParameterOverrideDiffDto,
  BatchResetParameterItemsDto,
  ParameterImpactPreviewDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/parameter-sets';

export const useParameterSets = (query?: Partial<ParameterSetQueryDto>) => {
  return useQuery<ParameterSetPageDto>({
    queryKey: ['parameter-sets', query],
    queryFn: async () => {
      const res = await apiClient.get<ParameterSetPageDto>(API_BASE, { params: query });
      return res.data;
    },
  });
};

export const useParameterSetDetail = (id?: string) => {
  return useQuery<ParameterSetDetailDto>({
    queryKey: ['parameter-set', id],
    queryFn: async () => {
      const res = await apiClient.get<ParameterSetDetailDto>(`${API_BASE}/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useCreateParameterSet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateParameterSetDto) => {
      const res = await apiClient.post<ParameterSetDto>(API_BASE, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parameter-sets'] });
    },
  });
};

export const useDeleteParameterSet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`${API_BASE}/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parameter-sets'] });
    },
  });
};

export const useCreateParameterItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, payload }: { setId: string; payload: CreateParameterItemDto }) => {
      const res = await apiClient.post(`${API_BASE}/${setId}/items`, payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parameter-set', variables.setId] });
    },
  });
};

export const useUpdateParameterItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      setId,
      itemId,
      payload,
    }: {
      setId: string;
      itemId: string;
      payload: UpdateParameterItemDto;
    }) => {
      const res = await apiClient.patch(`${API_BASE}/${setId}/items/${itemId}`, payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parameter-set', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-override-diff', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-change-logs', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-impact-preview', variables.setId] });
    },
  });
};

export const usePublishParameterSet = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload?: PublishParameterSetDto }) => {
      const res = await apiClient.post<ParameterSetDto>(`${API_BASE}/${id}/publish`, payload ?? {});
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parameter-sets'] });
      queryClient.invalidateQueries({ queryKey: ['parameter-set', variables.id] });
    },
  });
};

export interface ParameterChangeLogQuery {
  parameterItemId?: string;
  operation?: string;
  changedByUserId?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  page?: number;
  pageSize?: number;
}

export const useParameterChangeLogs = (setId?: string, query?: ParameterChangeLogQuery) => {
  return useQuery<ParameterChangeLogPageDto>({
    queryKey: ['parameter-change-logs', setId, query],
    queryFn: async () => {
      const res = await apiClient.get<ParameterChangeLogPageDto>(
        `${API_BASE}/${setId}/change-logs`,
        { params: query },
      );
      return res.data;
    },
    enabled: Boolean(setId),
  });
};

export const useParameterOverrideDiff = (setId?: string) => {
  return useQuery<ParameterOverrideDiffDto>({
    queryKey: ['parameter-override-diff', setId],
    queryFn: async () => {
      const res = await apiClient.get<ParameterOverrideDiffDto>(
        `${API_BASE}/${setId}/override-diff`,
      );
      return res.data;
    },
    enabled: Boolean(setId),
  });
};

export const useParameterImpactPreview = (setId?: string) => {
  return useQuery<ParameterImpactPreviewDto>({
    queryKey: ['parameter-impact-preview', setId],
    queryFn: async () => {
      const res = await apiClient.get<ParameterImpactPreviewDto>(`${API_BASE}/${setId}/impact-preview`);
      return res.data;
    },
    enabled: Boolean(setId),
  });
};

export const useResetParameterItemToDefault = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, itemId }: { setId: string; itemId: string }) => {
      const res = await apiClient.post(`${API_BASE}/${setId}/items/${itemId}/reset`);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parameter-set', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-override-diff', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-change-logs', variables.setId] });
    },
  });
};

export const useBatchResetParameterItems = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, dto }: { setId: string; dto: BatchResetParameterItemsDto }) => {
      const res = await apiClient.post<{ resetCount: number }>(
        `${API_BASE}/${setId}/batch-reset`,
        dto,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parameter-set', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-override-diff', variables.setId] });
      queryClient.invalidateQueries({ queryKey: ['parameter-change-logs', variables.setId] });
    },
  });
};
