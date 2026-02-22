import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CollectionPointForRecognition } from '@packages/types';
import { PrismaService } from '../../prisma/prisma.service';
import { TraceLogger } from './ai-shared.types';
import { ConfigService } from '../config/config.service';

type EventTypeSnapshot = {
    code: string;
    name: string;
    description: string | null;
};

@Injectable()
export class AIEntityExtractorService implements OnModuleInit {
    private readonly logger = new Logger(AIEntityExtractorService.name);
    private collectionPointCache: CollectionPointForRecognition[] = [];
    private eventTypeCache: EventTypeSnapshot[] = [];
    private cacheLastUpdated: Date | null = null;
    public readonly CACHE_TTL_MS = 5 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {}

    async onModuleInit() {
        await this.refreshCollectionPointCache();
        await this.refreshEventTypeCache();
    }

    public getEventTypeCache() {
        return this.eventTypeCache;
    }



    /**
     * 刷新采集点缓存
     */
    async refreshCollectionPointCache() {
        try {
            const points = await this.prisma.collectionPoint.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    code: true,
                    name: true,
                    shortName: true,
                    aliases: true,
                    type: true,
                    regionCode: true,
                    longitude: true,
                    latitude: true,
                    defaultSubType: true,
                    enterpriseId: true,
                    priority: true,
                },
                orderBy: { priority: 'desc' },
            });
            this.collectionPointCache = points.map((point) => ({
                ...point,
                type: point.type as CollectionPointForRecognition['type'],
            }));
            this.cacheLastUpdated = new Date();
            this.logger.log(`采集点缓存已刷新，共 ${this.collectionPointCache.length} 条数据`);
        } catch (error) {
            this.logger.warn('加载采集点缓存失败');
        }
    }



    /**
     * 刷新事件类型缓存
     */
    async refreshEventTypeCache() {
        try {
            this.eventTypeCache = await this.prisma.eventTypeConfig.findMany({
                where: { isActive: true },
                select: { code: true, name: true, description: true },
            });
            this.logger.log(`事件类型缓存已刷新，共 ${this.eventTypeCache.length} 条数据`);
        } catch (error) {
            this.logger.warn('加载事件类型缓存失败');
        }
    }



    /**
     * 检查缓存是否过期并刷新
     */
    async ensureCache() {
        // 如果从未加载过，或者已过期
        if (!this.cacheLastUpdated || (Date.now() - this.cacheLastUpdated.getTime() > this.CACHE_TTL_MS)) {
            await this.refreshCollectionPointCache();
            await this.refreshEventTypeCache();
        }
    }



    /**
     * 标准化关键词
     */
    public normalizeKeyword(text: string): string {
        if (!text) return '';
        return text
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/\s+/g, '')
            .trim();
    }



    /**
     * 获取所有采集点关键词（用于匹配）
     */
    public getKnownLocations(): string[] {
        if (this.collectionPointCache.length > 0) {
            const keywords: string[] = [];
            for (const point of this.collectionPointCache) {
                keywords.push(point.name);
                if (point.shortName) keywords.push(point.shortName);
                keywords.push(...point.aliases);
            }
            return [...new Set(keywords)]; // 去重
        }
        return [];
    }



    /**
     * 去除括号及其内容的辅助函数
     */
    public removeParentheses(text: string): string {
        return text
            .replace(/（.*?）/g, '')  // 中文括号
            .replace(/\(.*?\)/g, '')  // 英文括号
            .trim();
    }



    /**
     * 根据关键词查找采集点（增强版：最佳匹配策略）
     */
    public findCollectionPoint(keyword: string, traceLogger?: TraceLogger): CollectionPointForRecognition | null {
        const normalizedKeyword = this.normalizeKeyword(keyword);
        const candidates: { point: CollectionPointForRecognition; score: number; matchType: string; matchTerm: string }[] = [];

        // 辅助函数：计算单点匹配
        const matchPoint = (point: CollectionPointForRecognition) => {
            const terms = [point.name, point.shortName, ...point.aliases]
                .filter((t): t is string => !!t && t.trim().length > 0);

            for (const term of terms) {
                const normalizedTerm = this.normalizeKeyword(term);

                // 1. 精确匹配
                if (normalizedKeyword === normalizedTerm) {
                    candidates.push({
                        point,
                        score: 1000 + term.length,
                        matchType: 'exact',
                        matchTerm: term
                    });
                    continue;
                }

                // 2. 包含匹配
                if (normalizedTerm.length >= 2 && normalizedKeyword.includes(normalizedTerm)) {
                    candidates.push({
                        point,
                        score: 100 + term.length,
                        matchType: 'contains_term',
                        matchTerm: term
                    });
                } else if (normalizedKeyword.length >= 3 && normalizedTerm.includes(normalizedKeyword)) {
                    candidates.push({
                        point,
                        score: 80 + normalizedKeyword.length,
                        matchType: 'term_contains',
                        matchTerm: term
                    });
                }
            }
        };

        for (const point of this.collectionPointCache) {
            matchPoint(point);
        }

        // 3. 特殊策略：去括号后匹配
        if (normalizedKeyword.includes('(')) {
            const cleanKeyword = this.removeParentheses(normalizedKeyword);
            if (cleanKeyword.length > 0 && cleanKeyword !== normalizedKeyword) {
                for (const point of this.collectionPointCache) {
                    const terms = [point.name, point.shortName, ...point.aliases]
                        .filter((t): t is string => !!t && t.trim().length > 0);

                    for (const term of terms) {
                        const normalizedTerm = this.normalizeKeyword(term);
                        if (cleanKeyword === normalizedTerm) {
                            candidates.push({
                                point,
                                score: 800 + term.length,
                                matchType: 'exact_no_parentheses',
                                matchTerm: term
                            });
                        }
                    }
                }
            }
        }

        // 选取最高分结果
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score || b.matchTerm.length - a.matchTerm.length);
            const best = candidates[0];

            traceLogger?.log('EntityLink', `实体匹配成功: "${keyword}" -> "${best.point.name}"`, {
                score: best.score,
                matchType: best.matchType,
                candidatesCount: candidates.length
            });

            return best.point;
        }

        traceLogger?.log('EntityLink', `实体匹配失败: "${keyword}"`, { reason: 'No candidates found above threshold' }, 'warn');
        return null;
    }



    /**
     * 映射价格主体类型
     */
    /**
     * 映射价格主体类型 (Config Driven)
     */
    public normalizeSentiment(value: string): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
        if (!value) return 'neutral';
        const v = value.toLowerCase();
        if (v === 'positive' || v === 'bullish') return 'bullish';
        if (v === 'negative' || v === 'bearish') return 'bearish';
        if (v === 'mixed') return 'mixed';
        return 'neutral';
    }



    /**
     * 映射价格主体类型 (Config Driven)
     */
    public mapSourceType(type: string | undefined, location: string): 'ENTERPRISE' | 'REGIONAL' | 'PORT' {
        const validTypes = ['ENTERPRISE', 'PORT', 'REGIONAL'] as const;
        type SourceTypeValue = typeof validTypes[number];
        if (type) {
            const upper = type.toUpperCase() as SourceTypeValue;
            if (validTypes.includes(upper)) return upper;
        }

        // Use ConfigService for logic
        const matched = this.configService.evaluateMappingRule('PRICE_SOURCE_TYPE', location);
        const normalized = matched.toUpperCase() as SourceTypeValue;
        if (validTypes.includes(normalized)) return normalized;

        return 'REGIONAL'; // Default fallback
    }



    /**
     * 映射价格子类型
     */
    /**
     * 映射价格子类型 (Config Driven)
     */
    public mapSubType(
        type: string | undefined,
        note: string | undefined,
    ): 'LISTED' | 'TRANSACTION' | 'ARRIVAL' | 'FOB' | 'STATION_ORIGIN' | 'STATION_DEST' | 'PURCHASE' | 'WHOLESALE' | 'OTHER' {
        const validTypes = ['LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER'] as const;
        type SubTypeValue = typeof validTypes[number];
        if (type) {
            const upper = type.toUpperCase() as SubTypeValue;
            if (validTypes.includes(upper)) return upper;
        }

        const context = (note || '').toLowerCase();
        // Use ConfigService
        const matched = this.configService.evaluateMappingRule('PRICE_SUB_TYPE', context, 'LISTED');
        // Validate if result is a valid type, else return LISTED
        const normalized = matched.toUpperCase() as SubTypeValue;
        if (validTypes.includes(normalized)) return normalized;

        return 'LISTED';
    }



    /**
     * 映射地理层级
     */
    /**
     * 映射地理层级 (Config Driven)
     */
    public mapGeoLevel(
        level: string | undefined,
        location: string,
    ): 'COUNTRY' | 'REGION' | 'PROVINCE' | 'CITY' | 'DISTRICT' | 'PORT' | 'STATION' | 'ENTERPRISE' {
        const validLevels = ['COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE'] as const;
        type GeoLevelValue = typeof validLevels[number];
        if (level) {
            const upper = level.toUpperCase() as GeoLevelValue;
            if (validLevels.includes(upper)) return upper;
        }

        const matched = this.configService.evaluateMappingRule('GEO_LEVEL', location, 'CITY');
        const normalized = matched.toUpperCase() as GeoLevelValue;
        if (validLevels.includes(normalized)) return normalized;

        return 'CITY'; // Default
    }



    public mapSentiment(sentiment: string | undefined): 'neutral' | 'positive' | 'negative' {
        if (!sentiment) return 'neutral';
        const matched = this.configService.evaluateMappingRule('SENTIMENT', sentiment.toLowerCase(), 'neutral');
        return matched as 'neutral' | 'positive' | 'negative';
    }


}
