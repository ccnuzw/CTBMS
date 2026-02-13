import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BatchResetParameterItemsDto,
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterChangeLogQueryDto,
  ParameterScopeLevel,
  ParameterSetQueryDto,
  PublishParameterSetDto,
  ResolveParameterSetDto,
  UpdateParameterItemDto,
  UpdateParameterSetDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

const PARAM_SCOPE_PRIORITY: ParameterScopeLevel[] = [
  'PUBLIC_TEMPLATE',
  'USER_TEMPLATE',
  'GLOBAL',
  'COMMODITY',
  'REGION',
  'ROUTE',
  'STRATEGY',
  'SESSION',
];

@Injectable()
export class ParameterCenterService {
  constructor(private readonly prisma: PrismaService) { }

  async createSet(ownerUserId: string, dto: CreateParameterSetDto) {
    const existing = await this.prisma.parameterSet.findUnique({
      where: { setCode: dto.setCode },
    });
    if (existing) {
      throw new BadRequestException(`setCode 已存在: ${dto.setCode}`);
    }

    return this.prisma.parameterSet.create({
      data: {
        setCode: dto.setCode,
        name: dto.name,
        description: dto.description ?? null,
        ownerUserId,
        templateSource: dto.templateSource,
      },
    });
  }

  async findAll(ownerUserId: string, query: ParameterSetQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildAccessibleWhere(ownerUserId, query);

    const [data, total] = await Promise.all([
      this.prisma.parameterSet.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.parameterSet.count({ where }),
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
    const set = await this.prisma.parameterSet.findFirst({
      where: {
        id,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ updatedAt: 'desc' }],
        },
      },
    });
    if (!set) {
      throw new NotFoundException('参数包不存在或无权限访问');
    }
    return set;
  }

  async updateSet(ownerUserId: string, id: string, dto: UpdateParameterSetDto) {
    await this.ensureEditableSet(ownerUserId, id);
    return this.prisma.parameterSet.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
    });
  }

  async removeSet(ownerUserId: string, id: string) {
    await this.ensureEditableSet(ownerUserId, id);
    return this.prisma.parameterSet.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async publishSet(ownerUserId: string, id: string, _dto: PublishParameterSetDto) {
    await this.ensureEditableSet(ownerUserId, id);
    return this.prisma.parameterSet.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
      },
    });
  }

  async addItem(ownerUserId: string, setId: string, dto: CreateParameterItemDto) {
    await this.ensureEditableSet(ownerUserId, setId);
    const existing = await this.prisma.parameterItem.findFirst({
      where: {
        parameterSetId: setId,
        paramCode: dto.paramCode,
      },
    });
    if (existing) {
      throw new BadRequestException(`paramCode 已存在: ${dto.paramCode}`);
    }

    this.validateTimeRange(dto.effectiveFrom, dto.effectiveTo);

    return this.prisma.parameterItem.create({
      data: {
        parameterSetId: setId,
        paramCode: dto.paramCode,
        paramName: dto.paramName,
        paramType: dto.paramType,
        unit: dto.unit ?? null,
        value: this.toNullableJsonValue(dto.value),
        defaultValue: this.toNullableJsonValue(dto.defaultValue),
        minValue: this.toNullableJsonValue(dto.minValue),
        maxValue: this.toNullableJsonValue(dto.maxValue),
        scopeLevel: dto.scopeLevel,
        scopeValue: dto.scopeValue ?? null,
        source: dto.source ?? null,
        changeReason: dto.changeReason ?? null,
        effectiveFrom: dto.effectiveFrom ?? null,
        effectiveTo: dto.effectiveTo ?? null,
      },
    });
  }

  async updateItem(
    ownerUserId: string,
    setId: string,
    itemId: string,
    dto: UpdateParameterItemDto,
  ) {
    await this.ensureEditableSet(ownerUserId, setId);
    const existing = await this.prisma.parameterItem.findFirst({
      where: {
        id: itemId,
        parameterSetId: setId,
      },
    });
    if (!existing) {
      throw new NotFoundException('参数项不存在');
    }

    this.validateTimeRange(dto.effectiveFrom, dto.effectiveTo);

    const data: Prisma.ParameterItemUpdateInput = {
      paramCode: dto.paramCode,
      paramName: dto.paramName,
      paramType: dto.paramType,
      unit: dto.unit,
      scopeLevel: dto.scopeLevel,
      scopeValue: dto.scopeValue,
      source: dto.source,
      changeReason: dto.changeReason,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      isActive: dto.isActive,
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'value')) {
      data.value = this.toNullableJsonValue(dto.value);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'defaultValue')) {
      data.defaultValue = this.toNullableJsonValue(dto.defaultValue);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'minValue')) {
      data.minValue = this.toNullableJsonValue(dto.minValue);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'maxValue')) {
      data.maxValue = this.toNullableJsonValue(dto.maxValue);
    }

    return this.prisma.parameterItem.update({
      where: { id: itemId },
      data,
    });
  }

  async removeItem(ownerUserId: string, setId: string, itemId: string) {
    await this.ensureEditableSet(ownerUserId, setId);
    const existing = await this.prisma.parameterItem.findFirst({
      where: {
        id: itemId,
        parameterSetId: setId,
      },
    });
    if (!existing) {
      throw new NotFoundException('参数项不存在');
    }

    return this.prisma.parameterItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }

  async resolve(ownerUserId: string, setId: string, dto: ResolveParameterSetDto) {
    const set = await this.findOne(ownerUserId, setId);
    const items = set.items.filter((item) =>
      this.matchScope(item.scopeLevel, item.scopeValue, dto),
    );

    items.sort((a, b) => {
      const left = PARAM_SCOPE_PRIORITY.indexOf(a.scopeLevel as ParameterScopeLevel);
      const right = PARAM_SCOPE_PRIORITY.indexOf(b.scopeLevel as ParameterScopeLevel);
      if (left !== right) {
        return left - right;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const resolvedMap = new Map<string, { value: unknown; sourceScope: string }>();
    for (const item of items) {
      const value = item.value ?? item.defaultValue ?? null;
      resolvedMap.set(item.paramCode, {
        value,
        sourceScope: item.scopeLevel,
      });
    }

    const sessionOverrides = dto.sessionOverrides ?? {};
    for (const [paramCode, value] of Object.entries(sessionOverrides)) {
      resolvedMap.set(paramCode, {
        value,
        sourceScope: 'SESSION',
      });
    }

    return {
      parameterSetId: set.id,
      resolved: [...resolvedMap.entries()].map(([paramCode, value]) => ({
        paramCode,
        value: value.value,
        sourceScope: value.sourceScope,
      })),
    };
  }

  private buildAccessibleWhere(
    ownerUserId: string,
    query: ParameterSetQueryDto,
  ): Prisma.ParameterSetWhereInput {
    const where: Prisma.ParameterSetWhereInput = {
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
            { setCode: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }
    return where;
  }

  private async ensureEditableSet(ownerUserId: string, id: string) {
    const set = await this.prisma.parameterSet.findFirst({
      where: {
        id,
        ownerUserId,
      },
    });
    if (!set) {
      throw new NotFoundException('参数包不存在或无权限编辑');
    }
    return set;
  }

  private matchScope(
    scopeLevel: string,
    scopeValue: string | null,
    dto: ResolveParameterSetDto,
  ): boolean {
    switch (scopeLevel) {
      case 'PUBLIC_TEMPLATE':
      case 'USER_TEMPLATE':
      case 'GLOBAL':
        return true;
      case 'COMMODITY':
        return Boolean(dto.commodity && scopeValue === dto.commodity);
      case 'REGION':
        return Boolean(dto.region && scopeValue === dto.region);
      case 'ROUTE':
        return Boolean(dto.route && scopeValue === dto.route);
      case 'STRATEGY':
        return Boolean(dto.strategy && scopeValue === dto.strategy);
      case 'SESSION':
        return false;
      default:
        return false;
    }
  }

  private validateTimeRange(effectiveFrom?: Date, effectiveTo?: Date) {
    if (effectiveFrom && effectiveTo && effectiveFrom.getTime() > effectiveTo.getTime()) {
      throw new BadRequestException('effectiveFrom 不能晚于 effectiveTo');
    }
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

  // ── 参数变更审计 ──

  async getChangeLogs(ownerUserId: string, setId: string, query: ParameterChangeLogQueryDto) {
    await this.findOne(ownerUserId, setId);

    const where: Prisma.ParameterChangeLogWhereInput = {
      parameterSetId: setId,
    };

    if (query.parameterItemId) {
      where.parameterItemId = query.parameterItemId;
    }
    if (query.operation) {
      where.operation = query.operation;
    }
    if (query.changedByUserId) {
      where.changedByUserId = query.changedByUserId;
    }
    if (query.createdAtFrom || query.createdAtTo) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = query.createdAtFrom;
      }
      if (query.createdAtTo) {
        (where.createdAt as Prisma.DateTimeFilter).lte = query.createdAtTo;
      }
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const [data, total] = await Promise.all([
      this.prisma.parameterChangeLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.parameterChangeLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private async recordChangeLog(
    parameterSetId: string,
    changedByUserId: string,
    operation: string,
    extra?: {
      parameterItemId?: string;
      fieldPath?: string;
      oldValue?: unknown;
      newValue?: unknown;
      changeReason?: string;
    },
  ) {
    await this.prisma.parameterChangeLog.create({
      data: {
        parameterSetId,
        parameterItemId: extra?.parameterItemId ?? null,
        operation,
        fieldPath: extra?.fieldPath ?? null,
        oldValue: extra?.oldValue !== undefined
          ? (JSON.parse(JSON.stringify(extra.oldValue)) as Prisma.InputJsonValue)
          : undefined,
        newValue: extra?.newValue !== undefined
          ? (JSON.parse(JSON.stringify(extra.newValue)) as Prisma.InputJsonValue)
          : undefined,
        changeReason: extra?.changeReason ?? null,
        changedByUserId,
      },
    });
  }

  // ── 覆盖 Diff ──

  async getOverrideDiff(ownerUserId: string, setId: string) {
    const set = await this.findOne(ownerUserId, setId);
    const items = set.items;

    const diffItems = items.map((item) => {
      const hasDefault = item.defaultValue !== null && item.defaultValue !== undefined;
      const hasValue = item.value !== null && item.value !== undefined;
      const isOverridden = hasDefault && hasValue &&
        JSON.stringify(item.value) !== JSON.stringify(item.defaultValue);

      return {
        paramCode: item.paramCode,
        paramName: item.paramName,
        scopeLevel: item.scopeLevel,
        templateDefault: item.defaultValue,
        currentValue: item.value,
        isOverridden,
        overrideSource: item.source ?? null,
      };
    });

    return {
      parameterSetId: setId,
      items: diffItems,
      overriddenCount: diffItems.filter((d) => d.isOverridden).length,
      totalCount: diffItems.length,
    };
  }

  // ── 单项重置到默认值 ──

  async resetItemToDefault(ownerUserId: string, setId: string, itemId: string) {
    await this.ensureEditableSet(ownerUserId, setId);
    const item = await this.prisma.parameterItem.findFirst({
      where: { id: itemId, parameterSetId: setId },
    });
    if (!item) {
      throw new NotFoundException('参数项不存在');
    }
    if (item.defaultValue === null) {
      throw new BadRequestException('该参数项没有默认值，无法重置');
    }

    const oldValue = item.value;
    const updated = await this.prisma.parameterItem.update({
      where: { id: itemId },
      data: {
        value: item.defaultValue,
        changeReason: '重置到模板默认值',
      },
    });

    await this.recordChangeLog(setId, ownerUserId, 'RESET_TO_DEFAULT', {
      parameterItemId: itemId,
      fieldPath: 'value',
      oldValue,
      newValue: item.defaultValue,
      changeReason: '重置到模板默认值',
    });

    return updated;
  }

  // ── 批量重置 ──

  async batchResetToDefault(ownerUserId: string, setId: string, dto: BatchResetParameterItemsDto) {
    await this.ensureEditableSet(ownerUserId, setId);

    const items = await this.prisma.parameterItem.findMany({
      where: {
        id: { in: dto.itemIds },
        parameterSetId: setId,
        defaultValue: { not: Prisma.JsonNull },
      },
    });

    if (items.length === 0) {
      throw new BadRequestException('没有可重置的参数项');
    }

    const results = await Promise.all(
      items.map(async (item) => {
        const oldValue = item.value;
        const updated = await this.prisma.parameterItem.update({
          where: { id: item.id },
          data: {
            value: this.toNullableJsonValue(item.defaultValue),
            changeReason: dto.reason || '批量重置到模板默认值',
          },
        });

        await this.recordChangeLog(setId, ownerUserId, 'BATCH_RESET', {
          parameterItemId: item.id,
          fieldPath: 'value',
          oldValue,
          newValue: item.defaultValue,
          changeReason: dto.reason || '批量重置到模板默认值',
        });

        return updated;
      }),
    );

    return { resetCount: results.length };
  }
}
