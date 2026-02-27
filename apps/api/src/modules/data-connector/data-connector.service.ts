import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateDataConnectorDto,
  DataConnectorQuickStartTemplateQueryDto,
  DataConnectorHealthCheckDto,
  DataConnectorQueryDto,
  UpdateDataConnectorDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class DataConnectorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDataConnectorDto) {
    const existing = await this.prisma.dataConnector.findUnique({
      where: { connectorCode: dto.connectorCode },
    });
    if (existing) {
      throw new BadRequestException(`connectorCode 已存在: ${dto.connectorCode}`);
    }

    const category =
      dto.category?.trim() || this.sourceDomainToCategory(dto.sourceDomain) || 'GENERAL';

    const endpointConfig = this.toRecord(dto.endpointConfig);
    if (dto.authConfig !== undefined) {
      endpointConfig.authConfig = dto.authConfig;
    }
    if (dto.timeoutPolicy !== undefined) {
      endpointConfig.timeoutPolicy = dto.timeoutPolicy;
    }
    if (dto.sourceDomain !== undefined) {
      endpointConfig.sourceDomain = dto.sourceDomain;
    }

    const queryTemplates = this.toRecord(dto.queryTemplates);
    if (dto.requestSchema !== undefined) {
      queryTemplates.requestSchema = dto.requestSchema;
    }

    const responseMapping = this.toRecord(dto.responseMapping);
    if (dto.responseSchema !== undefined) {
      responseMapping.responseSchema = dto.responseSchema;
    }

    const freshnessPolicy = this.toRecord(dto.freshnessPolicy);
    if (dto.cachePolicy !== undefined) {
      freshnessPolicy.cachePolicy = dto.cachePolicy;
    }
    if (dto.freshnessSla !== undefined) {
      freshnessPolicy.freshnessSla = dto.freshnessSla;
    }

    const rateLimitConfig = this.toRecord(dto.rateLimitConfig);
    if (dto.rateLimitPolicy !== undefined) {
      rateLimitConfig.rateLimitPolicy = dto.rateLimitPolicy;
    }
    if (dto.retryPolicy !== undefined) {
      rateLimitConfig.retryPolicy = dto.retryPolicy;
    }

    const healthCheckConfig = this.toRecord(dto.healthCheckConfig);
    if (dto.qualityRules !== undefined) {
      healthCheckConfig.qualityRules = dto.qualityRules;
    }
    if (dto.permissionScope !== undefined) {
      healthCheckConfig.permissionScope = dto.permissionScope;
    }

    return this.prisma.dataConnector.create({
      data: {
        connectorCode: dto.connectorCode,
        connectorName: dto.connectorName,
        connectorType: dto.connectorType,
        category,
        endpointConfig: this.toNullableJsonValue(endpointConfig),
        queryTemplates: this.toNullableJsonValue(queryTemplates),
        responseMapping: this.toNullableJsonValue(responseMapping),
        freshnessPolicy: this.toNullableJsonValue(freshnessPolicy),
        rateLimitConfig: this.toNullableJsonValue(rateLimitConfig),
        healthCheckConfig: this.toNullableJsonValue(healthCheckConfig),
        fallbackConnectorCode: dto.fallbackConnectorCode ?? null,
        ownerType: dto.ownerType,
      },
    });
  }

  async findAll(query: DataConnectorQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.dataConnector.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.dataConnector.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  getQuickStartTemplates(query: DataConnectorQuickStartTemplateQueryDto) {
    const templates = [
      {
        sourceDomain: 'INTERNAL_BUSINESS',
        category: 'INTERNAL',
        connectorType: 'INTERNAL_DB',
        authConfig: { type: 'SERVICE_ACCOUNT', rotationPolicy: '90d' },
        requestSchema: {
          commodityCode: 'string',
          regionCode: 'string',
          timeRange: { from: 'datetime', to: 'datetime' },
          metrics: ['spotPrice', 'inventoryDays', 'grossMarginPct'],
        },
        responseSchema: {
          records: [
            {
              ts: 'datetime',
              commodityCode: 'string',
              regionCode: 'string',
              spotPrice: 'number',
              inventoryDays: 'number',
              grossMarginPct: 'number',
            },
          ],
        },
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        timeoutPolicy: { requestTimeoutMs: 5000 },
        rateLimitPolicy: { qps: 0 },
        cachePolicy: { enabled: false },
        freshnessSla: { ttlSeconds: 600, maxDelaySeconds: 900 },
        qualityRules: { completenessMin: 0.98, consistencyMin: 0.98 },
        permissionScope: { orgIds: ['*'], fieldAllowlist: ['*'] },
      },
      {
        sourceDomain: 'PUBLIC_MARKET_INFO',
        category: 'PUBLIC',
        connectorType: 'REST_API',
        authConfig: { type: 'API_KEY', header: 'Authorization' },
        requestSchema: {
          keywords: ['string'],
          publishedAfter: 'datetime',
          page: 'number',
          pageSize: 'number',
        },
        responseSchema: {
          items: [
            {
              id: 'string',
              title: 'string',
              content: 'string',
              source: 'string',
              publishedAt: 'datetime',
            },
          ],
        },
        retryPolicy: { maxAttempts: 3, backoffMs: 300 },
        timeoutPolicy: { requestTimeoutMs: 6000 },
        rateLimitPolicy: { qps: 5 },
        cachePolicy: { enabled: true, ttlSeconds: 300 },
        freshnessSla: { ttlSeconds: 900, maxDelaySeconds: 1800 },
        qualityRules: { completenessMin: 0.9, consistencyMin: 0.92 },
        permissionScope: { orgIds: ['*'], fieldAllowlist: ['title', 'content', 'publishedAt'] },
      },
      {
        sourceDomain: 'FUTURES_MARKET',
        category: 'FUTURES',
        connectorType: 'EXCHANGE_API',
        authConfig: { type: 'API_KEY', signature: 'HMAC_SHA256' },
        requestSchema: {
          symbols: ['string'],
          interval: 'string',
          from: 'datetime',
          to: 'datetime',
        },
        responseSchema: {
          quotes: [
            {
              symbol: 'string',
              ts: 'datetime',
              open: 'number',
              high: 'number',
              low: 'number',
              close: 'number',
              volume: 'number',
            },
          ],
        },
        retryPolicy: { maxAttempts: 3, backoffMs: 200 },
        timeoutPolicy: { requestTimeoutMs: 4000 },
        rateLimitPolicy: { qps: 10 },
        cachePolicy: { enabled: true, ttlSeconds: 30 },
        freshnessSla: { ttlSeconds: 60, maxDelaySeconds: 120 },
        qualityRules: { completenessMin: 0.99, consistencyMin: 0.99 },
        permissionScope: {
          orgIds: ['*'],
          fieldAllowlist: ['symbol', 'ts', 'open', 'high', 'low', 'close'],
        },
      },
      {
        sourceDomain: 'WEATHER',
        category: 'WEATHER',
        connectorType: 'REST_API',
        authConfig: { type: 'API_KEY', header: 'X-API-Key' },
        requestSchema: {
          regions: ['string'],
          from: 'datetime',
          to: 'datetime',
          metrics: ['temperature', 'rainfall', 'alerts'],
        },
        responseSchema: {
          daily: [
            {
              regionCode: 'string',
              date: 'date',
              tempAvg: 'number',
              rainfallMm: 'number',
              weatherAlertLevel: 'string',
            },
          ],
        },
        retryPolicy: { maxAttempts: 3, backoffMs: 500 },
        timeoutPolicy: { requestTimeoutMs: 8000 },
        rateLimitPolicy: { qps: 2 },
        cachePolicy: { enabled: true, ttlSeconds: 3600 },
        freshnessSla: { ttlSeconds: 7200, maxDelaySeconds: 10800 },
        qualityRules: { completenessMin: 0.9, consistencyMin: 0.9 },
        permissionScope: {
          orgIds: ['*'],
          fieldAllowlist: ['regionCode', 'date', 'tempAvg', 'rainfallMm'],
        },
      },
      {
        sourceDomain: 'LOGISTICS',
        category: 'LOGISTICS',
        connectorType: 'REST_API',
        authConfig: { type: 'API_KEY', header: 'Authorization' },
        requestSchema: {
          routes: ['string'],
          date: 'date',
        },
        responseSchema: {
          routes: [
            {
              routeCode: 'string',
              date: 'date',
              freightIndex: 'number',
              delayHours: 'number',
              congestionLevel: 'string',
            },
          ],
        },
        retryPolicy: { maxAttempts: 3, backoffMs: 500 },
        timeoutPolicy: { requestTimeoutMs: 7000 },
        rateLimitPolicy: { qps: 3 },
        cachePolicy: { enabled: true, ttlSeconds: 1800 },
        freshnessSla: { ttlSeconds: 3600, maxDelaySeconds: 7200 },
        qualityRules: { completenessMin: 0.92, consistencyMin: 0.9 },
        permissionScope: {
          orgIds: ['*'],
          fieldAllowlist: ['routeCode', 'date', 'freightIndex', 'delayHours'],
        },
      },
    ] as const;

    const sourceDomainFilter =
      typeof query.sourceDomain === 'string' ? query.sourceDomain.toUpperCase() : null;
    const filtered = sourceDomainFilter
      ? templates.filter((item) => item.sourceDomain === sourceDomainFilter)
      : templates;

    return {
      data: filtered,
    };
  }

  async findOne(id: string) {
    const connector = await this.prisma.dataConnector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException('连接器不存在');
    }
    return connector;
  }

  async update(id: string, dto: UpdateDataConnectorDto) {
    const existingConnector = await this.ensureExists(id);
    const data: Prisma.DataConnectorUpdateInput = {
      connectorName: dto.connectorName,
      connectorType: dto.connectorType,
      category:
        dto.category ??
        (dto.sourceDomain !== undefined
          ? (this.sourceDomainToCategory(dto.sourceDomain) ?? undefined)
          : undefined),
      fallbackConnectorCode: dto.fallbackConnectorCode,
      ownerType: dto.ownerType,
      isActive: dto.isActive,
    };

    const endpointConfig = this.toRecord(existingConnector.endpointConfig);
    let shouldUpdateEndpointConfig = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'endpointConfig')) {
      Object.assign(endpointConfig, this.toRecord(dto.endpointConfig));
      shouldUpdateEndpointConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'authConfig')) {
      endpointConfig.authConfig = dto.authConfig;
      shouldUpdateEndpointConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'timeoutPolicy')) {
      endpointConfig.timeoutPolicy = dto.timeoutPolicy;
      shouldUpdateEndpointConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'sourceDomain')) {
      endpointConfig.sourceDomain = dto.sourceDomain;
      shouldUpdateEndpointConfig = true;
    }

    const queryTemplates = this.toRecord(existingConnector.queryTemplates);
    let shouldUpdateQueryTemplates = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'queryTemplates')) {
      Object.assign(queryTemplates, this.toRecord(dto.queryTemplates));
      shouldUpdateQueryTemplates = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'requestSchema')) {
      queryTemplates.requestSchema = dto.requestSchema;
      shouldUpdateQueryTemplates = true;
    }

    const responseMapping = this.toRecord(existingConnector.responseMapping);
    let shouldUpdateResponseMapping = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'responseMapping')) {
      Object.assign(responseMapping, this.toRecord(dto.responseMapping));
      shouldUpdateResponseMapping = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'responseSchema')) {
      responseMapping.responseSchema = dto.responseSchema;
      shouldUpdateResponseMapping = true;
    }

    const freshnessPolicy = this.toRecord(existingConnector.freshnessPolicy);
    let shouldUpdateFreshnessPolicy = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'freshnessPolicy')) {
      Object.assign(freshnessPolicy, this.toRecord(dto.freshnessPolicy));
      shouldUpdateFreshnessPolicy = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'cachePolicy')) {
      freshnessPolicy.cachePolicy = dto.cachePolicy;
      shouldUpdateFreshnessPolicy = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'freshnessSla')) {
      freshnessPolicy.freshnessSla = dto.freshnessSla;
      shouldUpdateFreshnessPolicy = true;
    }

    const rateLimitConfig = this.toRecord(existingConnector.rateLimitConfig);
    let shouldUpdateRateLimitConfig = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'rateLimitConfig')) {
      Object.assign(rateLimitConfig, this.toRecord(dto.rateLimitConfig));
      shouldUpdateRateLimitConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'rateLimitPolicy')) {
      rateLimitConfig.rateLimitPolicy = dto.rateLimitPolicy;
      shouldUpdateRateLimitConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'retryPolicy')) {
      rateLimitConfig.retryPolicy = dto.retryPolicy;
      shouldUpdateRateLimitConfig = true;
    }

    const healthCheckConfig = this.toRecord(existingConnector.healthCheckConfig);
    let shouldUpdateHealthCheckConfig = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'healthCheckConfig')) {
      Object.assign(healthCheckConfig, this.toRecord(dto.healthCheckConfig));
      shouldUpdateHealthCheckConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'qualityRules')) {
      healthCheckConfig.qualityRules = dto.qualityRules;
      shouldUpdateHealthCheckConfig = true;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'permissionScope')) {
      healthCheckConfig.permissionScope = dto.permissionScope;
      shouldUpdateHealthCheckConfig = true;
    }

    if (shouldUpdateEndpointConfig) {
      data.endpointConfig = this.toNullableJsonValue(endpointConfig);
    }
    if (shouldUpdateQueryTemplates) {
      data.queryTemplates = this.toNullableJsonValue(queryTemplates);
    }
    if (shouldUpdateResponseMapping) {
      data.responseMapping = this.toNullableJsonValue(responseMapping);
    }
    if (shouldUpdateFreshnessPolicy) {
      data.freshnessPolicy = this.toNullableJsonValue(freshnessPolicy);
    }
    if (shouldUpdateRateLimitConfig) {
      data.rateLimitConfig = this.toNullableJsonValue(rateLimitConfig);
    }
    if (shouldUpdateHealthCheckConfig) {
      data.healthCheckConfig = this.toNullableJsonValue(healthCheckConfig);
    }

    return this.prisma.dataConnector.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.dataConnector.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async healthCheck(id: string, dto: DataConnectorHealthCheckDto) {
    const connector = await this.findOne(id);
    const startedAt = Date.now();

    if (!connector.isActive) {
      return {
        connectorId: connector.id,
        connectorCode: connector.connectorCode,
        healthy: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: 'connector is inactive',
      };
    }

    if (connector.connectorType === 'INTERNAL_DB') {
      return {
        connectorId: connector.id,
        connectorCode: connector.connectorCode,
        healthy: true,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: 'internal connector configured',
      };
    }

    const endpointConfig = connector.endpointConfig as Record<string, unknown> | null;
    const urlValue = endpointConfig?.url;
    const healthUrl = typeof urlValue === 'string' ? urlValue : '';
    if (!healthUrl) {
      return {
        connectorId: connector.id,
        connectorCode: connector.connectorCode,
        healthy: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: 'missing endpointConfig.url',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dto.timeoutSeconds);
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      return {
        connectorId: connector.id,
        connectorCode: connector.connectorCode,
        healthy: response.ok,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: `status=${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        connectorId: connector.id,
        connectorCode: connector.connectorCode,
        healthy: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildWhere(query: DataConnectorQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.sourceDomain) {
      const mappedCategory = this.sourceDomainToCategory(query.sourceDomain);
      if (mappedCategory) {
        where.category = mappedCategory;
      }
    }
    if (query.connectorType) {
      where.connectorType = query.connectorType;
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { connectorCode: { contains: keyword, mode: 'insensitive' } },
        { connectorName: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private async ensureExists(id: string) {
    const connector = await this.prisma.dataConnector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException('连接器不存在');
    }
    return connector;
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

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  private sourceDomainToCategory(sourceDomain: unknown): string | null {
    if (typeof sourceDomain !== 'string') {
      return null;
    }
    const normalized = sourceDomain.trim().toUpperCase();
    const mapping: Record<string, string> = {
      INTERNAL_BUSINESS: 'INTERNAL',
      PUBLIC_MARKET_INFO: 'PUBLIC',
      FUTURES_MARKET: 'FUTURES',
      WEATHER: 'WEATHER',
      LOGISTICS: 'LOGISTICS',
    };
    return mapping[normalized] ?? null;
  }
}
