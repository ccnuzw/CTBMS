import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type {
  WorkflowExecutionQuery,
  ExecutionAnalyticsDto,
} from '@packages/types';

// ────────────────── Types ──────────────────

interface WorkbenchSummary {
  todayTotal: number;
  todaySuccess: number;
  todayFailed: number;
  todaySuccessRate: number;
  runningCount: number;
  pendingAlerts: number;
  activeExperiments: number;
}

interface WorkbenchAlert {
  id: string;
  executionId: string;
  errorMessage: string;
  failureCategory?: string;
  occurredAt: string;
  workflowName?: string;
}

// ────────────────── Query Keys ──────────────────

export const WORKBENCH_KEYS = {
  all: ['workbench'] as const,
  summary: () => [...WORKBENCH_KEYS.all, 'summary'] as const,
  alerts: () => [...WORKBENCH_KEYS.all, 'alerts'] as const,
  recentExecutions: (query?: Record<string, unknown>) =>
    [...WORKBENCH_KEYS.all, 'recent', query] as const,
};

// ────────────────── Hooks ──────────────────

/**
 * 工作台摘要数据 — 聚合今日执行统计
 */
export const useWorkbenchSummary = () => {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery<WorkbenchSummary>({
    queryKey: WORKBENCH_KEYS.summary(),
    queryFn: async () => {
      const [analyticsRes, execRes, expRes] = await Promise.all([
        apiClient.get<ExecutionAnalyticsDto>('/execution-analytics', {
          params: { startDate: today, endDate: today, granularity: 'DAY' },
        }),
        apiClient.get('/workflow-executions', {
          params: { page: 1, pageSize: 1, status: 'RUNNING' },
        }),
        apiClient.get('/workflow-experiments', {
          params: { page: 1, pageSize: 1, status: 'RUNNING' },
        }),
      ]);

      const trend = (analyticsRes.data as Record<string, unknown>)?.trend as
        | Record<string, unknown>
        | undefined;
      const overall = trend?.overall as Record<string, number> | undefined;

      return {
        todayTotal: overall?.total ?? 0,
        todaySuccess: overall?.success ?? 0,
        todayFailed: overall?.failed ?? 0,
        todaySuccessRate: overall?.successRate ?? 0,
        runningCount: (execRes.data as Record<string, unknown>)?.total as number ?? 0,
        pendingAlerts: overall?.failed ?? 0,
        activeExperiments: (expRes.data as Record<string, unknown>)?.total as number ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
};

/**
 * 工作台告警列表 — 获取最近失败的执行
 */
export const useWorkbenchAlerts = (limit = 10) => {
  return useQuery<WorkbenchAlert[]>({
    queryKey: WORKBENCH_KEYS.alerts(),
    queryFn: async () => {
      const res = await apiClient.get('/workflow-executions', {
        params: { page: 1, pageSize: limit, status: 'FAILED' },
      });
      const data = res.data as Record<string, unknown>;
      const items = (data?.data ?? []) as Array<Record<string, unknown>>;
      return items.map((item) => ({
        id: item.id as string,
        executionId: item.id as string,
        errorMessage: (item.errorMessage as string) ?? '执行失败',
        failureCategory: item.failureCategory as string | undefined,
        occurredAt: (item.startedAt as string) ?? '',
        workflowName: item.workflowDefinitionId as string | undefined,
      }));
    },
    refetchInterval: 30_000,
  });
};

/**
 * 工作台最近执行列表
 */
export const useWorkbenchRecentExecutions = (pageSize = 10) => {
  return useQuery({
    queryKey: WORKBENCH_KEYS.recentExecutions({ pageSize }),
    queryFn: async () => {
      const res = await apiClient.get('/workflow-executions', {
        params: { page: 1, pageSize },
      });
      return res.data;
    },
    refetchInterval: 15_000,
  });
};
