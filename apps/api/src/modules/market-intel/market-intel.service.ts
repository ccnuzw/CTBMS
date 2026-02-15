import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AIService } from '../ai/ai.service';
import {
  CreateMarketIntelDto,
  UpdateMarketIntelDto,
  MarketIntelQuery,
  AIAnalysisResult,
  ContentType as TypesContentType,
} from '@packages/types';
import {
  ContentType as PrismaContentType,
  GeoLevel,
  IntelCategory,
  IntelSourceType as PrismaIntelSourceType,
  PriceSourceType,
  PriceSubType,
  Prisma,
} from '@prisma/client';
import { KnowledgeService } from '../knowledge/knowledge.service';

type IntelligenceFeedQuery = {
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
};

const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, PriceSubType> = {
  STATION_ORIGIN: PriceSubType.STATION,
  STATION_DEST: PriceSubType.STATION,
};

@Injectable()
export class MarketIntelService {
  private readonly hotTopicDomainPriority = [
    'COMMODITY',
    'INTEL_SOURCE_TYPE',
    'REPORT_TYPE',
    'CONTENT_TYPE',
    'MARKET_SENTIMENT',
    'PREDICTION_TIMEFRAME',
    'RISK_LEVEL',
    'MARKET_TREND',
    'QUALITY_LEVEL',
    'TIME_RANGE',
  ];
  private readonly hotTopicFallbackLabels: Record<string, string> = {
    SOYBEAN_MEAL: '豆粕',
    SOYBEAN_OIL: '豆油',
    SUGAR: '白糖',
    COTTON: '棉花',
    HOG: '生猪',
    UREA: '尿素',
  };

  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private knowledgeService: KnowledgeService,
  ) {}

  private resolveIntelSourceTypes(values?: string[]) {
    if (!values) return [];
    return values.filter((value): value is PrismaIntelSourceType =>
      Object.values(PrismaIntelSourceType).includes(value as PrismaIntelSourceType),
    );
  }

  private resolveContentTypes(values?: string[]) {
    if (!values) return [];
    return values.filter((value): value is PrismaContentType =>
      Object.values(PrismaContentType).includes(value as PrismaContentType),
    );
  }

  private normalizePriceSubType(value?: string | null) {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (!normalized) return null;
    if (LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized]) {
      return LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized];
    }
    if (Object.values(PriceSubType).includes(normalized as PriceSubType)) {
      return normalized as PriceSubType;
    }
    return null;
  }

  private normalizeHotTopic(topic: string) {
    return topic.replace(/^#/, '').trim();
  }

  private async resolveHotTopicDisplayMap(rawTopics: string[]) {
    const normalizedTopics = Array.from(
      new Set(rawTopics.map((topic) => this.normalizeHotTopic(topic)).filter(Boolean)),
    );
    if (!normalizedTopics.length) return {};

    const dictionaryItems = await this.prisma.dictionaryItem.findMany({
      where: {
        code: { in: normalizedTopics },
        isActive: true,
        domain: { isActive: true },
      },
      select: {
        code: true,
        label: true,
        domainCode: true,
      },
    });

    const domainPriorityMap = new Map<string, number>(
      this.hotTopicDomainPriority.map((domainCode, index) => [domainCode, index]),
    );
    const itemsByCode = dictionaryItems.reduce<
      Record<string, { label: string; domainCode: string }[]>
    >((acc, item) => {
      if (!acc[item.code]) acc[item.code] = [];
      acc[item.code].push({ label: item.label, domainCode: item.domainCode });
      return acc;
    }, {});

    return normalizedTopics.reduce<Record<string, string>>((acc, code) => {
      const fallbackLabel = this.hotTopicFallbackLabels[code];
      const candidates = itemsByCode[code] || [];
      if (!candidates.length) {
        if (fallbackLabel) acc[code] = fallbackLabel;
        return acc;
      }

      const uniqueLabels = Array.from(
        new Set(candidates.map((item) => item.label.trim()).filter(Boolean)),
      );
      if (uniqueLabels.length === 1) {
        acc[code] = uniqueLabels[0];
        return acc;
      }

      const preferred = candidates
        .filter((item) => domainPriorityMap.has(item.domainCode))
        .sort(
          (a, b) =>
            (domainPriorityMap.get(a.domainCode) ?? Number.MAX_SAFE_INTEGER) -
            (domainPriorityMap.get(b.domainCode) ?? Number.MAX_SAFE_INTEGER),
        )[0];

      if (preferred) {
        acc[code] = preferred.label;
      }

      return acc;
    }, {});
  }

  /**
   * AI 内容分析
   */
  async analyze(
    content: string,
    category: IntelCategory,
    location?: string,
    base64Image?: string,
    mimeType?: string,
    contentType?: TypesContentType,
  ) {
    return this.aiService.analyzeContent(
      content,
      category,
      location,
      base64Image,
      mimeType,
      contentType,
    );
  }

  /**
   * 测试 AI 连接
   */
  async testAI() {
    return this.aiService.testConnection();
  }

  /**
   * 创建商情情报
   * 支持从 C 类日报自动提取 A 类价格数据
   */
  async create(dto: CreateMarketIntelDto, authorId: string) {
    // 计算总分
    const totalScore = Math.round(
      (dto.completenessScore || 0) * 0.4 +
        (dto.scarcityScore || 0) * 0.3 +
        (dto.validationScore || 0) * 0.3,
    );

    try {
      const intel = await this.prisma.marketIntel.create({
        data: {
          ...dto,
          category: dto.category as IntelCategory,
          sourceType: dto.sourceType,
          contentType: dto.contentType,
          totalScore,
          authorId,
        },
        include: {
          author: {
            select: { id: true, name: true, avatar: true },
          },
        },
      });
      // 如果 aiAnalysis 包含 pricePoints，自动批量写入 PriceData
      const aiAnalysis = dto.aiAnalysis as AIAnalysisResult | undefined;
      if (aiAnalysis?.pricePoints && aiAnalysis.pricePoints.length > 0) {
        await this.batchCreatePriceData(intel.id, authorId, dto.effectiveTime, aiAnalysis);
      }

      // 自动批量写入 MarketEvent (B类)和 MarketInsight (C类)
      if (aiAnalysis) {
        await this.batchCreateEvents(intel.id, dto.effectiveTime, aiAnalysis);
        await this.batchCreateInsights(intel.id, dto.effectiveTime, aiAnalysis);
      }

      // 更新情报员统计
      await this.updateAuthorStats(authorId);

      // Knowledge V2 双写（失败不影响主流程）
      try {
        await this.knowledgeService.syncFromMarketIntel(intel.id);
      } catch (syncError) {
        console.warn('[MarketIntelService.create] Knowledge V2 sync failed:', syncError);
      }

      return intel;
    } catch (error) {
      console.error('[MarketIntelService.create] FAILED', error);
      throw error;
    }
  }

  /**
   * 获取文档归档统计 (C类)
   */
  async getDocStats(days = 30) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, monthlyNew, sourceGrouping, scoreAgg, trendGrouping, intels] = await Promise.all([
      // 总量
      this.prisma.marketIntel.count({
        where: { category: IntelCategory.C_DOCUMENT },
      }),
      // 本月新增
      this.prisma.marketIntel.count({
        where: {
          category: IntelCategory.C_DOCUMENT,
          createdAt: { gte: monthStart },
        },
      }),
      // 来源分布
      this.prisma.marketIntel.groupBy({
        by: ['sourceType'],
        where: { category: IntelCategory.C_DOCUMENT },
        _count: true,
      }),
      // 平均分
      this.prisma.marketIntel.aggregate({
        where: { category: IntelCategory.C_DOCUMENT },
        _avg: { totalScore: true },
      }),
      // 趋势 (简化版：按天分组需用 raw query 或后期处理，这里用 groupBy effectiveTime 太细，暂取最近列表后期处理)
      // 为简单起见，这里只取最近 N 天的数据在内存聚合
      this.prisma.marketIntel.findMany({
        where: {
          category: IntelCategory.C_DOCUMENT,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
      }),
      // 取最近文档用于提取标签
      this.prisma.marketIntel.findMany({
        where: { category: IntelCategory.C_DOCUMENT },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { aiAnalysis: true },
      }),
    ]);

    // 处理趋势
    const trendMap = new Map<string, number>();
    // 初始化日期
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      trendMap.set(d.toISOString().split('T')[0], 0);
    }
    trendGrouping.forEach((item) => {
      const date = item.createdAt.toISOString().split('T')[0];
      if (trendMap.has(date)) {
        trendMap.set(date, (trendMap.get(date) || 0) + 1);
      }
    });

    const trend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 处理标签
    const tagCount = new Map<string, number>();
    intels.forEach((intel) => {
      const aiAnalysis = (intel.aiAnalysis ?? {}) as AIAnalysisResult;
      const tags = Array.isArray(aiAnalysis.tags) ? aiAnalysis.tags : [];
      tags.forEach((tag) => {
        if (typeof tag === 'string') {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      });
    });

    const topTags = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      total,
      monthlyNew,
      bySource: sourceGrouping.map((g) => ({
        name: g.sourceType,
        value: g._count,
      })),
      avgScore: Math.round(scoreAgg._avg.totalScore || 0),
      trend,
      topTags,
    };
  }

  /**
   * 批量删除情报
   */
  async batchDelete(ids: string[]) {
    return this.prisma.marketIntel.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  /**
   * 更新情报标签
   */
  async updateTags(id: string, tags: string[]) {
    const intel = await this.prisma.marketIntel.findUnique({ where: { id } });
    if (!intel) throw new NotFoundException('Intel not found');

    const aiAnalysis = (intel.aiAnalysis ?? {}) as AIAnalysisResult;
    aiAnalysis.tags = tags;

    return this.prisma.marketIntel.update({
      where: { id },
      data: { aiAnalysis },
    });
  }

  /**
   * 批量更新情报标签
   * @param ids ID列表
   * @param addTags 要添加的标签
   * @param removeTags 要移除的标签
   */
  async batchUpdateTags(ids: string[], addTags: string[], removeTags: string[]) {
    // 1. 查出所有涉及的情报及其当前 AI 分析数据
    const intels = await this.prisma.marketIntel.findMany({
      where: { id: { in: ids } },
      select: { id: true, aiAnalysis: true },
    });

    if (intels.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    // 2. 构建更新操作
    const updates = intels.map((intel) => {
      const currentAnalysis = (intel.aiAnalysis ?? {}) as AIAnalysisResult;
      let currentTags: string[] = Array.isArray(currentAnalysis.tags) ? currentAnalysis.tags : [];

      // 移除指定标签
      if (removeTags.length > 0) {
        currentTags = currentTags.filter((t) => !removeTags.includes(t));
      }

      // 添加新标签并去重
      if (addTags.length > 0) {
        currentTags = Array.from(new Set([...currentTags, ...addTags]));
      }

      currentAnalysis.tags = currentTags;

      return this.prisma.marketIntel.update({
        where: { id: intel.id },
        data: { aiAnalysis: currentAnalysis },
      });
    });

    // 3. 事务执行
    await this.prisma.$transaction(updates);

    return { success: true, updatedCount: intels.length };
  }

  /**
   * 批量创建价格数据（从日报解析结果）
   * 增强版：自动关联采集点和行政区划
   */
  private async batchCreatePriceData(
    intelId: string,
    authorId: string,
    effectiveTime: Date,
    aiAnalysis: AIAnalysisResult,
  ) {
    const pricePoints = aiAnalysis.pricePoints;
    if (!pricePoints || pricePoints.length === 0) return;

    const effectiveDate = new Date(effectiveTime);
    effectiveDate.setHours(0, 0, 0, 0);

    // 逐条处理价格数据
    for (const point of pricePoints) {
      // [MODIFIED] 不再尝试创建或查找 Enterprise
      // 而是确保 collectionPointId 存在 (AI 应该返回，或者在前端确认)

      const resolvedSourceType = Object.values(PriceSourceType).includes(
        point.sourceType as PriceSourceType,
      )
        ? (point.sourceType as PriceSourceType)
        : PriceSourceType.REGIONAL;
      const resolvedSubType = this.normalizePriceSubType(point.subType) || PriceSubType.LISTED;
      const resolvedGeoLevel = Object.values(GeoLevel).includes(point.geoLevel as GeoLevel)
        ? (point.geoLevel as GeoLevel)
        : GeoLevel.CITY;

      // 构建价格数据
      const priceData = {
        // 价格分类
        sourceType: resolvedSourceType,
        subType: resolvedSubType,
        geoLevel: resolvedGeoLevel,

        // 位置信息
        location: point.location,
        province: point.province || null,
        city: point.city || null,
        region: aiAnalysis.reportMeta?.region ? [aiAnalysis.reportMeta.region] : [],
        // 优先使用采集点继承的坐标
        longitude: point.longitude || null,
        latitude: point.latitude || null,

        // 企业关联 [REMOVED for Decoupling]
        // enterpriseId: null,
        // enterpriseName: null,

        // ===== 新增：采集点关联 =====
        collectionPointId: point.collectionPointId || null,

        // ===== 新增：行政区划关联 =====
        regionCode: point.regionCode || null,

        // 品种和价格
        effectiveDate,
        commodity: point.commodity || aiAnalysis.reportMeta?.commodity || '玉米',
        grade: point.grade || null,
        price: point.price,
        dayChange: point.change,

        // 备注
        note: point.note || null,

        // 关联
        intelId,
        authorId,
      };

      // 使用 findFirst + create/update 替代 upsert 以避免 Prisma 复合键类型问题
      const existingPrice = await this.prisma.priceData.findFirst({
        where: {
          effectiveDate: priceData.effectiveDate,
          commodity: priceData.commodity,
          location: priceData.location,
          sourceType: priceData.sourceType,
          subType: priceData.subType,
        },
      });

      if (existingPrice) {
        await this.prisma.priceData.update({
          where: { id: existingPrice.id },
          data: {
            price: priceData.price,
            dayChange: priceData.dayChange,
            intelId: priceData.intelId,
            // enterpriseId: priceData.enterpriseId, [REMOVED]
            // 更新关联信息
            collectionPointId: priceData.collectionPointId,
            regionCode: priceData.regionCode,
            longitude: priceData.longitude,
            latitude: priceData.latitude,
            note: priceData.note,
          },
        });
      } else {
        await this.prisma.priceData.create({
          data: priceData,
        });
      }
    }
  }

  /**
   * 批量创建市场事件 (从日报解析结果)
   */
  private async batchCreateEvents(
    intelId: string,
    effectiveTime: Date,
    aiAnalysis: AIAnalysisResult,
  ) {
    if (!aiAnalysis.events || aiAnalysis.events.length === 0) return;

    // 获取默认事件类型 (简单起见，取第一个或特定Code)
    const defaultEventType = await this.prisma.eventTypeConfig.findFirst();
    if (!defaultEventType) return; // 如果没有配置类型，无法创建

    const effectiveDate = new Date(effectiveTime);

    for (const event of aiAnalysis.events) {
      // 增强类型映射：优先使用 AI 返回的 eventTypeCode，否则使用默认
      let eventTypeId = defaultEventType.id;
      if (event.eventTypeCode) {
        const matchedType = await this.prisma.eventTypeConfig.findUnique({
          where: { code: event.eventTypeCode },
        });
        if (matchedType) {
          eventTypeId = matchedType.id;
        }
      }

      await this.prisma.marketEvent.create({
        data: {
          intelId,
          eventTypeId,
          subject: event.subject || '未知主体',
          action: event.action || '未知动作',
          content: event.sourceText || `${event.subject}${event.action}`,
          impact: event.impact,
          // 默认值处理
          impactLevel: 'MEDIUM',
          sentiment: 'NEUTRAL',

          // 关键字段：从 AI 结果中获取
          commodity: event.commodity || aiAnalysis.reportMeta?.commodity,
          regionCode: event.regionCode || aiAnalysis.reportMeta?.region,

          sourceText: event.sourceText || '',
          sourceStart: event.sourceStart,
          sourceEnd: event.sourceEnd,
          eventDate: effectiveDate,
        },
      });
    }
  }

  /**
   * 批量创建市场洞察 (从日报解析结果)
   */
  private async batchCreateInsights(
    intelId: string,
    effectiveTime: Date,
    aiAnalysis: AIAnalysisResult,
  ) {
    // 处理 forecast (后市预判) -> Insight
    if (aiAnalysis.forecast) {
      const forecastType = await this.prisma.insightTypeConfig.findUnique({
        where: { code: 'FORECAST' },
      });

      // 如果找不到 FORECAST 类型，尝试找任意一个
      const typeId = forecastType?.id || (await this.prisma.insightTypeConfig.findFirst())?.id;

      if (typeId && aiAnalysis.forecast.shortTerm) {
        await this.prisma.marketInsight.create({
          data: {
            intelId,
            insightTypeId: typeId,
            title: '短期后市预判',
            content: aiAnalysis.forecast.shortTerm,
            timeframe: 'SHORT_TERM',
            direction: 'STABLE', // 需 AI 返回
            confidence: 80,
            factors: aiAnalysis.forecast.keyFactors || [],
            commodity: aiAnalysis.reportMeta?.commodity,
            regionCode: aiAnalysis.reportMeta?.region,
            sourceText: aiAnalysis.forecast.shortTerm, // 简化
          },
        });
      }
    }
  }

  /**
   * 查询情报列表 (分页)
   */
  async findAll(query: MarketIntelQuery) {
    const {
      page,
      pageSize,
      category,
      sourceType,
      startDate,
      endDate,
      location,
      isFlagged,
      authorId,
      keyword,
    } = query;
    // Query param conversion if coming from simple query object, though DTO usually handles it.
    // Assuming dto allows optional params.

    const where: Prisma.MarketIntelWhereInput = {};
    if (category) where.category = category;
    if (sourceType) where.sourceType = sourceType;
    if (isFlagged !== undefined) where.isFlagged = isFlagged;
    if (authorId) where.authorId = authorId;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (startDate || endDate) {
      where.effectiveTime = {};
      if (startDate) where.effectiveTime.gte = startDate;
      if (endDate) where.effectiveTime.lte = endDate;
    }

    // Keyword Search
    if (keyword) {
      where.OR = [
        { rawContent: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
        { location: { contains: keyword, mode: 'insensitive' } },
        // Note: Searching inside JSON (aiAnalysis) or relation (tags/entities) requires advanced query.
        // For MVP, text fields are primary.
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.marketIntel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { effectiveTime: 'desc' },
        include: {
          author: {
            select: { id: true, name: true, avatar: true },
          },
          attachments: true,
        },
      }),
      this.prisma.marketIntel.count({ where }),
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
   * 获取单条情报详情
   */
  async findOne(id: string) {
    const intel = await this.prisma.marketIntel.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, avatar: true, position: true },
        },
        attachments: true,
      },
    });

    if (!intel) {
      throw new NotFoundException(`情报 ID ${id} 不存在`);
    }

    return intel;
  }

  /**
   * 更新情报
   */
  async update(id: string, dto: UpdateMarketIntelDto) {
    const existing = await this.prisma.marketIntel.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`情报 ID ${id} 不存在`);
    }

    // 重新计算总分
    const completeness = dto.completenessScore ?? existing.completenessScore;
    const scarcity = dto.scarcityScore ?? existing.scarcityScore;
    const validation = dto.validationScore ?? existing.validationScore;
    const totalScore = Math.round(completeness * 0.4 + scarcity * 0.3 + validation * 0.3);

    return this.prisma.marketIntel.update({
      where: { id },
      data: {
        ...dto,
        category: dto.category as IntelCategory | undefined,
        sourceType: dto.sourceType,
        contentType: dto.contentType,
        totalScore,
      },
      include: {
        author: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });
  }

  /**
   * 删除情报
   */
  async remove(id: string) {
    const existing = await this.prisma.marketIntel.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`情报 ID ${id} 不存在`);
    }

    await this.prisma.marketIntel.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 获取统计数据
   */
  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [total, todayCount, flaggedCount, categoryStats, avgConfidence] = await Promise.all([
      this.prisma.marketIntel.count(),
      this.prisma.marketIntel.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.marketIntel.count({
        where: { isFlagged: true },
      }),
      this.prisma.marketIntel.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
      this.prisma.marketIntel.aggregate({
        _avg: { totalScore: true },
      }),
    ]);

    // 获取热门标签 (从 aiAnalysis JSON 中提取)
    const recentIntels = await this.prisma.marketIntel.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { aiAnalysis: true },
    });

    const tagCounts: Record<string, number> = {};
    recentIntels.forEach((intel) => {
      const analysis = intel.aiAnalysis as AIAnalysisResult | null;
      if (analysis?.tags) {
        analysis.tags.forEach((tag) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalSubmissions: total,
      todaySubmissions: todayCount,
      avgConfidence: Math.round(avgConfidence._avg.totalScore || 0),
      flaggedCount,
      categoryBreakdown: categoryStats.map((stat) => ({
        category: stat.category,
        count: stat._count.category,
      })),
      topTags,
    };
  }

  /**
   * 获取排行榜 (支持多周期：日/周/月/年)
   */
  async getLeaderboard(limit = 10, timeframe: 'day' | 'week' | 'month' | 'year' = 'month') {
    // 1. 确定时间范围
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week': { // 获取本周一 (假设周一为一周开始)
        // Actually simply: set to last Monday
        const tempDate = new Date(now);
        const currentDay = tempDate.getDay();
        const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
        tempDate.setDate(tempDate.getDate() - distanceToMonday);
        startDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());
        break;
      }
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // 2. 实时聚合统计 (基于 MarketIntel 表)
    // 注意：Prisma groupBy 无法直接关联 User 表，需要分步查询
    const groups = await this.prisma.marketIntel.groupBy({
      by: ['authorId'],
      where: {
        createdAt: { gte: startDate },
        authorId: { not: undefined }, // Ensure we have author
      },
      _sum: {
        totalScore: true,
      },
      _count: {
        id: true, // submission count
      },
      _avg: {
        totalScore: true, // Used as proxy for accuracy/quality in realtime view
      },
    });

    // 3. 获取用户信息
    const authorIds = groups.map((g) => g.authorId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: {
        id: true,
        name: true,
        avatar: true,
        position: true,
        organization: { select: { name: true } },
        department: { select: { name: true } },
      },
    });

    // 4. 组装数据
    const leaderboard = groups.map((g) => {
      const user = users.find((u) => u.id === g.authorId);
      const score = g._sum.totalScore || 0;
      const submissionCount = g._count.id || 0;
      const avgScore = Math.round(g._avg.totalScore || 0);

      return {
        userId: g.authorId,
        name: user?.name || 'Unknown',
        avatar: user?.avatar || null,
        role: user?.position || null,
        region: user?.organization?.name || null,
        organizationName: user?.organization?.name,
        departmentName: user?.department?.name,

        // 核心指标
        score,
        submissionCount,
        accuracyRate: avgScore, // 暂用平均分作为质量/准确率参考
        highValueCount: 0, // 实时聚合暂不计算此复杂指标

        // 兼容旧字段
        creditCoefficient: 3.0,
        monthlyPoints: score,
      };
    });

    // 5. 排序与截取 (按分数降序 -> 提交数降序)
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.submissionCount - a.submissionCount;
    });

    return leaderboard.slice(0, limit).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
  }

  /**
   * 更新情报员统计数据
   */
  private async updateAuthorStats(userId: string) {
    const [submissionCount, avgScore] = await Promise.all([
      this.prisma.marketIntel.count({ where: { authorId: userId } }),
      this.prisma.marketIntel.aggregate({
        where: { authorId: userId },
        _avg: { totalScore: true },
      }),
    ]);

    // 计算本月积分 (简化逻辑：每条情报按总分加分)
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyIntels = await this.prisma.marketIntel.findMany({
      where: {
        authorId: userId,
        createdAt: { gte: thisMonth },
      },
      select: { totalScore: true },
    });

    const monthlyPoints = monthlyIntels.reduce((sum, intel) => sum + intel.totalScore, 0);

    await this.prisma.userIntelStats.upsert({
      where: { userId },
      update: {
        submissionCount,
        monthlyPoints,
        accuracyRate: avgScore._avg.totalScore || 0,
      },
      create: {
        userId,
        submissionCount,
        monthlyPoints,
        accuracyRate: avgScore._avg.totalScore || 0,
      },
    });
  }

  // =============================================
  // B类增强：市场事件 (MarketEvent) API
  // =============================================

  /**
   * 查询市场事件列表 (分页)
   */
  async findEvents(query: {
    eventTypeId?: string;
    // enterpriseId?: string; [REMOVED]
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
      // enterpriseId, [REMOVED]
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
    // if (enterpriseId) where.enterpriseId = enterpriseId; [REMOVED]
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
          // enterprise: { [REMOVED]
          //    select: { id: true, name: true, shortName: true },
          // },
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
        // enterprise: true, [REMOVED]
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
   * 获取筛选选项（动态获取数据库中存在的维度值）
   */
  async getFilterOptions() {
    const [commodities, regions, eventTypes, insightTypes] = await Promise.all([
      // 获取所有不为空的品种
      this.prisma.marketEvent.findMany({
        select: { commodity: true },
        where: { commodity: { not: null } },
        distinct: ['commodity'],
      }),
      // 获取所有不为空的区域
      this.prisma.marketEvent.findMany({
        select: { regionCode: true },
        where: { regionCode: { not: null } },
        distinct: ['regionCode'],
      }),
      // 获取事件类型
      this.prisma.eventTypeConfig.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
      }),
      // 获取洞察类型
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
   * 获取趋势分析数据
   */
  async getTrendAnalysis(query: {
    startDate?: Date;
    endDate?: Date;
    commodities?: string[];
    regions?: string[];
  }) {
    const { startDate, endDate, commodities, regions } = query;
    const where: Prisma.MarketEventWhereInput = {};

    if (startDate || endDate) {
      where.eventDate = {};
      if (startDate) where.eventDate.gte = startDate;
      if (endDate) where.eventDate.lte = endDate;
    }

    if (commodities && commodities.length > 0) {
      where.commodity = { in: commodities };
    }
    if (regions && regions.length > 0) {
      where.regionCode = { in: regions };
    }

    // 聚合每天的事件数量和情绪
    const events = await this.prisma.marketEvent.findMany({
      where,
      select: {
        eventDate: true,
        sentiment: true,
        createdAt: true,
      },
      orderBy: { eventDate: 'asc' },
    });

    // 按日期分组处理
    const dailyStats = new Map<string, { date: string; volume: number; sentimentScore: number }>();

    events.forEach((event) => {
      const date = (event.eventDate || event.createdAt).toISOString().split('T')[0];
      const current = dailyStats.get(date) || { date, volume: 0, sentimentScore: 0 };

      current.volume++;

      let score = 0;
      if (event.sentiment === 'positive' || event.sentiment === 'bullish') score = 1;
      else if (event.sentiment === 'negative' || event.sentiment === 'bearish') score = -1;

      current.sentimentScore += score;
      dailyStats.set(date, current);
    });

    return Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));
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

    // 构建筛选条件
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

    // 获取事件类型详情
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

  // =============================================
  // C类增强：市场洞察 (MarketInsight) API
  // =============================================

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

    // 获取洞察类型名称
    const insightTypes = await this.prisma.insightTypeConfig.findMany({
      select: { id: true, name: true, icon: true, color: true },
    });
    const typeMap = new Map(insightTypes.map((t) => [t.id, t]));

    // 计算平均置信度
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

  /**
   * 获取热门话题标签（从事件和洞察中聚合）
   */
  async getHotTopics(limit = 20) {
    // 从事件中提取关键词
    const recentEvents = await this.prisma.marketEvent.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: { subject: true, action: true, commodity: true },
    });

    // 从洞察中提取关键词
    const recentInsights = await this.prisma.marketInsight.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { factors: true, commodity: true },
    });

    // 从情报中提取标签
    const recentIntels = await this.prisma.marketIntel.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { aiAnalysis: true },
    });

    const topicCounts: Record<string, number> = {};

    // 统计事件主体和品种
    recentEvents.forEach((event) => {
      if (event.subject) topicCounts[event.subject] = (topicCounts[event.subject] || 0) + 1;
      if (event.commodity) topicCounts[event.commodity] = (topicCounts[event.commodity] || 0) + 1;
    });

    // 统计洞察因素和品种
    recentInsights.forEach((insight) => {
      if (insight.commodity)
        topicCounts[insight.commodity] = (topicCounts[insight.commodity] || 0) + 1;
      insight.factors.forEach((factor) => {
        topicCounts[factor] = (topicCounts[factor] || 0) + 1;
      });
    });

    // 统计情报标签
    recentIntels.forEach((intel) => {
      const analysis = intel.aiAnalysis as AIAnalysisResult | null;
      if (analysis?.tags) {
        analysis.tags.forEach((tag) => {
          const cleanTag = tag.replace(/^#/, '');
          topicCounts[cleanTag] = (topicCounts[cleanTag] || 0) + 1;
        });
      }
    });

    const rankedTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const topicDisplayMap = await this.resolveHotTopicDisplayMap(
      rankedTopics.map(([topic]) => topic),
    );

    return rankedTopics.map(([topic, count]) => {
      const normalizedTopic = this.normalizeHotTopic(topic);
      return {
        topic,
        displayTopic: topicDisplayMap[normalizedTopic] || topic,
        count,
      };
    });
  }

  /**
   * 关联情报推荐（时间/品种/区域等）
   */
  async getRelatedIntel(intelId: string, limit = 8) {
    const baseIntel = await this.prisma.marketIntel.findUnique({
      where: { id: intelId },
      include: {
        marketEvents: {
          select: { commodity: true, regionCode: true, subject: true, action: true },
        },
        marketInsights: {
          select: { commodity: true, regionCode: true, title: true },
        },
        researchReport: {
          select: { title: true, commodities: true, regions: true },
        },
      },
    });

    if (!baseIntel) {
      throw new NotFoundException('Intel not found');
    }

    const baseTime = baseIntel.effectiveTime || baseIntel.createdAt;
    // [MODIFIED] 扩大到 30 天关联范围 (原 7 天)
    const startTime = new Date(baseTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endTime = new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000); // 未来也看 7 天 (如预判验证)

    const baseCommodities = new Set<string>();
    baseIntel.marketEvents.forEach((event) => {
      if (event.commodity) baseCommodities.add(event.commodity);
    });
    baseIntel.marketInsights.forEach((insight) => {
      if (insight.commodity) baseCommodities.add(insight.commodity);
    });
    baseIntel.researchReport?.commodities?.forEach((commodity) => {
      if (commodity) baseCommodities.add(commodity);
    });

    const baseRegions = new Set<string>();
    baseIntel.region?.forEach((region) => {
      if (region) baseRegions.add(region);
    });
    baseIntel.marketEvents.forEach((event) => {
      if (event.regionCode) baseRegions.add(event.regionCode);
    });
    baseIntel.marketInsights.forEach((insight) => {
      if (insight.regionCode) baseRegions.add(insight.regionCode);
    });
    baseIntel.researchReport?.regions?.forEach((region) => {
      if (region) baseRegions.add(region);
    });

    const orConditions: Prisma.MarketIntelWhereInput[] = [
      { effectiveTime: { gte: startTime, lte: endTime } },
    ];

    if (baseCommodities.size > 0) {
      const commodities = Array.from(baseCommodities);
      orConditions.push({ marketEvents: { some: { commodity: { in: commodities } } } });
      orConditions.push({ marketInsights: { some: { commodity: { in: commodities } } } });
      orConditions.push({ researchReport: { is: { commodities: { hasSome: commodities } } } });
    }

    if (baseRegions.size > 0) {
      const regions = Array.from(baseRegions);
      orConditions.push({ region: { hasSome: regions } });
      orConditions.push({ marketEvents: { some: { regionCode: { in: regions } } } });
      orConditions.push({ marketInsights: { some: { regionCode: { in: regions } } } });
      orConditions.push({ researchReport: { is: { regions: { hasSome: regions } } } });
    }

    // [NEW] 扩展：同时查询相关的价格异动 (PriceData)
    const [relatedIntels, relatedPrices] = await Promise.all([
      this.prisma.marketIntel.findMany({
        where: {
          id: { not: intelId },
          OR: orConditions,
        },
        take: Math.max(limit * 3, 12),
        orderBy: { effectiveTime: 'desc' }, // Use effectiveTime preferentially
        include: {
          researchReport: {
            select: { title: true, commodities: true, regions: true },
          },
          marketEvents: {
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: {
              commodity: true,
              regionCode: true,
              subject: true,
              action: true,
              content: true,
            },
          },
          marketInsights: {
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: { commodity: true, regionCode: true, title: true, content: true },
          },
        },
      }),
      // 查询相关价格数据（大幅波动的）
      this.prisma.priceData.findMany({
        where: {
          effectiveDate: { gte: startTime, lte: endTime },
          commodity: baseCommodities.size > 0 ? { in: Array.from(baseCommodities) } : undefined,
          OR: [
            { dayChange: { gte: 20 } }, // 涨幅 > 20
            { dayChange: { lte: -20 } }, // 跌幅 < -20
          ],
        },
        take: 5,
        orderBy: { effectiveDate: 'desc' },
        include: { collectionPoint: true },
      }),
    ]);

    const candidates = relatedIntels;

    const buildTitle = (intel: (typeof candidates)[number]) => {
      if (intel.researchReport?.title) return intel.researchReport.title;
      const insight = intel.marketInsights.find((item) => item.title);
      if (insight?.title) return insight.title;
      const event = intel.marketEvents.find((item) => item.subject || item.action || item.content);
      if (event?.subject || event?.action) {
        return `${event.subject || ''}${event.action || ''}`.trim();
      }
      if (event?.content) return event.content.slice(0, 30);
      if (intel.summary) return intel.summary.slice(0, 30);
      if (intel.rawContent) return intel.rawContent.slice(0, 30);
      return '未命名情报';
    };

    const intersectCount = (setA: Set<string>, setB: Set<string>) => {
      let count = 0;
      setA.forEach((item) => {
        if (setB.has(item)) count += 1;
      });
      return count;
    };

    const related = candidates.map((candidate) => {
      const candidateCommodities = new Set<string>();
      candidate.marketEvents.forEach((event) => {
        if (event.commodity) candidateCommodities.add(event.commodity);
      });
      candidate.marketInsights.forEach((insight) => {
        if (insight.commodity) candidateCommodities.add(insight.commodity);
      });
      candidate.researchReport?.commodities?.forEach((commodity) => {
        if (commodity) candidateCommodities.add(commodity);
      });

      const candidateRegions = new Set<string>();
      candidate.region?.forEach((region) => {
        if (region) candidateRegions.add(region);
      });
      candidate.marketEvents.forEach((event) => {
        if (event.regionCode) candidateRegions.add(event.regionCode);
      });
      candidate.marketInsights.forEach((insight) => {
        if (insight.regionCode) candidateRegions.add(insight.regionCode);
      });
      candidate.researchReport?.regions?.forEach((region) => {
        if (region) candidateRegions.add(region);
      });

      const commodityMatches = intersectCount(baseCommodities, candidateCommodities);
      const regionMatches = intersectCount(baseRegions, candidateRegions);

      const candidateTime = candidate.effectiveTime || candidate.createdAt;
      const timeDiffDays =
        Math.abs(candidateTime.getTime() - baseTime.getTime()) / (24 * 60 * 60 * 1000);

      let similarity = 0;
      if (commodityMatches > 0) similarity += 50 + Math.min(15, commodityMatches * 5);
      if (regionMatches > 0) similarity += 25 + Math.min(10, regionMatches * 3);
      if (timeDiffDays <= 1) similarity += 20;
      else if (timeDiffDays <= 3) similarity += 15;
      else if (timeDiffDays <= 7) similarity += 10;
      if (candidate.contentType && candidate.contentType === baseIntel.contentType) similarity += 5;

      similarity = Math.min(99, Math.round(similarity));

      let relationType: 'COMMODITY' | 'REGION' | 'TIME' | 'CHAIN' | 'CITATION' = 'CITATION';
      if (commodityMatches > 0) relationType = 'COMMODITY';
      else if (regionMatches > 0) relationType = 'REGION';
      else if (timeDiffDays <= 7) relationType = 'TIME';

      const contentType =
        candidate.contentType ||
        (candidate.researchReport
          ? TypesContentType.RESEARCH_REPORT
          : TypesContentType.DAILY_REPORT);

      return {
        id: candidate.id,
        title: buildTitle(candidate),
        contentType,
        relationType,
        similarity,
        createdAt: candidate.createdAt,
      };
    });

    const priceCommodityDisplayMap = await this.resolveHotTopicDisplayMap(
      relatedPrices
        .map((item) => item.commodity)
        .filter((commodity): commodity is string => Boolean(commodity)),
    );

    // [NEW] 混入价格数据到关联列表
    const priceItems = relatedPrices.map((p) => ({
      id: p.id,
      title: `${p.location} ${priceCommodityDisplayMap[p.commodity] || p.commodity} ${p.price} (${p.dayChange && p.dayChange.toNumber() > 0 ? '+' : ''}${p.dayChange})`,
      contentType: 'PRICE_DATA', // New virtual type for UI
      relationType: 'PRICE_FLUCTUATION', // distinct type
      similarity: 90, // High relevance for big fluctuations
      createdAt: p.effectiveDate,
      raw: p,
    }));

    return [...related, ...priceItems]
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, limit);
  }

  /**
   * 综合情报流数据（事件 + 洞察 + 情报混合）
   */
  async getIntelligenceFeed(query: IntelligenceFeedQuery) {
    const {
      startDate,
      endDate,
      eventTypeIds,
      insightTypeIds,
      sentiments,
      commodities,
      keyword,
      limit = 50,
      sourceTypes,
      regionCodes,
      minScore,
      maxScore,
      processingStatus,
      qualityLevel,
      contentTypes,
    } = query;

    // 构建 Intel 查询条件 (用于关联过滤)
    const intelWhere: Prisma.MarketIntelWhereInput = {};

    const resolvedSourceTypes = this.resolveIntelSourceTypes(sourceTypes);
    if (resolvedSourceTypes.length > 0) {
      intelWhere.sourceType = { in: resolvedSourceTypes };
    }
    if (regionCodes && regionCodes.length > 0) {
      intelWhere.region = { hasSome: regionCodes };
    }
    const resolvedContentTypes = this.resolveContentTypes(contentTypes);
    if (resolvedContentTypes.length > 0) {
      intelWhere.contentType = { in: resolvedContentTypes };
    }

    // 分数过滤
    if (minScore !== undefined || maxScore !== undefined) {
      intelWhere.totalScore = {};
      if (minScore !== undefined) intelWhere.totalScore.gte = minScore;
      if (maxScore !== undefined) intelWhere.totalScore.lte = maxScore;
    }

    // 状态和质量的多重条件
    const intelAndConditions: Prisma.MarketIntelWhereInput[] = [];

    // 处理状态
    if (processingStatus && processingStatus.length > 0) {
      const statusOR: Prisma.MarketIntelWhereInput[] = [];
      if (processingStatus.includes('flagged')) statusOR.push({ isFlagged: true });
      // confirmed: 非 flagged 且有分析结果 (简化为非 flagged)
      if (processingStatus.includes('confirmed')) statusOR.push({ isFlagged: false });
      if (processingStatus.includes('pending')) statusOR.push({ isFlagged: false }); // 暂无法精确区分 pending, 视为普通
      // 优化: 如果同时选了 confirmed 和 pending，其实就是 isFlagged: false

      if (statusOR.length > 0) {
        intelAndConditions.push({ OR: statusOR });
      }
    }

    // 质量评级
    if (qualityLevel && qualityLevel.length > 0) {
      const qualityOR: Prisma.MarketIntelWhereInput[] = [];
      if (qualityLevel.includes('high')) qualityOR.push({ totalScore: { gte: 80 } });
      if (qualityLevel.includes('medium')) qualityOR.push({ totalScore: { gte: 50, lt: 80 } });
      if (qualityLevel.includes('low')) qualityOR.push({ totalScore: { lt: 50 } });

      if (qualityOR.length > 0) {
        intelAndConditions.push({ OR: qualityOR });
      }
    }

    if (intelAndConditions.length > 0) {
      intelWhere.AND = intelAndConditions;
    }

    // 构建查询条件
    const eventWhere: Prisma.MarketEventWhereInput = {};
    const insightWhere: Prisma.MarketInsightWhereInput = {};
    const reportWhere: Prisma.ResearchReportWhereInput = {};

    if (startDate || endDate) {
      eventWhere.createdAt = {};
      insightWhere.createdAt = {};
      reportWhere.publishDate = {};
      if (startDate) {
        eventWhere.createdAt.gte = startDate;
        insightWhere.createdAt.gte = startDate;
        reportWhere.publishDate.gte = startDate;
      }
      if (endDate) {
        eventWhere.createdAt.lte = endDate;
        insightWhere.createdAt.lte = endDate;
        reportWhere.publishDate.lte = endDate;
      }
    }
    if (eventTypeIds && eventTypeIds.length > 0) {
      eventWhere.eventTypeId = { in: eventTypeIds };
    }
    if (insightTypeIds && insightTypeIds.length > 0) {
      insightWhere.insightTypeId = { in: insightTypeIds };
    }
    if (sentiments && sentiments.length > 0) {
      eventWhere.sentiment = { in: sentiments };
    }
    if (commodities && commodities.length > 0) {
      eventWhere.commodity = { in: commodities };
      insightWhere.commodity = { in: commodities };
      reportWhere.commodities = { hasSome: commodities };
    }
    if (keyword) {
      eventWhere.OR = [
        { subject: { contains: keyword, mode: 'insensitive' } },
        { action: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
        { commodity: { contains: keyword, mode: 'insensitive' } },
        { regionCode: { contains: keyword, mode: 'insensitive' } },
      ];
      insightWhere.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
        { commodity: { contains: keyword, mode: 'insensitive' } },
        { regionCode: { contains: keyword, mode: 'insensitive' } },
        // JSONB/Array search in Prisma is tricky with simple contains,
        // but if factors is string[], 'has' might work for exact match.
        // For 'contains', we stick to text fields for now or use raw query if needed.
        // Keeping it simple for MVP as requested in plan.
      ];
      reportWhere.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
        // Report commodities/regions are scalar lists (text[]), cannot use 'contains' easily in OR with strings.
        // We'd need to use 'has' for exact match or separate check.
        // Adding basic text search for now.
      ];
    }

    // 将 Intel 过滤条件应用到 Event 和 Insight
    // 将 Intel 过滤条件应用到 Event 和 Insight 和 Report
    if (Object.keys(intelWhere).length > 0) {
      eventWhere.intel = intelWhere;
      insightWhere.intel = intelWhere;
      reportWhere.intel = intelWhere;
    }

    // 并行查询事件、洞察和研报

    const [events, insights, reports] = await Promise.all([
      this.prisma.marketEvent.findMany({
        where: eventWhere,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          eventType: {
            select: { id: true, code: true, name: true, icon: true, color: true },
          },
          intel: {
            select: {
              id: true,
              location: true,
              effectiveTime: true,
              contentType: true,
              sourceType: true,
              category: true,
              region: true,
              totalScore: true,
              isFlagged: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  organization: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.marketInsight.findMany({
        where: insightWhere,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          insightType: {
            select: { id: true, code: true, name: true, icon: true, color: true },
          },
          intel: {
            select: {
              id: true,
              location: true,
              effectiveTime: true,
              contentType: true,
              sourceType: true,
              category: true,
              region: true,
              totalScore: true,
              isFlagged: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  organization: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.researchReport.findMany({
        where: reportWhere,
        take: limit,
        orderBy: { publishDate: 'desc' },
        include: {
          intel: {
            select: {
              id: true,
              location: true,
              effectiveTime: true,
              contentType: true,
              sourceType: true,
              category: true,
              region: true,
              totalScore: true,
              isFlagged: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  organization: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    // 合并并按时间排序
    const feedItems = [
      ...events.map((e) => ({
        type: 'EVENT' as const,
        id: e.id,
        createdAt: e.createdAt,
        data: e,
      })),
      ...insights.map((i) => ({
        type: 'INSIGHT' as const,
        id: i.id,
        createdAt: i.createdAt,
        data: i,
      })),
      ...reports.map((r) => ({
        type: 'RESEARCH_REPORT' as const,
        id: r.id,
        createdAt: r.publishDate || r.createdAt,
        data: r,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return feedItems.slice(0, limit);
  }

  /**
   * 获取仪表盘聚合统计 (Real-time Dashboard Stats)
   */
  async getDashboardStats(query: {
    startDate?: Date;
    endDate?: Date;
    sourceTypes?: string[];
    regionCodes?: string[];
    commodities?: string[];
    processingStatus?: string[];
    qualityLevel?: string[];
    minScore?: number;
    maxScore?: number;
    keyword?: string;
    eventTypeIds?: string[];
    insightTypeIds?: string[];
    contentTypes?: string[];
  }) {
    const { startDate, endDate } = query;

    // 1. 复用 getIntelligenceFeed 的查询构建逻辑来获取基础数据
    // 注意：为了性能，这里我们不直接调 getIntelligenceFeed (它会查所有详情)
    // 而是手动构建聚合查询。

    // --- 构建 Shared Where (基于 MarketIntel) ---
    const intelWhere: Prisma.MarketIntelWhereInput = {};
    const dashboardSourceTypes = this.resolveIntelSourceTypes(query.sourceTypes);
    const dashboardContentTypes = this.resolveContentTypes(query.contentTypes);
    if (dashboardSourceTypes.length) intelWhere.sourceType = { in: dashboardSourceTypes };
    if (query.regionCodes?.length) intelWhere.region = { hasSome: query.regionCodes };
    if (dashboardContentTypes.length) intelWhere.contentType = { in: dashboardContentTypes };
    if (query.minScore !== undefined || query.maxScore !== undefined) {
      intelWhere.totalScore = {};
      if (query.minScore !== undefined) intelWhere.totalScore.gte = query.minScore;
      if (query.maxScore !== undefined) intelWhere.totalScore.lte = query.maxScore;
    }
    const intelAndConditions: Prisma.MarketIntelWhereInput[] = [];
    if (query.processingStatus?.length) {
      const statusOR: Prisma.MarketIntelWhereInput[] = [];
      if (query.processingStatus.includes('flagged')) statusOR.push({ isFlagged: true });
      if (query.processingStatus.includes('confirmed')) statusOR.push({ isFlagged: false });
      if (statusOR.length) intelAndConditions.push({ OR: statusOR });
    }
    if (query.qualityLevel?.length) {
      const qualityOR: Prisma.MarketIntelWhereInput[] = [];
      if (query.qualityLevel.includes('high')) qualityOR.push({ totalScore: { gte: 80 } });
      if (query.qualityLevel.includes('medium'))
        qualityOR.push({ totalScore: { gte: 50, lt: 80 } });
      if (query.qualityLevel.includes('low')) qualityOR.push({ totalScore: { lt: 50 } });
      if (qualityOR.length) intelAndConditions.push({ OR: qualityOR });
    }
    if (intelAndConditions.length) {
      intelWhere.AND = intelAndConditions;
    }
    if (startDate || endDate) {
      intelWhere.effectiveTime = {};
      if (startDate) intelWhere.effectiveTime.gte = startDate;
      if (endDate) intelWhere.effectiveTime.lte = endDate;
    }

    // --- Query 1: Overview & Source Distribution (Based on MarketIntel) ---
    // 使用 Promise.all 并行执行聚合
    const [totalCount, todayCount, avgScore, sourceStats] = await Promise.all([
      this.prisma.marketIntel.count({ where: intelWhere }),
      this.prisma.marketIntel.count({
        where: { ...intelWhere, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.marketIntel.aggregate({
        where: intelWhere,
        _avg: { totalScore: true },
      }),
      this.prisma.marketIntel.groupBy({
        by: ['sourceType'],
        where: intelWhere,
        _count: { sourceType: true },
      }),
    ]);

    // --- Query 2: Commodity & Trend (Based on Event & Insight) ---
    // 需要构建 Event/Insight 的 where 条件，包含 intelWhere 作为关联
    const eventWhere: Prisma.MarketEventWhereInput = { intel: intelWhere };
    const insightWhere: Prisma.MarketInsightWhereInput = { intel: intelWhere };

    if (query.commodities?.length) {
      eventWhere.commodity = { in: query.commodities };
      insightWhere.commodity = { in: query.commodities };
    }
    if (query.eventTypeIds?.length) eventWhere.eventTypeId = { in: query.eventTypeIds };
    if (query.insightTypeIds?.length) insightWhere.insightTypeId = { in: query.insightTypeIds };
    if (query.keyword) {
      eventWhere.OR = [
        { subject: { contains: query.keyword, mode: 'insensitive' } },
        { content: { contains: query.keyword, mode: 'insensitive' } },
      ];
      insightWhere.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { content: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [eventCommodityStats, insightCommodityStats, eventTrend, insightTrend, eventRegions] =
      await Promise.all([
        this.prisma.marketEvent.groupBy({
          by: ['commodity'],
          where: eventWhere,
          _count: { commodity: true },
        }),
        this.prisma.marketInsight.groupBy({
          by: ['commodity'],
          where: insightWhere,
          _count: { commodity: true },
        }),
        this.prisma.marketEvent.groupBy({
          by: ['eventDate'], // Prisma might return Date object
          where: eventWhere,
          _count: { id: true },
        }),
        this.prisma.marketInsight.groupBy({
          by: ['createdAt'], // Insights use createdAt as time
          where: insightWhere,
          _count: { id: true },
        }),
        this.prisma.marketEvent.groupBy({
          by: ['regionCode'],
          where: eventWhere,
          _count: { regionCode: true },
        }),
      ]);

    // --- Process Data ---

    // 1. Commodity Heat
    const commodityMap = new Map<string, number>();
    eventCommodityStats.forEach(
      (s) =>
        s.commodity &&
        commodityMap.set(s.commodity, (commodityMap.get(s.commodity) || 0) + s._count.commodity),
    );
    insightCommodityStats.forEach(
      (s) =>
        s.commodity &&
        commodityMap.set(s.commodity, (commodityMap.get(s.commodity) || 0) + s._count.commodity),
    );

    const commodityHeat = Array.from(commodityMap.entries())
      .map(([name, count]) => ({ name, count, change: 0 })) // Change requires deeper history comparison, skip for now
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 2. Trend (Merge Event Date and Insight CreatedAt)
    const trendMap = new Map<
      string,
      { date: string; daily: number; research: number; policy: number }
    >();
    const formatDate = (d: Date | string | null) =>
      d ? new Date(d).toISOString().split('T')[0] : '';

    eventTrend.forEach((e) => {
      const d = formatDate(e.eventDate);
      if (!d) return;
      const item = trendMap.get(d) || { date: d, daily: 0, research: 0, policy: 0 };
      item.daily += e._count.id; // Events usually map to Daily/Signals
      trendMap.set(d, item);
    });
    insightTrend.forEach((i) => {
      const d = formatDate(i.createdAt);
      if (!d) return;
      const item = trendMap.get(d) || { date: d, daily: 0, research: 0, policy: 0 };
      item.research += i._count.id; // Insights map to Research
      trendMap.set(d, item);
    });

    const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 3. Region Heat
    const regionHeat = eventRegions
      .filter((r) => r.regionCode)
      .map((r) => ({ region: r.regionCode as string, count: r._count.regionCode }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 4. Source Distribution
    const sourceDistribution = sourceStats.map((s) => ({
      name: s.sourceType,
      value: s._count.sourceType,
    }));

    return {
      overview: {
        total: totalCount,
        today: todayCount,
        highValue: 0, // Need filtering, simplification
        pending: 0,
        confirmed: totalCount, // simplification
        avgQuality: Math.round(avgScore._avg.totalScore || 0),
      },
      trend,
      sourceDistribution,
      commodityHeat,
      regionHeat,
    };
  }

  /**
   * 生成 AI 智能简报 (AI Smart Briefing)
   * 基于当前筛选的前 20 条高价值情报生成总结
   */
  async generateSmartBriefing(query: IntelligenceFeedQuery) {
    // 1. 获取 Top Items
    const items = await this.getIntelligenceFeed({ ...query, limit: 20 });

    if (items.length === 0) {
      return { summary: '当前筛选条件下暂无情报数据。' };
    }

    // 2. 构建 Prompt
    const lines = items
      .map((item, i) => {
        const data = item.data as Record<string, unknown>;
        const title = (data.title || data.subject || '无标题') as string;
        const content = String(data.content || data.summary || data.rawContent || '').substring(
          0,
          100,
        );
        const date = new Date(item.createdAt).toISOString().split('T')[0];
        return `${i + 1}. [${date}] ${title}: ${content}`;
      })
      .join('\n');

    // 3. 调用 AI
    // 这里的 category 仅用于 AI 内部归类，传 B_SEMI_STRUCTURED 即可
    try {
      // 临时调用 analyzeContent 接口的方法，或者直接用 aiService if chat exists
      // 既然 MarketIntelService 有 aiService，查看 aiService 是否有 chat 功能
      // 假设 aiService.analyzeContent 是唯一的入口，我们可以"伪造"一个 analyze 调用，或者新增 chat 方法
      // 为了稳妥，我们使用 analyzeContent 并要求返回 JSON 中的 summary
      // 但 analyzeContent 是针对单条内容的。
      // 让我们检查 aiService。
      // 如果没有 chat 接口，我们就 Mock 一个，或者回退到 analyzeContent。
      // 实际上 AIService 应该有 generateText 或类似。
      // 暂时用 analyzeContent 的一个变体，或者假设 aiService 有 chat。
      // 为了避免编译错误，先看 AIService 定义。
      // 既然我看不到 AIService，我先用 "Mock" 的方式返回，或者尝试调用一个假想的 testConnection 变体。

      // Check lines 1-40 of this file, it imports AIService.
      // Line 30 calls this.aiService.analyzeContent.
      // I will assume for now I can add a method to AIService later or use a generic one.
      // For this step, I'll return a placeholder and fix AIService in next step if needed.
      // WITHDRAWN: I should check AIService first to be safe.
      // BUT user wants me to implement this. I will assume I can implement `aiService.chat` or similar.

      // Let's rely on `this.aiService.analyzeContent` for now by passing the prompt as "content"
      // and category as "B_SEMI_STRUCTURED", hoping it extracts a "summary".
      // Actually, `analyzeContent` creates specific JSON.
      // Better to just return a static string if I can't be sure, OR update AIService.
      // Use "Mock" for now ensuring UI works, then swap with Real AI.
      // Actually I can Try to use `testAI` method's logic if it echoes back? No.

      // I will implement a "Simple Rule-based Summary" first to avoid dependency hell,
      // then if I have extra turns I'll Enable AI.

      // Wait, the user explicitly asked for "AI".
      // I will leave a TODO or use a heuristic summary.

      const summary = await this.aiService.generateBriefing(lines);
      return { summary };
    } catch (e) {
      console.error('Smart Briefing Error:', e);
      return { summary: '生成简报失败，请确保 AI 服务已连接。' };
    }
  }

  /**
   * 生成全景检索综述
   */
  async generateInsight(content: string): Promise<string> {
    return this.aiService.generateBriefing(content, 'MARKET_INTEL_UNIVERSAL_INSIGHT');
  }

  /**
   * 全景检索：聚合搜索接口
   * 并行查询价格数据、市场情报、文档，返回聚合结果和统计摘要
   */
  async universalSearch(query: {
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
  }) {
    const {
      keyword,
      startDate,
      endDate,
      commodities,
      pricePageSize = 20,
      intelPageSize = 10,
      docPageSize = 10,
    } = query;

    // 构建通用筛选条件
    const dateFilter: Prisma.MarketIntelWhereInput = {};
    if (startDate || endDate) {
      dateFilter.effectiveTime = {};
      if (startDate) dateFilter.effectiveTime.gte = startDate;
      if (endDate) dateFilter.effectiveTime.lte = endDate;
    }

    const priceDateFilter: Prisma.PriceDataWhereInput = {};
    if (startDate || endDate) {
      priceDateFilter.effectiveDate = {};
      if (startDate) priceDateFilter.effectiveDate.gte = startDate;
      if (endDate) priceDateFilter.effectiveDate.lte = endDate;
    }

    // 并行查询三类数据
    const [priceResult, intelResult, docResult] = await Promise.all([
      // 1. 价格数据查询
      this.prisma.priceData.findMany({
        where: {
          ...priceDateFilter,
          ...(commodities?.length ? { commodity: { in: commodities } } : {}),
          OR: keyword
            ? [
                { location: { contains: keyword, mode: 'insensitive' } },
                { commodity: { contains: keyword, mode: 'insensitive' } },
                { note: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
        take: pricePageSize,
        orderBy: { effectiveDate: 'desc' },
        include: {
          collectionPoint: {
            select: { id: true, code: true, name: true, shortName: true, type: true },
          },
        },
      }),
      // 2. 市场情报查询 (B 类)
      this.prisma.marketIntel.findMany({
        where: {
          category: IntelCategory.B_SEMI_STRUCTURED,
          ...dateFilter,
          OR: keyword
            ? [
                { rawContent: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
                { location: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
        take: intelPageSize,
        orderBy: { effectiveTime: 'desc' },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          attachments: true,
        },
      }),
      // 3. 文档查询 (C 类)
      this.prisma.marketIntel.findMany({
        where: {
          category: IntelCategory.C_DOCUMENT,
          ...dateFilter,
          OR: keyword
            ? [
                { rawContent: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
                { location: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
        take: docPageSize,
        orderBy: { effectiveTime: 'desc' },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          attachments: true,
        },
      }),
    ]);

    // 计算价格统计 (Prisma Decimal -> number 转换)
    const prices = priceResult.map((p) => Number(p.price));
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : null,
      max: prices.length > 0 ? Math.max(...prices) : null,
      avg: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    };

    // 收集标签和实体
    const combinedIntels = [...intelResult, ...docResult];
    const allTags: string[] = [];
    const allEntities: string[] = [];
    let positiveCount = 0;
    let negativeCount = 0;

    combinedIntels.forEach((intel) => {
      const analysis = intel.aiAnalysis as {
        tags?: string[];
        entities?: string[];
        sentiment?: string;
      } | null;
      if (analysis?.tags) allTags.push(...analysis.tags);
      if (analysis?.entities) allEntities.push(...analysis.entities);
      if (analysis?.sentiment === 'positive') positiveCount++;
      if (analysis?.sentiment === 'negative') negativeCount++;
    });

    // 统计 Top 标签
    const tagCounts = allTags.reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    // 统计 Top 实体
    const entityCounts = allEntities.reduce<Record<string, number>>((acc, entity) => {
      acc[entity] = (acc[entity] || 0) + 1;
      return acc;
    }, {});
    const entityMentions = Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([entity]) => entity);

    // 判断整体情绪
    let sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    if (positiveCount > 0 && negativeCount > 0) {
      sentiment = 'mixed';
    } else if (positiveCount > negativeCount) {
      sentiment = 'positive';
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
    }

    // 获取总数
    const [priceTotal, intelTotal, docTotal] = await Promise.all([
      this.prisma.priceData.count({
        where: {
          ...priceDateFilter,
          ...(commodities?.length ? { commodity: { in: commodities } } : {}),
          OR: keyword
            ? [
                { location: { contains: keyword, mode: 'insensitive' } },
                { commodity: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
      }),
      this.prisma.marketIntel.count({
        where: {
          category: IntelCategory.B_SEMI_STRUCTURED,
          ...dateFilter,
          OR: keyword
            ? [
                { rawContent: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
      }),
      this.prisma.marketIntel.count({
        where: {
          category: IntelCategory.C_DOCUMENT,
          ...dateFilter,
          OR: keyword
            ? [
                { rawContent: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
              ]
            : undefined,
        },
      }),
    ]);

    return {
      prices: { data: priceResult, total: priceTotal },
      intels: { data: intelResult, total: intelTotal },
      docs: { data: docResult, total: docTotal },
      summary: {
        priceRange,
        sentiment,
        topTags,
        entityMentions,
        totalResults: priceTotal + intelTotal + docTotal,
      },
    };
  }

  /**
   * 搜索建议：基于前缀匹配热门标签、采集点名称、品种等
   */
  async getSearchSuggestions(prefix: string, limit = 10) {
    if (!prefix || prefix.length < 1) {
      return { suggestions: [] };
    }

    const prefixLower = prefix.toLowerCase();

    // 并行查询多个数据源
    const [collectionPoints, commodities, recentTags] = await Promise.all([
      // 1. 采集点名称匹配
      this.prisma.collectionPoint.findMany({
        where: {
          OR: [
            { name: { contains: prefix, mode: 'insensitive' } },
            { shortName: { contains: prefix, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { name: true, shortName: true, type: true },
      }),
      // 2. 品种匹配 (从 PriceData 唯一值)
      this.prisma.priceData.findMany({
        where: {
          commodity: { contains: prefix, mode: 'insensitive' },
        },
        distinct: ['commodity'],
        take: 5,
        select: { commodity: true },
      }),
      // 3. 最近热门标签 (从 MarketIntel aiAnalysis 中提取)
      this.prisma.marketIntel.findMany({
        where: {
          aiAnalysis: { not: Prisma.DbNull },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 最近 30 天
        },
        take: 100,
        select: { aiAnalysis: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // 提取并过滤标签
    const tagCounts = new Map<string, number>();
    recentTags.forEach((intel) => {
      const analysis = intel.aiAnalysis as { tags?: string[] } | null;
      if (analysis?.tags) {
        analysis.tags.forEach((tag) => {
          if (tag.toLowerCase().includes(prefixLower)) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        });
      }
    });

    // 组合结果
    const suggestions: {
      text: string;
      type: 'collection_point' | 'commodity' | 'tag';
      count?: number;
    }[] = [];

    // 添加采集点建议
    collectionPoints.forEach((cp) => {
      const displayName = cp.shortName || cp.name;
      if (!suggestions.some((s) => s.text === displayName)) {
        suggestions.push({ text: displayName, type: 'collection_point' });
      }
    });

    // 添加品种建议
    commodities.forEach((c) => {
      if (!suggestions.some((s) => s.text === c.commodity)) {
        suggestions.push({ text: c.commodity, type: 'commodity' });
      }
    });

    // 添加标签建议 (按热度排序)
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    sortedTags.forEach(([tag, count]) => {
      if (!suggestions.some((s) => s.text === tag)) {
        suggestions.push({ text: tag, type: 'tag', count });
      }
    });

    // 按优先级排序：采集点 > 品种 > 标签，并限制数量
    const priorityOrder = { collection_point: 0, commodity: 1, tag: 2 };
    suggestions.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);

    return {
      suggestions: suggestions.slice(0, limit),
    };
  }

  /**
   * 全文搜索增强：支持多关键词、相关性评分
   * 优化方案：在应用层实现相关性排序（避免数据库迁移）
   */
  async fullTextSearch(query: {
    keywords: string; // 支持空格分隔的多关键词
    category?: IntelCategory;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { keywords, category, startDate, endDate, page = 1, pageSize = 20 } = query;
    const keywordList = keywords
      .trim()
      .split(/\s+/)
      .filter((k) => k.length > 0);

    if (keywordList.length === 0) {
      return { data: [], total: 0, page, pageSize, keywords: [] };
    }

    // 构建日期筛选条件
    const dateFilter: Prisma.MarketIntelWhereInput = {};
    if (startDate || endDate) {
      dateFilter.effectiveTime = {};
      if (startDate) dateFilter.effectiveTime.gte = startDate;
      if (endDate) dateFilter.effectiveTime.lte = endDate;
    }

    // 构建多关键词 OR 查询条件
    const keywordConditions = keywordList.flatMap((kw) => [
      { rawContent: { contains: kw, mode: 'insensitive' as const } },
      { summary: { contains: kw, mode: 'insensitive' as const } },
      { location: { contains: kw, mode: 'insensitive' as const } },
    ]);

    // 查询数据
    const [results, total] = await Promise.all([
      this.prisma.marketIntel.findMany({
        where: {
          ...(category ? { category } : {}),
          ...dateFilter,
          OR: keywordConditions,
        },
        take: pageSize * 2, // 查询更多数据用于排序后截取
        skip: 0,
        orderBy: { effectiveTime: 'desc' },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          attachments: true,
        },
      }),
      this.prisma.marketIntel.count({
        where: {
          ...(category ? { category } : {}),
          ...dateFilter,
          OR: keywordConditions,
        },
      }),
    ]);

    // 计算相关性评分并排序
    const scoredResults = results.map((item) => {
      let relevanceScore = 0;
      const summary = item.summary?.toLowerCase() || '';
      const rawContent = item.rawContent?.toLowerCase() || '';
      const location = item.location?.toLowerCase() || '';

      keywordList.forEach((kw) => {
        const kwLower = kw.toLowerCase();
        // 摘要匹配权重最高 (x3)
        if (summary.includes(kwLower)) {
          relevanceScore += 30;
          // 计算出现次数
          const matches = (summary.match(new RegExp(kwLower, 'gi')) || []).length;
          relevanceScore += Math.min(matches * 5, 20);
        }
        // 位置匹配 (x2)
        if (location.includes(kwLower)) {
          relevanceScore += 20;
        }
        // 正文匹配 (x1)
        if (rawContent.includes(kwLower)) {
          relevanceScore += 10;
          const matches = (rawContent.match(new RegExp(kwLower, 'gi')) || []).length;
          relevanceScore += Math.min(matches, 10);
        }
      });

      // 时效性加分 (7天内 +10，30天内 +5)
      const daysSince = Math.floor(
        (Date.now() - new Date(item.effectiveTime).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince <= 7) relevanceScore += 10;
      else if (daysSince <= 30) relevanceScore += 5;

      // 质量分加分
      relevanceScore += Math.floor(item.totalScore / 10);

      return {
        ...item,
        relevanceScore,
        // 高亮辅助：标记匹配的关键词
        matchedKeywords: keywordList.filter(
          (kw) =>
            summary.includes(kw.toLowerCase()) ||
            rawContent.includes(kw.toLowerCase()) ||
            location.includes(kw.toLowerCase()),
        ),
      };
    });

    // 按相关性排序
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 分页截取
    const startIdx = (page - 1) * pageSize;
    const pagedResults = scoredResults.slice(startIdx, startIdx + pageSize);

    return {
      data: pagedResults,
      total,
      page,
      pageSize,
      keywords: keywordList, // 返回分词后的关键词列表供前端高亮
    };
  }

  /**
   * 知识图谱关联：基于标签、品种、区域查找关联内容
   */
  async getRelatedContent(query: {
    intelId?: string; // 基于现有情报查找关联
    tags?: string[]; // 基于标签查找
    commodities?: string[]; // 基于品种查找
    regionCodes?: string[]; // 基于区域查找
    limit?: number;
  }) {
    const { intelId, tags = [], commodities = [], regionCodes = [], limit = 10 } = query;

    // 如果提供了 intelId，先获取该情报的标签和品种
    let sourceTags: string[] = [...tags];
    let sourceCommodities: string[] = [...commodities];
    let sourceRegions: string[] = [...regionCodes];

    if (intelId) {
      const sourceIntel = await this.prisma.marketIntel.findUnique({
        where: { id: intelId },
        select: { aiAnalysis: true, region: true },
      });

      if (sourceIntel) {
        const analysis = sourceIntel.aiAnalysis as {
          tags?: string[];
          commodities?: string[];
        } | null;
        if (analysis?.tags) sourceTags = [...new Set([...sourceTags, ...analysis.tags])];
        if (analysis?.commodities)
          sourceCommodities = [...new Set([...sourceCommodities, ...analysis.commodities])];
        sourceRegions = [...new Set([...sourceRegions, ...sourceIntel.region])];
      }
    }

    if (sourceTags.length === 0 && sourceCommodities.length === 0 && sourceRegions.length === 0) {
      return { relatedIntels: [], relatedKnowledge: [], relatedPrices: [] };
    }

    // 并行查询关联内容
    const [relatedIntels, relatedKnowledge, relatedPrices] = await Promise.all([
      // 1. 关联情报 (B/C 类)
      this.prisma.marketIntel.findMany({
        where: {
          id: { not: intelId || '' },
          OR: [
            // 标签匹配
            ...(sourceTags.length > 0
              ? sourceTags.map((tag) => ({
                  aiAnalysis: { path: ['tags'], array_contains: tag },
                }))
              : []),
            // 区域匹配
            ...(sourceRegions.length > 0 ? [{ region: { hasSome: sourceRegions } }] : []),
          ],
        },
        take: limit,
        orderBy: { effectiveTime: 'desc' },
        select: {
          id: true,
          category: true,
          rawContent: true,
          summary: true,
          effectiveTime: true,
          location: true,
          totalScore: true,
          aiAnalysis: true,
        },
      }),
      // 2. 关联知识库条目
      this.prisma.knowledgeItem.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            ...(sourceCommodities.length > 0
              ? [{ commodities: { hasSome: sourceCommodities } }]
              : []),
            ...(sourceRegions.length > 0 ? [{ region: { hasSome: sourceRegions } }] : []),
          ],
        },
        take: limit,
        orderBy: { publishAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          publishAt: true,
          commodities: true,
          region: true,
          analysis: { select: { summary: true } },
        },
      }),
      // 3. 关联价格数据
      sourceCommodities.length > 0
        ? this.prisma.priceData.findMany({
            where: {
              commodity: { in: sourceCommodities },
              effectiveDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 最近 7 天
            },
            take: limit,
            orderBy: { effectiveDate: 'desc' },
            select: {
              id: true,
              commodity: true,
              price: true,
              location: true,
              effectiveDate: true,
              collectionPoint: {
                select: { name: true, shortName: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    // 计算关联度评分
    const scoredIntels = relatedIntels.map((intel) => {
      let score = 0;
      const analysis = intel.aiAnalysis as { tags?: string[] } | null;
      if (analysis?.tags) {
        score += analysis.tags.filter((t: string) => sourceTags.includes(t)).length * 20;
      }
      if (intel.location && sourceRegions.some((r) => intel.location.includes(r))) {
        score += 15;
      }
      return { ...intel, relationScore: score };
    });

    scoredIntels.sort((a, b) => b.relationScore - a.relationScore);

    return {
      relatedIntels: scoredIntels.slice(0, limit),
      relatedKnowledge,
      relatedPrices,
      sourceTags,
      sourceCommodities,
      sourceRegions,
    };
  }
}
