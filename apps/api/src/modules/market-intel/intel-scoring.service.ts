import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AIAnalysisResult } from '@packages/types';

@Injectable()
export class IntelScoringService {
    constructor(private prisma: PrismaService) { }

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
            case 'week': { // 获取本周一
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
        const groups = await this.prisma.marketIntel.groupBy({
            by: ['authorId'],
            where: {
                createdAt: { gte: startDate },
                authorId: { not: '' },
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
        const authorIds = groups.map((g) => g.authorId).filter((id): id is string => !!id);
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
            const score = g._sum?.totalScore || 0;
            const submissionCount = g._count.id || 0;
            const avgScore = Math.round(g._avg?.totalScore || 0);

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
    async updateAuthorStats(userId: string) {
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
