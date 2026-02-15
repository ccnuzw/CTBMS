import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateDataConnectorDto,
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

    return this.prisma.dataConnector.create({
      data: {
        connectorCode: dto.connectorCode,
        connectorName: dto.connectorName,
        connectorType: dto.connectorType,
        category: dto.category,
        endpointConfig: this.toNullableJsonValue(dto.endpointConfig),
        queryTemplates: this.toNullableJsonValue(dto.queryTemplates),
        responseMapping: this.toNullableJsonValue(dto.responseMapping),
        freshnessPolicy: this.toNullableJsonValue(dto.freshnessPolicy),
        rateLimitConfig: this.toNullableJsonValue(dto.rateLimitConfig),
        healthCheckConfig: this.toNullableJsonValue(dto.healthCheckConfig),
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

  async findOne(id: string) {
    const connector = await this.prisma.dataConnector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException('连接器不存在');
    }
    return connector;
  }

  async update(id: string, dto: UpdateDataConnectorDto) {
    await this.ensureExists(id);
    const data: Prisma.DataConnectorUpdateInput = {
      connectorName: dto.connectorName,
      connectorType: dto.connectorType,
      category: dto.category,
      fallbackConnectorCode: dto.fallbackConnectorCode,
      ownerType: dto.ownerType,
      isActive: dto.isActive,
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'endpointConfig')) {
      data.endpointConfig = this.toNullableJsonValue(dto.endpointConfig);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'queryTemplates')) {
      data.queryTemplates = this.toNullableJsonValue(dto.queryTemplates);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'responseMapping')) {
      data.responseMapping = this.toNullableJsonValue(dto.responseMapping);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'freshnessPolicy')) {
      data.freshnessPolicy = this.toNullableJsonValue(dto.freshnessPolicy);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'rateLimitConfig')) {
      data.rateLimitConfig = this.toNullableJsonValue(dto.rateLimitConfig);
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'healthCheckConfig')) {
      data.healthCheckConfig = this.toNullableJsonValue(dto.healthCheckConfig);
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
    const timeout = setTimeout(() => controller.abort(), dto.timeoutMs);
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
}
