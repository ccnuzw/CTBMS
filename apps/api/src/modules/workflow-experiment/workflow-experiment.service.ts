import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
    CreateWorkflowExperimentDto,
    UpdateWorkflowExperimentDto,
    WorkflowExperimentQueryDto,
    ConcludeExperimentDto,
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
}
