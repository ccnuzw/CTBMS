import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreatePriceDataDto, PriceDataQuery } from '@packages/types';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PriceDataService {
    constructor(private prisma: PrismaService) { }

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
     */
    async findAll(query: PriceDataQuery) {
        const { commodity, location, startDate, endDate } = query;
        // Query 参数从 URL 传入时都是字符串，需要转换
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;

        const where: any = {};
        if (commodity) where.commodity = commodity;
        if (location) where.location = { contains: location, mode: 'insensitive' };
        if (startDate || endDate) {
            where.effectiveDate = {};
            // 将字符串转换为 Date 对象
            if (startDate) where.effectiveDate.gte = new Date(startDate);
            if (endDate) where.effectiveDate.lte = new Date(endDate);
        }

        const [data, total] = await Promise.all([
            this.prisma.priceData.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { effectiveDate: 'desc' },
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
            },
        });

        return data.map((item) => ({
            location: item.location,
            region: item.region,
            price: Number(item.price),
            change: item.dayChange ? Number(item.dayChange) : null,
        }));
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
