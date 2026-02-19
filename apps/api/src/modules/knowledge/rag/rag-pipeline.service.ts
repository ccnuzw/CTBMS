
import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter, reciprocalRankFusion } from './utils';

// Define the shape of a fused result item so TS doesn't complain
interface FusedResult {
    id: string;
    score: number;
    content?: string;
    metadata?: Record<string, unknown>;
}

interface MockDoc {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
}

@Injectable()
export class RagPipelineService {
    private readonly logger = new Logger(RagPipelineService.name);
    private splitter = new RecursiveCharacterTextSplitter(200, 20); // Small chunk size for POC

    // In-memory mock storage
    private chunks: MockDoc[] = [];

    /**
     * Ingest text (Simulating PDF parsing result)
     */
    public async ingest(documentId: string, text: string) {
        this.logger.log(`Ingesting document ${documentId}...`);

        // 1. Split
        const splits = this.splitter.splitText(text);

        // 2. Index (Mock)
        splits.forEach((split, index) => {
            this.chunks.push({
                id: `${documentId}_${index}`,
                content: split,
                metadata: { source: documentId, chunkIndex: index }
            });
        });

        this.logger.log(`Ingested ${splits.length} chunks.`);
        return { chunks: splits.length };
    }

    /**
     * Hybrid Search
     */
    public async search(query: string): Promise<FusedResult[]> {
        this.logger.log(`Searching for: ${query}`);

        // 1. Mock Keyword Search (Simple string inclusion)
        const keywordResults = this.chunks
            .filter(c => c.content.toLowerCase().includes(query.toLowerCase()))
            .map(c => ({ id: c.id, score: 1.0 })) // Default score for keyword match
            .slice(0, 5); // Start simple

        // 2. Mock Vector Search (Random + Semantic Bias Simulation)
        // In a real app, this calls Milvus. Here we just pick random chunks to simulate "vector recall"
        const vectorResults = this.chunks
            .map(c => ({ id: c.id, score: Math.random() })) // Random score
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        // 3. RRF Fusion
        // We need to format them as rank lists for RRF
        // RRF expects [ {id, score}, {id, score} ... ]

        // Let's create proper rank lists based on the slice
        const keywordRankList = keywordResults;
        const vectorRankList = vectorResults;

        const fusedResults = reciprocalRankFusion([keywordRankList, vectorRankList]);

        // Hydrate results with content
        return fusedResults.map(r => {
            const doc = this.chunks.find(c => c.id === r.id);
            return {
                id: r.id,
                score: r.score,
                content: doc?.content,
                metadata: doc?.metadata
            };
        });
    }
}
