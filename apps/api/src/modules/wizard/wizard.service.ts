
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AgentPersonaService } from '../agent-persona/agent-persona.service';

@Injectable()
export class WizardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly personaService: AgentPersonaService,
    ) { }

    async createSession(userId: string, personaCode: string) {
        const persona = await this.personaService.findOne(personaCode);

        // Initialize session with persona defaults
        const initialData = {
            selectedPersona: persona.personaCode,
            ...((persona.defaultConfig as object) || {}),
        };

        return this.prisma.wizardSession.create({
            data: {
                userId,
                currentStep: 'personaSelection',
                sessionData: initialData,
            },
        });
    }

    async getSession(id: string) {
        const session = await this.prisma.wizardSession.findUnique({
            where: { id },
        });
        if (!session) {
            throw new NotFoundException(`Session ${id} not found`);
        }
        return session;
    }

    async updateSession(id: string, step: string, data: unknown) {
        const session = await this.prisma.wizardSession.findUnique({ where: { id } });
        if (!session) {
            throw new NotFoundException(`Session ${id} not found`);
        }

        const existingData = (session.sessionData as Record<string, unknown>) || {};
        const mergedData = { ...existingData, ...(data as Record<string, unknown>) };

        return this.prisma.wizardSession.update({
            where: { id },
            data: {
                currentStep: step,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                sessionData: mergedData as any,
            },
        });
    }
}
