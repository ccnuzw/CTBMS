import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AgentProfileQueryDto,
  CreateAgentProfileDto,
  PublishAgentProfileDto,
  UpdateAgentProfileDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { OutputSchemaRegistryService } from './output-schema-registry.service';

@Injectable()
export class AgentProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outputSchemaRegistryService: OutputSchemaRegistryService,
  ) {}

  async create(ownerUserId: string, dto: CreateAgentProfileDto) {
    const existing = await this.prisma.agentProfile.findUnique({
      where: { agentCode: dto.agentCode },
    });
    if (existing) {
      throw new BadRequestException(`agentCode 已存在: ${dto.agentCode}`);
    }

    this.ensureOutputSchemaKnown(dto.outputSchemaCode);
    const created = await this.prisma.agentProfile.create({
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
    await this.createSnapshot(created, ownerUserId);
    return created;
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
    if (dto.outputSchemaCode) {
      this.ensureOutputSchemaKnown(dto.outputSchemaCode);
    }

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

    const updated = await this.prisma.agentProfile.update({
      where: { id },
      data,
    });
    await this.createSnapshot(updated, ownerUserId);
    return updated;
  }

  async publish(ownerUserId: string, id: string, _dto: PublishAgentProfileDto) {
    await this.ensureEditableProfile(ownerUserId, id);
    const updated = await this.prisma.agentProfile.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
      },
    });
    await this.createSnapshot(updated, ownerUserId);
    return updated;
  }

  async remove(ownerUserId: string, id: string) {
    await this.ensureEditableProfile(ownerUserId, id);
    return this.prisma.agentProfile.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getHistory(ownerUserId: string, id: string) {
    await this.findOne(ownerUserId, id);
    return this.prisma.agentProfileSnapshot.findMany({
      where: { profileId: id },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async rollback(ownerUserId: string, id: string, targetVersion: number) {
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
      throw new BadRequestException('targetVersion 必须是正整数');
    }
    const current = await this.ensureEditableProfile(ownerUserId, id);
    const snapshot = await this.prisma.agentProfileSnapshot.findFirst({
      where: { profileId: id, version: targetVersion },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) {
      throw new NotFoundException(`AgentProfile 版本快照不存在: v${targetVersion}`);
    }
    const data = snapshot.data as Record<string, unknown>;
    const outputSchemaCode = String(data.outputSchemaCode ?? current.outputSchemaCode);
    this.ensureOutputSchemaKnown(outputSchemaCode);

    const rolledBack = await this.prisma.agentProfile.update({
      where: { id },
      data: {
        agentName: String(data.agentName ?? current.agentName),
        roleType: String(data.roleType ?? current.roleType),
        objective: data.objective === null || data.objective === undefined
          ? null
          : String(data.objective),
        modelConfigKey: String(data.modelConfigKey ?? current.modelConfigKey),
        agentPromptCode: String(data.agentPromptCode ?? current.agentPromptCode),
        memoryPolicy: String(data.memoryPolicy ?? current.memoryPolicy),
        toolPolicy: this.toNullableJsonValue(data.toolPolicy),
        guardrails: this.toNullableJsonValue(data.guardrails),
        outputSchemaCode,
        timeoutMs: Number(data.timeoutMs ?? current.timeoutMs),
        retryPolicy: this.toNullableJsonValue(data.retryPolicy),
        isActive: Boolean(data.isActive ?? current.isActive),
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(rolledBack, ownerUserId);
    return rolledBack;
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

  private ensureOutputSchemaKnown(outputSchemaCode: string) {
    if (this.outputSchemaRegistryService.getSchema(outputSchemaCode)) {
      return;
    }
    throw new BadRequestException(`outputSchemaCode 不存在: ${outputSchemaCode}`);
  }

  private async createSnapshot(
    profile: Prisma.AgentProfileGetPayload<object>,
    userId?: string,
  ) {
    const data = JSON.parse(JSON.stringify(profile)) as Prisma.InputJsonValue;
    await this.prisma.agentProfileSnapshot.create({
      data: {
        profileId: profile.id,
        agentCode: profile.agentCode,
        version: profile.version,
        data,
        createdByUserId: userId || profile.ownerUserId || undefined,
      },
    });
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
