
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AgentFactoryService {
    constructor(private readonly prisma: PrismaService) { }

    async createAgentFromSession(sessionId: string) {
        const session = await this.prisma.wizardSession.findUnique({
            where: { id: sessionId },
        });

        if (!session) {
            throw new NotFoundException(`Session ${sessionId} not found`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (session.sessionData as Record<string, any>) || {};
        const { selectedPersona, apiKeys, files } = data;

        if (!selectedPersona) {
            throw new BadRequestException('Session is missing persona selection');
        }

        const persona = await this.prisma.agentPersona.findUnique({
            where: { personaCode: selectedPersona },
        });

        if (!persona) {
            throw new BadRequestException(`Persona ${selectedPersona} not found`);
        }

        // Generate unique code
        const agentCode = `AGENT_${Date.now()}`;

        // Default config from persona
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultConfig = (persona.defaultConfig as Record<string, any>) || {};

        // Construct Tool Policy (Connectors + Keys)
        const toolPolicy = {
            connectors: apiKeys || {},
            knowledgeFiles: files || []
        };

        // Create Agent Profile
        const agent = await this.prisma.agentProfile.create({
            data: {
                agentCode,
                agentName: `${persona.name} (Custom)`,
                roleType: persona.roleType,
                modelConfigKey: defaultConfig.modelConfigKey || 'gpt-4',
                agentPromptCode: defaultConfig.promptCode || 'DEFAULT_PROMPT',
                outputSchemaCode: defaultConfig.outputSchemaCode || 'DEFAULT_SCHEMA',
                ownerUserId: session.userId,
                toolPolicy: toolPolicy,
                isActive: true
            }
        });

        // Mark session as completed
        await this.prisma.wizardSession.update({
            where: { id: sessionId },
            data: { isCompleted: true }
        });

        return agent;
    }
}
