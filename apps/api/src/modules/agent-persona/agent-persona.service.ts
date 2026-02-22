
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class AgentPersonaService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        return this.prisma.agentPersona.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
    }

    async findOne(code: string) {
        const persona = await this.prisma.agentPersona.findUnique({
            where: { personaCode: code },
        });
        if (!persona) {
            throw new NotFoundException(`Persona ${code} not found`);
        }
        return persona;
    }

    async create(data: unknown) {
        return this.prisma.agentPersona.create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: data as any,
        });
    }
}
