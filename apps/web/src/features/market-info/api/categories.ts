import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponse } from '@packages/types';

const MARKET_CATEGORY_API_BASE = '/v1/market-categories';

export const useCategories = () => {
    return useQuery<CategoryResponse[]>({
        queryKey: ['market-categories'],
        queryFn: async () => {
            const res = await apiClient.get<CategoryResponse[]>(MARKET_CATEGORY_API_BASE);
            return res.data;
        },
    });
};

export const useCategory = (id: string, enabled = true) => {
    return useQuery<CategoryResponse>({
        queryKey: ['market-categories', id],
        queryFn: async () => {
            const res = await apiClient.get<CategoryResponse>(`${MARKET_CATEGORY_API_BASE}/${id}`);
            return res.data;
        },
        enabled
    });
}

export const useCreateCategory = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateCategoryDto) => {
            const res = await apiClient.post<CategoryResponse>(MARKET_CATEGORY_API_BASE, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-categories'] });
        },
    });
};

export const useUpdateCategory = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateCategoryDto }) => {
            const res = await apiClient.patch<CategoryResponse>(`${MARKET_CATEGORY_API_BASE}/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-categories'] });
        },
    });
};

export const useDeleteCategory = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<CategoryResponse>(`${MARKET_CATEGORY_API_BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-categories'] });
        },
    });
};
