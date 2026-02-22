import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';

@Injectable()
export class IntelEventInsightService {
  private readonly logger = new Logger(IntelEventInsightService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 查询市场事件列表 (分页)
   */
  async findEvents(query: {
    eventTypeId?: string;
    collectionPointId?: string;
    commodity?: string;
    sentiment?: string;
    impactLevel?: string;
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      eventTypeId,
      collectionPointId,
      commodity,
      sentiment,
      impactLevel,
      startDate,
      endDate,
      keyword,
      page = 1,
      pageSize = 20,
    } = query;

    const where: Prisma.MarketEventWhereInput = {};
    if (eventTypeId) where.eventTypeId = eventTypeId;
    if (collectionPointId) where.collectionPointId = collectionPointId;
    if (commodity) where.commodity = commodity;
    if (sentiment) where.sentiment = sentiment;
    if (impactLevel) where.impactLevel = impactLevel;
    if (startDate || endDate) {
      where.eventDate = {};
      if (startDate) where.eventDate.gte = startDate;
      if (endDate) where.eventDate.lte = endDate;
    }
    if (keyword) {
      where.OR = [
        { subject: { contains: keyword, mode: 'insensitive' } },
        { action: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.marketEvent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          eventType: {
            select: { id: true, code: true, name: true, icon: true, color: true, category: true },
          },
          collectionPoint: {
            select: { id: true, code: true, name: true, type: true },
          },
          intel: {
            select: { id: true, rawContent: true, effectiveTime: true, location: true },
          },
        },
      }),
      this.prisma.marketEvent.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取单个市场事件详情
   */
  async findEventById(id: string) {
    const event = await this.prisma.marketEvent.findUnique({
      where: { id },
      include: {
        eventType: true,
        collectionPoint: true,
        intel: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`事件 ID ${id} 不存在`);
    }

    return event;
  }

  /**
   * 获取筛选选项
   */
  async getFilterOptions() {
    const [commodities, regions, eventTypes, insightTypes] = await Promise.all([
      this.prisma.marketEvent.findMany({
        select: { commodity: true },
        where: { commodity: { not: null } },
        distinct: ['commodity'],
      }),
      this.prisma.marketEvent.findMany({
        select: { regionCode: true },
        where: { regionCode: { not: null } },
        distinct: ['regionCode'],
      }),
      this.prisma.eventTypeConfig.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.insightTypeConfig.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: true },
      }),
    ]);

    return {
      commodities: commodities.map((c) => c.commodity).filter(Boolean),
      regions: regions.map((r) => r.regionCode).filter(Boolean),
      eventTypes,
      insightTypes,
    };
  }

  /**
   * 获取事件统计数据 (支持筛选)
   */
  async getEventStats(query?: {
    startDate?: Date;
    endDate?: Date;
    commodities?: string[];
    regions?: string[];
  }) {
    const where: Prisma.MarketEventWhereInput = {};

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }
    if (query?.commodities?.length) where.commodity = { in: query.commodities };
    if (query?.regions?.length) where.regionCode = { in: query.regions };

    const [
      total,
      todayCount,
      weekCount,
      typeStats,
      sentimentStats,
      impactStats,
      commodityStats,
      regionStats,
    ] = await Promise.all([
      this.prisma.marketEvent.count({ where }),
      this.prisma.marketEvent.count({
        where: {
          ...where,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.marketEvent.count({
        where: {
          ...where,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.marketEvent.groupBy({
        by: ['eventTypeId'],
        where,
        _count: { eventTypeId: true },
      }),
      this.prisma.marketEvent.groupBy({
        by: ['sentiment'],
        where,
        _count: { sentiment: true },
      }),
      this.prisma.marketEvent.groupBy({
        by: ['impactLevel'],
        where,
        _count: { impactLevel: true },
      }),
      this.prisma.marketEvent.groupBy({
        by: ['commodity'],
        where: { ...where, commodity: { not: null } },
        _count: { commodity: true },
        take: 10,
        orderBy: { _count: { commodity: 'desc' } },
      }),
      this.prisma.marketEvent.groupBy({
        by: ['regionCode'],
        where: { ...where, regionCode: { not: null } },
        _count: { regionCode: true },
        take: 10,
        orderBy: { _count: { regionCode: 'desc' } },
      }),
    ]);

    const typeIds = typeStats.map((s) => s.eventTypeId);
    const eventTypes = await this.prisma.eventTypeConfig.findMany({
      where: { id: { in: typeIds } },
    });
    const typeMap = new Map(eventTypes.map((t) => [t.id, t]));

    return {
      total,
      todayCount,
      weekCount,
      typeBreakdown: typeStats.map((stat) => ({
        id: stat.eventTypeId,
        name: typeMap.get(stat.eventTypeId)?.name || 'Unknown',
        code: typeMap.get(stat.eventTypeId)?.code,
        color: typeMap.get(stat.eventTypeId)?.color,
        count: stat._count.eventTypeId,
      })),
      sentimentBreakdown: sentimentStats.map((stat) => ({
        sentiment: stat.sentiment || 'neutral',
        count: stat._count.sentiment,
      })),
      impactBreakdown: impactStats.map((stat) => ({
        level: stat.impactLevel || 'unknown',
        count: stat._count.impactLevel,
      })),
      commodityBreakdown: commodityStats.map((stat) => ({
        commodity: stat.commodity!,
        count: stat._count.commodity,
      })),
      regionBreakdown: regionStats.map((stat) => ({
        region: stat.regionCode!,
        count: stat._count.regionCode,
      })),
    };
  }

  /**
   * 查询市场洞察列表 (分页)
   */
  async findInsights(query: {
    insightTypeId?: string;
    direction?: string;
    timeframe?: string;
    commodity?: string;
    startDate?: Date;
    endDate?: Date;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      insightTypeId,
      direction,
      timeframe,
      commodity,
      startDate,
      endDate,
      keyword,
      page = 1,
      pageSize = 20,
    } = query;

    const where: Prisma.MarketInsightWhereInput = {};
    if (insightTypeId) where.insightTypeId = insightTypeId;
    if (direction) where.direction = direction;
    if (timeframe) where.timeframe = timeframe;
    if (commodity) where.commodity = commodity;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.marketInsight.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          insightType: {
            select: { id: true, code: true, name: true, icon: true, color: true, category: true },
          },
          intel: {
            select: { id: true, rawContent: true, effectiveTime: true, location: true },
          },
        },
      }),
      this.prisma.marketInsight.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取单个市场洞察详情
   */
  async findInsightById(id: string) {
    const insight = await this.prisma.marketInsight.findUnique({
      where: { id },
      include: {
        insightType: true,
        intel: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    });

    if (!insight) {
      throw new NotFoundException(`洞察 ID ${id} 不存在`);
    }

    return insight;
  }

  /**
   * 获取洞察统计数据
   */
  async getInsightStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const [total, todayCount, weekCount, typeStats, directionStats, timeframeStats] =
      await Promise.all([
        this.prisma.marketInsight.count(),
        this.prisma.marketInsight.count({
          where: { createdAt: { gte: todayStart } },
        }),
        this.prisma.marketInsight.count({
          where: { createdAt: { gte: weekStart } },
        }),
        this.prisma.marketInsight.groupBy({
          by: ['insightTypeId'],
          _count: { insightTypeId: true },
        }),
        this.prisma.marketInsight.groupBy({
          by: ['direction'],
          _count: { direction: true },
          where: { direction: { not: null } },
        }),
        this.prisma.marketInsight.groupBy({
          by: ['timeframe'],
          _count: { timeframe: true },
          where: { timeframe: { not: null } },
        }),
      ]);

    const insightTypes = await this.prisma.insightTypeConfig.findMany({
      select: { id: true, name: true, icon: true, color: true },
    });
    const typeMap = new Map(insightTypes.map((t) => [t.id, t]));

    const avgConfidence = await this.prisma.marketInsight.aggregate({
      _avg: { confidence: true },
      where: { confidence: { not: null } },
    });

    return {
      total,
      todayCount,
      weekCount,
      avgConfidence: Math.round(avgConfidence._avg.confidence || 0),
      typeBreakdown: typeStats.map((stat) => ({
        typeId: stat.insightTypeId,
        typeName: typeMap.get(stat.insightTypeId)?.name || '未知',
        icon: typeMap.get(stat.insightTypeId)?.icon,
        color: typeMap.get(stat.insightTypeId)?.color,
        count: stat._count.insightTypeId,
      })),
      directionBreakdown: directionStats.map((stat) => ({
        direction: stat.direction,
        count: stat._count.direction,
      })),
      timeframeBreakdown: timeframeStats.map((stat) => ({
        timeframe: stat.timeframe,
        count: stat._count.timeframe,
      })),
    };
  }
}
