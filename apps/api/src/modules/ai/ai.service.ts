import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    AIAnalysisResult,
    IntelCategory,
    ExtractedPricePoint,
    MarketSentiment,
    Forecast,
    ReportSection,
    DailyReportMeta,
    CollectionPointForRecognition,
    CollectionPointType,
} from '@packages/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AI 分析服务
 * 封装 Gemini API 调用，提供离线演示模式
 * 支持日报解析、价格点提取、市场心态分析
 * 采集点数据从数据库动态加载
 */
@Injectable()
export class AIService implements OnModuleInit {
    private readonly logger = new Logger(AIService.name);
    private readonly apiKey: string;

    // 采集点缓存（从数据库加载）
    // 使用 any[] 避免 Prisma 枚举与 types 枚举不兼容问题
    private collectionPointCache: any[] = [];
    private cacheLastUpdated: Date | null = null;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

    // ===== 后备数据（数据库为空时使用）=====
    private readonly FALLBACK_ENTERPRISES = [
        '梅花味精', '梅花集团', '中粮生化', '益海嘉里', '象屿生化',
        '吉林燃料乙醇', '长春大成', '公主岭黄龙', '嘉吉', '国投生物',
        '中粮玉米', '诺维信', '西王', '鲁洲', '金锣',
        '北大荒粮食', '象屿物流', '中储粮', '华粮物流',
    ];

    private readonly FALLBACK_PORTS = [
        '锦州港', '鲅鱼圈', '北良港', '大连港', '营口港', '丹东港',
        '秦皇岛港', '唐山港', '天津港', '青岛港', '日照港',
    ];

    private readonly FALLBACK_REGIONS = [
        '东北', '华北', '华东', '华南', '华中', '西北', '西南',
        '吉林', '黑龙江', '辽宁', '山东', '河北', '河南', '内蒙古',
        '哈尔滨', '长春', '沈阳', '大连', '齐齐哈尔', '大庆', '佳木斯',
    ];

    // 常见品种
    private readonly KNOWN_COMMODITIES = ['玉米', '大豆', '小麦', '稻谷', '高粱', '豆粕', '菜粕'];

    constructor(private readonly prisma: PrismaService) {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        if (!this.apiKey) {
            this.logger.warn('GEMINI_API_KEY not configured. Using demo mode.');
        }
    }

    /**
     * 模块初始化时加载采集点
     */
    async onModuleInit() {
        await this.refreshCollectionPointCache();
    }

    /**
     * 刷新采集点缓存
     */
    async refreshCollectionPointCache() {
        try {
            this.collectionPointCache = await this.prisma.collectionPoint.findMany({
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
            this.cacheLastUpdated = new Date();
            this.logger.log(`采集点缓存已刷新，共 ${this.collectionPointCache.length} 条数据`);
        } catch (error) {
            this.logger.warn('加载采集点缓存失败，将使用后备数据');
        }
    }

    /**
     * 获取所有采集点关键词（用于匹配）
     */
    private getKnownLocations(): string[] {
        // 如果有缓存数据，使用缓存
        if (this.collectionPointCache.length > 0) {
            const keywords: string[] = [];
            for (const point of this.collectionPointCache) {
                keywords.push(point.name);
                if (point.shortName) keywords.push(point.shortName);
                keywords.push(...point.aliases);
            }
            return [...new Set(keywords)]; // 去重
        }
        // 否则使用后备数据
        return [...this.FALLBACK_ENTERPRISES, ...this.FALLBACK_PORTS, ...this.FALLBACK_REGIONS];
    }

    /**
     * 根据关键词查找采集点
     */
    private findCollectionPoint(keyword: string): CollectionPointForRecognition | null {
        for (const point of this.collectionPointCache) {
            if (point.name === keyword || point.shortName === keyword || point.aliases.includes(keyword)) {
                return point;
            }
        }
        return null;
    }

    /**
     * 分析商情内容
     */
    async analyzeContent(
        content: string,
        category: IntelCategory,
        location?: string,
        base64Image?: string,
        mimeType?: string,
    ): Promise<AIAnalysisResult> {
        // 如果没有 API Key，返回模拟结果
        if (!this.apiKey) {
            // 模拟 OCR：如果有图片但没文字，伪造一段识别结果
            if (!content && base64Image) {
                content = `【识别结果】\n锦州港  玉米  2810  (+10)\n梅花味精  收购价  2700\n鲅鱼圈  平舱价  2820  (持平)`;
            }
            return this.getMockAnalysis(content, category);
        }

        try {
            // TODO: 集成真实的 Gemini API 调用
            // 当前返回模拟数据，后续可替换为真实实现
            return this.getMockAnalysis(content, category);
        } catch (error) {
            this.logger.error('AI analysis failed', error);
            return {
                summary: 'AI 解析失败',
                tags: ['#错误'],
                sentiment: 'neutral',
                confidenceScore: 0,
                validationMessage: '系统连接异常或解析错误',
            };
        }
    }

    /**
     * 模拟 AI 分析结果（增强版，支持日报解析）
     */
    private getMockAnalysis(content: string, category: IntelCategory): AIAnalysisResult {
        const now = new Date();

        // 判断是否为日报类内容（长度 > 200 字通常是日报）
        const isDailyReport = content.length > 200 ||
            content.includes('日报') ||
            content.includes('周报') ||
            content.includes('一、') ||
            content.includes('行情概述');

        // 提取所有价格点
        const pricePoints = this.extractPricePoints(content);

        // 分析市场心态
        const marketSentiment = this.analyzeMarketSentiment(content);

        // 情感分析 (基于心态)
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (marketSentiment.overall === 'bullish') sentiment = 'positive';
        else if (marketSentiment.overall === 'bearish') sentiment = 'negative';

        // 提取标签
        const tags = this.extractTags(content);

        // 提取实体
        const entities = this.extractEntities(content);

        // 提取事件
        // 提取主要品种和区域 (为事件提供上下文)
        const mainCommodity = this.extractMainCommodity(content);
        const mainRegion = this.extractRegion(content);

        // 提取事件 (传入默认品种和区域)
        const events = this.extractEvents(content, mainCommodity, mainRegion);

        // 提取后市预判
        const forecast = this.extractForecast(content);

        // 分段识别
        const sections = isDailyReport ? this.extractSections(content) : undefined;

        // 日报元信息
        const reportMeta: DailyReportMeta | undefined = isDailyReport ? {
            reportType: this.detectReportType(content),
            reportDate: this.extractReportDate(content),
            region: mainRegion,
            commodity: mainCommodity || '未知',
            marketTrend: this.detectMarketTrend(content, pricePoints),
            keyChange: pricePoints.length > 0 ? pricePoints[0].change ?? undefined : undefined,
        } : undefined;

        // 提取生效时间
        let extractedEffectiveTime: string | undefined;
        if (content.includes('明天') || content.includes('明日')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            extractedEffectiveTime = tomorrow.toISOString().split('T')[0];
        } else if (reportMeta?.reportDate) {
            extractedEffectiveTime = reportMeta.reportDate;
        }

        // 计算置信度
        let confidenceScore = 75;
        if (pricePoints.length > 0) confidenceScore += 10;
        if (sections && sections.length > 2) confidenceScore += 5;
        if (entities.length > 0) confidenceScore += 5;
        confidenceScore = Math.min(confidenceScore, 95);

        // 生成摘要
        const summary = isDailyReport
            ? this.generateDailyReportSummary(content, pricePoints, marketSentiment)
            : `[AI演示] ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;

        // 结构化事件 (B类)
        let structuredEvent;
        if (category === IntelCategory.B_SEMI_STRUCTURED && events.length > 0) {
            structuredEvent = events[0];
        }

        // 价格验证（A类）
        let validationMessage: string | undefined;
        if (pricePoints.length > 0 && category === IntelCategory.A_STRUCTURED) {
            const mainPrice = pricePoints[0].price;
            const baseline = 2700;
            const deviation = Math.abs(mainPrice - baseline) / baseline;
            if (deviation > 0.05) {
                validationMessage = `价格 ${mainPrice} 元/吨偏离区域均价 ${baseline} 元/吨超过 5%，请核实数据准确性。`;
                confidenceScore = Math.max(confidenceScore - 15, 50);
            }
        }

        return {
            summary,
            tags,
            sentiment,
            confidenceScore,
            validationMessage,
            extractedEffectiveTime,
            extractedData: pricePoints.length > 0
                ? { price: pricePoints[0].price, unit: pricePoints[0].unit, commodity: pricePoints[0].commodity }
                : undefined,
            structuredEvent,
            entities: entities.length > 0 ? entities : undefined,

            // 新增：日报解析扩展
            reportMeta,
            pricePoints: pricePoints.length > 0 ? pricePoints : undefined,
            marketSentiment: marketSentiment.overall !== 'neutral' || marketSentiment.summary ? marketSentiment : undefined,
            forecast: forecast.shortTerm || forecast.keyFactors?.length ? forecast : undefined,
            sections,
            events: events.length > 0 ? events : undefined,
        };
    }

    /**
     * 提取价格点（批量）
     */
    private extractPricePoints(content: string): ExtractedPricePoint[] {
        const pricePoints: ExtractedPricePoint[] = [];

        // 匹配模式：地点 + 价格 + 可选涨跌
        // 例如：锦州港 2680元/吨 (-10)
        // 例如：梅花味精：2750元/吨 (→)
        // 例如：益海嘉里 2720 ↑5

        for (const loc of this.getKnownLocations()) {
            // 匹配该地点附近的价格
            const patterns = [
                // 地点：价格元/吨 (涨跌)
                new RegExp(`${loc}[：:：\\s]*([\\d,.]+)\\s*元[/每]?吨?\\s*[（(]?\\s*([↑↓→+-]?\\s*\\d*)?\\s*[）)]?`, 'g'),
                // 地点 价格 元/吨
                new RegExp(`${loc}\\s+([\\d,.]+)\\s*元`, 'g'),
                // 地点 收购价 价格
                new RegExp(`${loc}[^\\d]*?收购价?[^\\d]*?([\\d,.]+)\\s*元`, 'g'),
            ];

            for (const pattern of patterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    const priceStr = match[1]?.replace(/,/g, '');
                    const price = parseFloat(priceStr);
                    if (price && price > 100 && price < 10000) {
                        // 解析涨跌
                        let change: number | null = null;
                        const changeStr = match[2]?.trim();
                        if (changeStr) {
                            if (changeStr.includes('↑') || changeStr.includes('+')) {
                                const num = parseInt(changeStr.replace(/[↑+\s]/g, ''), 10);
                                change = num || 0;
                            } else if (changeStr.includes('↓') || changeStr.includes('-')) {
                                const num = parseInt(changeStr.replace(/[↓\-\s]/g, ''), 10);
                                change = -(num || 0);
                            } else if (changeStr.includes('→') || changeStr === '0') {
                                change = 0;
                            }
                        }

                        // 避免重复
                        if (!pricePoints.some(p => p.location === loc && p.price === price)) {
                            // 分类价格类型
                            const classification = this.classifyPricePoint(loc, content, match[0]);

                            pricePoints.push({
                                location: loc,
                                price,
                                change,
                                unit: '元/吨',
                                commodity: this.extractMainCommodity(content) || '玉米',
                                ...classification,
                            });
                        }
                    }
                }
            }
        }

        return pricePoints;
    }

    /**
     * 价格点分类（增强版：关联采集点和行政区划）
     */
    private classifyPricePoint(location: string, fullContent: string, matchedText: string): {
        sourceType: 'ENTERPRISE' | 'REGIONAL' | 'PORT';
        subType: 'LISTED' | 'TRANSACTION' | 'ARRIVAL' | 'FOB' | 'STATION_ORIGIN' | 'STATION_DEST' | 'PURCHASE' | 'WHOLESALE' | 'OTHER';
        geoLevel: 'PORT' | 'ENTERPRISE' | 'CITY' | 'PROVINCE' | 'REGION';
        enterpriseName?: string;
        enterpriseId?: string;
        note?: string;
        // 新增：采集点关联
        collectionPointId?: string;
        collectionPointCode?: string;
        // 新增：行政区划关联
        regionCode?: string;
        regionName?: string;
        // 新增：地理坐标（从采集点继承）
        longitude?: number;
        latitude?: number;
    } {
        // 1. 判断主体类型
        let sourceType: 'ENTERPRISE' | 'REGIONAL' | 'PORT' = 'REGIONAL';
        let geoLevel: 'PORT' | 'ENTERPRISE' | 'CITY' | 'PROVINCE' | 'REGION' = 'CITY';
        let enterpriseName: string | undefined;
        let enterpriseId: string | undefined;

        // 新增：采集点关联
        let collectionPointId: string | undefined;
        let collectionPointCode: string | undefined;
        let regionCode: string | undefined;
        let regionName: string | undefined;
        let longitude: number | undefined;
        let latitude: number | undefined;

        // 先尝试从缓存中匹配采集点
        const cachedPoint = this.findCollectionPoint(location);
        if (cachedPoint) {
            // 匹配成功：填充采集点关联信息
            collectionPointId = cachedPoint.id;
            collectionPointCode = cachedPoint.code;
            regionCode = cachedPoint.regionCode || undefined;

            // 继承坐标
            if (cachedPoint.longitude) longitude = cachedPoint.longitude;
            if (cachedPoint.latitude) latitude = cachedPoint.latitude;

            // 继承企业关联
            if (cachedPoint.enterpriseId) {
                enterpriseId = cachedPoint.enterpriseId;
            }

            const typeMap: Record<string, 'ENTERPRISE' | 'REGIONAL' | 'PORT'> = {
                'ENTERPRISE': 'ENTERPRISE',
                'PORT': 'PORT',
                'STATION': 'PORT',
                'REGION': 'REGIONAL',
                'MARKET': 'REGIONAL',
            };
            sourceType = typeMap[cachedPoint.type] || 'REGIONAL';
            if (cachedPoint.type === 'ENTERPRISE') {
                geoLevel = 'ENTERPRISE';
                enterpriseName = cachedPoint.name;
            } else if (cachedPoint.type === 'PORT' || cachedPoint.type === 'STATION') {
                geoLevel = 'PORT';
            }

            this.logger.debug(`采集点匹配成功: ${location} -> ${cachedPoint.code} (type=${cachedPoint.type})`);
        } else if (this.FALLBACK_ENTERPRISES.some((ent: string) => location.includes(ent))) {
            sourceType = 'ENTERPRISE';
            geoLevel = 'ENTERPRISE';
            enterpriseName = this.FALLBACK_ENTERPRISES.find((ent: string) => location.includes(ent));
        } else if (this.FALLBACK_PORTS.some((port: string) => location.includes(port))) {
            sourceType = 'PORT';
            geoLevel = 'PORT';
        } else {
            // 判断地域层级
            const regions = ['东北', '华北', '华东', '华南', '华中', '西北', '西南'];
            const provinces = ['吉林', '黑龙江', '辽宁', '山东', '河北', '河南', '内蒙古'];

            if (regions.some(r => location.includes(r))) {
                geoLevel = 'REGION';
            } else if (provinces.some(p => location.includes(p))) {
                geoLevel = 'PROVINCE';
            }
        }

        // 2. 判断价格子类型
        let subType: 'LISTED' | 'TRANSACTION' | 'ARRIVAL' | 'FOB' | 'STATION_ORIGIN' | 'STATION_DEST' | 'PURCHASE' | 'WHOLESALE' | 'OTHER' = 'LISTED';
        let note: string | undefined;

        // 从匹配文本和上下文判断
        const context = matchedText + ' ' + fullContent.substring(
            Math.max(0, fullContent.indexOf(matchedText) - 50),
            Math.min(fullContent.length, fullContent.indexOf(matchedText) + matchedText.length + 50)
        );

        if (context.includes('平舱') || context.includes('FOB')) {
            subType = 'FOB';
            note = '平舱价';
        } else if (context.includes('到港') || context.includes('到货')) {
            subType = 'ARRIVAL';
            note = '到港价';
        } else if (context.includes('站台')) {
            if (context.includes('销区') || context.includes('南方') || context.includes('华南')) {
                subType = 'STATION_DEST';
                note = '站台价-销区';
            } else {
                subType = 'STATION_ORIGIN';
                note = '站台价-产区';
            }
        } else if (context.includes('成交') || context.includes('实际')) {
            subType = 'TRANSACTION';
            note = '成交价';
        } else if (context.includes('收购') || context.includes('采购')) {
            subType = 'PURCHASE';
            note = '收购价';
        } else if (context.includes('挂牌') || context.includes('报价')) {
            subType = 'LISTED';
            note = '挂牌价';
        } else if (context.includes('批发')) {
            subType = 'WHOLESALE';
            note = '批发价';
        }

        return {
            sourceType,
            subType,
            geoLevel,
            enterpriseName,
            enterpriseId,
            note,
            // 采集点关联
            collectionPointId,
            collectionPointCode,
            // 行政区划关联
            regionCode,
            regionName,
            // 地理坐标
            longitude,
            latitude,
        };
    }

    /**
     * 分析市场心态
     */
    private analyzeMarketSentiment(content: string): MarketSentiment {
        let overall: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
        let score = 0;

        // 看涨信号
        const bullishKeywords = ['上涨', '利好', '偏强', '看涨', '补库', '积极', '增长', '走高', '坚挺'];
        // 看跌信号
        const bearishKeywords = ['下跌', '利空', '偏弱', '看跌', '观望', '谨慎', '回落', '走低', '疲软'];

        for (const kw of bullishKeywords) {
            if (content.includes(kw)) score += 15;
        }
        for (const kw of bearishKeywords) {
            if (content.includes(kw)) score -= 15;
        }

        // 判断整体情绪
        if (score > 20) overall = 'bullish';
        else if (score < -20) overall = 'bearish';
        else if (score !== 0) overall = 'mixed';

        // 提取各方心态
        let traders: string | undefined;
        let processors: string | undefined;
        let farmers: string | undefined;

        if (content.includes('贸易商')) {
            const match = content.match(/贸易商[^。，,\n]{0,50}/);
            traders = match ? match[0] : undefined;
        }
        if (content.includes('加工企业') || content.includes('深加工')) {
            const match = content.match(/(加工企业|深加工)[^。，,\n]{0,50}/);
            processors = match ? match[0] : undefined;
        }
        if (content.includes('农户') || content.includes('基层')) {
            const match = content.match(/(农户|基层)[^。，,\n]{0,50}/);
            farmers = match ? match[0] : undefined;
        }

        // 生成心态概述
        let summary: string | undefined;
        if (overall === 'bullish') summary = '市场情绪偏乐观，多方占优';
        else if (overall === 'bearish') summary = '市场情绪偏悲观，空方占优';
        else if (overall === 'mixed') summary = '市场多空分歧，情绪分化';

        return {
            overall,
            score: Math.max(-100, Math.min(100, score)),
            traders,
            processors,
            farmers,
            summary,
        };
    }

    /**
     * 提取后市预判
     */
    private extractForecast(content: string): Forecast {
        const forecast: Forecast = {};

        // 寻找预判相关段落
        const forecastKeywords = ['预计', '预判', '展望', '后市', '短期', '中期'];

        for (const kw of forecastKeywords) {
            const match = content.match(new RegExp(`${kw}[^。]*。`, 'g'));
            if (match) {
                if (kw === '短期' || (!forecast.shortTerm && match[0].length < 100)) {
                    forecast.shortTerm = match[0];
                } else if (kw === '中期') {
                    forecast.mediumTerm = match[0];
                }
            }
        }

        // 提取关键因素
        const keyFactors: string[] = [];
        if (content.includes('关注')) {
            const match = content.match(/关注[^。，]*[。，]/g);
            if (match) {
                keyFactors.push(...match.map(m => m.replace(/[。，]/g, '').trim()));
            }
        }
        if (keyFactors.length > 0) {
            forecast.keyFactors = keyFactors.slice(0, 5);
        }

        return forecast;
    }

    /**
     * 提取原文分段
     */
    private extractSections(content: string): ReportSection[] {
        const sections: ReportSection[] = [];

        // 匹配标题模式：一、二、三... 或 1. 2. 3...
        const titlePatterns = [
            /([一二三四五六七八九十]+)[、．.]\s*([^\n]+)/g,
            /(\d+)[、．.]\s*([^\n]+)/g,
            /【([^】]+)】/g,
        ];

        let lastIndex = 0;
        const matches: Array<{ title: string; start: number; end: number }> = [];

        for (const pattern of titlePatterns) {
            const ms = content.matchAll(pattern);
            for (const m of ms) {
                const title = m[2] || m[1];
                matches.push({
                    title: title.trim(),
                    start: m.index!,
                    end: m.index! + m[0].length,
                });
            }
        }

        // 按位置排序
        matches.sort((a, b) => a.start - b.start);

        // 提取各段内容
        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const nextStart = i < matches.length - 1 ? matches[i + 1].start : content.length;
            const sectionContent = content.substring(current.end, nextStart).trim();

            // 判断段落类型
            let type: ReportSection['type'] = 'other';
            const titleLower = current.title.toLowerCase();
            if (titleLower.includes('概述') || titleLower.includes('行情')) type = 'overview';
            else if (titleLower.includes('价格')) type = 'price';
            else if (titleLower.includes('心态') || titleLower.includes('情绪')) type = 'sentiment';
            else if (titleLower.includes('预判') || titleLower.includes('展望') || titleLower.includes('后市')) type = 'forecast';
            else if (titleLower.includes('事件') || titleLower.includes('动态')) type = 'event';

            sections.push({
                title: current.title,
                content: sectionContent.substring(0, 500), // 限制长度
                type,
                order: i + 1,
            });
        }

        return sections;
    }

    /**
     * 提取标签
     */
    private extractTags(content: string): string[] {
        const tags: string[] = [];

        for (const commodity of this.KNOWN_COMMODITIES) {
            if (content.includes(commodity)) tags.push(`#${commodity}`);
        }
        if (content.includes('价格')) tags.push('#价格');
        if (content.includes('日报')) tags.push('#日报');
        if (content.includes('周报')) tags.push('#周报');
        if (content.includes('补贴')) tags.push('#补贴');
        if (content.includes('检修')) tags.push('#检修');
        if (content.includes('拍卖')) tags.push('#拍卖');

        if (tags.length === 0) tags.push('#商情');
        return tags;
    }

    /**
     * 提取实体
     */
    private extractEntities(content: string): string[] {
        const entities: string[] = [];
        for (const loc of this.getKnownLocations()) {
            if (content.includes(loc)) entities.push(loc);
        }
        return entities;
    }

    /**
     * 提取事件
     */
    private extractEvents(
        content: string,
        defaultCommodity?: string,
        defaultRegion?: string,
    ): Array<{
        subject?: string;
        action?: string;
        impact?: string;
        sourceStart?: number;
        sourceEnd?: number;
        sourceText?: string;
        commodity?: string;
        regionCode?: string;
    }> {
        const events: Array<{
            subject?: string;
            action?: string;
            impact?: string;
            sourceStart?: number;
            sourceEnd?: number;
            sourceText?: string;
            commodity?: string;
            regionCode?: string;
        }> = [];

        // 简单的事件提取正则
        const eventPatterns = [
            /([\u4e00-\u9fa5]+(?:公司|企业|港|厂|基地))(?:计划|预计)?(开始|停止|启动|关闭|检修|复产|提价|降价|到港)/g,
        ];

        for (const pattern of eventPatterns) {
            const matches = content.matchAll(pattern);
            for (const m of matches) {
                if (m.index !== undefined) {
                    events.push({
                        subject: m[1],
                        action: m[2],
                        impact: this.determineImpact(m[2]),
                        sourceStart: m.index,
                        sourceEnd: m.index + m[0].length,
                        sourceText: m[0],
                        commodity: defaultCommodity, // 暂用文档级默认值，未来可细化为句级提取
                        regionCode: defaultRegion,   // 暂用文档级默认值
                    });
                }
            }
        }

        return events;
    }

    private determineImpact(action: string): string {
        if (['停止', '关闭', '检修', '减产'].some(k => action.includes(k))) return '供应减少，短期利空';
        if (['启动', '复产', '增产', '到港'].some(k => action.includes(k))) return '供应增加，短期利好';
        if (['提价', '涨价'].some(k => action.includes(k))) return '价格上行，利好';
        if (['降价', '跌价'].some(k => action.includes(k))) return '价格下行，利空';
        return '影响中性';
    }

    /**
     * 识别报告类型
     */
    private detectReportType(content: string): DailyReportMeta['reportType'] {
        if (content.includes('日报')) return 'market_daily';
        if (content.includes('周报')) return 'regional_weekly';
        if (content.includes('专题') || content.includes('分析')) return 'topic_analysis';
        if (content.includes('价格') && content.length < 300) return 'price_report';
        return 'other';
    }

    /**
     * 提取报告日期
     */
    private extractReportDate(content: string): string | undefined {
        const datePatterns = [
            /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号]?/,
            /(\d{1,2})[月](\d{1,2})[日号]/,
        ];

        for (const pattern of datePatterns) {
            const match = content.match(pattern);
            if (match) {
                const year = match[1]?.length === 4 ? match[1] : new Date().getFullYear().toString();
                const month = (match[1]?.length === 4 ? match[2] : match[1]).padStart(2, '0');
                const day = (match[1]?.length === 4 ? match[3] : match[2]).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }
        return undefined;
    }

    /**
     * 提取区域
     */
    private extractRegion(content: string): string | undefined {
        const regions = ['东北', '华北', '华东', '华南', '西北', '西南', '华中'];
        for (const region of regions) {
            if (content.includes(region)) return region;
        }

        const provinces = ['吉林', '黑龙江', '辽宁', '山东', '河北', '河南'];
        for (const prov of provinces) {
            if (content.includes(prov)) return prov;
        }

        return undefined;
    }

    /**
     * 提取主要品种
     */
    private extractMainCommodity(content: string): string | undefined {
        for (const commodity of this.KNOWN_COMMODITIES) {
            if (content.includes(commodity)) return commodity;
        }
        return undefined;
    }

    /**
     * 检测市场趋势
     */
    private detectMarketTrend(
        content: string,
        pricePoints: ExtractedPricePoint[],
    ): DailyReportMeta['marketTrend'] {
        // 基于价格变动
        if (pricePoints.length > 0) {
            const changes = pricePoints.filter(p => p.change !== null).map(p => p.change!);
            if (changes.length > 0) {
                const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
                if (avgChange > 5) return 'up';
                if (avgChange < -5) return 'down';
                if (Math.abs(avgChange) <= 5) return 'stable';
            }
        }

        // 基于文本
        if (content.includes('震荡') || content.includes('波动')) return 'volatile';
        if (content.includes('上涨') || content.includes('走高')) return 'up';
        if (content.includes('下跌') || content.includes('走低')) return 'down';

        return 'stable';
    }

    /**
     * 生成日报摘要
     */
    private generateDailyReportSummary(
        content: string,
        pricePoints: ExtractedPricePoint[],
        sentiment: MarketSentiment,
    ): string {
        const parts: string[] = [];

        // 日期和品种
        const date = this.extractReportDate(content);
        const commodity = this.extractMainCommodity(content) || '商品';
        if (date) parts.push(`[${date}]`);

        // 价格信息
        if (pricePoints.length > 0) {
            const main = pricePoints[0];
            let priceInfo = `${main.location} ${commodity}价格 ${main.price}${main.unit}`;
            if (main.change !== null && main.change !== 0) {
                priceInfo += main.change > 0 ? ` (↑${main.change})` : ` (↓${Math.abs(main.change)})`;
            }
            parts.push(priceInfo);
        }

        // 心态
        if (sentiment.summary) {
            parts.push(sentiment.summary);
        }

        return parts.length > 0 ? parts.join('，') : `[AI演示] ${content.substring(0, 80)}...`;
    }
}
