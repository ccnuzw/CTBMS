import { Injectable , Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { AIService } from '../ai/ai.service';
import { AIModelService } from '../ai/ai-model.service';
import { IntelCategory } from '@prisma/client';
import { ContentType as TypesContentType } from '@packages/types';
import {
    resolveIntelSourceTypes,
    resolveContentTypes,
    normalizeHotTopic,
} from './market-intel.utils';

export type IntelligenceFeedQuery = {
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

@Injectable()
export class IntelAnalysisService {
  private readonly logger = new Logger(IntelAnalysisService.name);
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
        private readonly aiModelService: AIModelService,
    ) { }

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

    async testAI() {
        return this.aiModelService.testConnection();
    }

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

        const events = await this.prisma.marketEvent.findMany({
            where,
            select: {
                eventDate: true,
                sentiment: true,
                createdAt: true,
            },
            orderBy: { eventDate: 'asc' },
        });

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

    async resolveHotTopicDisplayMap(rawTopics: string[]) {
        const normalizedTopics = Array.from(
            new Set(rawTopics.map((topic) => normalizeHotTopic(topic)).filter(Boolean)),
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

    async getHotTopics(limit = 20) {
        const recentEvents = await this.prisma.marketEvent.findMany({
            take: 200,
            orderBy: { createdAt: 'desc' },
            select: { subject: true, action: true, commodity: true },
        });

        const recentInsights = await this.prisma.marketInsight.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            select: { factors: true, commodity: true },
        });

        const recentIntels = await this.prisma.marketIntel.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            select: { aiAnalysis: true },
        });

        const topicCounts: Record<string, number> = {};

        recentEvents.forEach((event) => {
            if (event.subject) topicCounts[event.subject] = (topicCounts[event.subject] || 0) + 1;
            if (event.commodity) topicCounts[event.commodity] = (topicCounts[event.commodity] || 0) + 1;
        });

        recentInsights.forEach((insight) => {
            if (insight.commodity)
                topicCounts[insight.commodity] = (topicCounts[insight.commodity] || 0) + 1;
            insight.factors.forEach((factor) => {
                topicCounts[factor] = (topicCounts[factor] || 0) + 1;
            });
        });

        recentIntels.forEach((intel) => {
            const analysis = intel.aiAnalysis as { tags?: string[]; entities?: string[]; commodities?: string[]; summary?: string; sentiment?: string; [key: string]: unknown } | null;
            if (analysis?.tags) {
                analysis.tags.forEach((tag: string) => {
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
            const normalizedTopic = normalizeHotTopic(topic);
            return {
                topic,
                displayTopic: topicDisplayMap[normalizedTopic] || topic,
                count,
            };
        });
    }

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

        const intelWhere: Prisma.MarketIntelWhereInput = {};

        const resolvedSourceTypes = resolveIntelSourceTypes(sourceTypes);
        if (resolvedSourceTypes.length > 0) {
            intelWhere.sourceType = { in: resolvedSourceTypes };
        }
        if (regionCodes && regionCodes.length > 0) {
            intelWhere.region = { hasSome: regionCodes };
        }
        const resolvedContentTypes = resolveContentTypes(contentTypes);
        if (resolvedContentTypes.length > 0) {
            intelWhere.contentType = { in: resolvedContentTypes };
        }

        if (minScore !== undefined || maxScore !== undefined) {
            intelWhere.totalScore = {};
            if (minScore !== undefined) intelWhere.totalScore.gte = minScore;
            if (maxScore !== undefined) intelWhere.totalScore.lte = maxScore;
        }

        const intelAndConditions: Prisma.MarketIntelWhereInput[] = [];

        if (processingStatus && processingStatus.length > 0) {
            const statusOR: Prisma.MarketIntelWhereInput[] = [];
            if (processingStatus.includes('flagged')) statusOR.push({ isFlagged: true });
            if (processingStatus.includes('confirmed')) statusOR.push({ isFlagged: false });
            if (processingStatus.includes('pending')) statusOR.push({ isFlagged: false });

            if (statusOR.length > 0) {
                intelAndConditions.push({ OR: statusOR });
            }
        }

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
            ];
            reportWhere.OR = [
                { title: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
            ];
        }

        if (Object.keys(intelWhere).length > 0) {
            eventWhere.intel = intelWhere;
            insightWhere.intel = intelWhere;
            reportWhere.intel = intelWhere;
        }

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
                                    organization: { select: { name: true } },
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
                                    organization: { select: { name: true } },
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
                                    organization: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

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

    async getDashboardStats(query: IntelligenceFeedQuery) {
        const { startDate, endDate } = query;

        const intelWhere: Prisma.MarketIntelWhereInput = {};
        const dashboardSourceTypes = resolveIntelSourceTypes(query.sourceTypes);
        const dashboardContentTypes = resolveContentTypes(query.contentTypes);

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
                    by: ['eventDate'],
                    where: eventWhere,
                    _count: { id: true },
                }),
                this.prisma.marketInsight.groupBy({
                    by: ['createdAt'],
                    where: insightWhere,
                    _count: { id: true },
                }),
                this.prisma.marketEvent.groupBy({
                    by: ['regionCode'],
                    where: eventWhere,
                    _count: { regionCode: true },
                }),
            ]);

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
            .map(([name, count]) => ({ name, count, change: 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const trendMap = new Map<
            string,
            { date: string; daily: number; research: number; policy: number }
        >();
        const formatDate = (d: Date | string | null) =>
            d ? new Date(d).toISOString().split('T')[0] : '';

        eventTrend.forEach((e) => {
            const d = formatDate(e.eventDate as Date | string | null);
            if (!d) return;
            const item = trendMap.get(d) || { date: d, daily: 0, research: 0, policy: 0 };
            item.daily += e._count.id;
            trendMap.set(d, item);
        });
        insightTrend.forEach((i) => {
            const d = formatDate(i.createdAt as Date | string | null);
            if (!d) return;
            const item = trendMap.get(d) || { date: d, daily: 0, research: 0, policy: 0 };
            item.research += i._count.id;
            trendMap.set(d, item);
        });

        const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        const regionHeat = eventRegions
            .filter((r) => r.regionCode)
            .map((r) => ({ region: r.regionCode as string, count: r._count.regionCode }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const sourceDistribution = sourceStats.map((s) => ({
            name: s.sourceType,
            value: s._count.sourceType,
        }));

        return {
            overview: {
                total: totalCount,
                today: todayCount,
                highValue: 0,
                pending: 0,
                confirmed: totalCount,
                avgQuality: Math.round(avgScore._avg.totalScore || 0),
            },
            trend,
            sourceDistribution,
            commodityHeat,
            regionHeat,
        };
    }

    async generateSmartBriefing(query: IntelligenceFeedQuery) {
        const items = await this.getIntelligenceFeed({ ...query, limit: 20 });
        if (items.length === 0) {
            return { summary: '当前筛选条件下暂无情报数据。' };
        }

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

        try {
            const summary = await this.aiService.generateBriefing(lines);
            return { summary };
        } catch (e) {
            this.logger.error('Smart Briefing Error:', e);
            return { summary: '生成简报失败，请确保 AI 服务已连接。' };
        }
    }

    async generateInsight(content: string): Promise<string> {
        return this.aiService.generateBriefing(content, 'MARKET_INTEL_UNIVERSAL_INSIGHT');
    }
}
