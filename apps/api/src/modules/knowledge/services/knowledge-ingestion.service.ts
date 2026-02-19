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

        if (activeConfig.provider === 'google') {
            return new GoogleGenerativeAIEmbeddings({
                modelName: activeConfig.embeddingModel || 'text-embedding-004',
                apiKey: apiKey,
            });
        }

        // Default to OpenAI
        const baseURL = activeConfig.apiUrl || undefined;
        return new OpenAIEmbeddings({
            modelName: activeConfig.embeddingModel || 'text-embedding-3-small',
            openAIApiKey: apiKey,
            configuration: { baseURL }
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

        try {
            const vectors = await embeddings.embedDocuments(texts);

            // 3. Store in database
            // We use $transaction/executeRaw because Prisma doesn't support 'vector' type in create() yet
            await this.prisma.$transaction(async (tx) => {
                // Clear existing vectors for this item (idempotency)
                await tx.knowledgeVector.deleteMany({
                    where: { knowledgeItemId }
                });

                for (let i = 0; i < docs.length; i++) {
                    const vector = vectors[i];
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
            this.logger.error(`Failed to ingest knowledge item ${knowledgeItemId}`, error);
            throw error;
        }
    }
}
