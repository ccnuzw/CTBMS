import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateDecisionRuleDto,
  CreateDecisionRulePackDto,
  DecisionRulePackQueryDto,
  PublishDecisionRulePackDto,
  UpdateDecisionRuleDto,
  UpdateDecisionRulePackDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class DecisionRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async createPack(ownerUserId: string, dto: CreateDecisionRulePackDto) {
    const existing = await this.prisma.decisionRulePack.findUnique({
      where: { rulePackCode: dto.rulePackCode },
    });
    if (existing) {
      throw new BadRequestException(`rulePackCode 已存在: ${dto.rulePackCode}`);
    }

    return this.prisma.decisionRulePack.create({
      data: {
        rulePackCode: dto.rulePackCode,
        name: dto.name,
        description: dto.description ?? null,
        ownerUserId,
        templateSource: dto.templateSource,
        priority: dto.priority,
        rules: dto.rules?.length
          ? {
              create: dto.rules.map((rule) => ({
                ruleCode: rule.ruleCode,
                name: rule.name,
                description: rule.description ?? null,
                fieldPath: rule.fieldPath,
                operator: rule.operator,
                expectedValue: this.toNullableJsonValue(rule.expectedValue),
                weight: rule.weight,
                priority: rule.priority,
              })),
            }
          : undefined,
      },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async findAll(ownerUserId: string, query: DecisionRulePackQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildAccessibleWhere(ownerUserId, query);

    const [data, total] = await Promise.all([
      this.prisma.decisionRulePack.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.decisionRulePack.count({ where }),
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
    const pack = await this.prisma.decisionRulePack.findFirst({
      where: {
        id,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!pack) {
      throw new NotFoundException('规则包不存在或无权限访问');
    }
    return pack;
  }

  async updatePack(ownerUserId: string, id: string, dto: UpdateDecisionRulePackDto) {
    await this.ensureEditablePack(ownerUserId, id);
    return this.prisma.decisionRulePack.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
        priority: dto.priority,
      },
    });
  }

  async removePack(ownerUserId: string, id: string) {
    await this.ensureEditablePack(ownerUserId, id);
    return this.prisma.decisionRulePack.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async publishPack(ownerUserId: string, id: string, _dto: PublishDecisionRulePackDto) {
    await this.ensureEditablePack(ownerUserId, id);
    return this.prisma.decisionRulePack.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
      },
    });
  }

  async addRule(ownerUserId: string, packId: string, dto: CreateDecisionRuleDto) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: {
        rulePackId: packId,
        ruleCode: dto.ruleCode,
      },
    });

    if (existing) {
      throw new BadRequestException(`ruleCode 已存在: ${dto.ruleCode}`);
    }

    return this.prisma.decisionRule.create({
      data: {
        rulePackId: packId,
        ruleCode: dto.ruleCode,
        name: dto.name,
        description: dto.description ?? null,
        fieldPath: dto.fieldPath,
        operator: dto.operator,
        expectedValue: this.toNullableJsonValue(dto.expectedValue),
        weight: dto.weight,
        priority: dto.priority,
      },
    });
  }

  async updateRule(
    ownerUserId: string,
    packId: string,
    ruleId: string,
    dto: UpdateDecisionRuleDto,
  ) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: { id: ruleId, rulePackId: packId },
    });
    if (!existing) {
      throw new NotFoundException('规则不存在');
    }

    const data: Prisma.DecisionRuleUpdateInput = {
      name: dto.name,
      description: dto.description,
      fieldPath: dto.fieldPath,
      operator: dto.operator,
      weight: dto.weight,
      priority: dto.priority,
      isActive: dto.isActive,
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'expectedValue')) {
      data.expectedValue = this.toNullableJsonValue(dto.expectedValue);
    }

    return this.prisma.decisionRule.update({
      where: { id: ruleId },
      data,
    });
  }

  async removeRule(ownerUserId: string, packId: string, ruleId: string) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: { id: ruleId, rulePackId: packId },
    });
    if (!existing) {
      throw new NotFoundException('规则不存在');
    }

    return this.prisma.decisionRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });
  }

  private buildAccessibleWhere(
    ownerUserId: string,
    query: DecisionRulePackQueryDto,
  ): Prisma.DecisionRulePackWhereInput {
    const where: Prisma.DecisionRulePackWhereInput = {
      OR: query.includePublic ? [{ ownerUserId }, { templateSource: 'PUBLIC' }] : [{ ownerUserId }],
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.AND = [
        {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { rulePackCode: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async ensureEditablePack(ownerUserId: string, id: string) {
    const pack = await this.prisma.decisionRulePack.findFirst({
      where: {
        id,
        ownerUserId,
      },
    });
    if (!pack) {
      throw new NotFoundException('规则包不存在或无权限编辑');
    }
    return pack;
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
