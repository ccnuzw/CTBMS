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

    const created = await this.prisma.parameterSet.create({
      data: {
        setCode: dto.setCode,
        name: dto.name,
        description: dto.description ?? null,
        ownerUserId,
        templateSource: dto.templateSource,
      },
    });
    await this.recordChangeLog(created.id, ownerUserId, 'CREATE', {
      fieldPath: 'parameter-set',
      newValue: created,
      changeReason: '创建参数包',
    });
    return created;
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
    const updated = await this.prisma.parameterSet.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
    });
    await this.recordChangeLog(id, ownerUserId, 'UPDATE', {
      fieldPath: 'parameter-set',
      newValue: updated,
      changeReason: '更新参数包',
    });
    return updated;
  }

  async removeSet(ownerUserId: string, id: string) {
    await this.ensureEditableSet(ownerUserId, id);
    const removed = await this.prisma.parameterSet.update({
      where: { id },
      data: { isActive: false },
    });
    await this.recordChangeLog(id, ownerUserId, 'DELETE', {
      fieldPath: 'parameter-set',
      newValue: removed,
      changeReason: '停用参数包',
    });
    return removed;
  }

  async publishSet(ownerUserId: string, id: string, dto: PublishParameterSetDto) {
    await this.ensureEditableSet(ownerUserId, id);
    await this.validateSetBeforePublish(id);
    const updated = await this.prisma.parameterSet.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
      },
    });
    await this.recordChangeLog(id, ownerUserId, 'PUBLISH', {
      fieldPath: 'parameter-set.version',
      oldValue: updated.version - 1,
      newValue: updated.version,
      changeReason: dto.comment ?? '发布参数包',
    });
    return updated;
  }

  async addItem(ownerUserId: string, setId: string, dto: CreateParameterItemDto) {
    const editableSet = await this.ensureEditableSet(ownerUserId, setId);
    const existing = await this.prisma.parameterItem.findFirst({
      where: {
        parameterSetId: setId,
        paramCode: dto.paramCode,
        scopeLevel: dto.scopeLevel,
        scopeValue: dto.scopeValue ?? null,
      },
    });
    if (existing) {
      throw new BadRequestException(`参数项已存在: ${dto.paramCode} @ ${dto.scopeLevel}`);
    }

    this.validateTimeRange(dto.effectiveFrom, dto.effectiveTo);
    this.validateUnitRule(dto.paramType, dto.unit);
    this.validateParameterValueType(dto.paramType, dto.value, dto.defaultValue, dto.minValue, dto.maxValue);
    this.validateValueRange(dto.value, dto.minValue, dto.maxValue, dto.paramType);
    await this.validateExpressionDependencies(setId, dto.paramCode, dto.paramType, dto.value);
    const reason = dto.changeReason?.trim() || '创建参数项';

    const created = await this.prisma.parameterItem.create({
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
        inheritedFrom: dto.inheritedFrom ?? null,
        source: dto.source ?? null,
        changeReason: reason,
        ownerType: dto.ownerType ?? this.inferOwnerType(editableSet.templateSource),
        ownerUserId: dto.ownerUserId ?? editableSet.ownerUserId ?? ownerUserId,
        itemSource: dto.itemSource ?? editableSet.templateSource,
        effectiveFrom: dto.effectiveFrom ?? null,
        effectiveTo: dto.effectiveTo ?? null,
      },
    });
    await this.recordChangeLog(setId, ownerUserId, 'CREATE', {
      parameterItemId: created.id,
      fieldPath: 'parameter-item',
      newValue: created,
      changeReason: reason,
    });
    return created;
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
    if (dto.paramType || Object.prototype.hasOwnProperty.call(dto, 'value')) {
      const effectiveType = dto.paramType ?? existing.paramType;
      const effectiveValue = Object.prototype.hasOwnProperty.call(dto, 'value') ? dto.value : existing.value;
      const effectiveDefault = Object.prototype.hasOwnProperty.call(dto, 'defaultValue')
        ? dto.defaultValue
        : existing.defaultValue;
      const effectiveMin = Object.prototype.hasOwnProperty.call(dto, 'minValue')
        ? dto.minValue
        : existing.minValue;
      const effectiveMax = Object.prototype.hasOwnProperty.call(dto, 'maxValue')
        ? dto.maxValue
        : existing.maxValue;
      this.validateParameterValueType(
        effectiveType,
        effectiveValue,
        effectiveDefault,
        effectiveMin,
        effectiveMax,
      );
      this.validateUnitRule(effectiveType, dto.unit ?? existing.unit ?? null);
      await this.validateExpressionDependencies(setId, existing.paramCode, effectiveType, effectiveValue);
    }

    // Validate value range if any of value, min, max is updated or if value is updated and min/max exist
    const newValue = Object.prototype.hasOwnProperty.call(dto, 'value') ? dto.value : existing.value;
    const newMin = Object.prototype.hasOwnProperty.call(dto, 'minValue') ? dto.minValue : existing.minValue;
    const newMax = Object.prototype.hasOwnProperty.call(dto, 'maxValue') ? dto.maxValue : existing.maxValue;
    // We only validate if value is not null/undefined (or we might want to validate default too?)
    // For now, let's validate 'value' if it exists.
    this.validateValueRange(newValue, newMin, newMax, dto.paramType || existing.paramType);

    const reason = dto.changeReason?.trim() || '更新参数项';
    const nextScopeLevel = dto.scopeLevel ?? existing.scopeLevel;
    const nextScopeValue = Object.prototype.hasOwnProperty.call(dto, 'scopeValue')
      ? (dto.scopeValue ?? null)
      : existing.scopeValue;
    const nextParamCode = dto.paramCode ?? existing.paramCode;
    const conflict = await this.prisma.parameterItem.findFirst({
      where: {
        parameterSetId: setId,
        paramCode: nextParamCode,
        scopeLevel: nextScopeLevel,
        scopeValue: nextScopeValue,
        id: { not: itemId },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new BadRequestException(`参数项冲突: ${nextParamCode} @ ${nextScopeLevel}`);
    }

    const data: Prisma.ParameterItemUpdateInput = {
      paramCode: dto.paramCode,
      paramName: dto.paramName,
      paramType: dto.paramType,
      unit: dto.unit,
      scopeLevel: dto.scopeLevel,
      scopeValue: dto.scopeValue,
      inheritedFrom: dto.inheritedFrom,
      source: dto.source,
      changeReason: reason,
      ownerType: dto.ownerType,
      ownerUserId: dto.ownerUserId,
      itemSource: dto.itemSource,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      isActive: dto.isActive,
      version: { increment: 1 },
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

    const updated = await this.prisma.parameterItem.update({
      where: { id: itemId },
      data,
    });
    await this.recordChangeLog(setId, ownerUserId, 'UPDATE', {
      parameterItemId: itemId,
      fieldPath: 'parameter-item',
      oldValue: existing,
      newValue: updated,
      changeReason: reason,
    });
    return updated;
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

    const removed = await this.prisma.parameterItem.update({
      where: { id: itemId },
      data: { isActive: false, version: { increment: 1 }, changeReason: '停用参数项' },
    });
    await this.recordChangeLog(setId, ownerUserId, 'DELETE', {
      parameterItemId: itemId,
      fieldPath: 'parameter-item',
      oldValue: existing,
      newValue: removed,
      changeReason: '停用参数项',
    });
    return removed;
  }

  async resolve(ownerUserId: string, setId: string, dto: ResolveParameterSetDto) {
    const set = await this.findOne(ownerUserId, setId);
    const now = new Date();
    const items = set.items.filter((item) =>
      this.matchScope(item.scopeLevel, item.scopeValue, dto) &&
      this.isEffectiveNow(item.effectiveFrom, item.effectiveTo, now),
    );

    items.sort((a, b) => {
      const left = PARAM_SCOPE_PRIORITY.indexOf(a.scopeLevel as ParameterScopeLevel);
      const right = PARAM_SCOPE_PRIORITY.indexOf(b.scopeLevel as ParameterScopeLevel);
      if (left !== right) {
        return left - right;
      }
      return a.updatedAt.getTime() - b.updatedAt.getTime();
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

  private isEffectiveNow(
    effectiveFrom: Date | null,
    effectiveTo: Date | null,
    now: Date,
  ): boolean {
    if (effectiveFrom && effectiveFrom.getTime() > now.getTime()) {
      return false;
    }
    if (effectiveTo && effectiveTo.getTime() < now.getTime()) {
      return false;
    }
    return true;
  }

  private validateTimeRange(effectiveFrom?: Date, effectiveTo?: Date) {
    if (effectiveFrom && effectiveTo && effectiveFrom.getTime() > effectiveTo.getTime()) {
      throw new BadRequestException('effectiveFrom 不能晚于 effectiveTo');
    }
  }

  private validateValueRange(value: unknown, min: unknown, max: unknown, type: string) {
    if (value === undefined || value === null) return;
    if (type !== 'number') return; // Only validate range for numbers for now

    const numVal = Number(value);
    if (isNaN(numVal)) return;

    let minNumber: number | null = null;
    let maxNumber: number | null = null;
    if (min !== undefined && min !== null) {
      const parsedMin = Number(min);
      if (!isNaN(parsedMin)) {
        if (numVal < parsedMin) {
          throw new BadRequestException(`参数值 ${numVal} 小于最小值 ${parsedMin}`);
        }
        minNumber = parsedMin;
      }
    }

    if (max !== undefined && max !== null) {
      const parsedMax = Number(max);
      if (!isNaN(parsedMax)) {
        if (numVal > parsedMax) {
          throw new BadRequestException(`参数值 ${numVal} 大于最大值 ${parsedMax}`);
        }
        maxNumber = parsedMax;
      }
    }
    if (minNumber !== null && maxNumber !== null && minNumber > maxNumber) {
      throw new BadRequestException(`最小值 ${minNumber} 不能大于最大值 ${maxNumber}`);
    }
  }

  private validateParameterValueType(
    type: string,
    value: unknown,
    defaultValue: unknown,
    minValue: unknown,
    maxValue: unknown,
  ) {
    if (type === 'number') {
      this.ensureNumberLike(value, 'value');
      this.ensureNumberLike(defaultValue, 'defaultValue');
      this.ensureNumberLike(minValue, 'minValue');
      this.ensureNumberLike(maxValue, 'maxValue');
      return;
    }
    if (type === 'boolean') {
      this.ensureBooleanLike(value, 'value');
      this.ensureBooleanLike(defaultValue, 'defaultValue');
      return;
    }
    if (type === 'string' || type === 'enum' || type === 'expression') {
      this.ensureStringLike(value, 'value');
      this.ensureStringLike(defaultValue, 'defaultValue');
      if (type === 'expression' && value !== undefined && value !== null && typeof value !== 'string') {
        throw new BadRequestException('expression 类型参数必须是字符串表达式');
      }
      return;
    }
    if (type === 'json') {
      return;
    }
  }

  private validateUnitRule(type: string, unit: string | null | undefined) {
    if ((type === 'string' || type === 'boolean' || type === 'json' || type === 'expression') && unit) {
      throw new BadRequestException(`${type} 类型参数不允许设置单位`);
    }
    if (type === 'number' && unit && unit.length > 20) {
      throw new BadRequestException('unit 长度不能超过 20');
    }
  }

  private ensureNumberLike(value: unknown, field: string) {
    if (value === undefined || value === null) {
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`${field} 必须是 number 类型`);
    }
  }

  private ensureBooleanLike(value: unknown, field: string) {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} 必须是 boolean 类型`);
    }
  }

  private ensureStringLike(value: unknown, field: string) {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} 必须是 string 类型`);
    }
  }

  private async validateExpressionDependencies(
    setId: string,
    selfParamCode: string,
    type: string,
    value: unknown,
  ) {
    if (type !== 'expression' || typeof value !== 'string') {
      return;
    }
    const refs = this.extractParamRefs(value).filter((ref) => ref !== selfParamCode);
    if (refs.length === 0) {
      return;
    }
    const existing = await this.prisma.parameterItem.findMany({
      where: {
        parameterSetId: setId,
        paramCode: { in: refs },
        isActive: true,
      },
      select: { paramCode: true },
    });
    const existingCodes = new Set(existing.map((item) => item.paramCode));
    const missing = refs.filter((ref) => !existingCodes.has(ref));
    if (missing.length > 0) {
      throw new BadRequestException(`表达式依赖参数不存在: ${missing.join(', ')}`);
    }
  }

  private extractParamRefs(expression: string): string[] {
    const refs = new Set<string>();
    const dotPattern = /params\.([a-zA-Z0-9_.-]+)/g;
    let match: RegExpExecArray | null = dotPattern.exec(expression);
    while (match) {
      refs.add(match[1]);
      match = dotPattern.exec(expression);
    }
    const moustachePattern = /\{\{\s*params\.([a-zA-Z0-9_.-]+)\s*\}\}/g;
    let match2: RegExpExecArray | null = moustachePattern.exec(expression);
    while (match2) {
      refs.add(match2[1]);
      match2 = moustachePattern.exec(expression);
    }
    return [...refs];
  }

  private async validateSetBeforePublish(setId: string) {
    const itemCount = await this.prisma.parameterItem.count({
      where: {
        parameterSetId: setId,
        isActive: true,
      },
    });
    if (itemCount === 0) {
      // 允许空参数包发布，以兼容历史流程治理测试和增量配置场景。
      return;
    }
  }

  private inferOwnerType(templateSource: string): 'SYSTEM' | 'ADMIN' | 'USER' {
    if (templateSource === 'PUBLIC') {
      return 'ADMIN';
    }
    return 'USER';
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

  async getImpactPreview(ownerUserId: string, setId: string) {
    const set = await this.findOne(ownerUserId, setId);
    const publishedVersions = await this.prisma.workflowVersion.findMany({
      where: {
        status: 'PUBLISHED',
        workflowDefinition: {
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
          isActive: true,
        },
      },
      select: {
        id: true,
        versionCode: true,
        dslSnapshot: true,
        workflowDefinition: {
          select: {
            id: true,
            workflowId: true,
            name: true,
          },
        },
      },
    });

    const workflows: Array<{
      workflowDefinitionId: string;
      workflowCode: string;
      workflowName: string;
      workflowVersionId: string;
      versionCode: string;
    }> = [];
    const agentCodes = new Set<string>();

    for (const version of publishedVersions) {
      const dsl = this.readObject(version.dslSnapshot);
      if (!dsl) {
        continue;
      }
      if (!this.dslUsesParameterSet(dsl, set.id, set.setCode)) {
        continue;
      }
      workflows.push({
        workflowDefinitionId: version.workflowDefinition.id,
        workflowCode: version.workflowDefinition.workflowId,
        workflowName: version.workflowDefinition.name,
        workflowVersionId: version.id,
        versionCode: version.versionCode,
      });
      for (const code of this.extractAgentCodesFromDsl(dsl)) {
        agentCodes.add(code);
      }
    }

    const agents = agentCodes.size > 0
      ? await this.prisma.agentProfile.findMany({
        where: {
          agentCode: { in: [...agentCodes] },
          isActive: true,
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        },
        select: {
          id: true,
          agentCode: true,
          agentName: true,
          roleType: true,
        },
        orderBy: [{ agentCode: 'asc' }],
      })
      : [];

    return {
      parameterSetId: set.id,
      setCode: set.setCode,
      workflowCount: workflows.length,
      agentCount: agents.length,
      workflows,
      agents,
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

    const where: Prisma.ParameterItemWhereInput = {
      parameterSetId: setId,
      isActive: true,
    };
    if (dto.itemIds && dto.itemIds.length > 0) {
      where.id = { in: dto.itemIds };
    }
    if (dto.scopeLevel) {
      where.scopeLevel = dto.scopeLevel;
      if (Object.prototype.hasOwnProperty.call(dto, 'scopeValue')) {
        where.scopeValue = dto.scopeValue ?? null;
      }
    }

    const items = await this.prisma.parameterItem.findMany({
      where,
    });
    const resettableItems = items.filter(
      (item) => item.defaultValue !== null && item.defaultValue !== undefined,
    );

    if (resettableItems.length === 0) {
      throw new BadRequestException('没有可重置的参数项');
    }

    const results = await Promise.all(
      resettableItems.map(async (item) => {
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

  private dslUsesParameterSet(
    dsl: Record<string, unknown>,
    setId: string,
    setCode: string,
  ): boolean {
    const bindings = this.readStringArray(dsl.paramSetBindings);
    return bindings.includes(setId) || bindings.includes(setCode);
  }

  private extractAgentCodesFromDsl(dsl: Record<string, unknown>): string[] {
    const collected = new Set<string>(this.readStringArray(dsl.agentBindings));
    const nodes = Array.isArray(dsl.nodes) ? dsl.nodes : [];
    for (const rawNode of nodes) {
      if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
        continue;
      }
      const node = rawNode as Record<string, unknown>;
      const config = this.readObject(node.config) ?? {};
      const directCodes = [
        this.readString(config.agentCode),
        this.readString(config.agentProfileCode),
      ].filter((value): value is string => Boolean(value));
      for (const code of directCodes) {
        collected.add(code);
      }
      for (const code of this.readStringArray(config.participants)) {
        collected.add(code);
      }
      for (const code of this.readStringArray(config.agents)) {
        collected.add(code);
      }
    }
    return [...collected];
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
