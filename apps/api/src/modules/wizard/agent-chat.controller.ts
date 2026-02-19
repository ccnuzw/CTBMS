import { Controller, Post, Body, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AIService } from '../ai/ai.service';
import { RagPipelineService } from '../knowledge/rag/rag-pipeline.service';

@Controller('agent')
export class AgentChatController {
    private readonly logger = new Logger(AgentChatController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiService: AIService,
        private readonly ragService: RagPipelineService
    ) { }

    @Post('chat')
    async chat(@Body() body: { agentId: string; message: string }) {
        const { agentId, message } = body;

        if (!agentId || !message) {
            throw new BadRequestException('agentId and message are required');
        }

        const agent = await this.prisma.agentProfile.findUnique({
            where: { id: agentId }
        });

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        // 1. Build System Prompt (Persona + Context)
        let systemPrompt = `You are an AI agent named "${agent.agentName}".
Role: ${agent.roleType}
Objective: ${agent.objective || 'Assist the user with their tasks.'}

Instructions:
- Answer clearly and concisely.
- If you have knowledge context, prefer using it to answer.
- If you don't know, admit it.
`;

        // 2. RAG Retrieval (Mock/Real)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolPolicy = agent.toolPolicy as Record<string, any>; // Keeping any for nested structure for now
        const hasKnowledge = toolPolicy?.knowledgeFiles?.length > 0;
        let ragContext = '';

        if (hasKnowledge) {
            try {
                // Search for relevant chunks
                const results = await this.ragService.search(message);
                if (results.length > 0) {
                    ragContext = results.map(r => `- ${r.content}`).join('\n');
                    systemPrompt += `\n\nRelevant Knowledge Context:\n${ragContext}\n`;
                }
            } catch (e) {
                this.logger.warn(`RAG Search failed: ${e}`);
            }
        }

        // 3. Call AI Service
        try {
            const responseText = await this.aiService.chat(
                systemPrompt,
                message,
                agent.modelConfigKey
            );

            return {
                response: responseText,
                agentId,
                timestamp: new Date(),
                metadata: {
                    usedKnowledge: !!ragContext,
                    model: agent.modelConfigKey
                }
            };
        } catch (error) {
            this.logger.error(`Chat failed for agent ${agentId}`, error);
            throw new BadRequestException('Failed to generate response. Please check configuration.');
        }
    }
}
