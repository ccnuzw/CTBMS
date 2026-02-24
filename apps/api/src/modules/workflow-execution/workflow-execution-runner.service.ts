import { Injectable, Logger, forwardRef, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { WorkflowExecutionContextService } from './workflow-execution-context.service';
import { WorkflowExecutionDagService } from './workflow-execution-dag.service';
import { ExecutionLogService } from './execution-log.service';
import { WorkflowExecutionReplayService } from './workflow-execution-replay.service';
import { DagScheduler } from './engine/dag-scheduler';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExperimentService } from '../workflow-experiment/workflow-experiment.service';
import type { ExecutionReplayBundle } from './engine/replay-assembler';
import type { NodeExecutionResult } from './engine/node-executor.interface';
import { WorkflowDsl, WorkflowNode, WorkflowFailureCategory } from '@packages/types';
import * as ExecutionUtils from './workflow-execution.utils';
import { WorkflowExecutionHandledError, WorkflowFailureCode } from './workflow-execution.utils';

export interface ExperimentRoutingContext {
  experimentId: string;
  variant: 'A' | 'B';
}

const MAX_SUBFLOW_DEPTH = 4;

@Injectable()
export class WorkflowExecutionRunnerService {
  private readonly logger = new Logger(WorkflowExecutionRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeExecutorRegistry: NodeExecutorRegistry,
    private readonly contextService: WorkflowExecutionContextService,
    private readonly dagService: WorkflowExecutionDagService,
    private readonly executionLogService: ExecutionLogService,
    private readonly executionReplayService: WorkflowExecutionReplayService,
    private readonly dagScheduler: DagScheduler,
    private readonly workflowExperimentService: WorkflowExperimentService,
    @Inject(forwardRef(() => WorkflowExecutionService))
    private readonly executionService: WorkflowExecutionService,
  ) { }

  public async executeLinearWorkflow(params: {
    executionId: string;
    ownerUserId: string;
    dsl: WorkflowDsl;
    paramSnapshot?: Record<string, unknown>;
    experimentRouting: ExperimentRoutingContext | null;
    subflowDepth: number;
    subflowPath: string[];
    workflowDefinitionId: string;
    strictModeEnabled: boolean;
  }) {
    const {
      executionId,
      ownerUserId,
      dsl,
      paramSnapshot: mergedParamSnapshot,
      experimentRouting,
      subflowDepth,
      subflowPath: nextSubflowPath,
      workflowDefinitionId: definitionId,
      strictModeEnabled: workflowAgentStrictModeEnabled,
    } = params;
    const execution = { id: executionId };

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
        await this.executionService.throwIfExecutionCanceled(execution.id);
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
        const nodeParamSnapshot = this.contextService.resolveNodeParamSnapshot(
          node,
          mergedParamSnapshot,
        );
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
            timeoutMs: runtimePolicy.timeoutSeconds * 1000,
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
                  currentWorkflowDefinitionId: definitionId,
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
              runtimePolicy.timeoutSeconds * 1000,
              `节点 ${node.name} 执行超时（${runtimePolicy.timeoutSeconds}s）`,
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
                  retryBackoffMs: runtimePolicy.retryIntervalSeconds * 1000,
                  errorMessage,
                },
              });
              await ExecutionUtils.sleep(runtimePolicy.retryIntervalSeconds * 1000);
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

      await this.executionService.throwIfExecutionCanceled(execution.id);
      const completed = await this.prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          errorMessage: null,
          failureCategory: null,
          failureCode: null,
          outputSnapshot: ExecutionUtils.toJsonValue(
            buildExecutionOutputSnapshot(sortedNodes.length),
          ),
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
          outputSnapshot: ExecutionUtils.toJsonValue(
            buildExecutionOutputSnapshot(outputsByNode.size),
          ),
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

  public async executeDagWorkflow(params: {
    executionId: string;
    ownerUserId: string;
    workflowDefinitionId: string;
    subflowDepth: number;
    subflowPath: string[];
    dsl: WorkflowDsl;
    paramSnapshot?: Record<string, unknown>;
    experimentRouting: ExperimentRoutingContext | null;
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
          throwIfCanceled: () => this.executionService.throwIfExecutionCanceled(params.executionId),
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

      await this.executionService.throwIfExecutionCanceled(params.executionId);
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

      const replayBundle = await this.executionReplayService.persistReplayBundle(
        params.executionId,
        params.dsl,
      );
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
          outputSnapshot: ExecutionUtils.toJsonValue(
            buildExecutionOutputSnapshot(outputsByNode.size, 0),
          ),
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
      const replayBundle = await this.executionReplayService.persistReplayBundle(
        params.executionId,
        params.dsl,
      );
      await this.recordExperimentOutcome(params.experimentRouting, terminalExecution, replayBundle);
      if (isCanceled) {
        return terminalExecution;
      }
      throw error;
    }
  }

  public async recordExperimentOutcome(
    experimentRouting: ExperimentRoutingContext | null,
    execution: {
      id: string;
      status: string;
      startedAt: Date | null;
      completedAt: Date | null;
      failureCategory: WorkflowFailureCategory | null;
      createdAt?: Date;
      nodeExecutions?: Array<{ id: string }>;
    } | null,
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

  public extractRiskGateSummary(
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
        ExecutionUtils.readString(outputSnapshot.threshold) ??
        ExecutionUtils.readString(riskGateMeta?.threshold),
      blockedByRiskLevel:
        ExecutionUtils.readBoolean(outputSnapshot.blockedByRiskLevel) ??
        ExecutionUtils.readBoolean(riskGateMeta?.blockedByRiskLevel),
      hardBlock:
        ExecutionUtils.readBoolean(outputSnapshot.hardBlock) ??
        ExecutionUtils.readBoolean(riskGateMeta?.hardBlock),
      riskEvaluatedAt: ExecutionUtils.readString(outputSnapshot.riskEvaluatedAt),
    };
  }

  public async executeCustomNode(params: {
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

  public async executeSubflowNode(params: {
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
      throw new BadRequestException(
        `subflow-call 节点 ${params.node.name} 缺少 workflowDefinitionId`,
      );
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

    const childExecution = await this.executionService.trigger(
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
    const prefixOutput = outputKeyPrefix.length > 0 ? { [outputKeyPrefix]: childOutput } : {};

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
