import {
  PrismaClient,
  ContentType,
  KnowledgePeriodType,
  KnowledgeStatus,
  KnowledgeType,
  ReviewStatus,
  Prisma,
} from '@prisma/client';

const prisma = new PrismaClient();

function mapContentTypeToKnowledgeType(contentType: ContentType | null): KnowledgeType {
  if (contentType === 'DAILY_REPORT') return 'DAILY';
  if (contentType === 'RESEARCH_REPORT') return 'RESEARCH';
  return 'THIRD_PARTY';
}

function mapContentTypeToPeriodType(contentType: ContentType | null): KnowledgePeriodType {
  if (contentType === 'DAILY_REPORT') return 'DAY';
  return 'ADHOC';
}

function mapReviewStatusToKnowledgeStatus(reviewStatus: ReviewStatus): KnowledgeStatus {
  if (reviewStatus === 'APPROVED') return 'PUBLISHED';
  if (reviewStatus === 'REJECTED') return 'REJECTED';
  if (reviewStatus === 'ARCHIVED') return 'ARCHIVED';
  return 'PENDING_REVIEW';
}

function toPeriodKey(date: Date, periodType: KnowledgePeriodType): string {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  if (periodType === 'DAY') return `${y}-${m}-${day}`;
  if (periodType === 'MONTH') return `${y}-${m}`;
  if (periodType === 'YEAR') return `${y}`;
  return `${y}-${m}-${day}`;
}

async function syncIntel(intelId: string) {
  const intel = await prisma.marketIntel.findUnique({
    where: { id: intelId },
    include: { attachments: true, researchReport: true },
  });
  if (!intel) return;

  const existing = await prisma.knowledgeItem.findFirst({
    where: { originLegacyType: 'MARKET_INTEL', originLegacyId: intel.id },
    select: { id: true },
  });

  const periodType = mapContentTypeToPeriodType(intel.contentType);
  const type = intel.researchReport ? 'RESEARCH' : mapContentTypeToKnowledgeType(intel.contentType);
  const title =
    intel.researchReport?.title ||
    intel.summary?.slice(0, 80) ||
    intel.rawContent.slice(0, 80) ||
    '未命名内容';

  const item = existing
    ? await prisma.knowledgeItem.update({
      where: { id: existing.id },
      data: {
        type,
        title,
        contentPlain: intel.rawContent,
        contentRich: intel.summary || intel.rawContent,
        sourceType: intel.sourceType,
        publishAt: intel.effectiveTime,
        effectiveAt: intel.effectiveTime,
        periodType,
        periodKey: toPeriodKey(intel.effectiveTime, periodType),
        location: intel.location,
        region: intel.region,
        status: 'PUBLISHED',
        authorId: intel.authorId,
      },
    })
    : await prisma.knowledgeItem.create({
      data: {
        type,
        title,
        contentPlain: intel.rawContent,
        contentRich: intel.summary || intel.rawContent,
        sourceType: intel.sourceType,
        publishAt: intel.effectiveTime,
        effectiveAt: intel.effectiveTime,
        periodType,
        periodKey: toPeriodKey(intel.effectiveTime, periodType),
        location: intel.location,
        region: intel.region,
        status: 'PUBLISHED',
        authorId: intel.authorId,
        originLegacyType: 'MARKET_INTEL',
        originLegacyId: intel.id,
      },
    });

  const ai = (intel.aiAnalysis ?? {}) as {
    summary?: string;
    sentiment?: string;
    confidenceScore?: number;
    reportType?: string;
    reportPeriod?: string;
    keyPoints?: unknown;
    prediction?: unknown;
    dataPoints?: unknown;
    events?: unknown;
    insights?: unknown;
    marketSentiment?: unknown;
    traceLogs?: unknown;
    tags?: string[];
  };

  await prisma.knowledgeAnalysis.upsert({
    where: { knowledgeId: item.id },
    create: {
      knowledgeId: item.id,
      summary: ai.summary || intel.summary,
      sentiment: ai.sentiment,
      confidenceScore: ai.confidenceScore,
      reportType: ai.reportType,
      reportPeriod: ai.reportPeriod,
      keyPoints: ai.keyPoints as Prisma.InputJsonValue,
      prediction: ai.prediction as Prisma.InputJsonValue,
      dataPoints: ai.dataPoints as Prisma.InputJsonValue,
      events: ai.events as Prisma.InputJsonValue,
      insights: ai.insights as Prisma.InputJsonValue,
      marketSentiment: ai.marketSentiment as Prisma.InputJsonValue,
      traceLogs: ai.traceLogs as Prisma.InputJsonValue,
      tags: ai.tags || [],
    },
    update: {
      summary: ai.summary || intel.summary,
      sentiment: ai.sentiment,
      confidenceScore: ai.confidenceScore,
      reportType: ai.reportType,
      reportPeriod: ai.reportPeriod,
      keyPoints: ai.keyPoints as Prisma.InputJsonValue,
      prediction: ai.prediction as Prisma.InputJsonValue,
      dataPoints: ai.dataPoints as Prisma.InputJsonValue,
      events: ai.events as Prisma.InputJsonValue,
      insights: ai.insights as Prisma.InputJsonValue,
      marketSentiment: ai.marketSentiment as Prisma.InputJsonValue,
      traceLogs: ai.traceLogs as Prisma.InputJsonValue,
      tags: ai.tags || [],
    },
  });

  await prisma.knowledgeAttachment.deleteMany({ where: { knowledgeId: item.id } });
  if (intel.attachments.length) {
    await prisma.knowledgeAttachment.createMany({
      data: intel.attachments.map((a) => ({
        knowledgeId: item.id,
        filename: a.filename,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        storagePath: a.storagePath,
        ocrText: a.ocrText,
      })),
    });
  }
}

async function syncReport(reportId: string) {
  const report = await prisma.researchReport.findUnique({ where: { id: reportId } });
  if (!report) return;

  await syncIntel(report.intelId);
  const item = await prisma.knowledgeItem.findFirst({
    where: { originLegacyType: 'MARKET_INTEL', originLegacyId: report.intelId },
    select: { id: true },
  });
  if (!item) return;

  await prisma.knowledgeItem.update({
    where: { id: item.id },
    data: {
      type: 'RESEARCH',
      title: report.title,
      publishAt: report.publishDate,
      effectiveAt: report.publishDate,
      commodities: report.commodities,
      region: report.regions,
      status: mapReviewStatusToKnowledgeStatus(report.reviewStatus),
    },
  });

  await prisma.knowledgeAnalysis.upsert({
    where: { knowledgeId: item.id },
    create: {
      knowledgeId: item.id,
      summary: report.summary,
      reportType: report.reportType,
      reportPeriod: report.reportPeriod,
      keyPoints: report.keyPoints as Prisma.InputJsonValue,
      prediction: report.prediction as Prisma.InputJsonValue,
      dataPoints: report.dataPoints as Prisma.InputJsonValue,
      tags: report.commodities,
    },
    update: {
      summary: report.summary,
      reportType: report.reportType,
      reportPeriod: report.reportPeriod,
      keyPoints: report.keyPoints as Prisma.InputJsonValue,
      prediction: report.prediction as Prisma.InputJsonValue,
      dataPoints: report.dataPoints as Prisma.InputJsonValue,
      tags: report.commodities,
    },
  });
}

async function main() {
  const limitArg = process.argv[2];
  const limit = Number.isFinite(Number(limitArg)) ? Number(limitArg) : 500;

  try {
    const [intels, reports] = await Promise.all([
      prisma.marketIntel.findMany({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      }),
      prisma.researchReport.findMany({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      }),
    ]);

    const failures: Array<{ source: 'intel' | 'report'; id: string; reason: string }> = [];

    let intelProcessed = 0;
    for (const intel of intels) {
      try {
        await syncIntel(intel.id);
        intelProcessed += 1;
      } catch (error) {
        failures.push({
          source: 'intel',
          id: intel.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let reportProcessed = 0;
    for (const report of reports) {
      try {
        await syncReport(report.id);
        reportProcessed += 1;
      } catch (error) {
        failures.push({
          source: 'report',
          id: report.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const [legacyIntelCount, legacyReportCount, knowledgeCount] = await Promise.all([
      prisma.marketIntel.count(),
      prisma.researchReport.count(),
      prisma.knowledgeItem.count(),
    ]);

    console.log('[Knowledge Backfill] done', {
      limit,
      intelProcessed,
      reportProcessed,
      failureCount: failures.length,
      counts: { legacyIntelCount, legacyReportCount, knowledgeCount },
    });

    if (failures.length > 0) {
      console.log('[Knowledge Backfill] failures', failures.slice(0, 20));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[Knowledge Backfill] failed', error);
  process.exit(1);
});
