import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import type {
    Commodity,
    CommodityQueryDto,
    CreateCommodityDto,
    Region,
    MasterRegionQueryDto,
    CreateRegionDto,
    MetricDefinition,
    MetricDefinitionQueryDto,
    CreateMetricDefinitionDto,
} from '@packages/types';

interface PageResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ── Commodity Hooks ──

export const useCommodities = (query?: Partial<CommodityQueryDto>) => {
    return useQuery<PageResult<Commodity>>({
        queryKey: ['semantic-layer', 'commodities', query],
        queryFn: async () => {
            const res = await apiClient.get<PageResult<Commodity>>('/semantic-layer/commodities', {
                params: query,
            });
            return res.data;
        },
    });
};

export const useCreateCommodity = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateCommodityDto) => {
            const res = await apiClient.post('/semantic-layer/commodities', dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['semantic-layer', 'commodities'] }),
    });
};

export const useDeleteCommodity = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (code: string) => {
            const res = await apiClient.delete(`/semantic-layer/commodities/${code}`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['semantic-layer', 'commodities'] }),
    });
};

// ── Region Hooks ──

export const useRegions = (query?: Partial<MasterRegionQueryDto>) => {
    return useQuery<PageResult<Region>>({
        queryKey: ['semantic-layer', 'regions', query],
        queryFn: async () => {
            const res = await apiClient.get<PageResult<Region>>('/semantic-layer/regions', {
                params: query,
            });
            return res.data;
        },
    });
};

export const useCreateRegion = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateRegionDto) => {
            const res = await apiClient.post('/semantic-layer/regions', dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['semantic-layer', 'regions'] }),
    });
};

// ── MetricDefinition Hooks ──

export const useMetricDefinitions = (query?: Partial<MetricDefinitionQueryDto>) => {
    return useQuery<PageResult<MetricDefinition>>({
        queryKey: ['semantic-layer', 'metrics', query],
        queryFn: async () => {
            const res = await apiClient.get<PageResult<MetricDefinition>>('/semantic-layer/metrics', {
                params: query,
            });
            return res.data;
        },
    });
};

export const useCreateMetricDefinition = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateMetricDefinitionDto) => {
            const res = await apiClient.post('/semantic-layer/metrics', dto);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['semantic-layer', 'metrics'] }),
    });
};

export const useDeleteMetricDefinition = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (metricCode: string) => {
            const res = await apiClient.delete(`/semantic-layer/metrics/${metricCode}`);
            return res.data;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['semantic-layer', 'metrics'] }),
    });
};
