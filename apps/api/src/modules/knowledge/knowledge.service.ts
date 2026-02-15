import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentType as PrismaContentType,
  IntelCategory,
  KnowledgePeriodType,
  KnowledgeRelationType,
  KnowledgeStatus,
  ReviewStatus,
  KnowledgeType,
  Prisma,
} from '@prisma/client';
import { ContentType } from '@packages/types';
import { AIService } from '../ai/ai.service';
import { PrismaService } from '../../prisma';

type KnowledgeListQuery = {
  type?: KnowledgeType;
  status?: KnowledgeStatus;
  periodType?: KnowledgePeriodType;
  periodKey?: string;
  sourceType?: string;
  commodity?: string;
  region?: string;
  keyword?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  authorId?: string;
};

export type CreateKnowledgeInput = {
  type: KnowledgeType;
  title: string;
  contentPlain: string;
  contentRich?: string;
  sourceType?: string;
  publishAt?: Date;
  effectiveAt?: Date;
  periodType?: KnowledgePeriodType;
  periodKey?: string;
  location?: string;
  region?: string[];
  commodities?: string[];
  status?: KnowledgeStatus;
  authorId: string;
  summary?: string;
  tags?: string[];
};

export type UpdateKnowledgeInput = Partial<CreateKnowledgeInput>;

type BackfillResult = {
  intelProcessed: number;
  reportProcessed: number;
  failures: Array<{ source: 'intel' | 'report'; id: string; reason: string }>;
};

type RelationQueryOptions = {
  types?: KnowledgeRelationType[];
  minWeight?: number;
  limit?: number;
  direction?: 'incoming' | 'outgoing' | 'both';
};

@Injectable()
export class KnowledgeService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
  ) { }

  async findAll(query: KnowledgeListQuery) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const where: Prisma.KnowledgeItemWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.periodType) where.periodType = query.periodType;
    if (query.periodKey) where.periodKey = query.periodKey;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.commodity) where.commodities = { has: query.commodity };
    if (query.region) where.region = { has: query.region };
    if (query.authorId) where.authorId = query.authorId;

    if (query.startDate || query.endDate) {
      where.publishAt = {
        ...(query.startDate ? { gte: query.startDate } : {}),
        ...(query.endDate ? { lte: query.endDate } : {}),
      };
    }

    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { contentPlain: { contains: query.keyword, mode: 'insensitive' } },
        { analysis: { summary: { contains: query.keyword, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          analysis: true,
          attachments: true,
          _count: { select: { relationsFrom: true, relationsTo: true } },
        },
      }),
      this.prisma.knowledgeItem.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
      include: {
        analysis: true,
        attachments: true,
        relationsFrom: {
          include: {
            toKnowledge: {
              select: { id: true, title: true, type: true, publishAt: true },
            },
          },
        },
        relationsTo: {
          include: {
            fromKnowledge: {
              select: { id: true, title: true, type: true, publishAt: true },
            },
          },
        },
        tagMaps: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`知识条目 ID ${id} 不存在`);
    }

    return item;
  }

  async create(input: CreateKnowledgeInput) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.knowledgeItem.create({
        data: {
          type: input.type,
          title: input.title,
          contentPlain: input.contentPlain,
          contentRich: input.contentRich,
          sourceType: input.sourceType,
          publishAt: input.publishAt,
          effectiveAt: input.effectiveAt,
          periodType: input.periodType || 'ADHOC',
          periodKey: input.periodKey,
          location: input.location,
          region: input.region || [],
          commodities: input.commodities || [],
          status: input.status || 'DRAFT',
          authorId: input.authorId,
        },
      });

      if (input.summary || input.tags?.length) {
        await tx.knowledgeAnalysis.create({
          data: {
            knowledgeId: item.id,
            summary: input.summary,
            tags: input.tags || [],
          },
        });
      }

      return this.findOne(item.id);
    });
  }

  /**
   * 提交报告并创建 KnowledgeItem（路径 A：人工填报）
   * 支持日报/周报/月报，可选关联 IntelTask 自动标记为 SUBMITTED
   */
  async submitReport(input: {
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    title: string;
    contentPlain: string;
    contentRich?: string;
    commodities?: string[];
    region?: string[];
    authorId: string;
    taskId?: string;
    triggerAnalysis?: boolean;
  }) {
    const periodTypeMap = {
      DAILY: KnowledgePeriodType.DAY,
      WEEKLY: KnowledgePeriodType.WEEK,
      MONTHLY: KnowledgePeriodType.MONTH,
    };

    const now = new Date();
    const periodType = periodTypeMap[input.type];

    // 自动生成 periodKey
    let periodKey: string;
    if (input.type === 'DAILY') {
      periodKey = now.toISOString().split('T')[0]; // 2026-02-10
    } else if (input.type === 'WEEKLY') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      periodKey = `${startOfWeek.toISOString().split('T')[0]}_W`;
    } else {
      periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. 创建 KnowledgeItem
      const item = await tx.knowledgeItem.create({
        data: {
          type: KnowledgeType[input.type],
          title: input.title,
          contentPlain: input.contentPlain,
          contentRich: input.contentRich,
          sourceType: 'MANUAL_REPORT',
          publishAt: now,
          effectiveAt: now,
          periodType,
          periodKey,
          region: input.region || [],
          commodities: input.commodities || [],
          status: 'PENDING_REVIEW',
          authorId: input.authorId,
        },
      });

      // 2. 如果有关联任务，自动标记为 SUBMITTED
      if (input.taskId) {
        const task = await tx.intelTask.findUnique({
          where: { id: input.taskId },
        });
        if (task && (task.status === 'PENDING' || task.status === 'RETURNED' || task.status === 'OVERDUE')) {
          await tx.intelTask.update({
            where: { id: input.taskId },
            data: {
              status: 'SUBMITTED',
              completedAt: now,
            },
          });
        }
      }

      // 3. 触发 AI 分析（异步，不阻塞返回）
      if (input.triggerAnalysis !== false) {
        this.reanalyze(item.id, true).catch((err) => {
          console.warn(`[submitReport] AI analysis failed for ${item.id}:`, err.message);
        });
      }

      return this.findOne(item.id);
    });
  }

  async update(id: string, input: UpdateKnowledgeInput) {
    await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeItem.update({
        where: { id },
        data: {
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.contentPlain !== undefined ? { contentPlain: input.contentPlain } : {}),
          ...(input.contentRich !== undefined ? { contentRich: input.contentRich } : {}),
          ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
          ...(input.publishAt !== undefined ? { publishAt: input.publishAt } : {}),
          ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
          ...(input.periodType !== undefined ? { periodType: input.periodType } : {}),
          ...(input.periodKey !== undefined ? { periodKey: input.periodKey } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.commodities !== undefined ? { commodities: input.commodities } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.authorId !== undefined ? { authorId: input.authorId } : {}),
        },
      });

      if (input.summary !== undefined || input.tags !== undefined) {
        await tx.knowledgeAnalysis.upsert({
          where: { knowledgeId: id },
          create: {
            knowledgeId: id,
            summary: input.summary,
            tags: input.tags || [],
          },
          update: {
            ...(input.summary !== undefined ? { summary: input.summary } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
          },
        });
      }
    });

    return this.findOne(id);
  }

  async updateReport(id: string, input: {
    title?: string;
    contentPlain?: string;
    contentRich?: string;
    commodities?: string[];
    region?: string[];
    authorId: string; // 用于校验权限
  }) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`报告 ID ${id} 不存在`);
    }

    if (item.authorId !== input.authorId) {
      throw new BadRequestException('无权修改他人报告');
    }

    if (item.status !== 'PENDING_REVIEW' && item.status !== 'REJECTED') {
      throw new BadRequestException('只有待审核或被驳回的报告可以修改');
    }

    // 更新报告（同时重置状态为 PENDING_REVIEW 如果是被驳回的）
    // 如果是 PENDING_REVIEW，保持不变。如果是 REJECTED，修改后变回 PENDING_REVIEW
    const newStatus = item.status === 'REJECTED' ? 'PENDING_REVIEW' : item.status;

    await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.contentPlain ? { contentPlain: input.contentPlain } : {}),
        ...(input.contentRich ? { contentRich: input.contentRich } : {}),
        ...(input.commodities ? { commodities: input.commodities } : {}),
        ...(input.region ? { region: input.region } : {}),
        status: newStatus,
      },
    });

    // 触发重新分析（如果是被驳回修改的，可能需要重新分析）
    this.reanalyze(id, true).catch((err) => {
      console.warn(`[updateReport] AI re-analysis failed for ${id}:`, err.message);
    });

    return this.findOne(id);
  }

  async getPendingReviewList(page = 1, pageSize = 20) {
    const [data, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        where: { status: 'PENDING_REVIEW' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          analysis: true,
        },
      }),
      this.prisma.knowledgeItem.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);

    return { data, total, page, pageSize };
  }

  async reviewReport(
    id: string,
    input: {
      action: 'APPROVE' | 'REJECT';
      reviewerId: string;
      rejectReason?: string;
    },
  ) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`报告 ID ${id} 不存在`);
    }

    if (item.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('该报告不在待审核状态');
    }

    const now = new Date();
    const newStatus =
      input.action === 'APPROVE' ? KnowledgeStatus.PUBLISHED : KnowledgeStatus.REJECTED;

    await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        status: newStatus,
        reviewerId: input.reviewerId,
        reviewedAt: now,
        rejectReason: input.action === 'REJECT' ? input.rejectReason : null,
      },
    });

    // 如果通过审核 & 之前未分析成功，触发重新分析
    if (input.action === 'APPROVE') {
      // 可以在这里触发后续逻辑，如积分计算、自动关联等
      this.reanalyze(id, false).catch((err) => {
        console.warn(`[reviewReport] Post-approval analysis failed for ${id}:`, err.message);
      });
    }

    return this.findOne(id);
  }
  async reanalyze(id: string, triggerDeepAnalysis = true) {
    const item = await this.findOne(id);
    const content = item.contentPlain || item.contentRich || '';
    if (!content.trim()) {
      throw new BadRequestException('内容为空，无法执行分析');
    }

    const contentType = this.toContentType(item.type);
    const result = await this.aiService.analyzeContent(
      content,
      IntelCategory.C_DOCUMENT,
      item.location || undefined,
      undefined,
      undefined,
      contentType,
    );

    const summary = triggerDeepAnalysis ? result.summary : (result.summary || '').slice(0, 200);

    await this.prisma.knowledgeAnalysis.upsert({
      where: { knowledgeId: id },
      create: {
        knowledgeId: id,
        summary,
        sentiment: result.sentiment,
        confidenceScore: result.confidenceScore,
        reportType: result.reportType,
        reportPeriod: result.reportPeriod,
        keyPoints: result.keyPoints as Prisma.InputJsonValue,
        prediction: result.prediction as Prisma.InputJsonValue,
        dataPoints: result.dataPoints as Prisma.InputJsonValue,
        events: result.events as Prisma.InputJsonValue,
        insights: result.insights as Prisma.InputJsonValue,
        marketSentiment: result.marketSentiment as Prisma.InputJsonValue,
        tags: result.tags || [],
        traceLogs: result.traceLogs as Prisma.InputJsonValue,
      },
      update: {
        summary,
        sentiment: result.sentiment,
        confidenceScore: result.confidenceScore,
        reportType: result.reportType,
        reportPeriod: result.reportPeriod,
        keyPoints: result.keyPoints as Prisma.InputJsonValue,
        prediction: result.prediction as Prisma.InputJsonValue,
        dataPoints: result.dataPoints as Prisma.InputJsonValue,
        events: result.events as Prisma.InputJsonValue,
        insights: result.insights as Prisma.InputJsonValue,
        marketSentiment: result.marketSentiment as Prisma.InputJsonValue,
        tags: result.tags || [],
        traceLogs: result.traceLogs as Prisma.InputJsonValue,
      },
    });

    return this.findOne(id);
  }

  async createRelation(
    fromKnowledgeId: string,
    toKnowledgeId: string,
    relationType: KnowledgeRelationType,
    weight = 50,
    evidence?: string,
  ) {
    if (fromKnowledgeId === toKnowledgeId) {
      throw new BadRequestException('fromKnowledgeId 和 toKnowledgeId 不能相同');
    }

    await Promise.all([this.findOne(fromKnowledgeId), this.findOne(toKnowledgeId)]);

    return this.prisma.knowledgeRelation.upsert({
      where: {
        fromKnowledgeId_toKnowledgeId_relationType: {
          fromKnowledgeId,
          toKnowledgeId,
          relationType,
        },
      },
      create: {
        fromKnowledgeId,
        toKnowledgeId,
        relationType,
        weight,
        evidence,
      },
      update: {
        weight,
        evidence,
      },
      include: {
        fromKnowledge: { select: { id: true, title: true, type: true } },
        toKnowledge: { select: { id: true, title: true, type: true } },
      },
    });
  }

  async getRelations(id: string, options?: RelationQueryOptions) {
    await this.findOne(id);

    const minWeight = options?.minWeight ?? 0;
    const take = Math.max(1, Math.min(200, options?.limit ?? 50));
    const direction = options?.direction || 'both';

    const relationWhere = {
      ...(options?.types && options.types.length > 0
        ? { relationType: { in: options.types } }
        : {}),
      ...(minWeight > 0 ? { weight: { gte: minWeight } } : {}),
    };

    if (direction === 'outgoing') {
      const outgoing = await this.prisma.knowledgeRelation.findMany({
        where: {
          fromKnowledgeId: id,
          ...relationWhere,
        },
        include: {
          toKnowledge: { select: { id: true, title: true, type: true, publishAt: true } },
        },
        orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
        take,
      });
      return { outgoing, incoming: [] };
    }

    if (direction === 'incoming') {
      const incoming = await this.prisma.knowledgeRelation.findMany({
        where: {
          toKnowledgeId: id,
          ...relationWhere,
        },
        include: {
          fromKnowledge: { select: { id: true, title: true, type: true, publishAt: true } },
        },
        orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
        take,
      });
      return { outgoing: [], incoming };
    }

    const [outgoing, incoming] = await Promise.all([
      this.prisma.knowledgeRelation.findMany({
        where: {
          fromKnowledgeId: id,
          ...relationWhere,
        },
        include: {
          toKnowledge: { select: { id: true, title: true, type: true, publishAt: true } },
        },
        orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.knowledgeRelation.findMany({
        where: {
          toKnowledgeId: id,
          ...relationWhere,
        },
        include: {
          fromKnowledge: { select: { id: true, title: true, type: true, publishAt: true } },
        },
        orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
    ]);

    return { outgoing, incoming };
  }

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
    const target = periodKey || this.getWeekRange(new Date()).periodKey;

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
      return {
        periodKey: target,
        found: false,
        metrics: null,
        sourceStats: { totalSources: 0, byType: {} as Record<string, number> },
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

    const where: Prisma.KnowledgeItemWhereInput = {
      type: 'WEEKLY',
      periodType: 'WEEK',
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

  async syncFromMarketIntel(intelId: string) {
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
      : this.mapLegacyContentTypeToKnowledgeType(intel.contentType);

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
          periodType: this.mapLegacyContentTypeToPeriodType(intel.contentType),
          periodKey: this.toPeriodKey(
            intel.effectiveTime,
            this.mapLegacyContentTypeToPeriodType(intel.contentType),
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
          periodType: this.mapLegacyContentTypeToPeriodType(intel.contentType),
          periodKey: this.toPeriodKey(
            intel.effectiveTime,
            this.mapLegacyContentTypeToPeriodType(intel.contentType),
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

    if (intel.researchReport?.id) {
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

    const knowledgeId = await this.syncFromMarketIntel(report.intelId);

    await this.prisma.knowledgeItem.update({
      where: { id: knowledgeId },
      data: {
        type: 'RESEARCH',
        title: report.title,
        sourceType: report.source || report.intel.sourceType,
        publishAt: report.publishDate || report.intel.effectiveTime,
        effectiveAt: report.publishDate || report.intel.effectiveTime,
        periodType: this.mapReportPeriodToKnowledgePeriodType(report.reportPeriod),
        periodKey: this.toPeriodKey(
          report.publishDate || report.intel.effectiveTime,
          this.mapReportPeriodToKnowledgePeriodType(report.reportPeriod),
        ),
        commodities: report.commodities || [],
        region: report.regions || [],
        status: this.mapReviewStatusToKnowledgeStatus(report.reviewStatus),
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

  async generateWeeklyRollup(options?: {
    targetDate?: Date;
    authorId?: string;
    triggerAnalysis?: boolean;
  }) {
    const targetDate = options?.targetDate || new Date();
    const authorId = options?.authorId || 'system-user-placeholder';
    const triggerAnalysis = options?.triggerAnalysis ?? true;

    const { weekStart, weekEnd, periodKey } = this.getWeekRange(targetDate);

    const sourceItems = await this.prisma.knowledgeItem.findMany({
      where: {
        type: { in: ['DAILY', 'RESEARCH'] },
        status: { in: ['PUBLISHED', 'APPROVED'] },
        publishAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      orderBy: { publishAt: 'asc' },
      include: { analysis: true },
    });

    if (sourceItems.length === 0) {
      throw new BadRequestException(`周报生成失败：${periodKey} 周内无可用知识条目`);
    }

    const commodities = Array.from(new Set(sourceItems.flatMap((item) => item.commodities || [])));
    const regions = Array.from(new Set(sourceItems.flatMap((item) => item.region || [])));

    const sections = this.buildWeeklySections(sourceItems);
    const metrics = this.buildWeeklyMetrics(sections);
    const contentPlain = this.renderWeeklyPlainContent(periodKey, sections);
    const contentRich = this.renderWeeklyRichContent(periodKey, sections);
    const summary = this.buildWeeklySummary(periodKey, sections, sourceItems.length);

    const title = `${periodKey} 周度商情汇总`;

    let weekly = await this.prisma.knowledgeItem.findFirst({
      where: {
        type: 'WEEKLY',
        periodType: 'WEEK',
        periodKey,
      },
      select: { id: true },
    });

    if (weekly) {
      await this.prisma.knowledgeItem.update({
        where: { id: weekly.id },
        data: {
          title,
          contentPlain,
          contentRich,
          publishAt: weekEnd,
          effectiveAt: weekEnd,
          commodities,
          region: regions,
          status: 'PUBLISHED',
          authorId,
        },
      });
    } else {
      const created = await this.prisma.knowledgeItem.create({
        data: {
          type: 'WEEKLY',
          title,
          contentPlain,
          contentRich,
          sourceType: 'INTERNAL_REPORT',
          publishAt: weekEnd,
          effectiveAt: weekEnd,
          periodType: 'WEEK',
          periodKey,
          commodities,
          region: regions,
          status: 'PUBLISHED',
          authorId,
        },
      });
      weekly = { id: created.id };
    }

    await this.prisma.knowledgeAnalysis.upsert({
      where: { knowledgeId: weekly.id },
      create: {
        knowledgeId: weekly.id,
        summary,
        reportType: 'MARKET',
        reportPeriod: 'WEEKLY',
        keyPoints: {
          market: sections.market,
          events: sections.events,
          risks: sections.risks,
          outlook: sections.outlook,
          metrics,
        } as Prisma.InputJsonValue,
        tags: commodities,
      },
      update: {
        summary,
        reportType: 'MARKET',
        reportPeriod: 'WEEKLY',
        keyPoints: {
          market: sections.market,
          events: sections.events,
          risks: sections.risks,
          outlook: sections.outlook,
          metrics,
        } as Prisma.InputJsonValue,
        tags: commodities,
      },
    });

    await this.prisma.knowledgeRelation.deleteMany({
      where: {
        fromKnowledgeId: weekly.id,
        relationType: { in: ['WEEKLY_ROLLUP_OF', 'DERIVED_FROM', 'SAME_TOPIC'] },
      },
    });

    await this.prisma.knowledgeRelation.createMany({
      data: sourceItems.map((item) => ({
        fromKnowledgeId: weekly!.id,
        toKnowledgeId: item.id,
        relationType: 'WEEKLY_ROLLUP_OF',
        weight: 85,
        evidence: `${periodKey} 周度汇总自动关联`,
      })),
      skipDuplicates: true,
    });

    const derivedFromTargets = sourceItems.filter((item) => item.type === 'RESEARCH').slice(0, 10);
    if (derivedFromTargets.length > 0) {
      await this.prisma.knowledgeRelation.createMany({
        data: derivedFromTargets.map((item) => ({
          fromKnowledgeId: weekly!.id,
          toKnowledgeId: item.id,
          relationType: 'DERIVED_FROM',
          weight: 90,
          evidence: `${periodKey} 周报引用关键研报`,
        })),
        skipDuplicates: true,
      });
    }

    const sameTopicTargets = sourceItems
      .filter((item) => {
        const sourceTags = (item.analysis?.tags || []) as string[];
        return sourceTags.some((tag) => commodities.includes(tag));
      })
      .slice(0, 20);

    if (sameTopicTargets.length > 0) {
      await this.prisma.knowledgeRelation.createMany({
        data: sameTopicTargets.map((item) => ({
          fromKnowledgeId: weekly!.id,
          toKnowledgeId: item.id,
          relationType: 'SAME_TOPIC',
          weight: 70,
          evidence: `${periodKey} 周报同主题聚合`,
        })),
        skipDuplicates: true,
      });
    }

    if (triggerAnalysis) {
      await this.reanalyze(weekly.id, true);
    }

    return this.findOne(weekly.id);
  }

  private toContentType(type: KnowledgeType): ContentType {
    if (type === 'DAILY') return ContentType.DAILY_REPORT;
    return ContentType.RESEARCH_REPORT;
  }

  private mapLegacyContentTypeToKnowledgeType(
    contentType: PrismaContentType | null,
  ): KnowledgeType {
    if (contentType === 'DAILY_REPORT') return 'DAILY';
    if (contentType === 'RESEARCH_REPORT') return 'RESEARCH';
    return 'THIRD_PARTY';
  }

  private mapLegacyContentTypeToPeriodType(
    contentType: PrismaContentType | null,
  ): KnowledgePeriodType {
    if (contentType === 'DAILY_REPORT') return 'DAY';
    return 'ADHOC';
  }

  private mapReportPeriodToKnowledgePeriodType(
    reportPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ADHOC' | null,
  ): KnowledgePeriodType {
    if (reportPeriod === 'DAILY') return 'DAY';
    if (reportPeriod === 'WEEKLY') return 'WEEK';
    if (reportPeriod === 'MONTHLY') return 'MONTH';
    if (reportPeriod === 'QUARTERLY') return 'QUARTER';
    if (reportPeriod === 'ANNUAL') return 'YEAR';
    return 'ADHOC';
  }

  private mapReviewStatusToKnowledgeStatus(reviewStatus: ReviewStatus): KnowledgeStatus {
    if (reviewStatus === 'APPROVED') return 'PUBLISHED';
    if (reviewStatus === 'REJECTED') return 'REJECTED';
    if (reviewStatus === 'ARCHIVED') return 'ARCHIVED';
    return 'PENDING_REVIEW';
  }

  private toPeriodKey(date: Date, periodType: KnowledgePeriodType): string {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');

    if (periodType === 'DAY') return `${year}-${month}-${day}`;
    if (periodType === 'MONTH') return `${year}-${month}`;
    if (periodType === 'YEAR') return `${year}`;
    if (periodType === 'WEEK') {
      const week = this.getIsoWeek(d);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    if (periodType === 'QUARTER') {
      const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    return `${year}-${month}-${day}`;
  }

  private getIsoWeek(date: Date): number {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private getWeekRange(date: Date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - day + 1);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const week = this.getIsoWeek(date);
    const periodKey = `${weekStart.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

    return { weekStart, weekEnd, periodKey };
  }

  private buildWeeklySections(
    sourceItems: Array<{
      title: string;
      type: KnowledgeType;
      publishAt: Date | null;
      contentPlain: string;
      analysis: {
        summary: string | null;
        events: Prisma.JsonValue | null;
        insights: Prisma.JsonValue | null;
        prediction: Prisma.JsonValue | null;
        keyPoints: Prisma.JsonValue | null;
      } | null;
    }>,
  ) {
    const market: string[] = [];
    const events: string[] = [];
    const risks: string[] = [];
    const outlook: string[] = [];

    for (const item of sourceItems) {
      const summary = item.analysis?.summary || item.contentPlain.slice(0, 140);
      const date = item.publishAt ? new Date(item.publishAt).toISOString().slice(5, 10) : '未知';

      if (item.type === 'DAILY') {
        market.push(`[${date}] ${item.title}：${summary}`);
      }

      const rawEvents = Array.isArray(item.analysis?.events) ? item.analysis?.events : [];
      rawEvents.slice(0, 2).forEach((event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const text = event?.content || event?.impact || event?.action;
        if (text) events.push(`[${date}] ${text}`);
      });

      const rawInsights = Array.isArray(item.analysis?.insights) ? item.analysis?.insights : [];
      rawInsights.slice(0, 2).forEach((insight: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const text = insight?.content || insight?.title;
        if (text && /风险|波动|不确定|下行|紧张|承压/.test(text)) {
          risks.push(`[${date}] ${text}`);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prediction = (item.analysis?.prediction || {}) as any;
      const outlookText = prediction?.reasoning || prediction?.logic;
      if (outlookText) {
        outlook.push(`[${date}] ${outlookText}`);
      }
    }

    const sectionResult = {
      market: market.slice(0, 8),
      events: events.slice(0, 8),
      risks: risks.slice(0, 6),
      outlook: outlook.slice(0, 6),
    };

    return sectionResult;
  }

  private renderWeeklyPlainContent(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
  ) {
    const renderSection = (title: string, items: string[]) => {
      if (items.length === 0) return `${title}\n- 暂无结构化提取内容`;
      return `${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
    };

    return [
      `${periodKey} 周报`,
      renderSection('一、行情', sections.market),
      renderSection('二、事件', sections.events),
      renderSection('三、风险', sections.risks),
      renderSection('四、展望', sections.outlook),
    ].join('\n\n');
  }

  private renderWeeklyRichContent(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
  ) {
    const renderSection = (title: string, items: string[]) => {
      if (items.length === 0) {
        return `<h3>${title}</h3><p>暂无结构化提取内容</p>`;
      }
      const list = items.map((item) => `<li>${item}</li>`).join('');
      return `<h3>${title}</h3><ul>${list}</ul>`;
    };

    return [
      `<h2>${periodKey} 周报</h2>`,
      renderSection('一、行情', sections.market),
      renderSection('二、事件', sections.events),
      renderSection('三、风险', sections.risks),
      renderSection('四、展望', sections.outlook),
    ].join('');
  }

  private buildWeeklySummary(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
    sourceCount: number,
  ) {
    const riskSignal = sections.risks.length >= 4 ? '风险信号偏强' : '风险总体可控';
    const outlookSignal =
      sections.outlook.length > 0 ? '建议关注下周关键变量变化。' : '下周展望信息仍需补充。';
    return `${periodKey} 周报基于 ${sourceCount} 条来源内容生成，覆盖行情（${sections.market.length}）、事件（${sections.events.length}）、风险（${sections.risks.length}）与展望（${sections.outlook.length}）四个维度。${riskSignal}${outlookSignal}`;
  }

  private buildWeeklyMetrics(sections: {
    market: string[];
    events: string[];
    risks: string[];
    outlook: string[];
  }) {
    const riskLevel =
      sections.risks.length >= 5 ? 'HIGH' : sections.risks.length >= 2 ? 'MEDIUM' : 'LOW';
    const sentiment = sections.outlook.some((line) => /看涨|偏强|上涨|改善/.test(line))
      ? 'BULLISH'
      : sections.outlook.some((line) => /看跌|承压|下行|走弱/.test(line))
        ? 'BEARISH'
        : 'NEUTRAL';

    const confidence = Math.max(
      55,
      Math.min(95, 55 + sections.market.length * 3 + sections.events.length * 2),
    );

    return {
      priceMoveCount: sections.market.length,
      eventCount: sections.events.length,
      riskLevel,
      sentiment,
      confidence,
    };
  }
}
