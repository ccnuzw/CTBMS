import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { apiClient } from '../../../api/client';
import {
    CreateMarketIntelDto,
    UpdateMarketIntelDto,
    MarketIntelResponse,
    MarketIntelQuery,
    MarketIntelStats,
    LeaderboardEntry,
    AnalyzeContentDto,
    AIAnalysisResult,
    ResearchReportResponse,
} from '@packages/types';

// 分页响应类型（内部使用，不导出 — knowledge-hooks.ts 已导出同名类型）
interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// =============================================
// 情报列表查询
// =============================================

export const useMarketIntels = (query?: Partial<MarketIntelQuery>) => {
    return useQuery<PaginatedResponse<MarketIntelResponse>>({
        queryKey: ['market-intels', query],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (query) {
                Object.entries(query).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        if (value instanceof Date) {
                            params.append(key, value.toISOString());
                        } else if (Array.isArray(value)) {
                            value.forEach((item) => params.append(key, String(item)));
                        } else {
                            params.append(key, String(value));
                        }
                    }
                });
            }
            const res = await apiClient.get<PaginatedResponse<MarketIntelResponse>>(
                `/market-intel?${params.toString()}`,
            );
            return res.data;
        },
    });
};

// =============================================
// 情报详情查询
// =============================================

export const useMarketIntel = (id: string) => {
    return useQuery<MarketIntelResponse>({
        queryKey: ['market-intels', id],
        queryFn: async () => {
            const res = await apiClient.get<MarketIntelResponse>(`/market-intel/${id}`);
            return res.data;
        },
        enabled: !!id,
    });
};

// =============================================
// 创建情报
// =============================================

export const useCreateMarketIntel = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateMarketIntelDto) => {
            const res = await apiClient.post<MarketIntelResponse>('/market-intel', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
            queryClient.invalidateQueries({ queryKey: ['market-intel-stats'] });
        },
    });
};

// =============================================
// 更新情报
// =============================================

export const useUpdateMarketIntel = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateMarketIntelDto }) => {
            const res = await apiClient.put<MarketIntelResponse>(`/market-intel/${id}`, data);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
            queryClient.invalidateQueries({ queryKey: ['market-intels', variables.id] });
        },
    });
};

// =============================================
// 删除情报
// =============================================

export const useDeleteMarketIntel = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await apiClient.delete(`/market-intel/${id}`);
            return res.data;
        },
        onSuccess: () => {
            message.success('删除成功');
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
        },
    });
};

export const useUpdateMarketIntelTags = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
            const res = await apiClient.patch(`/market-intel/${id}/tags`, { tags });
            return res.data;
        },
        onSuccess: () => {
            message.success('标签更新成功');
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
        },
    });
};

export const useBatchDeleteMarketIntel = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: string[]) => {
            const res = await apiClient.post('/market-intel/documents/batch-delete', { ids });
            return res.data;
        },
        onSuccess: () => {
            message.success('批量删除成功');
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
        },
    });
};

export const useBatchUpdateTags = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: { ids: string[]; addTags: string[]; removeTags: string[] }) => {
            const res = await apiClient.post('/market-intel/documents/batch-tags', params);
            return res.data;
        },
        onSuccess: (data) => {
            message.success(`已为 ${data.updatedCount} 个项目更新标签`);
            queryClient.invalidateQueries({ queryKey: ['market-intels'] });
        },
        onError: () => {
            message.error('标签更新失败');
        },
    });
};

// =============================================
// 统计数据
// =============================================

export const useMarketIntelStats = () => {
    return useQuery<MarketIntelStats>({
        queryKey: ['market-intel-stats'],
        queryFn: async () => {
            const res = await apiClient.get<MarketIntelStats>('/market-intel/stats');
            return res.data;
        },
        refetchInterval: 30000, // 每 30 秒刷新
    });
};

export const useDocumentStats = (days = 30) => {
    return useQuery({
        queryKey: ['document-stats', days],
        queryFn: async () => {
            const res = await apiClient.get('/market-intel/documents/stats', { params: { days } });
            return res.data;
        },
    });
};

// =============================================
// 排行榜
// =============================================

export const useLeaderboard = (
    limit = 10,
    timeframe: 'day' | 'week' | 'month' | 'year' = 'month',
) => {
    return useQuery<LeaderboardEntry[]>({
        queryKey: ['market-intel-leaderboard', limit, timeframe],
        queryFn: async () => {
            const res = await apiClient.get<LeaderboardEntry[]>(
                `/market-intel/leaderboard?limit=${limit}&timeframe=${timeframe}`,
            );
            return res.data;
        },
    });
};

// =============================================
// AI 分析
// =============================================

export const useAnalyzeContent = () => {
    return useMutation({
        mutationFn: async (data: AnalyzeContentDto) => {
            const res = await apiClient.post<AIAnalysisResult>('/market-intel/analyze', data);
            return res.data;
        },
    });
};

export const useGenerateInsight = () => {
    return useMutation({
        mutationFn: async (data: { content: string }) => {
            const res = await apiClient.post<{ summary: string }>('/market-intel/generate-insight', data);
            return res.data;
        },
    });
};

// AI 连接测试结果
interface AITestResult {
    success: boolean;
    message: string;
    apiUrl?: string;
    modelId?: string;
    response?: string;
    error?: string;
}

export const useTestAI = () => {
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.get<AITestResult>('/market-intel/test-ai');
            return res.data;
        },
    });
};

// =============================================
// 文档升级为研报 (Promote to Report)
// =============================================

interface PromoteToReportRequest {
    intelId: string;
    reportType: string;
    triggerDeepAnalysis?: boolean;
}

interface PromoteToReportResponse {
    success: boolean;
    reportId: string;
    report: ResearchReportResponse;
}

export const usePromoteToReport = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: PromoteToReportRequest) => {
            const res = await apiClient.post<PromoteToReportResponse>(
                `/market-intel/${data.intelId}/promote-to-report`,
                {
                    reportType: data.reportType,
                    triggerDeepAnalysis: data.triggerDeepAnalysis ?? true,
                },
            );
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['research-reports'] });
            queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
            queryClient.invalidateQueries({ queryKey: ['market-intels', variables.intelId] });
        },
    });
};
