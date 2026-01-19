import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    AdministrativeRegion,
    RegionLevel,
    RegionQuery,
} from '@packages/types';

const API_BASE = '/api/regions';

// ===== 查询 Hooks =====

/**
 * 查询行政区划列表
 */
export function useRegions(query: Partial<RegionQuery> = {}) {
    return useQuery({
        queryKey: ['regions', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query.level) params.append('level', query.level);
            if (query.parentCode !== undefined) params.append('parentCode', query.parentCode || '');
            if (query.keyword) params.append('keyword', query.keyword);
            if (query.isActive !== undefined) params.append('isActive', String(query.isActive));

            const res = await fetch(`${API_BASE}?${params}`);
            if (!res.ok) throw new Error('获取行政区划列表失败');
            return res.json() as Promise<AdministrativeRegion[]>;
        },
    });
}

/**
 * 获取行政区划树
 */
export function useRegionTree(rootLevel?: RegionLevel) {
    return useQuery({
        queryKey: ['region-tree', rootLevel],
        queryFn: async () => {
            const url = rootLevel ? `${API_BASE}/tree?rootLevel=${rootLevel}` : `${API_BASE}/tree`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('获取行政区划树失败');
            return res.json();
        },
        staleTime: 10 * 60 * 1000, // 10分钟缓存
    });
}

/**
 * 获取省份列表
 */
export function useProvinces() {
    return useQuery({
        queryKey: ['provinces'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/provinces`);
            if (!res.ok) throw new Error('获取省份列表失败');
            return res.json() as Promise<AdministrativeRegion[]>;
        },
        staleTime: 30 * 60 * 1000, // 30分钟缓存
    });
}

/**
 * 获取城市列表
 */
export function useCities(provinceCode: string | undefined) {
    return useQuery({
        queryKey: ['cities', provinceCode],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/provinces/${provinceCode}/cities`);
            if (!res.ok) throw new Error('获取城市列表失败');
            return res.json() as Promise<AdministrativeRegion[]>;
        },
        enabled: !!provinceCode,
        staleTime: 30 * 60 * 1000,
    });
}

/**
 * 获取区县列表
 */
export function useDistricts(cityCode: string | undefined) {
    return useQuery({
        queryKey: ['districts', cityCode],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/cities/${cityCode}/districts`);
            if (!res.ok) throw new Error('获取区县列表失败');
            return res.json() as Promise<AdministrativeRegion[]>;
        },
        enabled: !!cityCode,
        staleTime: 30 * 60 * 1000,
    });
}

/**
 * 获取层级统计
 */
export function useRegionStats() {
    return useQuery({
        queryKey: ['region-stats'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/stats/by-level`);
            if (!res.ok) throw new Error('获取统计失败');
            return res.json() as Promise<{ level: RegionLevel; count: number }[]>;
        },
    });
}

// ===== 变更 Hooks =====

interface CreateRegionDto {
    code: string;
    name: string;
    shortName?: string;
    level: RegionLevel;
    parentCode?: string;
    longitude?: number;
    latitude?: number;
    sortOrder?: number;
    isActive?: boolean;
}

/**
 * 创建行政区划
 */
export function useCreateRegion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (dto: CreateRegionDto) => {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || '创建失败');
            }
            return res.json() as Promise<AdministrativeRegion>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['regions'] });
            queryClient.invalidateQueries({ queryKey: ['region-tree'] });
            queryClient.invalidateQueries({ queryKey: ['provinces'] });
            queryClient.invalidateQueries({ queryKey: ['region-stats'] });
        },
    });
}

/**
 * 更新行政区划
 */
export function useUpdateRegion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: Partial<CreateRegionDto> }) => {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || '更新失败');
            }
            return res.json() as Promise<AdministrativeRegion>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['regions'] });
            queryClient.invalidateQueries({ queryKey: ['region-tree'] });
            queryClient.invalidateQueries({ queryKey: ['provinces'] });
            queryClient.invalidateQueries({ queryKey: ['cities'] });
            queryClient.invalidateQueries({ queryKey: ['districts'] });
        },
    });
}

/**
 * 删除行政区划
 */
export function useDeleteRegion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || '删除失败');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['regions'] });
            queryClient.invalidateQueries({ queryKey: ['region-tree'] });
            queryClient.invalidateQueries({ queryKey: ['region-stats'] });
        },
    });
}
