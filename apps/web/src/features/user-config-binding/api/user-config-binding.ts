import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UserConfigBindingPageDto,
  UserConfigBindingDto,
  CreateUserConfigBindingDto,
  UpdateUserConfigBindingDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface UserConfigBindingQuery {
  bindingType?: string;
  isActive?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const useUserConfigBindings = (query?: UserConfigBindingQuery) => {
  return useQuery<UserConfigBindingPageDto>({
    queryKey: ['user-config-bindings', query],
    queryFn: async () => {
      const res = await apiClient.get<UserConfigBindingPageDto>('/user-config-bindings', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useCreateUserConfigBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateUserConfigBindingDto) => {
      const res = await apiClient.post<UserConfigBindingDto>('/user-config-bindings', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-config-bindings'] });
    },
  });
};

export const useUpdateUserConfigBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateUserConfigBindingDto }) => {
      const res = await apiClient.put<UserConfigBindingDto>(`/user-config-bindings/${id}`, dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-config-bindings'] });
    },
  });
};

export const useDeleteUserConfigBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<{ deleted: boolean }>(`/user-config-bindings/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-config-bindings'] });
    },
  });
};
