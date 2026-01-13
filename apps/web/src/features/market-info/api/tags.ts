import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { CreateTagDto, UpdateTagDto, TagResponse } from '@packages/types';

export const useTags = () => {
    return useQuery<TagResponse[]>({
        queryKey: ['market-tags'],
        queryFn: async () => {
            const res = await apiClient.get<TagResponse[]>('/market/tags');
            return res.data;
        },
    });
};

export const useCreateTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateTagDto) => {
            const res = await apiClient.post<TagResponse>('/market/tags', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-tags'] });
        },
    });
};

export const useUpdateTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateTagDto }) => {
            const res = await apiClient.patch<TagResponse>(`/market/tags/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-tags'] });
        },
    });
};

export const useDeleteTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<TagResponse>(`/market/tags/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-tags'] });
        },
    });
};
