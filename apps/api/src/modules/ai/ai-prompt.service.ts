import { Injectable } from '@nestjs/common';
import { ContentType } from '@packages/types';
import { IntelCategory } from '@prisma/client';

import { AIEntityExtractorService } from './ai-entity-extractor.service';

@Injectable()

export class AIPromptService {
    private readonly KNOWN_COMMODITIES = ['玉米', '大豆', '小麦', '稻谷', '高粱', '豆粕', '菜粕'];

    constructor(private readonly aiEntityExtractorService: AIEntityExtractorService) {}


    /**
     * 获取分类对应的 Prompt Code
     */
    public getPromptCodeForCategory(category: IntelCategory, contentType?: ContentType): string {
        if (contentType === ContentType.RESEARCH_REPORT) {
            return 'MARKET_INTEL_RESEARCH_REPORT';
        }

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
    public getJsonSchemaForCategory(category: IntelCategory, contentType?: ContentType): string {
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

        // 研报专用 Schema
        if (contentType === ContentType.RESEARCH_REPORT) {
            return `{
  ${commonFields},
  "reportType": "POLICY | MARKET | RESEARCH | INDUSTRY",
  "reportPeriod": "DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL | ADHOC",
  "keyPoints": [
    { "point": "核心观点1", "sentiment": "bullish", "confidence": 90 }
  ],
  "prediction": {
    "direction": "bullish",
    "timeframe": "short_term",
    "logic": "预测逻辑"
  },
  "dataPoints": [
    { "metric": "指标名", "value": "数值", "unit": "单位" }
  ],
  "commodities": ["品种1"],
  "regions": ["区域1"]
}`;
        }

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
    public buildPromptVariables(content: string, category: IntelCategory, contentType?: ContentType): Record<string, unknown> {
        return {
            content,
            categoryInstructions: '',
            knownLocations: this.aiEntityExtractorService.getKnownLocations().join('、'),
            knownCommodities: this.KNOWN_COMMODITIES.join('、'),
            eventTypeCodes: this.aiEntityExtractorService.getEventTypeCache().map(t => `- ${t.code}: ${t.name}`).join('\n'),
            jsonSchema: this.getJsonSchemaForCategory(category, contentType),
        };
    }


}
