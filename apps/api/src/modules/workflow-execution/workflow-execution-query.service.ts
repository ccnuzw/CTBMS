import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';
import { DebateTraceService } from '../debate-trace/debate-trace.service';
import type { WorkflowExecutionQueryDto, WorkflowRuntimeEventQueryDto, DebateReplayQueryDto } from '@packages/types';

@Injectable()
export class WorkflowExecutionQueryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly debateTraceService: DebateTraceService,
    ) { }

    async findAll(ownerUserId: string, query: WorkflowExecutionQueryDto) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const where = this.buildAccessibleWhere(ownerUserId, query);

        const [data, total] = await Promise.all([
            this.prisma.workflowExecution.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ createdAt: 'desc' }],
                include: {
                    workflowVersion: {
                        include: {
                            workflowDefinition: true,
                        },
                    },
                },
            }),
            this.prisma.workflowExecution.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async findOne(ownerUserId: string, id: string) {
        const execution = await this.prisma.workflowExecution.findFirst({
            where: {
                id,
                ...this.buildExecutionReadableWhere(ownerUserId),
            },
            include: {
                workflowVersion: {
                    include: {
                        workflowDefinition: true,
                    },
                },
                nodeExecutions: {
                    orderBy: [{ createdAt: 'asc' }],
                },
                runtimeEvents: {
                    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!execution) {
            throw new NotFoundException('运行实例不存在或无权限访问');
        }

        return execution;
    }

    async timeline(ownerUserId: string, id: string, query: WorkflowRuntimeEventQueryDto) {
        await this.ensureExecutionReadable(ownerUserId, id);

        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 50;
        const where: Prisma.WorkflowRuntimeEventWhereInput = {
            workflowExecutionId: id,
            ...(query.eventType ? { eventType: query.eventType } : {}),
            ...(query.level ? { level: query.level } : {}),
        };

        const [data, total] = await Promise.all([
            this.prisma.workflowRuntimeEvent.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.workflowRuntimeEvent.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async debateTraces(ownerUserId: string, id: string, query: DebateReplayQueryDto) {
        await this.ensureExecutionReadable(ownerUserId, id);
        return this.debateTraceService.findByExecution({
            workflowExecutionId: id,
            roundNumber: query.roundNumber,
            participantCode: query.participantCode,
            participantRole: query.participantRole,
            isJudgement: query.isJudgement,
            keyword: query.keyword,
        });
    }

    async debateTimeline(ownerUserId: string, id: string) {
        await this.ensureExecutionReadable(ownerUserId, id);
        return this.debateTraceService.getDebateTimeline(id);
    }

    async ensureExecutionReadable(ownerUserId: string, id: string) {
        const execution = await this.prisma.workflowExecution.findFirst({
            where: {
                id,
                ...this.buildExecutionReadableWhere(ownerUserId),
            },
            select: { id: true },
        });

        if (!execution) {
            throw new NotFoundException('运行实例不存在或无权限访问');
        }

        return execution;
    }

    private buildExecutionReadableWhere(ownerUserId: string): Prisma.WorkflowExecutionWhereInput {
        return {
            OR: [
                { triggerUserId: ownerUserId },
                { workflowVersion: { workflowDefinition: { ownerUserId } } },
            ],
        };
    }

    private buildAccessibleWhere(
        ownerUserId: string,
        query: WorkflowExecutionQueryDto,
    ): Prisma.WorkflowExecutionWhereInput {
        const conditions: Prisma.WorkflowExecutionWhereInput[] = [
            this.buildExecutionReadableWhere(ownerUserId),
        ];

        if (query.workflowDefinitionId) {
            conditions.push({
                workflowVersion: {
                    workflowDefinition: { id: query.workflowDefinitionId },
                },
            });
        }

        if (query.workflowVersionId) {
            conditions.push({ workflowVersionId: query.workflowVersionId });
        }
        if (query.triggerType) {
            conditions.push({ triggerType: query.triggerType });
        }
        if (query.status) {
            conditions.push({ status: query.status });
        }
        if (query.failureCategory) {
            conditions.push({ failureCategory: query.failureCategory });
        }
        const failureCode = query.failureCode?.trim();
        if (failureCode) {
            conditions.push({
                failureCode: { contains: failureCode, mode: 'insensitive' },
            });
        }
        if (query.riskLevel) {
            conditions.push({
                OR: [
                    { outputSnapshot: { path: ['riskGate', 'riskLevel'], equals: query.riskLevel } },
                    { nodeExecutions: { some: { nodeType: 'risk-gate', outputSnapshot: { path: ['riskLevel'], equals: query.riskLevel } } } },
                ],
            });
        }
        if (query.degradeAction) {
            conditions.push({
                OR: [
                    { outputSnapshot: { path: ['riskGate', 'degradeAction'], equals: query.degradeAction } },
                    { nodeExecutions: { some: { nodeType: 'risk-gate', outputSnapshot: { path: ['degradeAction'], equals: query.degradeAction } } } },
                ],
            });
        }
        const riskProfileCode = query.riskProfileCode?.trim();
        if (riskProfileCode) {
            conditions.push({
                OR: [
                    { outputSnapshot: { path: ['riskGate', 'riskProfileCode'], string_contains: riskProfileCode } },
                    { nodeExecutions: { some: { nodeType: 'risk-gate', outputSnapshot: { path: ['riskProfileCode'], string_contains: riskProfileCode } } } },
                ],
            });
        }
        const riskReasonKeyword = query.riskReasonKeyword?.trim();
        if (riskReasonKeyword) {
            conditions.push({
                OR: [
                    { outputSnapshot: { path: ['riskGate', 'blockReason'], string_contains: riskReasonKeyword } },
                    { nodeExecutions: { some: { nodeType: 'risk-gate', outputSnapshot: { path: ['blockReason'], string_contains: riskReasonKeyword } } } },
                ],
            });
        }
        if (query.hasSoftFailure) {
            conditions.push({
                status: 'SUCCESS',
                nodeExecutions: { some: { status: 'FAILED' } },
            });
        }
        if (query.hasErrorRoute) {
            conditions.push({
                nodeExecutions: {
                    some: {
                        status: 'SKIPPED',
                        errorMessage: { contains: 'ROUTE_TO_ERROR', mode: 'insensitive' },
                    },
                },
            });
        }
        if (query.hasRiskBlocked) {
            conditions.push({
                OR: [
                    { outputSnapshot: { path: ['riskGate', 'riskGateBlocked'], equals: true } },
                    { nodeExecutions: { some: { nodeType: 'risk-gate', outputSnapshot: { path: ['riskGateBlocked'], equals: true } } } },
                ],
            });
        }
        if (query.hasRiskGateNode !== undefined) {
            conditions.push(
                query.hasRiskGateNode
                    ? { nodeExecutions: { some: { nodeType: 'risk-gate' } } }
                    : { nodeExecutions: { none: { nodeType: 'risk-gate' } } },
            );
        }
        if (query.hasRiskSummary !== undefined) {
            const riskSummaryPath = ['riskGate', 'summarySchemaVersion'];
            conditions.push(
                query.hasRiskSummary
                    ? { NOT: { outputSnapshot: { path: riskSummaryPath, equals: Prisma.AnyNull } } }
                    : { outputSnapshot: { path: riskSummaryPath, equals: Prisma.AnyNull } },
            );
        }

        const versionCode = query.versionCode?.trim();
        if (versionCode) {
            conditions.push({
                workflowVersion: { versionCode: { contains: versionCode, mode: 'insensitive' } },
            });
        }

        const keyword = query.keyword?.trim();
        if (keyword) {
            conditions.push({
                OR: [
                    { id: { contains: keyword } },
                    {
                        workflowVersion: {
                            OR: [
                                { versionCode: { contains: keyword, mode: 'insensitive' } },
                                {
                                    workflowDefinition: {
                                        OR: [
                                            { name: { contains: keyword, mode: 'insensitive' } },
                                            { workflowId: { contains: keyword, mode: 'insensitive' } },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
            });
        }

        if (query.startedAtFrom || query.startedAtTo) {
            conditions.push({
                startedAt: {
                    ...(query.startedAtFrom ? { gte: query.startedAtFrom } : {}),
                    ...(query.startedAtTo ? { lte: query.startedAtTo } : {}),
                },
            });
        }

        if (conditions.length === 1) {
            return conditions[0];
        }

        return { AND: conditions };
    }
}
