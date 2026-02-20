import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import {
  KNOWLEDGE_PERIOD_LABELS,
  KNOWLEDGE_RELATION_LABELS,
  KNOWLEDGE_SENTIMENT_LABELS,
  KNOWLEDGE_SOURCE_LABELS,
  KNOWLEDGE_STATUS_META,
  KNOWLEDGE_TYPE_LABELS,
} from '../constants/knowledge-labels';

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type KnowledgeItem = {
  id: string;
  type: string;
  title: string;
  contentPlain: string;
  contentRich?: string | null;
  contentFormat?: string | null;
  sourceType?: string | null;
  publishAt?: string | null;
  periodType: string;
  periodKey?: string | null;
  status: string;
  authorId: string;
  viewCount: number;
  downloadCount: number;
  typeLabel?: string;
  statusLabel?: string;
  statusColor?: string;
  periodTypeLabel?: string;
  sourceTypeLabel?: string;
  commodities: string[];
  region: string[];
  analysis?: {
    summary?: string | null;
    tags?: string[];
    keyPoints?: unknown;
    prediction?: unknown;
    dataPoints?: unknown;
    reportType?: string | null;
    reportPeriod?: string | null;
  } | null;
  attachments?: Array<{ id: string; filename: string }>;
  createdAt?: string;
  updatedAt?: string;
};

export type KnowledgeRelation = {
  id: string;
  relationType: string;
  weight: number;
  evidence?: string | null;
  relationTypeLabel?: string;
  toKnowledge?: { id: string; title: string; type: string; publishAt?: string | null };
  fromKnowledge?: { id: string; title: string; type: string; publishAt?: string | null };
};

export type KnowledgeRelationsResponse = {
  outgoing: KnowledgeRelation[];
  incoming: KnowledgeRelation[];
};

export type KnowledgeRelationQuery = {
  types?: string[];
  minWeight?: number;
  limit?: number;
  direction?: 'incoming' | 'outgoing' | 'both';
};

export type WeeklyOverviewResponse = {
  periodKey: string;
  found: boolean;
  metrics: {
    priceMoveCount?: number;
    eventCount?: number;
    riskLevel?: string;
    sentiment?: string;
    confidence?: number;
    riskLevelLabel?: string;
    sentimentLabel?: string;
  } | null;
  sourceStats: {
    totalSources: number;
    byType: Record<string, number>;
  };
  topSources?: Array<{
    id: string;
    type: string;
    title: string;
    publishAt?: string | null;
    typeLabel?: string;
  }>;
};

export type TopicEvolutionResponse = {
  commodity: string | null;
  weeks: number;
  trend: Array<{
    id: string;
    periodKey?: string | null;
    title: string;
    summary: string;
    sentiment: string | null;
    sentimentLabel?: string;
    riskLevel: string | null;
    riskLevelLabel?: string;
    confidence: number | null;
    publishAt?: string | null;
  }>;
};

export type KnowledgeListResponse = {
  data: KnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type KnowledgeListQuery = {
  type?: string;
  status?: string;
  periodType?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

const toParams = (query?: KnowledgeListQuery) => {
  const params = new URLSearchParams();
  if (!query) return params;

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.append(key, String(value));
  });
  return params;
};

const RISK_LABEL_MAP: Record<string, string> = {
  HIGH: '高风险',
  MEDIUM: '中风险',
  LOW: '低风险',
};

const mapKnowledgeItem = (item: KnowledgeItem): KnowledgeItem => ({
  ...item,
  typeLabel: KNOWLEDGE_TYPE_LABELS[item.type] || item.type,
  statusLabel: KNOWLEDGE_STATUS_META[item.status]?.label || item.status,
  statusColor: KNOWLEDGE_STATUS_META[item.status]?.color || 'default',
  periodTypeLabel: KNOWLEDGE_PERIOD_LABELS[item.periodType] || item.periodType,
  sourceTypeLabel: item.sourceType
    ? KNOWLEDGE_SOURCE_LABELS[item.sourceType] || item.sourceType
    : undefined,
});

const mapKnowledgeRelation = (relation: KnowledgeRelation): KnowledgeRelation => ({
  ...relation,
  relationTypeLabel: KNOWLEDGE_RELATION_LABELS[relation.relationType] || relation.relationType,
});

export const useKnowledgeItems = (query?: KnowledgeListQuery) => {
  return useQuery<KnowledgeListResponse>({
    queryKey: ['knowledge', 'list', query],
    queryFn: async () => {
      const params = toParams(query);
      const res = await apiClient.get<KnowledgeListResponse>(
        `/knowledge/items?${params.toString()}`,
      );
      return {
        ...res.data,
        data: res.data.data.map(mapKnowledgeItem),
      };
    },
  });
};

export const useKnowledgeItem = (id?: string) => {
  return useQuery<KnowledgeItem>({
    queryKey: ['knowledge', id],
    queryFn: async () => {
      const res = await apiClient.get<KnowledgeItem>(`/knowledge/items/${id}`);
      return mapKnowledgeItem(res.data);
    },
    enabled: !!id,
  });
};

export const useReanalyzeKnowledge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      triggerDeepAnalysis = true,
    }: {
      id: string;
      triggerDeepAnalysis?: boolean;
    }) => {
      const res = await apiClient.post(`/knowledge/items/${id}/reanalyze`, { triggerDeepAnalysis });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', variables.id] });
    },
  });
};

export const useKnowledgeRelations = (id?: string, query?: KnowledgeRelationQuery) => {
  return useQuery<KnowledgeRelationsResponse>({
    queryKey: ['knowledge', 'relations', id, query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query?.types?.length) params.set('types', query.types.join(','));
      if (query?.minWeight !== undefined) params.set('minWeight', String(query.minWeight));
      if (query?.limit !== undefined) params.set('limit', String(query.limit));
      if (query?.direction) params.set('direction', query.direction);

      const res = await apiClient.get<KnowledgeRelationsResponse>(
        `/knowledge/items/${id}/relations${params.toString() ? `?${params.toString()}` : ''}`,
      );
      return {
        outgoing: res.data.outgoing.map(mapKnowledgeRelation),
        incoming: res.data.incoming.map(mapKnowledgeRelation),
      };
    },
    enabled: !!id,
  });
};

export const useResolveLegacyKnowledge = (source?: 'intel' | 'report', id?: string) => {
  return useQuery<{ id: string; type: string; title: string }>({
    queryKey: ['knowledge', 'legacy-resolve', source, id],
    queryFn: async () => {
      const res = await apiClient.get<{ id: string; type: string; title: string }>(
        `/knowledge/legacy/${source}/${id}`,
      );
      return res.data;
    },
    enabled: !!source && !!id,
    retry: false,
  });
};

export const useGenerateWeeklyRollup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload?: {
      targetDate?: string;
      authorId?: string;
      triggerAnalysis?: boolean;
    }) => {
      const res = await apiClient.post('/knowledge/admin/weekly-rollup', payload || {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'analytics'] });
    },
  });
};

export const useWeeklyOverview = (periodKey?: string) => {
  return useQuery<WeeklyOverviewResponse>({
    queryKey: ['knowledge', 'analytics', 'weekly-overview', periodKey],
    queryFn: async () => {
      const res = await apiClient.get<WeeklyOverviewResponse>(
        `/knowledge/analytics/weekly-overview${periodKey ? `?periodKey=${encodeURIComponent(periodKey)}` : ''}`,
      );
      return {
        ...res.data,
        metrics: res.data.metrics
          ? {
            ...res.data.metrics,
            riskLevelLabel: res.data.metrics.riskLevel
              ? RISK_LABEL_MAP[res.data.metrics.riskLevel] || res.data.metrics.riskLevel
              : undefined,
            sentimentLabel: res.data.metrics.sentiment
              ? KNOWLEDGE_SENTIMENT_LABELS[res.data.metrics.sentiment] ||
              res.data.metrics.sentiment
              : undefined,
          }
          : null,
        topSources: (res.data.topSources || []).map((source) => ({
          ...source,
          typeLabel: KNOWLEDGE_TYPE_LABELS[source.type] || source.type,
        })),
      };
    },
  });
};

export const useTopicEvolution = (query?: { commodity?: string; weeks?: number }) => {
  return useQuery<TopicEvolutionResponse>({
    queryKey: ['knowledge', 'analytics', 'topic-evolution', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query?.commodity) params.set('commodity', query.commodity);
      if (query?.weeks) params.set('weeks', String(query.weeks));
      const res = await apiClient.get<TopicEvolutionResponse>(
        `/knowledge/analytics/topic-evolution${params.toString() ? `?${params.toString()}` : ''}`,
      );
      return {
        ...res.data,
        trend: res.data.trend.map((item) => ({
          ...item,
          sentimentLabel: item.sentiment
            ? KNOWLEDGE_SENTIMENT_LABELS[item.sentiment] || item.sentiment
            : undefined,
          riskLevelLabel: item.riskLevel
            ? RISK_LABEL_MAP[item.riskLevel] || item.riskLevel
            : undefined,
        })),
      };
    },
  });
};

// ======== 报告提交 ========

export interface SubmitReportPayload {
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  title: string;
  contentPlain: string;
  contentRich?: string;
  commodities?: string[];
  region?: string[];
  authorId: string;
  taskId?: string;
  triggerAnalysis?: boolean;
}

export const useSubmitReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SubmitReportPayload) => {
      const res = await apiClient.post<KnowledgeItem>(
        '/knowledge/items/submit-report',
        payload,
      );
      return mapKnowledgeItem(res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'analytics'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
  });
};

export const useMyReports = (authorId?: string) => {
  return useQuery<PaginatedResponse<KnowledgeItem>>({
    queryKey: ['knowledge', 'my-reports', authorId],
    queryFn: async () => {
      if (!authorId) return { data: [], total: 0, page: 1, pageSize: 20 };
      const res = await apiClient.get<PaginatedResponse<KnowledgeItem>>('/knowledge/items', {
        params: {
          authorId,
          pageSize: 20,
        },
      });
      return {
        ...res.data,
        data: res.data.data.map(mapKnowledgeItem),
      };
    },
    enabled: !!authorId,
  });
};

export const useUpdateReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: SubmitReportPayload & { id: string }) => {
      const res = await apiClient.patch<KnowledgeItem>(
        `/knowledge/items/${id}/report`,
        payload,
      );
      return mapKnowledgeItem(res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'my-reports'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
  });
};

export const usePendingReviews = (query?: KnowledgeListQuery) => {
  return useQuery<PaginatedResponse<KnowledgeItem>>({
    queryKey: ['knowledge', 'pending-reviews', query],
    queryFn: async () => {
      const params = toParams(query);
      const res = await apiClient.get<PaginatedResponse<KnowledgeItem>>(
        `/knowledge/items/pending-review?${params.toString()}`
      );
      return {
        ...res.data,
        data: res.data.data.map(mapKnowledgeItem),
      };
    },
  });
};

export const useReviewReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      action: 'APPROVE' | 'REJECT';
      reviewerId: string;
      rejectReason?: string;
    }) => {
      const res = await apiClient.post<KnowledgeItem>(
        `/knowledge/items/${payload.id}/review`,
        {
          action: payload.action,
          reviewerId: payload.reviewerId,
          rejectReason: payload.rejectReason,
        },
      );
      return mapKnowledgeItem(res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'my-reports'] });
    },
  });
};

// =============================================
// 研报专用 Hooks（统一到 Knowledge 域）
// =============================================

export type ReportListQuery = {
  reportType?: string;
  status?: string;
  commodity?: string;
  region?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  title?: string;
  sourceType?: string;
  page?: number;
  pageSize?: number;
};

export type ReportStatsResponse = {
  total: number;
  totalViews: number;
  totalDownloads: number;
  byStatus: Record<string, number>;
  byReportType: Record<string, number>;
  topCommodities: Array<{ name: string; count: number }>;
  topRegions: Array<{ name: string; count: number }>;
  recent: Array<{
    id: string;
    title: string;
    sourceType: string | null;
    createdAt: string;
    viewCount: number;
    status: string;
  }>;
};

export interface CreateReportPayload {
  title: string;
  contentPlain: string;
  contentRich?: string;
  reportType?: string;
  reportPeriod?: string;
  publishAt?: string;
  sourceType?: string;
  commodities?: string[];
  region?: string[];
  authorId: string;
  summary?: string;
  keyPoints?: unknown;
  prediction?: unknown;
  dataPoints?: unknown;
  triggerAnalysis?: boolean;
}

export interface UpdateReportPayload {
  title?: string;
  contentPlain?: string;
  contentRich?: string;
  reportType?: string;
  reportPeriod?: string;
  publishAt?: string;
  sourceType?: string;
  commodities?: string[];
  region?: string[];
  summary?: string;
  keyPoints?: unknown;
  prediction?: unknown;
  dataPoints?: unknown;
}

/**
 * 查询研报列表
 */
export const useKnowledgeReports = (query?: ReportListQuery) => {
  return useQuery<PaginatedResponse<KnowledgeItem>>({
    queryKey: ['knowledge', 'reports', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params.append(key, String(value));
          }
        });
      }
      const res = await apiClient.get<PaginatedResponse<KnowledgeItem>>(
        `/knowledge/reports?${params.toString()}`,
      );
      return {
        ...res.data,
        data: res.data.data.map(mapKnowledgeItem),
      };
    },
  });
};

/**
 * 获取单个研报详情
 */
export const useKnowledgeReport = (id?: string) => {
  return useQuery<KnowledgeItem>({
    queryKey: ['knowledge', 'report', id],
    queryFn: async () => {
      const res = await apiClient.get<KnowledgeItem>(`/knowledge/reports/${id}`);
      return mapKnowledgeItem(res.data);
    },
    enabled: !!id,
  });
};

/**
 * 创建研报
 */
export const useCreateKnowledgeReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateReportPayload) => {
      const res = await apiClient.post<KnowledgeItem>('/knowledge/reports', payload);
      return mapKnowledgeItem(res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
    },
  });
};

/**
 * 更新研报
 */
export const useUpdateKnowledgeReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateReportPayload & { id: string }) => {
      const res = await apiClient.patch<KnowledgeItem>(`/knowledge/reports/${id}`, payload);
      return mapKnowledgeItem(res.data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'report', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
    },
  });
};

/**
 * 删除研报
 */
export const useDeleteKnowledgeReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/knowledge/reports/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
    },
  });
};

/**
 * 批量删除研报
 */
export const useBatchDeleteKnowledgeReports = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiClient.post('/knowledge/reports/batch-delete', { ids });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
    },
  });
};

/**
 * 研报统计
 */
export const useKnowledgeReportStats = (days?: number) => {
  return useQuery<ReportStatsResponse>({
    queryKey: ['knowledge', 'report-stats', days],
    queryFn: async () => {
      const params = days ? `?days=${days}` : '';
      const res = await apiClient.get<ReportStatsResponse>(`/knowledge/reports/stats${params}`);
      return res.data;
    },
  });
};

/**
 * 增加浏览次数
 */
export const useIncrementReportView = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post(`/knowledge/reports/${id}/view`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'report', id] });
    },
  });
};

/**
 * 增加下载次数
 */
export const useIncrementReportDownload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post(`/knowledge/reports/${id}/download`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'report', id] });
    },
  });
};

/**
 * 导出研报
 */
export const useExportKnowledgeReports = () => {
  return useMutation({
    mutationFn: async (body: { ids?: string[]; query?: ReportListQuery }) => {
      const res = await apiClient.post('/knowledge/reports/export', body, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `reports-export-${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    },
  });
};

/**
 * 审核研报
 */
export const useReviewKnowledgeReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      action: 'APPROVE' | 'REJECT';
      reviewerId: string;
      rejectReason?: string;
    }) => {
      const res = await apiClient.post<KnowledgeItem>(
        `/knowledge/reports/${payload.id}/review`,
        {
          action: payload.action,
          reviewerId: payload.reviewerId,
          rejectReason: payload.rejectReason,
        },
      );
      return mapKnowledgeItem(res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge', 'list'] });
    },
  });
};
