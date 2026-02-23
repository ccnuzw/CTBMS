import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ConfigService } from '../../config/config.service';
import { AIModelConfig, Prisma } from '@prisma/client';
import { KnowledgeQueryExpansionService } from './knowledge-query-expansion.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';

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
    private aiProviderFactory: AIProviderFactory,
  ) { }

  private resolveApiKey(config?: AIModelConfig | null): string {
    if (config?.apiKey) return config.apiKey;
    if (config?.apiKeyEnvVar) return process.env[config.apiKeyEnvVar] || '';
    return process.env.OPENAI_API_KEY || '';
  }

  private async getEmbeddings(): Promise<OpenAIEmbeddings | GoogleGenerativeAIEmbeddings> {
    const activeConfig = await this.configService.getDefaultAIConfig();

    if (!activeConfig) {
      // Fallback to Env if no config in DB
      if (process.env.GEMINI_API_KEY) {
        return new GoogleGenerativeAIEmbeddings({
          modelName: 'text-embedding-004',
          apiKey: process.env.GEMINI_API_KEY,
        });
      }
      if (process.env.OPENAI_API_KEY) {
        return new OpenAIEmbeddings({
          modelName: 'text-embedding-3-small',
          openAIApiKey: process.env.OPENAI_API_KEY,
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
      configuration: { baseURL },
    });
  }

  private buildMetadataFilterClause(filters?: SearchOptions['filters']): Prisma.Sql {
    if (!filters || Object.keys(filters).length === 0) {
      return Prisma.empty;
    }

    const conditions: Prisma.Sql[] = [];

    if (filters.timeRange) {
      if (filters.timeRange.start) {
        conditions.push(
          Prisma.sql`(metadata->>'publishDate')::timestamp >= ${filters.timeRange.start.toISOString()}::timestamp`,
        );
      }
      if (filters.timeRange.end) {
        conditions.push(
          Prisma.sql`(metadata->>'publishDate')::timestamp <= ${filters.timeRange.end.toISOString()}::timestamp`,
        );
      }
    }

    if (filters.category) {
      conditions.push(
        Prisma.sql`(metadata->>'contentType' = ${filters.category} OR metadata->>'type' = ${filters.category})`,
      );
    }

    if (filters.sourceType) {
      conditions.push(Prisma.sql`metadata->>'sourceType' = ${filters.sourceType}`);
    }

    if (conditions.length === 0) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
  }

  /**
   * Hybrid Search with RRF Fusion and Optional Query Expansion
   */
  async search(originalQuery: string, options: SearchOptions = {}): Promise<RetrievalResult[]> {
    const requestedTopK = options.topK || 5;
    const topK = Number.isFinite(requestedTopK)
      ? Math.min(50, Math.max(1, Math.floor(requestedTopK)))
      : 5;
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
      const sql = Prisma.sql`
            WITH keyword_search AS (
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    "knowledgeItemId",
                    -- [RAG 优化] 若已按照 setup-rag-indexes.sql 配置了 zhcfg，可将下方三处的 'simple' 替换为 'zhcfg'
                    ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', ${query})) as rank_score
                FROM "KnowledgeVector"
                WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', ${query})
                ${filterClause}
                ORDER BY rank_score DESC
                LIMIT 30
            ),
            vector_search AS (
                SELECT 
                    id, 
                    content, 
                    metadata, 
                    "knowledgeItemId",
                    (embedding <=> ${vectorStr}::vector) as distance
                FROM "KnowledgeVector"
                WHERE 1=1 ${filterClause}
                ORDER BY distance ASC
                LIMIT 30
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
            LIMIT 20;
            `;

      const candidates = await this.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          score: number;
          metadata: Record<string, unknown>;
          sourceId: string;
        }>
      >(sql);

      if (!candidates || candidates.length === 0) {
        return [];
      }

      // 5. Reranking (Secondary Scoring)
      try {
        const configs = await this.configService.getAllAIModelConfigs();
        // Look for a specific config that acts as our Reranker, or default to sub2api if active
        // Simplification: We use the active 'sub2api' provider if available (SiliconFlow compatible)
        const rerankConfig = configs.find((c) => c.isActive && c.provider === 'sub2api');

        if (rerankConfig && rerankConfig.apiUrl && rerankConfig.embeddingModel) {
          this.logger.log(`Performing Rerank using ${rerankConfig.provider}`);
          const providerInfo = this.aiProviderFactory.getProvider('sub2api');
          if (providerInfo.rerank) {
            const documents = candidates.map((c) => c.content);
            const rerankedScores = await providerInfo.rerank(query, documents, {
              modelName: rerankConfig.embeddingModel, // or a specific rerankModel field if added
              apiKey: this.resolveApiKey(rerankConfig),
              apiUrl: rerankConfig.apiUrl,
            });

            if (rerankedScores && rerankedScores.length > 0) {
              // Map new scores
              const rerankedResults = rerankedScores.map((rs) => {
                const originalCandidate = candidates[rs.index];
                return {
                  ...originalCandidate,
                  score: rs.score, // Override with the highly accurate cross-encoder score
                };
              });

              // Sort by new score descending and slice to topK
              return rerankedResults
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map((r) => ({
                  id: r.id,
                  content: r.content,
                  score: r.score,
                  metadata: r.metadata,
                  sourceId: r.sourceId,
                }));
            }
          }
        }
      } catch (rerankError) {
        this.logger.warn(`Reranking failed, falling back to RRF fusion scores:`, rerankError);
      }

      // Fallback: Just return RRF topK results
      return candidates.slice(0, topK).map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata,
        sourceId: r.sourceId,
      }));
    } catch (error) {
      this.logger.error(`Search failed`, error);
      // Fallback if DB vector search fails
      return [];
    }
  }
}
