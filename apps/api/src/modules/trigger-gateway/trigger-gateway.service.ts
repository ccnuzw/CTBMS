import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateTriggerConfigDto,
  UpdateTriggerConfigDto,
  FireTriggerConfigDto,
  TriggerConfigQueryDto,
  TriggerLogQueryDto,
  WorkflowTriggerType,
} from '@packages/types';
import { WorkflowTriggerTypeEnum } from '@packages/types';
import type { Prisma } from '@prisma/client';
import { WorkflowExecutionService } from '../workflow-execution/workflow-execution.service';

@Injectable()
export class TriggerGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
  ) {}

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

  async findAll(userId: string, query: TriggerConfigQueryDto) {
    const where: Prisma.TriggerConfigWhereInput = {
      createdByUserId: userId,
    };

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

  async findOne(userId: string, id: string) {
    const config = await this.prisma.triggerConfig.findFirst({
      where: { id, createdByUserId: userId },
    });
    if (!config) {
      throw new NotFoundException(`触发器配置不存在: ${id}`);
    }
    return config;
  }

  async update(userId: string, id: string, dto: UpdateTriggerConfigDto) {
    await this.findOne(userId, id);
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

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.triggerConfig.delete({ where: { id } });
    return { deleted: true };
  }

  async activate(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.triggerConfig.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async deactivate(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.triggerConfig.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async fire(userId: string, id: string, dto: FireTriggerConfigDto) {
    const config = await this.findOne(userId, id);
    const triggerType = this.normalizeTriggerType(config.triggerType);
    const startedAt = Date.now();
    const payload = this.mergeParamSnapshot(
      this.toRecord(config.paramOverrides),
      dto.paramSnapshot,
    );

    if (config.status !== 'ACTIVE') {
      const message = `触发器状态为 ${config.status}，已跳过触发`;
      await this.prisma.triggerLog.create({
        data: {
          triggerConfigId: config.id,
          triggerType: config.triggerType,
          status: 'SKIPPED',
          payload: this.toJsonValue({
            workflowDefinitionId: config.workflowDefinitionId,
            triggerType,
            workflowVersionId: dto.workflowVersionId ?? null,
            experimentId: dto.experimentId ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
            paramSnapshot: payload,
          }),
          errorMessage: message,
          durationMs: 0,
          triggeredAt: new Date(),
        },
      });
      throw new BadRequestException(message);
    }

    try {
      const execution = await this.workflowExecutionService.trigger(userId, {
        workflowDefinitionId: config.workflowDefinitionId,
        workflowVersionId: dto.workflowVersionId,
        experimentId: dto.experimentId,
        triggerType,
        idempotencyKey: dto.idempotencyKey,
        paramSnapshot: payload,
      });
      if (!execution) {
        throw new BadRequestException('触发执行未返回实例');
      }

      const durationMs = Date.now() - startedAt;
      const triggeredAt = new Date();
      const [log] = await Promise.all([
        this.prisma.triggerLog.create({
          data: {
            triggerConfigId: config.id,
            workflowExecutionId: execution.id,
            triggerType: config.triggerType,
            status: 'SUCCESS',
            payload: this.toJsonValue({
              workflowDefinitionId: config.workflowDefinitionId,
              workflowExecutionId: execution.id,
              triggerType,
              workflowVersionId: dto.workflowVersionId ?? null,
              experimentId: dto.experimentId ?? null,
              idempotencyKey: dto.idempotencyKey ?? null,
              paramSnapshot: payload,
            }),
            durationMs,
            triggeredAt,
          },
        }),
        this.prisma.triggerConfig.update({
          where: { id: config.id },
          data: { lastTriggeredAt: triggeredAt },
        }),
      ]);

      return {
        triggerConfigId: config.id,
        triggerLogId: log.id,
        workflowExecutionId: execution.id,
        executionStatus: execution.status,
        triggeredAt: log.triggeredAt,
        durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      const lowered = message.toLowerCase();
      const status =
        lowered.includes('timeout') || lowered.includes('超时') ? 'TIMEOUT' : 'FAILED';
      await this.prisma.triggerLog.create({
        data: {
          triggerConfigId: config.id,
          triggerType: config.triggerType,
          status,
          payload: this.toJsonValue({
            workflowDefinitionId: config.workflowDefinitionId,
            triggerType,
            workflowVersionId: dto.workflowVersionId ?? null,
            experimentId: dto.experimentId ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
            paramSnapshot: payload,
          }),
          errorMessage: message,
          durationMs,
          triggeredAt: new Date(),
        },
      });
      throw error;
    }
  }

  async findLogs(userId: string, query: TriggerLogQueryDto) {
    const where: Prisma.TriggerLogWhereInput = {};
    const configWhere: Prisma.TriggerConfigWhereInput = {
      createdByUserId: userId,
    };

    if (query.triggerConfigId) {
      configWhere.id = query.triggerConfigId;
    }
    where.triggerConfig = configWhere;
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

  async findLogsByConfigId(userId: string, configId: string, query: TriggerLogQueryDto) {
    return this.findLogs(userId, { ...query, triggerConfigId: configId });
  }

  private normalizeTriggerType(rawType: string): WorkflowTriggerType {
    const parsed = WorkflowTriggerTypeEnum.safeParse(rawType);
    if (parsed.success) {
      return parsed.data;
    }
    return 'ON_DEMAND';
  }

  private toRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private mergeParamSnapshot(
    configOverrides: Record<string, unknown> | undefined,
    runtimeParamSnapshot: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!configOverrides && !runtimeParamSnapshot) {
      return undefined;
    }
    return {
      ...(configOverrides ?? {}),
      ...(runtimeParamSnapshot ?? {}),
    };
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
