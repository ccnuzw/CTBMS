import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    AIAnalysisResult,
    CollectionPointForRecognition,
    ContentType,
    AIProvider,
} from '@packages/types';
import { AIModelConfig, IntelCategory } from '@prisma/client';

type AIEvent = NonNullable<AIAnalysisResult['events']>[number];
type AIInsight = NonNullable<AIAnalysisResult['insights']>[number];
type AIInsightExtended = AIInsight & { commodity?: string; sourceText?: string };

import { PrismaService } from '../../prisma/prisma.service';
import { PromptService } from './prompt.service';
import { RuleEngineService } from './rule-engine.service';
import { ConfigService } from '../config/config.service';
import { AIProviderFactory } from './providers/provider.factory';
import { AIRequestOptions } from './providers/base.provider';

import { TraceLog, TraceLogger } from './ai-shared.types';

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
    private readonly modelId: string; // 5分钟缓存

    // 常见品种
    private readonly KNOWN_COMMODITIES = ['玉米', '大豆', '小麦', '稻谷', '高粱', '豆粕', '菜粕'];

    constructor(
        private readonly prisma: PrismaService,
        private readonly promptService: PromptService,
        private readonly ruleEngineService: RuleEngineService,
        private readonly configService: ConfigService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly aiModelService: import('./ai-model.service').AIModelService,
        private readonly aiPromptService: import('./ai-prompt.service').AIPromptService,
        private readonly aiEntityExtractorService: import('./ai-entity-extractor.service').AIEntityExtractorService,
    ) {
        // AI API 配置 - 优先从数据库 ConfigService 获取，此处仅初始化默认环境变量
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.apiUrl = process.env.GEMINI_API_URL || '';
        this.modelId = process.env.GEMINI_MODEL_ID || 'gemini-pro';
    }

    /**
     * 模块初始化时加载采集点
     */
    async onModuleInit() {
        await this.aiEntityExtractorService.refreshCollectionPointCache();
        await this.aiEntityExtractorService.refreshEventTypeCache();
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
        contentType?: ContentType,
    ): Promise<AIAnalysisResult> {
        await this.aiEntityExtractorService.ensureCache(); // [NEW] 确保缓存是最新的 (5分钟 TTL)

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
            const aiConfig = await this.configService.getDefaultAIConfig();

            // Resolve Config Priority: DB > ENV > Default
            const currentApiKey = this.aiModelService.resolveApiKey(aiConfig, this.apiKey);
            const currentApiUrl = this.aiModelService.resolveApiUrl(aiConfig, this.apiUrl);
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

            // 调用 AI API
            traceLogger.log('AI', '准备调用 AI Provider', {
                model: currentModelId,
                configSource: aiConfig?.apiKey ? 'DATABASE' : 'ENVIRONMENT',
                provider: aiConfig?.provider || 'google'
            });
            const aiResponse = await this.callAI(content, category, base64Image, mimeType, traceLogger, aiConfig, currentApiUrl, contentType);

            // [NEW] 调用规则引擎进行补充分析
            const ruleMatches = await this.ruleEngineService.applyRules(content);
            traceLogger.log('RuleEngine', `规则引擎匹配完成: ${ruleMatches.length} 条`, {
                count: ruleMatches.length,
                matches: ruleMatches.map(r => `${r.ruleName} (${r.targetType})`)
            });

            // 使用 AI 返回的结果增强本地解析，并合并规则匹配结果
            const result = this.enhanceWithAIResponse(content, category, aiResponse, traceLogger);

            // 合并规则匹配到事件列表
            // 合并规则匹配到事件列表
            if (ruleMatches.length > 0) {
                const ruleEvents = ruleMatches
                    .filter(r => r.targetType === 'EVENT')
                    .map(r => ({
                        subject: r.extractedData.subject || '',
                        action: r.extractedData.action || '规则触发',
                        content: r.sourceText,
                        impact: '规则提取事件',
                        impactLevel: 'MEDIUM' as const,
                        sentiment: 'neutral' as const,
                        sourceText: r.sourceText,
                        eventTypeCode: r.typeId
                    }));

                if (ruleEvents.length > 0) {
                    result.events = result.events || [];
                    result.events.push(...ruleEvents);
                }

                // 处理规则匹配的洞察 (INSIGHT)
                const ruleInsights = ruleMatches
                    .filter(r => r.targetType === 'INSIGHT')
                    .map(r => ({
                        title: r.ruleName,
                        content: r.sourceText,
                        direction: 'Neutral' as const, // 默认值
                        timeframe: 'medium' as const,  // 默认值
                        confidence: 85,       // 规则匹配通常置信度较高
                        factors: r.extractedData.value ? [r.extractedData.value] : []
                    }));

                if (ruleInsights.length > 0) {
                    result.insights = result.insights || [];
                    result.insights.push(...ruleInsights);
                }
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
     * 调用 AI Provider (支持多供应商)
     */
    private async callAI(
        content: string,
        category: IntelCategory,
        base64Image?: string,
        mimeType?: string,
        traceLogger?: TraceLogger,
        aiConfig?: AIModelConfig | null,
        currentApiUrl?: string,
        contentType?: ContentType,
    ): Promise<string> {
        // 1. 动态获取 Prompt
        const promptCode = this.aiPromptService.getPromptCodeForCategory(category, contentType);
        const variables = this.aiPromptService.buildPromptVariables(content, category, contentType);

        const prompt = await this.promptService.getRenderedPrompt(promptCode, variables);

        if (!prompt) {
            throw new Error(`未找到 Prompt 模板配置: ${promptCode}`);
        }

        const systemPrompt = prompt.system;
        const userPrompt = prompt.user;

        // 2. 准备配置参数
        const targetModel = aiConfig?.modelName || this.modelId;
        const targetApiKey = this.aiModelService.resolveApiKey(aiConfig, this.apiKey);
        const providerType = (aiConfig?.provider as AIProvider) || 'google';

        traceLogger?.log('Prompt', '构建提示词完成', {
            templateCode: promptCode,
            provider: providerType,
            targetModel
        });

        // 3. 获取 Provider 实例
        const provider = this.aiProviderFactory.getProvider(providerType);

        const options: AIRequestOptions = {
            modelName: targetModel,
            apiKey: targetApiKey,
            apiUrl: currentApiUrl || aiConfig?.apiUrl || undefined,
            authType: aiConfig?.authType as AIRequestOptions['authType'],
            headers: this.aiModelService.resolveRecord(aiConfig?.headers),
            queryParams: this.aiModelService.resolveRecord(aiConfig?.queryParams),
            pathOverrides: this.aiModelService.resolveRecord(aiConfig?.pathOverrides),
            wireApi: this.aiModelService.resolveRecord(aiConfig?.pathOverrides)?.['wireApi'], // [NEW] Extract wireApi
            modelFetchMode: aiConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
            allowUrlProbe: aiConfig?.allowUrlProbe ?? undefined,
            allowCompatPathFallback: aiConfig?.allowCompatPathFallback ?? undefined,
            temperature: aiConfig?.temperature ?? 0.3,
            maxTokens: aiConfig?.maxTokens ?? 8192,
            topP: aiConfig?.topP ?? undefined,
            timeoutMs: aiConfig?.timeoutMs ?? undefined,
            maxRetries: aiConfig?.maxRetries ?? undefined,
            images: base64Image && mimeType ? [{ base64: base64Image, mimeType }] : undefined
        };

        // 4. 执行调用
        try {
            const startTime = Date.now();
            const text = await provider.generateResponse(systemPrompt, userPrompt, options);

            const latency = Date.now() - startTime;
            traceLogger?.log('AI', '收到 AI 响应', { latencyMs: latency, responseLen: text.length });
            return text;
        } catch (error) {
            traceLogger?.log('AI', 'Provider 调用失败', { error: String(error) }, 'error');
            throw error;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * [NEW] 生成智能简报
     */
    async generateBriefing(context: string, promptCode: string = 'MARKET_INTEL_BRIEFING'): Promise<string> {
        // [NEW] Get Configuration from DB
        const aiConfig = await this.configService.getDefaultAIConfig();

        // Resolve Config Priority: DB > ENV > Default
        const currentApiKey = this.aiModelService.resolveApiKey(aiConfig, this.apiKey);
        const currentApiUrl = this.aiModelService.resolveApiUrl(aiConfig, this.apiUrl);
        const currentModelId = aiConfig?.modelName || this.modelId;
        const providerType = (aiConfig?.provider as AIProvider) || 'google';

        // Log Configuration Source for Briefing
        if (aiConfig?.apiKey) {
            this.logger.log(`[Briefing Gen] Using DATABASE settings (Model: ${currentModelId}, Provider: ${providerType})`);
        } else {
            this.logger.warn(`[Briefing Gen] Using ENVIRONMENT/DEFAULT settings. verify system config if logic is unexpected.`);
        }

        if (!currentApiKey) {
            return `【系统错误】未配置 AI API Key，无法生成简报。`;
        }

        try {
            const prompt = await this.promptService.getRenderedPrompt(promptCode, { content: context });
            if (!prompt) {
                throw new Error(`简报模板 ${promptCode} 未找到`);
            }

            const provider = this.aiProviderFactory.getProvider(providerType);
            const options: AIRequestOptions = {
                modelName: currentModelId,
                apiKey: currentApiKey,
                apiUrl: currentApiUrl || undefined,
                authType: aiConfig?.authType as AIRequestOptions['authType'],
                headers: this.aiModelService.resolveRecord(aiConfig?.headers),
                queryParams: this.aiModelService.resolveRecord(aiConfig?.queryParams),
                pathOverrides: this.aiModelService.resolveRecord(aiConfig?.pathOverrides),
                modelFetchMode: aiConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
                allowUrlProbe: aiConfig?.allowUrlProbe ?? undefined,
                timeoutMs: aiConfig?.timeoutMs ?? undefined,
                maxRetries: aiConfig?.maxRetries ?? undefined,
            };

            return await provider.generateResponse(prompt.system, prompt.user, options);
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
            const aiResult = JSON.parse(cleanJson) as AIAnalysisResult & {
                insights?: AIInsightExtended[];
            };



            // 更新 localResult
            localResult.summary = aiResult.summary || localResult.summary;
            localResult.tags = aiResult.tags || localResult.tags;
            localResult.sentiment = aiResult.sentiment || localResult.sentiment;
            localResult.marketSentiment = {
                overall: this.aiEntityExtractorService.normalizeSentiment(aiResult.marketSentiment?.overall || 'neutral'),
                score: aiResult.marketSentiment?.score || 50,
                traders: aiResult.marketSentiment?.traders || '',
                processors: aiResult.marketSentiment?.processors || '',
                farmers: aiResult.marketSentiment?.farmers || '',
                summary: aiResult.marketSentiment?.summary || ''
            };

            // C类增强：研报提取字段
            if (aiResult.reportType) localResult.reportType = aiResult.reportType;
            if (aiResult.reportPeriod) localResult.reportPeriod = aiResult.reportPeriod;
            if (aiResult.keyPoints) localResult.keyPoints = aiResult.keyPoints;
            if (aiResult.prediction) localResult.prediction = aiResult.prediction;
            if (aiResult.dataPoints) localResult.dataPoints = aiResult.dataPoints;
            if (aiResult.commodities) localResult.commodities = aiResult.commodities;
            if (aiResult.regions) localResult.regions = aiResult.regions;

            // 处理价格点：保留 AI 提取的增强字段，同时进行采集点匹配和标准化
            const pricePoints = Array.isArray(aiResult.pricePoints) && aiResult.pricePoints.length > 0
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
                    const matchedPoint = this.aiEntityExtractorService.findCollectionPoint(p.location, traceLogger);
                    const normalizedLocation = matchedPoint?.name || p.location;

                    return {
                        location: normalizedLocation,
                        price: p.price,
                        change: p.change ?? null,
                        unit: p.unit || '元/吨',
                        commodity: p.commodity || '玉米',
                        grade: p.grade,
                        // 使用 AI 识别的分类，提供智能默认值
                        sourceType: this.aiEntityExtractorService.mapSourceType(p.sourceType, p.location),
                        subType: this.aiEntityExtractorService.mapSubType(p.subType, p.note),
                        geoLevel: this.aiEntityExtractorService.mapGeoLevel(p.geoLevel, p.location),
                        note: p.note,
                        // 附加采集点关联信息
                        collectionPointId: matchedPoint?.id,
                        collectionPointCode: matchedPoint?.code,
                    };
                })
                : localResult.pricePoints;

            // 处理事件
            const events = Array.isArray(aiResult.events) && aiResult.events.length > 0
                ? aiResult.events.map((e: AIEvent) => ({
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
            const insights = Array.isArray(aiResult.insights) && aiResult.insights.length > 0
                ? aiResult.insights.map((i: AIInsightExtended) => ({
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
                overall: this.aiEntityExtractorService.normalizeSentiment(aiResult.marketSentiment.overall),
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
                sentiment: this.aiEntityExtractorService.mapSentiment(aiResult.sentiment) || localResult.sentiment,
                // 合并标签（去重）
                tags: [...new Set([...(aiResult.tags || []), ...localResult.tags])],
                confidenceScore: 85,
                pricePoints,
                events,
                marketSentiment,
                // 新增：洞察数据（用于生成 MarketInsight）
                forecast: insights && insights.length > 0 ? {
                    shortTerm: insights.find(i => i.timeframe === 'short')?.content,
                    mediumTerm: insights.find(i => i.timeframe === 'medium')?.content,
                    longTerm: insights.find(i => i.timeframe === 'long')?.content,
                    keyFactors: insights.flatMap(i => i.factors || []).slice(0, 5),
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
     * [NEW] 通用对话接口
     */
    async chat(
        systemPrompt: string,
        userPrompt: string,
        modelConfigKey?: string,
    ): Promise<string> {
        // [NEW] Get Configuration
        // Priority: Argument ConfigKey > Default Config
        let aiConfig: AIModelConfig | null = null;
        if (modelConfigKey) {
            aiConfig = await this.prisma.aIModelConfig.findUnique({ where: { configKey: modelConfigKey } });
        }
        if (!aiConfig) {
            aiConfig = await this.configService.getDefaultAIConfig();
        }

        // Resolve Config Priority: DB > ENV > Default
        const currentApiKey = this.aiModelService.resolveApiKey(aiConfig, this.apiKey);
        const currentApiUrl = this.aiModelService.resolveApiUrl(aiConfig, this.apiUrl);
        const currentModelId = aiConfig?.modelName || this.modelId;
        const providerType = (aiConfig?.provider as AIProvider) || 'google';

        if (!currentApiKey) {
            // Fallback to Env if DB config is missing/invalid but env exists & matching provider
            if (providerType === 'google' && this.apiKey) {
                // use default
            } else {
                return `【系统错误】AI 服务未配置或 API Key 缺失 (Config: ${modelConfigKey || 'DEFAULT'})`;
            }
        }

        try {
            const provider = this.aiProviderFactory.getProvider(providerType);
            const options: AIRequestOptions = {
                modelName: currentModelId,
                apiKey: currentApiKey || this.apiKey, // fallback
                apiUrl: currentApiUrl || undefined,
                authType: aiConfig?.authType as AIRequestOptions['authType'],
                headers: this.aiModelService.resolveRecord(aiConfig?.headers),
                queryParams: this.aiModelService.resolveRecord(aiConfig?.queryParams),
                pathOverrides: this.aiModelService.resolveRecord(aiConfig?.pathOverrides),
                modelFetchMode: aiConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
                allowUrlProbe: aiConfig?.allowUrlProbe ?? undefined,
                timeoutMs: aiConfig?.timeoutMs ?? undefined,
                maxRetries: aiConfig?.maxRetries ?? undefined,
                temperature: aiConfig?.temperature ?? 0.7, // Chat usually needs higher temp
                maxTokens: aiConfig?.maxTokens ?? 2048,
            };

            return await provider.generateResponse(systemPrompt, userPrompt, options);
        } catch (error) {
            this.logger.error('Chat generation failed', error);
            throw new Error(`AI 对话失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
