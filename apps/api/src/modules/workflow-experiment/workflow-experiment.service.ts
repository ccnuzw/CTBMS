import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
    CreateWorkflowExperimentDto,
    UpdateWorkflowExperimentDto,
    WorkflowExperimentQueryDto,
    ConcludeExperimentDto,
    RecordExperimentMetricsDto,
    ExperimentRunQueryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class WorkflowExperimentService {
    private readonly logger = new Logger(WorkflowExperimentService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * 创建灰度实验
     */
    async create(userId: string, dto: CreateWorkflowExperimentDto) {
        // 验证版本存在
        const [versionA, versionB] = await Promise.all([
            this.prisma.workflowVersion.findUnique({ where: { id: dto.variantAVersionId } }),
            this.prisma.workflowVersion.findUnique({ where: { id: dto.variantBVersionId } }),
        ]);

        if (!versionA) throw new NotFoundException(`变体 A 版本不存在: ${dto.variantAVersionId}`);
        if (!versionB) throw new NotFoundException(`变体 B 版本不存在: ${dto.variantBVersionId}`);

        if (versionA.workflowDefinitionId !== dto.workflowDefinitionId ||
            versionB.workflowDefinitionId !== dto.workflowDefinitionId) {
            throw new BadRequestException('变体版本必须属于同一工作流定义');
        }

        return this.prisma.workflowExperiment.create({
            data: {
                ...dto,
                createdByUserId: userId,
            },
        });
    }

    /**
     * 分页查询
     */
    async findMany(userId: string, dto: WorkflowExperimentQueryDto) {
        const where: Prisma.WorkflowExperimentWhereInput = {
            createdByUserId: userId,
        };

        if (dto.workflowDefinitionId) where.workflowDefinitionId = dto.workflowDefinitionId;
        if (dto.status) where.status = dto.status;
        if (dto.keyword) {
            where.OR = [
                { name: { contains: dto.keyword, mode: 'insensitive' } },
                { experimentCode: { contains: dto.keyword, mode: 'insensitive' } },
            ];
        }

        const page = dto.page ?? 1;
        const pageSize = dto.pageSize ?? 20;

        const [data, total] = await Promise.all([
            this.prisma.workflowExperiment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.workflowExperiment.count({ where }),
        ]);

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    /**
     * 查询单条
     */
    async findOne(userId: string, id: string) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!experiment) throw new NotFoundException('实验不存在');
        return experiment;
    }

    /**
     * 更新
     */
    async update(userId: string, id: string, dto: UpdateWorkflowExperimentDto) {
        const existing = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!existing) throw new NotFoundException('实验不存在');
        if (existing.status === 'COMPLETED' || existing.status === 'ABORTED') {
            throw new BadRequestException('已结束的实验不可修改');
        }

        return this.prisma.workflowExperiment.update({
            where: { id },
            data: dto,
        });
    }

    /**
     * 启动实验
     */
    async start(userId: string, id: string) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!experiment) throw new NotFoundException('实验不存在');
        if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
            throw new BadRequestException(`当前状态 ${experiment.status} 无法启动`);
        }

        return this.prisma.workflowExperiment.update({
            where: { id },
            data: {
                status: 'RUNNING',
                startedAt: experiment.startedAt ?? new Date(),
            },
        });
    }

    /**
     * 暂停实验
     */
    async pause(userId: string, id: string) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId, status: 'RUNNING' },
        });
        if (!experiment) throw new NotFoundException('运行中的实验不存在');

        return this.prisma.workflowExperiment.update({
            where: { id },
            data: { status: 'PAUSED' },
        });
    }

    /**
     * 中止实验
     */
    async abort(userId: string, id: string) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!experiment) throw new NotFoundException('实验不存在');
        if (experiment.status === 'COMPLETED') {
            throw new BadRequestException('已完成的实验不可中止');
        }

        return this.prisma.workflowExperiment.update({
            where: { id },
            data: { status: 'ABORTED', endedAt: new Date() },
        });
    }

    /**
     * 结论实验（选定胜者）
     */
    async conclude(userId: string, id: string, dto: ConcludeExperimentDto) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!experiment) throw new NotFoundException('实验不存在');
        if (experiment.status !== 'RUNNING' && experiment.status !== 'PAUSED') {
            throw new BadRequestException(`当前状态 ${experiment.status} 无法结论`);
        }

        return this.prisma.workflowExperiment.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                endedAt: new Date(),
                winnerVariant: dto.winnerVariant,
                conclusionSummary: dto.conclusionSummary,
                metricsSnapshot: {
                    totalExecutionsA: experiment.currentExecutionsA,
                    totalExecutionsB: experiment.currentExecutionsB,
                    concludedAt: new Date().toISOString(),
                },
            },
        });
    }

    /**
     * 流量分配：根据实验配置选择执行的版本 ID
     * 返回 'A' 或 'B'，外部据此选择 variantAVersionId 或 variantBVersionId
     */
    async routeTraffic(experimentId: string): Promise<{
        variant: 'A' | 'B';
        versionId: string;
    }> {
        const experiment = await this.prisma.workflowExperiment.findUnique({
            where: { id: experimentId },
        });

        if (!experiment || experiment.status !== 'RUNNING') {
            throw new BadRequestException('实验不存在或未运行');
        }

        // 检查执行上限
        if (experiment.maxExecutions) {
            const totalExecutions = experiment.currentExecutionsA + experiment.currentExecutionsB;
            if (totalExecutions >= experiment.maxExecutions) {
                throw new BadRequestException('实验已达到最大执行次数');
            }
        }

        // 流量分配（基于权重随机）
        const randomPercent = Math.random() * 100;
        const variant: 'A' | 'B' = randomPercent < experiment.trafficSplitPercent ? 'A' : 'B';
        const versionId = variant === 'A'
            ? experiment.variantAVersionId
            : experiment.variantBVersionId;

        // 更新计数
        await this.prisma.workflowExperiment.update({
            where: { id: experimentId },
            data: variant === 'A'
                ? { currentExecutionsA: { increment: 1 } }
                : { currentExecutionsB: { increment: 1 } },
        });

        this.logger.log(
            `实验 ${experiment.experimentCode}: 路由到变体 ${variant} (版本 ${versionId})`,
        );

        return { variant, versionId };
    }

    /**
     * 记录执行指标并检查自动止损
     */
    async recordMetrics(experimentId: string, dto: RecordExperimentMetricsDto): Promise<{
        recorded: boolean;
        autoStopped: boolean;
        reason?: string;
    }> {
        const experiment = await this.prisma.workflowExperiment.findUnique({
            where: { id: experimentId },
        });

        if (!experiment || experiment.status !== 'RUNNING') {
            throw new BadRequestException('实验不存在或未运行');
        }

        // 读取或初始化指标快照
        const snapshot = this.readMetricsSnapshot(experiment.metricsSnapshot);
        const variantKey = dto.variant === 'A' ? 'variantA' : 'variantB';
        const metrics = snapshot[variantKey];

        // 增量更新
        metrics.totalExecutions++;
        if (dto.success) {
            metrics.successCount++;
        } else {
            metrics.failureCount++;
        }
        metrics.successRate = metrics.totalExecutions > 0
            ? metrics.successCount / metrics.totalExecutions
            : 0;
        metrics.badCaseRate = metrics.totalExecutions > 0
            ? metrics.failureCount / metrics.totalExecutions
            : 0;

        // 增量更新平均耗时
        const prevTotal = metrics.avgDurationMs * (metrics.totalExecutions - 1);
        metrics.avgDurationMs = Math.round((prevTotal + dto.durationMs) / metrics.totalExecutions);

        // P95 近似：保留最大值（简化版，精确 P95 需要存储完整分布）
        if (dto.durationMs > metrics.p95DurationMs) {
            metrics.p95DurationMs = dto.durationMs;
        }

        snapshot.lastUpdatedAt = new Date().toISOString();

        // 持久化快照
        await this.prisma.workflowExperiment.update({
            where: { id: experimentId },
            data: {
                metricsSnapshot: snapshot as unknown as Prisma.InputJsonObject,
            },
        });

        this.logger.log(
            `实验 ${experiment.experimentCode}: 记录变体 ${dto.variant} 指标 ` +
            `(成功率=${(metrics.successRate * 100).toFixed(1)}%, badCase=${(metrics.badCaseRate * 100).toFixed(1)}%)`,
        );

        // 检查自动止损
        const autoStopResult = await this.checkAutoStopLoss(experimentId, experiment, snapshot);

        return {
            recorded: true,
            autoStopped: autoStopResult.stopped,
            reason: autoStopResult.reason,
        };
    }

    /**
     * 检查自动止损条件
     * 当任一变体的 badCaseRate 超过阈值且样本量 ≥ 10 时自动中止
     */
    private async checkAutoStopLoss(
        experimentId: string,
        experiment: { autoStopEnabled: boolean; badCaseThreshold: number; experimentCode: string },
        snapshot: MetricsSnapshotInternal,
    ): Promise<{ stopped: boolean; reason?: string }> {
        if (!experiment.autoStopEnabled) {
            return { stopped: false };
        }

        const MIN_SAMPLE_SIZE = 10;
        const threshold = experiment.badCaseThreshold;

        for (const variantKey of ['variantA', 'variantB'] as const) {
            const metrics = snapshot[variantKey];
            if (metrics.totalExecutions >= MIN_SAMPLE_SIZE && metrics.badCaseRate > threshold) {
                const variantLabel = variantKey === 'variantA' ? 'A' : 'B';
                const reason = `变体 ${variantLabel} badCaseRate=${(metrics.badCaseRate * 100).toFixed(1)}% 超过阈值 ${(threshold * 100).toFixed(0)}%（样本=${metrics.totalExecutions}），自动止损`;

                this.logger.warn(`实验 ${experiment.experimentCode}: ${reason}`);

                await this.prisma.workflowExperiment.update({
                    where: { id: experimentId },
                    data: {
                        status: 'ABORTED',
                        endedAt: new Date(),
                        conclusionSummary: `[自动止损] ${reason}`,
                    },
                });

                return { stopped: true, reason };
            }
        }

        return { stopped: false };
    }

    /**
     * 读取或初始化指标快照
     */
    private readMetricsSnapshot(raw: unknown): MetricsSnapshotInternal {
        const defaultVariant = (): VariantMetrics => ({
            totalExecutions: 0,
            successCount: 0,
            failureCount: 0,
            successRate: 0,
            avgDurationMs: 0,
            p95DurationMs: 0,
            badCaseRate: 0,
        });

        if (!raw || typeof raw !== 'object') {
            return {
                variantA: defaultVariant(),
                variantB: defaultVariant(),
                lastUpdatedAt: new Date().toISOString(),
            };
        }

        const obj = raw as Record<string, unknown>;
        return {
            variantA: (obj.variantA as VariantMetrics) ?? defaultVariant(),
            variantB: (obj.variantB as VariantMetrics) ?? defaultVariant(),
            lastUpdatedAt: (obj.lastUpdatedAt as string) ?? new Date().toISOString(),
        };
    }

    /**
     * 删除
     */
    async remove(userId: string, id: string) {
        const existing = await this.prisma.workflowExperiment.findFirst({
            where: { id, createdByUserId: userId },
        });
        if (!existing) throw new NotFoundException('实验不存在');
        if (existing.status === 'RUNNING') {
            throw new BadRequestException('运行中的实验不可删除，请先暂停或中止');
        }

        await this.prisma.workflowExperiment.delete({ where: { id } });
        return { deleted: true };
    }

    // ── ExperimentRun 方法 ──

    /**
     * 查询实验运行明细
     */
    async findRuns(query: ExperimentRunQueryDto) {
        if (!query.experimentId) {
            throw new BadRequestException('experimentId is required');
        }
        const where: Prisma.WorkflowExperimentRunWhereInput = {
            experimentId: query.experimentId,
        };

        if (query.variant) where.variant = query.variant;
        if (query.success !== undefined) where.success = query.success;

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;

        const [data, total] = await Promise.all([
            this.prisma.workflowExperimentRun.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.workflowExperimentRun.count({ where }),
        ]);

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    /**
     * 获取实验评估数据（综合看板用）
     */
    async getEvaluation(userId: string, experimentId: string) {
        const experiment = await this.prisma.workflowExperiment.findFirst({
            where: { id: experimentId, createdByUserId: userId },
        });
        if (!experiment) throw new NotFoundException('实验不存在');

        const metrics = this.readMetricsSnapshot(experiment.metricsSnapshot);

        const recentRuns = await this.prisma.workflowExperimentRun.findMany({
            where: { experimentId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        // 计算变体对比
        let variantComparison = null;
        if (metrics.variantA.totalExecutions > 0 && metrics.variantB.totalExecutions > 0) {
            const successRateDelta = metrics.variantA.successRate - metrics.variantB.successRate;
            const avgDurationDelta = metrics.variantA.avgDurationMs - metrics.variantB.avgDurationMs;

            // 计算变体平均置信度
            const runsA = recentRuns.filter((r) => r.variant === 'A' && r.confidence !== null);
            const runsB = recentRuns.filter((r) => r.variant === 'B' && r.confidence !== null);
            const avgConfA = runsA.length > 0
                ? runsA.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / runsA.length
                : null;
            const avgConfB = runsB.length > 0
                ? runsB.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / runsB.length
                : null;

            let recommendation = '样本量不足，建议继续实验';
            const totalRuns = metrics.variantA.totalExecutions + metrics.variantB.totalExecutions;
            if (totalRuns >= 20) {
                if (Math.abs(successRateDelta) > 0.1) {
                    recommendation = successRateDelta > 0
                        ? '变体 A 成功率显著优于 B，建议选择 A'
                        : '变体 B 成功率显著优于 A，建议选择 B';
                } else if (Math.abs(avgDurationDelta) > 1000) {
                    recommendation = avgDurationDelta < 0
                        ? '变体 A 平均耗时更短，建议选择 A'
                        : '变体 B 平均耗时更短，建议选择 B';
                } else {
                    recommendation = '两个变体表现相近，建议增加样本量或观察更多指标';
                }
            }

            variantComparison = {
                successRateDelta,
                avgDurationDelta,
                confidenceDeltaA: avgConfA,
                confidenceDeltaB: avgConfB,
                recommendation,
            };
        }

        return {
            experiment,
            metrics,
            recentRuns,
            variantComparison,
        };
    }
}

// ── 内部类型 ──

interface VariantMetrics {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    badCaseRate: number;
}

interface MetricsSnapshotInternal {
    variantA: VariantMetrics;
    variantB: VariantMetrics;
    lastUpdatedAt: string;
}
