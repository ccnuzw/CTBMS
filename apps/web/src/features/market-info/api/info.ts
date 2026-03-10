import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { CreateInfoDto, UpdateInfoDto, InfoResponse } from '@packages/types';

const MARKET_INFO_API_BASE = '/v1/market-info-items';

export const useInfos = () => {
    return useQuery<InfoResponse[]>({
        queryKey: ['market-infos'],
        queryFn: async () => {
            const res = await apiClient.get<InfoResponse[]>(MARKET_INFO_API_BASE);
            return res.data;
        },
    });
};

export const useInfo = (id: string) => {
    return useQuery<InfoResponse>({
        queryKey: ['market-infos', id],
        queryFn: async () => {
            const res = await apiClient.get<InfoResponse>(`${MARKET_INFO_API_BASE}/${id}`);
            return res.data;
        },
        enabled: !!id && id !== 'new',
    });
};

export const useCreateInfo = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateInfoDto) => {
            const res = await apiClient.post<InfoResponse>(MARKET_INFO_API_BASE, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-infos'] });
        },
    });
};

export const useUpdateInfo = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateInfoDto }) => {
            const res = await apiClient.patch<InfoResponse>(`${MARKET_INFO_API_BASE}/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-infos'] });
        },
    });
};

export const useDeleteInfo = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<InfoResponse>(`${MARKET_INFO_API_BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-infos'] });
        },
    });
};
