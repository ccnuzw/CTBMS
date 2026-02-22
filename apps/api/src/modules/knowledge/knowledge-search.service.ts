import { Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import * as KnowledgeUtils from './knowledge.utils';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeListQuery, RelationQueryOptions } from './knowledge.utils';
import { KnowledgeStatus, KnowledgeType, KnowledgePeriodType, Prisma } from '@prisma/client';
import { AIService } from '../ai/ai.service';

@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);
  constructor(
    @Inject(forwardRef(() => KnowledgeService)) private readonly knowledgeService: KnowledgeService,
    private prisma: PrismaService,
    private aiService: AIService
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

  async getGraphData(options: { intelId?: string; limit?: number }) {
    const limit = options.limit || 100;
    const whereEdge: Prisma.KnowledgeEdgeWhereInput = {};

    if (options.intelId) {
      whereEdge.sourceIntelId = options.intelId;
    }

    // Get edges
    const edges = await this.prisma.knowledgeEdge.findMany({
      where: whereEdge,
      take: limit,
      include: {
        source: true,
        target: true
      }
    });

    // Collect unique nodes from edges
    const nodeMap = new Map<string, { id: string; name: string; type: string }>();

    // Format for frontend (e.g., react-force-graph expects nodes and links)
    const formattedEdges = edges.map(e => {
      nodeMap.set(e.sourceId, e.source);
      nodeMap.set(e.targetId, e.target);
      return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        weight: e.weight
      };
    });

    const formattedNodes = Array.from(nodeMap.values()).map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      group: n.type // For coloring
    }));

    return {
      nodes: formattedNodes,
      links: formattedEdges
    };
  }

  async generateWeeklyRollup(options?: {
    targetDate?: Date;
    authorId?: string;
    triggerAnalysis?: boolean;
  }) {
    const targetDate = options?.targetDate || new Date();
    const authorId = options?.authorId || 'system-user-placeholder';
    const triggerAnalysis = options?.triggerAnalysis ?? true;

    const { weekStart, weekEnd, periodKey } = KnowledgeUtils.getWeekRange(targetDate);

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

    const sections = KnowledgeUtils.buildWeeklySections(sourceItems);
    const metrics = KnowledgeUtils.buildWeeklyMetrics(sections);
    const contentPlain = KnowledgeUtils.renderWeeklyPlainContent(periodKey, sections);
    const contentRich = KnowledgeUtils.renderWeeklyRichContent(periodKey, sections);
    const summary = KnowledgeUtils.buildWeeklySummary(periodKey, sections, sourceItems.length);

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
      await this.knowledgeService.reanalyze(weekly.id, true);
    }

    return this.findOne(weekly.id);
  }

  async findAllReports(query?: {
    reportType?: string;
    status?: KnowledgeStatus;
    commodity?: string;
    region?: string;
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    title?: string;
    sourceType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      reportType,
      status,
      commodity,
      region,
      startDate,
      endDate,
      keyword,
      title,
      sourceType,
      page = 1,
      pageSize = 20,
    } = query || {};

    const where: Prisma.KnowledgeItemWhereInput = {
      type: 'RESEARCH',
    };

    if (status) where.status = status;
    if (commodity) where.commodities = { has: commodity };
    if (region) where.region = { has: region };
    if (sourceType) where.sourceType = sourceType;

    if (startDate || endDate) {
      where.publishAt = {};
      if (startDate) where.publishAt.gte = startDate;
      if (endDate) where.publishAt.lte = endDate;
    }

    if (title) where.title = { contains: title, mode: 'insensitive' };

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { contentPlain: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // 按 reportType 过滤（通过 analysis 子查询）
    if (reportType) {
      where.analysis = { reportType };
    }

    const [data, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { publishAt: 'desc' },
        include: {
          analysis: {
            select: {
              summary: true,
              reportType: true,
              reportPeriod: true,
              keyPoints: true,
              prediction: true,
              dataPoints: true,
            },
          },
        },
      }),
      this.prisma.knowledgeItem.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOneReport(id: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
      include: {
        analysis: true,
        attachments: true,
        tagMaps: true,
        relationsFrom: {
          include: {
            toKnowledge: { select: { id: true, title: true, type: true } },
          },
          take: 10,
        },
        relationsTo: {
          include: {
            fromKnowledge: { select: { id: true, title: true, type: true } },
          },
          take: 10,
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`研报 ID ${id} 不存在`);
    }

    // 自动增加浏览次数
    await this.prisma.knowledgeItem.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return item;
  }

  async findAttachment(id: string) {
    return this.prisma.knowledgeAttachment.findUnique({ where: { id } });
  }

}
