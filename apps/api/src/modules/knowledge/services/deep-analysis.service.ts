import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { PromptService } from '../../ai/prompt.service';

export interface StructuredInsight {
    summary?: string;  // AI 生成的简短摘要
    drivers: string[]; // Key drivers
    risks: string[];   // Potential risks
    outlook: {
        shortTerm: string;
        mediumTerm: string;
        longTerm: string;
    };
    suggestions: string[]; // Actionable suggestions
}

@Injectable()
export class DeepAnalysisService {
    private readonly logger = new Logger(DeepAnalysisService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly configService: ConfigService,
        private readonly promptService: PromptService,
    ) { }

    /**
     * Generate deep analysis for a research report
     */
    async analyzeReport(reportId: string, content: string): Promise<StructuredInsight | null> {
        try {
            this.logger.log(`Starting deep analysis for Report ID: ${reportId}`);

            // Generate structured insights
            const analysis = await this.generateInsights(content);

            // Generate concise summary
            const summary = await this.generateSummary(content);

            // Save to ResearchReport
            const updateData: Record<string, unknown> = {};
            if (analysis) {
                updateData.structuredAnalysis = analysis as unknown as Prisma.InputJsonValue;
            }
            if (summary) {
                updateData.summary = summary;
            }

            if (Object.keys(updateData).length > 0) {
                await this.prisma.researchReport.update({
                    where: { id: reportId },
                    data: updateData,
                });
                this.logger.log(`Saved deep analysis + summary for Report ID: ${reportId}`);
            }

            return analysis ? { ...analysis, summary: summary || undefined } : null;
        } catch (error) {
            this.logger.error(`Failed to analyze report ${reportId}`, error);
            throw error;
        }
    }

    /**
     * Generate a concise summary for a research report using configurable prompt
     */
    async generateSummary(text: string): Promise<string | null> {
        if (!text || text.length < 50) return null;

        const truncatedText = text.slice(0, 15000);

        try {
            // Try to load prompt from database
            let systemPrompt = '你是一名资深的大宗商品市场研究员。请为研究报告生成一段 150-300 字的简洁摘要。涵盖研究主题、核心观点、关键数据和后市展望。纯文本输出，不使用 Markdown。';
            let userPrompt = `请为以下研报内容生成摘要：\n\n${truncatedText}`;

            const template = await this.promptService.getRenderedPrompt('MARKET_INTEL_SUMMARY_GENERATOR', { content: truncatedText });
            if (template) {
                systemPrompt = template.system;
                userPrompt = template.user;
                this.logger.log('Using database prompt template for summary generation');
            } else {
                this.logger.warn('Prompt template MARKET_INTEL_SUMMARY_GENERATOR not found, using fallback');
            }

            const response = await this.callLLM(userPrompt, systemPrompt);
            // Clean up potential quotes or prefixes
            const cleaned = response
                .replace(/^["'"]|["'"]$/g, '')
                .replace(/^摘要[：:]\s*/i, '')
                .trim();

            return cleaned || null;
        } catch (error) {
            this.logger.error('Summary generation failed', error);
            return null;
        }
    }

    /**
     * Call LLM to generate structured insights
     */
    async generateInsights(text: string): Promise<StructuredInsight | null> {
        if (!text || text.length < 100) return null;

        const truncatedText = text.slice(0, 20000); // Larger context for analysis

        // Try to load prompt from database
        let systemPrompt = 'You are a Senior Commodity Analyst. Analyze the following research report content and provide a structured Deep Analysis.';
        let userPrompt = `**Content:**\n${truncatedText}`;

        const template = await this.promptService.getRenderedPrompt('KNOWLEDGE_DEEP_ANALYSIS', { content: truncatedText });
        if (template) {
            systemPrompt = template.system;
            userPrompt = template.user;
            this.logger.log('Using database prompt template for deep analysis');
        } else {
            this.logger.warn('Prompt template KNOWLEDGE_DEEP_ANALYSIS not found, using fallback');
        }

        try {
            const response = await this.callLLM(userPrompt, systemPrompt);
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson) as StructuredInsight;
        } catch (error) {
            this.logger.error('LLM Deep Analysis Failed', error);
            return null;
        }
    }

    private async callLLM(prompt: string, systemPrompt?: string): Promise<string> {
        const aiConfig = await this.configService.getDefaultAIConfig();
        const providerType = (aiConfig?.provider || 'google') as 'google' | 'openai' | 'sub2api';

        const provider = this.aiProviderFactory.getProvider(providerType);

        const options = {
            modelName: aiConfig?.modelName || 'gemini-pro',
            apiKey: aiConfig?.apiKey || process.env.GEMINI_API_KEY || '',
            apiUrl: aiConfig?.apiUrl || undefined,
            authType: aiConfig?.authType as 'api-key' | 'bearer',
            headers: aiConfig?.headers as Record<string, string>,
            maxTokens: 4000
        };

        const defaultSystem = systemPrompt || "You are a senior market analyst providing deep insights.";
        return await provider.generateResponse(defaultSystem, prompt, options);
    }
}

