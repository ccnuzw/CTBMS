import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { KnowledgeRetrievalService } from "../../knowledge/services/knowledge-retrieval.service";
import { Injectable } from "@nestjs/common";

const KnowledgeBaseToolSchema = z.object({
    query: z.string().describe("The search query string"),
    topK: z.number().optional().describe("Number of results to return (default: 5)"),
    useQueryExpansion: z.boolean().optional(),
    filters: z.any().optional().describe("Metadata filters: { timeRange: { start, end }, category, sourceType }"),
});

@Injectable()
export class KnowledgeBaseTool {
    constructor(private readonly retrievalService: KnowledgeRetrievalService) { }

    public createTool() {
        return new DynamicStructuredTool({
            name: "knowledge_base_search",
            description: "Search the internal knowledge base for documents, market reports, and intelligence. Use this tool when you need to find specific information stored in the system.",
            // detailed description: https://github.com/langchain-ai/langchainjs/issues/4343
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: KnowledgeBaseToolSchema as any,
            func: async (input: z.infer<typeof KnowledgeBaseToolSchema>) => {
                const { query, topK, useQueryExpansion, filters } = input;
                try {
                    // Convert string dates to Date objects if present
                    const serviceFilters: { timeRange?: { start?: Date; end?: Date };[key: string]: unknown } = { ...(filters || {}) };
                    if (filters?.timeRange) {
                        serviceFilters.timeRange = {};
                        if (filters.timeRange.start) serviceFilters.timeRange.start = new Date(filters.timeRange.start);
                        if (filters.timeRange.end) serviceFilters.timeRange.end = new Date(filters.timeRange.end);
                    }

                    const results = await this.retrievalService.search(query, {
                        topK,
                        useQueryExpansion,
                        filters: serviceFilters
                    });

                    if (results.length === 0) {
                        return "No relevant documents found in the knowledge base.";
                    }
                    return JSON.stringify(results.map(r => ({
                        content: r.content,
                        score: r.score,
                        metadata: r.metadata
                    })), null, 2);
                } catch (error) {
                    return `Error searching knowledge base: ${error instanceof Error ? error.message : String(error)}`;
                }
            },
        });
    }
}
