import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import * as KnowledgeUtils from './knowledge.utils';
import { KnowledgeListQuery } from './knowledge.utils';
import { KnowledgeStatus, KnowledgeType, KnowledgePeriodType, Prisma } from '@prisma/client';
const ExcelJS = require('exceljs');

@Injectable()
export class KnowledgeAggregationService {
    private readonly logger = new Logger(KnowledgeAggregationService.name);
    constructor(private prisma: PrismaService) {}
    async getTrend(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        type: true,
        createdAt: true,
        status: true,
      },
    });

    const byDate = new Map<string, number>();
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const item of items) {
      const date = item.createdAt.toISOString().split('T')[0];
      byDate.set(date, (byDate.get(date) || 0) + 1);
      byType[item.type] = (byType[item.type] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    }

    return {
      total: items.length,
      trend: Array.from(byDate.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byType,
      byStatus,
    };
  }

    async getWeeklyOverview(periodKey?: string) {
    const target = periodKey || KnowledgeUtils.getWeekRange(new Date()).periodKey;

    const weekly = await this.prisma.knowledgeItem.findFirst({
      where: {
        type: 'WEEKLY',
        periodType: 'WEEK',
        periodKey: target,
      },
      include: {
        analysis: true,
      },
      orderBy: { publishAt: 'desc' },
    });

    if (!weekly) {
      const fallbackStartDate = new Date();
      fallbackStartDate.setDate(fallbackStartDate.getDate() - 7);

      const fallbackDocs = await this.prisma.knowledgeItem.findMany({
        where: {
          type: { in: ['RESEARCH', 'THIRD_PARTY', 'FLASH'] },
          createdAt: { gte: fallbackStartDate },
        },
        include: { analysis: true },
        orderBy: { publishAt: 'desc' },
      });

      const fallbackByType: Record<string, number> = {};
      let totalConf = 0;
      let confCount = 0;
      for (const doc of fallbackDocs) {
        fallbackByType[doc.type] = (fallbackByType[doc.type] || 0) + 1;
        if (doc.analysis?.confidenceScore) {
          totalConf += doc.analysis.confidenceScore;
          confCount++;
        }
      }

      return {
        periodKey: target,
        found: false,
        weekly: null,
        metrics: {
          riskLevel: 'MEDIUM',
          sentiment: 'NEUTRAL',
          confidence: confCount > 0 ? Math.round(totalConf / confCount) : 80,
        },
        sourceStats: { totalSources: fallbackDocs.length, byType: fallbackByType },
        topSources: fallbackDocs.slice(0, 10).map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          publishAt: item.publishAt,
        })),
      };
    }

    const sources = await this.prisma.knowledgeRelation.findMany({
      where: {
        fromKnowledgeId: weekly.id,
        relationType: 'WEEKLY_ROLLUP_OF',
      },
      include: {
        toKnowledge: {
          select: { id: true, type: true, title: true, publishAt: true },
        },
      },
    });

    const byType: Record<string, number> = {};
    for (const source of sources) {
      byType[source.toKnowledge.type] = (byType[source.toKnowledge.type] || 0) + 1;
    }

    const metrics =
      weekly.analysis && weekly.analysis.keyPoints && typeof weekly.analysis.keyPoints === 'object'
        ? ((weekly.analysis.keyPoints as Record<string, unknown>).metrics ?? null)
        : null;

    return {
      periodKey: target,
      found: true,
      weekly: {
        id: weekly.id,
        title: weekly.title,
        publishAt: weekly.publishAt,
        summary: weekly.analysis?.summary || null,
      },
      metrics,
      sourceStats: {
        totalSources: sources.length,
        byType,
      },
      topSources: sources.slice(0, 10).map((item) => ({
        id: item.toKnowledge.id,
        type: item.toKnowledge.type,
        title: item.toKnowledge.title,
        publishAt: item.toKnowledge.publishAt,
      })),
    };
  }

    async getTopicEvolution(commodity?: string, weeks = 8) {
    const take = Math.max(1, Math.min(52, weeks));

    // 兼容普通研报作为周度话题演化的基础数据
    const where: Prisma.KnowledgeItemWhereInput = {
      type: { in: ['WEEKLY', 'RESEARCH'] },
    };

    if (commodity) {
      where.commodities = { has: commodity };
    }

    const rows = await this.prisma.knowledgeItem.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishAt: 'desc' },
      take,
    });

    const trend = rows
      .map((row) => {
        const keyPoints = (row.analysis?.keyPoints || {}) as Record<string, unknown>;
        const metrics = (keyPoints.metrics || {}) as Record<string, unknown>;
        return {
          id: row.id,
          periodKey: row.periodKey,
          title: row.title,
          summary: row.analysis?.summary || '',
          sentiment: (metrics.sentiment as string) || null,
          riskLevel: (metrics.riskLevel as string) || null,
          confidence: (metrics.confidence as number) || null,
          publishAt: row.publishAt,
        };
      })
      .reverse();

    return {
      commodity: commodity || null,
      weeks: take,
      trend,
    };
  }

    async getReportStats(options?: { days?: number }) {
    const days = options?.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.KnowledgeItemWhereInput = { type: 'RESEARCH' };

    // 对于本周研报，改为查询所有 RESEARCH 类型（不受 reportType 影响）
    const weeklyReportsCount = await this.prisma.knowledgeItem.count({
      where: {
        type: 'RESEARCH',
        createdAt: { gte: startDate },
      },
    });

    const [total, totalViews, totalDownloads, byStatus, recent] =
      await Promise.all([
        this.prisma.knowledgeItem.count({ where }),
        this.prisma.knowledgeItem.aggregate({
          where,
          _sum: { viewCount: true },
        }),
        this.prisma.knowledgeItem.aggregate({
          where,
          _sum: { downloadCount: true },
        }),
        this.prisma.knowledgeItem.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        this.prisma.knowledgeItem.findMany({
          where,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            sourceType: true,
            createdAt: true,
            viewCount: true,
            status: true,
          },
        }),
      ]);

    // 按 reportType 统计（通过 analysis）
    const byReportType = await this.prisma.knowledgeAnalysis.groupBy({
      by: ['reportType'],
      where: {
        knowledge: { type: 'RESEARCH' },
        reportType: { not: null },
      },
      _count: true,
    });

    // 品种/区域热度
    const allReports = await this.prisma.knowledgeItem.findMany({
      where,
      select: { commodities: true, region: true },
    });

    const commodityCount: Record<string, number> = {};
    const regionCount: Record<string, number> = {};
    allReports.forEach((r) => {
      r.commodities.forEach((c) => { commodityCount[c] = (commodityCount[c] || 0) + 1; });
      r.region.forEach((reg) => { regionCount[reg] = (regionCount[reg] || 0) + 1; });
    });

    const topCommodities = Object.entries(commodityCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const topRegions = Object.entries(regionCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      total,
      weeklyReportsCount,
      totalViews: totalViews._sum.viewCount || 0,
      totalDownloads: totalDownloads._sum.downloadCount || 0,
      byStatus: byStatus.reduce(
        (acc, item) => { acc[item.status] = item._count; return acc; },
        {} as Record<string, number>,
      ),
      byReportType: byReportType.reduce(
        (acc, item) => { if (item.reportType) acc[item.reportType] = item._count; return acc; },
        {} as Record<string, number>,
      ),
      topCommodities,
      topRegions,
      recent,
    };
  }

    async exportReports(ids?: string[], query?: {
    reportType?: string;
    status?: KnowledgeStatus;
    commodity?: string;
    region?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Prisma.KnowledgeItemWhereInput = { type: 'RESEARCH' };

    if (ids && ids.length > 0) {
      where.id = { in: ids };
    } else {
      if (query?.status) where.status = query.status;
      if (query?.commodity) where.commodities = { has: query.commodity };
      if (query?.region) where.region = { has: query.region };
      if (query?.startDate || query?.endDate) {
        where.publishAt = {};
        if (query?.startDate) where.publishAt.gte = query.startDate;
        if (query?.endDate) where.publishAt.lte = query.endDate;
      }
      if (query?.reportType) {
        where.analysis = { reportType: query.reportType };
      }
    }

    const items = await this.prisma.knowledgeItem.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishAt: 'desc' },
      take: 500,
    });

    // 动态导入 xlsx
    const XLSX = await import('xlsx');
    const worksheetData = items.map((item) => ({
      '标题': item.title,
      '类型': item.analysis?.reportType || '-',
      '来源': item.sourceType || '-',
      '品种': item.commodities.join(', '),
      '区域': item.region.join(', '),
      '状态': item.status,
      '发布日期': item.publishAt ? new Date(item.publishAt).toISOString().split('T')[0] : '-',
      '浏览次数': item.viewCount,
      '下载次数': item.downloadCount,
      '摘要': (item.analysis?.summary || item.contentPlain || '').slice(0, 200),
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '研报列表');
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
  }

}
