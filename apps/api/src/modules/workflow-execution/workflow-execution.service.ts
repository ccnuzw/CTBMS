import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import {
  WorkflowExecutionRunnerService,
  type ExperimentRoutingContext,
} from './workflow-execution-runner.service';
import {
  CancelWorkflowExecutionDto,
  canonicalizeWorkflowDsl,
  TriggerWorkflowExecutionDto,
  WorkflowDslSchema,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { DagScheduler } from './engine/dag-scheduler';
import { WorkflowExperimentService } from '../workflow-experiment/workflow-experiment.service';
import { ExecutionLogService } from './execution-log.service';
import { WorkflowExecutionReplayService } from './workflow-execution-replay.service';
import { WorkflowExecutionContextService } from './workflow-execution-context.service';
import { WorkflowExecutionDagService } from './workflow-execution-dag.service';
import * as ExecutionUtils from './workflow-execution.utils';
import { WorkflowExecutionHandledError } from './workflow-execution.utils';

type NullableExperimentRoutingContext = ExperimentRoutingContext | null;

const MAX_SUBFLOW_DEPTH = 4;

@Injectable()
export class WorkflowExecutionService {
  constructor(
    @Inject(forwardRef(() => WorkflowExecutionRunnerService))
    public readonly runnerService: WorkflowExecutionRunnerService,
    private readonly prisma: PrismaService,
    private readonly dagScheduler: DagScheduler,
    private readonly workflowExperimentService: WorkflowExperimentService,
    private readonly executionLogService: ExecutionLogService,
    private readonly executionReplayService: WorkflowExecutionReplayService,
    private readonly dagService: WorkflowExecutionDagService,
    private readonly contextService: WorkflowExecutionContextService,
  ) {}

  async trigger(
    ownerUserId: string,
    dto: TriggerWorkflowExecutionDto,
    options?: { sourceExecutionId?: string; subflowDepth?: number; subflowPath?: string[] },
  ) {
    const subflowDepth = options?.subflowDepth ?? 0;
    if (subflowDepth > MAX_SUBFLOW_DEPTH) {
      throw new BadRequestException(`子流程嵌套层级超过限制（>${MAX_SUBFLOW_DEPTH}）`);
    }

    const definition = await this.prisma.workflowDefinition.findFirst({
      where: {
        id: dto.workflowDefinitionId,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
    });

    if (!definition) {
      throw new NotFoundException('流程不存在或无权限执行');
    }
    const subflowPath = options?.subflowPath ?? [];
    if (subflowPath.includes(definition.id)) {
      throw new BadRequestException(
        `检测到子流程循环调用: ${[...subflowPath, definition.id].join(' -> ')}`,
      );
    }
    const nextSubflowPath = [...subflowPath, definition.id];

    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    if (idempotencyKey && dto.experimentId) {
      const existingExecution = await this.prisma.workflowExecution.findFirst({
        where: {
          triggerUserId: ownerUserId,
          idempotencyKey,
          workflowVersion: {
            workflowDefinitionId: definition.id,
          },
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
          runtimeEvents: {
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (existingExecution) {
        await this.executionLogService.recordRuntimeEvent({
          workflowExecutionId: existingExecution.id,
          eventType: 'EXECUTION_IDEMPOTENT_HIT',
          level: 'INFO',
          message: '命中幂等键，复用已有执行实例',
          detail: {
            idempotencyKey,
            experimentId: dto.experimentId,
          },
        });
        return existingExecution;
      }
    }

    let experimentRouting: NullableExperimentRoutingContext = null;
    let targetWorkflowVersionId = dto.workflowVersionId;
    if (dto.experimentId) {
      const routed = await this.workflowExperimentService.routeTraffic(dto.experimentId);
      targetWorkflowVersionId = routed.versionId;
      experimentRouting = {
        experimentId: dto.experimentId,
        variant: routed.variant,
      };
    }

    const version = targetWorkflowVersionId
      ? await this.prisma.workflowVersion.findFirst({
          where: {
            id: targetWorkflowVersionId,
            workflowDefinitionId: definition.id,
          },
        })
      : await this.prisma.workflowVersion.findFirst({
          where: {
            workflowDefinitionId: definition.id,
            status: 'PUBLISHED',
          },
          orderBy: { createdAt: 'desc' },
        });

    if (!version) {
      throw new BadRequestException('未找到可执行版本，请先发布至少一个版本');
    }

    if (idempotencyKey) {
      const existingExecution = await this.prisma.workflowExecution.findFirst({
        where: {
          workflowVersionId: version.id,
          triggerUserId: ownerUserId,
          idempotencyKey,
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
          runtimeEvents: {
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (existingExecution) {
        await this.executionLogService.recordRuntimeEvent({
          workflowExecutionId: existingExecution.id,
          eventType: 'EXECUTION_IDEMPOTENT_HIT',
          level: 'INFO',
          message: '命中幂等键，复用已有执行实例',
          detail: {
            idempotencyKey,
          },
        });
        return existingExecution;
      }
    }

    const parsedDsl = WorkflowDslSchema.safeParse(version.dslSnapshot);
    if (!parsedDsl.success) {
      throw new BadRequestException({
        message: '流程 DSL 快照解析失败',
        issues: parsedDsl.error.issues,
      });
    }

    const dsl = canonicalizeWorkflowDsl(parsedDsl.data);
    const bindingSnapshot = await this.contextService.buildBindingSnapshot(
      ownerUserId,
      dsl,
      dto.paramSnapshot,
    );
    const mergedParamSnapshot = this.contextService.mergeParamSnapshot(
      dto.paramSnapshot,
      bindingSnapshot,
    );

    let execution: { id: string };
    try {
      execution = await this.prisma.workflowExecution.create({
        data: {
          workflowVersionId: version.id,
          sourceExecutionId: options?.sourceExecutionId,
          triggerType: dto.triggerType,
          triggerUserId: ownerUserId,
          idempotencyKey,
          status: 'RUNNING',
          startedAt: new Date(),
          paramSnapshot: mergedParamSnapshot
            ? ExecutionUtils.toJsonValue(mergedParamSnapshot)
            : undefined,
        },
      });
    } catch (error) {
      if (idempotencyKey && ExecutionUtils.isUniqueConstraintError(error)) {
        const existingExecution = await this.prisma.workflowExecution.findFirst({
          where: {
            workflowVersionId: version.id,
            triggerUserId: ownerUserId,
            idempotencyKey,
          },
          include: {
            nodeExecutions: {
              orderBy: { createdAt: 'asc' },
            },
            runtimeEvents: {
              orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
            },
          },
        });
        if (existingExecution) {
          return existingExecution;
        }
      }
      throw error;
    }
    await this.executionLogService.recordRuntimeEvent({
      workflowExecutionId: execution.id,
      eventType: 'EXECUTION_STARTED',
      level: 'INFO',
      message: '执行开始',
      detail: {
        workflowDefinitionId: definition.id,
        workflowVersionId: version.id,
        triggerType: dto.triggerType,
        sourceExecutionId: options?.sourceExecutionId ?? null,
        subflowDepth,
        subflowPath: nextSubflowPath,
        idempotencyKey: idempotencyKey ?? null,
        experimentId: experimentRouting?.experimentId ?? null,
        experimentVariant: experimentRouting?.variant ?? null,
      },
    });

    const workflowAgentStrictModeEnabled = await this.dagService.isWorkflowAgentStrictModeEnabled();

    if (dsl.mode === 'DAG') {
      return this.runnerService.executeDagWorkflow({
        executionId: execution.id,
        ownerUserId,
        dsl,
        paramSnapshot: mergedParamSnapshot,
        experimentRouting,
        subflowDepth,
        subflowPath: nextSubflowPath,
        workflowDefinitionId: definition.id,
        strictModeEnabled: workflowAgentStrictModeEnabled,
      });
    }

    return this.runnerService.executeLinearWorkflow({
      executionId: execution.id,
      ownerUserId,
      dsl,
      paramSnapshot: mergedParamSnapshot,
      experimentRouting,
      subflowDepth,
      subflowPath: nextSubflowPath,
      workflowDefinitionId: definition.id,
      strictModeEnabled: workflowAgentStrictModeEnabled,
    });
  }

  async rerun(ownerUserId: string, id: string) {
    const sourceExecution = await this.prisma.workflowExecution.findUnique({
      where: { id },
      include: {
        workflowVersion: {
          include: {
            workflowDefinition: {
              select: {
                ownerUserId: true,
              },
            },
          },
        },
      },
    });

    if (!sourceExecution) {
      throw new NotFoundException('运行实例不存在或无权限访问');
    }
    const definitionOwnerUserId = sourceExecution.workflowVersion.workflowDefinition.ownerUserId;
    if (sourceExecution.triggerUserId !== ownerUserId && definitionOwnerUserId !== ownerUserId) {
      throw new NotFoundException('运行实例不存在或无权限访问');
    }
    if (sourceExecution.status !== 'FAILED') {
      throw new BadRequestException('仅失败实例支持重跑');
    }

    return this.trigger(
      ownerUserId,
      {
        workflowDefinitionId: sourceExecution.workflowVersion.workflowDefinitionId,
        workflowVersionId: sourceExecution.workflowVersionId,
        triggerType: 'MANUAL',
        paramSnapshot: ExecutionUtils.toRecord(sourceExecution.paramSnapshot),
      },
      {
        sourceExecutionId: sourceExecution.id,
      },
    );
  }

  async cancel(ownerUserId: string, id: string, dto: CancelWorkflowExecutionDto) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id },
      include: {
        workflowVersion: {
          include: {
            workflowDefinition: {
              select: {
                ownerUserId: true,
              },
            },
          },
        },
        nodeExecutions: {
          orderBy: { createdAt: 'asc' },
        },
        runtimeEvents: {
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!execution) {
      throw new NotFoundException('运行实例不存在或无权限访问');
    }
    const definitionOwnerUserId = execution.workflowVersion.workflowDefinition.ownerUserId;
    if (execution.triggerUserId !== ownerUserId && definitionOwnerUserId !== ownerUserId) {
      throw new NotFoundException('运行实例不存在或无权限访问');
    }
    if (execution.status === 'SUCCESS' || execution.status === 'FAILED') {
      throw new BadRequestException(`当前状态不允许取消: ${execution.status}`);
    }
    if (execution.status === 'CANCELED') {
      return execution;
    }

    const reason = dto.reason?.trim() || '手动取消执行';
    await this.executionLogService.recordRuntimeEvent({
      workflowExecutionId: id,
      eventType: 'EXECUTION_CANCEL_REQUESTED',
      level: 'WARN',
      message: '收到取消执行请求',
      detail: {
        reason,
        requestedByUserId: ownerUserId,
      },
    });

    return this.prisma.workflowExecution.update({
      where: { id },
      data: {
        status: 'CANCELED',
        completedAt: new Date(),
        errorMessage: reason,
        failureCategory: 'CANCELED',
        failureCode: 'EXECUTION_CANCELED',
      },
      include: {
        nodeExecutions: {
          orderBy: { createdAt: 'asc' },
        },
        runtimeEvents: {
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  public async throwIfExecutionCanceled(executionId: string): Promise<void> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      select: { status: true, errorMessage: true },
    });
    if (!execution) {
      throw new WorkflowExecutionHandledError(
        '执行实例不存在',
        'INTERNAL',
        'EXECUTION_INTERNAL_ERROR',
      );
    }
    if (execution.status === 'CANCELED') {
      throw new WorkflowExecutionHandledError(
        execution.errorMessage || '执行已被取消',
        'CANCELED',
        'EXECUTION_CANCELED',
        'CANCELED',
      );
    }
  }
}
