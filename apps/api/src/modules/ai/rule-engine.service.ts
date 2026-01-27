import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 规则条件结构
 */
interface RuleCondition {
    id: string;
    leftType: 'KEYWORD' | 'COLLECTION_POINT' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    leftValue?: string[];
    connector: 'FOLLOWED_BY' | 'FOLLOWED_CONTAINS' | 'PRECEDED_BY' | 'SAME_SENTENCE' | 'SAME_PARAGRAPH';
    rightType: 'KEYWORD' | 'COLLECTION_POINT' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    rightValue?: string[];
    extractFields?: {
        subject?: 'LEFT' | 'RIGHT';
        action?: 'LEFT' | 'RIGHT';
        value?: 'LEFT' | 'RIGHT';
    };
}

/**
 * 提取规则结构
 */
interface ExtractionRule {
    id: string;
    name: string;
    targetType: string;
    eventTypeId?: string;
    insightTypeId?: string;
    conditions: RuleCondition[];
    outputConfig: any;
    priority: number;
}

/**
 * 匹配结果
 */
export interface RuleMatchResult {
    ruleId: string;
    ruleName: string;
    targetType: 'EVENT' | 'INSIGHT';
    typeId: string;
    sourceText: string;
    sourceStart: number;
    sourceEnd: number;
    extractedData: {
        subject?: string;
        action?: string;
        value?: string;
    };
    outputConfig: any;
}

/**
 * 规则引擎服务
 * 从数据库加载提取规则，应用到文本分析
 */
@Injectable()
export class RuleEngineService implements OnModuleInit {
    private readonly logger = new Logger(RuleEngineService.name);

    // 规则缓存
    private ruleCache: ExtractionRule[] = [];
    private cacheLastUpdated: Date | null = null;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

    // 采集点名称缓存（用于 COLLECTION_POINT 类型匹配）
    private collectionPointNames: string[] = [];

    // 区域名称缓存
    private regionNames: string[] = [];

    // 品种名称
    private readonly COMMODITIES = ['玉米', '大豆', '小麦', '稻谷', '高粱', '豆粕', '菜粕', '棉花'];

    constructor(private readonly prisma: PrismaService) { }

    async onModuleInit() {
        await this.refreshCache();
    }

    /**
     * 刷新规则缓存
     */
    async refreshCache() {
        try {
            // 加载规则
            const rules = await this.prisma.extractionRule.findMany({
                where: { isActive: true },
                orderBy: { priority: 'desc' },
                include: {
                    eventType: true,
                    insightType: true,
                },
            });

            this.ruleCache = rules.map((r) => ({
                id: r.id,
                name: r.name,
                targetType: r.targetType,
                eventTypeId: r.eventTypeId || undefined,
                insightTypeId: r.insightTypeId || undefined,
                conditions: r.conditions as unknown as RuleCondition[],
                outputConfig: r.outputConfig || {},
                priority: r.priority,
            }));

            // 加载采集点名称
            const collectionPoints = await this.prisma.collectionPoint.findMany({
                where: { isActive: true },
                select: { name: true, shortName: true, aliases: true },
            });
            this.collectionPointNames = collectionPoints.flatMap((cp) => [
                cp.name,
                cp.shortName,
                ...cp.aliases,
            ].filter(Boolean) as string[]);

            // 加载区域名称
            const regions = await this.prisma.administrativeRegion.findMany({
                where: { isActive: true },
                select: { name: true, shortName: true },
            });
            this.regionNames = regions.flatMap((r) => [r.name, r.shortName].filter(Boolean) as string[]);

            this.cacheLastUpdated = new Date();
            this.logger.log(`规则引擎缓存已刷新: ${this.ruleCache.length} 条规则, ${this.collectionPointNames.length} 个采集点名称`);
        } catch (error) {
            this.logger.warn('刷新规则缓存失败');
        }
    }

    /**
     * 检查缓存是否需要刷新
     */
    private isCacheExpired(): boolean {
        if (!this.cacheLastUpdated) return true;
        return Date.now() - this.cacheLastUpdated.getTime() > this.CACHE_TTL_MS;
    }

    /**
     * 确保缓存有效
     */
    async ensureCache() {
        if (this.isCacheExpired()) {
            await this.refreshCache();
        }
    }

    /**
     * 对文本应用所有规则，返回匹配结果
     */
    async applyRules(text: string): Promise<RuleMatchResult[]> {
        await this.ensureCache();
        this.logger.log(`[RuleEngine] Starting rule application on text length: ${text.length}`);

        const results: RuleMatchResult[] = [];

        for (const rule of this.ruleCache) {
            const matches = this.applyRule(rule, text);
            results.push(...matches);
        }

        // 按位置排序
        results.sort((a, b) => a.sourceStart - b.sourceStart);

        return results;
    }

    /**
     * 应用单条规则
     */
    private applyRule(rule: ExtractionRule, text: string): RuleMatchResult[] {
        const results: RuleMatchResult[] = [];

        if (!rule.conditions || rule.conditions.length === 0) {
            return results;
        }

        // 目前只支持单条件规则的简化实现
        const condition = rule.conditions[0];
        const matches = this.matchCondition(condition, text);

        for (const match of matches) {
            this.logger.log(`[RuleEngine] Rule Matched: ${rule.name} (Type: ${rule.targetType}) -> ${match.matchedText}`);
            results.push({
                ruleId: rule.id,
                ruleName: rule.name,
                targetType: rule.targetType as 'EVENT' | 'INSIGHT',
                typeId: rule.eventTypeId || rule.insightTypeId || '',
                sourceText: match.matchedText,
                sourceStart: match.start,
                sourceEnd: match.end,
                extractedData: match.extractedData,
                outputConfig: rule.outputConfig,
            });
        }

        return results;
    }

    /**
     * 匹配单个条件
     */
    private matchCondition(
        condition: RuleCondition,
        text: string,
    ): Array<{
        matchedText: string;
        start: number;
        end: number;
        extractedData: { subject?: string; action?: string; value?: string };
    }> {
        const matches: Array<{
            matchedText: string;
            start: number;
            end: number;
            extractedData: { subject?: string; action?: string; value?: string };
        }> = [];

        // 获取左侧匹配候选词
        const leftCandidates = this.getCandidates(condition.leftType, condition.leftValue);
        // 获取右侧匹配候选词
        const rightCandidates = this.getCandidates(condition.rightType, condition.rightValue);

        if (leftCandidates.length === 0 || rightCandidates.length === 0) {
            return matches;
        }

        // 遍历文本查找匹配
        for (const leftWord of leftCandidates) {
            let searchStart = 0;
            let leftIndex: number;

            while ((leftIndex = text.indexOf(leftWord, searchStart)) !== -1) {
                searchStart = leftIndex + 1;

                // 根据连接词类型确定搜索范围
                const searchRange = this.getSearchRange(condition.connector, text, leftIndex, leftWord.length);

                if (!searchRange) continue;

                // 在范围内查找右侧词
                for (const rightWord of rightCandidates) {
                    const rightIndex = text.indexOf(rightWord, searchRange.start);

                    if (rightIndex !== -1 && rightIndex < searchRange.end) {
                        // 找到匹配
                        const matchStart = leftIndex;
                        const matchEnd = rightIndex + rightWord.length;
                        const matchedText = text.substring(matchStart, matchEnd);

                        // 提取数据
                        const extractedData: { subject?: string; action?: string; value?: string } = {};
                        if (condition.extractFields) {
                            if (condition.extractFields.subject === 'LEFT') extractedData.subject = leftWord;
                            if (condition.extractFields.subject === 'RIGHT') extractedData.subject = rightWord;
                            if (condition.extractFields.action === 'LEFT') extractedData.action = leftWord;
                            if (condition.extractFields.action === 'RIGHT') extractedData.action = rightWord;
                            if (condition.extractFields.value === 'LEFT') extractedData.value = leftWord;
                            if (condition.extractFields.value === 'RIGHT') extractedData.value = rightWord;
                        }

                        matches.push({
                            matchedText,
                            start: matchStart,
                            end: matchEnd,
                            extractedData,
                        });

                        break; // 找到一个匹配后跳出内层循环
                    }
                }
            }
        }

        return matches;
    }

    /**
     * 根据条件类型获取候选词列表
     */
    private getCandidates(type: string, values?: string[]): string[] {
        switch (type) {
            case 'KEYWORD':
                return values || [];
            case 'COLLECTION_POINT':
                return this.collectionPointNames;
            case 'REGION':
                return this.regionNames;
            case 'COMMODITY':
                return this.COMMODITIES;
            case 'NUMBER':
                // 数字匹配返回特殊标记，实际匹配时用正则
                return ['__NUMBER__'];
            case 'DATE':
                return ['__DATE__'];
            default:
                return values || [];
        }
    }

    /**
     * 根据连接词确定搜索范围
     */
    private getSearchRange(
        connector: string,
        text: string,
        leftIndex: number,
        leftLength: number,
    ): { start: number; end: number } | null {
        const afterLeft = leftIndex + leftLength;

        switch (connector) {
            case 'FOLLOWED_BY':
                // 紧跟在后面（50字符内）
                return { start: afterLeft, end: Math.min(afterLeft + 50, text.length) };

            case 'FOLLOWED_CONTAINS':
                // 后面包含（100字符内）
                return { start: afterLeft, end: Math.min(afterLeft + 100, text.length) };

            case 'PRECEDED_BY':
                // 前面包含（100字符内）
                return { start: Math.max(0, leftIndex - 100), end: leftIndex };

            case 'SAME_SENTENCE':
                // 同一句子内
                const sentenceStart = this.findSentenceStart(text, leftIndex);
                const sentenceEnd = this.findSentenceEnd(text, leftIndex);
                return { start: sentenceStart, end: sentenceEnd };

            case 'SAME_PARAGRAPH':
                // 同一段落内
                const paraStart = text.lastIndexOf('\n', leftIndex) + 1;
                let paraEnd = text.indexOf('\n', leftIndex);
                if (paraEnd === -1) paraEnd = text.length;
                return { start: paraStart, end: paraEnd };

            default:
                return { start: afterLeft, end: Math.min(afterLeft + 100, text.length) };
        }
    }

    /**
     * 查找句子开始位置
     */
    private findSentenceStart(text: string, pos: number): number {
        const sentenceEnders = ['。', '！', '？', '.', '!', '?', '\n'];
        for (let i = pos - 1; i >= 0; i--) {
            if (sentenceEnders.includes(text[i])) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * 查找句子结束位置
     */
    private findSentenceEnd(text: string, pos: number): number {
        const sentenceEnders = ['。', '！', '？', '.', '!', '?', '\n'];
        for (let i = pos; i < text.length; i++) {
            if (sentenceEnders.includes(text[i])) {
                return i + 1;
            }
        }
        return text.length;
    }

    /**
     * 测试条件匹配（供前端测试使用）
     */
    async testConditions(
        conditions: RuleCondition[],
        text: string,
    ): Promise<Array<{ sourceText: string; extractedData: any }>> {
        await this.ensureCache();

        const results: Array<{ sourceText: string; extractedData: any }> = [];

        for (const condition of conditions) {
            const matches = this.matchCondition(condition, text);
            results.push(
                ...matches.map((m) => ({
                    sourceText: m.matchedText,
                    extractedData: m.extractedData,
                })),
            );
        }

        return results;
    }
}
