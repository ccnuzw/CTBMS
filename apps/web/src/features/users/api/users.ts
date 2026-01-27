import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserDto, CreateUserDto, UpdateUserDto, AssignRolesDto } from '@packages/types';

const API_BASE = '/api/users';

// 扩展类型（包含关联数据）
export interface UserWithRelations extends UserDto {
    organization?: { id: string; name: string } | null;
    department?: { id: string; name: string } | null;
    roles?: { role: { id: string; name: string; code: string } }[];
}

// 筛选参数
export interface UserFilters {
    organizationId?: string;
    departmentId?: string;
    status?: string;
}

// 获取用户列表（支持筛选）
export const useUsers = (filters?: UserFilters) => {
    return useQuery<UserWithRelations[]>({
        queryKey: ['users', filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.organizationId) params.append('organizationId', filters.organizationId);
            if (filters?.departmentId) params.append('departmentId', filters.departmentId);
            if (filters?.status) params.append('status', filters.status);

            const res = await fetch(`${API_BASE}?${params.toString()}`);
            if (!res.ok) throw new Error('获取用户列表失败');
            return res.json();
        },
    });
};

// 获取单个用户
export const useUser = (id: string, enabled = true) => {
    return useQuery<UserWithRelations>({
        queryKey: ['users', id],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/${id}`);
            if (!res.ok) throw new Error('获取用户详情失败');
            return res.json();
        },
        enabled,
    });
};

// 创建用户
export const useCreateUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateUserDto) => {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '创建用户失败');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

// 更新用户
export const useUpdateUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateUserDto }) => {
            const res = await fetch(`${API_BASE}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '更新用户失败');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

// 分配角色
export const useAssignRoles = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: AssignRolesDto }) => {
            const res = await fetch(`${API_BASE}/${id}/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '分配角色失败');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

// 删除用户
export const useDeleteUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || '删除用户失败');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};
