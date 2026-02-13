import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateTriggerConfigDto,
  UpdateTriggerConfigDto,
  TriggerConfigQueryDto,
  TriggerLogQueryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class TriggerGatewayService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTriggerConfigDto) {
    return this.prisma.triggerConfig.create({
      data: {
        workflowDefinitionId: dto.workflowDefinitionId,
        triggerType: dto.triggerType,
        name: dto.name,
        description: dto.description,
        cronConfig: dto.cronConfig
          ? (dto.cronConfig as Prisma.InputJsonValue)
          : undefined,
        apiConfig: dto.apiConfig
          ? (dto.apiConfig as Prisma.InputJsonValue)
          : undefined,
        eventConfig: dto.eventConfig
          ? (dto.eventConfig as Prisma.InputJsonValue)
          : undefined,
        paramOverrides: dto.paramOverrides
          ? (dto.paramOverrides as Prisma.InputJsonValue)
          : undefined,
        createdByUserId: userId,
      },
    });
  }

  async findAll(query: TriggerConfigQueryDto) {
    const where: Prisma.TriggerConfigWhereInput = {};

    if (query.workflowDefinitionId) {
      where.workflowDefinitionId = query.workflowDefinitionId;
    }
    if (query.triggerType) {
      where.triggerType = query.triggerType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.keyword) {
      where.name = { contains: query.keyword, mode: 'insensitive' };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.triggerConfig.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.triggerConfig.count({ where }),
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
    const config = await this.prisma.triggerConfig.findUnique({
      where: { id },
    });
    if (!config) {
      throw new NotFoundException(`触发器配置不存在: ${id}`);
    }
    return config;
  }

  async update(id: string, dto: UpdateTriggerConfigDto) {
    await this.findOne(id);
    return this.prisma.triggerConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.cronConfig !== undefined && {
          cronConfig: dto.cronConfig as Prisma.InputJsonValue,
        }),
        ...(dto.apiConfig !== undefined && {
          apiConfig: dto.apiConfig as Prisma.InputJsonValue,
        }),
        ...(dto.eventConfig !== undefined && {
          eventConfig: dto.eventConfig as Prisma.InputJsonValue,
        }),
        ...(dto.paramOverrides !== undefined && {
          paramOverrides: dto.paramOverrides as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.triggerConfig.delete({ where: { id } });
    return { deleted: true };
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.triggerConfig.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.triggerConfig.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async findLogs(query: TriggerLogQueryDto) {
    const where: Prisma.TriggerLogWhereInput = {};

    if (query.triggerConfigId) {
      where.triggerConfigId = query.triggerConfigId;
    }
    if (query.triggerType) {
      where.triggerType = query.triggerType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.triggeredAtFrom || query.triggeredAtTo) {
      where.triggeredAt = {};
      if (query.triggeredAtFrom) {
        (where.triggeredAt as Prisma.DateTimeFilter).gte = query.triggeredAtFrom;
      }
      if (query.triggeredAtTo) {
        (where.triggeredAt as Prisma.DateTimeFilter).lte = query.triggeredAtTo;
      }
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.triggerLog.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          triggerConfig: {
            select: { id: true, name: true, triggerType: true },
          },
        },
      }),
      this.prisma.triggerLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findLogsByConfigId(configId: string, query: TriggerLogQueryDto) {
    return this.findLogs({ ...query, triggerConfigId: configId });
  }
}
