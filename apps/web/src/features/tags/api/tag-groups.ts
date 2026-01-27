import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { CreateTagGroupDto, UpdateTagGroupDto, TagGroupResponse } from '@packages/types';

export const useTagGroups = () => {
    return useQuery<TagGroupResponse[]>({
        queryKey: ['tag-groups'],
        queryFn: async () => {
            const res = await apiClient.get<TagGroupResponse[]>('/tag-groups');
            return res.data;
        },
    });
};

export const useTagGroup = (id: string) => {
    return useQuery<TagGroupResponse>({
        queryKey: ['tag-groups', id],
        queryFn: async () => {
            const res = await apiClient.get<TagGroupResponse>(`/tag-groups/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

export const useCreateTagGroup = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateTagGroupDto) => {
            const res = await apiClient.post<TagGroupResponse>('/tag-groups', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tag-groups'] });
        },
    });
};

export const useUpdateTagGroup = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateTagGroupDto }) => {
            const res = await apiClient.patch<TagGroupResponse>(`/tag-groups/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tag-groups'] });
        },
    });
};

export const useDeleteTagGroup = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<TagGroupResponse>(`/tag-groups/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tag-groups'] });
        },
    });
};
