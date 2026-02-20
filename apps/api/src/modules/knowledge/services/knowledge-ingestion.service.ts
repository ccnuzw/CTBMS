import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ConfigService } from '../../config/config.service';
import { AIModelConfig } from '@prisma/client';

@Injectable()
export class KnowledgeIngestionService {
    private readonly logger = new Logger(KnowledgeIngestionService.name);
    private splitter: RecursiveCharacterTextSplitter;

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
    private async getEmbeddings(): Promise<OpenAIEmbeddings | GoogleGenerativeAIEmbeddings> {
        const configs = await this.configService.getAllAIModelConfigs();
        // Prefer active config, prioritize specific provider if needed
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
            throw new Error(`No API Key found for config ${activeConfig.configKey}`);
        }

        this.logger.log(`Using AI Provider: ${activeConfig.provider}, Model: ${activeConfig.embeddingModel}`);

        const baseURL = activeConfig.apiUrl || undefined;

        // If BaseURL is present, assume OpenAI-compatible endpoint (e.g. sub2api, one-api)
        if (baseURL) {
            this.logger.log(`Using OpenAI-compatible endpoint: ${baseURL}`);
            return new OpenAIEmbeddings({
                modelName: activeConfig.embeddingModel || (activeConfig.provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-small'),
                openAIApiKey: apiKey,
                configuration: { baseURL }
            });
        }

        if (activeConfig.provider === 'google') {
            return new GoogleGenerativeAIEmbeddings({
                modelName: activeConfig.embeddingModel || 'text-embedding-004',
                apiKey: apiKey,
            });
        }

        // Default to OpenAI (standard)
        return new OpenAIEmbeddings({
            modelName: activeConfig.embeddingModel || 'text-embedding-3-small',
            openAIApiKey: apiKey,
        });
    }

    /**
     * Ingest a document content into KnowledgeVector
     */
    async ingest(knowledgeItemId: string, content: string, metadata?: Record<string, unknown>): Promise<number> {
        this.logger.log(`Starting ingestion for item: ${knowledgeItemId}`);

        // Lazy load embeddings to ensure config is fresh
        const embeddings = await this.getEmbeddings();

        // 1. Split text into chunks
        const docs = await this.splitter.createDocuments([content]);
        this.logger.log(`Split into ${docs.length} chunks`);

        // 2. Generate embeddings for all chunks (in batches if needed)
        const texts = docs.map((d: { pageContent: string }) => d.pageContent);
        let vectors: number[][] = [];

        try {
            vectors = await embeddings.embedDocuments(texts);
        } catch (error) {
            this.logger.error(`Failed to generate embeddings for ${knowledgeItemId}. Context: AI Service potentially unavailable.`, error);
            // Soft fail: return 0, do not block creation of the item itself
            return 0;
        }

        this.logger.log(`Generated ${vectors.length} vectors.`);

        if (vectors.length === 0) {
            this.logger.warn(`No vectors generated for ${knowledgeItemId}`);
            return 0;
        }

        if (vectors.length > 0) {
            this.logger.log(`Vector 0 length: ${vectors[0]?.length}`);
            // Validate vector dimension
            if (!vectors[0] || vectors[0].length === 0) {
                this.logger.warn(`Generated vector has 0 dimensions for ${knowledgeItemId}. Skipping vector storage.`);
                return 0;
            }
        }

        try {
            // 3. Store in database
            // We use $transaction/executeRaw because Prisma doesn't support 'vector' type in create() yet
            await this.prisma.$transaction(async (tx) => {
                // Clear existing vectors for this item (idempotency)
                // Use executeRaw for delete to avoid prisma type issues if schema is drift
                await tx.$executeRaw`DELETE FROM "KnowledgeVector" WHERE "knowledgeItemId" = ${knowledgeItemId}`;

                for (let i = 0; i < docs.length; i++) {
                    const vector = vectors[i];

                    // Double check vector validity
                    if (!vector || vector.length === 0) {
                        this.logger.warn(`Vector at index ${i} is empty, skipping.`);
                        continue;
                    }

                    const text = texts[i];
                    // Format vector as string for pgvector: '[0.1, 0.2, ...]'
                    const vectorStr = `[${vector.join(',')}]`;

                    await tx.$executeRaw`
                    INSERT INTO "KnowledgeVector" 
                    ("id", "knowledgeItemId", "chunkIndex", "content", "tokenCount", "embedding", "metadata", "createdAt")
                    VALUES (
                        gen_random_uuid(), 
                        ${knowledgeItemId}, 
                        ${i}, 
                        ${text}, 
                        ${text.length}, 
                        ${vectorStr}::vector, 
                        ${metadata || {}}::jsonb, 
                        NOW()
                    );
                `;
                }
            });

            this.logger.log(`Successfully ingested ${docs.length} chunks for ${knowledgeItemId}`);
            return docs.length;

        } catch (error) {
            this.logger.error(`Failed to store vectors for ${knowledgeItemId}`, error);
            // We do NOT rethrow here to allow the main transaction (if any parent) to decide, 
            // but since this is usually called after creation, we treat it as soft fail for the *sync* process.
            // If called within a transaction (unlikely given the injected service), catching here prevents rollback.
            // However, usually ingestion is triggered *after* creation.
            return 0;
        }
    }
}
