import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
    CreateDecisionRecordDto,
    UpdateDecisionRecordDto,
    DecisionRecordQueryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class DecisionRecordService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * 创建决策记录
     */
    async create(userId: string, dto: CreateDecisionRecordDto) {
        return this.prisma.decisionRecord.create({
            data: {
                workflowExecutionId: dto.workflowExecutionId,
                workflowDefinitionId: dto.workflowDefinitionId,
                action: dto.action,
                confidence: dto.confidence,
                riskLevel: dto.riskLevel,
                targetWindow: dto.targetWindow,
                reasoningSummary: dto.reasoningSummary,
                traceId: dto.traceId,
                createdByUserId: userId,
                evidenceSummary: dto.evidenceSummary
                    ? (dto.evidenceSummary as Prisma.InputJsonValue)
                    : undefined,
                paramSnapshot: dto.paramSnapshot
                    ? (dto.paramSnapshot as Prisma.InputJsonValue)
                    : undefined,
                outputSnapshot: dto.outputSnapshot
                    ? (dto.outputSnapshot as Prisma.InputJsonValue)
                    : undefined,
            },
        });
    }

    /**
     * 分页查询
     */
    async findMany(userId: string, dto: DecisionRecordQueryDto) {
        const where: Prisma.DecisionRecordWhereInput = {
            createdByUserId: userId,
        };

        if (dto.workflowExecutionId) {
            where.workflowExecutionId = dto.workflowExecutionId;
        }
        if (dto.workflowDefinitionId) {
            where.workflowDefinitionId = dto.workflowDefinitionId;
        }
        if (dto.action) {
            where.action = dto.action;
        }
        if (dto.riskLevel) {
            where.riskLevel = dto.riskLevel;
        }
        if (dto.isPublished !== undefined) {
            where.isPublished = dto.isPublished;
        }
        if (dto.keyword) {
            where.reasoningSummary = { contains: dto.keyword, mode: 'insensitive' };
        }
        if (dto.createdAtFrom || dto.createdAtTo) {
            where.createdAt = {};
            if (dto.createdAtFrom) (where.createdAt as Prisma.DateTimeFilter).gte = dto.createdAtFrom;
            if (dto.createdAtTo) (where.createdAt as Prisma.DateTimeFilter).lte = dto.createdAtTo;
        }

        const page = dto.page ?? 1;
        const pageSize = dto.pageSize ?? 20;
        const skip = (page - 1) * pageSize;

        const [data, total] = await Promise.all([
            this.prisma.decisionRecord.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.decisionRecord.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    /**
     * 查询单条
     */
    async findOne(userId: string, id: string) {
        const record = await this.prisma.decisionRecord.findFirst({
            where: { id, createdByUserId: userId },
            include: {
                workflowExecution: {
                    select: {
                        id: true,
                        status: true,
                        triggerType: true,
                        startedAt: true,
                        completedAt: true,
                    },
                },
            },
        });

        if (!record) {
            throw new NotFoundException('决策记录不存在');
        }

        return record;
    }

    /**
     * 更新
     */
    async update(userId: string, id: string, dto: UpdateDecisionRecordDto) {
        const existing = await this.prisma.decisionRecord.findFirst({
            where: { id, createdByUserId: userId },
        });

        if (!existing) {
            throw new NotFoundException('决策记录不存在');
        }

        return this.prisma.decisionRecord.update({
            where: { id },
            data: {
                ...dto,
                publishedAt: dto.isPublished ? new Date() : undefined,
            },
        });
    }

    /**
     * 删除
     */
    async remove(userId: string, id: string) {
        const existing = await this.prisma.decisionRecord.findFirst({
            where: { id, createdByUserId: userId },
        });

        if (!existing) {
            throw new NotFoundException('决策记录不存在');
        }

        await this.prisma.decisionRecord.delete({ where: { id } });
        return { deleted: true };
    }

    /**
     * 发布决策记录（标记为可对外展示）
     */
    async publish(userId: string, id: string) {
        const existing = await this.prisma.decisionRecord.findFirst({
            where: { id, createdByUserId: userId },
        });

        if (!existing) {
            throw new NotFoundException('决策记录不存在');
        }

        return this.prisma.decisionRecord.update({
            where: { id },
            data: {
                isPublished: true,
                publishedAt: new Date(),
            },
        });
    }

    /**
     * 审核决策记录
     */
    async review(userId: string, id: string, comment: string) {
        const existing = await this.prisma.decisionRecord.findFirst({
            where: { id },
        });

        if (!existing) {
            throw new NotFoundException('决策记录不存在');
        }

        return this.prisma.decisionRecord.update({
            where: { id },
            data: {
                reviewedByUserId: userId,
                reviewComment: comment,
            },
        });
    }

    /**
     * 按执行 ID 查询关联的决策记录
     */
    async findByExecutionId(executionId: string) {
        return this.prisma.decisionRecord.findMany({
            where: { workflowExecutionId: executionId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * 获取统计数据
     */
    async getStats(userId: string) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // 1. Total (Last 30 days)
        const total = await this.prisma.decisionRecord.count({
            where: {
                createdByUserId: userId,
                createdAt: { gte: thirtyDaysAgo },
            },
        });

        // 2. Action Distribution (Last 30 days)
        const actionGroups = await this.prisma.decisionRecord.groupBy({
            by: ['action'],
            where: {
                createdByUserId: userId,
                createdAt: { gte: thirtyDaysAgo },
            },
            _count: { action: true },
        });
        const actionDistribution: Record<string, number> = {};
        actionGroups.forEach(g => {
            actionDistribution[g.action] = g._count.action;
        });

        // 3. Risk Distribution (Last 30 days)
        const riskGroups = await this.prisma.decisionRecord.groupBy({
            by: ['riskLevel'],
            where: {
                createdByUserId: userId,
                createdAt: { gte: thirtyDaysAgo },
                riskLevel: { not: null },
            },
            _count: { riskLevel: true },
        });
        const riskDistribution: Record<string, number> = {};
        riskGroups.forEach(g => {
            if (g.riskLevel) riskDistribution[g.riskLevel] = g._count.riskLevel;
        });

        // 4. Daily Trend (Last 14 days)
        // Fetch inputs for aggregation
        const trendRecords = await this.prisma.decisionRecord.findMany({
            where: {
                createdByUserId: userId,
                createdAt: { gte: fourteenDaysAgo },
            },
            select: { createdAt: true },
        });

        const trendMap = new Map<string, number>();
        // Initialize last 14 days
        for (let i = 0; i < 14; i++) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().split('T')[0];
            trendMap.set(key, 0);
        }

        trendRecords.forEach(r => {
            const key = r.createdAt.toISOString().split('T')[0];
            if (trendMap.has(key)) {
                trendMap.set(key, (trendMap.get(key) || 0) + 1);
            }
        });

        const dailyTrend = Array.from(trendMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
            total,
            actionDistribution,
            riskDistribution,
            dailyTrend,
        };
    }

}
