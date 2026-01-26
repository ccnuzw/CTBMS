import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreatePriceDataDto, PriceDataQuery, PriceSubType } from '@packages/types';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PriceDataService {
    constructor(private prisma: PrismaService) { }

    private parseCsv(value?: string | string[]) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean);
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }

    private resolveDateRange(days = 30, startDate?: Date | string, endDate?: Date | string) {
        const resolvedStart = startDate ? new Date(startDate) : undefined;
        const resolvedEnd = endDate ? new Date(endDate) : undefined;
        if (!resolvedStart && days) {
            const end = resolvedEnd ?? new Date();
            const start = new Date(end);
            start.setDate(start.getDate() - days);
            return { startDate: start, endDate: resolvedEnd ?? end };
        }
        return { startDate: resolvedStart, endDate: resolvedEnd };
    }

    /**
     * 创建价格数据
     */
    async create(dto: CreatePriceDataDto, authorId: string) {
        // 获取昨日价格用于计算涨跌
        const yesterday = new Date(dto.effectiveDate);
        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayPrice = await this.prisma.priceData.findFirst({
            where: {
                commodity: dto.commodity,
                location: dto.location,
                effectiveDate: yesterday,
            },
            select: { price: true },
        });

        // 获取去年同期价格
        const lastYear = new Date(dto.effectiveDate);
        lastYear.setFullYear(lastYear.getFullYear() - 1);

        const lastYearPrice = await this.prisma.priceData.findFirst({
            where: {
                commodity: dto.commodity,
                location: dto.location,
                effectiveDate: lastYear,
            },
            select: { price: true },
        });

        const dayChange = yesterdayPrice
            ? dto.price - Number(yesterdayPrice.price)
            : null;
        const yearChange = lastYearPrice
            ? dto.price - Number(lastYearPrice.price)
            : null;

        return this.prisma.priceData.create({
            data: {
                effectiveDate: dto.effectiveDate,
                commodity: dto.commodity,
                grade: dto.grade,
                location: dto.location,
                region: dto.region || [],
                price: new Decimal(dto.price),
                moisture: dto.moisture ? new Decimal(dto.moisture) : null,
                bulkDensity: dto.bulkDensity,
                toxin: dto.toxin ? new Decimal(dto.toxin) : null,
                freight: dto.freight ? new Decimal(dto.freight) : null,
                inventory: dto.inventory,
                dayChange: dayChange ? new Decimal(dayChange) : null,
                yearChange: yearChange ? new Decimal(yearChange) : null,
                intelId: dto.intelId,
                authorId,
            },
        });
    }

    /**
     * 查询价格数据 (分页)
     * 增强版：支持按采集点和行政区划过滤
     */
    async findAll(query: PriceDataQuery) {
        const {
            sourceType,
            subType,
            subTypes,
            geoLevel,
            commodity,
            location,
            province,
            city,
            // enterpriseId, [REMOVED]
            startDate,
            endDate,
            keyword,
            collectionPointId,
            collectionPointIds,
            regionCode,
            pointTypes,
        } = query;
        // Query 参数从 URL 传入时都是字符串，需要转换
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;

        const andFilters: any[] = [];
        if (commodity) andFilters.push({ commodity });
        if (location) andFilters.push({ location: { contains: location, mode: 'insensitive' } });
        if (province) andFilters.push({ province });
        if (city) andFilters.push({ city });
        // if (enterpriseId) andFilters.push({ enterpriseId }); [REMOVED]
        if (sourceType) andFilters.push({ sourceType });
        if (sourceType) andFilters.push({ sourceType });
        const subTypeList = this.parseCsv(subTypes);
        if (subTypeList.length === 0 && subType) {
            andFilters.push({ subType });
        }
        if (geoLevel) andFilters.push({ geoLevel });
        if (subTypeList.length > 0) {
            andFilters.push({ subType: { in: subTypeList } });
        }

        // 采集点过滤
        if (collectionPointId) {
            andFilters.push({ collectionPointId });
        }
        const collectionPointIdList = this.parseCsv(collectionPointIds);
        if (collectionPointIdList.length > 0) {
            andFilters.push({ collectionPointId: { in: collectionPointIdList } });
        }

        // 行政区划过滤
        if (regionCode) {
            andFilters.push({ regionCode });
        }

        // 采集点类型过滤（含 REGIONAL 类型）
        const pointTypeList = this.parseCsv(pointTypes);
        if (pointTypeList.length > 0) {
            const orConditions: any[] = [];
            orConditions.push({ collectionPoint: { type: { in: pointTypeList } } });
            if (pointTypeList.includes('REGION')) {
                orConditions.push({ sourceType: 'REGIONAL' });
            }
            if (orConditions.length > 0) {
                andFilters.push({ OR: orConditions });
            }
        }

        // 日期范围
        if (startDate || endDate) {
            const range: any = {};
            if (startDate) range.gte = new Date(startDate);
            if (endDate) range.lte = new Date(endDate);
            andFilters.push({ effectiveDate: range });
        }

        // Keyword Search
        if (keyword) {
            andFilters.push({
                OR: [
                    { commodity: { contains: keyword, mode: 'insensitive' } },
                    { location: { contains: keyword, mode: 'insensitive' } },
                    { region: { has: keyword } },
                ],
            });
        }

        const where = andFilters.length > 0 ? { AND: andFilters } : {};

        const [data, total] = await Promise.all([
            this.prisma.priceData.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { effectiveDate: 'desc' },
                // 新增：包含采集点关联信息
                include: {
                    collectionPoint: {
                        select: { id: true, code: true, name: true, shortName: true, type: true },
                    },
                },
            }),
            this.prisma.priceData.count({ where }),
        ]);

        return {
            data: data.map((item) => this.serializePriceData(item)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    /**
     * 获取趋势数据 (用于 K 线图)
     */
    async getTrend(commodity: string, location: string, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const data = await this.prisma.priceData.findMany({
            where: {
                commodity,
                location: { contains: location, mode: 'insensitive' },
                effectiveDate: { gte: startDate },
            },
            orderBy: { effectiveDate: 'asc' },
            select: {
                effectiveDate: true,
                price: true,
                dayChange: true,
            },
        });

        return data.map((item) => ({
            date: item.effectiveDate,
            price: Number(item.price),
            change: item.dayChange ? Number(item.dayChange) : null,
        }));
    }

    /**
     * 获取价格热力地图数据
     */
    async getHeatmap(commodity: string, date?: Date) {
        const targetDate = date || new Date();

        const data = await this.prisma.priceData.findMany({
            where: {
                commodity,
                effectiveDate: targetDate,
            },
            select: {
                location: true,
                region: true,
                price: true,
                dayChange: true,
                // 新增：采集点信息
                collectionPointId: true,
                collectionPoint: {
                    select: { code: true, name: true, type: true },
                },
            },
        });

        return data.map((item) => ({
            location: item.location,
            region: item.region,
            price: Number(item.price),
            change: item.dayChange ? Number(item.dayChange) : null,
            collectionPointId: item.collectionPointId,
            collectionPoint: item.collectionPoint,
        }));
    }

    /**
     * 按采集点查询历史价格（时间序列）
     * 用于连续性数据分析
     */
    async getByCollectionPoint(
        collectionPointId: string,
        commodity?: string,
        days = 30,
        startDate?: Date,
        endDate?: Date,
        subTypes?: string | string[],
    ) {
        const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
            days,
            startDate,
            endDate,
        );

        const where: any = {
            collectionPointId,
        };
        if (commodity) where.commodity = commodity;
        const subTypeList = this.parseCsv(subTypes);
        if (subTypeList.length > 0) {
            where.subType = { in: subTypeList };
        }
        if (resolvedStart || resolvedEnd) {
            where.effectiveDate = {};
            if (resolvedStart) where.effectiveDate.gte = resolvedStart;
            if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
        }

        const data = await this.prisma.priceData.findMany({
            where,
            orderBy: { effectiveDate: 'asc' },
            select: {
                id: true,
                effectiveDate: true,
                commodity: true,
                price: true,
                dayChange: true,
                sourceType: true,
                subType: true,
                note: true,
            },
        });

        // 获取采集点信息
        const collectionPoint = await this.prisma.collectionPoint.findUnique({
            where: { id: collectionPointId },
            select: { id: true, code: true, name: true, shortName: true, type: true, regionCode: true },
        });

        return {
            collectionPoint,
            data: data.map((item) => ({
                id: item.id,
                date: item.effectiveDate,
                commodity: item.commodity,
                price: Number(item.price),
                change: item.dayChange ? Number(item.dayChange) : null,
                sourceType: item.sourceType,
                subType: item.subType,
                note: item.note,
            })),
            summary: {
                count: data.length,
                minPrice: data.length > 0 ? Math.min(...data.map(d => Number(d.price))) : null,
                maxPrice: data.length > 0 ? Math.max(...data.map(d => Number(d.price))) : null,
                avgPrice: data.length > 0 ? data.reduce((sum, d) => sum + Number(d.price), 0) / data.length : null,
            },
        };
    }

    /**
     * 按行政区划查询价格数据（支持聚合）
     * 用于区域连续性分析
     */
    async getByRegion(
        regionCode: string,
        commodity?: string,
        days = 30,
        startDate?: Date,
        endDate?: Date,
        subTypes?: string | string[],
    ) {
        const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
            days,
            startDate,
            endDate,
        );

        const where: any = {
            regionCode,
        };
        if (commodity) where.commodity = commodity;
        const subTypeList = this.parseCsv(subTypes);
        if (subTypeList.length > 0) {
            where.subType = { in: subTypeList };
        }
        if (resolvedStart || resolvedEnd) {
            where.effectiveDate = {};
            if (resolvedStart) where.effectiveDate.gte = resolvedStart;
            if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
        }

        const data = await this.prisma.priceData.findMany({
            where,
            orderBy: [{ effectiveDate: 'asc' }, { location: 'asc' }],
            select: {
                id: true,
                effectiveDate: true,
                location: true,
                commodity: true,
                price: true,
                dayChange: true,
                sourceType: true,
                collectionPointId: true,
                collectionPoint: {
                    select: { code: true, name: true, type: true },
                },
            },
        });

        // 获取行政区划信息
        const region = await this.prisma.administrativeRegion.findUnique({
            where: { code: regionCode },
            select: { code: true, name: true, level: true, shortName: true },
        });

        // 按日期聚合计算均价
        const dailyAggregation: Record<string, { prices: number[]; count: number }> = {};
        for (const item of data) {
            const dateKey = item.effectiveDate.toISOString().split('T')[0];
            if (!dailyAggregation[dateKey]) {
                dailyAggregation[dateKey] = { prices: [], count: 0 };
            }
            dailyAggregation[dateKey].prices.push(Number(item.price));
            dailyAggregation[dateKey].count++;
        }

        const trend = Object.entries(dailyAggregation)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, agg]) => ({
                date,
                avgPrice: agg.prices.reduce((a, b) => a + b, 0) / agg.prices.length,
                minPrice: Math.min(...agg.prices),
                maxPrice: Math.max(...agg.prices),
                count: agg.count,
            }));

        return {
            region,
            data: data.map((item) => ({
                id: item.id,
                date: item.effectiveDate,
                location: item.location,
                commodity: item.commodity,
                price: Number(item.price),
                change: item.dayChange ? Number(item.dayChange) : null,
                sourceType: item.sourceType,
                collectionPoint: item.collectionPoint,
            })),
            trend,
            summary: {
                totalRecords: data.length,
                uniqueLocations: [...new Set(data.map(d => d.location))].length,
            },
        };
    }

    /**
     * 获取多采集点对比趋势
     */
    async getMultiPointTrend(
        collectionPointIds: string[],
        commodity: string,
        days = 30,
        startDate?: Date,
        endDate?: Date,
        subTypes?: string | string[],
    ) {
        const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
            days,
            startDate,
            endDate,
        );

        const subTypeList = this.parseCsv(subTypes);

        const data = await this.prisma.priceData.findMany({
            where: {
                collectionPointId: { in: collectionPointIds },
                commodity,
                ...(subTypeList.length > 0 ? { subType: { in: subTypeList as PriceSubType[] } } : {}),
                effectiveDate: {
                    ...(resolvedStart ? { gte: resolvedStart } : {}),
                    ...(resolvedEnd ? { lte: resolvedEnd } : {}),
                },
            },
            orderBy: { effectiveDate: 'asc' },
            include: {
                collectionPoint: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        shortName: true,
                        type: true,
                        regionCode: true,
                        region: {
                            select: { code: true, name: true, shortName: true },
                        },
                    },
                },
            },
        });

        // 按采集点分组
        const grouped: Record<string, { point: any; data: any[] }> = {};
        for (const item of data) {
            const pointId = item.collectionPointId!;
            if (!grouped[pointId]) {
                grouped[pointId] = {
                    point: item.collectionPoint,
                    data: [],
                };
            }
            grouped[pointId].data.push({
                date: item.effectiveDate,
                price: Number(item.price),
                change: item.dayChange ? Number(item.dayChange) : null,
            });
        }

        return Object.values(grouped);
    }

    /**
     * 获取单条价格数据
     */
    async findOne(id: string) {
        const data = await this.prisma.priceData.findUnique({ where: { id } });
        if (!data) {
            throw new NotFoundException(`价格数据 ID ${id} 不存在`);
        }
        return this.serializePriceData(data);
    }

    /**
     * 删除价格数据
     */
    async remove(id: string) {
        const existing = await this.prisma.priceData.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`价格数据 ID ${id} 不存在`);
        }
        await this.prisma.priceData.delete({ where: { id } });
        return { success: true };
    }

    /**
     * 序列化 Decimal 字段
     */
    private serializePriceData(data: any) {
        return {
            ...data,
            price: Number(data.price),
            moisture: data.moisture ? Number(data.moisture) : null,
            toxin: data.toxin ? Number(data.toxin) : null,
            freight: data.freight ? Number(data.freight) : null,
            foldPrice: data.foldPrice ? Number(data.foldPrice) : null,
            dayChange: data.dayChange ? Number(data.dayChange) : null,
            yearChange: data.yearChange ? Number(data.yearChange) : null,
        };
    }
}
