import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CancelWorkflowExecutionDto,
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
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { DebateTraceService } from '../debate-trace/debate-trace.service';
import type { DebateReplayQueryDto } from '@packages/types';

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

@Injectable()
export class WorkflowExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeExecutorRegistry: NodeExecutorRegistry,
    private readonly debateTraceService: DebateTraceService,
  ) {}

  async trigger(
    ownerUserId: string,
    dto: TriggerWorkflowExecutionDto,
    options?: { sourceExecutionId?: string },
  ) {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: {
        id: dto.workflowDefinitionId,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
    });

    if (!definition) {
      throw new NotFoundException('流程不存在或无权限执行');
    }

    const version = dto.workflowVersionId
      ? await this.prisma.workflowVersion.findFirst({
          where: {
            id: dto.workflowVersionId,
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

    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
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

    const bindingSnapshot = await this.buildBindingSnapshot(ownerUserId, parsedDsl.data);
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
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    const sortedNodes = this.sortNodesByEdges(parsedDsl.data);
    const incomingNodeMap = this.buildIncomingNodeMap(parsedDsl.data.edges);
    const outgoingEdgeMap = this.buildOutgoingEdgeMap(parsedDsl.data.edges);
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

        const startedAt = new Date();
        const inputSnapshot = this.buildNodeInput(node.id, incomingNodeMap, outputsByNode);
        const nodeExecutor = this.nodeExecutorRegistry.resolve(node);
        const runtimePolicy = this.resolveRuntimePolicy(node, parsedDsl.data.runPolicy);

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
              () =>
                nodeExecutor.execute({
                  executionId: execution.id,
                  triggerUserId: ownerUserId,
                  node,
                  input: inputSnapshot,
                  paramSnapshot: mergedParamSnapshot,
                }),
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

      if (isCanceled) {
        return this.prisma.workflowExecution.findUnique({
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
  ): Promise<Record<string, unknown>> {
    const agentBindings = this.uniqueStringList(dsl.agentBindings);
    const paramSetBindings = this.uniqueStringList(dsl.paramSetBindings);
    const dataConnectorBindings = this.uniqueStringList(dsl.dataConnectorBindings);

    const [agents, parameterSets, connectors] = await Promise.all([
      agentBindings.length > 0
        ? this.prisma.agentProfile.findMany({
            where: {
              agentCode: { in: agentBindings },
              isActive: true,
              OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
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
              setCode: { in: paramSetBindings },
              isActive: true,
              OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
            select: {
              id: true,
              setCode: true,
              version: true,
              templateSource: true,
            },
          })
        : Promise.resolve([]),
      dataConnectorBindings.length > 0
        ? this.prisma.dataConnector.findMany({
            where: {
              connectorCode: { in: dataConnectorBindings },
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

    const resolvedAgentCodes = new Set(agents.map((item) => item.agentCode));
    const resolvedSetCodes = new Set(parameterSets.map((item) => item.setCode));
    const resolvedConnectorCodes = new Set(connectors.map((item) => item.connectorCode));

    return {
      workflowBindings: {
        agentBindings,
        paramSetBindings,
        dataConnectorBindings,
      },
      resolvedBindings: {
        agents,
        parameterSets,
        dataConnectors: connectors,
      },
      unresolvedBindings: {
        agents: agentBindings.filter((item) => !resolvedAgentCodes.has(item)),
        parameterSets: paramSetBindings.filter((item) => !resolvedSetCodes.has(item)),
        dataConnectors: dataConnectorBindings.filter((item) => !resolvedConnectorCodes.has(item)),
      },
    };
  }

  private mergeParamSnapshot(
    paramSnapshot: Record<string, unknown> | undefined,
    bindingSnapshot: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = paramSnapshot ? { ...paramSnapshot } : {};
    base._workflowBindings = bindingSnapshot;
    return base;
  }

  private uniqueStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const set = new Set<string>();
    for (const item of value) {
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

  private buildIncomingNodeMap(edges: WorkflowEdge[]): Map<string, string[]> {
    const incomingNodeMap = new Map<string, string[]>();
    for (const edge of edges) {
      const incomingNodeIds = incomingNodeMap.get(edge.to) || [];
      incomingNodeIds.push(edge.from);
      incomingNodeMap.set(edge.to, incomingNodeIds);
    }
    return incomingNodeMap;
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

  private buildNodeInput(
    nodeId: string,
    incomingNodeMap: Map<string, string[]>,
    outputsByNode: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const incomingNodeIds = incomingNodeMap.get(nodeId) || [];
    if (incomingNodeIds.length === 0) {
      return {};
    }

    if (incomingNodeIds.length === 1) {
      return outputsByNode.get(incomingNodeIds[0]) || {};
    }

    const branchOutputs: Record<string, unknown> = {};
    for (const incomingNodeId of incomingNodeIds) {
      branchOutputs[incomingNodeId] = outputsByNode.get(incomingNodeId) || {};
    }
    return { branches: branchOutputs };
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
