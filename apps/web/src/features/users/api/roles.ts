import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RoleDto, CreateRoleDto, UpdateRoleDto } from '@packages/types';

const API_BASE = '/api/roles';

// 扩展类型（包含关联数据）
export interface RoleWithCount extends RoleDto {
    _count?: { users: number };
}

// API 请求函数
const fetchRoles = async (): Promise<RoleWithCount[]> => {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('获取角色列表失败');
    return res.json();
};

// Query Keys
export const roleKeys = {
    all: ['roles'] as const,
    detail: (id: string) => ['roles', id] as const,
};

// React Query Hooks
export const useRoles = () => {
    return useQuery({
        queryKey: roleKeys.all,
        queryFn: fetchRoles,
    });
};

export const useCreateRole = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CreateRoleDto) => {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '创建角色失败');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: roleKeys.all });
        },
    });
};

export const useUpdateRole = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateRoleDto }) => {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '更新角色失败');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: roleKeys.all });
        },
    });
};

export const useDeleteRole = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '删除角色失败');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: roleKeys.all });
        },
    });
};
