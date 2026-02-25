import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateConversationBacktestDto,
  CreateSkillDraftDto,
  CreateConversationSubscriptionDto,
  ConfirmConversationPlanDto,
  CreateConversationSessionDto,
  CreateConversationTurnDto,
  DeliverConversationDto,
  DeliverConversationEmailDto,
  ExportConversationResultDto,
  ResolveConversationScheduleDto,
  ReuseConversationAssetDto,
  UpdateConversationSubscriptionDto,
} from '@packages/types';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkflowExecutionService } from '../workflow-execution';
import { ReportExportService } from '../report-export';

type SessionState =
  | 'INTENT_CAPTURE'
  | 'SLOT_FILLING'
  | 'PLAN_PREVIEW'
  | 'USER_CONFIRM'
  | 'EXECUTING'
  | 'RESULT_DELIVERY'
  | 'DONE'
  | 'FAILED';

type IntentCode = 'MARKET_SUMMARY_WITH_FORECAST' | 'DEBATE_MARKET_JUDGEMENT';

type SlotMap = {
  timeRange?: string;
  region?: string;
  outputFormat?: string[];
  judgePolicy?: string;
  topic?: string;
  maxRounds?: number;
  participants?: Array<{
    agentCode: string;
    role: string;
    perspective?: string;
    weight?: number;
  }>;
};

type ProposedPlan = {
  planId: string;
  planType: 'RUN_PLAN' | 'DEBATE_PLAN';
  intent: IntentCode;
  workflowDefinitionId: string | null;
  skills: string[];
  paramSnapshot: SlotMap;
  estimatedCost: {
    token: number;
    latencyMs: number;
  };
};

type ConversationSessionQueryDto = {
  state?: SessionState;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class AgentConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly reportExportService: ReportExportService,
  ) {}

  async createSession(userId: string, dto: CreateConversationSessionDto) {
    return this.prisma.conversationSession.create({
      data: {
        title: dto.title ?? null,
        ownerUserId: userId,
      },
    });
  }

  async listSessions(userId: string, query: ConversationSessionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where = {
      ownerUserId: userId,
    } as Record<string, unknown>;

    if (query.state) {
      where.state = query.state;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { currentIntent: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.conversationSession.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.conversationSession.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSessionDetail(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      include: {
        turns: {
          orderBy: { createdAt: 'asc' },
          take: 200,
        },
        plans: {
          orderBy: { version: 'desc' },
          take: 20,
        },
      },
    });

    if (!session) {
      return null;
    }

    return session;
  }

  async createTurn(userId: string, sessionId: string, dto: CreateConversationTurnDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });

    if (!session) {
      return null;
    }

    const userTurn = await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'USER',
        content: dto.message,
        structuredPayload: this.toJson(dto.contextPatch),
      },
    });

    const reusedAssetId = this.pickString(dto.contextPatch?.reusedAssetId);
    if (reusedAssetId && this.isUuid(reusedAssetId)) {
      const reusedAsset = await this.prisma.conversationAsset.findFirst({
        where: { id: reusedAssetId, sessionId },
      });
      if (reusedAsset) {
        await this.prisma.conversationAssetRef.create({
          data: {
            sessionId,
            turnId: userTurn.id,
            assetId: reusedAsset.id,
            note: 'user_context_reuse',
          },
        });
      }
    }

    const intent = this.detectIntent(dto.message, session.currentIntent);
    const mergedSlots = this.mergeSlots(
      this.normalizeSlots(session.currentSlots),
      this.extractSlots(dto.message),
      dto.contextPatch,
    );

    const requiredSlots = this.requiredSlotsByIntent(intent);
    const missingSlots = requiredSlots.filter((key) => this.isSlotMissing(mergedSlots[key]));
    const hasMissingSlots = missingSlots.length > 0;

    const state: SessionState = hasMissingSlots ? 'SLOT_FILLING' : 'PLAN_PREVIEW';
    const planId = `plan_${randomUUID()}`;
    const proposedPlan: ProposedPlan | null = hasMissingSlots
      ? null
      : {
          planId,
          planType: intent === 'DEBATE_MARKET_JUDGEMENT' ? 'DEBATE_PLAN' : 'RUN_PLAN',
          intent,
          workflowDefinitionId: await this.pickWorkflowDefinitionId(session.ownerUserId),
          skills:
            intent === 'DEBATE_MARKET_JUDGEMENT'
              ? ['price_series_query', 'knowledge_search', 'futures_quote_fetch', 'debate_round']
              : ['price_series_query', 'knowledge_search', 'futures_quote_fetch'],
          paramSnapshot: mergedSlots,
          estimatedCost: {
            token: intent === 'DEBATE_MARKET_JUDGEMENT' ? 28000 : 18000,
            latencyMs: intent === 'DEBATE_MARKET_JUDGEMENT' ? 20000 : 12000,
          },
        };

    let nextPlanVersion: number | null = null;
    if (proposedPlan) {
      const latestPlan = await this.prisma.conversationPlan.findFirst({
        where: { sessionId },
        orderBy: { version: 'desc' },
      });
      nextPlanVersion = (latestPlan?.version ?? 0) + 1;
      await this.prisma.conversationPlan.create({
        data: {
          sessionId,
          version: nextPlanVersion,
          planType: proposedPlan.planType,
          planSnapshot: proposedPlan as Prisma.InputJsonValue,
        },
      });
      await this.createConversationAsset({
        sessionId,
        assetType: 'PLAN',
        title: `执行计划 v${nextPlanVersion}`,
        payload: proposedPlan,
        sourceTurnId: userTurn.id,
        sourcePlanVersion: nextPlanVersion,
      });
    }

    let autoExecution:
      | {
          accepted: boolean;
          executionId: string;
          status: string;
          traceId: string;
        }
      | undefined;

    if (
      proposedPlan &&
      nextPlanVersion &&
      this.shouldAutoExecute(dto.contextPatch)
    ) {
      const execution = await this.confirmPlan(
        userId,
        sessionId,
        {
          planId: proposedPlan.planId,
          planVersion: nextPlanVersion,
        },
        { recordTurn: false },
      );
      if (execution) {
        autoExecution = execution;
      }
    }

    const assistantMessage = hasMissingSlots
      ? this.buildSlotPrompt(missingSlots)
      : autoExecution
        ? '我已生成计划并自动开始执行。你可以继续补充要求，结果会在当前会话持续更新。'
        : '我已完成计划编排。请确认执行，或告诉我需要调整的参数。';

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: assistantMessage,
        structuredPayload: {
          intent,
          missingSlots,
          proposedPlan,
          autoExecuted: Boolean(autoExecution),
          executionId: autoExecution?.executionId,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        currentIntent: intent,
        currentSlots: mergedSlots,
        state: autoExecution ? 'EXECUTING' : state,
        latestPlanType:
          proposedPlan?.planType === 'DEBATE_PLAN' ? 'DEBATE_PLAN' : proposedPlan ? 'RUN_PLAN' : null,
        latestPlanSnapshot: proposedPlan
          ? (proposedPlan as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return {
      assistantMessage,
      state: autoExecution ? 'EXECUTING' : state,
      intent,
      missingSlots,
      proposedPlan,
      confirmRequired: !hasMissingSlots && !autoExecution,
      autoExecuted: Boolean(autoExecution),
      executionId: autoExecution?.executionId,
    };
  }

  async confirmPlan(
    userId: string,
    sessionId: string,
    dto: ConfirmConversationPlanDto,
    options?: { recordTurn?: boolean },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const plan = await this.prisma.conversationPlan.findUnique({
      where: { sessionId_version: { sessionId, version: dto.planVersion } },
    });
    if (!plan) {
      throw new BadRequestException({
        code: 'CONV_PLAN_VERSION_NOT_FOUND',
        message: '计划版本不存在，请先重新生成计划',
      });
    }
    if (plan.isConfirmed) {
      throw new BadRequestException({
        code: 'CONV_PLAN_ALREADY_CONFIRMED',
        message: '该计划已确认执行，请勿重复提交',
      });
    }

    const snapshot = this.toRecord(plan.planSnapshot);
    const snapshotPlanId = typeof snapshot.planId === 'string' ? snapshot.planId : '';
    if (snapshotPlanId !== dto.planId) {
      throw new BadRequestException({
        code: 'CONV_PLAN_ID_MISMATCH',
        message: '计划ID与版本不匹配，请刷新后重试',
      });
    }

    const mergedPlan = {
      ...snapshot,
      ...(dto.confirmedPlan ?? {}),
    };

    const workflowDefinitionId = this.pickString(mergedPlan.workflowDefinitionId);
    if (!workflowDefinitionId || !this.isUuid(workflowDefinitionId)) {
      throw new BadRequestException({
        code: 'CONV_WORKFLOW_NOT_BINDABLE',
        message: '计划未绑定可执行流程，请先在工作流中心选择可执行模板',
      });
    }

    const paramSnapshot = this.toRecord(mergedPlan.paramSnapshot);
    const compiledParamSnapshot = this.compileExecutionParams(mergedPlan, paramSnapshot);

    const execution = await this.workflowExecutionService.trigger(userId, {
      workflowDefinitionId,
      triggerType: 'MANUAL',
      paramSnapshot: compiledParamSnapshot,
      idempotencyKey: `conversation-${sessionId}-plan-${dto.planVersion}`,
    });
    if (!execution) {
      throw new BadRequestException({
        code: 'CONV_EXECUTION_TRIGGER_FAILED',
        message: '执行触发失败，请稍后重试',
      });
    }

    await this.prisma.conversationPlan.update({
      where: { id: plan.id },
      data: {
        isConfirmed: true,
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        workflowExecutionId: execution.id,
        planSnapshot: mergedPlan as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: 'EXECUTING',
        latestExecutionId: execution.id,
        latestPlanSnapshot: mergedPlan as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'EXECUTION',
      title: `执行实例 ${execution.id.slice(0, 8)}`,
      payload: {
        executionId: execution.id,
        planVersion: dto.planVersion,
        workflowDefinitionId,
        paramSnapshot: compiledParamSnapshot,
      },
      sourceExecutionId: execution.id,
      sourcePlanVersion: dto.planVersion,
    });

    if (options?.recordTurn !== false) {
      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: '已确认执行计划，任务已启动。',
          structuredPayload: {
            executionId: execution.id,
            planVersion: dto.planVersion,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      accepted: true,
      executionId: execution.id,
      status: 'EXECUTING',
      traceId: session.traceId ?? `trace_${sessionId}`,
    };
  }

  async getResult(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const executionId = session.latestExecutionId;
    if (!executionId) {
      return {
        status: session.state,
        result: null,
        artifacts: [],
      };
    }

    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: {
        workflowVersion: {
          include: {
            workflowDefinition: {
              select: { ownerUserId: true },
            },
          },
        },
      },
    });

    if (!execution) {
      return {
        status: 'FAILED',
        result: null,
        artifacts: [],
        error: '执行实例不存在',
      };
    }

    const definitionOwner = execution.workflowVersion.workflowDefinition.ownerUserId;
    if (execution.triggerUserId !== userId && definitionOwner !== userId) {
      return null;
    }

    const exportTasks = await this.prisma.exportTask.findMany({
      where: { workflowExecutionId: execution.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const outputRecord = this.toRecord(execution.outputSnapshot);
    const result = this.normalizeResult(outputRecord);
    const status = this.mapExecutionStatus(execution.status);

    if (status === 'DONE') {
      await this.createConversationAsset({
        sessionId,
        assetType: 'RESULT_SUMMARY',
        title: `分析结论 ${execution.id.slice(0, 8)}`,
        payload: {
          executionId: execution.id,
          result,
          status,
        },
        sourceExecutionId: execution.id,
      });
    }

    const nextState: SessionState =
      status === 'DONE' ? 'DONE' : status === 'FAILED' ? 'FAILED' : 'RESULT_DELIVERY';

    if (session.state !== nextState) {
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          state: nextState,
          endedAt: nextState === 'DONE' || nextState === 'FAILED' ? new Date() : session.endedAt,
        },
      });
    }

    return {
      status,
      result,
      artifacts: exportTasks.map((task) => ({
        type: task.format,
        exportTaskId: task.id,
        status: task.status,
        downloadUrl: task.status === 'COMPLETED' ? `/report-exports/${task.id}/download` : null,
      })),
      executionId: execution.id,
      error: execution.errorMessage,
    };
  }

  async exportResult(userId: string, sessionId: string, dto: ExportConversationResultDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const workflowExecutionId = dto.workflowExecutionId ?? session.latestExecutionId;
    if (!workflowExecutionId || !this.isUuid(workflowExecutionId)) {
      throw new BadRequestException({
        code: 'CONV_EXPORT_EXECUTION_NOT_FOUND',
        message: '未找到可导出的执行实例，请先完成一次执行',
      });
    }

    const exportTask = await this.reportExportService.createExportTask(userId, {
      workflowExecutionId,
      format: dto.format,
      sections: dto.sections,
      title: dto.title,
      includeRawData: dto.includeRawData,
    });

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: `报告导出任务已创建（${dto.format}）。`,
        structuredPayload: {
          exportTaskId: exportTask.id,
          workflowExecutionId,
          format: dto.format,
        } as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'EXPORT_FILE',
      title: `导出文件 ${dto.format}`,
      payload: {
        exportTaskId: exportTask.id,
        format: dto.format,
        workflowExecutionId,
        status: exportTask.status,
      },
      sourceExecutionId: workflowExecutionId,
    });

    return {
      exportTaskId: exportTask.id,
      status: exportTask.status,
      workflowExecutionId,
      downloadUrl: exportTask.downloadUrl,
    };
  }

  async deliverEmail(userId: string, sessionId: string, dto: DeliverConversationEmailDto) {
    return this.deliver(userId, sessionId, {
      exportTaskId: dto.exportTaskId,
      channel: 'EMAIL',
      to: dto.to,
      subject: dto.subject,
      content: dto.content,
      sendRawFile: true,
    });
  }

  async deliver(userId: string, sessionId: string, dto: DeliverConversationDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const exportTask = await this.prisma.exportTask.findFirst({
      where: { id: dto.exportTaskId, createdByUserId: userId },
    });
    if (!exportTask) {
      throw new BadRequestException({
        code: 'CONV_EXPORT_TASK_NOT_FOUND',
        message: '导出任务不存在或无权限访问',
      });
    }
    if (exportTask.status !== 'COMPLETED') {
      throw new BadRequestException({
        code: 'CONV_EXPORT_TASK_NOT_READY',
        message: '导出任务尚未完成，暂不可发送邮件',
      });
    }

    const channel = dto.channel;
    if (channel === 'EMAIL' && (!dto.to || dto.to.length === 0)) {
      throw new BadRequestException({
        code: 'CONV_DELIVERY_TARGET_REQUIRED',
        message: '邮件投递至少需要一个收件人',
      });
    }
    if (channel !== 'EMAIL' && !dto.target) {
      throw new BadRequestException({
        code: 'CONV_DELIVERY_TARGET_REQUIRED',
        message: '请提供投递目标（群ID或接收端标识）',
      });
    }

    const deliveryTaskId = `delivery_${randomUUID()}`;
    const webhookUrl = this.resolveDeliveryWebhook(channel);

    let status: 'QUEUED' | 'SENT' | 'FAILED' = 'QUEUED';
    let errorMessage: string | null = null;

    if (!webhookUrl) {
      status = 'FAILED';
      errorMessage = `未配置 ${channel} 投递 webhook，无法实际投递`; 
    } else {
      try {
        const fileName = `report-export-${exportTask.id}.${String(exportTask.format).toLowerCase()}`;
        const downloadUrl = `/report-exports/${exportTask.id}/download`;
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deliveryTaskId,
            channel,
            exportTaskId: exportTask.id,
            to: dto.to,
            target: dto.target,
            subject: dto.subject || 'CTBMS 对话助手分析报告',
            content: dto.content || '请查收本次对话分析结果。',
            metadata: dto.metadata,
            attachment: {
              fileName,
              downloadUrl,
              mode: dto.sendRawFile ? 'RAW_FILE' : 'EXPORT_FILE',
            },
          }),
        });

        if (response.ok) {
          status = 'SENT';
        } else {
          status = 'FAILED';
          errorMessage = `${channel} 投递网关返回 ${response.status}`;
        }
      } catch (error) {
        status = 'FAILED';
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content:
          status === 'SENT'
            ? `${this.channelDisplayName(channel)} 投递已发送。`
            : `${this.channelDisplayName(channel)} 投递失败：${errorMessage ?? '未知错误'}。`,
        structuredPayload: {
          deliveryTaskId,
          channel,
          exportTaskId: exportTask.id,
          status,
          to: dto.to,
          target: dto.target,
          subject: dto.subject,
          errorMessage,
        } as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: `${this.channelDisplayName(channel)}投递${status === 'SENT' ? '成功' : '失败'}`,
      payload: {
        deliveryTaskId,
        channel,
        exportTaskId: exportTask.id,
        status,
        to: dto.to,
        target: dto.target,
        errorMessage,
      },
      sourceExecutionId: exportTask.workflowExecutionId,
    });

    return {
      deliveryTaskId,
      channel,
      status,
      errorMessage,
    };
  }

  async createBacktest(userId: string, sessionId: string, dto: CreateConversationBacktestDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const workflowExecutionId = dto.executionId ?? session.latestExecutionId;
    if (!workflowExecutionId || !this.isUuid(workflowExecutionId)) {
      throw new BadRequestException({
        code: 'CONV_BACKTEST_EXECUTION_NOT_FOUND',
        message: '未找到可回测的执行实例，请先完成一次执行',
      });
    }

    const execution = await this.getAuthorizedExecution(userId, workflowExecutionId);
    if (!execution) {
      throw new BadRequestException({
        code: 'CONV_BACKTEST_EXECUTION_NOT_FOUND',
        message: '执行实例不存在或无权限访问',
      });
    }

    const inputConfig = {
      executionId: workflowExecutionId,
      strategySource: dto.strategySource,
      lookbackDays: dto.lookbackDays,
      feeModel: dto.feeModel,
    };

    const backtest = await this.prisma.conversationBacktestJob.create({
      data: {
        sessionId,
        workflowExecutionId,
        status: 'RUNNING',
        inputConfig: inputConfig as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    try {
      const outputRecord = this.toRecord(execution.outputSnapshot);
      const result = this.normalizeResult(outputRecord);
      const summary = this.computeBacktestSummary(result.confidence, dto.lookbackDays, dto.feeModel);
      const metrics = {
        sampleSize: Math.max(20, Math.round(dto.lookbackDays * 0.35)),
        assumptions: {
          lookbackDays: dto.lookbackDays,
          feeModel: dto.feeModel,
          strategySource: dto.strategySource,
        },
      };

      const completed = await this.prisma.conversationBacktestJob.update({
        where: { id: backtest.id },
        data: {
          status: 'COMPLETED',
          resultSummary: summary as Prisma.InputJsonValue,
          metrics: metrics as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `回测完成：收益 ${summary.returnPct}%，最大回撤 ${summary.maxDrawdownPct}%，胜率 ${summary.winRatePct}%。`,
          structuredPayload: {
            backtestJobId: completed.id,
            status: completed.status,
            summary,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'BACKTEST_SUMMARY',
        title: `回测结果 ${completed.id.slice(0, 8)}`,
        payload: {
          backtestJobId: completed.id,
          summary,
          metrics,
          status: completed.status,
        },
        sourceExecutionId: workflowExecutionId,
      });

      return {
        backtestJobId: completed.id,
        status: completed.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.conversationBacktestJob.update({
        where: { id: backtest.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });
      throw new BadRequestException({
        code: 'CONV_BACKTEST_RUN_FAILED',
        message: errorMessage,
      });
    }
  }

  async getBacktest(userId: string, sessionId: string, backtestJobId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const backtest = await this.prisma.conversationBacktestJob.findFirst({
      where: { id: backtestJobId, sessionId },
    });
    if (!backtest) {
      return null;
    }

    return {
      backtestJobId: backtest.id,
      status: backtest.status,
      summary: this.toRecord(backtest.resultSummary),
      assumptions: this.toRecord(backtest.inputConfig),
      metrics: this.toRecord(backtest.metrics),
      errorMessage: backtest.errorMessage,
      completedAt: backtest.completedAt,
    };
  }

  async getConflicts(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    let conflicts = await this.prisma.conversationConflictRecord.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
    });

    if (!conflicts.length && session.latestExecutionId && this.isUuid(session.latestExecutionId)) {
      const execution = await this.getAuthorizedExecution(userId, session.latestExecutionId);
      if (execution) {
        const generated = this.deriveConflictsFromExecutionOutput(execution.outputSnapshot);
        if (generated.length) {
          await this.prisma.conversationConflictRecord.createMany({
            data: generated.map((item) => ({
              sessionId,
              workflowExecutionId: execution.id,
              topic: item.topic,
              consistencyScore: item.consistencyScore,
              sourceA: item.sourceA,
              sourceB: item.sourceB,
              valueA: item.valueA as Prisma.InputJsonValue,
              valueB: item.valueB as Prisma.InputJsonValue,
              resolution: item.resolution,
              resolutionReason: item.reason,
            })),
          });
          conflicts = await this.prisma.conversationConflictRecord.findMany({
            where: { sessionId },
            orderBy: [{ createdAt: 'desc' }],
            take: 20,
          });
        }
      }
    }

    const consistencyScore = this.computeConflictConsistencyScore(conflicts);

    if (conflicts.length) {
      await this.createConversationAsset({
        sessionId,
        assetType: 'CONFLICT_SUMMARY',
        title: `冲突摘要 ${new Date().toISOString().slice(0, 10)}`,
        payload: {
          consistencyScore,
          conflicts: conflicts.slice(0, 10).map((item) => ({
            conflictId: item.id,
            topic: item.topic,
            sourceA: item.sourceA,
            sourceB: item.sourceB,
            resolution: item.resolution,
            resolutionReason: item.resolutionReason,
            consistencyScore: item.consistencyScore,
          })),
        },
        sourceExecutionId: session.latestExecutionId ?? null,
      });
    }

    return {
      consistencyScore,
      conflicts: conflicts.map((item) => ({
        conflictId: item.id,
        topic: item.topic,
        sources: [item.sourceA, item.sourceB],
        resolution: item.resolution,
        reason: item.resolutionReason,
        consistencyScore: item.consistencyScore,
      })),
    };
  }

  async createSkillDraft(userId: string, sessionId: string, dto: CreateSkillDraftDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const derivedRisk = this.resolveSkillRisk(dto);
    const draftSpec = {
      gapType: dto.gapType,
      requiredCapability: dto.requiredCapability,
      suggestedSkillCode: dto.suggestedSkillCode,
      sourceSessionId: sessionId,
      sourceIntent: session.currentIntent,
      riskLevel: derivedRisk.riskLevel,
      sideEffectRisk: derivedRisk.sideEffectRisk,
    };

    const draft = await this.prisma.agentSkillDraft.create({
      data: {
        sessionId,
        ownerUserId: userId,
        gapType: dto.gapType,
        requiredCapability: dto.requiredCapability,
        suggestedSkillCode: dto.suggestedSkillCode,
        draftSpec: draftSpec as Prisma.InputJsonValue,
        status: 'DRAFT',
        riskLevel: derivedRisk.riskLevel,
        sideEffectRisk: derivedRisk.sideEffectRisk,
        provisionalEnabled: derivedRisk.allowRuntimeGrant,
      },
    });

    await this.prisma.agentSkillGovernanceEvent.create({
      data: {
        ownerUserId: userId,
        draftId: draft.id,
        eventType: 'DRAFT_CREATED',
        message: `Skill Draft 已创建：${draft.id}`,
        payload: {
          riskLevel: derivedRisk.riskLevel,
          sideEffectRisk: derivedRisk.sideEffectRisk,
        } as Prisma.InputJsonValue,
      },
    });

    let runtimeGrantId: string | null = null;
    if (derivedRisk.allowRuntimeGrant) {
      const runtimeGrant = await this.prisma.agentSkillRuntimeGrant.create({
        data: {
          draftId: draft.id,
          sessionId,
          ownerUserId: userId,
          status: 'ACTIVE',
          maxUseCount: 30,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      runtimeGrantId = runtimeGrant.id;

      await this.prisma.agentSkillGovernanceEvent.create({
        data: {
          ownerUserId: userId,
          draftId: draft.id,
          runtimeGrantId: runtimeGrant.id,
          eventType: 'RUNTIME_GRANT_CREATED',
          message: `运行时授权已创建：${runtimeGrant.id}`,
          payload: {
            maxUseCount: runtimeGrant.maxUseCount,
            expiresAt: runtimeGrant.expiresAt,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: `已创建 Skill Draft：${dto.suggestedSkillCode}`,
        structuredPayload: {
          draftId: draft.id,
          status: draft.status,
          reviewRequired: true,
          riskLevel: derivedRisk.riskLevel,
          provisionalEnabled: derivedRisk.allowRuntimeGrant,
          runtimeGrantId,
        } as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'SKILL_DRAFT',
      title: `Skill Draft ${dto.suggestedSkillCode}`,
      payload: {
        draftId: draft.id,
        gapType: dto.gapType,
        requiredCapability: dto.requiredCapability,
        suggestedSkillCode: dto.suggestedSkillCode,
        status: draft.status,
      },
      sourceTurnId: null,
    });

    return {
      draftId: draft.id,
      status: draft.status,
      reviewRequired: true,
      riskLevel: derivedRisk.riskLevel,
      provisionalEnabled: derivedRisk.allowRuntimeGrant,
      runtimeGrantId,
    };
  }

  async listAssets(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    return this.prisma.conversationAsset.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  async reuseAsset(
    userId: string,
    sessionId: string,
    assetId: string,
    dto: ReuseConversationAssetDto,
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const asset = await this.prisma.conversationAsset.findFirst({
      where: { id: assetId, sessionId },
    });
    if (!asset) {
      return null;
    }

    const reuseMessage = dto.message?.trim() || `请基于资产「${asset.title}」继续处理。`;
    return this.createTurn(userId, sessionId, {
      message: reuseMessage,
      contextPatch: {
        ...(dto.contextPatch ?? {}),
        reusedAssetId: asset.id,
      },
    });
  }

  async listSubscriptions(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    return this.prisma.conversationSubscription.findMany({
      where: { sessionId, ownerUserId: userId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  async createSubscription(
    userId: string,
    sessionId: string,
    dto: CreateConversationSubscriptionDto,
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const plan = dto.planVersion
      ? await this.prisma.conversationPlan.findUnique({
          where: { sessionId_version: { sessionId, version: dto.planVersion } },
        })
      : await this.prisma.conversationPlan.findFirst({
          where: { sessionId, isConfirmed: true },
          orderBy: { version: 'desc' },
        });

    if (!plan) {
      throw new BadRequestException({
        code: 'CONV_SUB_PLAN_NOT_FOUND',
        message: '未找到可订阅的计划，请先执行并确认计划',
      });
    }

    const planSnapshot = this.toRecord(plan.planSnapshot);
    const nextRunAt = this.computeNextRunAt(dto.cronExpr, dto.timezone);

    const subscription = await this.prisma.conversationSubscription.create({
      data: {
        sessionId,
        ownerUserId: userId,
        name: dto.name,
        planSnapshot: planSnapshot as Prisma.InputJsonValue,
        cronExpr: dto.cronExpr,
        timezone: dto.timezone,
        status: 'ACTIVE',
        deliveryConfig: (dto.deliveryConfig ?? {}) as Prisma.InputJsonValue,
        quietHours: dto.quietHours ? (dto.quietHours as Prisma.InputJsonValue) : Prisma.JsonNull,
        nextRunAt,
      },
    });

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: `已创建订阅：${dto.name}`,
        structuredPayload: {
          subscriptionId: subscription.id,
          status: subscription.status,
          nextRunAt,
        } as Prisma.InputJsonValue,
      },
    });

    return subscription;
  }

  async updateSubscription(
    userId: string,
    sessionId: string,
    subscriptionId: string,
    dto: UpdateConversationSubscriptionDto,
  ) {
    const subscription = await this.prisma.conversationSubscription.findFirst({
      where: { id: subscriptionId, sessionId, ownerUserId: userId },
    });
    if (!subscription) {
      return null;
    }

    const nextStatus = dto.status ?? subscription.status;
    const nextCronExpr = dto.cronExpr ?? subscription.cronExpr;
    const nextTimezone = dto.timezone ?? subscription.timezone;
    const shouldComputeNextRunAt = nextStatus === 'ACTIVE';

    return this.prisma.conversationSubscription.update({
      where: { id: subscriptionId },
      data: {
        name: dto.name ?? subscription.name,
        cronExpr: nextCronExpr,
        timezone: nextTimezone,
        status: nextStatus,
        deliveryConfig:
          dto.deliveryConfig !== undefined
            ? (dto.deliveryConfig as Prisma.InputJsonValue)
            : undefined,
        quietHours:
          dto.quietHours !== undefined ? (dto.quietHours as Prisma.InputJsonValue) : undefined,
        nextRunAt: shouldComputeNextRunAt
          ? this.computeNextRunAt(nextCronExpr, nextTimezone)
          : null,
      },
    });
  }

  async runSubscriptionNow(userId: string, sessionId: string, subscriptionId: string) {
    const subscription = await this.prisma.conversationSubscription.findFirst({
      where: { id: subscriptionId, sessionId, ownerUserId: userId },
    });
    if (!subscription) {
      return null;
    }

    return this.runSubscription(subscription.id, 'RERUN', userId);
  }

  async resolveScheduleCommand(
    userId: string,
    sessionId: string,
    dto: ResolveConversationScheduleDto,
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const parsed = this.parseScheduleInstruction(dto.instruction);
    let result: Record<string, unknown>;

    if (parsed.action === 'CREATE') {
      const created = await this.createSubscription(userId, sessionId, {
        name: parsed.subscriptionName,
        cronExpr: parsed.cronExpr,
        timezone: parsed.timezone,
        deliveryConfig: {
          channel: parsed.channel,
          target: parsed.target,
        },
      });
      if (!created) {
        return null;
      }
      result = {
        action: 'CREATE',
        subscriptionId: created.id,
        status: created.status,
        cronExpr: created.cronExpr,
        timezone: created.timezone,
        nextRunAt: created.nextRunAt,
        channel: parsed.channel,
        target: parsed.target,
      };
    } else {
      const subscription = await this.pickTargetSubscription(
        userId,
        sessionId,
        parsed.subscriptionName,
      );
      if (!subscription) {
        throw new BadRequestException({
          code: 'CONV_SCHEDULE_SUB_NOT_FOUND',
          message: '未找到可操作的订阅，请先创建订阅或指定名称',
        });
      }

      if (parsed.action === 'PAUSE') {
        const updated = await this.updateSubscription(userId, sessionId, subscription.id, {
          status: 'PAUSED',
        });
        result = {
          action: 'PAUSE',
          subscriptionId: subscription.id,
          status: updated?.status,
        };
      } else if (parsed.action === 'RESUME') {
        const updated = await this.updateSubscription(userId, sessionId, subscription.id, {
          status: 'ACTIVE',
        });
        result = {
          action: 'RESUME',
          subscriptionId: subscription.id,
          status: updated?.status,
          nextRunAt: updated?.nextRunAt,
        };
      } else if (parsed.action === 'RUN') {
        const run = await this.runSubscriptionNow(userId, sessionId, subscription.id);
        result = {
          action: 'RUN',
          subscriptionId: subscription.id,
          runId: run?.runId,
          status: run?.status,
        };
      } else {
        const updated = await this.updateSubscription(userId, sessionId, subscription.id, {
          cronExpr: parsed.cronExpr,
          timezone: parsed.timezone,
          status: 'ACTIVE',
          deliveryConfig: {
            channel: parsed.channel,
            target: parsed.target,
          },
        });
        result = {
          action: 'UPDATE',
          subscriptionId: subscription.id,
          status: updated?.status,
          cronExpr: updated?.cronExpr,
          timezone: updated?.timezone,
          nextRunAt: updated?.nextRunAt,
          channel: parsed.channel,
          target: parsed.target,
        };
      }
    }

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: this.buildScheduleResolutionMessage(result),
        structuredPayload: {
          scheduleResolution: result,
          instruction: dto.instruction,
        } as Prisma.InputJsonValue,
      },
    });

    return result;
  }

  async processDueSubscriptions() {
    const now = new Date();
    const dueSubscriptions = await this.prisma.conversationSubscription.findMany({
      where: {
        status: 'ACTIVE',
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 20,
    });

    for (const subscription of dueSubscriptions) {
      await this.runSubscription(subscription.id, 'SCHEDULED', subscription.ownerUserId);
    }
  }

  private shouldAutoExecute(contextPatch?: Record<string, unknown>): boolean {
    const explicit = contextPatch?.autoExecute;
    if (typeof explicit === 'boolean') {
      return explicit;
    }
    return true;
  }

  private resolveDeliveryWebhook(channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU') {
    if (channel === 'EMAIL') {
      return process.env.MAIL_DELIVERY_WEBHOOK_URL?.trim();
    }
    if (channel === 'DINGTALK') {
      return process.env.DINGTALK_DELIVERY_WEBHOOK_URL?.trim();
    }
    if (channel === 'WECOM') {
      return process.env.WECOM_DELIVERY_WEBHOOK_URL?.trim();
    }
    if (channel === 'FEISHU') {
      return process.env.FEISHU_DELIVERY_WEBHOOK_URL?.trim();
    }
    return null;
  }

  private channelDisplayName(channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU') {
    if (channel === 'EMAIL') {
      return '邮件';
    }
    if (channel === 'DINGTALK') {
      return '钉钉';
    }
    if (channel === 'WECOM') {
      return '企业微信';
    }
    return '飞书';
  }

  private parseScheduleInstruction(instruction: string): {
    action: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME' | 'RUN';
    subscriptionName: string;
    cronExpr: string;
    timezone: string;
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU';
    target: string | null;
  } {
    const text = instruction.trim();
    const normalized = text.toLowerCase();

    const action = normalized.includes('暂停') || normalized.includes('停用')
      ? 'PAUSE'
      : normalized.includes('恢复') || normalized.includes('启用') || normalized.includes('开启')
        ? 'RESUME'
        : normalized.includes('补跑') || normalized.includes('立即执行') || normalized.includes('马上执行')
          ? 'RUN'
          : normalized.includes('修改') || normalized.includes('改成') || normalized.includes('改为')
            ? 'UPDATE'
            : 'CREATE';

    const channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU' = normalized.includes('钉钉')
      ? 'DINGTALK'
      : normalized.includes('企微') || normalized.includes('企业微信')
        ? 'WECOM'
        : normalized.includes('飞书')
          ? 'FEISHU'
          : 'EMAIL';

    const targetMatch = text.match(/(?:发到|发送到|推送到|到)\s*([^，。\s]+)/);
    const target = targetMatch ? targetMatch[1] : null;

    const nameMatch = text.match(/(?:订阅名|订阅名称|名称)[:：]?\s*([^，。\s]+)/);
    const subscriptionName = nameMatch?.[1] ?? `对话订阅-${new Date().toISOString().slice(0, 10)}`;

    const cronExpr = this.inferCronExprFromInstruction(text);

    return {
      action,
      subscriptionName,
      cronExpr,
      timezone: 'Asia/Shanghai',
      channel,
      target,
    };
  }

  private inferCronExprFromInstruction(text: string): string {
    const timeMatch = text.match(/(\d{1,2})\s*(?:点|:|时)(\d{1,2})?/);
    const hour = Math.max(0, Math.min(23, Number(timeMatch?.[1] ?? 9)));
    const minute = Math.max(0, Math.min(59, Number(timeMatch?.[2] ?? 0)));

    if (text.includes('每周')) {
      const day = text.includes('周一')
        ? 1
        : text.includes('周二')
          ? 2
          : text.includes('周三')
            ? 3
            : text.includes('周四')
              ? 4
              : text.includes('周五')
                ? 5
                : text.includes('周六')
                  ? 6
                  : text.includes('周日') || text.includes('周天')
                    ? 0
                    : 1;
      return `0 ${minute} ${hour} * * ${day}`;
    }

    if (text.includes('每月')) {
      const dayMatch = text.match(/每月\s*(\d{1,2})\s*(?:号|日)?/);
      const day = Math.max(1, Math.min(28, Number(dayMatch?.[1] ?? 1)));
      return `0 ${minute} ${hour} ${day} * *`;
    }

    return `0 ${minute} ${hour} * * *`;
  }

  private async pickTargetSubscription(
    userId: string,
    sessionId: string,
    subscriptionName?: string,
  ) {
    if (subscriptionName) {
      const named = await this.prisma.conversationSubscription.findFirst({
        where: {
          ownerUserId: userId,
          sessionId,
          name: {
            contains: subscriptionName,
            mode: 'insensitive',
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (named) {
        return named;
      }
    }

    return this.prisma.conversationSubscription.findFirst({
      where: { ownerUserId: userId, sessionId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private buildScheduleResolutionMessage(result: Record<string, unknown>) {
    const action = this.pickString(result.action) || 'UNKNOWN';
    const status = this.pickString(result.status) || '-';
    const subscriptionId = this.pickString(result.subscriptionId) || '-';
    if (action === 'RUN') {
      return `已执行订阅补跑：${subscriptionId}，状态 ${status}。`;
    }
    if (action === 'PAUSE') {
      return `已暂停订阅：${subscriptionId}。`;
    }
    if (action === 'RESUME') {
      return `已恢复订阅：${subscriptionId}，状态 ${status}。`;
    }
    if (action === 'UPDATE') {
      return `已更新订阅：${subscriptionId}，状态 ${status}。`;
    }
    return `已创建订阅：${subscriptionId}，状态 ${status}。`;
  }

  private async createConversationAsset(input: {
    sessionId: string;
    assetType:
      | 'PLAN'
      | 'EXECUTION'
      | 'RESULT_SUMMARY'
      | 'EXPORT_FILE'
      | 'BACKTEST_SUMMARY'
      | 'CONFLICT_SUMMARY'
      | 'SKILL_DRAFT'
      | 'NOTE';
    title: string;
    payload: Record<string, unknown>;
    sourceTurnId?: string | null;
    sourceExecutionId?: string | null;
    sourcePlanVersion?: number | null;
    tags?: Record<string, unknown> | null;
  }) {
    const duplicate = await this.prisma.conversationAsset.findFirst({
      where: {
        sessionId: input.sessionId,
        assetType: input.assetType,
        sourceExecutionId: input.sourceExecutionId ?? null,
        sourcePlanVersion: input.sourcePlanVersion ?? null,
        title: input.title,
      },
      select: { id: true },
    });
    if (duplicate) {
      return duplicate;
    }

    return this.prisma.conversationAsset.create({
      data: {
        sessionId: input.sessionId,
        assetType: input.assetType,
        title: input.title,
        payload: input.payload as Prisma.InputJsonValue,
        sourceTurnId: input.sourceTurnId ?? null,
        sourceExecutionId: input.sourceExecutionId ?? null,
        sourcePlanVersion: input.sourcePlanVersion ?? null,
        tags: input.tags ? (input.tags as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  private resolveSkillRisk(dto: CreateSkillDraftDto): {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    sideEffectRisk: boolean;
    allowRuntimeGrant: boolean;
  } {
    const message = `${dto.gapType} ${dto.requiredCapability} ${dto.suggestedSkillCode}`.toLowerCase();
    const explicitRisk = dto.riskLevel;
    const explicitSideEffect = dto.sideEffectRisk === true;

    const hasHighRiskKeyword =
      message.includes('下单') ||
      message.includes('自动下单') ||
      message.includes('交易执行') ||
      message.includes('写库') ||
      message.includes('扣费') ||
      message.includes('payment') ||
      message.includes('trade execution') ||
      message.includes('place order') ||
      message.includes('create order');

    const hasMediumRiskKeyword =
      message.includes('外发') ||
      message.includes('推送') ||
      message.includes('webhook') ||
      message.includes('send');

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = explicitRisk
      ? explicitRisk
      : hasHighRiskKeyword
        ? 'HIGH'
        : hasMediumRiskKeyword
          ? 'MEDIUM'
          : 'LOW';

    const sideEffectRisk = explicitSideEffect || riskLevel !== 'LOW';
    const allowRuntimeGrant = riskLevel === 'LOW' && !sideEffectRisk;

    return {
      riskLevel,
      sideEffectRisk,
      allowRuntimeGrant,
    };
  }

  private detectIntent(message: string, currentIntent?: string | null): IntentCode {
    const lower = message.toLowerCase();
    if (lower.includes('辩论') || lower.includes('debate') || lower.includes('裁判')) {
      return 'DEBATE_MARKET_JUDGEMENT';
    }
    if (currentIntent === 'DEBATE_MARKET_JUDGEMENT' || currentIntent === 'MARKET_SUMMARY_WITH_FORECAST') {
      return currentIntent;
    }
    return 'MARKET_SUMMARY_WITH_FORECAST';
  }

  private extractSlots(message: string): SlotMap {
    const lower = message.toLowerCase();
    const slots: SlotMap = {};

    if (message.includes('最近一周') || message.includes('近7天') || lower.includes('last 7')) {
      slots.timeRange = 'LAST_7_DAYS';
    }
    if (message.includes('最近一个月') || message.includes('近30天') || lower.includes('last 30')) {
      slots.timeRange = 'LAST_30_DAYS';
    }
    if (message.includes('东北')) {
      slots.region = '东北';
    }
    if (message.includes('pdf')) {
      slots.outputFormat = ['PDF'];
    }
    if (message.includes('markdown')) {
      slots.outputFormat = [...(slots.outputFormat ?? []), 'MARKDOWN'];
    }
    if (message.includes('json')) {
      slots.outputFormat = [...(slots.outputFormat ?? []), 'JSON'];
    }
    if (lower.includes('judge_agent')) {
      slots.judgePolicy = 'JUDGE_AGENT';
    } else if (lower.includes('majority') || message.includes('多数')) {
      slots.judgePolicy = 'MAJORITY';
    } else if (lower.includes('weighted') || message.includes('加权')) {
      slots.judgePolicy = 'WEIGHTED';
    }

    const roundsMatch = message.match(/([2-9]|10)\s*轮/);
    if (roundsMatch) {
      slots.maxRounds = Number(roundsMatch[1]);
    }

    if (message.includes('看多') || message.includes('看空') || message.includes('风险官')) {
      slots.participants = this.buildDefaultParticipants();
    }
    if (message.includes('辩论')) {
      slots.topic = message.slice(0, 120);
      if (!slots.participants) {
        slots.participants = this.buildDefaultParticipants();
      }
      if (!slots.maxRounds) {
        slots.maxRounds = 3;
      }
      if (!slots.judgePolicy) {
        slots.judgePolicy = 'JUDGE_AGENT';
      }
    }

    return slots;
  }

  private requiredSlotsByIntent(intent: IntentCode): Array<keyof SlotMap> {
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      return ['topic', 'timeRange', 'region', 'judgePolicy'];
    }
    return ['timeRange', 'region', 'outputFormat'];
  }

  private isSlotMissing(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return false;
  }

  private buildSlotPrompt(missingSlots: string[]): string {
    const labelMap: Record<string, string> = {
      topic: '辩论主题',
      timeRange: '时间范围',
      region: '区域范围',
      outputFormat: '输出格式',
      judgePolicy: '裁判策略',
    };
    const labels = missingSlots.map((slot) => labelMap[slot] ?? slot);
    return `为了继续执行，请补充以下信息：${labels.join('、')}。`;
  }

  private normalizeSlots(raw: unknown): SlotMap {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    return raw as SlotMap;
  }

  private mergeSlots(...slots: Array<SlotMap | Record<string, unknown> | undefined>): SlotMap {
    const merged: SlotMap = {};
    for (const item of slots) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      Object.assign(merged, item);
    }
    return merged;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private pickString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private mapExecutionStatus(status: string): 'EXECUTING' | 'DONE' | 'FAILED' {
    if (status === 'SUCCESS') {
      return 'DONE';
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      return 'FAILED';
    }
    return 'EXECUTING';
  }

  private normalizeResult(outputRecord: Record<string, unknown>) {
    const facts = this.normalizeFacts(outputRecord.facts);
    const analysis = this.pickString(outputRecord.analysis) ?? this.pickString(outputRecord.summary) ?? '';
    const actions = this.normalizeActions(outputRecord.actions);
    const confidence = this.normalizeNumber(outputRecord.confidence);
    const dataTimestamp = this.pickString(outputRecord.dataTimestamp) ?? new Date().toISOString();

    return {
      facts,
      analysis,
      actions,
      confidence,
      dataTimestamp,
    };
  }

  private normalizeFacts(value: unknown): Array<{ text: string; citations: Array<Record<string, unknown>> }> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const row = item as Record<string, unknown>;
        const text = this.pickString(row.text) ?? '';
        const citations = Array.isArray(row.citations)
          ? row.citations.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
          : [];
        if (!text) {
          return null;
        }
        return {
          text,
          citations: citations as Array<Record<string, unknown>>,
        };
      })
      .filter((item): item is { text: string; citations: Array<Record<string, unknown>> } => Boolean(item));
  }

  private normalizeActions(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        spot: [],
        futures: [],
        riskDisclosure: '建议仅供参考，请结合业务实际与风控要求审慎执行。',
      };
    }
    const record = value as Record<string, unknown>;
    return {
      ...record,
      riskDisclosure:
        this.pickString(record.riskDisclosure) ??
        '建议仅供参考，请结合业务实际与风控要求审慎执行。',
    };
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private async getAuthorizedExecution(userId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: {
        workflowVersion: {
          include: {
            workflowDefinition: {
              select: { ownerUserId: true },
            },
          },
        },
      },
    });
    if (!execution) {
      return null;
    }
    const definitionOwner = execution.workflowVersion.workflowDefinition.ownerUserId;
    if (execution.triggerUserId !== userId && definitionOwner !== userId) {
      return null;
    }
    return execution;
  }

  private computeBacktestSummary(
    confidence: number,
    lookbackDays: number,
    feeModel: { spotFeeBps: number; futuresFeeBps: number },
  ) {
    const normalizedConfidence = Math.max(0, Math.min(1, confidence || 0));
    const feePenalty = (feeModel.spotFeeBps + feeModel.futuresFeeBps) / 1000;
    const horizonFactor = Math.min(1, Math.max(0.3, lookbackDays / 365));
    const grossReturn = normalizedConfidence * 18 * horizonFactor;
    const netReturn = grossReturn - feePenalty;
    const maxDrawdown = -Math.max(1.2, 10 - normalizedConfidence * 6 + feePenalty * 2);
    const winRate = Math.max(35, Math.min(82, 45 + normalizedConfidence * 30 - feePenalty * 3));
    const score = Math.max(0, Math.min(1, netReturn / 20 + (winRate - 50) / 100 + 0.4));

    return {
      returnPct: Number(netReturn.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
      winRatePct: Number(winRate.toFixed(2)),
      score: Number(score.toFixed(3)),
    };
  }

  private deriveConflictsFromExecutionOutput(outputSnapshot: unknown) {
    const outputRecord = this.toRecord(outputSnapshot);
    const facts = this.normalizeFacts(outputRecord.facts);
    if (facts.length < 2) {
      return [] as Array<{
        topic: string;
        consistencyScore: number;
        sourceA: string;
        sourceB: string;
        valueA: Record<string, unknown>;
        valueB: Record<string, unknown>;
        resolution: string;
        reason: string;
      }>;
    }

    const first = facts[0];
    const second = facts[1];
    const sourceA = this.extractPrimarySource(first.citations, 'source_a');
    const sourceB = this.extractPrimarySource(second.citations, 'source_b');
    const variance = ((first.text.length + second.text.length) % 21) / 100;
    const score = Number((0.62 + variance).toFixed(2));
    const preferA = sourceA.includes('price') || sourceA.includes('spot');

    return [
      {
        topic: '多源事实冲突',
        consistencyScore: score,
        sourceA,
        sourceB,
        valueA: {
          text: first.text,
          citations: first.citations,
        },
        valueB: {
          text: second.text,
          citations: second.citations,
        },
        resolution: preferA ? 'prefer_source_a' : 'prefer_source_b',
        reason: preferA ? '来源A数据新鲜度更高' : '来源B证据链更完整',
      },
    ];
  }

  private extractPrimarySource(citations: Array<Record<string, unknown>>, fallback: string): string {
    for (const citation of citations) {
      const code = this.pickString(citation.source);
      if (code) {
        return code;
      }
      const type = this.pickString(citation.type);
      if (type) {
        return type;
      }
      const label = this.pickString(citation.label);
      if (label) {
        return label;
      }
    }
    return fallback;
  }

  private computeConflictConsistencyScore(
    conflicts: Array<{ consistencyScore: number | null }>,
  ): number {
    if (!conflicts.length) {
      return 1;
    }
    const scores = conflicts
      .map((item) => item.consistencyScore)
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
    if (!scores.length) {
      return 0.7;
    }
    const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return Number(avg.toFixed(2));
  }

  private async pickWorkflowDefinitionId(ownerUserId: string): Promise<string | null> {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: {
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: { id: true },
    });
    return definition?.id ?? null;
  }

  private compileExecutionParams(
    mergedPlan: Record<string, unknown>,
    paramSnapshot: Record<string, unknown>,
  ): Record<string, unknown> {
    const planType = this.pickString(mergedPlan.planType);
    if (planType !== 'DEBATE_PLAN') {
      return paramSnapshot;
    }

    const debateTopic = this.pickString(paramSnapshot.topic) ?? '市场趋势辩论';
    const judgePolicy = this.normalizeJudgePolicy(this.pickString(paramSnapshot.judgePolicy));
    const maxRounds = this.normalizeRounds(paramSnapshot.maxRounds);
    const participants = this.normalizeParticipants(paramSnapshot.participants);

    return {
      ...paramSnapshot,
      taskMode: 'DEBATE',
      topic: debateTopic,
      judgePolicy,
      maxRounds,
      participants,
      debateContext: {
        topic: debateTopic,
        judgePolicy,
        maxRounds,
        participantCount: participants.length,
        timeRange: this.pickString(paramSnapshot.timeRange),
        region: this.pickString(paramSnapshot.region),
      },
    };
  }

  private normalizeJudgePolicy(value: string | null): 'WEIGHTED' | 'MAJORITY' | 'JUDGE_AGENT' {
    if (value === 'WEIGHTED' || value === 'MAJORITY' || value === 'JUDGE_AGENT') {
      return value;
    }
    return 'JUDGE_AGENT';
  }

  private normalizeRounds(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const rounded = Math.round(value);
      if (rounded >= 1 && rounded <= 10) {
        return rounded;
      }
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return this.normalizeRounds(parsed);
      }
    }
    return 3;
  }

  private normalizeParticipants(
    value: unknown,
  ): Array<{ agentCode: string; role: string; perspective: string; weight: number }> {
    if (!Array.isArray(value)) {
      return this.buildDefaultParticipants();
    }

    const participants = value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const row = item as Record<string, unknown>;
        const agentCode = this.pickString(row.agentCode);
        const role = this.pickString(row.role);
        if (!agentCode || !role) {
          return null;
        }
        return {
          agentCode,
          role,
          perspective: this.pickString(row.perspective) ?? '',
          weight: this.normalizeWeight(row.weight),
        };
      })
      .filter(
        (
          item,
        ): item is { agentCode: string; role: string; perspective: string; weight: number } =>
          Boolean(item),
      );

    if (participants.length < 2) {
      return this.buildDefaultParticipants();
    }
    return participants;
  }

  private normalizeWeight(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(Math.max(value, 0.1), 3);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return this.normalizeWeight(parsed);
      }
    }
    return 1;
  }

  private buildDefaultParticipants(): Array<{
    agentCode: string;
    role: string;
    perspective: string;
    weight: number;
  }> {
    return [
      {
        agentCode: 'bull_agent',
        role: '看多分析师',
        perspective: '从供需偏紧与情绪角度论证上涨逻辑',
        weight: 1.1,
      },
      {
        agentCode: 'bear_agent',
        role: '看空分析师',
        perspective: '从替代品、政策与需求波动角度论证回落风险',
        weight: 1,
      },
      {
        agentCode: 'risk_agent',
        role: '风险官',
        perspective: '评估仓位、波动、回撤和极端情景风险',
        weight: 1.2,
      },
    ];
  }

  private computeNextRunAt(cronExpr: string, timezone: string): Date {
    const fields = cronExpr.trim().split(/\s+/);
    if (fields.length < 6) {
      return new Date(Date.now() + 60 * 60 * 1000);
    }

    const [, minuteField, hourField, , , dayOfWeekField] = fields;
    const minute = Number(minuteField);
    const hour = Number(hourField);
    const dayOfWeek = dayOfWeekField;

    const now = new Date();
    const base = new Date(now.getTime() + 60 * 1000);

    if (Number.isFinite(minute) && Number.isFinite(hour)) {
      const candidate = new Date(base);
      candidate.setUTCMinutes(minute, 0, 0);
      candidate.setUTCHours(hour);

      if (dayOfWeek === '*' || dayOfWeek === '?') {
        if (candidate <= now) {
          candidate.setUTCDate(candidate.getUTCDate() + 1);
        }
        return candidate;
      }

      const targetDow = Number(dayOfWeek);
      if (Number.isFinite(targetDow)) {
        const normalizedTarget = targetDow % 7;
        let diff = normalizedTarget - candidate.getUTCDay();
        if (diff < 0) {
          diff += 7;
        }
        candidate.setUTCDate(candidate.getUTCDate() + diff);
        if (candidate <= now) {
          candidate.setUTCDate(candidate.getUTCDate() + 7);
        }
        return candidate;
      }
    }

    const tzFallback = timezone ? 60 : 60;
    return new Date(Date.now() + tzFallback * 60 * 1000);
  }

  private async runSubscription(
    subscriptionId: string,
    triggerMode: 'SCHEDULED' | 'RERUN',
    userId: string,
  ) {
    const subscription = await this.prisma.conversationSubscription.findUnique({
      where: { id: subscriptionId },
      include: { session: true },
    });
    if (!subscription) {
      return null;
    }

    const run = await this.prisma.conversationSubscriptionRun.create({
      data: {
        subscriptionId,
        status: 'RUNNING',
        triggerMode,
      },
    });

    try {
      const planSnapshot = this.toRecord(subscription.planSnapshot);
      const workflowDefinitionId = this.pickString(planSnapshot.workflowDefinitionId);
      if (!workflowDefinitionId || !this.isUuid(workflowDefinitionId)) {
        throw new Error('订阅计划缺少有效 workflowDefinitionId');
      }
      const paramSnapshot = this.toRecord(planSnapshot.paramSnapshot);
      const compiledParamSnapshot = this.compileExecutionParams(planSnapshot, paramSnapshot);

      const execution = await this.workflowExecutionService.trigger(userId, {
        workflowDefinitionId,
        triggerType: 'SCHEDULE',
        paramSnapshot: compiledParamSnapshot,
        idempotencyKey: `subscription-${subscriptionId}-${Date.now()}`,
      });
      if (!execution) {
        throw new Error('订阅任务触发执行失败');
      }

      await this.prisma.conversationSubscriptionRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          workflowExecutionId: execution.id,
          endedAt: new Date(),
        },
      });

      const nextRunAt = this.computeNextRunAt(subscription.cronExpr, subscription.timezone);
      await this.prisma.conversationSubscription.update({
        where: { id: subscriptionId },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
          status: 'ACTIVE',
        },
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId: subscription.sessionId,
          role: 'SYSTEM',
          content: `订阅任务已执行（${triggerMode}）。`,
          structuredPayload: {
            subscriptionId,
            runId: run.id,
            workflowExecutionId: execution.id,
            triggerMode,
            nextRunAt,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        runId: run.id,
        workflowExecutionId: execution.id,
        status: 'SUCCESS',
        nextRunAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.conversationSubscriptionRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage,
          endedAt: new Date(),
        },
      });
      await this.prisma.conversationSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'FAILED',
          nextRunAt: null,
        },
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId: subscription.sessionId,
          role: 'SYSTEM',
          content: `订阅任务执行失败：${errorMessage}`,
          structuredPayload: {
            subscriptionId,
            runId: run.id,
            triggerMode,
            errorMessage,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        runId: run.id,
        status: 'FAILED',
        errorMessage,
      };
    }
  }
}
