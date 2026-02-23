import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';

@Injectable()
export class AgentSkillService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(where: Prisma.AgentSkillWhereInput, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.agentSkill.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.agentSkill.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const skill = await this.prisma.agentSkill.findUnique({
      where: { id },
    });
    if (!skill) throw new NotFoundException(`AgentSkill not found: ${id}`);
    return skill;
  }

  async toggleActive(id: string): Promise<unknown> {
    const skill = await this.findOne(id);
    return this.prisma.agentSkill.update({
      where: { id },
      data: { isActive: !skill.isActive },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ): Promise<unknown> {
    await this.findOne(id); // validate existence
    return this.prisma.agentSkill.update({
      where: { id },
      data,
    });
  }
}
