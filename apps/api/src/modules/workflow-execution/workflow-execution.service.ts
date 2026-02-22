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
  WorkflowFailureCategory,
  type ParameterScopeLevel,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { DebateTraceService } from '../debate-trace/debate-trace.service';
import { VariableResolver } from './engine/variable-resolver';
import { EvidenceCollector } from './engine/evidence-collector';
import { DagScheduler } from './engine/dag-scheduler';
import { ReplayAssembler, type ExecutionReplayBundle } from './engine/replay-assembler';
import { WorkflowExperimentService } from '../workflow-experiment/workflow-experiment.service';
import type { NodeExecutionResult } from './engine/node-executor.interface';
import { ConfigService } from '../config/config.service';
import { ExecutionLogService } from "./execution-log.service";
import { WorkflowExecutionQueryService } from "./workflow-execution-query.service";
import { WorkflowExecutionReplayService } from "./workflow-execution-replay.service";
import { WorkflowExecutionContextService } from "./workflow-execution-context.service";
import { WorkflowExecutionDagService } from "./workflow-execution-dag.service";
import * as ExecutionUtils from "./workflow-execution.utils";
import { WorkflowExecutionHandledError, WorkflowFailureCode } from './workflow-execution.utils';
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
    private readonly configService: ConfigService, private readonly executionLogService: ExecutionLogService, private readonly executionQueryService: WorkflowExecutionQueryService, private readonly executionReplayService: WorkflowExecutionReplayService, private readonly dagService: WorkflowExecutionDagService, private readonly contextService: WorkflowExecutionContextService
  ) { }

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
    const bindingSnapshot = await this.contextService.buildBindingSnapshot(ownerUserId, dsl, dto.paramSnapshot);
    const mergedParamSnapshot = this.contextService.mergeParamSnapshot(dto.paramSnapshot, bindingSnapshot);

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
          paramSnapshot: mergedParamSnapshot ? ExecutionUtils.toJsonValue(mergedParamSnapshot) : undefined,
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
      return this.executeDagWorkflow({
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

    const sortedNodes = this.dagService.sortNodesByEdges(dsl);
    const incomingEdgeMap = this.dagService.buildIncomingEdgeMap(dsl.edges);
    const outgoingEdgeMap = this.dagService.buildOutgoingEdgeMap(dsl.edges);
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
              inputSnapshot: ExecutionUtils.toJsonValue({}),
              outputSnapshot: ExecutionUtils.toJsonValue(skippedOutput),
            },
          });
          await this.executionLogService.recordRuntimeEvent({
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

        const incomingSelection = this.dagService.selectLinearIncomingEdges(
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
              inputSnapshot: ExecutionUtils.toJsonValue({}),
              outputSnapshot: ExecutionUtils.toJsonValue(skippedOutput),
            },
          });
          await this.executionLogService.recordRuntimeEvent({
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
        const rawInputSnapshot = this.dagService.buildNodeInputFromEdges(
          incomingSelection.activeEdges,
          outputsByNode,
        );
        const nodeParamSnapshot = this.contextService.resolveNodeParamSnapshot(node, mergedParamSnapshot);
        const inputSnapshot = this.dagService.resolveNodeInputBindings({
          node,
          rawInputSnapshot,
          outputsByNode,
          paramSnapshot: nodeParamSnapshot,
          executionId: execution.id,
          triggerUserId: ownerUserId,
        });
        const nodeExecutor = this.nodeExecutorRegistry.resolve(node);
        const runtimePolicy = this.dagService.resolveRuntimePolicy(
          node,
          dsl.runPolicy,
          workflowAgentStrictModeEnabled,
        );

        let status: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SUCCESS';
        let errorMessage: string | null = null;
        let outputSnapshot: Record<string, unknown> = {};
        let attempts = 0;
        let failureCategory: WorkflowFailureCategory | null = null;
        let failureCode: WorkflowFailureCode | null = null;
        await this.executionLogService.recordRuntimeEvent({
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
            const result = await ExecutionUtils.executeWithTimeout(
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
            const classifiedFailure = ExecutionUtils.classifyFailure(error);
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
              await this.executionLogService.recordRuntimeEvent({
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
              await ExecutionUtils.sleep(runtimePolicy.retryBackoffMs);
              continue;
            }
          }
        }

        if (status === 'FAILED' && runtimePolicy.onError === 'ROUTE_TO_ERROR') {
          outputSnapshot = {
            ...outputSnapshot,
            _meta: {
              ...ExecutionUtils.readMeta(outputSnapshot),
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
            inputSnapshot: ExecutionUtils.toJsonValue(inputSnapshot),
            outputSnapshot: ExecutionUtils.toJsonValue(outputSnapshot),
          },
        });
        await this.executionLogService.recordRuntimeEvent({
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
            this.dagService.markNonErrorBranchSkipped(
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
          outputSnapshot: ExecutionUtils.toJsonValue(buildExecutionOutputSnapshot(sortedNodes.length)),
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await this.executionLogService.recordRuntimeEvent({
        workflowExecutionId: execution.id,
        eventType: 'EXECUTION_SUCCEEDED',
        level: 'INFO',
        message: '执行完成',
        detail: {
          nodeCount: sortedNodes.length,
          softFailureCount,
        },
      });
      const replayBundle = await this.executionReplayService.persistReplayBundle(execution.id, dsl);
      await this.recordExperimentOutcome(experimentRouting, completed, replayBundle);
      return completed;
    } catch (error) {
      const classifiedFailure = ExecutionUtils.classifyFailure(error);
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
          outputSnapshot: ExecutionUtils.toJsonValue(buildExecutionOutputSnapshot(outputsByNode.size)),
        },
      });
      await this.executionLogService.recordRuntimeEvent({
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
      const replayBundle = await this.executionReplayService.persistReplayBundle(execution.id, dsl);
      await this.recordExperimentOutcome(experimentRouting, terminalExecution, replayBundle);

      if (isCanceled) {
        return terminalExecution;
      }
      throw error;
    }
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

  private async executeDagWorkflow(params: {
    executionId: string;
    ownerUserId: string;
    workflowDefinitionId: string;
    subflowDepth: number;
    subflowPath: string[];
    dsl: WorkflowDsl;
    paramSnapshot?: Record<string, unknown>;
    experimentRouting: ExperimentRoutingContext;
    strictModeEnabled: boolean;
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
            this.executionLogService.recordRuntimeEvent({
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
                inputSnapshot: ExecutionUtils.toJsonValue(payload.inputSnapshot),
                outputSnapshot: ExecutionUtils.toJsonValue(payload.outputSnapshot),
              },
            }),
          resolveRuntimePolicy: (node, runPolicy) =>
            this.dagService.resolveRuntimePolicy(node, runPolicy, params.strictModeEnabled),
          executeWithTimeout: (task, timeoutMs, timeoutMessage) =>
            ExecutionUtils.executeWithTimeout(task, timeoutMs, timeoutMessage),
          sleep: (ms) => ExecutionUtils.sleep(ms),
          classifyFailure: (error) => ExecutionUtils.classifyFailure(error),
          resolveNodeParamSnapshot: ({ node, baseParamSnapshot }) =>
            this.contextService.resolveNodeParamSnapshot(node, baseParamSnapshot),
          resolveNodeInput: ({ node, rawInput, outputsByNode, paramSnapshot }) =>
            this.dagService.resolveNodeInputBindings({
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
          outputSnapshot: ExecutionUtils.toJsonValue(
            buildExecutionOutputSnapshot(params.dsl.nodes.length, dagResult.softFailureCount),
          ),
        },
        include: {
          nodeExecutions: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      await this.executionLogService.recordRuntimeEvent({
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

      const replayBundle = await this.executionReplayService.persistReplayBundle(params.executionId, params.dsl);
      await this.recordExperimentOutcome(params.experimentRouting, completed, replayBundle);
      return completed;
    } catch (error) {
      const classifiedFailure = ExecutionUtils.classifyFailure(error);
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
          outputSnapshot: ExecutionUtils.toJsonValue(buildExecutionOutputSnapshot(outputsByNode.size, 0)),
        },
      });
      await this.executionLogService.recordRuntimeEvent({
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
      const replayBundle = await this.executionReplayService.persistReplayBundle(params.executionId, params.dsl);
      await this.recordExperimentOutcome(params.experimentRouting, terminalExecution, replayBundle);
      if (isCanceled) {
        return terminalExecution;
      }
      throw error;
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
          metricsPayload: ExecutionUtils.toJsonValue({
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

      await this.executionLogService.recordRuntimeEvent({
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
      await this.executionLogService.recordRuntimeEvent({
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

  private extractRiskGateSummary(
    outputSnapshot?: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!outputSnapshot) {
      return null;
    }

    const meta = ExecutionUtils.readMeta(outputSnapshot);
    const riskGateMeta = ExecutionUtils.readObject(meta.riskGate);
    const blockers = ExecutionUtils.readStringArray(outputSnapshot.blockers);
    const blockerCount = ExecutionUtils.readNumber(outputSnapshot.blockerCount);

    return {
      summarySchemaVersion: ExecutionUtils.readString(outputSnapshot.summarySchemaVersion) ?? '1.0',
      riskLevel: ExecutionUtils.readString(outputSnapshot.riskLevel),
      riskGatePassed: ExecutionUtils.readBoolean(outputSnapshot.riskGatePassed),
      riskGateBlocked: ExecutionUtils.readBoolean(outputSnapshot.riskGateBlocked),
      blockReason: ExecutionUtils.readString(outputSnapshot.blockReason),
      degradeAction: ExecutionUtils.readString(outputSnapshot.degradeAction),
      blockers,
      blockerCount: blockerCount ?? blockers.length,
      riskProfileCode:
        ExecutionUtils.readString(outputSnapshot.riskProfileCode) ??
        ExecutionUtils.readString(riskGateMeta?.riskProfileCode),
      threshold:
        ExecutionUtils.readString(outputSnapshot.threshold) ?? ExecutionUtils.readString(riskGateMeta?.threshold),
      blockedByRiskLevel:
        ExecutionUtils.readBoolean(outputSnapshot.blockedByRiskLevel) ??
        ExecutionUtils.readBoolean(riskGateMeta?.blockedByRiskLevel),
      hardBlock:
        ExecutionUtils.readBoolean(outputSnapshot.hardBlock) ?? ExecutionUtils.readBoolean(riskGateMeta?.hardBlock),
      riskEvaluatedAt: ExecutionUtils.readString(outputSnapshot.riskEvaluatedAt),
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

    const childOutput = ExecutionUtils.toRecord(childExecution.outputSnapshot) ?? {};
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
}
