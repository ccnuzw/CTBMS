import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateParameterItemDto,
  CreateParameterSetDto,
  PublishParameterSetDto,
  ParameterSetDetailDto,
  ParameterSetDto,
  ParameterSetPageDto,
  ParameterSetQueryDto,
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
