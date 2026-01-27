import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    AIAnalysisResult,
    CollectionPointForRecognition,
} from '@packages/types';
import { IntelCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptService } from './prompt.service';
import { RuleEngineService } from './rule-engine.service';
import { ConfigService } from '../config/config.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 上帝视角日志记录器
 */
class TraceLogger {
    private logs: any[] = [];

    log(stage: string, message: string, detail?: any, level: 'info' | 'warn' | 'error' | 'debug' = 'info') {
        this.logs.push({
            timestamp: Date.now(),
            stage,
            message,
            detail,
            level
        });
    }

    getLogs() {
        return this.logs;
    }
}

/**
 * AI 分析服务
 * 封装 Gemini API 调用
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
    private collectionPointCache: any[] = [];
    private eventTypeCache: any[] = [];
    private cacheLastUpdated: Date | null = null;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

    // 常见品种
    private readonly KNOWN_COMMODITIES = ['玉米', '大豆', '小麦', '稻谷', '高粱', '豆粕', '菜粕'];

    constructor(
        private readonly prisma: PrismaService,
        private readonly promptService: PromptService,
        private readonly ruleEngineService: RuleEngineService,
        private readonly configService: ConfigService,
    ) {
        // Gemini API 配置 - now loaded dynamically via ConfigService in analyzeContent or onModuleInit
        // But for backward compatibility/simplicity, we can still load env here, 
        // OR better: load from ConfigService if available, fallback to ENV.
        // However, ConfigService is async (needs DB access). 
        // So we initialize basics here, but will override in methods.
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.apiUrl = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1';
        this.modelId = process.env.GEMINI_MODEL_ID || 'gemini-pro';

    }

    /**
     * 模块初始化时加载采集点
     */
    async onModuleInit() {
        await this.refreshCollectionPointCache();
        await this.refreshEventTypeCache();
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
    private removeParentheses(text: string): string {
        return text
            .replace(/（.*?）/g, '')  // 中文括号
            .replace(/\(.*?\)/g, '')  // 英文括号
            .trim();
    }

    /**
     * 根据关键词查找采集点（增强版：最佳匹配策略）
     */
    private findCollectionPoint(keyword: string, traceLogger?: TraceLogger): CollectionPointForRecognition | null {
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
     * 分析商情内容
     */
    async analyzeContent(
        content: string,
        category: IntelCategory,
        location?: string,
        base64Image?: string,
        mimeType?: string,
    ): Promise<AIAnalysisResult> {
        await this.ensureCache(); // [NEW] 确保缓存是最新的 (5分钟 TTL)

        const traceLogger = new TraceLogger();
        traceLogger.log('Init', '开始 AI 分析任务', { category, contentLength: content?.length });

        // 如果没有 API Key，强制失败
        if (!this.apiKey) {
            const errorMsg = 'SYSTEM_ERROR: 未配置 GEMINI_API_KEY，无法进行真机分析。请联系管理员配置。';
            traceLogger.log('Init', 'API Key 缺失，任务终止', null, 'error');
            return {
                summary: '系统未配置 AI 服务 (API Key Missing)',
                tags: ['#系统错误'],
                sentiment: 'neutral',
                confidenceScore: 0,
                validationMessage: errorMsg,
                traceLogs: traceLogger.getLogs(),
            };
        }

        try {
            // [NEW] Get Configuration from DB
            const aiConfig = await this.configService.getAIModelConfig('DEFAULT');

            // Resolve Config Priority: DB > ENV > Default
            const currentApiKey = aiConfig?.apiKey || this.apiKey;
            const currentApiUrl = aiConfig?.apiUrl || this.apiUrl;
            const currentModelId = aiConfig?.modelName || this.modelId;

            // Log Configuration Source for Transparency
            if (aiConfig?.apiKey) {
                this.logger.log(`[AI Configuration] Using DATABASE settings (Model: ${currentModelId}, URL: ${currentApiUrl})`);
            } else {
                this.logger.warn(`[AI Configuration] Using ENVIRONMENT/DEFAULT settings (Source: .env). Please configure in System Settings for better control.`);
            }

            if (!currentApiKey) {
                throw new Error('Valid API Key not found in Config (DEFAULT) or ENV.');
            }

            // 调用真实的 Gemini API
            traceLogger.log('AI', '准备调用 Gemini API', {
                model: currentModelId,
                configSource: aiConfig?.apiKey ? 'DATABASE' : 'ENVIRONMENT'
            });
            const aiResponse = await this.callGeminiAPI(content, category, base64Image, mimeType, traceLogger, aiConfig, currentApiUrl);

            // [NEW] 调用规则引擎进行补充分析
            const ruleMatches = await this.ruleEngineService.applyRules(content);
            traceLogger.log('RuleEngine', `规则引擎匹配完成: ${ruleMatches.length} 条`, {
                count: ruleMatches.length,
                matches: ruleMatches.map(r => `${r.ruleName} (${r.targetType})`)
            });

            // 使用 AI 返回的结果增强本地解析，并合并规则匹配结果
            const result = this.enhanceWithAIResponse(content, category, aiResponse, traceLogger);

            // 合并规则匹配到事件列表
            if (ruleMatches.length > 0) {
                const ruleEvents = ruleMatches
                    .filter(r => r.targetType === 'EVENT')
                    .map(r => ({
                        subject: r.extractedData.subject || '',
                        action: r.extractedData.action || '规则触发',
                        content: r.sourceText,
                        impact: '规则提取事件',
                        impactLevel: 'MEDIUM',
                        sentiment: 'neutral',
                        sourceText: r.sourceText,
                        eventTypeCode: r.typeId
                    }));
                // @ts-ignore
                result.events.push(...ruleEvents);
            }

            traceLogger.log('Done', '分析任务完成', { confidence: result.confidenceScore });
            return { ...result, traceLogs: traceLogger.getLogs() } as AIAnalysisResult;
        } catch (error) {
            this.logger.error('AI analysis failed', error);
            traceLogger.log('Error', 'AI 分析失败', { error: error instanceof Error ? error.message : String(error) }, 'error');
            return {
                summary: 'AI 分析执行失败',
                tags: ['#API错误'],
                sentiment: 'neutral',
                confidenceScore: 0,
                validationMessage: `API 调用失败: ${error instanceof Error ? error.message : String(error)}`,
                traceLogs: traceLogger.getLogs(),
            };
        }
    }

    /**
     * 测试 AI 连接
     */
    async testConnection(): Promise<{
        success: boolean;
        message: string;
        apiUrl?: string;
        modelId?: string;
        response?: string;
        error?: string;
    }> {
        // [NEW] Get Configuration from DB for testing
        const aiConfig = await this.configService.getAIModelConfig('DEFAULT');
        const currentApiKey = aiConfig?.apiKey || this.apiKey;
        const currentApiUrl = aiConfig?.apiUrl || this.apiUrl;
        const currentModelId = aiConfig?.modelName || this.modelId;

        if (!currentApiKey) {
            return { success: false, message: 'GEMINI_API_KEY 未配置 (Config/ENV)' };
        }
        if (!currentApiUrl) {
            return { success: false, message: 'GEMINI_API_URL 未配置 (Config/ENV)' };
        }

        try {
            const genAI = new GoogleGenerativeAI(currentApiKey);
            const requestOptions: any = {};
            if (currentApiUrl) {
                requestOptions.baseUrl = currentApiUrl;
            }

            const model = genAI.getGenerativeModel({
                model: currentModelId
            }, requestOptions);

            const result = await model.generateContent('Hello');
            const response = await result.response;
            const text = response.text();

            return {
                success: true,
                message: 'AI 连接测试成功！',
                apiUrl: currentApiUrl,
                modelId: currentModelId,
                response: text.substring(0, 200),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Gemini SDK test error', error);
            return {
                success: false,
                message: `连接错误: ${errorMessage}`,
                apiUrl: currentApiUrl,
                modelId: currentModelId,
                error: errorMessage,
            };
        }
    }

    /**
     * 获取分类对应的 Prompt Code
     */
    private getPromptCodeForCategory(category: IntelCategory): string {
        switch (category) {
            case IntelCategory.A_STRUCTURED:
                return 'MARKET_INTEL_STRUCTURED_A';
            case IntelCategory.B_SEMI_STRUCTURED:
                return 'MARKET_INTEL_SEMI_STRUCTURED_B';
            case IntelCategory.C_DOCUMENT:
                return 'MARKET_INTEL_DOCUMENT_C';
            default:
                return 'MARKET_INTEL_SEMI_STRUCTURED_B';
        }
    }

    /**
     * 构建 Prompt 变量
     */
    /**
     * JSON Schema 定义
     */
    private getJsonSchemaForCategory(category: IntelCategory): string {
        const commonFields = `
  "summary": "内容摘要",
  "sentiment": "overall sentiment (positive/negative/neutral)",
  "tags": ["tag1", "tag2"],
  "marketSentiment": {
    "overall": "neutral (allowed: bullish, bearish, neutral, mixed)",
    "score": 50,
    "traders": "贸易商心态",
    "processors": "加工企业心态",
    "farmers": "农户心态",
    "summary": "心态综述"
  }
`;

        const pricePointSchema = `
    {
      "location": "地名/企业名",
      "price": 0.0,
      "change": 0.0,
      "unit": "元/吨",
      "commodity": "品种",
      "grade": "等级 (e.g. 三等/水分15)",
      "sourceType": "ENTERPRISE/PORT/REGIONAL (可选)",
      "subType": "LISTED/TRANSACTION/ARRIVAL/FOB (可选)",
      "note": "备注"
    }`;

        const eventSchema = `
    {
      "subject": "主体",
      "action": "动作",
      "content": "事件详情",
      "impact": "影响分析",
      "impactLevel": "HIGH/MEDIUM/LOW",
      "sentiment": "positive/negative/neutral",
      "eventTypeCode": "事件类型编码 (参考上文)"
    }`;

        const insightSchema = `
    {
      "title": "观点标题",
      "content": "核心逻辑",
      "direction": "Bullish/Bearish/Neutral",
      "timeframe": "short/medium/long",
      "confidence": 80,
      "factors": ["利多因素1", "利空因素2"]
    }`;

        switch (category) {
            case IntelCategory.A_STRUCTURED:
                return `{
  ${commonFields},
  "pricePoints": [${pricePointSchema}]
}`;
            case IntelCategory.B_SEMI_STRUCTURED:
                return `{
  ${commonFields},
  "pricePoints": [${pricePointSchema}],
  "events": [${eventSchema}],
  "insights": [${insightSchema}]
}`;
            case IntelCategory.C_DOCUMENT:
                return `{
  ${commonFields},
  "insights": [${insightSchema}],
  "forecast": {
    "shortTerm": "短期预判",
    "mediumTerm": "中期预判",
    "risks": "风险点"
  }
}`;

            default:
                return `{ ${commonFields} }`;
        }
    }

    /**
     * 构建 Prompt 变量
     */
    private buildPromptVariables(content: string, category: IntelCategory): Record<string, any> {
        return {
            content,
            categoryInstructions: '',
            knownLocations: this.getKnownLocations().join('、'),
            knownCommodities: this.KNOWN_COMMODITIES.join('、'),
            eventTypeCodes: this.eventTypeCache.map(t => `- ${t.code}: ${t.name}`).join('\n'),
            jsonSchema: this.getJsonSchemaForCategory(category),
        };
    }

    /**
     * 调用 Gemini API（支持中转服务，带重试机制）
     */
    private async callGeminiAPI(
        content: string,
        category: IntelCategory,
        base64Image?: string,
        mimeType?: string,
        traceLogger?: TraceLogger,
        aiConfig?: any, // Pass config object
        currentApiUrl?: string, // [NEW] Pass specific URL
    ): Promise<string> {
        // [NEW] 动态获取 Prompt
        const promptCode = this.getPromptCodeForCategory(category);
        const variables = this.buildPromptVariables(content, category);

        const prompt = await this.promptService.getRenderedPrompt(promptCode, variables);

        if (!prompt) {
            throw new Error(`未找到 Prompt 模板配置: ${promptCode}`);
        }

        const systemPrompt = prompt.system;
        const userPrompt = prompt.user;

        // [FIX] Calculate dynamic values BEFORE logging
        const targetModel = aiConfig?.modelName || this.modelId;
        const targetApiKey = aiConfig?.apiKey || this.apiKey;

        traceLogger?.log('Prompt', '构建提示词完成 (Dynamic)', {
            templateCode: promptCode,
            systemPrompt,
            userPrompt,
            fullPrompt: `${systemPrompt}\n\n${userPrompt} `,
            targetModel // Add to trace log
        });

        const fullPrompt = `${systemPrompt} \n\n${userPrompt} `;

        // [FIX] Log the ACTUAL model being used
        this.logger.debug(`[AI] Preparing request for model: ${targetModel} (Provider: Google)`);

        const genAI = new GoogleGenerativeAI(targetApiKey);

        // Use dynamically configured URL if available
        const requestOptions: any = {};
        if (currentApiUrl) {
            requestOptions.baseUrl = currentApiUrl;
        }

        const model = genAI.getGenerativeModel({
            model: targetModel,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.3,
            }
        }, requestOptions);

        const parts: any[] = [{ text: fullPrompt }];

        // 如果有图片，添加到请求中
        if (base64Image && mimeType) {
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                },
            });
        }

        // 重试配置
        const maxRetries = 3;
        const baseDelayMs = 5000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (attempt > 1) {
                traceLogger?.log('AI', `API 调用重试(${attempt} / ${maxRetries})`, null, 'warn');
            }
            const startTime = Date.now();

            try {
                const result = await model.generateContent(parts);
                const response = await result.response;
                const text = response.text();

                if (!text) {
                    throw new Error('Empty response from Gemini SDK');
                }

                const latency = Date.now() - startTime;
                traceLogger?.log('AI', '收到 AI 响应', { latencyMs: latency, responseLen: text.length });
                return text;
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const isRateLimited = msg.includes('429') || msg.includes('Too Many Requests');

                if (isRateLimited && attempt < maxRetries) {
                    const delayMs = baseDelayMs * attempt;
                    await this.sleep(delayMs);
                    continue;
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
            return `【系统错误】未配置 GEMINI_API_KEY，无法生成简报。`;
        }

        try {
            const prompt = await this.promptService.getRenderedPrompt('MARKET_INTEL_BRIEFING', { content: context });
            if (!prompt) {
                // 如果没有找到模板，使用硬编码兜底，或者直接报错
                // 既然要求去除硬编码，这里报错更合适，但在 PromptService 已经初始化 default，理论上不会空
                throw new Error('简报模板 MARKET_INTEL_BRIEFING 未找到');
            }

            const genAI = new GoogleGenerativeAI(this.apiKey);
            const model = genAI.getGenerativeModel({ model: this.modelId }, { baseUrl: this.apiUrl });
            const result = await model.generateContent([prompt.system, prompt.user]);
            const response = await result.response;
            return response.text();
        } catch (error) {
            this.logger.error('Failed to generate briefing', error);
            throw new Error('智能简报生成失败，请稍后重试。');
        }
    }

    /**
     * 使用 AI 响应增强本地解析结果
     */
    private enhanceWithAIResponse(
        content: string,
        category: IntelCategory,
        aiResponse: string,
        traceLogger?: TraceLogger,
    ): AIAnalysisResult {
        const localResult: AIAnalysisResult = {
            summary: 'AI Analysis',
            sentiment: 'neutral',
            tags: [],
            confidenceScore: 0,
            pricePoints: [],
            events: [],
            marketSentiment: {
                overall: 'neutral',
                score: 50,
                traders: '',
                processors: '',
                farmers: '',
                summary: ''
            }
        };

        try {
            // 尝试解析 AI 返回的 JSON
            let cleanJson = aiResponse;
            traceLogger?.log('Parse', '开始解析 AI JSON 响应', { rawResponse: aiResponse });

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
            const aiResult = JSON.parse(cleanJson);



            // 更新 localResult
            localResult.summary = aiResult.summary || localResult.summary;
            localResult.tags = aiResult.tags || localResult.tags;
            localResult.sentiment = aiResult.sentiment || localResult.sentiment;
            localResult.marketSentiment = {
                overall: this.normalizeSentiment(aiResult.marketSentiment?.overall),
                score: aiResult.marketSentiment?.score || 50,
                traders: aiResult.marketSentiment?.traders || '',
                processors: aiResult.marketSentiment?.processors || '',
                farmers: aiResult.marketSentiment?.farmers || '',
                summary: aiResult.marketSentiment?.summary || ''
            };

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
                    const matchedPoint = this.findCollectionPoint(p.location, traceLogger);
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

            // 处理事件
            const events = aiResult.events?.length > 0
                ? aiResult.events.map((e: any) => ({
                    subject: e.subject,
                    action: e.action,
                    content: e.content,
                    impact: e.impact,
                    impactLevel: e.impactLevel,
                    sentiment: e.sentiment,
                    commodity: e.commodity,
                    sourceText: e.sourceText,
                    eventTypeCode: e.eventTypeCode,
                }))
                : localResult.events;

            // 处理洞察
            const insights = aiResult.insights?.length > 0
                ? aiResult.insights.map((i: any) => ({
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

            // 处理市场心态
            const marketSentiment = aiResult.marketSentiment ? {
                overall: this.normalizeSentiment(aiResult.marketSentiment.overall),
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
                confidenceScore: 85,
                pricePoints,
                events,
                marketSentiment,
                // 新增：洞察数据（用于生成 MarketInsight）
                forecast: insights?.length > 0 ? {
                    shortTerm: insights.find((i: any) => i.timeframe === 'short')?.content,
                    mediumTerm: insights.find((i: any) => i.timeframe === 'medium')?.content,
                    longTerm: insights.find((i: any) => i.timeframe === 'long')?.content,
                    keyFactors: insights.flatMap((i: any) => i.factors || []).slice(0, 5),
                } : localResult.forecast,
            };
        } catch (parseError) {
            this.logger.warn('Failed to parse AI response as JSON, using as summary', parseError);
            return {
                ...localResult,
                summary: aiResponse.substring(0, 500),
                confidenceScore: 0,
            };
        }
    }

    /**
     * 映射价格主体类型
     */
    /**
     * 映射价格主体类型 (Config Driven)
     */
    private normalizeSentiment(value: string): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
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
    private mapSourceType(type: string | undefined, location: string): 'ENTERPRISE' | 'REGIONAL' | 'PORT' {
        if (type) {
            const upper = type.toUpperCase();
            if (upper === 'ENTERPRISE') return 'ENTERPRISE';
            if (upper === 'PORT') return 'PORT';
            if (upper === 'REGIONAL') return 'REGIONAL';
        }

        // Use ConfigService for logic
        const matched = this.configService.evaluateMappingRule('PRICE_SOURCE_TYPE', location);
        if (['ENTERPRISE', 'PORT', 'REGIONAL'].includes(matched)) {
            return matched as any;
        }

        return 'REGIONAL'; // Default fallback
    }

    /**
     * 映射价格子类型
     */
    /**
     * 映射价格子类型 (Config Driven)
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

        const context = (note || '').toLowerCase();
        // Use ConfigService
        const matched = this.configService.evaluateMappingRule('PRICE_SUB_TYPE', context, 'LISTED');
        // Validate if result is a valid type, else return LISTED
        const validTypes: SubTypeValue[] = ['LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER'];
        if (validTypes.includes(matched as any)) {
            return matched as any;
        }

        return 'LISTED';
    }

    /**
     * 映射地理层级
     */
    /**
     * 映射地理层级 (Config Driven)
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

        const matched = this.configService.evaluateMappingRule('GEO_LEVEL', location, 'CITY');
        const validLevels: GeoLevelValue[] = ['COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE'];
        if (validLevels.includes(matched as any)) return matched as any;

        return 'CITY'; // Default
    }

    private mapSentiment(sentiment: string | undefined): 'neutral' | 'positive' | 'negative' {
        if (!sentiment) return 'neutral';
        const matched = this.configService.evaluateMappingRule('SENTIMENT', sentiment.toLowerCase(), 'neutral');
        return matched as 'neutral' | 'positive' | 'negative';
    }
}
