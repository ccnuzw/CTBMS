
import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeIngestionService } from '../services/knowledge-ingestion.service';
import { KnowledgeRetrievalService } from '../services/knowledge-retrieval.service';

@Injectable()
export class RagPipelineService {
    private readonly logger = new Logger(RagPipelineService.name);

    constructor(
        private ingestionService: KnowledgeIngestionService,
        private retrievalService: KnowledgeRetrievalService,
    ) { }

    /**
     * Ingest a document content into KnowledgeVector
     */
    public async ingest(knowledgeItemId: string, content: string, metadata?: Record<string, unknown>) {
        return this.ingestionService.ingest(knowledgeItemId, content, metadata);
    }

    /**
     * Hybrid Search
     */
    public async search(query: string, options?: { topK?: number; filters?: Record<string, unknown> }) {
        return this.retrievalService.search(query, options);
    }
}
