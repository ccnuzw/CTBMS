import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    CreateTagDto,
    UpdateTagDto,
    TagResponse,
    TagScope,
    AttachTagsDto,
    DetachTagDto,
    TaggableEntityType,
} from '@packages/types';

// ========== 全局标签查询 ==========

export const useGlobalTags = (params?: { scope?: TagScope; groupId?: string; status?: string }) => {
    return useQuery<TagResponse[]>({
        queryKey: ['global-tags', params],
        queryFn: async () => {
            const searchParams = new URLSearchParams();
            if (params?.scope) searchParams.set('scope', params.scope);
            if (params?.groupId) searchParams.set('groupId', params.groupId);
            if (params?.status) searchParams.set('status', params.status);

            const res = await apiClient.get<TagResponse[]>(`/tags?${searchParams.toString()}`);
            return res.data;
        },
    });
};

export const useGlobalTag = (id: string) => {
    return useQuery<TagResponse>({
        queryKey: ['global-tags', id],
        queryFn: async () => {
            const res = await apiClient.get<TagResponse>(`/tags/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

// ========== 全局标签 CRUD ==========

export const useCreateGlobalTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateTagDto) => {
            const res = await apiClient.post<TagResponse>('/tags', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-tags'] });
        },
    });
};

export const useUpdateGlobalTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateTagDto }) => {
            const res = await apiClient.patch<TagResponse>(`/tags/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-tags'] });
        },
    });
};

export const useDeleteGlobalTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<TagResponse>(`/tags/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-tags'] });
        },
    });
};

// ========== 实体标签操作 ==========

export const useAttachTags = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: AttachTagsDto) => {
            const res = await apiClient.post('/tags/attach', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['entity-tags', variables.entityType, variables.entityId],
            });
            queryClient.invalidateQueries({ queryKey: ['enterprises'] });
        },
    });
};

export const useSyncTags = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: AttachTagsDto) => {
            const res = await apiClient.post('/tags/sync', data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['entity-tags', variables.entityType, variables.entityId],
            });
            queryClient.invalidateQueries({ queryKey: ['enterprises'] });
        },
    });
};

export const useDetachTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: DetachTagDto) => {
            const res = await apiClient.delete('/tags/detach', { data });
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['entity-tags', variables.entityType, variables.entityId],
            });
        },
    });
};

export const useEntityTags = (entityType: TaggableEntityType, entityId: string) => {
    return useQuery<TagResponse[]>({
        queryKey: ['entity-tags', entityType, entityId],
        queryFn: async () => {
            const res = await apiClient.get<TagResponse[]>(`/tags/entity/${entityType}/${entityId}`);
            return res.data;
        },
        enabled: !!entityType && !!entityId,
    });
};
