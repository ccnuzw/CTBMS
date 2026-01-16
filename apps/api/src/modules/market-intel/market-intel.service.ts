import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
    CreateMarketIntelDto,
    UpdateMarketIntelDto,
    MarketIntelQuery,
    AIAnalysisResult,
    IntelCategory,
} from '@packages/types';

@Injectable()
export class MarketIntelService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建商情情报
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

        // 更新情报员统计
        await this.updateAuthorStats(authorId);

        return intel;
    }

    /**
     * 查询情报列表 (分页)
     */
    async findAll(query: MarketIntelQuery) {
        const { page, pageSize, category, sourceType, startDate, endDate, location, isFlagged, authorId } = query;

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
