import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateUserConfigBindingDto,
  UpdateUserConfigBindingDto,
  UserConfigBindingQueryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UserConfigBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateUserConfigBindingDto) {
    const metadata =
      dto.metadata === undefined ? undefined : (dto.metadata as Prisma.InputJsonValue);

    const existing = await this.prisma.userConfigBinding.findUnique({
      where: {
        userId_bindingType_targetId: {
          userId,
          bindingType: dto.bindingType,
          targetId: dto.targetId,
        },
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    const binding = await this.prisma.userConfigBinding.upsert({
      where: {
        userId_bindingType_targetId: {
          userId,
          bindingType: dto.bindingType,
          targetId: dto.targetId,
        },
      },
      update: {
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 100,
      },
      create: {
        userId,
        bindingType: dto.bindingType,
        targetId: dto.targetId,
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 100,
      },
    });

    await this.createEphemeralPolicyAuditIfNeeded({
      userId,
      action: existing ? 'UPSERT_UPDATE' : 'UPSERT_CREATE',
      targetId: dto.targetId,
      sourceBindingId: binding.id,
      beforeMetadata: existing?.metadata,
      afterMetadata: binding.metadata,
    });

    return binding;
  }

  async findMany(userId: string, query: UserConfigBindingQueryDto) {
    const where: Prisma.UserConfigBindingWhereInput = { userId };

    if (query.bindingType) {
      where.bindingType = query.bindingType;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { targetId: { contains: keyword, mode: 'insensitive' } },
        { targetCode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.userConfigBinding.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userConfigBinding.count({ where }),
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
    const binding = await this.prisma.userConfigBinding.findFirst({
      where: { id, userId },
    });
    if (!binding) {
      throw new NotFoundException('配置绑定不存在');
    }
    return binding;
  }

  async update(userId: string, id: string, dto: UpdateUserConfigBindingDto) {
    const existing = await this.findOne(userId, id);

    const metadata =
      dto.metadata === undefined ? undefined : (dto.metadata as Prisma.InputJsonValue);

    const binding = await this.prisma.userConfigBinding.update({
      where: { id },
      data: {
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive,
        priority: dto.priority,
      },
    });

    await this.createEphemeralPolicyAuditIfNeeded({
      userId,
      action: 'UPDATE',
      targetId: existing.targetId,
      sourceBindingId: binding.id,
      beforeMetadata: existing.metadata,
      afterMetadata: binding.metadata,
    });

    return binding;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.prisma.userConfigBinding.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private async createEphemeralPolicyAuditIfNeeded(input: {
    userId: string;
    action: 'UPSERT_CREATE' | 'UPSERT_UPDATE' | 'UPDATE';
    targetId: string;
    sourceBindingId: string;
    beforeMetadata: Prisma.JsonValue | null | undefined;
    afterMetadata: Prisma.JsonValue | null | undefined;
  }) {
    if (input.targetId !== 'agent-ephemeral-capability-policy-default') {
      return;
    }

    const before = this.toRecord(input.beforeMetadata);
    const after = this.toRecord(input.afterMetadata);
    const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );

    await this.prisma.userConfigBinding.create({
      data: {
        userId: input.userId,
        bindingType: 'AGENT_EPHEMERAL_POLICY_AUDIT',
        targetId: `agent-ephemeral-policy-audit-${Date.now()}-${randomUUID().slice(0, 8)}`,
        targetCode: input.sourceBindingId,
        metadata: {
          action: input.action,
          sourceBindingId: input.sourceBindingId,
          before,
          after,
          changedKeys,
          auditedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        isActive: true,
        priority: 9999,
      },
    });
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
