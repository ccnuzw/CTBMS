import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { WorkflowDsl, WorkflowDslSchema, canonicalizeWorkflowDsl } from '@packages/types';
import { VariableResolver } from './engine/variable-resolver';
import { EvidenceCollector } from './engine/evidence-collector';
import { ReplayAssembler, type ExecutionReplayBundle } from './engine/replay-assembler';
import { toRecord } from './workflow-execution.utils';

@Injectable()
export class WorkflowExecutionReplayService {
  private readonly logger = new Logger(WorkflowExecutionReplayService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly variableResolver: VariableResolver,
        private readonly evidenceCollector: EvidenceCollector,
        private readonly replayAssembler: ReplayAssembler,
    ) { }

    async replay(ownerUserId: string, id: string) {
        await this.ensureExecutionReadable(ownerUserId, id);
        return this.assembleReplayBundle(id);
    }

    async assembleReplayBundle(
        executionId: string,
        dslOverride?: WorkflowDsl,
    ): Promise<ExecutionReplayBundle> {
        const execution = await this.prisma.workflowExecution.findUnique({
            where: { id: executionId },
            include: {
                workflowVersion: {
                    select: {
                        id: true,
                        workflowDefinitionId: true,
                        dslSnapshot: true,
                    },
                },
                nodeExecutions: {
                    orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!execution) {
            throw new NotFoundException('运行实例不存在');
        }

        const parsedDsl = dslOverride
            ? { success: true as const, data: dslOverride }
            : WorkflowDslSchema.safeParse(execution.workflowVersion.dslSnapshot);
        if (!parsedDsl.success) {
            throw new BadRequestException({
                message: '流程 DSL 快照解析失败',
                issues: parsedDsl.error.issues,
            });
        }
        const dsl = canonicalizeWorkflowDsl(parsedDsl.data);

        const outputsByNode = new Map<string, Record<string, unknown>>();
        for (const nodeExecution of execution.nodeExecutions) {
            outputsByNode.set(nodeExecution.nodeId, toRecord(nodeExecution.outputSnapshot) ?? {});
        }

        const evidenceBundle = this.evidenceCollector.collect(dsl.nodes, outputsByNode);
        const dataLineage = this.variableResolver.buildLineageGraph(dsl.nodes, dsl.edges, outputsByNode);
        const nodeSnapshots = this.replayAssembler.buildNodeSnapshots(execution.nodeExecutions, dsl.nodes);

        return this.replayAssembler.assemble({
            executionId: execution.id,
            workflowDefinitionId: execution.workflowVersion.workflowDefinitionId,
            workflowVersionId: execution.workflowVersion.id,
            triggerType: execution.triggerType,
            triggerUserId: execution.triggerUserId,
            status: execution.status,
            startedAt: execution.startedAt ?? execution.createdAt,
            completedAt: execution.completedAt ?? execution.startedAt ?? execution.createdAt,
            paramSnapshot: toRecord(execution.paramSnapshot),
            dsl,
            nodeSnapshots,
            evidenceBundle,
            dataLineage,
        });
    }

    async persistReplayBundle(
        executionId: string,
        dslOverride?: WorkflowDsl,
    ): Promise<ExecutionReplayBundle | null> {
        try {
            const replayBundle = await this.assembleReplayBundle(executionId, dslOverride);
            const execution = await this.prisma.workflowExecution.findUnique({
                where: { id: executionId },
                select: { outputSnapshot: true },
            });
            const existingOutput = toRecord(execution?.outputSnapshot);
            await this.prisma.workflowExecution.update({
                where: { id: executionId },
                data: {
                    outputSnapshot: JSON.parse(
                        JSON.stringify({
                            ...(existingOutput ?? {}),
                            evidenceBundle: replayBundle.evidenceBundle,
                            dataLineage: replayBundle.dataLineage,
                            replayBundle,
                        }),
                    ),
                },
            });
            return replayBundle;
        } catch (e) {
            this.logger.warn('Operation failed silently, returning null', e instanceof Error ? e.message : String(e));
            return null;
        }
    }

    private async ensureExecutionReadable(ownerUserId: string, id: string) {
        const execution = await this.prisma.workflowExecution.findFirst({
            where: {
                id,
                OR: [
                    { triggerUserId: ownerUserId },
                    { workflowVersion: { workflowDefinition: { ownerUserId } } },
                ],
            },
            select: { id: true },
        });

        if (!execution) {
            throw new NotFoundException('运行实例不存在或无权限访问');
        }

        return execution;
    }
}
