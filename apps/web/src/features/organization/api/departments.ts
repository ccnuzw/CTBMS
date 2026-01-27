import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    CreateDepartmentDto,
    UpdateDepartmentDto,
    DepartmentDto,
    DepartmentTreeNode,
} from '@packages/types';

// 扩展类型以包含关联数据
interface DepartmentWithRelations extends DepartmentDto {
    organization?: { id: string; name: string };
    parent?: DepartmentDto | null;
    _count?: { children: number };
}

/**
 * 获取所有部门（扁平列表）
 */
export const useDepartments = (organizationId?: string) => {
    return useQuery<DepartmentWithRelations[]>({
        queryKey: ['departments', { organizationId }],
        queryFn: async () => {
            const params = organizationId ? `?organizationId=${organizationId}` : '';
            const res = await apiClient.get<DepartmentWithRelations[]>(`/departments${params}`);
            return res.data;
        },
    });
};

/**
 * 获取某组织的部门树形结构
 */
export const useDepartmentTree = (organizationId: string, enabled = true) => {
    return useQuery<DepartmentTreeNode[]>({
        queryKey: ['departments', 'tree', organizationId],
        queryFn: async () => {
            const res = await apiClient.get<DepartmentTreeNode[]>(`/departments/tree/${organizationId}`);
            return res.data;
        },
        enabled,
    });
};

/**
 * 获取单个部门详情
 */
export const useDepartment = (id: string, enabled = true) => {
    return useQuery<DepartmentWithRelations>({
        queryKey: ['departments', id],
        queryFn: async () => {
            const res = await apiClient.get<DepartmentWithRelations>(`/departments/${id}`);
            return res.data;
        },
        enabled,
    });
};

/**
 * 创建部门
 */
export const useCreateDepartment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateDepartmentDto) => {
            const res = await apiClient.post<DepartmentDto>('/departments', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
        },
    });
};

/**
 * 更新部门
 */
export const useUpdateDepartment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateDepartmentDto }) => {
            const res = await apiClient.patch<DepartmentDto>(`/departments/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
        },
    });
};

/**
 * 删除部门
 */
export const useDeleteDepartment = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<DepartmentDto>(`/departments/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
        },
    });
};
