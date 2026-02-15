import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
    TemplateCatalogDto,
    TemplateCatalogPageDto,
    TemplateCatalogQueryDto,
    CreateTemplateCatalogDto,
    UpdateTemplateCatalogDto,
    CopyTemplateDto,
} from '@packages/types';
import { apiClient } from '../../../api/client';

const BASE = '/template-catalog';

const templateKeys = {
    all: ['template-catalog'] as const,
    lists: () => [...templateKeys.all, 'list'] as const,
    list: (params: TemplateCatalogQueryDto) => [...templateKeys.lists(), params] as const,
    mineLists: () => [...templateKeys.all, 'mine'] as const,
    mineList: (params: TemplateCatalogQueryDto) => [...templateKeys.mineLists(), params] as const,
    details: () => [...templateKeys.all, 'detail'] as const,
    detail: (id: string) => [...templateKeys.details(), id] as const,
};

/**
 * 查询公开模板市场
 */
export const useTemplateCatalog = (params: TemplateCatalogQueryDto) => {
    return useQuery<TemplateCatalogPageDto>({
        queryKey: templateKeys.list(params),
        queryFn: async () => {
            const res = await apiClient.get<TemplateCatalogPageDto>(BASE, { params });
            return res.data;
        },
    });
};

/**
 * 查询我的模板
 */
export const useMyTemplates = (params: TemplateCatalogQueryDto) => {
    return useQuery<TemplateCatalogPageDto>({
        queryKey: templateKeys.mineList(params),
        queryFn: async () => {
            const res = await apiClient.get<TemplateCatalogPageDto>(`${BASE}/mine`, { params });
            return res.data;
        },
    });
};

/**
 * 查询单条模板详情
 */
export const useTemplateCatalogDetail = (id?: string) => {
    return useQuery<TemplateCatalogDto>({
        queryKey: templateKeys.detail(id!),
        queryFn: async () => {
            const res = await apiClient.get<TemplateCatalogDto>(`${BASE}/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

/**
 * 创建模板 (从工作流版本)
 */
export const useCreateTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CreateTemplateCatalogDto) => {
            const res = await apiClient.post<TemplateCatalogDto>(BASE, dto);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: templateKeys.all });
        },
    });
};

/**
 * 更新模板信息
 */
export const useUpdateTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, dto }: { id: string; dto: UpdateTemplateCatalogDto }) => {
            const res = await apiClient.put<TemplateCatalogDto>(`${BASE}/${id}`, dto);
            return res.data;
        },
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: templateKeys.all });
            qc.invalidateQueries({ queryKey: templateKeys.detail(id) });
        },
    });
};

/**
 * 发布模板
 */
export const usePublishTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<TemplateCatalogDto>(`${BASE}/${id}/publish`);
            return res.data;
        },
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: templateKeys.all });
            qc.invalidateQueries({ queryKey: templateKeys.detail(id) });
        },
    });
};

/**
 * 归档模板
 */
export const useArchiveTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.post<TemplateCatalogDto>(`${BASE}/${id}/archive`);
            return res.data;
        },
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: templateKeys.all });
            qc.invalidateQueries({ queryKey: templateKeys.detail(id) });
        },
    });
};

/**
 * 删除模板
 */
export const useDeleteTemplate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`${BASE}/${id}`);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: templateKeys.all });
        },
    });
};

/**
 * 复制模板到我的工作空间
 */
export const useCopyTemplateToWorkspace = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (dto: CopyTemplateDto) => {
            // Returns WorkflowDefinitionDto theoretically
            const res = await apiClient.post<any>(`${BASE}/copy`, dto);
            return res.data;
        },
        onSuccess: () => {
            // Invalidate workflow definitions because a new one is created
            qc.invalidateQueries({ queryKey: ['workflow-definitions'] });
        },
    });
};
