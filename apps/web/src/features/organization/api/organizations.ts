import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    CreateOrganizationDto,
    UpdateOrganizationDto,
    OrganizationDto,
    OrganizationTreeNode,
} from '@packages/types';

// 扩展类型以包含关联数据
interface OrganizationWithRelations extends OrganizationDto {
    parent?: OrganizationDto | null;
    _count?: { children: number; departments: number };
}

/**
 * 获取所有组织（扁平列表）
 */
export const useOrganizations = () => {
    return useQuery<OrganizationWithRelations[]>({
        queryKey: ['organizations'],
        queryFn: async () => {
            const res = await apiClient.get<OrganizationWithRelations[]>('/organizations');
            return res.data;
        },
    });
};

/**
 * 获取组织树形结构
 */
export const useOrganizationTree = () => {
    return useQuery<OrganizationTreeNode[]>({
        queryKey: ['organizations', 'tree'],
        queryFn: async () => {
            const res = await apiClient.get<OrganizationTreeNode[]>('/organizations/tree');
            return res.data;
        },
    });
};

/**
 * 获取单个组织详情
 */
export const useOrganization = (id: string, enabled = true) => {
    return useQuery<OrganizationWithRelations>({
        queryKey: ['organizations', id],
        queryFn: async () => {
            const res = await apiClient.get<OrganizationWithRelations>(`/organizations/${id}`);
            return res.data;
        },
        enabled,
    });
};

/**
 * 创建组织
 */
export const useCreateOrganization = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateOrganizationDto) => {
            const res = await apiClient.post<OrganizationDto>('/organizations', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['organizations'] });
        },
    });
};

/**
 * 更新组织
 */
export const useUpdateOrganization = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateOrganizationDto }) => {
            const res = await apiClient.patch<OrganizationDto>(`/organizations/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['organizations'] });
        },
    });
};

/**
 * 删除组织
 */
export const useDeleteOrganization = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<OrganizationDto>(`/organizations/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['organizations'] });
        },
    });
};
