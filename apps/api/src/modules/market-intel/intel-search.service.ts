import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { IntelCategory, Prisma } from '@prisma/client';
import { ContentType as TypesContentType } from '@packages/types';
import { IntelAnalysisService } from './intel-analysis.service';

@Injectable()
export class IntelSearchService {
    constructor(
        private prisma: PrismaService,
        private analysisService: IntelAnalysisService,
    ) { }

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
            throw new Error('Intel not found');
        }

        const baseTime = baseIntel.effectiveTime || baseIntel.createdAt;
        const startTime = new Date(baseTime.getTime() - 30 * 24 * 60 * 60 * 1000);
        const endTime = new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000);

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

        const [relatedIntels, relatedPrices] = await Promise.all([
            this.prisma.marketIntel.findMany({
                where: {
                    id: { not: intelId },
                    OR: orConditions,
                },
                take: Math.max(limit * 3, 12),
                orderBy: { effectiveTime: 'desc' },
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
            this.prisma.priceData.findMany({
                where: {
                    effectiveDate: { gte: startTime, lte: endTime },
                    commodity: baseCommodities.size > 0 ? { in: Array.from(baseCommodities) } : undefined,
                    OR: [
                        { dayChange: { gte: 20 } },
                        { dayChange: { lte: -20 } },
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

        const priceCommodityDisplayMap = await this.analysisService.resolveHotTopicDisplayMap(
            relatedPrices
                .map((item) => item.commodity)
                .filter((commodity): commodity is string => Boolean(commodity)),
        );

        const priceItems = relatedPrices.map((p) => ({
            id: p.id,
            title: `${p.location} ${priceCommodityDisplayMap[p.commodity!] || p.commodity} ${p.price} (${p.dayChange && p.dayChange.toNumber() > 0 ? '+' : ''}${p.dayChange})`,
            contentType: 'PRICE_DATA',
            relationType: 'PRICE_FLUCTUATION',
            similarity: 90,
            createdAt: p.effectiveDate,
            raw: p,
        }));

        return [...related, ...priceItems]
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
            .slice(0, limit);
    }

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

        const [priceResult, intelResult, docResult] = await Promise.all([
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

        const prices = priceResult.map((p) => Number(p.price));
        const priceRange = {
            min: prices.length > 0 ? Math.min(...prices) : null,
            max: prices.length > 0 ? Math.max(...prices) : null,
            avg: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
        };

        const combinedIntels = [...intelResult, ...docResult];
        const allTags: string[] = [];
        const allEntities: string[] = [];
        let positiveCount = 0;
        let negativeCount = 0;

        combinedIntels.forEach((intel) => {
            const analysis = intel.aiAnalysis as { tags?: string[]; entities?: string[]; commodities?: string[]; summary?: string; sentiment?: string; [key: string]: unknown } | null;
            if (analysis?.tags) allTags.push(...analysis.tags);
            if (analysis?.entities) allEntities.push(...analysis.entities);
            if (analysis?.sentiment === 'positive') positiveCount++;
            if (analysis?.sentiment === 'negative') negativeCount++;
        });

        const tagCounts = allTags.reduce<Record<string, number>>((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
        }, {});
        const topTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag]) => tag);

        const entityCounts = allEntities.reduce<Record<string, number>>((acc, entity) => {
            acc[entity] = (acc[entity] || 0) + 1;
            return acc;
        }, {});
        const entityMentions = Object.entries(entityCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([entity]) => entity);

        let sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
        if (positiveCount > 0 && negativeCount > 0) {
            sentiment = 'mixed';
        } else if (positiveCount > negativeCount) {
            sentiment = 'positive';
        } else if (negativeCount > positiveCount) {
            sentiment = 'negative';
        }

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

    async getSearchSuggestions(prefix: string, limit = 10) {
        if (!prefix || prefix.length < 1) {
            return { suggestions: [] };
        }

        const prefixLower = prefix.toLowerCase();

        const [collectionPoints, commodities, recentTags] = await Promise.all([
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
            this.prisma.priceData.findMany({
                where: {
                    commodity: { contains: prefix, mode: 'insensitive' },
                },
                distinct: ['commodity'],
                take: 5,
                select: { commodity: true },
            }),
            this.prisma.marketIntel.findMany({
                where: {
                    aiAnalysis: { not: Prisma.DbNull },
                    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
                take: 100,
                select: { aiAnalysis: true },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const tagCounts = new Map<string, number>();
        recentTags.forEach((intel) => {
            const analysis = intel.aiAnalysis as { tags?: string[]; entities?: string[]; commodities?: string[]; summary?: string; sentiment?: string; [key: string]: unknown } | null;
            if (analysis?.tags) {
                analysis.tags.forEach((tag: string) => {
                    if (tag.toLowerCase().includes(prefixLower)) {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    }
                });
            }
        });

        const suggestions: {
            text: string;
            type: 'collection_point' | 'commodity' | 'tag';
            count?: number;
        }[] = [];

        collectionPoints.forEach((cp) => {
            const displayName = cp.shortName || cp.name;
            if (!suggestions.some((s) => s.text === displayName)) {
                suggestions.push({ text: displayName, type: 'collection_point' });
            }
        });

        commodities.forEach((c) => {
            if (!suggestions.some((s) => s.text === c.commodity)) {
                suggestions.push({ text: c.commodity!, type: 'commodity' });
            }
        });

        const sortedTags = Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        sortedTags.forEach(([tag, count]) => {
            if (!suggestions.some((s) => s.text === tag)) {
                suggestions.push({ text: tag, type: 'tag', count });
            }
        });

        const priorityOrder = { collection_point: 0, commodity: 1, tag: 2 };
        suggestions.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);

        return {
            suggestions: suggestions.slice(0, limit),
        };
    }

    async fullTextSearch(query: {
        keywords: string;
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

        const dateFilter: Prisma.MarketIntelWhereInput = {};
        if (startDate || endDate) {
            dateFilter.effectiveTime = {};
            if (startDate) dateFilter.effectiveTime.gte = startDate;
            if (endDate) dateFilter.effectiveTime.lte = endDate;
        }

        const keywordConditions = keywordList.flatMap((kw) => [
            { rawContent: { contains: kw, mode: 'insensitive' as const } },
            { summary: { contains: kw, mode: 'insensitive' as const } },
            { location: { contains: kw, mode: 'insensitive' as const } },
        ]);

        const [results, total] = await Promise.all([
            this.prisma.marketIntel.findMany({
                where: {
                    ...(category ? { category } : {}),
                    ...dateFilter,
                    OR: keywordConditions,
                },
                take: pageSize * 2,
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

        const scoredResults = results.map((item) => {
            let relevanceScore = 0;
            const summary = item.summary?.toLowerCase() || '';
            const rawContent = item.rawContent?.toLowerCase() || '';
            const location = item.location?.toLowerCase() || '';

            keywordList.forEach((kw) => {
                const kwLower = kw.toLowerCase();
                if (summary.includes(kwLower)) {
                    relevanceScore += 30;
                    const matches = (summary.match(new RegExp(kwLower, 'gi')) || []).length;
                    relevanceScore += Math.min(matches * 5, 20);
                }
                if (location.includes(kwLower)) {
                    relevanceScore += 20;
                }
                if (rawContent.includes(kwLower)) {
                    relevanceScore += 10;
                    const matches = (rawContent.match(new RegExp(kwLower, 'gi')) || []).length;
                    relevanceScore += Math.min(matches, 10);
                }
            });

            const daysSince = Math.floor(
                (Date.now() - new Date(item.effectiveTime || item.createdAt).getTime()) / (1000 * 60 * 60 * 24),
            );
            if (daysSince <= 7) relevanceScore += 10;
            else if (daysSince <= 30) relevanceScore += 5;

            relevanceScore += Math.floor((item.totalScore || 0) / 10);

            return {
                ...item,
                relevanceScore,
                matchedKeywords: keywordList.filter(
                    (kw) =>
                        summary.includes(kw.toLowerCase()) ||
                        rawContent.includes(kw.toLowerCase()) ||
                        location.includes(kw.toLowerCase()),
                ),
            };
        });

        scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

        const startIdx = (page - 1) * pageSize;
        const pagedResults = scoredResults.slice(startIdx, startIdx + pageSize);

        return {
            data: pagedResults,
            total,
            page,
            pageSize,
            keywords: keywordList,
        };
    }

    async getRelatedContent(query: {
        intelId?: string;
        tags?: string[];
        commodities?: string[];
        regionCodes?: string[];
        limit?: number;
    }) {
        const { intelId, tags = [], commodities = [], regionCodes = [], limit = 10 } = query;

        let sourceTags: string[] = [...tags];
        let sourceCommodities: string[] = [...commodities];
        let sourceRegions: string[] = [...regionCodes];

        if (intelId) {
            const sourceIntel = await this.prisma.marketIntel.findUnique({
                where: { id: intelId },
                select: { aiAnalysis: true, region: true },
            });

            if (sourceIntel) {
                const analysis = sourceIntel.aiAnalysis as { tags?: string[]; entities?: string[]; commodities?: string[]; summary?: string; sentiment?: string; [key: string]: unknown } | null;
                if (analysis?.tags) sourceTags = [...new Set([...sourceTags, ...analysis.tags])];
                if (analysis?.commodities)
                    sourceCommodities = [...new Set([...sourceCommodities, ...analysis.commodities])];
                sourceRegions = [...new Set([...sourceRegions, ...(sourceIntel.region || [])])];
            }
        }

        if (sourceTags.length === 0 && sourceCommodities.length === 0 && sourceRegions.length === 0) {
            return { relatedIntels: [], relatedKnowledge: [], relatedPrices: [] };
        }

        const [relatedIntels, relatedKnowledge, relatedPrices] = await Promise.all([
            this.prisma.marketIntel.findMany({
                where: {
                    id: { not: intelId || '' },
                    OR: [
                        ...(sourceTags.length > 0
                            ? sourceTags.map((tag) => ({
                                aiAnalysis: { path: ['tags'], array_contains: tag },
                            }))
                            : []),
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
            sourceCommodities.length > 0
                ? this.prisma.priceData.findMany({
                    where: {
                        commodity: { in: sourceCommodities },
                        effectiveDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
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

        const scoredIntels = relatedIntels.map((intel) => {
            let score = 0;
            const analysis = intel.aiAnalysis as { tags?: string[]; entities?: string[]; commodities?: string[]; summary?: string; sentiment?: string; [key: string]: unknown } | null;
            if (analysis?.tags) {
                score += analysis.tags.filter((t: string) => sourceTags.includes(t)).length * 20;
            }
            if (intel.location && sourceRegions.some((r) => intel.location!.includes(r))) {
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
