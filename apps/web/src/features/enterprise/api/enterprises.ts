import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
    CreateEnterpriseDto,
    UpdateEnterpriseDto,
    EnterpriseResponse,
    EnterpriseListResponse,
    EnterpriseQueryParams,
    CreateContactDto,
    ContactResponse,
    CreateBankAccountDto,
    BankAccountResponse,
} from '@packages/types';

// ============= Enterprise Hooks =============

/**
 * 获取企业列表（分页）
 */
export const useEnterprises = (params?: Partial<EnterpriseQueryParams>) => {
    return useQuery<EnterpriseListResponse>({
        queryKey: ['enterprises', params],
        queryFn: async () => {
            const res = await apiClient.get<EnterpriseListResponse>('/enterprises', { params });
            return res.data;
        },
    });
};

/**
 * 获取企业树形结构（集团-子公司）
 */
export const useEnterpriseTree = () => {
    return useQuery<EnterpriseResponse[]>({
        queryKey: ['enterprises', 'tree'],
        queryFn: async () => {
            const res = await apiClient.get<EnterpriseResponse[]>('/enterprises/tree');
            return res.data;
        },
    });
};

/**
 * 获取单个企业详情（含联系人、银行账户）
 */
export const useEnterprise = (id: string | null, enabled = true) => {
    return useQuery<EnterpriseResponse>({
        queryKey: ['enterprises', id],
        queryFn: async () => {
            const res = await apiClient.get<EnterpriseResponse>(`/enterprises/${id}`);
            return res.data;
        },
        enabled: enabled && !!id,
    });
};

/**
 * 创建企业
 */
export const useCreateEnterprise = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateEnterpriseDto) => {
            const res = await apiClient.post<EnterpriseResponse>('/enterprises', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['enterprises'] });
        },
    });
};

/**
 * 更新企业
 */
export const useUpdateEnterprise = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateEnterpriseDto }) => {
            const res = await apiClient.patch<EnterpriseResponse>(`/enterprises/${id}`, data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['enterprises'] });
            queryClient.invalidateQueries({ queryKey: ['enterprises', variables.id] });
        },
    });
};

/**
 * 删除企业
 */
export const useDeleteEnterprise = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete<EnterpriseResponse>(`/enterprises/${id}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['enterprises'] });
        },
    });
};

// ============= Contact Hooks =============

/**
 * 添加联系人
 */
export const useAddContact = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ enterpriseId, data }: { enterpriseId: string; data: CreateContactDto }) => {
            const res = await apiClient.post<ContactResponse>(`/enterprises/${enterpriseId}/contacts`, data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['enterprises', variables.enterpriseId] });
        },
    });
};

/**
 * 删除联系人
 */
export const useRemoveContact = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ contactId }: { contactId: string; enterpriseId: string }) => {
            const res = await apiClient.delete<ContactResponse>(`/enterprises/contacts/${contactId}`);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['enterprises', variables.enterpriseId] });
        },
    });
};

// ============= BankAccount Hooks =============

/**
 * 添加银行账户
 */
export const useAddBankAccount = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ enterpriseId, data }: { enterpriseId: string; data: CreateBankAccountDto }) => {
            const res = await apiClient.post<BankAccountResponse>(`/enterprises/${enterpriseId}/bank-accounts`, data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['enterprises', variables.enterpriseId] });
        },
    });
};

/**
 * 删除银行账户
 */
export const useRemoveBankAccount = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ accountId }: { accountId: string; enterpriseId: string }) => {
            const res = await apiClient.delete<BankAccountResponse>(`/enterprises/bank-accounts/${accountId}`);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['enterprises', variables.enterpriseId] });
        },
    });
};
