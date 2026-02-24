import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIModelConfig } from '@prisma/client';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

@Injectable()
export class KnowledgeQueryExpansionService {
    private readonly logger = new Logger(KnowledgeQueryExpansionService.name);

    constructor(private readonly configService: ConfigService) { }

    private resolveApiKey(config?: AIModelConfig | null): string {
        if (config?.apiKey) return config.apiKey;
        if (config?.apiKeyEnvVar) return process.env[config.apiKeyEnvVar] || '';
        return process.env.OPENAI_API_KEY || '';
    }

    private async getLLM(): Promise<ChatOpenAI | ChatGoogleGenerativeAI> {
        const activeConfig = await this.configService.getDefaultAIConfig();

        if (!activeConfig) {
            // Fallback
            if (process.env.GEMINI_API_KEY) {
                return new ChatGoogleGenerativeAI({
                    model: 'gemini-1.5-flash',
                    apiKey: process.env.GEMINI_API_KEY
                });
            }
            if (process.env.OPENAI_API_KEY) {
                return new ChatOpenAI({
                    modelName: 'gpt-4o-mini',
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    temperature: 0,
                });
            }
            throw new Error('No active AI Model Configuration found');
        }

        const apiKey = this.resolveApiKey(activeConfig);
        const baseURL = activeConfig.apiUrl || undefined;

        if (!apiKey) {
            throw new Error('No API Key found for Query Expansion Service');
        }

        if (activeConfig.provider === 'google') {
            return new ChatGoogleGenerativeAI({
                model: activeConfig.modelName || 'gemini-1.5-flash',
                apiKey: apiKey,
                temperature: 0,
            });
        }

        return new ChatOpenAI({
            modelName: activeConfig.modelName || 'gpt-4o-mini',
            openAIApiKey: apiKey,
            configuration: { baseURL },
            temperature: 0,
        });
    }

    /**
     * Rewrite a query to be more search-friendly.
     * e.g., "What's the price of corn in Dalian?" -> "Dalian corn price trends 2024"
     */
    async rewriteQuery(query: string): Promise<string> {
        try {
            const llm = await this.getLLM();
            const prompt = PromptTemplate.fromTemplate(
                `You are an expert search query optimizer for a commodity trading knowledge base. 
Refine the following user question into a precise keyword-rich search query. 
Remove conversational filler. Keep it in the same language as the input (likely Chinese).
Do not answer the question, just output the optimized query string.

User Question: {question}
Optimized Query:`
            );

            const chain = prompt.pipe(llm).pipe(new StringOutputParser());
            const result = await chain.invoke({ question: query });
            return result.trim();
        } catch (error) {
            this.logger.warn(`Query rewriting failed, using original: ${error}`);
            return query;
        }
    }

    /**
     * Generate multiple variations of a query for multi-perspective search.
     */
    async expandQuery(query: string, count: number = 3): Promise<string[]> {
        try {
            const llm = await this.getLLM();
            const prompt = PromptTemplate.fromTemplate(
                `You are an AI research assistant. 
Generate {count} different search queries to answer the user's question from different angles.
Focus on: 1. Specific entities (e.g., specific commodities, locations). 2. Synonyms. 3. Related concepts.
Output each query on a new line. Do not include numbering or prefixes.

User Question: {question}
Queries:`
            );

            const chain = prompt.pipe(llm).pipe(new StringOutputParser());
            const result = await chain.invoke({ question: query, count });

            const queries = result.split('\n').map(q => q.trim()).filter(q => q.length > 0);
            return queries.slice(0, count);
        } catch (error) {
            this.logger.warn(`Query expansion failed, using original: ${error}`);
            return [query];
        }
    }
}
