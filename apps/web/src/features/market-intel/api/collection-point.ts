import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    CollectionPointResponse,
    CreateCollectionPointDto,
    UpdateCollectionPointDto,
    CollectionPointQuery,
    CollectionPointForRecognition,
    CollectionPointType,
} from '@packages/types';

const API_BASE = '/api/collection-points';

// ===== 查询 Hooks =====

/**
 * 分页查询采集点列表
 */
export function useCollectionPoints(query: Partial<CollectionPointQuery> = {}) {
    return useQuery({
        queryKey: ['collection-points', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query.type) params.append('type', query.type);
            if (query.regionCode) params.append('regionCode', query.regionCode);
            if (query.keyword) params.append('keyword', query.keyword);
            if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
            if (query.allocationStatus) params.append('allocationStatus', query.allocationStatus);
            if (query.page) params.append('page', String(query.page));
            if (query.pageSize) params.append('pageSize', String(query.pageSize));

            const res = await fetch(`${API_BASE}?${params}`);
            if (!res.ok) throw new Error('获取采集点列表失败');
            return res.json() as Promise<{
                data: CollectionPointResponse[];
                total: number;
                page: number;
                pageSize: number;
                totalPages: number;
            }>;
        },
    });
}

/**
 * 获取单个采集点
 */
export function useCollectionPoint(id: string | undefined) {
    return useQuery({
        queryKey: ['collection-point', id],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/${id}`);
            if (!res.ok) throw new Error('获取采集点详情失败');
            return res.json() as Promise<CollectionPointResponse>;
        },
        enabled: !!id,
    });
}

/**
 * 获取用于 AI 识别的采集点列表
 */
export function useCollectionPointsForRecognition() {
    return useQuery({
        queryKey: ['collection-points-for-recognition'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/for-recognition`);
            if (!res.ok) throw new Error('获取采集点列表失败');
            return res.json() as Promise<CollectionPointForRecognition[]>;
        },
        staleTime: 5 * 60 * 1000, // 5分钟缓存
    });
}

/**
 * 获取类型统计
 */
export function useCollectionPointStats() {
    return useQuery({
        queryKey: ['collection-point-stats'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/stats/by-type`);
            if (!res.ok) throw new Error('获取统计失败');
            return res.json() as Promise<{ type: CollectionPointType; count: number }[]>;
        },
    });
}

// ===== 变更 Hooks =====

/**
 * 创建采集点
 */
export function useCreateCollectionPoint() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (dto: CreateCollectionPointDto) => {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || '创建失败');
            }
            return res.json() as Promise<CollectionPointResponse>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['collection-points'] });
            queryClient.invalidateQueries({ queryKey: ['collection-points-for-recognition'] });
            queryClient.invalidateQueries({ queryKey: ['collection-point-stats'] });
        },
    });
}

/**
 * 更新采集点
 */
export function useUpdateCollectionPoint() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: UpdateCollectionPointDto }) => {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dto),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || '更新失败');
            }
            return res.json() as Promise<CollectionPointResponse>;
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['collection-points'] });
            queryClient.invalidateQueries({ queryKey: ['collection-point', id] });
            queryClient.invalidateQueries({ queryKey: ['collection-points-for-recognition'] });
        },
    });
}

/**
 * 删除采集点
 */
export function useDeleteCollectionPoint() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('删除失败');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['collection-points'] });
            queryClient.invalidateQueries({ queryKey: ['collection-points-for-recognition'] });
            queryClient.invalidateQueries({ queryKey: ['collection-point-stats'] });
        },
    });
}

/**
 * 批量导入采集点
 */
export function useBatchImportCollectionPoints() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (points: CreateCollectionPointDto[]) => {
            const res = await fetch(`${API_BASE}/batch-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points }),
            });
            if (!res.ok) throw new Error('导入失败');
            return res.json() as Promise<{ success: number; failed: number; errors: string[] }>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['collection-points'] });
            queryClient.invalidateQueries({ queryKey: ['collection-points-for-recognition'] });
            queryClient.invalidateQueries({ queryKey: ['collection-point-stats'] });
        },
    });
}
