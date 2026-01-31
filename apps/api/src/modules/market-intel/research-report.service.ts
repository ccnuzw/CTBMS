import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, ReportType as PrismaReportType, ReviewStatus as PrismaReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
    CreateManualResearchReportDto,
    CreateResearchReportDto,
    UpdateResearchReportDto,
    ResearchReportQuery,
    ReportType as TypesReportType,
    ReportPeriod as TypesReportPeriod,
    ReviewStatus as TypesReviewStatus,
    IntelCategory,
    ContentType,
    IntelSourceType,
    PromoteToReportDto,
} from '@packages/types';

@Injectable()
export class ResearchReportService {
    constructor(private prisma: PrismaService) { }

    private toPrismaReportType(value: TypesReportType): PrismaReportType;
    private toPrismaReportType(value?: TypesReportType): PrismaReportType | undefined;
    private toPrismaReportType(value?: TypesReportType) {
        return value ? PrismaReportType[value] : undefined;
    }

    private toPrismaReviewStatus(value: TypesReviewStatus): PrismaReviewStatus;
    private toPrismaReviewStatus(value?: TypesReviewStatus): PrismaReviewStatus | undefined;
    private toPrismaReviewStatus(value?: TypesReviewStatus) {
        return value ? PrismaReviewStatus[value] : undefined;
    }

    /**
     * 创建研报档案
     */
    async create(dto: CreateResearchReportDto) {
        return this.prisma.researchReport.create({
            data: {
                title: dto.title,
                reportType: this.toPrismaReportType(dto.reportType),
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
     * 手工创建研报 (无需 IntelID)
     */
    async createManual(dto: CreateManualResearchReportDto) {


        return this.prisma.$transaction(async (tx) => {
            // 1. 准备 MarketIntel ID (如果有传入，说明已通过上传接口创建；否则创建新的)
            let intelId = dto.intelId;

            if (!intelId) {
                const intel = await tx.marketIntel.create({
                    data: {
                        rawContent: dto.summary,
                        category: 'C_DOCUMENT', // IntelCategory.C_DOCUMENT
                        contentType: 'RESEARCH_REPORT', // ContentType.RESEARCH_REPORT
                        sourceType: 'INTERNAL_REPORT', // IntelSourceType.INTERNAL_REPORT (Assumption: Manual entry is internal or official)
                        location: dto.regions?.[0] || '全国',
                        region: dto.regions,
                        effectiveTime: dto.publishDate || new Date(),
                        summary: dto.summary,
                        // I need to update the signature to accept userId.
                        authorId: 'system-user-placeholder', // Matches 'seed.sql' system user
                    },
                });
                intelId = intel.id;
            } else {
                // 如果已存在 Intel (例如通过上传创建)，我们可能需要更新它的 summary 或 metadata
                // 但为了安全起见，这里只关联它。如果需要同步更新 Intel 属性，可以在这里做 update
                await tx.marketIntel.update({
                    where: { id: intelId },
                    data: {
                        summary: dto.summary, // 同步最新的编辑器内容
                        rawContent: dto.summary,
                        effectiveTime: dto.publishDate || new Date(),
                        region: dto.regions,
                    }
                });
            }

            // 2. 创建 ResearchReport
            const result = await tx.researchReport.create({
                data: {
                    title: dto.title,
                    reportType: this.toPrismaReportType(dto.reportType),
                    reportPeriod: dto.reportPeriod ? (dto.reportPeriod as any) : undefined, // 临时强转，需导入 Enum
                    publishDate: dto.publishDate || new Date(),
                    source: dto.source,
                    summary: dto.summary,
                    keyPoints: dto.keyPoints,
                    prediction: dto.prediction,
                    dataPoints: dto.dataPoints,
                    commodities: dto.commodities || [],
                    regions: dto.regions || [],
                    timeframe: dto.timeframe,
                    intelId: intelId!,
                },
                include: {
                    intel: true, // Return with intel relation
                },
            });

            return result;
        });
    }

    /**
     * 查询研报列表
     */
    async findAll(options?: Partial<ResearchReportQuery>) {
        // ... (lines 123-163 unchanged)
        const { reportType, reviewStatus, commodity, region, startDate, endDate, keyword, title, source, page = 1, pageSize = 20 } = options || {};

        const where: Prisma.ResearchReportWhereInput = {};

        if (reportType) where.reportType = this.toPrismaReportType(reportType);
        if (reviewStatus) where.reviewStatus = this.toPrismaReviewStatus(reviewStatus);
        if (commodity) where.commodities = { has: commodity };
        if (region) where.regions = { has: region };
        if (startDate || endDate) {
            where.publishDate = {};
            if (startDate) where.publishDate.gte = startDate;
            if (endDate) where.publishDate.lte = endDate;
        }

        // Specific fields search
        if (title) where.title = { contains: title, mode: 'insensitive' };
        if (source) where.source = { contains: source, mode: 'insensitive' };

        // 全文搜索：在标题、摘要、来源中搜索
        if (keyword) {
            where.OR = [
                { title: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
                { source: { contains: keyword, mode: 'insensitive' } },
            ];
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
            // Explicitly select fields to ensure 'summary' is retrieved
            // and to verify if Prisma Client thinks the field exists
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
    async update(id: string, dto: UpdateResearchReportDto) {
        const data: Prisma.ResearchReportUpdateInput = {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.reportType !== undefined ? { reportType: this.toPrismaReportType(dto.reportType) } : {}),
            ...(dto.publishDate !== undefined ? { publishDate: dto.publishDate } : {}),
            ...(dto.source !== undefined ? { source: dto.source } : {}),
            ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
            ...(dto.keyPoints !== undefined ? { keyPoints: dto.keyPoints } : {}),
            ...(dto.prediction !== undefined ? { prediction: dto.prediction } : {}),
            ...(dto.dataPoints !== undefined ? { dataPoints: dto.dataPoints } : {}),
            ...(dto.commodities !== undefined ? { commodities: dto.commodities } : {}),
            ...(dto.regions !== undefined ? { regions: dto.regions } : {}),
            ...(dto.timeframe !== undefined ? { timeframe: dto.timeframe } : {}),
        };

        return this.prisma.researchReport.update({
            where: { id },
            data,
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
     * 批量删除研报
     */
    async batchRemove(ids: string[]) {
        if (!ids.length) return { count: 0 };
        const result = await this.prisma.researchReport.deleteMany({
            where: { id: { in: ids } },
        });
        return { count: result.count };
    }

    /**
     * 导出研报 - 返回 Buffer
     */
    async export(ids?: string[], query?: any) {
        let reports;

        if (ids && ids.length > 0) {
            reports = await this.prisma.researchReport.findMany({
                where: { id: { in: ids } },
                orderBy: { createdAt: 'desc' },
            });
        } else {
            // Reuse logic closely or just query
            const { reportType, reviewStatus, commodity, region, startDate, endDate, keyword } = query || {};
            const where: any = {};
            if (reportType) where.reportType = this.toPrismaReportType(reportType as TypesReportType);
            if (reviewStatus) where.reviewStatus = this.toPrismaReviewStatus(reviewStatus as TypesReviewStatus);
            if (commodity) where.commodities = { has: commodity };
            if (region) where.regions = { has: region };
            if (startDate || endDate) {
                where.publishDate = {};
                if (startDate) where.publishDate.gte = startDate;
                if (endDate) where.publishDate.lte = endDate;
            }
            if (keyword) {
                where.OR = [
                    { title: { contains: keyword, mode: 'insensitive' } },
                    { summary: { contains: keyword, mode: 'insensitive' } },
                    { source: { contains: keyword, mode: 'insensitive' } },
                ];
            }

            reports = await this.prisma.researchReport.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 1000, // Limit export size safety
            });
        }

        // Generate Excel
        const XLSX = require('xlsx');
        const data = reports.map(r => ({
            'ID': r.id,
            '标题': r.title,
            '类型': r.reportType,
            '发布日期': r.publishDate ? r.publishDate.toISOString().split('T')[0] : '',
            '来源': r.source,
            '摘要': r.summary,
            '审核状态': r.reviewStatus,
            '阅读量': r.viewCount,
            '下载量': r.downloadCount,
            '创建时间': r.createdAt.toISOString(),
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Research Reports');

        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    /**
     * 增加浏览次数
     */
    async incrementViewCount(id: string) {
        return this.prisma.researchReport.update({
            where: { id },
            data: {
                viewCount: { increment: 1 },
            },
        });
    }

    /**
     * 增加下载次数
     */
    async incrementDownloadCount(id: string) {
        return this.prisma.researchReport.update({
            where: { id },
            data: {
                downloadCount: { increment: 1 },
            },
        });
    }

    /**
     * 更新审核状态
     */
    async updateReviewStatus(id: string, status: PrismaReviewStatus, reviewerId: string) {
        return this.prisma.researchReport.update({
            where: { id },
            data: {
                reviewStatus: status,
                reviewedById: reviewerId,
                reviewedAt: new Date(),
            },
        });
    }

    /**
     * 批量更新审核状态
     */
    async batchUpdateReviewStatus(ids: string[], status: TypesReviewStatus, reviewerId: string) {
        if (!ids || ids.length === 0) {
            return { updatedCount: 0 };
        }

        const prismaStatus = this.toPrismaReviewStatus(status) || (status as PrismaReviewStatus);

        const result = await this.prisma.researchReport.updateMany({
            where: { id: { in: ids } },
            data: {
                reviewStatus: prismaStatus,
                reviewedById: reviewerId,
                reviewedAt: new Date(),
            },
        });

        return { updatedCount: result.count };
    }

    /**
     * 将文档升级为研报 (Promote to Report)
     * 核心接口：从已有的 MarketIntel 文档生成结构化研报
     */
    async promoteToReport(intelId: string, dto: PromoteToReportDto) {
        // 1. 查找源文档
        const intel = await this.prisma.marketIntel.findUnique({
            where: { id: intelId },
            include: {
                attachments: true,
                researchReport: true,
            },
        });

        if (!intel) {
            throw new NotFoundException(`文档 ID ${intelId} 不存在`);
        }

        // 2. 检查是否已有关联研报
        if (intel.researchReport) {
            throw new BadRequestException('该文档已生成研报，无法重复生成');
        }

        // 3. 从 AI 分析结果中提取结构化数据
        const aiAnalysis = intel.aiAnalysis as any || {};

        // 构建研报数据
        const title = aiAnalysis.extractedData?.title ||
                      aiAnalysis.summary?.substring(0, 50) ||
                      intel.summary?.substring(0, 50) ||
                      '未命名研报';

        const keyPoints = aiAnalysis.keyPoints || aiAnalysis.insights?.map((i: any) => ({
            point: i.title || i.content,
            sentiment: i.direction === 'Bullish' ? 'positive' :
                       i.direction === 'Bearish' ? 'negative' : 'neutral',
            confidence: i.confidence || 70,
        })) || [];

        const prediction = aiAnalysis.prediction || (aiAnalysis.forecast ? {
            direction: aiAnalysis.forecast.shortTerm?.includes('涨') ? 'UP' :
                       aiAnalysis.forecast.shortTerm?.includes('跌') ? 'DOWN' : 'STABLE',
            timeframe: 'SHORT_TERM',
            reasoning: aiAnalysis.forecast.shortTerm || aiAnalysis.forecast.mediumTerm,
        } : undefined);

        const dataPoints = aiAnalysis.dataPoints || aiAnalysis.pricePoints?.slice(0, 5).map((p: any) => ({
            metric: `${p.location} ${p.commodity || '玉米'}价格`,
            value: String(p.price),
            unit: p.unit || '元/吨',
        })) || [];

        const commodities = aiAnalysis.commodities ||
                           (aiAnalysis.reportMeta?.commodity ? [aiAnalysis.reportMeta.commodity] : []);

        const regions = aiAnalysis.regions || intel.region || [];

        // 4. 创建研报
        const report = await this.prisma.researchReport.create({
            data: {
                title,
                reportType: this.toPrismaReportType(dto.reportType as TypesReportType),
                publishDate: intel.effectiveTime || new Date(),
                source: intel.sourceType || 'INTERNAL_REPORT',
                summary: intel.rawContent || intel.summary || '',
                keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
                prediction: prediction || undefined,
                dataPoints: dataPoints.length > 0 ? dataPoints : undefined,
                commodities,
                regions,
                intelId: intel.id,
                reviewStatus: 'PENDING',
            },
            include: {
                intel: {
                    include: {
                        attachments: true,
                    },
                },
            },
        });

        return {
            success: true,
            reportId: report.id,
            report,
        };
    }

    /**
     * 统计研报数量 (增强版)
     */
    async getStats(options?: { days?: number }) {
        const days = options?.days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [byType, byStatus, bySource, total, recent, totalViews, totalDownloads] = await Promise.all([
            // 按类型统计
            this.prisma.researchReport.groupBy({
                by: ['reportType'],
                _count: true,
            }),
            // 按审核状态统计
            this.prisma.researchReport.groupBy({
                by: ['reviewStatus'],
                _count: true,
            }),
            // 按来源统计 (Top 10)
            this.prisma.researchReport.groupBy({
                by: ['source'],
                _count: true,
                where: {
                    source: { not: null },
                },
                orderBy: {
                    _count: {
                        source: 'desc',
                    },
                },
                take: 10,
            }),
            // 总数
            this.prisma.researchReport.count(),
            // 最近更新 (Top 10)
            this.prisma.researchReport.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    reportType: true,
                    source: true,
                    createdAt: true,
                    viewCount: true,
                },
            }),
            // 总浏览量
            this.prisma.researchReport.aggregate({
                _sum: { viewCount: true },
            }),
            // 总下载量
            this.prisma.researchReport.aggregate({
                _sum: { downloadCount: true },
            }),
        ]);

        // 时间趋势数据 (最近N天,按天统计)
        const trendData = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
            SELECT 
                DATE("createdAt") as date,
                COUNT(*)::int as count
            FROM "ResearchReport"
            WHERE "createdAt" >= ${startDate}
            GROUP BY DATE("createdAt")
            ORDER BY date ASC
        `;

        // 品种热度统计 (从 commodities 数组中提取)
        const allReports = await this.prisma.researchReport.findMany({
            select: { commodities: true, regions: true },
        });

        const commodityCount: Record<string, number> = {};
        const regionCount: Record<string, number> = {};

        allReports.forEach(report => {
            report.commodities.forEach(c => {
                commodityCount[c] = (commodityCount[c] || 0) + 1;
            });
            report.regions.forEach(r => {
                regionCount[r] = (regionCount[r] || 0) + 1;
            });
        });

        const topCommodities = Object.entries(commodityCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        const topRegions = Object.entries(regionCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        return {
            total,
            totalViews: totalViews._sum.viewCount || 0,
            totalDownloads: totalDownloads._sum.downloadCount || 0,
            byType: byType.reduce((acc, item) => {
                acc[item.reportType] = item._count;
                return acc;
            }, {} as Record<string, number>),
            byStatus: byStatus.reduce((acc, item) => {
                acc[item.reviewStatus] = item._count;
                return acc;
            }, {} as Record<string, number>),
            bySource: bySource.map(item => ({
                source: item.source,
                count: item._count,
            })),
            trend: trendData.map(item => ({
                date: item.date.toISOString().split('T')[0],
                count: Number(item.count),
            })),
            topCommodities,
            topRegions,
            recent,
        };
    }
}
