import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AgentProfileQueryDto,
  CreateAgentProfileDto,
  PublishAgentProfileDto,
  UpdateAgentProfileDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class AgentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerUserId: string, dto: CreateAgentProfileDto) {
    const existing = await this.prisma.agentProfile.findUnique({
      where: { agentCode: dto.agentCode },
    });
    if (existing) {
      throw new BadRequestException(`agentCode 已存在: ${dto.agentCode}`);
    }

    return this.prisma.agentProfile.create({
      data: {
        agentCode: dto.agentCode,
        agentName: dto.agentName,
        roleType: dto.roleType,
        objective: dto.objective ?? null,
        modelConfigKey: dto.modelConfigKey,
        agentPromptCode: dto.agentPromptCode,
        memoryPolicy: dto.memoryPolicy,
        toolPolicy: this.toNullableJsonValue(dto.toolPolicy),
        guardrails: this.toNullableJsonValue(dto.guardrails),
        outputSchemaCode: dto.outputSchemaCode,
        timeoutMs: dto.timeoutMs,
        retryPolicy: this.toNullableJsonValue(dto.retryPolicy),
        ownerUserId,
        templateSource: dto.templateSource,
      },
    });
  }

  async findAll(ownerUserId: string, query: AgentProfileQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildAccessibleWhere(ownerUserId, query);

    const [data, total] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.agentProfile.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(ownerUserId: string, id: string) {
    const profile = await this.prisma.agentProfile.findFirst({
      where: {
        id,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
    });

    if (!profile) {
      throw new NotFoundException('Agent 配置不存在或无权限访问');
    }
    return profile;
  }

  async update(ownerUserId: string, id: string, dto: UpdateAgentProfileDto) {
    await this.ensureEditableProfile(ownerUserId, id);

    const data: Prisma.AgentProfileUpdateInput = {
      agentName: dto.agentName,
      roleType: dto.roleType,
      objective: dto.objective,
      modelConfigKey: dto.modelConfigKey,
      agentPromptCode: dto.agentPromptCode,
      memoryPolicy: dto.memoryPolicy,
      outputSchemaCode: dto.outputSchemaCode,
      timeoutMs: dto.timeoutMs,
      isActive: dto.isActive,
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'toolPolicy')) {
      data.toolPolicy = this.toNullableJsonValue(dto.toolPolicy);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'guardrails')) {
      data.guardrails = this.toNullableJsonValue(dto.guardrails);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'retryPolicy')) {
      data.retryPolicy = this.toNullableJsonValue(dto.retryPolicy);
    }

    return this.prisma.agentProfile.update({
      where: { id },
      data,
    });
  }

  async publish(ownerUserId: string, id: string, _dto: PublishAgentProfileDto) {
    await this.ensureEditableProfile(ownerUserId, id);
    return this.prisma.agentProfile.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
      },
    });
  }

  async remove(ownerUserId: string, id: string) {
    await this.ensureEditableProfile(ownerUserId, id);
    return this.prisma.agentProfile.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildAccessibleWhere(
    ownerUserId: string,
    query: AgentProfileQueryDto,
  ): Prisma.AgentProfileWhereInput {
    const where: Prisma.AgentProfileWhereInput = {
      OR: query.includePublic ? [{ ownerUserId }, { templateSource: 'PUBLIC' }] : [{ ownerUserId }],
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.roleType) {
      where.roleType = query.roleType;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.AND = [
        {
          OR: [
            { agentName: { contains: keyword, mode: 'insensitive' } },
            { agentCode: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async ensureEditableProfile(ownerUserId: string, id: string) {
    const profile = await this.prisma.agentProfile.findFirst({
      where: {
        id,
        ownerUserId,
      },
    });
    if (!profile) {
      throw new NotFoundException('Agent 配置不存在或无权限编辑');
    }
    return profile;
  }

  private toNullableJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
