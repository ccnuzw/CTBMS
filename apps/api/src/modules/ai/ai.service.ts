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
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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
    private readonly apiUrl: string;
    private readonly modelId: string;

    // 采集点缓存（从数据库加载）
    // 使用 any[] 避免 Prisma 枚举与 types 枚举不兼容问题
    private collectionPointCache: any[] = [];
    private eventTypeCache: any[] = []; // [NEW] 事件类型缓存
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
        // Gemini API 配置（支持中转服务）
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.apiUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1';
        this.modelId = process.env.GEMINI_MODEL_ID || 'gemini-pro';

        if (!this.apiKey) {
            this.logger.warn('GEMINI_API_KEY not configured. Using demo mode.');
        } else {
            this.logger.log(`Gemini API configured: URL=${this.apiUrl}, Model=${this.modelId}`);
        }
    }

    /**
     * 模块初始化时加载采集点
     */
    async onModuleInit() {
        await this.refreshCollectionPointCache();
        await this.refreshEventTypeCache(); // [NEW] 加载事件类型
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
     * [NEW] 刷新事件类型缓存
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
     * 标准化关键词：统一全角/半角括号，去除多余空白
     */
    private normalizeKeyword(text: string): string {
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
     * 去除括号及其内容的辅助函数
     */
    private removeParentheses(text: string): string {
        return text
            .replace(/（.*?）/g, '')  // 中文括号
            .replace(/\(.*?\)/g, '')  // 英文括号
            .trim();
    }

    /**
     * 根据关键词查找采集点（增强版：最佳匹配策略）
     * 策略：计算匹配分数，取最高分。
     * 分数规则：
     * 1. 精确匹配：1000 + 词长
     * 2. 去括号后精确匹配：800 + 词长
     * 3. 包含匹配 (输入包含配置词)：100 + 配置词长 (越具体的配置词分数越高)
     */
    private findCollectionPoint(keyword: string): CollectionPointForRecognition | null {
        const normalizedKeyword = this.normalizeKeyword(keyword);
        const candidates: { point: CollectionPointForRecognition; score: number; matchType: string; matchTerm: string }[] = [];

        // 辅助函数：计算单点匹配
        const matchPoint = (point: CollectionPointForRecognition) => {
            const terms = [point.name, point.shortName, ...point.aliases]
                .filter((t): t is string => !!t && t.trim().length > 0);

            for (const term of terms) {
                const normalizedTerm = this.normalizeKeyword(term);

                // 1. 精确匹配 (Priority: Highest)
                if (normalizedKeyword === normalizedTerm) {
                    candidates.push({
                        point,
                        score: 1000 + term.length,
                        matchType: 'exact',
                        matchTerm: term
                    });
                    continue;
                }

                // 2. 包含匹配 (双向) (Priority: Medium)
                // Case A: 输入包含配置词 (e.g. 输入="中粮生化公主岭分厂", 配置词="中粮公主岭")
                if (normalizedTerm.length >= 2 && normalizedKeyword.includes(normalizedTerm)) {
                    candidates.push({
                        point,
                        score: 100 + term.length,
                        matchType: 'contains_term',
                        matchTerm: term
                    });
                }
                // Case B: 配置词包含输入 (e.g. 输入="宝鸡阜丰", 配置词="宝鸡阜丰生物科技有限公司")
                // 要求输入词长度至少为 3 (避免匹配到 "山东" 这种泛词)
                else if (normalizedKeyword.length >= 3 && normalizedTerm.includes(normalizedKeyword)) {
                    candidates.push({
                        point,
                        score: 80 + normalizedKeyword.length, // 分数略低于正向包含
                        matchType: 'term_contains',
                        matchTerm: term
                    });
                }
            }
        };

        // 遍历所有缓存点
        for (const point of this.collectionPointCache) {
            matchPoint(point);
        }

        // 3. 特殊策略：去括号后匹配 (支持 AI 提取带括号但格式不一致的情况)
        // 仅当 keyword 本身包含括号时才尝试
        if (normalizedKeyword.includes('(')) {
            const cleanKeyword = this.removeParentheses(normalizedKeyword);
            if (cleanKeyword.length > 0 && cleanKeyword !== normalizedKeyword) {
                // 尝试用去括号后的词去匹配所有的点
                for (const point of this.collectionPointCache) {
                    const terms = [point.name, point.shortName, ...point.aliases]
                        .filter((t): t is string => !!t && t.trim().length > 0);

                    for (const term of terms) {
                        const normalizedTerm = this.normalizeKeyword(term);
                        if (cleanKeyword === normalizedTerm) {
                            candidates.push({
                                point,
                                score: 800 + term.length, // 比完全精确低，比包含高
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
            // 按分数降序，分数相同按词长降序
            candidates.sort((a, b) => b.score - a.score || b.matchTerm.length - a.matchTerm.length);
            const best = candidates[0];
            this.logger.debug(`智能匹配最佳结果: ${keyword} → ${best.point.name} (Type: ${best.matchType}, Term: ${best.matchTerm}, Score: ${best.score})`);
            return best.point;
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
            // 调用真实的 Gemini API
            const aiResponse = await this.callGeminiAPI(content, category, base64Image, mimeType);

            // 使用 AI 返回的结果增强本地解析
            return this.enhanceWithAIResponse(content, category, aiResponse);
        } catch (error) {
            this.logger.error('AI analysis failed, falling back to local parsing', error);
            try {
                // 降级到本地模拟解析
                return this.getMockAnalysis(content, category);
            } catch (fallbackError) {
                this.logger.error('Local parsing fallback also failed', fallbackError);
                // 终极兜底：返回最基础的空结果，防止前端崩溃
                return {
                    summary: 'AI 分析服务暂时不可用，且本地解析失败。请稍后重试或手动录入。',
                    tags: ['#系统错误'],
                    sentiment: 'neutral',
                    confidenceScore: 0,
                    validationMessage: error instanceof Error ? error.message : '未知错误',
                };
            }
        }
    }

    /**
     * 测试 AI 连接
     * 用简单的提示词测试 Gemini API 是否配置正确
     */
    async testConnection(): Promise<{
        success: boolean;
        message: string;
        apiUrl?: string;
        modelId?: string;
        response?: string;
        error?: string;
    }> {
        if (!this.apiKey) {
            return { success: false, message: 'GEMINI_API_KEY 未配置' };
        }
        if (!this.apiUrl) {
            return { success: false, message: 'GEMINI_API_URL 未配置' };
        }

        try {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            const model = genAI.getGenerativeModel({ model: this.modelId }, {
                baseUrl: this.apiUrl,
            });

            const result = await model.generateContent('Hello');
            const response = await result.response;
            const text = response.text();

            return {
                success: true,
                message: 'AI 连接测试成功！',
                apiUrl: this.apiUrl,
                modelId: this.modelId,
                response: text.substring(0, 200),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Gemini SDK test error', error);
            return {
                success: false,
                message: `连接错误: ${errorMessage}`,
                apiUrl: this.apiUrl,
                modelId: this.modelId,
                error: errorMessage,
            };
        }
    }

    /**
     * 调用 Gemini API（支持中转服务，带重试机制）
     */
    private async callGeminiAPI(
        content: string,
        category: IntelCategory,
        base64Image?: string,
        mimeType?: string,
    ): Promise<string> {
        // 构建 Prompt
        const systemPrompt = this.buildSystemPrompt(category);
        const userPrompt = this.buildUserPrompt(content, category);

        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        this.logger.debug(`[AI] Preparing request for model: ${this.modelId}`);
        this.logger.debug(`[AI] Base URL: ${this.apiUrl}`);
        this.logger.debug(`[AI] System Prompt Length: ${systemPrompt.length}`);
        this.logger.debug(`[AI] User Prompt Length: ${userPrompt.length}`);

        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({
            model: this.modelId,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.3,
            }
        }, {
            baseUrl: this.apiUrl,
        });

        const parts: any[] = [{ text: fullPrompt }];

        // 如果有图片，添加到请求中
        if (base64Image && mimeType) {
            this.logger.debug(`[AI] Adding image: ${mimeType}, base64 length: ${base64Image.length}`);
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                },
            });
        }

        // 重试配置
        const maxRetries = 3;
        const baseDelayMs = 5000; // 5秒基础延迟

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.logger.debug(`[AI] Calling SDK generateContent (attempt ${attempt}/${maxRetries})...`);

            try {
                const result = await model.generateContent(parts);
                this.logger.debug(`[AI] SDK generateContent complete. Fetching response...`);

                const response = await result.response;
                this.logger.debug(`[AI] Response candidates: ${JSON.stringify(response.candidates?.[0]?.finishReason)}`);

                const text = response.text();
                this.logger.debug(`[AI] Response text length: ${text?.length}`);
                this.logger.debug(`[AI] Response preview: ${text?.substring(0, 100)}...`);

                if (!text) {
                    this.logger.warn(`[AI] Empty text received! Full response: ${JSON.stringify(response)}`);
                    throw new Error('Empty response from Gemini SDK');
                }

                return text;
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);

                // 检查是否为 429 速率限制错误
                const isRateLimited = msg.includes('429') || msg.includes('Too Many Requests');

                if (isRateLimited && attempt < maxRetries) {
                    const delayMs = baseDelayMs * attempt; // 指数退避：5s, 10s, 15s
                    this.logger.warn(`[AI] Rate limited (429). Waiting ${delayMs / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
                    await this.sleep(delayMs);
                    continue;
                }

                // 记录详细错误以便调试
                this.logger.error(`[AI] Gemini SDK generateContent failed: ${msg}`, error instanceof Error ? error.stack : undefined);
                if (error instanceof Error && 'response' in error) {
                    this.logger.error(`[AI] SDK Error Response: ${JSON.stringify((error as any).response)}`);
                }
                throw error;
            }
        }

        throw new Error('Max retries exceeded for Gemini API call');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * [NEW] 生成智能简报
     */
    async generateBriefing(context: string): Promise<string> {
        if (!this.apiKey) {
            return `【本地模拟简报】\n由于未配置 AI Key，启用模拟模式。\n\n当前市场关注点主要集中在：\n1. 东北产区玉米价格小幅波动；\n2. 港口集港量维持低位；\n3. 深加工企业收购意愿一般。\n\n(请配置 GEMINI_API_KEY 以获得真实 AI 分析)`;
        }

        const systemPrompt = `你是一名资深的大宗商品市场分析师。请根据提供的市场情报片段，撰写一份【每日市场动态简报】。
要求：
1. 宏观视角：先概述整体市场情绪（看涨/看跌/持稳）。
2. 核心矛盾：提炼当前市场的主要矛盾点（如：供强需弱、政策利好落地等）。
3. 分类综述：分别从【价格趋势】、【企业动态】、【物流库存】三个维度进行简述。
4. 语言风格：专业、简练、客观，避免废话。
5. 字数控制：300-500字。
6. 格式：使用 Markdown，重点内容加粗。`;

        const userPrompt = `基于以下情报数据生成简报：\n\n${context}`;

        try {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            const model = genAI.getGenerativeModel({ model: this.modelId }, { baseUrl: this.apiUrl });
            const result = await model.generateContent([systemPrompt, userPrompt]);
            const response = await result.response;
            return response.text();
        } catch (error) {
            this.logger.error('Failed to generate briefing', error);
            throw new Error('智能简报生成失败，请稍后重试。');
        }
    }

    /**
     * 构建系统提示词（完全匹配项目数据结构）
     */
    private buildSystemPrompt(category: IntelCategory): string {
        // 根据内容类别调整提示词重点
        const categoryInstructions: Record<IntelCategory, string> = {
            [IntelCategory.A_STRUCTURED]: `
重点任务：提取结构化价格数据
- 识别每个价格点的采集点名称、价格、涨跌、品种
- 判断价格主体类型：ENTERPRISE(企业收购价) / REGIONAL(地域市场价) / PORT(港口价格)
- 判断价格子类型：LISTED(挂牌价) / TRANSACTION(成交价) / ARRIVAL(到港价) / FOB(平舱价) / STATION_ORIGIN(站台价-产区) / STATION_DEST(站台价-销区) / PURCHASE(收购价) / WHOLESALE(批发价)
- 判断地理层级：ENTERPRISE(企业) / PORT(港口) / CITY(市级) / PROVINCE(省级) / REGION(大区)`,

            [IntelCategory.B_SEMI_STRUCTURED]: `
重点任务：提取市场事件和市场心态
- 市场事件：企业动态、供需变化、政策影响、物流运输等
- 市场心态：贸易商、加工企业、农户的心态倾向
- 识别事件的影响程度(HIGH/MEDIUM/LOW)和市场情绪(bullish/bearish/neutral)
- [重要] 根据以下事件类型代码表，准确标记 eventTypeCode：
${this.eventTypeCache.map(t => `  * ${t.code} (${t.name})`).join('\n')}`,


            [IntelCategory.C_DOCUMENT]: `
重点任务：提取市场洞察和预判
- 后市预判：短期/中期/长期展望
- 关键因素：影响市场的主要因素
- 预判方向：up(看涨) / down(看跌) / stable(持稳)
- 置信度：0-100的可信度评分`,

            [IntelCategory.D_ENTITY]: `
重点任务：识别企业实体信息
- 提取企业名称、动态、产能变化
- 关联相关市场影响`,
        };

        return `你是 CTBMS（粮贸商情管理系统）的专业农产品市场分析师。请分析输入内容并以 JSON 格式返回结构化数据。

${categoryInstructions[category] || ''}

## 常见采集点参考
- 港口：锦州港、鲅鱼圈、北良港、大连港、营口港、丹东港、秦皇岛港、唐山港、天津港、青岛港、日照港
- 深加工企业：梅花味精、中粮生化、益海嘉里、象屿生化、吉林燃料乙醇、长春大成、公主岭黄龙、嘉吉、国投生物、诺维信、西王、鲁洲
- 贸易商：中粮玉米、北大荒粮食、象屿物流、中储粮、华粮物流
- 地域：东北、华北、华东、华南、华中、西北、西南

## 常见品种
玉米、大豆、小麦、稻谷、高粱、豆粕、菜粕

## 输出 JSON 格式（严格遵循，不要包含 markdown 代码块，请输出紧凑的 JSON 以节省 Token）
{
  "summary": "一句话概括当前市场状况",
  "sentiment": "positive/negative/neutral",
  "tags": ["#玉米", "#价格", "#日报"],

  "pricePoints": [
    {
      "location": "采集点名称",
      "price": 2800,
      "change": 10,
      "unit": "元/吨",
      "commodity": "玉米",
      "grade": "二等",
      "sourceType": "ENTERPRISE/REGIONAL/PORT",
      "subType": "LISTED/TRANSACTION/ARRIVAL/FOB/STATION_ORIGIN/STATION_DEST/PURCHASE/WHOLESALE",
      "geoLevel": "ENTERPRISE/PORT/CITY/PROVINCE/REGION",
      "note": "备注如：平舱价、挂牌价"
    }
  ],

  "events": [
    {
      "subject": "事件主体（企业名或港口名）",
      "action": "动作（开始收购/停机检修/到港增加等）",
      "content": "事件完整描述",
      "impact": "对市场的影响描述",
      "impactLevel": "HIGH/MEDIUM/LOW",
      "sentiment": "bullish/bearish/neutral",
      "commodity": "相关品种",
      "sourceText": "原文片段"
    }
  ],

  "insights": [
    {
      "title": "洞察标题",
      "content": "详细内容",
      "direction": "up/down/stable",
      "timeframe": "short/medium/long",
      "confidence": 80,
      "factors": ["因素1", "因素2"],
      "commodity": "相关品种",
      "sourceText": "原文片段"
    }
  ],

  "marketSentiment": {
    "overall": "bullish/bearish/neutral/mixed",
    "score": 50,
    "traders": "贸易商心态描述",
    "processors": "加工企业心态描述",
    "farmers": "农户/基层心态描述",
    "summary": "整体市场情绪概述"
  }
}`;
    }

    /**
     * 构建用户提示词（针对不同类别提供具体指导）
     */
    private buildUserPrompt(content: string, category: IntelCategory): string {
        const categoryGuidance: Record<IntelCategory, string> = {
            [IntelCategory.A_STRUCTURED]: `请从以下A类价格快讯中提取所有价格点，注意区分：
- 企业挂牌价 vs 市场成交价
- 港口平舱价 vs 到港价
- 站台价（产区/销区）

每个价格点都要识别 sourceType、subType 和 geoLevel。`,

            [IntelCategory.B_SEMI_STRUCTURED]: `请从以下B类市场动态中提取：
1. 市场事件（企业动态、供需变化、物流运输）
2. 市场心态（贸易商、加工企业、农户的心理预期）
3. 如有价格信息也一并提取`,

            [IntelCategory.C_DOCUMENT]: `请从以下C类日报/研报中全面提取：
1. 价格数据汇总
2. 市场事件动态
3. 后市预判和洞察
4. 整体市场心态
5. 关键影响因素`,

            [IntelCategory.D_ENTITY]: `请从以下D类企业档案中提取：
1. 企业动态和产能变化
2. 与市场相关的事件
3. 对行情的潜在影响`,
        };

        return `${categoryGuidance[category] || '请分析以下市场内容：'}

===== 原文内容 =====
${content}
===== 原文结束 =====

请严格按照系统提示的 JSON 格式输出，确保所有字段名称正确。`;
    }

    /**
     * 使用 AI 响应增强本地解析结果
     */
    private enhanceWithAIResponse(
        content: string,
        category: IntelCategory,
        aiResponse: string,
    ): AIAnalysisResult {
        // 先获取本地解析结果作为基础
        const localResult = this.getMockAnalysis(content, category);

        try {
            // 尝试解析 AI 返回的 JSON
            let cleanJson = aiResponse;

            // 1. 移除 Markdown 代码块标记（包括可能的语言标识）
            cleanJson = cleanJson.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');

            // 2. 使用括号匹配找到完整的 JSON 对象
            const firstBrace = cleanJson.indexOf('{');
            if (firstBrace !== -1) {
                let depth = 0;
                let endIndex = -1;
                let inString = false;
                let escapeNext = false;

                for (let i = firstBrace; i < cleanJson.length; i++) {
                    const char = cleanJson[i];

                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }

                    if (char === '\\' && inString) {
                        escapeNext = true;
                        continue;
                    }

                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }

                    if (!inString) {
                        if (char === '{') depth++;
                        else if (char === '}') {
                            depth--;
                            if (depth === 0) {
                                endIndex = i;
                                break;
                            }
                        }
                    }
                }

                if (endIndex !== -1) {
                    cleanJson = cleanJson.substring(firstBrace, endIndex + 1);
                } else {
                    // 降级：使用 lastIndexOf
                    const lastBrace = cleanJson.lastIndexOf('}');
                    if (lastBrace > firstBrace) {
                        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
                    }
                }
            }

            cleanJson = cleanJson.trim();

            this.logger.debug(`Cleaned JSON for parsing (len=${cleanJson.length}): ${cleanJson.substring(0, 100)}...`);

            const aiResult = JSON.parse(cleanJson);

            // 处理价格点：保留 AI 提取的增强字段，同时进行采集点匹配和标准化
            const pricePoints = aiResult.pricePoints?.length > 0
                ? aiResult.pricePoints.map((p: {
                    location: string;
                    price: number;
                    change?: number | null;
                    unit?: string;
                    commodity?: string;
                    grade?: string;
                    sourceType?: string;
                    subType?: string;
                    geoLevel?: string;
                    note?: string;
                }) => {
                    // 尝试匹配采集点进行标准化
                    const matchedPoint = this.findCollectionPoint(p.location);
                    const normalizedLocation = matchedPoint?.name || p.location;

                    return {
                        location: normalizedLocation,
                        price: p.price,
                        change: p.change ?? null,
                        unit: p.unit || '元/吨',
                        commodity: p.commodity || '玉米',
                        grade: p.grade,
                        // 使用 AI 识别的分类，提供智能默认值
                        sourceType: this.mapSourceType(p.sourceType, p.location),
                        subType: this.mapSubType(p.subType, p.note),
                        geoLevel: this.mapGeoLevel(p.geoLevel, p.location),
                        note: p.note,
                        // 附加采集点关联信息
                        collectionPointId: matchedPoint?.id,
                        collectionPointCode: matchedPoint?.code,
                    };
                })
                : localResult.pricePoints;

            // 处理事件：包含增强字段
            const events = aiResult.events?.length > 0
                ? aiResult.events.map((e: {
                    subject?: string;
                    action?: string;
                    content?: string;
                    impact?: string;
                    impactLevel?: string;
                    sentiment?: string;
                    commodity?: string;
                    sourceText?: string;
                }) => ({
                    subject: e.subject,
                    action: e.action,
                    content: e.content,
                    impact: e.impact,
                    impactLevel: e.impactLevel,
                    sentiment: e.sentiment,
                    commodity: e.commodity,
                    sourceText: e.sourceText,
                    // [NEW] 传递 AI 识别的 eventTypeCode
                    eventTypeCode: (e as any).eventTypeCode,
                }))
                : localResult.events;

            // 处理洞察：新增字段
            const insights = aiResult.insights?.length > 0
                ? aiResult.insights.map((i: {
                    title?: string;
                    content?: string;
                    direction?: string;
                    timeframe?: string;
                    confidence?: number;
                    factors?: string[];
                    commodity?: string;
                    sourceText?: string;
                }) => ({
                    title: i.title,
                    content: i.content,
                    direction: i.direction,
                    timeframe: i.timeframe,
                    confidence: i.confidence,
                    factors: i.factors || [],
                    commodity: i.commodity,
                    sourceText: i.sourceText,
                }))
                : undefined;

            // 处理市场心态：包含完整字段
            const marketSentiment = aiResult.marketSentiment ? {
                overall: aiResult.marketSentiment.overall || 'neutral',
                score: aiResult.marketSentiment.score,
                traders: aiResult.marketSentiment.traders,
                processors: aiResult.marketSentiment.processors,
                farmers: aiResult.marketSentiment.farmers,
                summary: aiResult.marketSentiment.summary,
            } : localResult.marketSentiment;

            // 合并 AI 结果和本地结果
            return {
                ...localResult,
                // AI 生成的摘要优先
                summary: aiResult.summary || localResult.summary,
                // AI 识别的情绪
                sentiment: this.mapSentiment(aiResult.sentiment) || localResult.sentiment,
                // 合并标签（去重）
                tags: [...new Set([...(aiResult.tags || []), ...localResult.tags])],
                // 提高置信度（因为使用了真实 AI）
                confidenceScore: Math.min((localResult.confidenceScore || 75) + 15, 98),
                // 增强的数据
                pricePoints,
                events,
                marketSentiment,
                // 新增：洞察数据（用于生成 MarketInsight）
                forecast: insights?.length > 0 ? {
                    shortTerm: insights.find((i: { timeframe?: string }) => i.timeframe === 'short')?.content,
                    mediumTerm: insights.find((i: { timeframe?: string }) => i.timeframe === 'medium')?.content,
                    longTerm: insights.find((i: { timeframe?: string }) => i.timeframe === 'long')?.content,
                    keyFactors: insights.flatMap((i: { factors?: string[] }) => i.factors || []).slice(0, 5),
                } : localResult.forecast,
            };
        } catch (parseError) {
            this.logger.warn('Failed to parse AI response as JSON, using as summary', parseError);
            // 如果 JSON 解析失败，将 AI 响应作为摘要使用
            return {
                ...localResult,
                summary: aiResponse.substring(0, 500),
                confidenceScore: Math.min((localResult.confidenceScore || 75) + 5, 90),
            };
        }
    }

    /**
     * 映射价格主体类型
     */
    private mapSourceType(type: string | undefined, location: string): 'ENTERPRISE' | 'REGIONAL' | 'PORT' {
        if (type) {
            const upper = type.toUpperCase();
            if (upper === 'ENTERPRISE') return 'ENTERPRISE';
            if (upper === 'PORT') return 'PORT';
            if (upper === 'REGIONAL') return 'REGIONAL';
        }
        // 智能推断
        if (this.FALLBACK_PORTS.some(p => location.includes(p))) return 'PORT';
        if (this.FALLBACK_ENTERPRISES.some(e => location.includes(e))) return 'ENTERPRISE';
        return 'REGIONAL';
    }

    /**
     * 映射价格子类型
     */
    private mapSubType(
        type: string | undefined,
        note: string | undefined,
    ): 'LISTED' | 'TRANSACTION' | 'ARRIVAL' | 'FOB' | 'STATION_ORIGIN' | 'STATION_DEST' | 'PURCHASE' | 'WHOLESALE' | 'OTHER' {
        type SubTypeValue = 'LISTED' | 'TRANSACTION' | 'ARRIVAL' | 'FOB' | 'STATION_ORIGIN' | 'STATION_DEST' | 'PURCHASE' | 'WHOLESALE' | 'OTHER';
        if (type) {
            const upper = type.toUpperCase() as SubTypeValue;
            const validTypes: SubTypeValue[] = ['LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER'];
            if (validTypes.includes(upper)) return upper;
        }
        // 从备注推断
        const context = (note || '').toLowerCase();
        if (context.includes('平舱') || context.includes('fob')) return 'FOB';
        if (context.includes('到港') || context.includes('到货')) return 'ARRIVAL';
        if (context.includes('成交')) return 'TRANSACTION';
        if (context.includes('收购')) return 'PURCHASE';
        if (context.includes('站台')) return 'STATION_ORIGIN';
        return 'LISTED';
    }

    /**
     * 映射地理层级
     */
    private mapGeoLevel(
        level: string | undefined,
        location: string,
    ): 'COUNTRY' | 'REGION' | 'PROVINCE' | 'CITY' | 'DISTRICT' | 'PORT' | 'STATION' | 'ENTERPRISE' {
        type GeoLevelValue = 'COUNTRY' | 'REGION' | 'PROVINCE' | 'CITY' | 'DISTRICT' | 'PORT' | 'STATION' | 'ENTERPRISE';
        if (level) {
            const upper = level.toUpperCase() as GeoLevelValue;
            const validLevels: GeoLevelValue[] = ['COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE'];
            if (validLevels.includes(upper)) return upper;
        }
        // 智能推断
        if (this.FALLBACK_PORTS.some(p => location.includes(p))) return 'PORT';
        if (this.FALLBACK_ENTERPRISES.some(e => location.includes(e))) return 'ENTERPRISE';
        const regions = ['东北', '华北', '华东', '华南', '华中', '西北', '西南'];
        if (regions.some(r => location.includes(r))) return 'REGION';
        return 'CITY';
    }
    private mapSentiment(sentiment: string): 'positive' | 'negative' | 'neutral' | undefined {
        if (!sentiment) return undefined;
        const lower = sentiment.toLowerCase();
        if (lower === 'positive' || lower === 'bullish') return 'positive';
        if (lower === 'negative' || lower === 'bearish') return 'negative';
        if (lower === 'neutral' || lower === 'mixed') return 'neutral';
        return undefined;
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
                                // 优先使用标准化的采集点名称，否则使用原始识别值
                                location: classification.normalizedLocation || loc,
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
        // 新增：标准化地点名称（替换 AI 识别的原始值）
        normalizedLocation?: string;
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
        let normalizedLocation: string | undefined;
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
            normalizedLocation = cachedPoint.name; // 使用标准化的采集点名称
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
            normalizedLocation,
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
