import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ConfigService } from '../../config/config.service';
import { AIModelConfig } from '@prisma/client';

export interface IngestResult {
  requestedChunks: number;
  embeddedChunks: number;
  storedChunks: number;
  failedChunks: number;
  provider: string;
  modelName: string;
  vectorDimension: number;
  errorCode?: 'EMPTY_CONTENT' | 'EMBEDDING_FAILED' | 'DIMENSION_MISMATCH' | 'STORE_FAILED';
  errorMessage?: string;
}

@Injectable()
export class KnowledgeIngestionService {
  private readonly logger = new Logger(KnowledgeIngestionService.name);
  private splitter: RecursiveCharacterTextSplitter;
  private static readonly EXPECTED_VECTOR_DIMENSION = 1536;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 100,
    });
  }

  private resolveApiKey(config?: AIModelConfig | null): string {
    if (config?.apiKey) return config.apiKey;
    if (config?.apiKeyEnvVar) return process.env[config.apiKeyEnvVar] || '';
    return process.env.OPENAI_API_KEY || '';
  }

  /**
   * Get embeddings instance with resolved config
   */
  private async getEmbeddings(): Promise<{
    embeddings: OpenAIEmbeddings | GoogleGenerativeAIEmbeddings;
    provider: string;
    modelName: string;
  }> {
    const configs = await this.configService.getAllAIModelConfigs();
    // Prefer active config, prioritize specific provider if needed
    const activeConfig =
      configs.find((c) => c.isActive && c.configKey !== 'DEFAULT') ||
      (await this.configService.getDefaultAIConfig());

    if (!activeConfig) {
      // Fallback to Env if no config in DB
      if (process.env.GEMINI_API_KEY) {
        const modelName = 'text-embedding-004';
        return {
          provider: 'google',
          modelName,
          embeddings: new GoogleGenerativeAIEmbeddings({
            modelName: 'text-embedding-004',
            apiKey: process.env.GEMINI_API_KEY,
          }),
        };
      }
      if (process.env.OPENAI_API_KEY) {
        const modelName = 'text-embedding-3-small';
        return {
          provider: 'openai',
          modelName,
          embeddings: new OpenAIEmbeddings({
            modelName: 'text-embedding-3-small',
            openAIApiKey: process.env.OPENAI_API_KEY,
          }),
        };
      }
      throw new Error('No active AI Model Configuration found and no ENV keys');
    }

    const apiKey = this.resolveApiKey(activeConfig);
    if (!apiKey) {
      throw new Error(`No API Key found for config ${activeConfig.configKey}`);
    }

    this.logger.log(
      `Using AI Provider: ${activeConfig.provider}, Model: ${activeConfig.embeddingModel}`,
    );

    const baseURL = activeConfig.apiUrl || undefined;
    const modelName =
      activeConfig.embeddingModel ||
      (activeConfig.provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-small');

    // If BaseURL is present, assume OpenAI-compatible endpoint (e.g. sub2api, one-api)
    if (baseURL) {
      this.logger.log(`Using OpenAI-compatible endpoint: ${baseURL}`);
      return {
        provider: activeConfig.provider,
        modelName,
        embeddings: new OpenAIEmbeddings({
          modelName,
          openAIApiKey: apiKey,
          configuration: { baseURL },
        }),
      };
    }

    if (activeConfig.provider === 'google') {
      return {
        provider: activeConfig.provider,
        modelName,
        embeddings: new GoogleGenerativeAIEmbeddings({
          modelName,
          apiKey: apiKey,
        }),
      };
    }

    // Default to OpenAI (standard)
    return {
      provider: activeConfig.provider,
      modelName,
      embeddings: new OpenAIEmbeddings({
        modelName,
        openAIApiKey: apiKey,
      }),
    };
  }

  /**
   * Ingest a document content into KnowledgeVector
   */
  async ingest(
    knowledgeItemId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<IngestResult> {
    this.logger.log(`Starting ingestion for item: ${knowledgeItemId}`);

    if (!content.trim()) {
      return {
        requestedChunks: 0,
        embeddedChunks: 0,
        storedChunks: 0,
        failedChunks: 0,
        provider: 'unknown',
        modelName: 'unknown',
        vectorDimension: 0,
        errorCode: 'EMPTY_CONTENT',
        errorMessage: 'Content is empty',
      };
    }

    // Lazy load embeddings to ensure config is fresh
    const embeddingContext = await this.getEmbeddings();
    const { embeddings, provider, modelName } = embeddingContext;

    // 1. Split text into chunks
    const docs = await this.splitter.createDocuments([content]);
    this.logger.log(`Split into ${docs.length} chunks`);

    // 2. Generate embeddings for all chunks (in batches if needed)
    const texts = docs.map((d: { pageContent: string }) => d.pageContent);
    let vectors: number[][] = [];

    try {
      vectors = await embeddings.embedDocuments(texts);
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for ${knowledgeItemId}. Context: AI Service potentially unavailable.`,
        error,
      );
      return {
        requestedChunks: docs.length,
        embeddedChunks: 0,
        storedChunks: 0,
        failedChunks: docs.length,
        provider,
        modelName,
        vectorDimension: 0,
        errorCode: 'EMBEDDING_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }

    this.logger.log(`Generated ${vectors.length} vectors.`);

    if (vectors.length === 0) {
      this.logger.warn(`No vectors generated for ${knowledgeItemId}`);
      return {
        requestedChunks: docs.length,
        embeddedChunks: 0,
        storedChunks: 0,
        failedChunks: docs.length,
        provider,
        modelName,
        vectorDimension: 0,
        errorCode: 'EMBEDDING_FAILED',
        errorMessage: 'Embedding response returned no vectors',
      };
    }

    if (vectors.length !== docs.length) {
      this.logger.error(
        `Embedding size mismatch for ${knowledgeItemId}: docs=${docs.length}, vectors=${vectors.length}`,
      );
      return {
        requestedChunks: docs.length,
        embeddedChunks: vectors.length,
        storedChunks: 0,
        failedChunks: docs.length,
        provider,
        modelName,
        vectorDimension: vectors[0]?.length || 0,
        errorCode: 'DIMENSION_MISMATCH',
        errorMessage: `Vectors count mismatch: expected ${docs.length}, got ${vectors.length}`,
      };
    }

    const vectorDimension = vectors[0]?.length || 0;
    this.logger.log(`Vector 0 length: ${vectorDimension}`);

    const validRows: Array<{ chunkIndex: number; text: string; vector: number[] }> = [];
    let failedChunks = 0;

    for (let i = 0; i < docs.length; i++) {
      const vector = vectors[i];
      if (!vector || vector.length !== KnowledgeIngestionService.EXPECTED_VECTOR_DIMENSION) {
        failedChunks += 1;
        this.logger.warn(
          `Vector dimension mismatch for ${knowledgeItemId} chunk=${i}: expected=${KnowledgeIngestionService.EXPECTED_VECTOR_DIMENSION}, got=${vector?.length || 0}`,
        );
        continue;
      }

      validRows.push({
        chunkIndex: i,
        text: texts[i],
        vector,
      });
    }

    if (validRows.length === 0) {
      return {
        requestedChunks: docs.length,
        embeddedChunks: vectors.length,
        storedChunks: 0,
        failedChunks,
        provider,
        modelName,
        vectorDimension,
        errorCode: 'DIMENSION_MISMATCH',
        errorMessage: `No vectors matched expected dimension ${KnowledgeIngestionService.EXPECTED_VECTOR_DIMENSION}`,
      };
    }

    try {
      // 3. Store in database
      // We use $transaction/executeRaw because Prisma doesn't support 'vector' type in create() yet
      await this.prisma.$transaction(async (tx) => {
        // Clear existing vectors for this item (idempotency)
        // Use executeRaw for delete to avoid prisma type issues if schema is drift
        await tx.$executeRaw`DELETE FROM "KnowledgeVector" WHERE "knowledgeItemId" = ${knowledgeItemId}`;

        for (const row of validRows) {
          // Format vector as string for pgvector: '[0.1, 0.2, ...]'
          const vectorStr = `[${row.vector.join(',')}]`;

          await tx.$executeRaw`
                    INSERT INTO "KnowledgeVector" 
                    ("id", "knowledgeItemId", "chunkIndex", "content", "tokenCount", "embedding", "metadata", "createdAt")
                    VALUES (
                        gen_random_uuid(), 
                        ${knowledgeItemId}, 
                        ${row.chunkIndex}, 
                        ${row.text}, 
                        ${row.text.length}, 
                        ${vectorStr}::vector, 
                        ${metadata || {}}::jsonb, 
                        NOW()
                    );
                `;
        }
      });

      this.logger.log(
        `Successfully ingested ${validRows.length}/${docs.length} chunks for ${knowledgeItemId}`,
      );
      return {
        requestedChunks: docs.length,
        embeddedChunks: vectors.length,
        storedChunks: validRows.length,
        failedChunks,
        provider,
        modelName,
        vectorDimension,
      };
    } catch (error) {
      this.logger.error(`Failed to store vectors for ${knowledgeItemId}`, error);
      return {
        requestedChunks: docs.length,
        embeddedChunks: vectors.length,
        storedChunks: 0,
        failedChunks: docs.length,
        provider,
        modelName,
        vectorDimension,
        errorCode: 'STORE_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
