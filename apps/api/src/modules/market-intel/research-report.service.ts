import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ReportType } from '@prisma/client';

export interface CreateResearchReportDto {
    title: string;
    reportType: ReportType;
    publishDate?: Date;
    source?: string;
    summary: string;
    keyPoints?: { point: string; sentiment: string; confidence: number }[];
    prediction?: { direction: string; timeframe: string; reasoning: string };
    dataPoints?: { metric: string; value: string; period: string }[];
    commodities?: string[];
    regions?: string[];
    timeframe?: string;
    intelId: string;
}

@Injectable()
export class ResearchReportService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建研报档案
     */
    async create(dto: CreateResearchReportDto) {
        return this.prisma.researchReport.create({
            data: {
                title: dto.title,
                reportType: dto.reportType,
                publishDate: dto.publishDate,
                source: dto.source,
                summary: dto.summary,
                keyPoints: dto.keyPoints,
                prediction: dto.prediction,
                dataPoints: dto.dataPoints,
                commodities: dto.commodities || [],
                regions: dto.regions || [],
                timeframe: dto.timeframe,
                intelId: dto.intelId,
            },
            include: {
                intel: true,
            },
        });
    }

    /**
     * 查询研报列表
     */
    async findAll(options?: {
        reportType?: ReportType;
        commodity?: string;
        region?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        pageSize?: number;
    }) {
        const { reportType, commodity, region, startDate, endDate, page = 1, pageSize = 20 } = options || {};

        const where: any = {};

        if (reportType) where.reportType = reportType;
        if (commodity) where.commodities = { has: commodity };
        if (region) where.regions = { has: region };
        if (startDate || endDate) {
            where.publishDate = {};
            if (startDate) where.publishDate.gte = startDate;
            if (endDate) where.publishDate.lte = endDate;
        }

        const [data, total] = await Promise.all([
            this.prisma.researchReport.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                include: {
                    intel: {
                        select: { id: true, rawContent: true, sourceType: true },
                    },
                },
            }),
            this.prisma.researchReport.count({ where }),
        ]);

        return { data, total, page, pageSize };
    }

    /**
     * 获取单个研报
     */
    async findOne(id: string) {
        const report = await this.prisma.researchReport.findUnique({
            where: { id },
            include: {
                intel: {
                    include: {
                        attachments: true,
                        author: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!report) {
            throw new NotFoundException(`研报 ID ${id} 不存在`);
        }

        return report;
    }

    /**
     * 按情报ID查找研报
     */
    async findByIntelId(intelId: string) {
        return this.prisma.researchReport.findUnique({
            where: { intelId },
        });
    }

    /**
     * 更新研报
     */
    async update(id: string, dto: Partial<CreateResearchReportDto>) {
        return this.prisma.researchReport.update({
            where: { id },
            data: dto,
        });
    }

    /**
     * 删除研报
     */
    async remove(id: string) {
        await this.prisma.researchReport.delete({ where: { id } });
        return { success: true };
    }

    /**
     * 统计研报数量
     */
    async getStats() {
        const [byType, total] = await Promise.all([
            this.prisma.researchReport.groupBy({
                by: ['reportType'],
                _count: true,
            }),
            this.prisma.researchReport.count(),
        ]);

        return {
            total,
            byType: byType.reduce((acc, item) => {
                acc[item.reportType] = item._count;
                return acc;
            }, {} as Record<string, number>),
        };
    }
}
