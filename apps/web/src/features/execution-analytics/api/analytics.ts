import { useQuery } from '@tanstack/react-query';
import type { ExecutionAnalyticsDto } from '@packages/types';
import { apiClient } from '../../../api/client';

export interface AnalyticsQuery {
  workflowDefinitionId?: string;
  startDate?: string;
  endDate?: string;
  granularity?: string;
}

export const useExecutionAnalytics = (query?: AnalyticsQuery) => {
  return useQuery<ExecutionAnalyticsDto>({
    queryKey: ['execution-analytics', query],
    queryFn: async () => {
      const res = await apiClient.get<ExecutionAnalyticsDto>('/execution-analytics', {
        params: query,
      });
      return res.data;
    },
  });
};
