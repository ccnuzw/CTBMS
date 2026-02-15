import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TemplateCatalogDto,
  TemplateCatalogPageDto,
  CreateTemplateCatalogDto,
  UpdateTemplateCatalogDto,
  CopyTemplateDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

export interface TemplateCatalogQuery {
  category?: string;
  status?: string;
  keyword?: string;
  isOfficial?: boolean;
  page?: number;
  pageSize?: number;
}

export const useTemplateCatalog = (query?: TemplateCatalogQuery) => {
  return useQuery<TemplateCatalogPageDto>({
    queryKey: ['template-catalog', query],
    queryFn: async () => {
      const res = await apiClient.get<TemplateCatalogPageDto>('/template-catalog', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useMyTemplates = (query?: TemplateCatalogQuery) => {
  return useQuery<TemplateCatalogPageDto>({
    queryKey: ['template-catalog-mine', query],
    queryFn: async () => {
      const res = await apiClient.get<TemplateCatalogPageDto>('/template-catalog/mine', {
        params: query,
      });
      return res.data;
    },
  });
};

export const useTemplateDetail = (id?: string) => {
  return useQuery<TemplateCatalogDto>({
    queryKey: ['template-catalog-detail', id],
    queryFn: async () => {
      const res = await apiClient.get<TemplateCatalogDto>(`/template-catalog/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
};

export const useCreateTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTemplateCatalogDto) => {
      const res = await apiClient.post<TemplateCatalogDto>('/template-catalog', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['template-catalog-mine'] });
    },
  });
};

export const useUpdateTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateTemplateCatalogDto }) => {
      const res = await apiClient.put<TemplateCatalogDto>(`/template-catalog/${id}`, dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['template-catalog-mine'] });
    },
  });
};

export const usePublishTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<TemplateCatalogDto>(`/template-catalog/${id}/publish`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['template-catalog-mine'] });
    },
  });
};

export const useArchiveTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<TemplateCatalogDto>(`/template-catalog/${id}/archive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['template-catalog-mine'] });
    },
  });
};

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/template-catalog/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['template-catalog-mine'] });
    },
  });
};

export const useCopyTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CopyTemplateDto) => {
      const res = await apiClient.post('/template-catalog/copy', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
    },
  });
};
