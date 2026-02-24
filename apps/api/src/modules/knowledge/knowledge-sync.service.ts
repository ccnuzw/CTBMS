import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { RagPipelineService } from './rag/rag-pipeline.service';
import * as KnowledgeUtils from './knowledge.utils';
import { BackfillResult } from './knowledge.utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class KnowledgeSyncService {
  private readonly logger = new Logger(KnowledgeSyncService.name);

  private buildRagMetadata(item: {
    publishAt?: Date | null;
    type?: string;
    sourceType?: string | null;
    authorId?: string;
    periodType?: string;
    periodKey?: string | null;
  }): Record<string, unknown> {
    return {
      publishDate: item.publishAt?.toISOString(),
      contentType: item.type,
      type: item.type,
      knowledgeType: item.type,
      sourceType: item.sourceType || 'UNKNOWN',
      authorId: item.authorId,
      periodType: item.periodType,
      periodKey: item.periodKey,
    };
  }

  constructor(
    private prisma: PrismaService,
    private ragPipelineService: RagPipelineService,
  ) {}
  async syncFromMarketIntel(intelId: string, options?: { skipRecursiveReportSync?: boolean }) {
    const intel = await this.prisma.marketIntel.findUnique({
      where: { id: intelId },
      include: {
        attachments: true,
        researchReport: true,
      },
    });

    if (!intel) {
      throw new NotFoundException(`MarketIntel ${intelId} 不存在`);
    }

    const existing = await this.prisma.knowledgeItem.findFirst({
      where: {
        originLegacyType: 'MARKET_INTEL',
        originLegacyId: intel.id,
      },
      select: { id: true },
    });

    const type = intel.researchReport
      ? 'RESEARCH'
      : KnowledgeUtils.mapLegacyContentTypeToKnowledgeType(intel.contentType);

    const item = existing
      ? await this.prisma.knowledgeItem.update({
          where: { id: existing.id },
          data: {
            type,
            title:
              intel.researchReport?.title ||
              intel.summary?.slice(0, 80) ||
              intel.rawContent.slice(0, 80) ||
              '未命名内容',
            contentPlain: intel.rawContent || '',
            contentRich: intel.summary || intel.rawContent,
            sourceType: intel.sourceType,
            publishAt: intel.effectiveTime,
            effectiveAt: intel.effectiveTime,
            periodType: KnowledgeUtils.mapLegacyContentTypeToPeriodType(intel.contentType),
            periodKey: KnowledgeUtils.toPeriodKey(
              intel.effectiveTime,
              KnowledgeUtils.mapLegacyContentTypeToPeriodType(intel.contentType),
            ),
            location: intel.location,
            region: intel.region || [],
            status: 'PUBLISHED',
            authorId: intel.authorId,
          },
        })
      : await this.prisma.knowledgeItem.create({
          data: {
            type,
            title:
              intel.researchReport?.title ||
              intel.summary?.slice(0, 80) ||
              intel.rawContent.slice(0, 80) ||
              '未命名内容',
            contentPlain: intel.rawContent || '',
            contentRich: intel.summary || intel.rawContent,
            sourceType: intel.sourceType,
            publishAt: intel.effectiveTime,
            effectiveAt: intel.effectiveTime,
            periodType: KnowledgeUtils.mapLegacyContentTypeToPeriodType(intel.contentType),
            periodKey: KnowledgeUtils.toPeriodKey(
              intel.effectiveTime,
              KnowledgeUtils.mapLegacyContentTypeToPeriodType(intel.contentType),
            ),
            location: intel.location,
            region: intel.region || [],
            status: 'PUBLISHED',
            authorId: intel.authorId,
            originLegacyType: 'MARKET_INTEL',
            originLegacyId: intel.id,
          },
        });

    const aiAnalysis = (intel.aiAnalysis ?? {}) as {
      summary?: string;
      sentiment?: string;
      confidenceScore?: number;
      tags?: string[];
      marketSentiment?: unknown;
      keyPoints?: unknown;
      prediction?: unknown;
      dataPoints?: unknown;
      events?: unknown;
      insights?: unknown;
      traceLogs?: unknown;
      commodities?: string[];
      regions?: string[];
      reportType?: string;
      reportPeriod?: string;
    };

    await this.prisma.knowledgeAnalysis.upsert({
      where: { knowledgeId: item.id },
      create: {
        knowledgeId: item.id,
        summary: aiAnalysis.summary || intel.summary,
        sentiment: aiAnalysis.sentiment,
        confidenceScore: aiAnalysis.confidenceScore,
        reportType: aiAnalysis.reportType,
        reportPeriod: aiAnalysis.reportPeriod,
        keyPoints: aiAnalysis.keyPoints as Prisma.InputJsonValue,
        prediction: aiAnalysis.prediction as Prisma.InputJsonValue,
        dataPoints: aiAnalysis.dataPoints as Prisma.InputJsonValue,
        events: aiAnalysis.events as Prisma.InputJsonValue,
        insights: aiAnalysis.insights as Prisma.InputJsonValue,
        marketSentiment: aiAnalysis.marketSentiment as Prisma.InputJsonValue,
        tags: aiAnalysis.tags || [],
        traceLogs: aiAnalysis.traceLogs as Prisma.InputJsonValue,
      },
      update: {
        summary: aiAnalysis.summary || intel.summary,
        sentiment: aiAnalysis.sentiment,
        confidenceScore: aiAnalysis.confidenceScore,
        reportType: aiAnalysis.reportType,
        reportPeriod: aiAnalysis.reportPeriod,
        keyPoints: aiAnalysis.keyPoints as Prisma.InputJsonValue,
        prediction: aiAnalysis.prediction as Prisma.InputJsonValue,
        dataPoints: aiAnalysis.dataPoints as Prisma.InputJsonValue,
        events: aiAnalysis.events as Prisma.InputJsonValue,
        insights: aiAnalysis.insights as Prisma.InputJsonValue,
        marketSentiment: aiAnalysis.marketSentiment as Prisma.InputJsonValue,
        tags: aiAnalysis.tags || [],
        traceLogs: aiAnalysis.traceLogs as Prisma.InputJsonValue,
      },
    });

    await this.prisma.knowledgeAttachment.deleteMany({ where: { knowledgeId: item.id } });
    if (intel.attachments.length > 0) {
      await this.prisma.knowledgeAttachment.createMany({
        data: intel.attachments.map((att) => ({
          knowledgeId: item.id,
          filename: att.filename,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          storagePath: att.storagePath,
          ocrText: att.ocrText,
        })),
      });
    }

    // Trigger Vectorization (RAG Ingest)
    const content = item.contentPlain || item.contentRich || '';
    if (content) {
      const ingestResult = await this.ragPipelineService.ingest(
        item.id,
        content,
        this.buildRagMetadata(item),
      );
      if (ingestResult.errorCode) {
        this.logger.warn(
          `[syncFromMarketIntel] RAG ingest issue for ${item.id}: ${ingestResult.errorCode} (${ingestResult.errorMessage || 'no details'})`,
        );
      }
    }

    if (intel.researchReport?.id && !options?.skipRecursiveReportSync) {
      await this.syncFromResearchReport(intel.researchReport.id);
    }

    return item.id;
  }

  async syncFromResearchReport(reportId: string) {
    const report = await this.prisma.researchReport.findUnique({
      where: { id: reportId },
      include: {
        intel: true,
      },
    });

    if (!report) {
      throw new NotFoundException(`ResearchReport ${reportId} 不存在`);
    }

    const knowledgeId = await this.syncFromMarketIntel(report.intelId, {
      skipRecursiveReportSync: true,
    });

    await this.prisma.knowledgeItem.update({
      where: { id: knowledgeId },
      data: {
        type: 'RESEARCH',
        title: report.title,
        sourceType: report.source || report.intel.sourceType,
        publishAt: report.publishDate || report.intel.effectiveTime,
        effectiveAt: report.publishDate || report.intel.effectiveTime,
        periodType: KnowledgeUtils.mapReportPeriodToKnowledgePeriodType(report.reportPeriod),
        periodKey: KnowledgeUtils.toPeriodKey(
          report.publishDate || report.intel.effectiveTime,
          KnowledgeUtils.mapReportPeriodToKnowledgePeriodType(report.reportPeriod),
        ),
        commodities: report.commodities || [],
        region: report.regions || [],
        status: KnowledgeUtils.mapReviewStatusToKnowledgeStatus(report.reviewStatus),
      },
    });

    await this.prisma.knowledgeAnalysis.upsert({
      where: { knowledgeId },
      create: {
        knowledgeId,
        summary: report.summary,
        reportType: report.reportType,
        reportPeriod: report.reportPeriod,
        keyPoints: report.keyPoints as Prisma.InputJsonValue,
        prediction: report.prediction as Prisma.InputJsonValue,
        dataPoints: report.dataPoints as Prisma.InputJsonValue,
        tags: report.commodities || [],
      },
      update: {
        summary: report.summary,
        reportType: report.reportType,
        reportPeriod: report.reportPeriod,
        keyPoints: report.keyPoints as Prisma.InputJsonValue,
        prediction: report.prediction as Prisma.InputJsonValue,
        dataPoints: report.dataPoints as Prisma.InputJsonValue,
        tags: report.commodities || [],
      },
    });

    return knowledgeId;
  }

  async backfillFromLegacy(limit = 500): Promise<BackfillResult> {
    const failures: BackfillResult['failures'] = [];
    let intelProcessed = 0;
    let reportProcessed = 0;

    const intels = await this.prisma.marketIntel.findMany({
      take: Math.max(1, limit),
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    for (const intel of intels) {
      try {
        await this.syncFromMarketIntel(intel.id);
        intelProcessed += 1;
      } catch (error) {
        failures.push({
          source: 'intel',
          id: intel.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const reports = await this.prisma.researchReport.findMany({
      take: Math.max(1, limit),
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    for (const report of reports) {
      try {
        await this.syncFromResearchReport(report.id);
        reportProcessed += 1;
      } catch (error) {
        failures.push({
          source: 'report',
          id: report.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { intelProcessed, reportProcessed, failures };
  }

  async checkLegacyConsistency(sampleSize = 50) {
    const [legacyIntelCount, legacyReportCount, knowledgeCount] = await Promise.all([
      this.prisma.marketIntel.count(),
      this.prisma.researchReport.count(),
      this.prisma.knowledgeItem.count(),
    ]);

    const legacyIntelIds = await this.prisma.marketIntel.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: sampleSize,
    });

    const missingIntelLinks: string[] = [];
    for (const intel of legacyIntelIds) {
      const exists = await this.prisma.knowledgeItem.findFirst({
        where: {
          originLegacyType: 'MARKET_INTEL',
          originLegacyId: intel.id,
        },
        select: { id: true },
      });
      if (!exists) missingIntelLinks.push(intel.id);
    }

    const recentReports = await this.prisma.researchReport.findMany({
      select: { id: true, intelId: true },
      orderBy: { createdAt: 'desc' },
      take: sampleSize,
    });

    const missingReportKnowledge: string[] = [];
    for (const report of recentReports) {
      const related = await this.prisma.knowledgeItem.findFirst({
        where: {
          originLegacyType: 'MARKET_INTEL',
          originLegacyId: report.intelId,
          type: 'RESEARCH',
        },
        select: { id: true },
      });
      if (!related) missingReportKnowledge.push(report.id);
    }

    return {
      counts: {
        legacyIntelCount,
        legacyReportCount,
        knowledgeCount,
      },
      sampleSize,
      missingIntelLinks,
      missingReportKnowledge,
    };
  }

  async resolveLegacy(source: 'intel' | 'report', id: string) {
    if (source === 'intel') {
      const item = await this.prisma.knowledgeItem.findFirst({
        where: {
          originLegacyType: 'MARKET_INTEL',
          originLegacyId: id,
        },
        select: { id: true, type: true, title: true },
      });
      if (!item) {
        throw new NotFoundException(`未找到对应知识条目: intel/${id}`);
      }
      return item;
    }

    const report = await this.prisma.researchReport.findUnique({
      where: { id },
      select: { intelId: true },
    });
    if (!report) {
      throw new NotFoundException(`研报 ${id} 不存在`);
    }

    const item = await this.prisma.knowledgeItem.findFirst({
      where: {
        originLegacyType: 'MARKET_INTEL',
        originLegacyId: report.intelId,
      },
      select: { id: true, type: true, title: true },
    });

    if (!item) {
      throw new NotFoundException(`未找到对应知识条目: report/${id}`);
    }

    return item;
  }
}
