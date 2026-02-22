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
    private readonly configService: ConfigService, private readonly executionLogService: ExecutionLogService, private readonly executionQueryService: WorkflowExecutionQueryService, private readonly executionReplayService: WorkflowExecutionReplayService
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

    const workflowAgentStrictModeEnabled = await this.isWorkflowAgentStrictModeEnabled();

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
        const runtimePolicy = this.resolveRuntimePolicy(
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
            this.resolveRuntimePolicy(node, runPolicy, params.strictModeEnabled),
          executeWithTimeout: (task, timeoutMs, timeoutMessage) =>
            ExecutionUtils.executeWithTimeout(task, timeoutMs, timeoutMessage),
          sleep: (ms) => ExecutionUtils.sleep(ms),
          classifyFailure: (error) => ExecutionUtils.classifyFailure(error),
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
    const agentBindings = ExecutionUtils.uniqueStringList([
      ...ExecutionUtils.uniqueStringList(dsl.agentBindings),
      ...bindingTargetsByType.AGENT_PROFILE,
    ]);
    const paramSetBindings = ExecutionUtils.uniqueStringList([
      ...ExecutionUtils.uniqueStringList(dsl.paramSetBindings),
      ...bindingTargetsByType.PARAMETER_SET,
    ]);
    const rulePackBindings = ExecutionUtils.uniqueStringList(bindingTargetsByType.DECISION_RULE_PACK);
    const dataConnectorBindings = ExecutionUtils.uniqueStringList(dsl.dataConnectorBindings);

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
    const resolvedParameters = ExecutionUtils.readObject(bindingSnapshot.resolvedParameters) ?? {};
    const baseParams = ExecutionUtils.readObject(base.params) ?? {};
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
      AGENT_PROFILE: ExecutionUtils.uniqueStringList(grouped.AGENT_PROFILE),
      PARAMETER_SET: ExecutionUtils.uniqueStringList(grouped.PARAMETER_SET),
      DECISION_RULE_PACK: ExecutionUtils.uniqueStringList(grouped.DECISION_RULE_PACK),
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
    const context = ExecutionUtils.readObject(snapshot.context) ?? {};
    const sessionOverrides = ExecutionUtils.readObject(snapshot.sessionOverrides) ?? {};
    return {
      commodity: ExecutionUtils.readString(snapshot.commodity) ?? ExecutionUtils.readString(context.commodity) ?? undefined,
      region: ExecutionUtils.readString(snapshot.region) ?? ExecutionUtils.readString(context.region) ?? undefined,
      route: ExecutionUtils.readString(snapshot.route) ?? ExecutionUtils.readString(context.route) ?? undefined,
      strategy: ExecutionUtils.readString(snapshot.strategy) ?? ExecutionUtils.readString(context.strategy) ?? undefined,
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
        const meta = ExecutionUtils.readMeta(sourceOutput);
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
      const actual = ExecutionUtils.readValueByPath(sourceOutput, field);
      return ExecutionUtils.compareConditionValues(actual, expected, operator);
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
        value = ExecutionUtils.readValueByPath(paramSnapshot ?? {}, ref.slice('params.'.length));
      } else {
        const normalizedPath =
          sourceNodeId && ref.startsWith(`${sourceNodeId}.`)
            ? ref.slice(sourceNodeId.length + 1)
            : ref;
        value = ExecutionUtils.readValueByPath(sourceOutput, normalizedPath);
      }
      return JSON.stringify(value);
    });

    const comparisonMatch = resolvedExpression.match(/^\s*(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)\s*$/);
    if (!comparisonMatch) {
      const single = ExecutionUtils.parseConditionLiteral(resolvedExpression);
      return Boolean(single);
    }

    const left = ExecutionUtils.parseConditionLiteral(comparisonMatch[1]);
    const operator = comparisonMatch[2];
    const right = ExecutionUtils.parseConditionLiteral(comparisonMatch[3]);
    return ExecutionUtils.compareConditionValues(left, right, operator);
  }

  private resolveRuntimePolicy(
    node: WorkflowNode,
    runPolicy?: WorkflowRunPolicy,
    strictModeEnabled = false,
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
    const onErrorResolved = onErrorParsed.success ? onErrorParsed.data : defaults.onError;
    const onError = strictModeEnabled && this.isStrictModeAgentNode(node.type)
      ? 'FAIL_FAST'
      : onErrorResolved;

    return {
      timeoutMs: ExecutionUtils.toInteger(timeoutMsSource, defaults.timeoutMs, 1_000, 120_000),
      retryCount: ExecutionUtils.toInteger(retryCountSource, defaults.retryCount, 0, 5),
      retryBackoffMs: ExecutionUtils.toInteger(retryBackoffMsSource, defaults.retryBackoffMs, 0, 60_000),
      onError,
    };
  }

  private isStrictModeAgentNode(nodeType: string): boolean {
    return (
      nodeType === 'agent-call' ||
      nodeType === 'single-agent' ||
      nodeType === 'debate-round' ||
      nodeType === 'judge-agent'
    );
  }

  private async isWorkflowAgentStrictModeEnabled(): Promise<boolean> {
    try {
      const setting = await this.configService.getWorkflowAgentStrictMode();
      return setting.enabled;
    } catch {
      const fallback = this.parseBooleanFlag(process.env.WORKFLOW_AGENT_STRICT_MODE);
      return fallback ?? false;
    }
  }

  private parseBooleanFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return null;
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
}
