import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';

// =============================================
// 情报关联分析
// =============================================

export interface RelatedIntelResponse {
    id: string;
    title: string;
    contentType: string;
    relationType: 'TIME' | 'COMMODITY' | 'REGION' | 'CHAIN' | 'CITATION' | 'PRICE_FLUCTUATION';
    similarity?: number;
    createdAt: string;
}

export const useRelatedIntel = (intelId?: string) => {
    return useQuery<RelatedIntelResponse[]>({
        queryKey: ['related-intel', intelId],
        queryFn: async () => {
            if (!intelId) return [];
            const res = await apiClient.get<RelatedIntelResponse[]>(
                `/market-intel/${intelId}/related`,
            );
            return res.data;
        },
        enabled: !!intelId,
    });
};
