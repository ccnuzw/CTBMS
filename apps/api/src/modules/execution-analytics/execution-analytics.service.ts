import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  ExecutionAnalyticsQueryDto,
  ExecutionAnalyticsDto,
  ExecutionTrendPointDto,
  DurationBucketDto,
  FailureCategoryStatDto,
  NodePerformanceStatDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ExecutionAnalyticsService {
  private readonly logger = new Logger(ExecutionAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(userId: string, query: ExecutionAnalyticsQueryDto): Promise<ExecutionAnalyticsDto> {
    const where = this.buildWhere(userId, query);
    const nodeWhere = this.buildNodeWhere(userId, query);

    const [trend, durationDistribution, failureCategories, nodePerformance] = await Promise.all([
      this.computeTrend(where, query),
      this.computeDurationDistribution(where),
      this.computeFailureCategories(where),
      this.computeNodePerformance(nodeWhere),
    ]);

    const topSlowNodes = [...nodePerformance]
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, 10);

    return { trend, durationDistribution, failureCategories, nodePerformance, topSlowNodes };
  }

  private buildWhere(
    userId: string,
    query: ExecutionAnalyticsQueryDto,
  ): Prisma.WorkflowExecutionWhereInput {
    const where: Prisma.WorkflowExecutionWhereInput = {
      OR: [
        { triggerUserId: userId },
        { workflowVersion: { workflowDefinition: { ownerUserId: userId } } },
      ],
    };

    if (query.workflowDefinitionId) {
      where.workflowVersion = {
        workflowDefinition: { id: query.workflowDefinitionId },
      };
    }

    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) where.startedAt.gte = new Date(query.startDate);
      if (query.endDate) where.startedAt.lte = new Date(query.endDate);
    }

    return where;
  }

  private buildNodeWhere(
    userId: string,
    query: ExecutionAnalyticsQueryDto,
  ): Prisma.NodeExecutionWhereInput {
    const where: Prisma.NodeExecutionWhereInput = {
      workflowExecution: {
        OR: [
          { triggerUserId: userId },
          { workflowVersion: { workflowDefinition: { ownerUserId: userId } } },
        ],
      },
    };

    if (query.workflowDefinitionId) {
      where.workflowExecution = {
        ...where.workflowExecution as Prisma.WorkflowExecutionWhereInput,
        workflowVersion: {
          workflowDefinition: { id: query.workflowDefinitionId },
        },
      };
    }

    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) where.startedAt.gte = new Date(query.startDate);
      if (query.endDate) where.startedAt.lte = new Date(query.endDate);
    }

    return where;
  }

  /**
   * 计算执行趋势（成功率/失败率随时间变化）
   */
  private async computeTrend(
    where: Prisma.WorkflowExecutionWhereInput,
    query: ExecutionAnalyticsQueryDto,
  ): Promise<{ points: ExecutionTrendPointDto[]; overall: ExecutionTrendPointDto & { avgDurationMs: number } }> {
    const executions = await this.prisma.workflowExecution.findMany({
      where,
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    // 按粒度分组
    const bucketMap = new Map<string, { total: number; success: number; failed: number; canceled: number }>();

    for (const exec of executions) {
      if (!exec.startedAt) continue;
      const key = this.toBucketKey(exec.startedAt, query.granularity);
      const bucket = bucketMap.get(key) ?? { total: 0, success: 0, failed: 0, canceled: 0 };
      bucket.total++;
      if (exec.status === 'SUCCESS') bucket.success++;
      else if (exec.status === 'FAILED') bucket.failed++;
      else if (exec.status === 'CANCELED') bucket.canceled++;
      bucketMap.set(key, bucket);
    }

    const points: ExecutionTrendPointDto[] = Array.from(bucketMap.entries()).map(([timestamp, b]) => ({
      timestamp,
      total: b.total,
      success: b.success,
      failed: b.failed,
      canceled: b.canceled,
      successRate: b.total > 0 ? b.success / b.total : 0,
    }));

    // 总体统计
    const totalExecs = executions.length;
    const successCount = executions.filter((e) => e.status === 'SUCCESS').length;
    const failedCount = executions.filter((e) => e.status === 'FAILED').length;
    const canceledCount = executions.filter((e) => e.status === 'CANCELED').length;

    const durations = executions
      .filter((e) => e.startedAt && e.completedAt)
      .map((e) => e.completedAt!.getTime() - e.startedAt!.getTime());
    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;

    return {
      points,
      overall: {
        timestamp: '',
        total: totalExecs,
        success: successCount,
        failed: failedCount,
        canceled: canceledCount,
        successRate: totalExecs > 0 ? successCount / totalExecs : 0,
        avgDurationMs,
      },
    };
  }

  /**
   * 计算耗时分布
   */
  private async computeDurationDistribution(
    where: Prisma.WorkflowExecutionWhereInput,
  ): Promise<DurationBucketDto[]> {
    const executions = await this.prisma.workflowExecution.findMany({
      where: { ...where, status: 'SUCCESS' },
      select: { startedAt: true, completedAt: true },
    });

    const buckets: DurationBucketDto[] = [
      { label: '<1s', minMs: 0, maxMs: 1000, count: 0 },
      { label: '1-5s', minMs: 1000, maxMs: 5000, count: 0 },
      { label: '5-10s', minMs: 5000, maxMs: 10000, count: 0 },
      { label: '10-30s', minMs: 10000, maxMs: 30000, count: 0 },
      { label: '30s-1m', minMs: 30000, maxMs: 60000, count: 0 },
      { label: '1-5m', minMs: 60000, maxMs: 300000, count: 0 },
      { label: '>5m', minMs: 300000, maxMs: Number.MAX_SAFE_INTEGER, count: 0 },
    ];

    for (const exec of executions) {
      if (!exec.startedAt || !exec.completedAt) continue;
      const durationMs = exec.completedAt.getTime() - exec.startedAt.getTime();
      const bucket = buckets.find((b) => durationMs >= b.minMs && durationMs < b.maxMs);
      if (bucket) bucket.count++;
    }

    return buckets;
  }

  /**
   * 计算失败类别统计
   */
  private async computeFailureCategories(
    where: Prisma.WorkflowExecutionWhereInput,
  ): Promise<FailureCategoryStatDto[]> {
    const failedExecutions = await this.prisma.workflowExecution.findMany({
      where: { ...where, status: 'FAILED' },
      select: { failureCategory: true },
    });

    const categoryMap = new Map<string, number>();
    for (const exec of failedExecutions) {
      const cat = exec.failureCategory ?? 'UNKNOWN';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }

    const total = failedExecutions.length;
    return Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: total > 0 ? count / total : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 计算节点级性能统计
   */
  private async computeNodePerformance(
    where: Prisma.NodeExecutionWhereInput,
  ): Promise<NodePerformanceStatDto[]> {
    const nodeExecutions = await this.prisma.nodeExecution.findMany({
      where,
      select: {
        nodeType: true,
        status: true,
        durationMs: true,
      },
    });

    const typeMap = new Map<string, {
      total: number;
      success: number;
      failed: number;
      durations: number[];
    }>();

    for (const node of nodeExecutions) {
      const entry = typeMap.get(node.nodeType) ?? {
        total: 0,
        success: 0,
        failed: 0,
        durations: [],
      };
      entry.total++;
      if (node.status === 'SUCCESS') entry.success++;
      else if (node.status === 'FAILED') entry.failed++;
      if (node.durationMs !== null) entry.durations.push(node.durationMs);
      typeMap.set(node.nodeType, entry);
    }

    return Array.from(typeMap.entries()).map(([nodeType, stats]) => {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      const avgDurationMs = sorted.length > 0
        ? Math.round(sorted.reduce((s, d) => s + d, 0) / sorted.length)
        : 0;
      const maxDurationMs = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
      const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
      const p95DurationMs = sorted.length > 0 ? sorted[Math.max(0, p95Index)] : 0;

      return {
        nodeType,
        totalExecutions: stats.total,
        successCount: stats.success,
        failedCount: stats.failed,
        successRate: stats.total > 0 ? stats.success / stats.total : 0,
        avgDurationMs,
        maxDurationMs,
        p95DurationMs,
      };
    }).sort((a, b) => b.totalExecutions - a.totalExecutions);
  }

  private toBucketKey(date: Date, granularity: string): string {
    const d = new Date(date);
    if (granularity === 'HOUR') {
      d.setMinutes(0, 0, 0);
      return d.toISOString();
    }
    if (granularity === 'WEEK') {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    }
    // DAY
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }
}
