import { Injectable, Logger } from '@nestjs/common';
import { AIAnalysisResult, IntelCategory } from '@packages/types';

/**
 * AI 分析服务
 * 封装 Gemini API 调用，提供离线演示模式
 */
@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);
    private readonly apiKey: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        if (!this.apiKey) {
            this.logger.warn('GEMINI_API_KEY not configured. Using demo mode.');
        }
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
     * 模拟 AI 分析结果
     */
    private getMockAnalysis(content: string, category: IntelCategory): AIAnalysisResult {
        const now = new Date();

        // 基于内容提取模拟数据
        const priceMatch = content.match(/(\d+)\s*元/);
        const extractedPrice = priceMatch ? parseInt(priceMatch[1], 10) : null;

        // 检查价格是否异常 (偏离 2700 元/吨 ±5%)
        let validationMessage: string | undefined;
        if (extractedPrice && category === IntelCategory.A_STRUCTURED) {
            const baseline = 2700;
            const deviation = Math.abs(extractedPrice - baseline) / baseline;
            if (deviation > 0.05) {
                validationMessage = `价格 ${extractedPrice} 元/吨偏离区域均价 ${baseline} 元/吨超过 5%，请核实数据准确性。`;
            }
        }

        // 情感分析 (简化逻辑)
        let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (content.includes('上涨') || content.includes('利好') || content.includes('增长')) {
            sentiment = 'positive';
        } else if (content.includes('下跌') || content.includes('利空') || content.includes('下降')) {
            sentiment = 'negative';
        }

        // 提取标签
        const tags: string[] = [];
        if (content.includes('玉米')) tags.push('#玉米');
        if (content.includes('价格') || extractedPrice) tags.push('#价格');
        if (content.includes('锦州港')) tags.push('#锦州港');
        if (content.includes('补贴')) tags.push('#补贴');
        if (content.includes('检修')) tags.push('#检修');
        if (tags.length === 0) tags.push('#商情');

        // 提取实体
        const entities: string[] = [];
        if (content.includes('梅花')) entities.push('梅花味精');
        if (content.includes('锦州港')) entities.push('锦州港');

        // 结构化事件 (B类)
        let structuredEvent;
        if (category === IntelCategory.B_SEMI_STRUCTURED) {
            structuredEvent = {
                subject: entities[0] || '未知主体',
                action: content.length > 20 ? content.substring(0, 20) + '...' : content,
                impact: sentiment === 'negative' ? '利空影响' : sentiment === 'positive' ? '利好影响' : '中性影响',
            };
        }

        // 提取生效时间
        let extractedEffectiveTime: string | undefined;
        if (content.includes('明天') || content.includes('明日')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            extractedEffectiveTime = tomorrow.toISOString().split('T')[0];
        }

        return {
            summary: `[AI演示] ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
            tags,
            sentiment,
            confidenceScore: validationMessage ? 60 : 85,
            validationMessage,
            extractedEffectiveTime,
            extractedData: extractedPrice
                ? { price: extractedPrice, unit: '元/吨', commodity: '玉米' }
                : undefined,
            structuredEvent,
            entities: entities.length > 0 ? entities : undefined,
        };
    }
}
