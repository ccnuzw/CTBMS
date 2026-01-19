import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AIService } from '../ai/ai.service';
import {
    CreateMarketIntelDto,
    UpdateMarketIntelDto,
    MarketIntelQuery,
    AIAnalysisResult,
    IntelCategory,
} from '@packages/types';

@Injectable()
export class MarketIntelService {
    constructor(
        private prisma: PrismaService,
        private aiService: AIService,
    ) { }

    /**
     * AI 内容分析
     */
    async analyze(content: string, category: IntelCategory, location?: string) {
        return this.aiService.analyzeContent(content, category, location);
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

        const intel = await this.prisma.marketIntel.create({
            data: {
                ...dto,
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

        return intel;
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
            // 优先使用 AI 解析时匹配到的企业ID，否则尝试查询
            let enterpriseId: string | null = point.enterpriseId || null;
            if (!enterpriseId && point.sourceType === 'ENTERPRISE' && point.enterpriseName) {
                const enterprise = await this.prisma.enterprise.findFirst({
                    where: { name: { contains: point.enterpriseName, mode: 'insensitive' } },
                });
                enterpriseId = enterprise?.id ?? null;
            }

            // 构建价格数据（增强版：包含采集点和行政区划关联）
            const priceData = {
                // 价格分类
                sourceType: (point.sourceType || 'REGIONAL') as any,
                subType: (point.subType || 'LISTED') as any,
                geoLevel: (point.geoLevel || 'CITY') as any,

                // 位置信息
                location: point.location,
                province: point.province || null,
                city: point.city || null,
                region: aiAnalysis.reportMeta?.region ? [aiAnalysis.reportMeta.region] : [],
                // 优先使用采集点继承的坐标
                longitude: point.longitude || null,
                latitude: point.latitude || null,

                // 企业关联
                enterpriseId,
                enterpriseName: point.enterpriseName || null,

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

            // 使用 upsert 避免重复数据（基于唯一约束）
            await this.prisma.priceData.upsert({
                where: {
                    effectiveDate_commodity_location_sourceType_subType: {
                        effectiveDate: priceData.effectiveDate,
                        commodity: priceData.commodity,
                        location: priceData.location,
                        sourceType: priceData.sourceType,
                        subType: priceData.subType,
                    },
                },
                update: {
                    price: priceData.price,
                    dayChange: priceData.dayChange,
                    intelId: priceData.intelId,
                    enterpriseId: priceData.enterpriseId,
                    // 更新关联信息
                    collectionPointId: priceData.collectionPointId,
                    regionCode: priceData.regionCode,
                    longitude: priceData.longitude,
                    latitude: priceData.latitude,
                    note: priceData.note,
                },
                create: priceData,
            });
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
            // 简单的类型映射逻辑，未来可由 AI 返回 eventTypeCode
            const eventTypeId = defaultEventType.id;

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
            const forecastType = await this.prisma.insightTypeConfig.findUnique({ where: { code: 'FORECAST' } });

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
                    }
                });
            }
        }
    }

    /**
     * 查询情报列表 (分页)
     */
    async findAll(query: MarketIntelQuery) {
        const { page, pageSize, category, sourceType, startDate, endDate, location, isFlagged, authorId, keyword } = query;
        // Query param conversion if coming from simple query object, though DTO usually handles it.
        // Assuming dto allows optional params.

        const where: any = {};
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
     * 获取排行榜
     */
    async getLeaderboard(limit = 10) {
        const stats = await this.prisma.userIntelStats.findMany({
            take: limit,
            orderBy: { monthlyPoints: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true,
                        position: true,
                        organization: { select: { name: true } },
                    },
                },
            },
        });

        return stats.map((stat, index) => ({
            rank: index + 1,
            userId: stat.userId,
            name: stat.user.name,
            avatar: stat.user.avatar,
            role: stat.user.position,
            region: stat.user.organization?.name || null,
            creditCoefficient: stat.creditCoefficient,
            monthlyPoints: stat.monthlyPoints,
            submissionCount: stat.submissionCount,
            accuracyRate: stat.accuracyRate,
            highValueCount: stat.highValueCount,
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
        enterpriseId?: string;
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
            enterpriseId,
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

        const where: any = {};
        if (eventTypeId) where.eventTypeId = eventTypeId;
        if (enterpriseId) where.enterpriseId = enterpriseId;
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
                    enterprise: {
                        select: { id: true, name: true, shortName: true },
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
                enterprise: true,
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
        const where: any = {};

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

        events.forEach(event => {
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
        const where: any = {};

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
            regionStats
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
                orderBy: { _count: { commodity: 'desc' } }
            }),
            this.prisma.marketEvent.groupBy({
                by: ['regionCode'],
                where: { ...where, regionCode: { not: null } },
                _count: { regionCode: true },
                take: 10,
                orderBy: { _count: { regionCode: 'desc' } }
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
            commodityBreakdown: commodityStats.map(stat => ({
                commodity: stat.commodity!,
                count: stat._count.commodity
            })),
            regionBreakdown: regionStats.map(stat => ({
                region: stat.regionCode!,
                count: stat._count.regionCode
            }))
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

        const where: any = {};
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

        const [
            total,
            todayCount,
            weekCount,
            typeStats,
            directionStats,
            timeframeStats,
        ] = await Promise.all([
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
            if (insight.commodity) topicCounts[insight.commodity] = (topicCounts[insight.commodity] || 0) + 1;
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

        return Object.entries(topicCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([topic, count]) => ({ topic, count }));
    }

    /**
     * 综合情报流数据（事件 + 洞察 + 情报混合）
     */
    async getIntelligenceFeed(query: {
        startDate?: Date;
        endDate?: Date;
        eventTypeIds?: string[];
        insightTypeIds?: string[];
        sentiments?: string[];
        commodities?: string[];
        keyword?: string;
        limit?: number;
    }) {
        const {
            startDate,
            endDate,
            eventTypeIds,
            insightTypeIds,
            sentiments,
            commodities,
            keyword,
            limit = 50,
        } = query;

        // 构建查询条件
        const eventWhere: any = {};
        const insightWhere: any = {};

        if (startDate || endDate) {
            eventWhere.createdAt = {};
            insightWhere.createdAt = {};
            if (startDate) {
                eventWhere.createdAt.gte = startDate;
                insightWhere.createdAt.gte = startDate;
            }
            if (endDate) {
                eventWhere.createdAt.lte = endDate;
                insightWhere.createdAt.lte = endDate;
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
        }
        if (keyword) {
            eventWhere.OR = [
                { subject: { contains: keyword, mode: 'insensitive' } },
                { content: { contains: keyword, mode: 'insensitive' } },
            ];
            insightWhere.OR = [
                { title: { contains: keyword, mode: 'insensitive' } },
                { content: { contains: keyword, mode: 'insensitive' } },
            ];
        }

        // 并行查询事件和洞察
        const [events, insights] = await Promise.all([
            this.prisma.marketEvent.findMany({
                where: eventWhere,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    eventType: {
                        select: { id: true, code: true, name: true, icon: true, color: true },
                    },
                    enterprise: {
                        select: { id: true, name: true, shortName: true },
                    },
                    intel: {
                        select: { id: true, location: true, effectiveTime: true },
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
                        select: { id: true, location: true, effectiveTime: true },
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
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return feedItems.slice(0, limit);
    }
}
