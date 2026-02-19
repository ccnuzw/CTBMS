import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ConfigService } from '../../config/config.service';
import { AIModelConfig } from '@prisma/client';
import { KnowledgeQueryExpansionService } from './knowledge-query-expansion.service';

interface RetrievalResult {
    id: string;
    content: string;
    score: number;
    metadata: Record<string, unknown>;
    sourceId: string;
}

interface SearchOptions {
    topK?: number;
    filters?: {
        timeRange?: { start?: Date; end?: Date };
        category?: string;
        sourceType?: string;
        // Generic metadata filters
        [key: string]: unknown;
    };
    useQueryExpansion?: boolean;
}

@Injectable()
export class KnowledgeRetrievalService {
    private readonly logger = new Logger(KnowledgeRetrievalService.name);

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private queryExpansionService: KnowledgeQueryExpansionService,
    ) { }

    private resolveApiKey(config?: AIModelConfig | null): string {
        if (config?.apiKey) return config.apiKey;
        if (config?.apiKeyEnvVar) return process.env[config.apiKeyEnvVar] || '';
        return process.env.OPENAI_API_KEY || '';
    }

    private async getEmbeddings(): Promise<OpenAIEmbeddings | GoogleGenerativeAIEmbeddings> {
        const configs = await this.configService.getAllAIModelConfigs();
        const activeConfig = configs.find(c => c.isActive && c.configKey !== 'DEFAULT')
            || await this.configService.getDefaultAIConfig();

        if (!activeConfig) {
            // Fallback to Env if no config in DB
            if (process.env.GEMINI_API_KEY) {
                return new GoogleGenerativeAIEmbeddings({
                    modelName: 'text-embedding-004',
                    apiKey: process.env.GEMINI_API_KEY
                });
            }
            if (process.env.OPENAI_API_KEY) {
                return new OpenAIEmbeddings({
                    modelName: 'text-embedding-3-small',
                    openAIApiKey: process.env.OPENAI_API_KEY
                });
            }
            throw new Error('No active AI Model Configuration found and no ENV keys');
        }

        const apiKey = this.resolveApiKey(activeConfig);
        if (!apiKey) {
            throw new Error('No API Key found for Retrieval Service');
        }

        if (activeConfig.provider === 'google') {
            return new GoogleGenerativeAIEmbeddings({
                modelName: activeConfig.embeddingModel || 'text-embedding-004',
                apiKey: apiKey,
            });
        }

        const baseURL = activeConfig.apiUrl || undefined;
        return new OpenAIEmbeddings({
            modelName: activeConfig.embeddingModel || 'text-embedding-3-small',
            openAIApiKey: apiKey,
            configuration: { baseURL }
        });
    }

    private buildMetadataFilterClause(filters?: SearchOptions['filters']): string {
        if (!filters || Object.keys(filters).length === 0) {
            return '';
        }

        const conditions: string[] = [];

        if (filters.timeRange) {
            if (filters.timeRange.start) {
                conditions.push(`(metadata->>'publishDate')::timestamp >= '${filters.timeRange.start.toISOString()}'::timestamp`);
            }
            if (filters.timeRange.end) {
                conditions.push(`(metadata->>'publishDate')::timestamp <= '${filters.timeRange.end.toISOString()}'::timestamp`);
            }
        }

        if (filters.category) {
            conditions.push(`metadata->>'contentType' = '${filters.category}'`);
        }

        if (filters.sourceType) {
            conditions.push(`metadata->>'sourceType' = '${filters.sourceType}'`);
        }

        if (conditions.length === 0) return '';
        return 'AND ' + conditions.join(' AND ');
    }

    /**
     * Hybrid Search with RRF Fusion and Optional Query Expansion
     */
    async search(originalQuery: string, options: SearchOptions = {}): Promise<RetrievalResult[]> {
        const topK = options.topK || 5;
        let searchQueries = [originalQuery];

        // 1. Query Expansion (Optional)
        if (options.useQueryExpansion) {
            try {
                const rewritten = await this.queryExpansionService.rewriteQuery(originalQuery);
                this.logger.log(`Query Rewritten: "${originalQuery}" -> "${rewritten}"`);
                searchQueries = [rewritten]; // Use rewritten query for search
            } catch (e) {
                this.logger.warn(`Query expansion failed, using original query`);
            }
        }

        const query = searchQueries[0];
        this.logger.log(`Searching for: "${query}" with topK=${topK}`);

        // 2. Generate Query Vector
        try {
            const embeddings = await this.getEmbeddings();
            const queryVector = await embeddings.embedQuery(query);
            const vectorStr = `[${queryVector.join(',')}]`;

            // 3. Build Filter Clause
            const filterClause = this.buildMetadataFilterClause(options.filters);

            // 4. Execute Hybrid Search via SQL
            const sql = `
            WITH keyword_search AS (
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    "knowledgeItemId",
                    ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', '${query}')) as rank_score
                FROM "KnowledgeVector"
                WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', '${query}')
                ${filterClause}
                ORDER BY rank_score DESC
                LIMIT 20
            ),
            vector_search AS (
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    "knowledgeItemId",
                    (embedding <=> '${vectorStr}'::vector) as distance
                FROM "KnowledgeVector"
                WHERE 1=1 ${filterClause}
                ORDER BY distance ASC
                LIMIT 20
            ),
            -- RRF Fusion
            fusion AS (
                SELECT 
                    COALESCE(k.id, v.id) as id,
                    COALESCE(k.content, v.content) as content,
                    COALESCE(k.metadata, v.metadata) as metadata,
                    COALESCE(k."knowledgeItemId", v."knowledgeItemId") as knowledge_item_id,
                    COALESCE(1.0 / (60 + k_rank.rank), 0.0) + COALESCE(1.0 / (60 + v_rank.rank), 0.0) as rrf_score
                FROM 
                    (SELECT *, ROW_NUMBER() OVER (ORDER BY rank_score DESC) as rank FROM keyword_search) k
                FULL OUTER JOIN 
                    (SELECT *, ROW_NUMBER() OVER (ORDER BY distance ASC) as rank FROM vector_search) v
                ON k.id = v.id
            )
            SELECT 
                f.id, 
                f.content, 
                f.rrf_score as score, 
                f.metadata, 
                f.knowledge_item_id as "sourceId"
            FROM fusion f
            ORDER BY f.rrf_score DESC
            LIMIT ${topK};
            `;

            const results = await this.prisma.$queryRawUnsafe<Array<{
                id: string;
                content: string;
                score: number;
                metadata: Record<string, unknown>;
                sourceId: string;
            }>>(sql);

            return results.map(r => ({
                id: r.id,
                content: r.content,
                score: r.score,
                metadata: r.metadata,
                sourceId: r.sourceId
            }));

        } catch (error) {
            this.logger.error(`Search failed`, error);
            // Fallback if DB vector search fails
            return [];
        }
    }
}
