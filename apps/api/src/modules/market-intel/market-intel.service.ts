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

        // 更新情报员统计
        await this.updateAuthorStats(authorId);

        return intel;
    }

    /**
     * 批量创建价格数据（从日报解析结果）
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
            // 尝试匹配系统中的企业
            let enterpriseId: string | null = null;
            if (point.sourceType === 'ENTERPRISE' && point.enterpriseName) {
                const enterprise = await this.prisma.enterprise.findFirst({
                    where: { name: { contains: point.enterpriseName, mode: 'insensitive' } },
                });
                enterpriseId = enterprise?.id ?? null;
            }

            // 构建价格数据
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
                longitude: point.longitude || null,
                latitude: point.latitude || null,

                // 企业关联
                enterpriseId,
                enterpriseName: point.enterpriseName || null,

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

            // 使用 upsert 避免重复数据（基于新的唯一约束）
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
                    note: priceData.note,
                },
                create: priceData,
            });
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
}
