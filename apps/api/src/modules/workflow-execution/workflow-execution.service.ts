import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CancelWorkflowExecutionDto,
  canonicalizeWorkflowDsl,
  TriggerWorkflowExecutionDto,
  WorkflowDsl,
  WorkflowRunPolicy,
  WorkflowEdge,
  WorkflowDslSchema,
  WorkflowNode,
  WorkflowNodeOnErrorPolicyEnum,
  WorkflowNodeRuntimePolicy,
  WorkflowNodeRuntimePolicySchema,
  WorkflowExecutionQueryDto,
  WorkflowFailureCategory,
  WorkflowRuntimeEventQueryDto,
  type ParameterScopeLevel,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { DebateTraceService } from '../debate-trace/debate-trace.service';
import type { DebateReplayQueryDto } from '@packages/types';
import { VariableResolver } from './engine/variable-resolver';
import { EvidenceCollector } from './engine/evidence-collector';
import { DagScheduler } from './engine/dag-scheduler';
import { ReplayAssembler, type ExecutionReplayBundle } from './engine/replay-assembler';
import { WorkflowExperimentService } from '../workflow-experiment/workflow-experiment.service';
import type { NodeExecutionResult } from './engine/node-executor.interface';

type WorkflowFailureCode =
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_CANCELED'
  | 'NODE_TIMEOUT'
  | 'NODE_EXECUTOR_ERROR'
  | 'NODE_RESULT_FAILED'
  | 'EXECUTION_INTERNAL_ERROR';

class WorkflowExecutionHandledError extends Error {
  constructor(
    message: string,
    readonly failureCategory: WorkflowFailureCategory,
    readonly failureCode: WorkflowFailureCode,
    readonly targetStatus: 'FAILED' | 'CANCELED' = 'FAILED',
  ) {
    super(message);
    this.name = 'WorkflowExecutionHandledError';
  }
}

class WorkflowTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowTimeoutError';
  }
}

type ExperimentRoutingContext = {
  experimentId: string;
  variant: 'A' | 'B';
} | null;

const MAX_SUBFLOW_DEPTH = 4;
const WORKFLOW_PARAM_SCOPE_PRIORITY: ParameterScopeLevel[] = [
  'PUBLIC_TEMPLATE',
  'USER_TEMPLATE',
  'GLOBAL',
  'COMMODITY',
  'REGION',
  'ROUTE',
  'STRATEGY',
  'SESSION',
];

@Injectable()
export class WorkflowExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeExecutorRegistry: NodeExecutorRegistry,
    private readonly debateTraceService: DebateTraceService,
    private readonly variableResolver: VariableResolver,
    private readonly evidenceCollector: EvidenceCollector,
    private readonly replayAssembler: ReplayAssembler,
    private readonly dagScheduler: DagScheduler,
    private readonly workflowExperimentService: WorkflowExperimentService,
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
      throw new BadRequestException(`检测到子流程循环调用: ${[...subflowPath, definition.id].join(' -> ')}`);
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
        await this.recordRuntimeEvent({
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

    let experimentRouting: ExperimentRoutingContext = null;
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
        await this.recordRuntimeEvent({
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
    const bindingSnapshot = await this.buildBindingSnapshot(ownerUserId, dsl, dto.paramSnapshot);
    const mergedParamSnapshot = this.mergeParamSnapshot(dto.paramSnapshot, bindingSnapshot);

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
          paramSnapshot: mergedParamSnapshot ? this.toJsonValue(mergedParamSnapshot) : undefined,
        },
      });
    } catch (error) {
      if (idempotencyKey && this.isUniqueConstraintError(error)) {
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
    await this.recordRuntimeEvent({
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

    if (dsl.mode === 'DAG') {
      return this.executeDagWorkflow({
        executionId: execution.id,
        ownerUserId,
        dsl,
        paramSnapshot: mergedParamSnapshot,
        experimentRouting,
        subflowDepth,
        subflowPath: nextSubflowPath,
        workflowDefinitionId: definition.id,
      });
    }

    const sortedNodes = this.sortNodesByEdges(dsl);
    const incomingEdgeMap = this.buildIncomingEdgeMap(dsl.edges);
    const outgoingEdgeMap = this.buildOutgoingEdgeMap(dsl.edges);
    const outputsByNode = new Map<string, Record<string, unknown>>();
    const skipReasonByNode = new Map<string, string>();
    let softFailureCount = 0;
    const buildExecutionOutputSnapshot = (nodeCount: number) => {
      const latestExecutedNodeId = Array.from(outputsByNode.keys()).at(-1);
      const latestExecutedNode = latestExecutedNodeId
        ? sortedNodes.find((node) => node.id === latestExecutedNodeId)
        : undefined;
      const latestRiskGateNode = [...sortedNodes]
        .reverse()
        .find((node) => node.type === 'risk-gate' && outputsByNode.has(node.id));
      const latestRiskGateOutput = latestRiskGateNode
        ? outputsByNode.get(latestRiskGateNode.id)
        : undefined;
      const riskGateSummary = this.extractRiskGateSummary(latestRiskGateOutput);

      return {
        nodeCount,
        latestNodeId: latestExecutedNode?.id ?? null,
        latestNodeType: latestExecutedNode?.type ?? null,
        softFailureCount,
        riskGate: riskGateSummary,
      };
    };

    try {
      for (const node of sortedNodes) {
        await this.throwIfExecutionCanceled(execution.id);
        const existingSkipReason = skipReasonByNode.get(node.id);
        if (existingSkipReason) {
          const now = new Date();
          const skippedOutput = {
            skipped: true,
            skipType: 'ROUTE_TO_ERROR',
            skipReason: existingSkipReason,
            nodeId: node.id,
            nodeType: node.type,
            _meta: {
              skipType: 'ROUTE_TO_ERROR',
            },
          };
          const skippedNodeExecution = await this.prisma.nodeExecution.create({
            data: {
              workflowExecutionId: execution.id,
              nodeId: node.id,
              nodeType: node.type,
              status: 'SKIPPED',
              startedAt: now,
              completedAt: now,
              durationMs: 0,
              errorMessage: existingSkipReason,
              inputSnapshot: this.toJsonValue({}),
              outputSnapshot: this.toJsonValue(skippedOutput),
            },
          });
          await this.recordRuntimeEvent({
            workflowExecutionId: execution.id,
            nodeExecutionId: skippedNodeExecution.id,
            eventType: 'NODE_SKIPPED',
            level: 'WARN',
            message: `节点 ${node.name} 已跳过`,
            detail: {
              nodeId: node.id,
              nodeType: node.type,
              reason: existingSkipReason,
            },
          });
          outputsByNode.set(node.id, skippedOutput);
          continue;
        }

        const incomingSelection = this.selectLinearIncomingEdges(
          node.id,
          incomingEdgeMap,
          outputsByNode,
          mergedParamSnapshot,
        );
        if (incomingSelection.hasIncoming && incomingSelection.activeEdges.length === 0) {
          const skipReason = `节点 ${node.name} 无满足条件的入边`;
          const now = new Date();
          const skippedOutput = {
            skipped: true,
            skipType: 'CONDITION_NOT_MATCHED',
            skipReason,
            nodeId: node.id,
            nodeType: node.type,
            _meta: {
              skipType: 'CONDITION_NOT_MATCHED',
            },
          };
          const skippedNodeExecution = await this.prisma.nodeExecution.create({
            data: {
              workflowExecutionId: execution.id,
              nodeId: node.id,
              nodeType: node.type,
              status: 'SKIPPED',
              startedAt: now,
              completedAt: now,
              durationMs: 0,
              errorMessage: skipReason,
              inputSnapshot: this.toJsonValue({}),
              outputSnapshot: this.toJsonValue(skippedOutput),
            },
          });
          await this.recordRuntimeEvent({
            workflowExecutionId: execution.id,
            nodeExecutionId: skippedNodeExecution.id,
            eventType: 'NODE_SKIPPED',
            level: 'WARN',
            message: `节点 ${node.name} 已跳过`,
            detail: {
              nodeId: node.id,
              nodeType: node.type,
              reason: skipReason,
            },
          });
          outputsByNode.set(node.id, skippedOutput);
          continue;
        }

        const startedAt = new Date();
        const rawInputSnapshot = this.buildNodeInputFromEdges(
          incomingSelection.activeEdges,
          outputsByNode,
        );
        const nodeParamSnapshot = this.resolveNodeParamSnapshot(node, mergedParamSnapshot);
        const inputSnapshot = this.resolveNodeInputBindings({
          node,
          rawInputSnapshot,
          outputsByNode,
          paramSnapshot: nodeParamSnapshot,
          executionId: execution.id,
          triggerUserId: ownerUserId,
        });
        const nodeExecutor = this.nodeExecutorRegistry.resolve(node);
        const runtimePolicy = this.resolveRuntimePolicy(node, dsl.runPolicy);

        let status: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SUCCESS';
        let errorMessage: string | null = null;
        let outputSnapshot: Record<string, unknown> = {};
        let attempts = 0;
        let failureCategory: WorkflowFailureCategory | null = null;
        let failureCode: WorkflowFailureCode | null = null;
        await this.recordRuntimeEvent({
          workflowExecutionId: execution.id,
          eventType: 'NODE_STARTED',
          level: 'INFO',
          message: `节点 ${node.name} 开始执行`,
          detail: {
            nodeId: node.id,
            nodeType: node.type,
            retryCount: runtimePolicy.retryCount,
            timeoutMs: runtimePolicy.timeoutMs,
          },
        });

        for (let attempt = 0; attempt <= runtimePolicy.retryCount; attempt += 1) {
          attempts = attempt + 1;
          try {
            const result = await this.executeWithTimeout(
              async () => {
                const customResult = await this.executeCustomNode({
                  ownerUserId,
                  node,
                  input: inputSnapshot,
                  paramSnapshot: nodeParamSnapshot,
                  sourceExecutionId: execution.id,
                  currentWorkflowDefinitionId: definition.id,
                  subflowDepth,
                  subflowPath: nextSubflowPath,
                });
                if (customResult) {
                  return customResult;
                }
                return nodeExecutor.execute({
                  executionId: execution.id,
                  triggerUserId: ownerUserId,
                  node,
                  input: inputSnapshot,
                  paramSnapshot: nodeParamSnapshot,
                });
              },
              runtimePolicy.timeoutMs,
              `节点 ${node.name} 执行超时（${runtimePolicy.timeoutMs}ms）`,
            );

            status = result.status ?? 'SUCCESS';
            outputSnapshot = result.output ?? {};
            if (status === 'FAILED') {
              errorMessage = result.message ?? `节点 ${node.name} 执行失败`;
              throw new WorkflowExecutionHandledError(
                errorMessage,
                'EXECUTOR',
                'NODE_RESULT_FAILED',
              );
            }

            outputSnapshot = {
              ...outputSnapshot,
              _meta: {
                executor: nodeExecutor.name,
                attempts,
                runtimePolicy,
              },
            };
            errorMessage = null;
            break;
          } catch (error) {
            status = 'FAILED';
            const classifiedFailure = this.classifyFailure(error);
            errorMessage = classifiedFailure.message;
            failureCategory = classifiedFailure.failureCategory;
            failureCode = classifiedFailure.failureCode;
            outputSnapshot = {
              ...outputSnapshot,
              _meta: {
                executor: nodeExecutor.name,
                attempts,
                runtimePolicy,
                lastError: errorMessage,
                failureCategory,
                failureCode,
              },
            };

            if (attempt < runtimePolicy.retryCount) {
              await this.recordRuntimeEvent({
                workflowExecutionId: execution.id,
                eventType: 'NODE_RETRY',
                level: 'WARN',
                message: `节点 ${node.name} 将进行第 ${attempt + 2} 次重试`,
                detail: {
                  nodeId: node.id,
                  nodeType: node.type,
                  attempt: attempts,
                  retryCount: runtimePolicy.retryCount,
                  retryBackoffMs: runtimePolicy.retryBackoffMs,
                  errorMessage,
                },
              });
              await this.sleep(runtimePolicy.retryBackoffMs);
              continue;
            }
          }
        }

        if (status === 'FAILED' && runtimePolicy.onError === 'ROUTE_TO_ERROR') {
          outputSnapshot = {
            ...outputSnapshot,
            _meta: {
              ...this.readMeta(outputSnapshot),
              onErrorRouting: 'ROUTE_TO_ERROR',
            },
          };
        }

        const completedAt = new Date();
        const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

        const createdNodeExecution = await this.prisma.nodeExecution.create({
          data: {
            workflowExecutionId: execution.id,
            nodeId: node.id,
            nodeType: node.type,
            status,
            startedAt,
            completedAt,
            durationMs,
            errorMessage,
            failureCategory: status === 'FAILED' ? failureCategory : null,
            failureCode: status === 'FAILED' ? failureCode : null,
            inputSnapshot: this.toJsonValue(inputSnapshot),
            outputSnapshot: this.toJsonValue(outputSnapshot),
          },
        });
        await this.recordRuntimeEvent({
          workflowExecutionId: execution.id,
          nodeExecutionId: createdNodeExecution.id,
          eventType: status === 'SUCCESS' ? 'NODE_SUCCEEDED' : 'NODE_FAILED',
          level: status === 'SUCCESS' ? 'INFO' : 'ERROR',
          message:
            status === 'SUCCESS' ? `节点 ${node.name} 执行成功` : `节点 ${node.name} 执行失败`,
          detail: {
            nodeId: node.id,
            nodeType: node.type,
            attempts,
            durationMs,
            errorMessage,
            failureCategory,
            failureCode,
          },
        });

        outputsByNode.set(node.id, outputSnapshot);

        if (status === 'FAILED') {
          if (runtimePolicy.onError === 'FAIL_FAST') {
            throw new WorkflowExecutionHandledError(
              errorMessage ?? `节点 ${node.id} 执行失败`,
              failureCategory ?? 'EXECUTOR',
              failureCode ?? 'NODE_EXECUTOR_ERROR',
            );
          }

          softFailureCount += 1;
          if (runtimePolicy.onError === 'ROUTE_TO_ERROR') {
            this.markNonErrorBranchSkipped(
              node.id,
              outgoingEdgeMap,
              skipReasonByNode,
              `节点 ${node.id} 执行失败，按 ROUTE_TO_ERROR 跳过非错误分支`,
            );
          }
        }
      }

      await this.throwIfExecutionCanceled(execution.id);
      const completed = await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          errorMessage: null,
          failureCategory: null,
          failureCode: null,
          outputSnapshot: this.toJsonValue(buildExecutionOutputSnapshot(sortedNodes.length)),
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await this.recordRuntimeEvent({
        workflowExecutionId: execution.id,
        eventType: 'EXECUTION_SUCCEEDED',
        level: 'INFO',
        message: '执行完成',
        detail: {
          nodeCount: sortedNodes.length,
          softFailureCount,
        },
      });
      const replayBundle = await this.persistReplayBundle(execution.id, dsl);
      await this.recordExperimentOutcome(experimentRouting, completed, replayBundle);
      return completed;
    } catch (error) {
      const classifiedFailure = this.classifyFailure(error);
      const failureMessage = classifiedFailure.message;
      const isCanceled = classifiedFailure.failureCategory === 'CANCELED';
      const terminalStatus: 'FAILED' | 'CANCELED' = isCanceled ? 'CANCELED' : 'FAILED';
      const executionFailureCode = isCanceled
        ? 'EXECUTION_CANCELED'
        : classifiedFailure.failureCategory === 'TIMEOUT'
          ? 'EXECUTION_TIMEOUT'
          : classifiedFailure.failureCode;

      await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: terminalStatus,
          completedAt: new Date(),
          errorMessage: failureMessage,
          failureCategory: classifiedFailure.failureCategory,
          failureCode: executionFailureCode,
          outputSnapshot: this.toJsonValue(buildExecutionOutputSnapshot(outputsByNode.size)),
        },
      });
      await this.recordRuntimeEvent({
        workflowExecutionId: execution.id,
        eventType: isCanceled ? 'EXECUTION_CANCELED' : 'EXECUTION_FAILED',
        level: isCanceled ? 'WARN' : 'ERROR',
        message: isCanceled ? '执行已取消' : '执行失败',
        detail: {
          errorMessage: failureMessage,
          failureCategory: classifiedFailure.failureCategory,
          failureCode: executionFailureCode,
          executedNodeCount: outputsByNode.size,
          softFailureCount,
        },
      });

      const terminalExecution = await this.prisma.workflowExecution.findUnique({
        where: { id: execution.id },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
          runtimeEvents: {
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      const replayBundle = await this.persistReplayBundle(execution.id, dsl);
      await this.recordExperimentOutcome(experimentRouting, terminalExecution, replayBundle);

      if (isCanceled) {
        return terminalExecution;
      }
      throw error;
    }
  }

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

  async replay(ownerUserId: string, id: string) {
    await this.ensureExecutionReadable(ownerUserId, id);
    return this.assembleReplayBundle(id);
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
        paramSnapshot: this.toRecord(sourceExecution.paramSnapshot),
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
    await this.recordRuntimeEvent({
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

  private async executeDagWorkflow(params: {
    executionId: string;
    ownerUserId: string;
    workflowDefinitionId: string;
    subflowDepth: number;
    subflowPath: string[];
    dsl: WorkflowDsl;
    paramSnapshot?: Record<string, unknown>;
    experimentRouting: ExperimentRoutingContext;
  }) {
    const outputsByNode = new Map<string, Record<string, unknown>>();
    const buildExecutionOutputSnapshot = (nodeCount: number, softFailureCount: number) => {
      const latestExecutedNodeId = Array.from(outputsByNode.keys()).at(-1);
      const latestExecutedNode = latestExecutedNodeId
        ? params.dsl.nodes.find((node) => node.id === latestExecutedNodeId)
        : undefined;
      const latestRiskGateNode = [...params.dsl.nodes]
        .reverse()
        .find((node) => node.type === 'risk-gate' && outputsByNode.has(node.id));
      const latestRiskGateOutput = latestRiskGateNode
        ? outputsByNode.get(latestRiskGateNode.id)
        : undefined;
      const riskGateSummary = this.extractRiskGateSummary(latestRiskGateOutput);

      return {
        nodeCount,
        latestNodeId: latestExecutedNode?.id ?? null,
        latestNodeType: latestExecutedNode?.type ?? null,
        softFailureCount,
        riskGate: riskGateSummary,
      };
    };

    try {
      const dagResult = await this.dagScheduler.execute({
        executionId: params.executionId,
        triggerUserId: params.ownerUserId,
        dsl: params.dsl,
        paramSnapshot: params.paramSnapshot,
        callbacks: {
          throwIfCanceled: () => this.throwIfExecutionCanceled(params.executionId),
          recordEvent: (payload) =>
            this.recordRuntimeEvent({
              workflowExecutionId: params.executionId,
              nodeExecutionId: payload.nodeExecutionId,
              eventType: payload.eventType,
              level: payload.level,
              message: payload.message,
              detail: payload.detail,
            }),
          persistNodeExecution: async (payload) =>
            this.prisma.nodeExecution.create({
              data: {
                workflowExecutionId: params.executionId,
                nodeId: payload.nodeId,
                nodeType: payload.nodeType,
                status: payload.status,
                startedAt: payload.startedAt,
                completedAt: payload.completedAt,
                durationMs: payload.durationMs,
                errorMessage: payload.errorMessage,
                failureCategory:
                  payload.status === 'FAILED'
                    ? (payload.failureCategory as WorkflowFailureCategory | null)
                    : null,
                failureCode: payload.status === 'FAILED' ? payload.failureCode : null,
                inputSnapshot: this.toJsonValue(payload.inputSnapshot),
                outputSnapshot: this.toJsonValue(payload.outputSnapshot),
              },
            }),
          resolveRuntimePolicy: (node, runPolicy) => this.resolveRuntimePolicy(node, runPolicy),
          executeWithTimeout: (task, timeoutMs, timeoutMessage) =>
            this.executeWithTimeout(task, timeoutMs, timeoutMessage),
          sleep: (ms) => this.sleep(ms),
          classifyFailure: (error) => this.classifyFailure(error),
          resolveNodeParamSnapshot: ({ node, baseParamSnapshot }) =>
            this.resolveNodeParamSnapshot(node, baseParamSnapshot),
          resolveNodeInput: ({ node, rawInput, outputsByNode, paramSnapshot }) =>
            this.resolveNodeInputBindings({
              node,
              rawInputSnapshot: rawInput,
              outputsByNode,
              paramSnapshot,
              executionId: params.executionId,
              triggerUserId: params.ownerUserId,
            }),
          executeCustomNode: ({ node, input, paramSnapshot }) =>
            this.executeCustomNode({
              ownerUserId: params.ownerUserId,
              node,
              input,
              paramSnapshot,
              sourceExecutionId: params.executionId,
              currentWorkflowDefinitionId: params.workflowDefinitionId,
              subflowDepth: params.subflowDepth,
              subflowPath: params.subflowPath,
            }),
        },
      });

      dagResult.outputsByNode.forEach((output, nodeId) => {
        outputsByNode.set(nodeId, output);
      });

      await this.throwIfExecutionCanceled(params.executionId);
      const completed = await this.prisma.workflowExecution.update({
        where: { id: params.executionId },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          errorMessage: null,
          failureCategory: null,
          failureCode: null,
          outputSnapshot: this.toJsonValue(
            buildExecutionOutputSnapshot(params.dsl.nodes.length, dagResult.softFailureCount),
          ),
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await this.recordRuntimeEvent({
        workflowExecutionId: params.executionId,
        eventType: 'EXECUTION_SUCCEEDED',
        level: 'INFO',
        message: 'DAG 执行完成',
        detail: {
          nodeCount: params.dsl.nodes.length,
          softFailureCount: dagResult.softFailureCount,
          executedNodeCount: dagResult.executedNodeCount,
        },
      });

      const replayBundle = await this.persistReplayBundle(params.executionId, params.dsl);
      await this.recordExperimentOutcome(params.experimentRouting, completed, replayBundle);
      return completed;
    } catch (error) {
      const classifiedFailure = this.classifyFailure(error);
      const failureMessage = classifiedFailure.message;
      const isCanceled = classifiedFailure.failureCategory === 'CANCELED';
      const terminalStatus: 'FAILED' | 'CANCELED' = isCanceled ? 'CANCELED' : 'FAILED';
      const executionFailureCode = isCanceled
        ? 'EXECUTION_CANCELED'
        : classifiedFailure.failureCategory === 'TIMEOUT'
          ? 'EXECUTION_TIMEOUT'
          : classifiedFailure.failureCode;

      await this.prisma.workflowExecution.update({
        where: { id: params.executionId },
        data: {
          status: terminalStatus,
          completedAt: new Date(),
          errorMessage: failureMessage,
          failureCategory: classifiedFailure.failureCategory,
          failureCode: executionFailureCode,
          outputSnapshot: this.toJsonValue(buildExecutionOutputSnapshot(outputsByNode.size, 0)),
        },
      });
      await this.recordRuntimeEvent({
        workflowExecutionId: params.executionId,
        eventType: isCanceled ? 'EXECUTION_CANCELED' : 'EXECUTION_FAILED',
        level: isCanceled ? 'WARN' : 'ERROR',
        message: isCanceled ? '执行已取消' : '执行失败',
        detail: {
          errorMessage: failureMessage,
          failureCategory: classifiedFailure.failureCategory,
          failureCode: executionFailureCode,
          executedNodeCount: outputsByNode.size,
        },
      });

      const terminalExecution = await this.prisma.workflowExecution.findUnique({
        where: { id: params.executionId },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
          runtimeEvents: {
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      const replayBundle = await this.persistReplayBundle(params.executionId, params.dsl);
      await this.recordExperimentOutcome(params.experimentRouting, terminalExecution, replayBundle);
      if (isCanceled) {
        return terminalExecution;
      }
      throw error;
    }
  }

  private async assembleReplayBundle(
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
      outputsByNode.set(nodeExecution.nodeId, this.toRecord(nodeExecution.outputSnapshot) ?? {});
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
      paramSnapshot: this.toRecord(execution.paramSnapshot),
      dsl,
      nodeSnapshots,
      evidenceBundle,
      dataLineage,
    });
  }

  private async persistReplayBundle(
    executionId: string,
    dslOverride?: WorkflowDsl,
  ): Promise<ExecutionReplayBundle | null> {
    try {
      const replayBundle = await this.assembleReplayBundle(executionId, dslOverride);
      const execution = await this.prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { outputSnapshot: true },
      });
      const existingOutput = this.toRecord(execution?.outputSnapshot);
      await this.prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          outputSnapshot: this.toJsonValue({
            ...(existingOutput ?? {}),
            evidenceBundle: replayBundle.evidenceBundle,
            dataLineage: replayBundle.dataLineage,
            replayBundle,
          }),
        },
      });
      return replayBundle;
    } catch {
      return null;
    }
  }

  private async recordExperimentOutcome(
    experimentRouting: ExperimentRoutingContext,
    execution:
      | {
          id: string;
          status: string;
          startedAt: Date | null;
          completedAt: Date | null;
          failureCategory: WorkflowFailureCategory | null;
          createdAt?: Date;
          nodeExecutions?: Array<{ id: string }>;
        }
      | null,
    replayBundle: ExecutionReplayBundle | null,
  ) {
    if (!experimentRouting || !execution) {
      return;
    }

    const startedAt = execution.startedAt ?? execution.createdAt ?? new Date();
    const completedAt = execution.completedAt ?? new Date();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    const success = execution.status === 'SUCCESS';
    const nodeCount = execution.nodeExecutions?.length ?? replayBundle?.stats.executedNodes ?? 0;
    const decision = replayBundle?.decisionOutput;

    try {
      await this.prisma.workflowExperimentRun.create({
        data: {
          experimentId: experimentRouting.experimentId,
          workflowExecutionId: execution.id,
          variant: experimentRouting.variant,
          success,
          durationMs,
          nodeCount,
          failureCategory: execution.failureCategory,
          action: typeof decision?.action === 'string' ? decision.action : null,
          confidence: typeof decision?.confidence === 'number' ? decision.confidence : null,
          riskLevel: typeof decision?.riskLevel === 'string' ? decision.riskLevel : null,
          metricsPayload: this.toJsonValue({
            executionStatus: execution.status,
            failureCategory: execution.failureCategory,
            decisionOutput: decision ?? null,
            replayStats: replayBundle?.stats ?? null,
          }),
        },
      });

      await this.workflowExperimentService.recordMetrics(experimentRouting.experimentId, {
        variant: experimentRouting.variant,
        executionId: execution.id,
        success,
        durationMs,
        nodeCount,
        failureCategory: execution.failureCategory ?? undefined,
      });

      await this.recordRuntimeEvent({
        workflowExecutionId: execution.id,
        eventType: 'EXPERIMENT_RUN_RECORDED',
        level: 'INFO',
        message: `实验指标记录完成 (${experimentRouting.variant})`,
        detail: {
          experimentId: experimentRouting.experimentId,
          variant: experimentRouting.variant,
          success,
          durationMs,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordRuntimeEvent({
        workflowExecutionId: execution.id,
        eventType: 'EXPERIMENT_METRICS_RECORD_FAILED',
        level: 'WARN',
        message: '实验指标记录失败',
        detail: {
          experimentId: experimentRouting.experimentId,
          variant: experimentRouting.variant,
          reason: message,
        },
      });
    }
  }

  private async ensureExecutionReadable(ownerUserId: string, id: string) {
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
          workflowDefinition: {
            id: query.workflowDefinitionId,
          },
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
        failureCode: {
          contains: failureCode,
          mode: 'insensitive',
        },
      });
    }
    if (query.riskLevel) {
      conditions.push({
        OR: [
          {
            outputSnapshot: {
              path: ['riskGate', 'riskLevel'],
              equals: query.riskLevel,
            },
          },
          {
            nodeExecutions: {
              some: {
                nodeType: 'risk-gate',
                outputSnapshot: {
                  path: ['riskLevel'],
                  equals: query.riskLevel,
                },
              },
            },
          },
        ],
      });
    }
    if (query.degradeAction) {
      conditions.push({
        OR: [
          {
            outputSnapshot: {
              path: ['riskGate', 'degradeAction'],
              equals: query.degradeAction,
            },
          },
          {
            nodeExecutions: {
              some: {
                nodeType: 'risk-gate',
                outputSnapshot: {
                  path: ['degradeAction'],
                  equals: query.degradeAction,
                },
              },
            },
          },
        ],
      });
    }
    const riskProfileCode = query.riskProfileCode?.trim();
    if (riskProfileCode) {
      conditions.push({
        OR: [
          {
            outputSnapshot: {
              path: ['riskGate', 'riskProfileCode'],
              string_contains: riskProfileCode,
            },
          },
          {
            nodeExecutions: {
              some: {
                nodeType: 'risk-gate',
                outputSnapshot: {
                  path: ['riskProfileCode'],
                  string_contains: riskProfileCode,
                },
              },
            },
          },
        ],
      });
    }
    const riskReasonKeyword = query.riskReasonKeyword?.trim();
    if (riskReasonKeyword) {
      conditions.push({
        OR: [
          {
            outputSnapshot: {
              path: ['riskGate', 'blockReason'],
              string_contains: riskReasonKeyword,
            },
          },
          {
            nodeExecutions: {
              some: {
                nodeType: 'risk-gate',
                outputSnapshot: {
                  path: ['blockReason'],
                  string_contains: riskReasonKeyword,
                },
              },
            },
          },
        ],
      });
    }
    if (query.hasSoftFailure) {
      conditions.push({
        status: 'SUCCESS',
        nodeExecutions: {
          some: { status: 'FAILED' },
        },
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
          {
            outputSnapshot: {
              path: ['riskGate', 'riskGateBlocked'],
              equals: true,
            },
          },
          {
            nodeExecutions: {
              some: {
                nodeType: 'risk-gate',
                outputSnapshot: {
                  path: ['riskGateBlocked'],
                  equals: true,
                },
              },
            },
          },
        ],
      });
    }
    if (query.hasRiskGateNode !== undefined) {
      conditions.push(
        query.hasRiskGateNode
          ? {
              nodeExecutions: {
                some: {
                  nodeType: 'risk-gate',
                },
              },
            }
          : {
              nodeExecutions: {
                none: {
                  nodeType: 'risk-gate',
                },
              },
            },
      );
    }
    if (query.hasRiskSummary !== undefined) {
      const riskSummaryPath = ['riskGate', 'summarySchemaVersion'];
      conditions.push(
        query.hasRiskSummary
          ? {
              NOT: {
                outputSnapshot: {
                  path: riskSummaryPath,
                  equals: Prisma.AnyNull,
                },
              },
            }
          : {
              outputSnapshot: {
                path: riskSummaryPath,
                equals: Prisma.AnyNull,
              },
            },
      );
    }

    const versionCode = query.versionCode?.trim();
    if (versionCode) {
      conditions.push({
        workflowVersion: {
          versionCode: { contains: versionCode, mode: 'insensitive' },
        },
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

    return {
      AND: conditions,
    };
  }

  private buildExecutionReadableWhere(ownerUserId: string): Prisma.WorkflowExecutionWhereInput {
    return {
      OR: [
        {
          triggerUserId: ownerUserId,
        },
        {
          workflowVersion: {
            workflowDefinition: {
              ownerUserId,
            },
          },
        },
      ],
    };
  }

  private async throwIfExecutionCanceled(executionId: string): Promise<void> {
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

  private classifyFailure(error: unknown): {
    message: string;
    failureCategory: WorkflowFailureCategory;
    failureCode: WorkflowFailureCode;
  } {
    if (error instanceof WorkflowExecutionHandledError) {
      return {
        message: error.message,
        failureCategory: error.failureCategory,
        failureCode: error.failureCode,
      };
    }

    if (error instanceof WorkflowTimeoutError) {
      return {
        message: error.message,
        failureCategory: 'TIMEOUT',
        failureCode: 'NODE_TIMEOUT',
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        failureCategory: 'EXECUTOR',
        failureCode: 'NODE_EXECUTOR_ERROR',
      };
    }

    return {
      message: '执行失败',
      failureCategory: 'INTERNAL',
      failureCode: 'EXECUTION_INTERNAL_ERROR',
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const code = (error as { code?: unknown }).code;
    return code === 'P2002';
  }

  private async recordRuntimeEvent(payload: {
    workflowExecutionId: string;
    nodeExecutionId?: string;
    eventType: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    detail?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.prisma.workflowRuntimeEvent.create({
        data: {
          workflowExecutionId: payload.workflowExecutionId,
          nodeExecutionId: payload.nodeExecutionId,
          eventType: payload.eventType,
          level: payload.level,
          message: payload.message,
          detail: payload.detail ? this.toJsonValue(payload.detail) : undefined,
        },
      });
    } catch {
      // Runtime event is diagnostic metadata and must not block execution.
    }
  }

  private readMeta(outputSnapshot: Record<string, unknown>): Record<string, unknown> {
    const meta = outputSnapshot._meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return {};
    }
    return meta as Record<string, unknown>;
  }

  private extractRiskGateSummary(
    outputSnapshot?: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!outputSnapshot) {
      return null;
    }

    const meta = this.readMeta(outputSnapshot);
    const riskGateMeta = this.readObject(meta.riskGate);
    const blockers = this.readStringArray(outputSnapshot.blockers);
    const blockerCount = this.readNumber(outputSnapshot.blockerCount);

    return {
      summarySchemaVersion: this.readString(outputSnapshot.summarySchemaVersion) ?? '1.0',
      riskLevel: this.readString(outputSnapshot.riskLevel),
      riskGatePassed: this.readBoolean(outputSnapshot.riskGatePassed),
      riskGateBlocked: this.readBoolean(outputSnapshot.riskGateBlocked),
      blockReason: this.readString(outputSnapshot.blockReason),
      degradeAction: this.readString(outputSnapshot.degradeAction),
      blockers,
      blockerCount: blockerCount ?? blockers.length,
      riskProfileCode:
        this.readString(outputSnapshot.riskProfileCode) ??
        this.readString(riskGateMeta?.riskProfileCode),
      threshold:
        this.readString(outputSnapshot.threshold) ?? this.readString(riskGateMeta?.threshold),
      blockedByRiskLevel:
        this.readBoolean(outputSnapshot.blockedByRiskLevel) ??
        this.readBoolean(riskGateMeta?.blockedByRiskLevel),
      hardBlock:
        this.readBoolean(outputSnapshot.hardBlock) ?? this.readBoolean(riskGateMeta?.hardBlock),
      riskEvaluatedAt: this.readString(outputSnapshot.riskEvaluatedAt),
    };
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private readBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    return null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readString(item))
      .filter((item): item is string => Boolean(item));
  }

  private async buildBindingSnapshot(
    ownerUserId: string,
    dsl: WorkflowDsl,
    runtimeParamSnapshot?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const userConfigBindings = await this.prisma.userConfigBinding.findMany({
      where: {
        userId: ownerUserId,
        isActive: true,
        bindingType: {
          in: ['AGENT_PROFILE', 'PARAMETER_SET', 'DECISION_RULE_PACK'],
        },
      },
      select: {
        id: true,
        bindingType: true,
        targetId: true,
        targetCode: true,
        priority: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const bindingTargetsByType = this.groupBindingTargetsByType(userConfigBindings);
    const agentBindings = this.uniqueStringList([
      ...this.uniqueStringList(dsl.agentBindings),
      ...bindingTargetsByType.AGENT_PROFILE,
    ]);
    const paramSetBindings = this.uniqueStringList([
      ...this.uniqueStringList(dsl.paramSetBindings),
      ...bindingTargetsByType.PARAMETER_SET,
    ]);
    const rulePackBindings = this.uniqueStringList(bindingTargetsByType.DECISION_RULE_PACK);
    const dataConnectorBindings = this.uniqueStringList(dsl.dataConnectorBindings);

    const [agents, parameterSets, rulePacks, connectors] = await Promise.all([
      agentBindings.length > 0
        ? this.prisma.agentProfile.findMany({
            where: {
              isActive: true,
              AND: [
                { OR: [{ agentCode: { in: agentBindings } }, { id: { in: agentBindings } }] },
                { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
              ],
            },
            select: {
              id: true,
              agentCode: true,
              version: true,
              roleType: true,
              templateSource: true,
            },
          })
        : Promise.resolve([]),
      paramSetBindings.length > 0
        ? this.prisma.parameterSet.findMany({
            where: {
              isActive: true,
              AND: [
                { OR: [{ setCode: { in: paramSetBindings } }, { id: { in: paramSetBindings } }] },
                { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
              ],
            },
            select: {
              id: true,
              setCode: true,
              version: true,
              templateSource: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      rulePackBindings.length > 0
        ? this.prisma.decisionRulePack.findMany({
            where: {
              isActive: true,
              AND: [
                {
                  OR: [{ rulePackCode: { in: rulePackBindings } }, { id: { in: rulePackBindings } }],
                },
                { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
              ],
            },
            select: {
              id: true,
              rulePackCode: true,
              version: true,
              templateSource: true,
            },
          })
        : Promise.resolve([]),
      dataConnectorBindings.length > 0
        ? this.prisma.dataConnector.findMany({
            where: {
              OR: [
                { connectorCode: { in: dataConnectorBindings } },
                { id: { in: dataConnectorBindings } },
              ],
              isActive: true,
            },
            select: {
              id: true,
              connectorCode: true,
              version: true,
              connectorType: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const resolvedAgentTargets = new Set(
      agents.flatMap((item) => [item.id, item.agentCode].filter(Boolean)),
    );
    const resolvedSetTargets = new Set(
      parameterSets.flatMap((item) => [item.id, item.setCode].filter(Boolean)),
    );
    const resolvedRulePackTargets = new Set(
      rulePacks.flatMap((item) => [item.id, item.rulePackCode].filter(Boolean)),
    );
    const resolvedConnectorTargets = new Set(
      connectors.flatMap((item) => [item.id, item.connectorCode].filter(Boolean)),
    );
    const parameterItems = parameterSets.length > 0
      ? await this.prisma.parameterItem.findMany({
          where: {
            parameterSetId: { in: parameterSets.map((item) => item.id) },
            isActive: true,
          },
          select: {
            parameterSetId: true,
            paramCode: true,
            scopeLevel: true,
            scopeValue: true,
            value: true,
            defaultValue: true,
            effectiveFrom: true,
            effectiveTo: true,
            updatedAt: true,
          },
        })
      : [];
    const scopeContext = this.extractParameterScopeContext(runtimeParamSnapshot);
    const resolvedParameters = this.resolveBoundParameterValues(
      parameterSets,
      parameterItems,
      scopeContext,
      paramSetBindings,
    );

    return {
      workflowBindings: {
        agentBindings,
        paramSetBindings,
        rulePackBindings,
        dataConnectorBindings,
      },
      userConfigBindings,
      resolvedBindings: {
        agents,
        parameterSets,
        rulePacks,
        dataConnectors: connectors,
      },
      resolvedParameters,
      parameterResolutionContext: scopeContext,
      unresolvedBindings: {
        agents: agentBindings.filter((item) => !resolvedAgentTargets.has(item)),
        parameterSets: paramSetBindings.filter((item) => !resolvedSetTargets.has(item)),
        rulePacks: rulePackBindings.filter((item) => !resolvedRulePackTargets.has(item)),
        dataConnectors: dataConnectorBindings.filter((item) => !resolvedConnectorTargets.has(item)),
      },
    };
  }

  private mergeParamSnapshot(
    paramSnapshot: Record<string, unknown> | undefined,
    bindingSnapshot: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = paramSnapshot ? { ...paramSnapshot } : {};
    const resolvedParameters = this.readObject(bindingSnapshot.resolvedParameters) ?? {};
    const baseParams = this.readObject(base.params) ?? {};
    base.params = {
      ...baseParams,
      ...resolvedParameters,
    };
    base.resolvedParams = {
      ...resolvedParameters,
    };
    for (const [key, value] of Object.entries(resolvedParameters)) {
      if (!(key in base)) {
        base[key] = value;
      }
    }
    base._workflowBindings = bindingSnapshot;
    return base;
  }

  private resolveNodeParamSnapshot(
    node: WorkflowNode,
    baseParamSnapshot: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const config = (node.config ?? {}) as Record<string, unknown>;
    const overrideMode =
      config.paramOverrideMode === 'PRIVATE_OVERRIDE' ? 'PRIVATE_OVERRIDE' : 'INHERIT';
    if (overrideMode !== 'PRIVATE_OVERRIDE') {
      return baseParamSnapshot;
    }

    const rawOverrides = config.paramOverrides;
    if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
      return baseParamSnapshot;
    }

    return {
      ...(baseParamSnapshot ?? {}),
      ...(rawOverrides as Record<string, unknown>),
    };
  }

  private uniqueStringList(value: unknown): string[] {
    const source = Array.isArray(value) ? value : [];
    const set = new Set<string>();
    for (const item of source) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      set.add(normalized);
    }
    return [...set];
  }

  private groupBindingTargetsByType(
    bindings: Array<{
      bindingType: string;
      targetId: string;
      targetCode: string | null;
    }>,
  ): Record<'AGENT_PROFILE' | 'PARAMETER_SET' | 'DECISION_RULE_PACK', string[]> {
    const grouped: Record<'AGENT_PROFILE' | 'PARAMETER_SET' | 'DECISION_RULE_PACK', string[]> = {
      AGENT_PROFILE: [],
      PARAMETER_SET: [],
      DECISION_RULE_PACK: [],
    };

    for (const binding of bindings) {
      if (
        binding.bindingType !== 'AGENT_PROFILE' &&
        binding.bindingType !== 'PARAMETER_SET' &&
        binding.bindingType !== 'DECISION_RULE_PACK'
      ) {
        continue;
      }
      grouped[binding.bindingType].push(binding.targetCode || binding.targetId);
    }

    return {
      AGENT_PROFILE: this.uniqueStringList(grouped.AGENT_PROFILE),
      PARAMETER_SET: this.uniqueStringList(grouped.PARAMETER_SET),
      DECISION_RULE_PACK: this.uniqueStringList(grouped.DECISION_RULE_PACK),
    };
  }

  private extractParameterScopeContext(
    runtimeParamSnapshot?: Record<string, unknown>,
  ): {
    commodity?: string;
    region?: string;
    route?: string;
    strategy?: string;
    sessionOverrides: Record<string, unknown>;
  } {
    const snapshot = runtimeParamSnapshot ?? {};
    const context = this.readObject(snapshot.context) ?? {};
    const sessionOverrides = this.readObject(snapshot.sessionOverrides) ?? {};
    return {
      commodity: this.readString(snapshot.commodity) ?? this.readString(context.commodity) ?? undefined,
      region: this.readString(snapshot.region) ?? this.readString(context.region) ?? undefined,
      route: this.readString(snapshot.route) ?? this.readString(context.route) ?? undefined,
      strategy: this.readString(snapshot.strategy) ?? this.readString(context.strategy) ?? undefined,
      sessionOverrides,
    };
  }

  private resolveBoundParameterValues(
    parameterSets: Array<{
      id: string;
      setCode: string;
      version: number;
      templateSource: string;
      updatedAt: Date;
    }>,
    parameterItems: Array<{
      parameterSetId: string;
      paramCode: string;
      scopeLevel: string;
      scopeValue: string | null;
      value: Prisma.JsonValue | null;
      defaultValue: Prisma.JsonValue | null;
      effectiveFrom: Date | null;
      effectiveTo: Date | null;
      updatedAt: Date;
    }>,
    scopeContext: {
      commodity?: string;
      region?: string;
      route?: string;
      strategy?: string;
      sessionOverrides: Record<string, unknown>;
    },
    setBindingOrder: string[],
  ): Record<string, unknown> {
    const bindingIndex = new Map<string, number>();
    setBindingOrder.forEach((codeOrId, index) => {
      if (!bindingIndex.has(codeOrId)) {
        bindingIndex.set(codeOrId, index);
      }
    });
    const orderedSets = [...parameterSets].sort((left, right) => {
      const leftIndex =
        bindingIndex.get(left.setCode) ?? bindingIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex =
        bindingIndex.get(right.setCode) ?? bindingIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    });
    const setOrderIndex = new Map<string, number>(orderedSets.map((item, index) => [item.id, index]));
    const now = new Date();
    const matchedItems = parameterItems.filter((item) => {
      if (!this.matchParameterScope(item.scopeLevel, item.scopeValue, scopeContext)) {
        return false;
      }
      if (item.effectiveFrom && item.effectiveFrom.getTime() > now.getTime()) {
        return false;
      }
      if (item.effectiveTo && item.effectiveTo.getTime() < now.getTime()) {
        return false;
      }
      return true;
    });
    matchedItems.sort((left, right) => {
      const leftSetOrder = setOrderIndex.get(left.parameterSetId) ?? Number.MAX_SAFE_INTEGER;
      const rightSetOrder = setOrderIndex.get(right.parameterSetId) ?? Number.MAX_SAFE_INTEGER;
      if (leftSetOrder !== rightSetOrder) {
        return leftSetOrder - rightSetOrder;
      }
      const leftScopeOrder = WORKFLOW_PARAM_SCOPE_PRIORITY.indexOf(left.scopeLevel as ParameterScopeLevel);
      const rightScopeOrder = WORKFLOW_PARAM_SCOPE_PRIORITY.indexOf(
        right.scopeLevel as ParameterScopeLevel,
      );
      if (leftScopeOrder !== rightScopeOrder) {
        return leftScopeOrder - rightScopeOrder;
      }
      return left.updatedAt.getTime() - right.updatedAt.getTime();
    });

    const resolved = new Map<string, unknown>();
    for (const item of matchedItems) {
      const nextValue = item.value ?? item.defaultValue ?? null;
      resolved.set(item.paramCode, nextValue);
    }
    for (const [paramCode, value] of Object.entries(scopeContext.sessionOverrides)) {
      resolved.set(paramCode, value);
    }
    return Object.fromEntries(resolved);
  }

  private matchParameterScope(
    scopeLevel: string,
    scopeValue: string | null,
    context: {
      commodity?: string;
      region?: string;
      route?: string;
      strategy?: string;
      sessionOverrides: Record<string, unknown>;
    },
  ): boolean {
    switch (scopeLevel) {
      case 'PUBLIC_TEMPLATE':
      case 'USER_TEMPLATE':
      case 'GLOBAL':
        return true;
      case 'COMMODITY':
        return Boolean(context.commodity && context.commodity === scopeValue);
      case 'REGION':
        return Boolean(context.region && context.region === scopeValue);
      case 'ROUTE':
        return Boolean(context.route && context.route === scopeValue);
      case 'STRATEGY':
        return Boolean(context.strategy && context.strategy === scopeValue);
      case 'SESSION':
        return false;
      default:
        return false;
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private sortNodesByEdges(dsl: WorkflowDsl): WorkflowNode[] {
    const indexByNodeId = new Map<string, number>(dsl.nodes.map((node, index) => [node.id, index]));
    const nodeById = new Map<string, WorkflowNode>(dsl.nodes.map((node) => [node.id, node]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of dsl.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of dsl.edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
        continue;
      }
      adjacency.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    const queue = dsl.nodes
      .filter((node) => (inDegree.get(node.id) || 0) === 0)
      .map((node) => node.id);
    const sortedNodeIds: string[] = [];

    while (queue.length > 0) {
      queue.sort((a, b) => (indexByNodeId.get(a) || 0) - (indexByNodeId.get(b) || 0));
      const currentNodeId = queue.shift();
      if (!currentNodeId) {
        break;
      }

      sortedNodeIds.push(currentNodeId);
      const neighbors = adjacency.get(currentNodeId) || [];
      for (const nextNodeId of neighbors) {
        const nextInDegree = (inDegree.get(nextNodeId) || 0) - 1;
        inDegree.set(nextNodeId, nextInDegree);
        if (nextInDegree === 0) {
          queue.push(nextNodeId);
        }
      }
    }

    if (sortedNodeIds.length !== dsl.nodes.length) {
      return dsl.nodes;
    }

    return sortedNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is WorkflowNode => Boolean(node));
  }

  private buildIncomingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
    const incomingEdgeMap = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      const incomingEdges = incomingEdgeMap.get(edge.to) || [];
      incomingEdges.push(edge);
      incomingEdgeMap.set(edge.to, incomingEdges);
    }
    return incomingEdgeMap;
  }

  private selectLinearIncomingEdges(
    nodeId: string,
    incomingEdgeMap: Map<string, WorkflowEdge[]>,
    outputsByNode: Map<string, Record<string, unknown>>,
    paramSnapshot?: Record<string, unknown>,
  ): { hasIncoming: boolean; activeEdges: WorkflowEdge[] } {
    const incomingEdges = incomingEdgeMap.get(nodeId) || [];
    if (incomingEdges.length === 0) {
      return { hasIncoming: false, activeEdges: [] };
    }

    const activeEdges: WorkflowEdge[] = [];
    for (const edge of incomingEdges) {
      const sourceOutput = outputsByNode.get(edge.from);
      if (!sourceOutput) {
        continue;
      }
      if (edge.edgeType === 'error-edge') {
        const meta = this.readMeta(sourceOutput);
        if (meta.onErrorRouting === 'ROUTE_TO_ERROR') {
          activeEdges.push(edge);
        }
        continue;
      }
      if (edge.edgeType === 'condition-edge') {
        if (!this.evaluateEdgeCondition(edge.condition, sourceOutput, paramSnapshot, edge.from)) {
          continue;
        }
      }
      activeEdges.push(edge);
    }

    return {
      hasIncoming: true,
      activeEdges,
    };
  }

  private async executeCustomNode(params: {
    ownerUserId: string;
    node: WorkflowNode;
    input: Record<string, unknown>;
    paramSnapshot?: Record<string, unknown>;
    sourceExecutionId: string;
    currentWorkflowDefinitionId: string;
    subflowDepth: number;
    subflowPath: string[];
  }): Promise<NodeExecutionResult | null> {
    if (params.node.type !== 'subflow-call') {
      return null;
    }

    return this.executeSubflowNode(params);
  }

  private async executeSubflowNode(params: {
    ownerUserId: string;
    node: WorkflowNode;
    input: Record<string, unknown>;
    paramSnapshot?: Record<string, unknown>;
    sourceExecutionId: string;
    currentWorkflowDefinitionId: string;
    subflowDepth: number;
    subflowPath: string[];
  }): Promise<NodeExecutionResult> {
    const config = (params.node.config ?? {}) as Record<string, unknown>;
    const workflowDefinitionId =
      typeof config.workflowDefinitionId === 'string' ? config.workflowDefinitionId.trim() : '';
    const workflowVersionId =
      typeof config.workflowVersionId === 'string' ? config.workflowVersionId.trim() : '';
    const outputKeyPrefix =
      typeof config.outputKeyPrefix === 'string' ? config.outputKeyPrefix.trim() : '';

    if (!workflowDefinitionId) {
      throw new BadRequestException(`subflow-call 节点 ${params.node.name} 缺少 workflowDefinitionId`);
    }
    if (params.subflowDepth >= MAX_SUBFLOW_DEPTH) {
      throw new BadRequestException(`subflow-call 超过最大嵌套层级 ${MAX_SUBFLOW_DEPTH}`);
    }
    if (workflowDefinitionId === params.currentWorkflowDefinitionId) {
      throw new BadRequestException(`subflow-call 不允许调用当前流程自身: ${params.node.name}`);
    }

    const childParamSnapshot = {
      ...(params.paramSnapshot ?? {}),
      subflowInput: params.input,
    };

    const childExecution = await this.trigger(
      params.ownerUserId,
      {
        workflowDefinitionId,
        workflowVersionId: workflowVersionId || undefined,
        triggerType: 'ON_DEMAND',
        paramSnapshot: childParamSnapshot,
      },
      {
        sourceExecutionId: params.sourceExecutionId,
        subflowDepth: params.subflowDepth + 1,
        subflowPath: params.subflowPath,
      },
    );
    if (!childExecution) {
      throw new BadRequestException(`subflow-call 节点 ${params.node.name} 执行返回空结果`);
    }

    const childOutput = this.toRecord(childExecution.outputSnapshot) ?? {};
    const prefixOutput =
      outputKeyPrefix.length > 0 ? { [outputKeyPrefix]: childOutput } : {};

    return {
      status: 'SUCCESS',
      output: {
        ...params.input,
        ...prefixOutput,
        subflowExecutionId: childExecution.id,
        subflowWorkflowDefinitionId: workflowDefinitionId,
        subflowWorkflowVersionId: childExecution.workflowVersionId,
        subflowStatus: childExecution.status,
        subflowOutput: childOutput,
      },
    };
  }

  private buildOutgoingEdgeMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
    const outgoingEdgeMap = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      const outgoingEdges = outgoingEdgeMap.get(edge.from) || [];
      outgoingEdges.push(edge);
      outgoingEdgeMap.set(edge.from, outgoingEdges);
    }
    return outgoingEdgeMap;
  }

  private buildNodeInputFromEdges(
    incomingEdges: WorkflowEdge[],
    outputsByNode: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    if (incomingEdges.length === 0) {
      return {};
    }

    if (incomingEdges.length === 1) {
      return outputsByNode.get(incomingEdges[0].from) || {};
    }

    const branchOutputs: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      branchOutputs[edge.from] = outputsByNode.get(edge.from) || {};
    }
    return { branches: branchOutputs };
  }

  private resolveNodeInputBindings(params: {
    node: WorkflowNode;
    rawInputSnapshot: Record<string, unknown>;
    outputsByNode: Map<string, Record<string, unknown>>;
    paramSnapshot?: Record<string, unknown>;
    executionId: string;
    triggerUserId: string;
  }): Record<string, unknown> {
    const inputBindings = params.node.inputBindings;
    if (!inputBindings || typeof inputBindings !== 'object' || Array.isArray(inputBindings)) {
      return params.rawInputSnapshot;
    }

    const bindingResult = this.variableResolver.resolveMapping(inputBindings, {
      currentNodeId: params.node.id,
      outputsByNode: params.outputsByNode,
      paramSnapshot: params.paramSnapshot,
      meta: {
        executionId: params.executionId,
        triggerUserId: params.triggerUserId,
        timestamp: new Date().toISOString(),
      },
    });
    if (bindingResult.unresolvedVars.length > 0) {
      throw new BadRequestException(
        `节点 ${params.node.name} 的 inputBindings 无法解析: ${bindingResult.unresolvedVars.join(', ')}`,
      );
    }

    return {
      ...params.rawInputSnapshot,
      ...bindingResult.resolved,
    };
  }

  private evaluateEdgeCondition(
    condition: unknown,
    sourceOutput: Record<string, unknown>,
    paramSnapshot?: Record<string, unknown>,
    sourceNodeId?: string,
  ): boolean {
    if (condition === null || condition === undefined) {
      return false;
    }
    if (typeof condition === 'boolean') {
      return condition;
    }
    if (typeof condition === 'object') {
      const cond = condition as Record<string, unknown>;
      const field = typeof cond.field === 'string' ? cond.field : '';
      const operator = typeof cond.operator === 'string' ? cond.operator.toLowerCase() : '';
      const expected = cond.value;
      if (!field || !operator) {
        return false;
      }
      const actual = this.readValueByPath(sourceOutput, field);
      return this.compareConditionValues(actual, expected, operator);
    }
    if (typeof condition !== 'string') {
      return false;
    }

    const expression = condition.trim();
    if (!expression) {
      return false;
    }
    if (expression === 'true') {
      return true;
    }
    if (expression === 'false') {
      return false;
    }

      const resolvedExpression = expression.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawRef: string) => {
        const ref = rawRef.trim();
        let value: unknown;
        if (ref.startsWith('params.')) {
          value = this.readValueByPath(paramSnapshot ?? {}, ref.slice('params.'.length));
        } else {
          const normalizedPath =
            sourceNodeId && ref.startsWith(`${sourceNodeId}.`)
              ? ref.slice(sourceNodeId.length + 1)
              : ref;
          value = this.readValueByPath(sourceOutput, normalizedPath);
        }
        return JSON.stringify(value);
      });

    const comparisonMatch = resolvedExpression.match(/^\s*(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)\s*$/);
    if (!comparisonMatch) {
      const single = this.parseConditionLiteral(resolvedExpression);
      return Boolean(single);
    }

    const left = this.parseConditionLiteral(comparisonMatch[1]);
    const operator = comparisonMatch[2];
    const right = this.parseConditionLiteral(comparisonMatch[3]);
    return this.compareConditionValues(left, right, operator);
  }

  private parseConditionLiteral(raw: string): unknown {
    const value = raw.trim();
    if (!value) {
      return '';
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    if (value === 'null') {
      return null;
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private compareConditionValues(actual: unknown, expected: unknown, operator: string): boolean {
    const normalizeOperator = operator.toLowerCase();
    if (normalizeOperator === '==') {
      return actual === expected;
    }
    if (normalizeOperator === '!=') {
      return actual !== expected;
    }
    if (normalizeOperator === 'eq') {
      return actual === expected;
    }
    if (normalizeOperator === 'neq') {
      return actual !== expected;
    }
    if (normalizeOperator === 'in') {
      return Array.isArray(expected) && expected.includes(actual);
    }
    if (normalizeOperator === 'not_in') {
      return Array.isArray(expected) && !expected.includes(actual);
    }
    if (normalizeOperator === 'exists') {
      return actual !== undefined && actual !== null;
    }
    if (normalizeOperator === 'not_exists') {
      return actual === undefined || actual === null;
    }

    const actualNumber = this.toFiniteNumber(actual);
    const expectedNumber = this.toFiniteNumber(expected);
    if (actualNumber === null || expectedNumber === null) {
      return false;
    }

    if (normalizeOperator === '>' || normalizeOperator === 'gt') {
      return actualNumber > expectedNumber;
    }
    if (normalizeOperator === '>=' || normalizeOperator === 'gte') {
      return actualNumber >= expectedNumber;
    }
    if (normalizeOperator === '<' || normalizeOperator === 'lt') {
      return actualNumber < expectedNumber;
    }
    if (normalizeOperator === '<=' || normalizeOperator === 'lte') {
      return actualNumber <= expectedNumber;
    }
    return false;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private readValueByPath(source: Record<string, unknown>, path: string): unknown {
    if (!path.trim()) {
      return undefined;
    }
    const parts = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .map((item) => item.trim())
      .filter(Boolean);
    let current: unknown = source;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (Array.isArray(current)) {
        const index = Number(part);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          return undefined;
        }
        current = current[index];
        continue;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private resolveRuntimePolicy(
    node: WorkflowNode,
    runPolicy?: WorkflowRunPolicy,
  ): WorkflowNodeRuntimePolicy {
    const defaults = WorkflowNodeRuntimePolicySchema.parse({});
    const config = node.config as Record<string, unknown>;
    const workflowNodeDefaults = runPolicy?.nodeDefaults ?? {};
    const nodeRuntimePolicy = node.runtimePolicy ?? {};

    const timeoutMsSource =
      nodeRuntimePolicy.timeoutMs ?? config.timeoutMs ?? workflowNodeDefaults.timeoutMs;
    const retryCountSource =
      nodeRuntimePolicy.retryCount ?? config.retryCount ?? workflowNodeDefaults.retryCount;
    const retryBackoffMsSource =
      nodeRuntimePolicy.retryBackoffMs ??
      config.retryBackoffMs ??
      workflowNodeDefaults.retryBackoffMs;
    const onErrorSource =
      nodeRuntimePolicy.onError ?? config.onError ?? workflowNodeDefaults.onError;

    const onErrorParsed = WorkflowNodeOnErrorPolicyEnum.safeParse(onErrorSource);

    return {
      timeoutMs: this.toInteger(timeoutMsSource, defaults.timeoutMs, 1_000, 120_000),
      retryCount: this.toInteger(retryCountSource, defaults.retryCount, 0, 5),
      retryBackoffMs: this.toInteger(retryBackoffMsSource, defaults.retryBackoffMs, 0, 60_000),
      onError: onErrorParsed.success ? onErrorParsed.data : defaults.onError,
    };
  }

  private markNonErrorBranchSkipped(
    failedNodeId: string,
    outgoingEdgeMap: Map<string, WorkflowEdge[]>,
    skipReasonByNode: Map<string, string>,
    reason: string,
  ): void {
    const outgoingEdges = outgoingEdgeMap.get(failedNodeId) || [];
    const directErrorTargets = new Set(
      outgoingEdges.filter((edge) => edge.edgeType === 'error-edge').map((edge) => edge.to),
    );

    const queue = outgoingEdges
      .filter((edge) => edge.edgeType !== 'error-edge')
      .map((edge) => edge.to)
      .filter((nodeId) => !directErrorTargets.has(nodeId));

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId || skipReasonByNode.has(currentNodeId)) {
        continue;
      }

      skipReasonByNode.set(currentNodeId, reason);
      const nextEdges = outgoingEdgeMap.get(currentNodeId) || [];
      for (const nextEdge of nextEdges) {
        if (nextEdge.edgeType !== 'error-edge') {
          queue.push(nextEdge.to);
        }
      }
    }
  }

  private toInteger(value: unknown, fallback: number, min: number, max: number): number {
    let parsed = fallback;
    if (typeof value === 'number' && Number.isFinite(value)) {
      parsed = Math.trunc(value);
    } else if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        parsed = Math.trunc(numeric);
      }
    }
    return Math.max(min, Math.min(max, parsed));
  }

  private async executeWithTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new WorkflowTimeoutError(timeoutMessage));
      }, timeoutMs);

      task()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
