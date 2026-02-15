import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AgentProfileDto,
  AgentProfilePageDto,
  AgentProfileQueryDto,
  CreateAgentProfileDto,
  UpdateAgentProfileDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const API_BASE = '/agent-profiles';

export const useAgentProfiles = (query?: Partial<AgentProfileQueryDto>) => {
  return useQuery<AgentProfilePageDto>({
    queryKey: ['agent-profiles', query],
    queryFn: async () => {
      const res = await apiClient.get<AgentProfilePageDto>(API_BASE, { params: query });
      return res.data;
    },
  });
};

export const useCreateAgentProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAgentProfileDto) => {
      const res = await apiClient.post<AgentProfileDto>(API_BASE, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profiles'] });
    },
  });
};

export const useUpdateAgentProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateAgentProfileDto }) => {
      const res = await apiClient.patch<AgentProfileDto>(`${API_BASE}/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profiles'] });
    },
  });
};

export const usePublishAgentProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<AgentProfileDto>(`${API_BASE}/${id}/publish`, {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profiles'] });
    },
  });
};

export const useDeleteAgentProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`${API_BASE}/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profiles'] });
    },
  });
};
