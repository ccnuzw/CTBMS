import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterScopeLevel,
  ParameterSetQueryDto,
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
  constructor(private readonly prisma: PrismaService) {}

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
}
