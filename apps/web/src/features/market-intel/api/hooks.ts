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
  CreateResearchReportDto,
  UpdateResearchReportDto,
  ResearchReportResponse,
  ResearchReportQuery,
  CreateManualResearchReportDto,
} from '@packages/types';

// 分页响应类型
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, string> = {
  STATION_ORIGIN: 'STATION',
  STATION_DEST: 'STATION',
};

const normalizePriceSubTypeCode = (code: string) => LEGACY_PRICE_SUBTYPE_TO_CANONICAL[code] || code;

const normalizePriceSubTypeList = (codes?: string[]) =>
  Array.from(new Set((codes || []).map((code) => normalizePriceSubTypeCode(code))));

// =============================================
// 情报流查询 (B类聚合)
// =============================================

export interface IntelligenceFeedQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypeIds?: string[];
  insightTypeIds?: string[];
  sentiments?: string[];
  commodities?: string[];
  keyword?: string;
  limit?: number;
  sourceTypes?: string[];
  regionCodes?: string[];
  minScore?: number;
  maxScore?: number;
  processingStatus?: string[];
  qualityLevel?: string[];
  contentTypes?: string[];
}

export const useIntelligenceFeed = (query?: Partial<IntelligenceFeedQuery>) => {
  return useQuery<any[]>({
    queryKey: ['intelligence-feed', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              params.append(key, value.join(','));
            } else if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<any[]>(`/market-intel/feed?${params.toString()}`);
      return res.data;
    },
  });
};

// =============================================
// 仪表盘聚合统计 (Real-time Dashboard)
// =============================================

export interface IntelDashboardStats {
  overview: {
    total: number;
    today: number;
    highValue: number;
    pending: number;
    confirmed: number;
    avgQuality: number;
  };
  trend: Array<{ date: string; daily: number; research: number; policy: number }>;
  sourceDistribution: Array<{ name: string; value: number }>;
  commodityHeat: Array<{ name: string; count: number; change: number }>;
  regionHeat: Array<{ region: string; count: number }>;
}

export const useIntelDashboardStats = (query?: Partial<IntelligenceFeedQuery>) => {
  return useQuery<IntelDashboardStats>({
    queryKey: ['intel-dashboard-stats', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              params.append(key, value.join(','));
            } else if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<IntelDashboardStats>(
        `/market-intel/dashboard/stats?${params.toString()}`,
      );
      return res.data;
    },
  });
};

// =============================================
// AI 智能简报
// =============================================

export const useIntelSmartBriefing = () => {
  return useMutation({
    mutationFn: async (query?: Partial<IntelligenceFeedQuery>) => {
      // Filter logic identical to feed query
      const payload: any = {};
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            payload[key] = value;
          }
        });
      }
      const res = await apiClient.post<{ summary: string }>(
        '/market-intel/dashboard/briefing',
        payload,
      );
      return res.data;
    },
  });
};

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
// C类增强：研究报告 hooks
// =============================================

export const useResearchReports = (query?: Partial<ResearchReportQuery>) => {
  return useQuery<PaginatedResponse<ResearchReportResponse>>({
    queryKey: ['research-reports', query],
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
      const res = await apiClient.get<PaginatedResponse<ResearchReportResponse>>(
        `/market-intel/research-reports?${params.toString()}`,
      );
      return res.data;
    },
  });
};

export const useResearchReport = (id: string) => {
  return useQuery<ResearchReportResponse>({
    queryKey: ['research-reports', id],
    queryFn: async () => {
      const res = await apiClient.get<ResearchReportResponse>(
        `/market-intel/research-reports/${id}`,
      );
      return res.data;
    },
    enabled: !!id,
  });
};

export const useResearchReportByIntelId = (intelId: string) => {
  return useQuery<ResearchReportResponse | null>({
    queryKey: ['research-reports-by-intel', intelId],
    queryFn: async () => {
      const res = await apiClient.get<ResearchReportResponse | null>(
        `/market-intel/research-reports/by-intel/${intelId}`,
      );
      return res.data || null;
    },
    enabled: !!intelId,
  });
};

export const useCreateResearchReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateResearchReportDto) => {
      const res = await apiClient.post<ResearchReportResponse>(
        '/market-intel/research-reports',
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useCreateManualResearchReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateManualResearchReportDto) => {
      const res = await apiClient.post<ResearchReportResponse>(
        '/market-intel/research-reports/manual',
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useUpdateResearchReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateResearchReportDto }) => {
      const res = await apiClient.put<ResearchReportResponse>(
        `/market-intel/research-reports/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-reports', variables.id] });
    },
  });
};

export const useDeleteResearchReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/market-intel/research-reports/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useResearchReportStats = (options?: { days?: number }) => {
  return useQuery<any>({
    queryKey: ['research-report-stats', options?.days],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.days) {
        params.append('days', String(options.days));
      }
      const res = await apiClient.get<any>(
        `/market-intel/research-reports/stats?${params.toString()}`,
      );
      return res.data;
    },
  });
};

export const useIncrementViewCount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<any>(`/market-intel/research-reports/${id}/view`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['research-reports', id] });
    },
  });
};

export const useIncrementDownloadCount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<any>(`/market-intel/research-reports/${id}/download`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['research-reports', id] });
    },
  });
};

export const useUpdateReviewStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      reviewerId,
    }: {
      id: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      reviewerId: string;
    }) => {
      const res = await apiClient.put<any>(`/market-intel/research-reports/${id}/review`, {
        status,
        reviewerId,
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-reports', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useBatchDeleteResearchReports = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiClient.post('/market-intel/research-reports/batch-delete', { ids });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useBatchReviewResearchReports = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      status,
      reviewerId,
    }: {
      ids: string[];
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
      reviewerId: string;
    }) => {
      const res = await apiClient.post('/market-intel/research-reports/batch-review', {
        ids,
        status,
        reviewerId,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-reports'] });
      queryClient.invalidateQueries({ queryKey: ['research-report-stats'] });
    },
  });
};

export const useExportResearchReports = () => {
  return useMutation({
    mutationFn: async ({ ids, query }: { ids?: string[]; query?: any }) => {
      const res = await apiClient.post(
        '/market-intel/research-reports/export',
        { ids, query },
        {
          responseType: 'blob',
        },
      );

      // 自动触发下载
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `research-reports-export-${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      return true;
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

// =============================================
// A类：价格数据
// =============================================

import {
  CreatePriceDataDto,
  PriceDataResponse,
  PriceDataQuery,
  CreateIntelTaskDto,
  UpdateIntelTaskDto,
  IntelTaskResponse,
  IntelTaskQuery,
  IntelTaskStatus,
} from '@packages/types';

// 价格趋势数据
interface PriceTrendPoint {
  date: Date;
  price: number;
  change: number | null;
}

// 价格热力地图数据
interface PriceHeatmapPoint {
  location: string;
  region: string[];
  price: number;
  change: number | null;
}

interface UsePriceDataOptions {
  enabled?: boolean;
}

type PriceDataQueryWithQuality = Partial<PriceDataQuery> & { qualityTags?: string[] };

export const usePriceData = (query?: PriceDataQueryWithQuality, options?: UsePriceDataOptions) => {
  return useQuery<PaginatedResponse<PriceDataResponse>>({
    queryKey: ['price-data', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      const normalizedSubTypes = normalizePriceSubTypeList(
        Array.isArray(query?.subTypes) ? query.subTypes.map((item) => String(item)) : [],
      );
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (key === 'subTypes' && normalizedSubTypes.length > 0) {
              params.append(key, normalizedSubTypes.join(','));
              return;
            }
            // 日期对象转换为 ISO 字符串
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else if (Array.isArray(value)) {
              if (value.length > 0) {
                params.append(key, value.join(','));
              }
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<PaginatedResponse<PriceDataResponse>>(
        `/market-intel/price-data?${params.toString()}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? true,
    keepPreviousData: true,
  });
};

interface PriceContinuityHealthQuery extends Partial<PriceDataQuery> {
  days?: number;
}

interface PriceContinuityHealthPoint {
  pointId: string;
  pointName: string;
  pointType: string;
  regionLabel?: string | null;
  coverageRate: number;
  timelinessScore: number;
  anomalyRate: number;
  lateRate: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  latestDate: Date | null;
  recordCount: number;
  missingDays: number;
}

interface PriceContinuityHealthResponse {
  summary: {
    overallScore: number;
    coverageRate: number;
    anomalyRate: number;
    lateRate: number;
    expectedDays: number;
    pointCount: number;
    healthyPoints: number;
    riskPoints: number;
    startDate: Date | null;
    endDate: Date | null;
  };
  points: PriceContinuityHealthPoint[];
}

export const usePriceContinuityHealth = (
  query?: PriceContinuityHealthQuery,
  options?: UsePriceDataOptions,
) => {
  return useQuery<PriceContinuityHealthResponse>({
    queryKey: ['price-continuity-health', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else if (Array.isArray(value)) {
              if (value.length > 0) {
                params.append(key, value.join(','));
              }
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<PriceContinuityHealthResponse>(
        `/market-intel/price-data/continuity-health?${params.toString()}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? true,
  });
};

type AlertRuleType =
  | 'DAY_CHANGE_ABS'
  | 'DAY_CHANGE_PCT'
  | 'DEVIATION_FROM_MEAN_PCT'
  | 'CONTINUOUS_DAYS';
type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';

export interface MarketAlertRule {
  id: string;
  name: string;
  type: AlertRuleType;
  threshold?: number;
  days?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
  severity: AlertSeverity;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  status: AlertStatus;
  note?: string;
  pointId: string;
  pointName: string;
  pointType: string;
  regionLabel: string | null;
  commodity: string;
  date: Date;
  value: number;
  threshold: number;
  message: string;
  updatedAt?: Date;
}

interface AlertListResponse {
  total: number;
  data: MarketAlert[];
}

export interface AlertStatusLog {
  id: string;
  instanceId: string;
  action: 'CREATE' | 'UPDATE_HIT' | 'ACK' | 'CLOSE' | 'REOPEN' | 'AUTO_CLOSE';
  fromStatus?: AlertStatus | null;
  toStatus: AlertStatus;
  operator: string;
  note?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface EvaluateAlertsResponse {
  evaluatedAt: Date;
  total: number;
  created: number;
  updated: number;
  closed?: number;
}

interface AlertQuery extends Partial<PriceDataQuery> {
  days?: number;
  severity?: AlertSeverity;
  status?: AlertStatus;
  limit?: number;
  refresh?: boolean;
}

export const useAlertRules = () => {
  return useQuery<MarketAlertRule[]>({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const res = await apiClient.get<MarketAlertRule[]>('/market-intel/alerts/rules');
      return res.data;
    },
  });
};

export const useCreateAlertRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<MarketAlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
      const res = await apiClient.post<MarketAlertRule[]>('/market-intel/alerts/rules', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
};

export const useUpdateAlertRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Omit<MarketAlertRule, 'id' | 'createdAt' | 'updatedAt'>>;
    }) => {
      const res = await apiClient.put<MarketAlertRule[]>(
        `/market-intel/alerts/rules/${id}`,
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
};

export const useDeleteAlertRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<{ success: boolean }>(`/market-intel/alerts/rules/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
};

export const useAlerts = (query?: AlertQuery) => {
  return useQuery<AlertListResponse>({
    queryKey: ['alerts', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else if (Array.isArray(value)) {
              if (value.length > 0) {
                params.append(key, value.join(','));
              }
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<AlertListResponse>(
        `/market-intel/alerts?${params.toString()}`,
      );
      return res.data;
    },
  });
};

export const useEvaluateAlerts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (query?: Omit<AlertQuery, 'status' | 'refresh'>) => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else if (Array.isArray(value)) {
              if (value.length > 0) {
                params.append(key, value.join(','));
              }
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const suffix = params.toString();
      const res = await apiClient.post<EvaluateAlertsResponse>(
        `/market-intel/alerts/evaluate${suffix ? `?${suffix}` : ''}`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
};

export const useAlertLogs = (id?: string) => {
  return useQuery<AlertStatusLog[]>({
    queryKey: ['alerts', 'logs', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<AlertStatusLog[]>(`/market-intel/alerts/${id}/logs`);
      return res.data;
    },
  });
};

export const useUpdateAlertStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      note,
      reason,
      operator,
    }: {
      id: string;
      status: AlertStatus;
      note?: string;
      reason?: string;
      operator?: string;
    }) => {
      const res = await apiClient.patch(`/market-intel/alerts/${id}/status`, {
        status,
        note,
        reason,
        operator,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts', 'logs'] });
    },
  });
};

export const useCreatePriceData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePriceDataDto) => {
      const res = await apiClient.post<PriceDataResponse>('/market-intel/price-data', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-data'] });
    },
  });
};

export const usePriceTrend = (commodity: string, location: string, days = 30) => {
  return useQuery<PriceTrendPoint[]>({
    queryKey: ['price-trend', commodity, location, days],
    queryFn: async () => {
      const res = await apiClient.get<PriceTrendPoint[]>(
        `/market-intel/price-data/trend?commodity=${encodeURIComponent(commodity)}&location=${encodeURIComponent(location)}&days=${days}`,
      );
      return res.data;
    },
    enabled: !!commodity && !!location,
  });
};

export const usePriceHeatmap = (commodity: string, date?: string) => {
  return useQuery<PriceHeatmapPoint[]>({
    queryKey: ['price-heatmap', commodity, date],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('commodity', commodity);
      if (date) params.append('date', date);
      const res = await apiClient.get<PriceHeatmapPoint[]>(
        `/market-intel/price-data/heatmap?${params.toString()}`,
      );
      return res.data;
    },
    enabled: !!commodity,
  });
};

// =============================================
// 新增：按采集点查询时间序列
// =============================================

interface CollectionPointPriceData {
  collectionPoint: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    type: string;
    regionCode: string | null;
  } | null;
  data: Array<{
    id: string;
    date: Date;
    commodity: string;
    price: number;
    change: number | null;
    sourceType: string;
    subType: string;
    note: string | null;
  }>;
  summary: {
    count: number;
    minPrice: number | null;
    maxPrice: number | null;
    avgPrice: number | null;
  };
}

export const usePriceByCollectionPoint = (
  collectionPointId: string,
  commodity?: string,
  daysOrParams:
    | number
    | {
        startDate?: Date;
        endDate?: Date;
        days?: number;
        subTypes?: string[];
        reviewScope?: string;
        sourceScope?: string;
      } = 30,
) => {
  const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
  const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
  return useQuery<CollectionPointPriceData>({
    queryKey: [
      'price-by-collection-point',
      collectionPointId,
      commodity,
      paramsValue?.days,
      paramsValue?.startDate?.toISOString(),
      paramsValue?.endDate?.toISOString(),
      normalizedSubTypes.join(','),
      paramsValue?.reviewScope,
      paramsValue?.sourceScope,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (commodity) params.append('commodity', commodity);
      if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
      if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
      if (paramsValue?.days) params.append('days', String(paramsValue.days));
      if (normalizedSubTypes.length > 0) {
        params.append('subTypes', normalizedSubTypes.join(','));
      }
      if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
      if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
      const res = await apiClient.get<CollectionPointPriceData>(
        `/market-intel/price-data/by-collection-point/${collectionPointId}?${params.toString()}`,
      );
      return res.data;
    },
    enabled: !!collectionPointId,
  });
};

// =============================================
// 新增：按行政区划查询聚合
// =============================================

interface RegionPriceData {
  region: {
    code: string;
    name: string;
    level: string;
    shortName: string | null;
  } | null;
  data: Array<{
    id: string;
    date: Date;
    location: string;
    commodity: string;
    price: number;
    change: number | null;
    sourceType: string;
    collectionPoint: { code: string; name: string; type: string } | null;
  }>;
  trend: Array<{
    date: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    count: number;
  }>;
  summary: {
    totalRecords: number;
    uniqueLocations: number;
  };
}

export const usePriceByRegion = (
  regionCode: string,
  commodity?: string,
  daysOrParams:
    | number
    | {
        startDate?: Date;
        endDate?: Date;
        days?: number;
        subTypes?: string[];
        reviewScope?: string;
        sourceScope?: string;
        includeData?: boolean;
      } = 30,
) => {
  const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
  const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
  return useQuery<RegionPriceData>({
    queryKey: [
      'price-by-region',
      regionCode,
      commodity,
      paramsValue?.days,
      paramsValue?.startDate?.toISOString(),
      paramsValue?.endDate?.toISOString(),
      normalizedSubTypes.join(','),
      paramsValue?.reviewScope,
      paramsValue?.sourceScope,
      paramsValue?.includeData,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (commodity) params.append('commodity', commodity);
      if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
      if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
      if (paramsValue?.days) params.append('days', String(paramsValue.days));
      if (normalizedSubTypes.length > 0) {
        params.append('subTypes', normalizedSubTypes.join(','));
      }
      if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
      if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
      if (paramsValue?.includeData !== undefined) {
        params.append('includeData', String(paramsValue.includeData));
      }
      const res = await apiClient.get<RegionPriceData>(
        `/market-intel/price-data/by-region/${regionCode}?${params.toString()}`,
      );
      return res.data;
    },
    enabled: !!regionCode,
    keepPreviousData: true,
  });
};

// =============================================
// 新增：多采集点对比趋势
// =============================================

interface MultiPointTrendItem {
  point: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    type?: string;
    regionCode?: string | null;
    region?: { code: string; name: string; shortName: string | null } | null;
  };
  data: Array<{
    date: Date;
    price: number;
    change: number | null;
  }>;
}

export const useMultiPointCompare = (
  collectionPointIds: string[],
  commodity: string,
  daysOrParams:
    | number
    | {
        startDate?: Date;
        endDate?: Date;
        days?: number;
        subTypes?: string[];
        reviewScope?: string;
        sourceScope?: string;
      } = 30,
) => {
  const paramsValue = typeof daysOrParams === 'number' ? { days: daysOrParams } : daysOrParams;
  const normalizedSubTypes = normalizePriceSubTypeList(paramsValue?.subTypes);
  return useQuery<MultiPointTrendItem[]>({
    queryKey: [
      'multi-point-compare',
      collectionPointIds,
      commodity,
      paramsValue?.days,
      paramsValue?.startDate?.toISOString(),
      paramsValue?.endDate?.toISOString(),
      normalizedSubTypes.join(','),
      paramsValue?.reviewScope,
      paramsValue?.sourceScope,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('ids', collectionPointIds.join(','));
      params.append('commodity', commodity);
      if (paramsValue?.startDate) params.append('startDate', paramsValue.startDate.toISOString());
      if (paramsValue?.endDate) params.append('endDate', paramsValue.endDate.toISOString());
      if (paramsValue?.days) params.append('days', String(paramsValue.days));
      if (normalizedSubTypes.length > 0) {
        params.append('subTypes', normalizedSubTypes.join(','));
      }
      if (paramsValue?.reviewScope) params.append('reviewScope', paramsValue.reviewScope);
      if (paramsValue?.sourceScope) params.append('sourceScope', paramsValue.sourceScope);
      const res = await apiClient.get<MultiPointTrendItem[]>(
        `/market-intel/price-data/compare?${params.toString()}`,
      );
      return res.data;
    },
    enabled: collectionPointIds.length > 0 && !!commodity,
    keepPreviousData: true,
  });
};

interface CompareRankingItem {
  id: string;
  name: string;
  code: string;
  type?: string;
  regionLabel: string;
  price: number;
  change: number;
  changePct: number;
  periodChange: number;
  periodChangePct: number;
  volatility: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  basePrice: number;
  indexPrice: number;
  indexChange: number;
  samples: number;
  missingDays: number | null;
}

interface CompareDistributionItem {
  id: string;
  name: string;
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  avg: number;
}

interface CompareRegionItem {
  region: string;
  avgPrice: number;
  count: number;
  minPrice: number;
  maxPrice: number;
  q1: number;
  median: number;
  q3: number;
  std: number;
  volatility: number;
  missingRate: number;
  latestTs: number;
  hasPrev: boolean;
  delta: number;
  deltaPct: number;
}

interface PriceCompareAnalyticsResponse {
  ranking: CompareRankingItem[];
  distribution: CompareDistributionItem[];
  meta: {
    meanLatestPrice: number | null;
    expectedDays: number | null;
    selectedPointCount: number;
  };
  latestRegionAvg: number | null;
  quality: {
    totalSamples: number;
    latestDate: Date | null;
    missingDays: number | null;
  };
  regions: {
    list: CompareRegionItem[];
    overallAvg: number | null;
    minAvg: number;
    maxAvg: number;
    rangeMin: number;
    rangeMax: number;
    windowLabel: string;
    expectedDays: number;
  };
}

interface PriceCompareAnalyticsQuery {
  collectionPointIds: string[];
  commodity?: string;
  startDate?: Date;
  endDate?: Date;
  days?: number;
  subTypes?: string[];
  regionCode?: string;
  pointTypes?: string[];
  reviewScope?: string;
  sourceScope?: string;
  regionLevel?: 'province' | 'city' | 'district';
  regionWindow?: '7' | '30' | '90' | 'all';
}

export const usePriceCompareAnalytics = (
  query: PriceCompareAnalyticsQuery,
  options?: UsePriceDataOptions,
) => {
  const normalizedSubTypes = normalizePriceSubTypeList(query.subTypes);
  const normalizedPointTypes = query.pointTypes || [];
  return useQuery<PriceCompareAnalyticsResponse>({
    queryKey: [
      'price-compare-analytics',
      query.collectionPointIds,
      query.commodity,
      query.days,
      query.startDate?.toISOString(),
      query.endDate?.toISOString(),
      normalizedSubTypes.join(','),
      query.regionCode,
      normalizedPointTypes.join(','),
      query.reviewScope,
      query.sourceScope,
      query.regionLevel,
      query.regionWindow,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.collectionPointIds.length > 0) {
        params.append('ids', query.collectionPointIds.join(','));
      }
      if (query.commodity) params.append('commodity', query.commodity);
      if (query.startDate) params.append('startDate', query.startDate.toISOString());
      if (query.endDate) params.append('endDate', query.endDate.toISOString());
      if (query.days) params.append('days', String(query.days));
      if (normalizedSubTypes.length > 0) params.append('subTypes', normalizedSubTypes.join(','));
      if (query.regionCode) params.append('regionCode', query.regionCode);
      if (normalizedPointTypes.length > 0)
        params.append('pointTypes', normalizedPointTypes.join(','));
      if (query.reviewScope) params.append('reviewScope', query.reviewScope);
      if (query.sourceScope) params.append('sourceScope', query.sourceScope);
      if (query.regionLevel) params.append('regionLevel', query.regionLevel);
      if (query.regionWindow) params.append('regionWindow', query.regionWindow);
      const res = await apiClient.get<PriceCompareAnalyticsResponse>(
        `/market-intel/price-data/compare-analytics?${params.toString()}`,
      );
      return res.data;
    },
    enabled: (options?.enabled ?? true) && query.collectionPointIds.length > 0 && !!query.commodity,
    keepPreviousData: true,
  });
};

// =============================================
// 新增：获取采集点列表
// =============================================

interface CollectionPointItem {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  type: string;
  regionCode: string | null;
  longitude: number | null;
  latitude: number | null;
  region?: {
    code: string;
    name: string;
  };
}

interface CollectionPointListResponse {
  data: CollectionPointItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface UseCollectionPointsOptions {
  enabled?: boolean;
}

interface CollectionPointListQuery {
  type?: string;
  types?: string[];
  regionCode?: string;
  keyword?: string;
  isActive?: boolean;
  allocationStatus?: 'ALLOCATED' | 'UNALLOCATED';
  page?: number;
  pageSize?: number;
}

const normalizeCollectionPointListQuery = (
  queryOrType?: CollectionPointListQuery | string,
  keyword?: string,
): CollectionPointListQuery => {
  if (typeof queryOrType === 'string') {
    return {
      type: queryOrType || undefined,
      keyword: keyword || undefined,
    };
  }
  return queryOrType || {};
};

export const useCollectionPoints = (
  queryOrType?: CollectionPointListQuery | string,
  keyword?: string,
  options?: UseCollectionPointsOptions,
) => {
  const query = normalizeCollectionPointListQuery(queryOrType, keyword);
  const normalizedTypes = query.types || [];
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;

  return useQuery<CollectionPointListResponse>({
    queryKey: [
      'collection-points-lite',
      query.type,
      normalizedTypes.join(','),
      query.regionCode,
      query.keyword,
      query.isActive,
      query.allocationStatus,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.type) params.append('type', query.type);
      if (normalizedTypes.length > 0) params.append('types', normalizedTypes.join(','));
      if (query.regionCode) params.append('regionCode', query.regionCode);
      if (query.keyword) params.append('keyword', query.keyword);
      if (query.isActive !== undefined) params.append('isActive', String(query.isActive));
      if (query.allocationStatus) params.append('allocationStatus', query.allocationStatus);
      params.append('page', String(page));
      params.append('pageSize', String(pageSize));
      const res = await apiClient.get<CollectionPointListResponse>(
        `/collection-points?${params.toString()}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
    keepPreviousData: true,
  });
};

// =============================================
// 新增：获取行政区划树
// =============================================

interface RegionTreeNode {
  code: string;
  name: string;
  shortName: string | null;
  level: string;
  children: RegionTreeNode[];
}

export const useRegionTree = () => {
  return useQuery<RegionTreeNode[]>({
    queryKey: ['region-tree'],
    queryFn: async () => {
      const res = await apiClient.get<RegionTreeNode[]>('/regions/tree');
      return res.data;
    },
  });
};

// =============================================
// 新增：获取省份列表
// =============================================

interface ProvinceItem {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
}

export const useProvinces = () => {
  return useQuery<ProvinceItem[]>({
    queryKey: ['provinces'],
    queryFn: async () => {
      const res = await apiClient.get<ProvinceItem[]>('/regions/provinces');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });
};

// =============================================
// 任务调度
// =============================================

// =============================================
// C类：附件管理
// =============================================

import { IntelAttachmentResponse } from '@packages/types';

export const useIntelAttachments = (intelId: string) => {
  return useQuery<IntelAttachmentResponse[]>({
    queryKey: ['intel-attachments', intelId],
    queryFn: async () => {
      const res = await apiClient.get<IntelAttachmentResponse[]>(
        `/market-intel/${intelId}/attachments`,
      );
      return res.data;
    },
    enabled: !!intelId,
  });
};

// 附件搜索结果
interface AttachmentSearchResult {
  id: string;
  filename: string;
  mimeType: string;
  ocrText: string | null;
  createdAt: Date;
  intel: {
    id: string;
    category: string;
    location: string;
  };
}

export const useSearchAttachments = (keyword: string, limit = 20) => {
  return useQuery<AttachmentSearchResult[]>({
    queryKey: ['attachment-search', keyword, limit],
    queryFn: async () => {
      const res = await apiClient.get<AttachmentSearchResult[]>(
        `/market-intel/attachments/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
      );
      return res.data;
    },
    enabled: keyword.length >= 2,
  });
};

// =============================================
// B类增强：市场事件 (MarketEvent)
// =============================================

export interface MarketEventResponse {
  id: string;
  sourceText: string;
  sourceStart: number | null;
  sourceEnd: number | null;
  sectionIndex: number | null;
  subject: string;
  action: string;
  content: string;
  impact: string | null;
  impactLevel: string | null;
  sentiment: string | null;
  eventDate: Date | null;
  commodity: string | null;
  regionCode: string | null;
  createdAt: Date;
  eventType: {
    id: string;
    code: string;
    name: string;
    icon?: string;
    color?: string;
    category?: string;
  };
  enterprise?: {
    id: string;
    name: string;
    shortName?: string;
  };
  collectionPoint?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  intel: {
    id: string;
    rawContent: string;
    effectiveTime: Date;
    location: string;
  };
}

export interface EventQuery {
  eventTypeId?: string;
  enterpriseId?: string;
  collectionPointId?: string;
  commodity?: string;
  sentiment?: string;
  impactLevel?: string;
  startDate?: Date;
  endDate?: Date;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface EventStats {
  total: number;
  todayCount: number;
  weekCount: number;
  typeBreakdown: Array<{
    typeId: string;
    typeName: string;
    icon?: string;
    color?: string;
    count: number;
  }>;
  sentimentBreakdown: Array<{
    sentiment: string;
    count: number;
  }>;
  impactBreakdown: Array<{
    level: string;
    count: number;
  }>;
  commodityStats: Array<{
    commodity: string;
    count: number;
  }>;
  regionStats: Array<{
    region: string;
    count: number;
  }>;
}

export const useMarketEvents = (query?: EventQuery) => {
  return useQuery<PaginatedResponse<MarketEventResponse>>({
    queryKey: ['market-events', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<PaginatedResponse<MarketEventResponse>>(
        `/market-intel/events?${params.toString()}`,
      );
      return res.data;
    },
  });
};

export const useMarketEvent = (id: string) => {
  return useQuery<MarketEventResponse>({
    queryKey: ['market-events', id],
    queryFn: async () => {
      const res = await apiClient.get<MarketEventResponse>(`/market-intel/events/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
};

export const useEventStats = (query?: {
  startDate?: Date;
  endDate?: Date;
  commodities?: string[];
  regions?: string[];
}) => {
  return useQuery<EventStats>({
    queryKey: ['event-stats', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        if (query.startDate) params.append('startDate', query.startDate.toISOString());
        if (query.endDate) params.append('endDate', query.endDate.toISOString());
        if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
        if (query.regions?.length) params.append('regions', query.regions.join(','));
      }
      const res = await apiClient.get<EventStats>(
        `/market-intel/events/stats?${params.toString()}`,
      );
      return res.data;
    },
    refetchInterval: 60000,
  });
};

export interface FilterOptions {
  commodities: string[];
  regions: string[];
  eventTypes: Array<{ id: string; name: string; code: string }>;
  insightTypes: Array<{ id: string; name: string; category: string }>;
}

export const useFilterOptions = () => {
  return useQuery<FilterOptions>({
    queryKey: ['filter-options'],
    queryFn: async () => {
      const res = await apiClient.get<FilterOptions>('/market-intel/filter-options');
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
};

export interface TrendData {
  date: string;
  volume: number;
  sentimentScore: number;
}

export const useTrendAnalysis = (query?: {
  startDate?: Date;
  endDate?: Date;
  commodities?: string[];
  regions?: string[];
}) => {
  return useQuery<TrendData[]>({
    queryKey: ['trend-analysis', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        if (query.startDate) params.append('startDate', query.startDate.toISOString());
        if (query.endDate) params.append('endDate', query.endDate.toISOString());
        if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
        if (query.regions?.length) params.append('regions', query.regions.join(','));
      }
      const res = await apiClient.get<TrendData[]>(
        `/market-intel/trend-analysis?${params.toString()}`,
      );
      return res.data;
    },
  });
};

// =============================================
// C类增强：市场洞察 (MarketInsight)
// =============================================

export interface MarketInsightResponse {
  id: string;
  sourceText: string;
  sourceStart: number | null;
  sourceEnd: number | null;
  sectionTitle: string | null;
  sectionIndex: number | null;
  title: string;
  content: string;
  direction: string | null;
  timeframe: string | null;
  confidence: number | null;
  factors: string[];
  commodity: string | null;
  regionCode: string | null;
  createdAt: Date;
  insightType: {
    id: string;
    code: string;
    name: string;
    icon?: string;
    color?: string;
    category?: string;
  };
  intel: {
    id: string;
    rawContent: string;
    effectiveTime: Date;
    location: string;
  };
}

export interface InsightQuery {
  insightTypeId?: string;
  direction?: string;
  timeframe?: string;
  commodity?: string;
  startDate?: Date;
  endDate?: Date;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface InsightStats {
  total: number;
  todayCount: number;
  weekCount: number;
  avgConfidence: number;
  typeBreakdown: Array<{
    typeId: string;
    typeName: string;
    icon?: string;
    color?: string;
    count: number;
  }>;
  directionBreakdown: Array<{
    direction: string;
    count: number;
  }>;
  timeframeBreakdown: Array<{
    timeframe: string;
    count: number;
  }>;
}

export const useMarketInsights = (query?: InsightQuery) => {
  return useQuery<PaginatedResponse<MarketInsightResponse>>({
    queryKey: ['market-insights', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<PaginatedResponse<MarketInsightResponse>>(
        `/market-intel/insights?${params.toString()}`,
      );
      return res.data;
    },
  });
};

export const useMarketInsight = (id: string) => {
  return useQuery<MarketInsightResponse>({
    queryKey: ['market-insights', id],
    queryFn: async () => {
      const res = await apiClient.get<MarketInsightResponse>(`/market-intel/insights/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
};

export const useInsightStats = () => {
  return useQuery<InsightStats>({
    queryKey: ['insight-stats'],
    queryFn: async () => {
      const res = await apiClient.get<InsightStats>('/market-intel/insights/stats');
      return res.data;
    },
    refetchInterval: 60000,
  });
};

// =============================================
// 综合情报流 (Intelligence Feed)
// =============================================

// 移除重复定义的 useIntelligenceFeed

// =============================================
// 热门话题
// =============================================

export interface HotTopic {
  topic: string;
  displayTopic?: string;
  count: number;
}

export const useHotTopics = (limit = 20) => {
  return useQuery<HotTopic[]>({
    queryKey: ['hot-topics', limit],
    queryFn: async () => {
      const res = await apiClient.get<HotTopic[]>(`/market-intel/hot-topics?limit=${limit}`);
      return res.data;
    },
    refetchInterval: 60000,
  });
};

// =============================================
// 全景检索：聚合搜索 (Universal Search)
// =============================================

export interface UniversalSearchQuery {
  keyword: string;
  startDate?: Date;
  endDate?: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  commodities?: string[];
  sourceTypes?: string[];
  regionCodes?: string[];
  pricePageSize?: number;
  intelPageSize?: number;
  docPageSize?: number;
}

export interface UniversalSearchSummary {
  priceRange: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  topTags: string[];
  entityMentions: string[];
  totalResults: number;
}

export interface UniversalSearchResponse {
  prices: { data: PriceDataResponse[]; total: number };
  intels: { data: MarketIntelResponse[]; total: number };
  docs: { data: MarketIntelResponse[]; total: number };
  summary: UniversalSearchSummary;
}

/**
 * 全景检索 Hook - 一次请求返回三类数据及统计摘要
 */
export const useUniversalSearch = (
  query?: Partial<UniversalSearchQuery>,
  options?: { enabled?: boolean },
) => {
  return useQuery<UniversalSearchResponse>({
    queryKey: ['universal-search', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (value instanceof Date) {
              params.append(key, value.toISOString());
            } else if (Array.isArray(value)) {
              if (value.length > 0) {
                params.append(key, value.join(','));
              }
            } else {
              params.append(key, String(value));
            }
          }
        });
      }
      const res = await apiClient.get<UniversalSearchResponse>(
        `/market-intel/universal-search?${params.toString()}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? (!!query?.keyword && query.keyword.length >= 2),
  });
};

// =============================================
// 搜索建议 (Search Suggestions)
// =============================================

export interface SearchSuggestion {
  text: string;
  type: 'collection_point' | 'commodity' | 'tag';
  count?: number;
}

export interface SearchSuggestionsResponse {
  suggestions: SearchSuggestion[];
}

/**
 * 搜索建议 Hook - 提供自动补全功能
 */
export const useSearchSuggestions = (prefix?: string, options?: { enabled?: boolean }) => {
  return useQuery<SearchSuggestionsResponse>({
    queryKey: ['search-suggestions', prefix],
    queryFn: async () => {
      const res = await apiClient.get<SearchSuggestionsResponse>(
        `/market-intel/search-suggestions?prefix=${encodeURIComponent(prefix || '')}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? (!!prefix && prefix.length >= 1),
    staleTime: 30000, // 30秒内不重新请求相同前缀
  });
};

// =============================================
// 全文搜索增强 (Full-Text Search)
// =============================================

export interface FullTextSearchQuery {
  keywords: string;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface FullTextSearchResult extends MarketIntelResponse {
  relevanceScore: number;
  matchedKeywords: string[];
}

export interface FullTextSearchResponse {
  data: FullTextSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  keywords: string[]; // 分词后的关键词列表（供高亮使用）
}

/**
 * 全文搜索 Hook - 支持多关键词、相关性排序、分页
 */
export const useFullTextSearch = (
  query?: Partial<FullTextSearchQuery>,
  options?: { enabled?: boolean },
) => {
  return useQuery<FullTextSearchResponse>({
    queryKey: ['full-text-search', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        if (query.keywords) params.append('keywords', query.keywords);
        if (query.category) params.append('category', query.category);
        if (query.startDate) params.append('startDate', query.startDate.toISOString());
        if (query.endDate) params.append('endDate', query.endDate.toISOString());
        if (query.page) params.append('page', String(query.page));
        if (query.pageSize) params.append('pageSize', String(query.pageSize));
      }
      const res = await apiClient.get<FullTextSearchResponse>(
        `/market-intel/full-text-search?${params.toString()}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? (!!query?.keywords && query.keywords.length >= 2),
  });
};

// =============================================
// 关联内容 (Related Content / Knowledge Graph)
// =============================================

export interface RelatedContentQuery {
  intelId?: string;
  tags?: string[];
  commodities?: string[];
  regionCodes?: string[];
  limit?: number;
}

export interface RelatedContentResponse {
  relatedIntels: Array<{
    id: string;
    category: string;
    rawContent: string;
    summary: string | null;
    effectiveTime: string;
    location: string;
    totalScore: number;
    relationScore: number;
  }>;
  relatedKnowledge: Array<{
    id: string;
    type: string;
    title: string;
    publishAt: string | null;
    commodities: string[];
    region: string[];
    analysis?: { summary?: string };
  }>;
  relatedPrices: Array<{
    id: string;
    commodity: string;
    price: number;
    location: string;
    effectiveDate: string;
    collectionPoint?: { name: string; shortName?: string };
  }>;
  sourceTags: string[];
  sourceCommodities: string[];
  sourceRegions: string[];
}

/**
 * 关联内容 Hook - 基于标签/品种/区域查找关联内容
 */
export const useRelatedContent = (
  query?: Partial<RelatedContentQuery>,
  options?: { enabled?: boolean },
) => {
  return useQuery<RelatedContentResponse>({
    queryKey: ['related-content', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) {
        if (query.intelId) params.append('intelId', query.intelId);
        if (query.tags?.length) params.append('tags', query.tags.join(','));
        if (query.commodities?.length) params.append('commodities', query.commodities.join(','));
        if (query.regionCodes?.length) params.append('regionCodes', query.regionCodes.join(','));
        if (query.limit) params.append('limit', String(query.limit));
      }
      const res = await apiClient.get<RelatedContentResponse>(
        `/market-intel/related-content?${params.toString()}`,
      );
      return res.data;
    },
    enabled:
      options?.enabled ??
      (!!query?.intelId || (query?.tags?.length ?? 0) > 0 || (query?.commodities?.length ?? 0) > 0),
  });
};
