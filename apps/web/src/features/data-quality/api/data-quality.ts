import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';

export interface DataQualityAggregation {
    overallScore: number;
    grade: 'A' | 'B' | 'C' | 'D';
    dimensions: {
        completeness: number;
        timeliness: number;
        consistency: number;
        anomalyStability: number;
    };
    domainBreakdown: Array<{
        domain: string;
        score: number;
        grade: 'A' | 'B' | 'C' | 'D';
        datasetCount: number;
        latestFetchAt: string | null;
    }>;
    trend: Array<{
        date: string;
        score: number;
        fetchCount: number;
        errorCount: number;
    }>;
    activeConnectorCount: number;
    fetchSuccessRate: number;
    generatedAt: string;
}

export interface DataQualityQuery {
    domain?: string;
    startDate?: string;
    endDate?: string;
    days?: number;
}

export const useDataQuality = (query?: DataQualityQuery) => {
    return useQuery<DataQualityAggregation>({
        queryKey: ['data-quality', query],
        queryFn: async () => {
            const res = await apiClient.get<DataQualityAggregation>(
                '/execution-analytics/data-quality',
                { params: query },
            );
            return res.data;
        },
        refetchInterval: 60_000,
    });
};
