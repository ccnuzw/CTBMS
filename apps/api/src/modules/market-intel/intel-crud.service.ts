import { Injectable, NotFoundException , Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { IntelScoringService } from './intel-scoring.service';
import {
    CreateMarketIntelDto,
    UpdateMarketIntelDto,
    MarketIntelQuery,
    AIAnalysisResult,
} from '@packages/types';
import {
    IntelCategory,
    PriceSourceType,
    PriceSubType,
    GeoLevel,
    Prisma,
} from '@prisma/client';
import { normalizePriceSubType } from './market-intel.utils';

@Injectable()
export class IntelCrudService {
  private readonly logger = new Logger(IntelCrudService.name);
    constructor(
        private prisma: PrismaService,
        private knowledgeService: KnowledgeService,
        private scoringService: IntelScoringService,
    ) { }

    /**
     * 创建商情情报
     * 支持从 C 类日报自动提取 A 类价格数据
     */
    async create(dto: CreateMarketIntelDto, authorId: string, skipKnowledgeSync = false) {
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

            const aiAnalysis = dto.aiAnalysis as AIAnalysisResult | undefined;
            if (aiAnalysis?.pricePoints && aiAnalysis.pricePoints.length > 0) {
                await this.batchCreatePriceData(intel.id, authorId, dto.effectiveTime, aiAnalysis);
            }

            if (aiAnalysis) {
                await this.batchCreateEvents(intel.id, dto.effectiveTime, aiAnalysis);
                await this.batchCreateInsights(intel.id, dto.effectiveTime, aiAnalysis);
            }

            await this.scoringService.updateAuthorStats(authorId);

            if (!skipKnowledgeSync) {
                try {
                    await this.knowledgeService.syncFromMarketIntel(intel.id);
                } catch (syncError) {
                    this.logger.warn('[IntelCrudService.create] Knowledge V2 sync failed:', syncError);
                }
            }

            return intel;
        } catch (error) {
            this.logger.error('[IntelCrudService.create] FAILED', error);
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
            // 趋势
            this.prisma.marketIntel.findMany({
                where: {
                    category: IntelCategory.C_DOCUMENT,
                    createdAt: { gte: startDate },
                },
                select: { createdAt: true },
            }),
            // 最近文档用于提取标签
            this.prisma.marketIntel.findMany({
                where: { category: IntelCategory.C_DOCUMENT },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: { aiAnalysis: true },
            }),
        ]);

        const trendMap = new Map<string, number>();
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
     */
    async batchUpdateTags(ids: string[], addTags: string[], removeTags: string[]) {
        const intels = await this.prisma.marketIntel.findMany({
            where: { id: { in: ids } },
            select: { id: true, aiAnalysis: true },
        });

        if (intels.length === 0) {
            return { success: true, updatedCount: 0 };
        }

        const updates = intels.map((intel) => {
            const currentAnalysis = (intel.aiAnalysis ?? {}) as AIAnalysisResult;
            let currentTags: string[] = Array.isArray(currentAnalysis.tags) ? currentAnalysis.tags : [];

            if (removeTags.length > 0) {
                currentTags = currentTags.filter((t) => !removeTags.includes(t));
            }

            if (addTags.length > 0) {
                currentTags = Array.from(new Set([...currentTags, ...addTags]));
            }

            currentAnalysis.tags = currentTags;

            return this.prisma.marketIntel.update({
                where: { id: intel.id },
                data: { aiAnalysis: currentAnalysis },
            });
        });

        await this.prisma.$transaction(updates);

        return { success: true, updatedCount: intels.length };
    }

    /**
     * 批量创建价格数据
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

        for (const point of pricePoints) {
            const resolvedSourceType = Object.values(PriceSourceType).includes(
                point.sourceType as PriceSourceType,
            )
                ? (point.sourceType as PriceSourceType)
                : PriceSourceType.REGIONAL;
            const resolvedSubType = normalizePriceSubType(point.subType) || PriceSubType.LISTED;
            const resolvedGeoLevel = Object.values(GeoLevel).includes(point.geoLevel as GeoLevel)
                ? (point.geoLevel as GeoLevel)
                : GeoLevel.CITY;

            const priceData = {
                sourceType: resolvedSourceType,
                subType: resolvedSubType,
                geoLevel: resolvedGeoLevel,

                location: point.location,
                province: point.province || null,
                city: point.city || null,
                region: aiAnalysis.reportMeta?.region ? [aiAnalysis.reportMeta.region] : [],
                longitude: point.longitude || null,
                latitude: point.latitude || null,

                collectionPointId: point.collectionPointId || null,
                regionCode: point.regionCode || null,

                effectiveDate,
                commodity: point.commodity || aiAnalysis.reportMeta?.commodity || '玉米',
                grade: point.grade || null,
                price: point.price,
                dayChange: point.change,

                note: point.note || null,

                intelId,
                authorId,
            };

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
     * 批量创建市场事件
     */
    private async batchCreateEvents(
        intelId: string,
        effectiveTime: Date,
        aiAnalysis: AIAnalysisResult,
    ) {
        if (!aiAnalysis.events || aiAnalysis.events.length === 0) return;

        const defaultEventType = await this.prisma.eventTypeConfig.findFirst();
        if (!defaultEventType) return;

        const effectiveDate = new Date(effectiveTime);

        for (const event of aiAnalysis.events) {
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
                    content: event.sourceText || String(`${event.subject}${event.action}`),
                    impact: event.impact,
                    impactLevel: 'MEDIUM',
                    sentiment: 'NEUTRAL',

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
     * 批量创建市场洞察
     */
    private async batchCreateInsights(
        intelId: string,
        effectiveTime: Date,
        aiAnalysis: AIAnalysisResult,
    ) {
        if (aiAnalysis.forecast) {
            const forecastType = await this.prisma.insightTypeConfig.findUnique({
                where: { code: 'FORECAST' },
            });

            const typeId = forecastType?.id || (await this.prisma.insightTypeConfig.findFirst())?.id;

            if (typeId && aiAnalysis.forecast.shortTerm) {
                await this.prisma.marketInsight.create({
                    data: {
                        intelId,
                        insightTypeId: typeId,
                        title: '短期后市预判',
                        content: aiAnalysis.forecast.shortTerm,
                        timeframe: 'SHORT_TERM',
                        direction: 'STABLE',
                        confidence: 80,
                        factors: aiAnalysis.forecast.keyFactors || [],
                        commodity: aiAnalysis.reportMeta?.commodity,
                        regionCode: aiAnalysis.reportMeta?.region,
                        sourceText: aiAnalysis.forecast.shortTerm,
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

        if (keyword) {
            where.OR = [
                { rawContent: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
                { location: { contains: keyword, mode: 'insensitive' } },
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

    /**
     * 将文档升级为研报 (Promote to Report)
     */
    async promoteToReport(intelId: string, dto: { reportType: string; triggerDeepAnalysis?: boolean }) {
        const intel = await this.prisma.marketIntel.findUnique({
            where: { id: intelId },
        });

        if (!intel) {
            throw new NotFoundException(`文档 ID ${intelId} 不存在`);
        }

        const existingKnowledge = await this.prisma.knowledgeItem.findFirst({
            where: {
                originLegacyType: 'MARKET_INTEL',
                originLegacyId: intelId,
                type: 'RESEARCH',
            },
        });

        if (existingKnowledge) {
            return {
                success: true,
                reportId: existingKnowledge.id,
                report: existingKnowledge,
            };
        }

        const aiAnalysis = (intel.aiAnalysis ?? {}) as AIAnalysisResult;

        const title =
            aiAnalysis.extractedData?.title ||
            aiAnalysis.summary?.substring(0, 50) ||
            intel.summary?.substring(0, 50) ||
            '未命名研报';

        const commodities =
            aiAnalysis.commodities ||
            (aiAnalysis.reportMeta?.commodity ? [aiAnalysis.reportMeta.commodity] : []);
        const regions = aiAnalysis.regions || intel.region || [];

        const report = await this.knowledgeService.createResearchReport({
            title,
            contentPlain: intel.rawContent || intel.summary || '',
            reportType: dto.reportType,
            publishAt: intel.effectiveTime || new Date(),
            sourceType: intel.sourceType || 'INTERNAL_REPORT',
            commodities,
            region: regions,
            authorId: intel.authorId || 'system',
            triggerAnalysis: dto.triggerDeepAnalysis,
            intelId: intel.id,
            summary: intel.summary || '',
        });

        return {
            success: true,
            reportId: report.id,
            report,
        };
    }
}
