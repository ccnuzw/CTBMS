import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { NodeType, RelationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { PromptService } from '../../ai/prompt.service';

interface GraphStructure {
    nodes: {
        name: string;
        type: NodeType;
        code?: string;
        description?: string;
    }[];
    edges: {
        source: string; // name
        target: string; // name
        type: RelationType;
        weight?: number;
        description?: string;
    }[];
}

@Injectable()
export class KnowledgeExtractionService {
    private readonly logger = new Logger(KnowledgeExtractionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly configService: ConfigService,
        private readonly promptService: PromptService,
    ) { }

    /**
     * Run full extraction pipeline: Extract -> Merge -> Save
     */
    async processIntel(intelId: string, content: string): Promise<void> {
        try {
            this.logger.log(`Starting knowledge extraction for Intel ID: ${intelId}`);

            // 1. Extract raw nodes & edges using LLM
            const graphData = await this.extractGraphStruct(content);

            if (!graphData || (graphData.nodes.length === 0 && graphData.edges.length === 0)) {
                this.logger.warn(`No graph data extracted for Intel ID: ${intelId}`);
                return;
            }

            // 2. Save to database (Merge with existing nodes)
            await this.saveGraphData(intelId, graphData);

            this.logger.log(`Successfully extracted ${graphData.nodes.length} nodes and ${graphData.edges.length} edges for Intel ID: ${intelId}`);
        } catch (error) {
            this.logger.error(`Failed to process knowledge extraction for Intel ID: ${intelId}`, error);
            throw error;
        }
    }

    /**
     * Call LLM to extract entities and relationships
     */
    async extractGraphStruct(text: string): Promise<GraphStructure> {
        // If text is too short, skip
        if (!text || text.length < 50) return { nodes: [], edges: [] };

        // Truncate to avoid context limit (adjust based on model)
        const truncatedText = text.slice(0, 15000);

        // Try to load prompt from database
        let systemPrompt = 'You are a helpful assistant that extracts knowledge graph structures.';
        let userPrompt = `**Input Text:**\n${truncatedText}`;

        const template = await this.promptService.getRenderedPrompt('KNOWLEDGE_GRAPH_EXTRACTION', { content: truncatedText });
        if (template) {
            systemPrompt = template.system;
            userPrompt = template.user;
            this.logger.log('Using database prompt template for graph extraction');
        } else {
            this.logger.warn('Prompt template KNOWLEDGE_GRAPH_EXTRACTION not found, using fallback');
        }

        try {
            const response = await this.callLLM(userPrompt, systemPrompt);
            // Clean JSON string (remove potential Markdown blocks)
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanJson);

            // Basic validation
            if (!result.nodes || !Array.isArray(result.nodes)) result.nodes = [];
            if (!result.edges || !Array.isArray(result.edges)) result.edges = [];

            return result as GraphStructure;
        } catch (error) {
            this.logger.error('LLM Extraction Failed', error);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Save graph data to DB with merging logic
     */
    private async saveGraphData(intelId: string, graph: GraphStructure): Promise<void> {

        // 1. Upsert Nodes
        // We Map node names to their IDs to build edges later
        const nodeNameMap = new Map<string, string>(); // Name -> UUID

        for (const node of graph.nodes) {
            // Normalize name: trim and lowercase for matching (though we save original case preference if needed)
            // Ideally we should have a canonical name service, but for now exact match on name.
            const name = node.name.trim();

            // Try to find existing node
            let dbNode = await this.prisma.knowledgeNode.findFirst({
                where: { name: name, type: node.type }
            });

            if (!dbNode) {
                // Create new
                const typeEnumValue = NodeType[node.type as keyof typeof NodeType] || NodeType.CONCEPT;
                dbNode = await this.prisma.knowledgeNode.create({
                    data: {
                        name: name,
                        type: typeEnumValue,
                        description: node.description
                    }
                });
            }

            nodeNameMap.set(name, dbNode.id);
        }

        // 2. Create Edges
        for (const edge of graph.edges) {
            const sourceId = nodeNameMap.get(edge.source.trim());
            const targetId = nodeNameMap.get(edge.target.trim());

            if (sourceId && targetId && sourceId !== targetId) {
                const typeEnumValue = RelationType[edge.type as keyof typeof RelationType] || RelationType.MENTIONS;

                // Check if edge exists to avoid duplicates (optional, or upgrade weight)
                // For simplicity, we allow multiple edges if they are from different Intel, but here we just create.
                // Or we can simple create. Graph databases often allow multi-edges.
                // Let's create a new edge linking this specific Intel source.

                await this.prisma.knowledgeEdge.create({
                    data: {
                        sourceId,
                        targetId,
                        type: typeEnumValue,
                        weight: edge.weight || 1.0,
                        sourceIntelId: intelId
                    }
                });
            }
        }
    }

    private async callLLM(prompt: string, customSystemPrompt?: string): Promise<string> {
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

        const systemPrompt = customSystemPrompt || "You are a helpful assistant that extracts knowledge graph structures.";
        return await provider.generateResponse(systemPrompt, prompt, options);
    }
}
