import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type { Prisma } from '@prisma/client';
import type {
    CreateCommodityDto,
    UpdateCommodityDto,
    CommodityQueryDto,
    CreateRegionDto,
    UpdateRegionDto,
    MasterRegionQueryDto,
    CreateMetricDefinitionDto,
    UpdateMetricDefinitionDto,
    MetricDefinitionQueryDto,
} from '@packages/types';

@Injectable()
export class SemanticLayerService {
    private readonly logger = new Logger(SemanticLayerService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ═══════════════════════════════════════════════════════════════
    // Commodity CRUD
    // ═══════════════════════════════════════════════════════════════

    async createCommodity(dto: CreateCommodityDto) {
        return this.prisma.masterCommodity.create({
            data: {
                code: dto.code,
                name: dto.name,
                nameEn: dto.nameEn ?? null,
                category: dto.category,
                unit: dto.unit,
                futuresSymbols: dto.futuresSymbols as Prisma.InputJsonValue,
                description: dto.description ?? null,
                isActive: dto.isActive ?? true,
            },
        });
    }

    async updateCommodity(code: string, dto: UpdateCommodityDto) {
        await this.ensureCommodityExists(code);
        return this.prisma.masterCommodity.update({
            where: { code },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
                ...(dto.category !== undefined && { category: dto.category }),
                ...(dto.unit !== undefined && { unit: dto.unit }),
                ...(dto.futuresSymbols !== undefined && {
                    futuresSymbols: dto.futuresSymbols as Prisma.InputJsonValue,
                }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
    }

    async findCommodity(code: string) {
        const record = await this.prisma.masterCommodity.findUnique({ where: { code } });
        if (!record) throw new NotFoundException(`品类 ${code} 不存在`);
        return record;
    }

    async listCommodities(query: CommodityQueryDto) {
        const where: Prisma.MasterCommodityWhereInput = {};
        if (query.category) where.category = query.category;
        if (query.isActive !== undefined) where.isActive = query.isActive;
        if (query.keyword) {
            where.OR = [
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { code: { contains: query.keyword, mode: 'insensitive' } },
            ];
        }

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;

        const [data, total] = await this.executeListSafely(
            () =>
                Promise.all([
                    this.prisma.masterCommodity.findMany({
                        where,
                        orderBy: { code: 'asc' },
                        skip: (page - 1) * pageSize,
                        take: pageSize,
                    }),
                    this.prisma.masterCommodity.count({ where }),
                ]),
            'MasterCommodity',
        );

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    async deleteCommodity(code: string) {
        await this.ensureCommodityExists(code);
        await this.prisma.masterCommodity.delete({ where: { code } });
        return { deleted: true };
    }

    // ═══════════════════════════════════════════════════════════════
    // Region CRUD
    // ═══════════════════════════════════════════════════════════════

    async createRegion(dto: CreateRegionDto) {
        return this.prisma.masterRegion.create({
            data: {
                code: dto.code,
                name: dto.name,
                nameEn: dto.nameEn ?? null,
                regionType: dto.regionType,
                parentCode: dto.parentCode ?? null,
                country: dto.country ?? 'CN',
                province: dto.province ?? null,
                latitude: dto.latitude ?? null,
                longitude: dto.longitude ?? null,
                isActive: dto.isActive ?? true,
            },
        });
    }

    async updateRegion(code: string, dto: UpdateRegionDto) {
        await this.ensureRegionExists(code);
        return this.prisma.masterRegion.update({
            where: { code },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
                ...(dto.regionType !== undefined && { regionType: dto.regionType }),
                ...(dto.parentCode !== undefined && { parentCode: dto.parentCode }),
                ...(dto.country !== undefined && { country: dto.country }),
                ...(dto.province !== undefined && { province: dto.province }),
                ...(dto.latitude !== undefined && { latitude: dto.latitude }),
                ...(dto.longitude !== undefined && { longitude: dto.longitude }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
    }

    async findRegion(code: string) {
        const record = await this.prisma.masterRegion.findUnique({ where: { code } });
        if (!record) throw new NotFoundException(`区域 ${code} 不存在`);
        return record;
    }

    async listRegions(query: MasterRegionQueryDto) {
        const where: Prisma.MasterRegionWhereInput = {};
        if (query.regionType) where.regionType = query.regionType;
        if (query.country) where.country = query.country;
        if (query.isActive !== undefined) where.isActive = query.isActive;
        if (query.keyword) {
            where.OR = [
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { code: { contains: query.keyword, mode: 'insensitive' } },
            ];
        }

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;

        const [data, total] = await this.executeListSafely(
            () =>
                Promise.all([
                    this.prisma.masterRegion.findMany({
                        where,
                        orderBy: { code: 'asc' },
                        skip: (page - 1) * pageSize,
                        take: pageSize,
                    }),
                    this.prisma.masterRegion.count({ where }),
                ]),
            'MasterRegion',
        );

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    async deleteRegion(code: string) {
        await this.ensureRegionExists(code);
        await this.prisma.masterRegion.delete({ where: { code } });
        return { deleted: true };
    }

    // ═══════════════════════════════════════════════════════════════
    // MetricDefinition CRUD
    // ═══════════════════════════════════════════════════════════════

    async createMetricDefinition(dto: CreateMetricDefinitionDto) {
        return this.prisma.metricDefinition.create({
            data: {
                metricCode: dto.metricCode,
                name: dto.name,
                nameEn: dto.nameEn ?? null,
                domain: dto.domain,
                dataType: dto.dataType,
                unit: dto.unit ?? null,
                formula: dto.formula ?? null,
                description: dto.description ?? null,
                frequency: dto.frequency,
                ttlMinutes: dto.ttlMinutes,
                sourceConnectors: dto.sourceConnectors as Prisma.InputJsonValue,
                version: dto.version ?? 'v1',
                isActive: dto.isActive ?? true,
            },
        });
    }

    async updateMetricDefinition(metricCode: string, dto: UpdateMetricDefinitionDto) {
        await this.ensureMetricExists(metricCode);
        return this.prisma.metricDefinition.update({
            where: { metricCode },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
                ...(dto.domain !== undefined && { domain: dto.domain }),
                ...(dto.dataType !== undefined && { dataType: dto.dataType }),
                ...(dto.unit !== undefined && { unit: dto.unit }),
                ...(dto.formula !== undefined && { formula: dto.formula }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.frequency !== undefined && { frequency: dto.frequency }),
                ...(dto.ttlMinutes !== undefined && { ttlMinutes: dto.ttlMinutes }),
                ...(dto.sourceConnectors !== undefined && {
                    sourceConnectors: dto.sourceConnectors as Prisma.InputJsonValue,
                }),
                ...(dto.version !== undefined && { version: dto.version }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
    }

    async findMetricDefinition(metricCode: string) {
        const record = await this.prisma.metricDefinition.findUnique({ where: { metricCode } });
        if (!record) throw new NotFoundException(`指标 ${metricCode} 不存在`);
        return record;
    }

    async listMetricDefinitions(query: MetricDefinitionQueryDto) {
        const where: Prisma.MetricDefinitionWhereInput = {};
        if (query.domain) where.domain = query.domain;
        if (query.dataType) where.dataType = query.dataType;
        if (query.frequency) where.frequency = query.frequency;
        if (query.isActive !== undefined) where.isActive = query.isActive;
        if (query.keyword) {
            where.OR = [
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { metricCode: { contains: query.keyword, mode: 'insensitive' } },
                { description: { contains: query.keyword, mode: 'insensitive' } },
            ];
        }

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;

        const [data, total] = await this.executeListSafely(
            () =>
                Promise.all([
                    this.prisma.metricDefinition.findMany({
                        where,
                        orderBy: { metricCode: 'asc' },
                        skip: (page - 1) * pageSize,
                        take: pageSize,
                    }),
                    this.prisma.metricDefinition.count({ where }),
                ]),
            'MetricDefinition',
        );

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    async deleteMetricDefinition(metricCode: string) {
        await this.ensureMetricExists(metricCode);
        await this.prisma.metricDefinition.delete({ where: { metricCode } });
        return { deleted: true };
    }

    private async executeListSafely<T>(
        operation: () => Promise<[T[], number]>,
        tableName: string,
    ): Promise<[T[], number]> {
        try {
            return await operation();
        } catch (error) {
            const prismaError = error as { code?: string; message?: string } | null;
            const isMissingTable =
                prismaError?.code === 'P2021' && prismaError?.message?.includes(tableName);
            if (isMissingTable) {
                this.logger.warn(
                    `[${tableName}] table missing in current database. Returning empty list as fallback.`,
                );
                return [[], 0];
            }
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    private async ensureCommodityExists(code: string) {
        const exists = await this.prisma.masterCommodity.findUnique({ where: { code } });
        if (!exists) throw new NotFoundException(`品类 ${code} 不存在`);
    }

    private async ensureRegionExists(code: string) {
        const exists = await this.prisma.masterRegion.findUnique({ where: { code } });
        if (!exists) throw new NotFoundException(`区域 ${code} 不存在`);
    }

    private async ensureMetricExists(metricCode: string) {
        const exists = await this.prisma.metricDefinition.findUnique({ where: { metricCode } });
        if (!exists) throw new NotFoundException(`指标 ${metricCode} 不存在`);
    }
}
