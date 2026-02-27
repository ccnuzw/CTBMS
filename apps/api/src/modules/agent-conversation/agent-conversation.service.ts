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
import { AIModelService } from '../ai/ai-model.service';
import { AIProviderFactory } from '../ai/providers/provider.factory';

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
  workflowReuseSource?: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC' | 'NONE';
  workflowMatchScore?: number;
  skills: string[];
  paramSnapshot: SlotMap;
  estimatedCost: {
    token: number;
    latencyMs: number;
  };
};

type ReplyOption = {
  id: string;
  label: string;
  mode: 'SEND' | 'OPEN_TAB';
  value?: string;
  tab?: 'progress' | 'result' | 'delivery' | 'schedule';
};

type ConversationSessionQueryDto = {
  state?: SessionState;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

type CapabilityRoutingPolicy = {
  allowOwnerPool: boolean;
  allowPublicPool: boolean;
  preferOwnerFirst: boolean;
  minOwnerScore: number;
  minPublicScore: number;
};

type EphemeralCapabilityPolicy = {
  draftSemanticReuseThreshold: number;
  publishedSkillReuseThreshold: number;
  runtimeGrantTtlHours: number;
  runtimeGrantMaxUseCount: number;
  replayRetryableErrorCodeAllowlist: string[];
  replayNonRetryableErrorCodeBlocklist: string[];
};

type PromotionTaskStatus =
  | 'PENDING_REVIEW'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED';

type PromotionTaskAction =
  | 'START_REVIEW'
  | 'MARK_APPROVED'
  | 'MARK_REJECTED'
  | 'MARK_PUBLISHED'
  | 'SYNC_DRAFT_STATUS';

const SESSION_DETAIL_TURN_LIMIT = 80;
const SESSION_DETAIL_PLAN_LIMIT = 20;

@Injectable()
export class AgentConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly reportExportService: ReportExportService,
    private readonly aiModelService: AIModelService,
    private readonly aiProviderFactory: AIProviderFactory,
  ) { }

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
          orderBy: { createdAt: 'desc' },
          take: SESSION_DETAIL_TURN_LIMIT,
        },
        plans: {
          orderBy: { version: 'desc' },
          take: SESSION_DETAIL_PLAN_LIMIT,
        },
      },
    });

    if (!session) {
      return null;
    }

    // Return latest window in chronological order for stable timeline rendering.
    session.turns = [...session.turns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return session;
  }

  async createTurn(userId: string, sessionId: string, dto: CreateConversationTurnDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });

    if (!session) {
      return null;
    }

    const referencedAssetIds = this.extractAssetReferenceIds(dto.message);
    const followupResolved = await this.resolveFollowupAssetReference(sessionId, dto.message);
    const followupReferencedAssetIds = followupResolved.assetIds;
    const semanticResolved = await this.resolveSemanticAssetReferences(sessionId, dto.message);
    const semanticReferencedAssetIds = semanticResolved.assetIds;
    const contextReferencedAssetId = this.pickString(dto.contextPatch?.reusedAssetId);
    const requestedAssetIds = [
      ...(contextReferencedAssetId ? [contextReferencedAssetId] : []),
      ...referencedAssetIds,
      ...followupReferencedAssetIds,
      ...semanticReferencedAssetIds,
    ]
      .filter((id): id is string => this.isUuid(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const referencedAssets = requestedAssetIds.length
      ? await this.prisma.conversationAsset.findMany({
        where: {
          sessionId,
          id: { in: requestedAssetIds },
        },
        select: { id: true, title: true, assetType: true },
      })
      : [];

    const effectiveContextPatch: Record<string, unknown> = {
      ...(dto.contextPatch ?? {}),
    };

    if (!effectiveContextPatch.reusedAssetId && referencedAssets.length > 0) {
      effectiveContextPatch.reusedAssetId = referencedAssets[0].id;
    }

    if (referencedAssets.length > 0) {
      effectiveContextPatch.reusedAssets = referencedAssets.map((asset: { id: string; title: string; assetType: string }) => ({
        assetId: asset.id,
        title: asset.title,
        assetType: asset.assetType,
      }));
      effectiveContextPatch.reuseResolution = {
        explicitAssetRefCount: referencedAssetIds.length,
        followupAssetRefCount: followupReferencedAssetIds.length,
        semanticAssetRefCount: semanticReferencedAssetIds.length,
        followupResolution: followupResolved.resolution,
        semanticResolution: semanticResolved.resolution,
      };
    }

    const userTurn = await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'USER',
        content: dto.message,
        structuredPayload: this.toJson(effectiveContextPatch),
      },
    });

    for (const asset of referencedAssets) {
      await this.prisma.conversationAssetRef.create({
        data: {
          sessionId,
          turnId: userTurn.id,
          assetId: asset.id,
          note: 'user_context_reuse',
        },
      });
    }

    const intent = this.detectIntent(dto.message, session.currentIntent);
    const mergedSlots = this.mergeSlots(
      this.normalizeSlots(session.currentSlots),
      this.extractSlots(dto.message),
      effectiveContextPatch,
    );

    const requiredSlots = this.requiredSlotsByIntent(intent);
    const missingSlots = requiredSlots.filter((key) => this.isSlotMissing(mergedSlots[key]));
    const hasMissingSlots = missingSlots.length > 0;
    const routingPolicy = await this.resolveCapabilityRoutingPolicy(session.ownerUserId);

    const state: SessionState = hasMissingSlots ? 'SLOT_FILLING' : 'PLAN_PREVIEW';
    const planId = `plan_${randomUUID()}`;
    const workflowCandidate = hasMissingSlots
      ? null
      : await this.pickWorkflowDefinitionCandidate(session.ownerUserId, intent, mergedSlots, routingPolicy);
    const proposedPlan: ProposedPlan | null = hasMissingSlots
      ? null
      : {
        planId,
        planType: intent === 'DEBATE_MARKET_JUDGEMENT' ? 'DEBATE_PLAN' : 'RUN_PLAN',
        intent,
        workflowDefinitionId: workflowCandidate?.id ?? null,
        workflowReuseSource: workflowCandidate?.reuseSource ?? 'NONE',
        workflowMatchScore: workflowCandidate?.score ?? 0,
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
      await this.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'WORKFLOW_REUSE',
        routePolicy: ['USER_PRIVATE', 'TEAM_OR_PUBLIC'],
        selectedSource: proposedPlan.workflowReuseSource ?? 'NONE',
        selectedScore: proposedPlan.workflowMatchScore ?? 0,
        selectedWorkflowDefinitionId: proposedPlan.workflowDefinitionId,
        intent,
        missingSlots,
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
        },
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
      this.shouldAutoExecute(effectiveContextPatch)
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

    const reuseReceipt = this.buildReuseReceiptMessage(
      referencedAssets,
      effectiveContextPatch.reuseResolution as Record<string, unknown> | undefined,
    );

    const assistantMessage = hasMissingSlots
      ? this.buildSlotPrompt(missingSlots)
      : autoExecution
        ? '我已生成计划并自动开始执行。你可以继续补充要求，结果会在当前会话持续更新。'
        : '我已完成计划编排。请确认执行，或告诉我需要调整的参数。';

    const assistantMessageWithReuse = reuseReceipt
      ? `${assistantMessage}\n${reuseReceipt}`
      : assistantMessage;
    const fallbackReplyOptions = this.buildReplyOptions({
      hasMissingSlots,
      missingSlots,
      autoExecution: Boolean(autoExecution),
      intent,
      slots: mergedSlots,
    });
    const llmEnhancedReply = await this.tryEnhanceAssistantReplyWithLLM({
      userMessage: dto.message,
      assistantMessage: assistantMessageWithReuse,
      hasMissingSlots,
      missingSlots,
      autoExecution: Boolean(autoExecution),
      intent,
      slots: mergedSlots,
      fallbackReplyOptions,
    });
    const finalAssistantMessage = llmEnhancedReply?.assistantMessage ?? assistantMessageWithReuse;
    const replyOptions = llmEnhancedReply?.replyOptions?.length
      ? llmEnhancedReply.replyOptions
      : fallbackReplyOptions;

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: finalAssistantMessage,
        structuredPayload: {
          intent,
          missingSlots,
          proposedPlan,
          autoExecuted: Boolean(autoExecution),
          executionId: autoExecution?.executionId,
          reuseResolution: effectiveContextPatch.reuseResolution,
          replyOptions,
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
      assistantMessage: finalAssistantMessage,
      state: autoExecution ? 'EXECUTING' : state,
      intent,
      missingSlots,
      proposedPlan,
      confirmRequired: !hasMissingSlots && !autoExecution,
      autoExecuted: Boolean(autoExecution),
      executionId: autoExecution?.executionId,
      reuseResolution: effectiveContextPatch.reuseResolution,
      replyOptions,
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
      templateCode: 'DEFAULT',
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
    const profileDefaults = await this.resolveDeliveryProfileDefaults(userId, channel);
    const to = channel === 'EMAIL' ? this.mergeDeliveryRecipients(dto.to, profileDefaults.to) : undefined;
    const target =
      channel === 'EMAIL' ? undefined : dto.target?.trim() || profileDefaults.target?.trim() || undefined;
    const normalizedTemplate = this.normalizeDeliveryTemplateCode(
      dto.templateCode ?? profileDefaults.templateCode,
    );
    const sendRawFile = dto.sendRawFile ?? profileDefaults.sendRawFile ?? true;

    if (channel === 'EMAIL' && (!to || to.length === 0)) {
      throw new BadRequestException({
        code: 'CONV_DELIVERY_TARGET_REQUIRED',
        message: '邮件投递至少需要一个收件人',
      });
    }
    if (channel !== 'EMAIL' && !target) {
      throw new BadRequestException({
        code: 'CONV_DELIVERY_TARGET_REQUIRED',
        message: '请提供投递目标（群ID或接收端标识）',
      });
    }

    const deliveryTaskId = `delivery_${randomUUID()}`;
    const webhookUrl = this.resolveDeliveryWebhook(channel);
    const subject = this.resolveDeliverySubject(channel, normalizedTemplate, dto.subject);
    const content = this.resolveDeliveryContent(channel, normalizedTemplate, dto.content);

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
            to,
            target,
            subject,
            content,
            templateCode: normalizedTemplate,
            metadata: dto.metadata,
            attachment: {
              fileName,
              downloadUrl,
              mode: sendRawFile ? 'RAW_FILE' : 'EXPORT_FILE',
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
          to,
          target,
          subject,
          templateCode: normalizedTemplate,
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
        to,
        target,
        subject,
        templateCode: normalizedTemplate,
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
    const routingPolicy = await this.resolveCapabilityRoutingPolicy(userId);
    const ephemeralPolicy = await this.resolveEphemeralCapabilityPolicy(userId);
    const reuseCandidate = await this.findReusableSkillDraft(userId, dto, ephemeralPolicy);
    if (reuseCandidate) {
      const runtimeGrantId = await this.ensureRuntimeGrantForDraft(
        reuseCandidate.id,
        sessionId,
        userId,
        reuseCandidate.provisionalEnabled,
        ephemeralPolicy,
      );
      const reviewRequired = reuseCandidate.status !== 'PUBLISHED';

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `已复用已有能力草稿：${reuseCandidate.suggestedSkillCode}`,
          structuredPayload: {
            draftId: reuseCandidate.id,
            status: reuseCandidate.status,
            reviewRequired,
            riskLevel: reuseCandidate.riskLevel,
            provisionalEnabled: reuseCandidate.provisionalEnabled,
            runtimeGrantId,
            reused: true,
            reuseSource: reuseCandidate.reuseReason,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'SKILL_DRAFT',
        title: `Skill Draft ${reuseCandidate.suggestedSkillCode}`,
        payload: {
          draftId: reuseCandidate.id,
          gapType: reuseCandidate.gapType,
          requiredCapability: reuseCandidate.requiredCapability,
          suggestedSkillCode: reuseCandidate.suggestedSkillCode,
          status: reuseCandidate.status,
          reused: true,
          reuseSource: reuseCandidate.reuseReason,
        },
        sourceTurnId: null,
      });

      await this.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'SKILL_DRAFT_REUSE',
        routePolicy: ['USER_PRIVATE'],
        selectedSource: reuseCandidate.reuseReason,
        selectedDraftId: reuseCandidate.id,
        selectedSkillCode: reuseCandidate.suggestedSkillCode,
        selectedScore: reuseCandidate.reuseReason === 'EXACT_CODE' ? 1 : 0.72,
        intent: session.currentIntent,
        reason: '复用已有能力草稿，避免重复创建。',
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
          ephemeralCapabilityPolicy: ephemeralPolicy,
        },
      });

      return {
        draftId: reuseCandidate.id,
        status: reuseCandidate.status,
        reviewRequired,
        riskLevel: reuseCandidate.riskLevel,
        provisionalEnabled: reuseCandidate.provisionalEnabled,
        runtimeGrantId,
        reused: true,
        reuseSource: reuseCandidate.reuseReason,
      };
    }

    const reusablePublishedSkill = await this.findReusablePublishedSkill(
      userId,
      dto,
      routingPolicy,
      ephemeralPolicy,
    );
    if (reusablePublishedSkill) {
      const bridgeDraft = await this.upsertPublishedSkillBridgeDraft({
        sessionId,
        ownerUserId: userId,
        dto,
        skill: reusablePublishedSkill,
        derivedRisk,
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `已复用可用能力：${reusablePublishedSkill.skillCode}，无需重复创建草稿。`,
          structuredPayload: {
            draftId: bridgeDraft.id,
            status: bridgeDraft.status,
            reviewRequired: false,
            riskLevel: bridgeDraft.riskLevel,
            provisionalEnabled: false,
            runtimeGrantId: null,
            reused: true,
            reuseSource: 'PUBLISHED_SKILL',
            publishedSkillId: reusablePublishedSkill.id,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'SKILL_DRAFT',
        title: `Skill Draft ${bridgeDraft.suggestedSkillCode}`,
        payload: {
          draftId: bridgeDraft.id,
          gapType: bridgeDraft.gapType,
          requiredCapability: bridgeDraft.requiredCapability,
          suggestedSkillCode: bridgeDraft.suggestedSkillCode,
          status: bridgeDraft.status,
          reused: true,
          reuseSource: 'PUBLISHED_SKILL',
          publishedSkillId: reusablePublishedSkill.id,
        },
        sourceTurnId: null,
      });

      await this.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'SKILL_DRAFT_REUSE',
        routePolicy: ['USER_PRIVATE', 'TEAM_OR_PUBLIC'],
        selectedSource: 'PUBLISHED_SKILL',
        selectedDraftId: bridgeDraft.id,
        selectedSkillCode: reusablePublishedSkill.skillCode,
        selectedScore: reusablePublishedSkill.score,
        intent: session.currentIntent,
        reason: '命中可用已发布能力，复用能力并建立本用户映射草稿。',
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
          ephemeralCapabilityPolicy: ephemeralPolicy,
        },
      });

      return {
        draftId: bridgeDraft.id,
        status: bridgeDraft.status,
        reviewRequired: false,
        riskLevel: bridgeDraft.riskLevel,
        provisionalEnabled: false,
        runtimeGrantId: null,
        reused: true,
        reuseSource: 'PUBLISHED_SKILL',
      };
    }

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
          maxUseCount: ephemeralPolicy.runtimeGrantMaxUseCount,
          expiresAt: new Date(Date.now() + ephemeralPolicy.runtimeGrantTtlHours * 60 * 60 * 1000),
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

    await this.logCapabilityRoutingDecisionAsset(sessionId, {
      routeType: 'SKILL_DRAFT_CREATE',
      routePolicy: ['USER_PRIVATE'],
      selectedSource: 'NEW_DRAFT',
      selectedDraftId: draft.id,
      selectedSkillCode: dto.suggestedSkillCode,
      selectedScore: 0,
      intent: session.currentIntent,
      reason: '未命中可复用草稿，创建新草稿。',
      routePolicyDetails: {
        capabilityRoutingPolicy: routingPolicy,
        ephemeralCapabilityPolicy: ephemeralPolicy,
      },
    });

    return {
      draftId: draft.id,
      status: draft.status,
      reviewRequired: true,
      riskLevel: derivedRisk.riskLevel,
      provisionalEnabled: derivedRisk.allowRuntimeGrant,
      runtimeGrantId,
      reused: false,
      reuseSource: 'NEW_DRAFT',
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

  async listCapabilityRoutingLogs(
    userId: string,
    sessionId: string,
    query?: { routeType?: string; limit?: number; window?: '1h' | '24h' | '7d' },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const limit = Math.max(1, Math.min(200, query?.limit ?? 50));
    const routeTypeFilter = this.pickString(query?.routeType)?.toUpperCase();
    const createdAfter = this.resolveRoutingWindowStart(query?.window);
    const notes = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'NOTE',
        title: {
          startsWith: '能力路由日志',
        },
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });

    const filtered = notes.filter((item) => {
      if (!routeTypeFilter) {
        return true;
      }
      const payload = this.toRecord(item.payload);
      const routeType = this.pickString(payload.routeType)?.toUpperCase();
      return routeType === routeTypeFilter;
    });

    return filtered.slice(0, limit).map((item) => {
      const payload = this.toRecord(item.payload);
      return {
        id: item.id,
        title: item.title,
        routeType: this.pickString(payload.routeType) ?? 'UNKNOWN',
        selectedSource: this.pickString(payload.selectedSource),
        selectedScore: this.normalizeNumber(payload.selectedScore),
        selectedWorkflowDefinitionId: this.pickString(payload.selectedWorkflowDefinitionId),
        selectedDraftId: this.pickString(payload.selectedDraftId),
        selectedSkillCode: this.pickString(payload.selectedSkillCode),
        routePolicy: Array.isArray(payload.routePolicy)
          ? payload.routePolicy.filter((value): value is string => typeof value === 'string')
          : [],
        reason: this.pickString(payload.reason),
        routePolicyDetails: this.toRecord(payload.routePolicyDetails),
        createdAt: item.createdAt,
      };
    });
  }

  async getCapabilityRoutingSummary(
    userId: string,
    sessionId: string,
    query?: { limit?: number; window?: '1h' | '24h' | '7d' },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const effectiveCapabilityRoutingPolicy = await this.resolveCapabilityRoutingPolicy(userId);
    const effectiveEphemeralCapabilityPolicy = await this.resolveEphemeralCapabilityPolicy(userId);
    const limit = Math.max(20, Math.min(500, query?.limit ?? 200));
    const createdAfter = this.resolveRoutingWindowStart(query?.window);

    const notes = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'NOTE',
        title: {
          startsWith: '能力路由日志',
        },
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    const routeTypeStats = new Map<string, number>();
    const selectedSourceStats = new Map<string, number>();
    const trendBuckets = new Map<string, { total: number; byRouteType: Record<string, number> }>();

    for (const item of notes) {
      const payload = this.toRecord(item.payload);
      const routeType = this.pickString(payload.routeType) ?? 'UNKNOWN';
      const selectedSource = this.pickString(payload.selectedSource) ?? 'UNKNOWN';

      routeTypeStats.set(routeType, (routeTypeStats.get(routeType) ?? 0) + 1);
      selectedSourceStats.set(selectedSource, (selectedSourceStats.get(selectedSource) ?? 0) + 1);

      const bucketKey = item.createdAt.toISOString().slice(0, 13);
      const bucket = trendBuckets.get(bucketKey) ?? { total: 0, byRouteType: {} };
      bucket.total += 1;
      bucket.byRouteType[routeType] = (bucket.byRouteType[routeType] ?? 0) + 1;
      trendBuckets.set(bucketKey, bucket);
    }

    const toSortedArray = (statMap: Map<string, number>) =>
      Array.from(statMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    const trend = Array.from(trendBuckets.entries())
      .map(([bucket, value]) => ({
        bucket,
        total: value.total,
        byRouteType: value.byRouteType,
      }))
      .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

    return {
      sampleWindow: {
        window: query?.window ?? '24h',
        totalLogs: notes.length,
        analyzedLimit: limit,
      },
      effectivePolicies: {
        capabilityRoutingPolicy: effectiveCapabilityRoutingPolicy,
        ephemeralCapabilityPolicy: effectiveEphemeralCapabilityPolicy,
      },
      stats: {
        routeType: toSortedArray(routeTypeStats),
        selectedSource: toSortedArray(selectedSourceStats),
      },
      trend,
    };
  }

  async getEphemeralCapabilitySummary(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d' },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const effectivePolicy = await this.resolveEphemeralCapabilityPolicy(userId);
    const createdAfter = this.resolveRoutingWindowStart(query?.window);
    const now = new Date();
    const staleDraftBefore = new Date(now.getTime() - effectivePolicy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

    const drafts = await this.prisma.agentSkillDraft.findMany({
      where: {
        sessionId,
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      select: {
        id: true,
        status: true,
        suggestedSkillCode: true,
        updatedAt: true,
        provisionalEnabled: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });

    const grants = await this.prisma.agentSkillRuntimeGrant.findMany({
      where: {
        sessionId,
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        useCount: true,
        maxUseCount: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });

    const draftStatusStats = new Map<string, number>();
    const grantStatusStats = new Map<string, number>();
    const skillCodeStats = new Map<string, number>();

    for (const draft of drafts) {
      draftStatusStats.set(draft.status, (draftStatusStats.get(draft.status) ?? 0) + 1);
      skillCodeStats.set(draft.suggestedSkillCode, (skillCodeStats.get(draft.suggestedSkillCode) ?? 0) + 1);
    }
    for (const grant of grants) {
      grantStatusStats.set(grant.status, (grantStatusStats.get(grant.status) ?? 0) + 1);
    }

    const expiringIn24h = grants.filter(
      (grant) => grant.status === 'ACTIVE' && grant.expiresAt > now && grant.expiresAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000),
    ).length;

    const staleDrafts = drafts.filter(
      (draft) =>
        ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'].includes(draft.status) &&
        draft.updatedAt < staleDraftBefore &&
        draft.provisionalEnabled,
    ).length;

    const toSortedArray = (statMap: Map<string, number>) =>
      Array.from(statMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    return {
      window: query?.window ?? '24h',
      totals: {
        drafts: drafts.length,
        runtimeGrants: grants.length,
        expiringRuntimeGrantsIn24h: expiringIn24h,
        staleDrafts,
      },
      policy: effectivePolicy,
      stats: {
        draftStatus: toSortedArray(draftStatusStats),
        grantStatus: toSortedArray(grantStatusStats),
        topSkillCodes: toSortedArray(skillCodeStats).slice(0, 10),
      },
    };
  }

  async runEphemeralCapabilityHousekeeping(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const policy = await this.resolveEphemeralCapabilityPolicy(userId);
    const now = new Date();
    const staleDraftBefore = new Date(now.getTime() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

    const expiredGrants = await this.prisma.agentSkillRuntimeGrant.updateMany({
      where: {
        sessionId,
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    const disabledDrafts = await this.prisma.agentSkillDraft.updateMany({
      where: {
        sessionId,
        status: {
          in: ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'],
        },
        provisionalEnabled: true,
        updatedAt: {
          lt: staleDraftBefore,
        },
      },
      data: {
        provisionalEnabled: false,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: '临时能力治理清理',
      payload: {
        expiredGrantCount: expiredGrants.count,
        disabledDraftCount: disabledDrafts.count,
        policy,
        checkedAt: now.toISOString(),
      },
      tags: {
        housekeeping: true,
      },
    });

    return {
      checkedAt: now.toISOString(),
      expiredGrantCount: expiredGrants.count,
      disabledDraftCount: disabledDrafts.count,
      policy,
    };
  }

  async getEphemeralCapabilityEvolutionPlan(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d' },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const policy = await this.resolveEphemeralCapabilityPolicy(userId);
    const createdAfter = this.resolveRoutingWindowStart(query?.window);
    const staleDraftBefore = new Date(Date.now() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

    const routingLogs = await this.listCapabilityRoutingLogs(userId, sessionId, {
      routeType: 'SKILL_DRAFT_REUSE',
      limit: 300,
      window: query?.window,
    });

    const draftHitMap = new Map<string, number>();
    const skillCodeHitMap = new Map<string, number>();
    for (const log of routingLogs ?? []) {
      const draftId = this.pickString((log as unknown as Record<string, unknown>).selectedDraftId);
      const skillCode = this.pickString((log as unknown as Record<string, unknown>).selectedSkillCode);
      if (draftId) {
        draftHitMap.set(draftId, (draftHitMap.get(draftId) ?? 0) + 1);
      }
      if (skillCode) {
        skillCodeHitMap.set(skillCode, (skillCodeHitMap.get(skillCode) ?? 0) + 1);
      }
    }

    const drafts = await this.prisma.agentSkillDraft.findMany({
      where: {
        sessionId,
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      select: {
        id: true,
        status: true,
        suggestedSkillCode: true,
        updatedAt: true,
        provisionalEnabled: true,
        publishedSkillId: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });

    const promoteDraftCandidates = drafts
      .map((draft) => ({
        draftId: draft.id,
        suggestedSkillCode: draft.suggestedSkillCode,
        hitCount: draftHitMap.get(draft.id) ?? 0,
        reason: draft.publishedSkillId
          ? '已映射到发布能力，可进入能力池优先级提升评估'
          : '复用命中较高，建议进入发布评审',
      }))
      .filter((item) => item.hitCount >= 2)
      .slice(0, 20);

    const staleDraftCandidates = drafts
      .filter(
        (draft) =>
          ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'].includes(draft.status) &&
          draft.provisionalEnabled &&
          draft.updatedAt < staleDraftBefore,
      )
      .map((draft) => ({
        draftId: draft.id,
        suggestedSkillCode: draft.suggestedSkillCode,
        status: draft.status,
        updatedAt: draft.updatedAt,
      }))
      .slice(0, 50);

    const grants = await this.prisma.agentSkillRuntimeGrant.findMany({
      where: {
        sessionId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        draftId: true,
        expiresAt: true,
      },
      orderBy: [{ expiresAt: 'asc' }],
      take: 300,
    });

    const expiredGrantCandidates = grants
      .filter((grant) => grant.expiresAt < new Date())
      .map((grant) => ({
        grantId: grant.id,
        draftId: grant.draftId,
        expiresAt: grant.expiresAt,
      }));

    return {
      window: query?.window ?? '24h',
      policy,
      recommendations: {
        promoteDraftCandidates,
        staleDraftCandidates,
        expiredGrantCandidates,
      },
      metrics: {
        totalRoutingLogs: (routingLogs ?? []).length,
        uniqueDraftHits: draftHitMap.size,
        uniqueSkillCodeHits: skillCodeHitMap.size,
      },
    };
  }

  async applyEphemeralCapabilityEvolutionPlan(userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d' }) {
    const plan = await this.getEphemeralCapabilityEvolutionPlan(userId, sessionId, query);
    if (!plan) {
      return null;
    }

    const now = new Date();
    const expiredGrantIds = plan.recommendations.expiredGrantCandidates.map((item) => item.grantId);
    const staleDraftIds = plan.recommendations.staleDraftCandidates.map((item) => item.draftId);

    const expiredGrantResult = expiredGrantIds.length
      ? await this.prisma.agentSkillRuntimeGrant.updateMany({
        where: {
          id: { in: expiredGrantIds },
          status: 'ACTIVE',
        },
        data: {
          status: 'EXPIRED',
        },
      })
      : { count: 0 };

    const staleDraftResult = staleDraftIds.length
      ? await this.prisma.agentSkillDraft.updateMany({
        where: {
          id: { in: staleDraftIds },
          provisionalEnabled: true,
        },
        data: {
          provisionalEnabled: false,
        },
      })
      : { count: 0 };

    const promotionTaskCount = await this.createPromotionTaskAssets(
      sessionId,
      plan.recommendations.promoteDraftCandidates,
      plan.window,
    );

    await this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: '临时能力进化执行记录',
      payload: {
        checkedAt: now.toISOString(),
        expiredGrantCount: expiredGrantResult.count,
        disabledDraftCount: staleDraftResult.count,
        promoteSuggestionCount: plan.recommendations.promoteDraftCandidates.length,
        promotionTaskCount,
        window: plan.window,
      },
      tags: {
        housekeeping: true,
        evolution: true,
      },
    });

    return {
      checkedAt: now.toISOString(),
      window: plan.window,
      expiredGrantCount: expiredGrantResult.count,
      disabledDraftCount: staleDraftResult.count,
      promoteSuggestionCount: plan.recommendations.promoteDraftCandidates.length,
      promotionTaskCount,
    };
  }

  async listEphemeralCapabilityPromotionTasks(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d'; status?: string },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const createdAfter = this.resolveRoutingWindowStart(query?.window);
    const statusFilter = this.normalizePromotionTaskStatus(query?.status);
    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'NOTE',
        title: {
          startsWith: '能力晋升任务',
        },
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });

    const parsed = assets
      .map((asset) => this.toPromotionTask(asset))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const draftIds = parsed
      .map((item) => item.draftId)
      .filter((value): value is string => Boolean(value));
    const uniqueDraftIds = Array.from(new Set(draftIds));
    const drafts = uniqueDraftIds.length
      ? await this.prisma.agentSkillDraft.findMany({
        where: {
          id: {
            in: uniqueDraftIds,
          },
        },
        select: {
          id: true,
          status: true,
          publishedSkillId: true,
          updatedAt: true,
        },
      })
      : [];
    const draftMap = new Map(drafts.map((item) => [item.id, item]));

    const enriched = parsed.map((item) => {
      const draft = item.draftId ? draftMap.get(item.draftId) : null;
      return {
        ...item,
        draftStatus: draft?.status ?? null,
        publishedSkillId: item.publishedSkillId ?? draft?.publishedSkillId ?? null,
        draftUpdatedAt: draft?.updatedAt ?? null,
      };
    });

    return statusFilter ? enriched.filter((item) => item.status === statusFilter) : enriched;
  }

  async getEphemeralCapabilityPromotionTaskSummary(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d' },
  ) {
    const tasks = await this.listEphemeralCapabilityPromotionTasks(userId, sessionId, query);
    if (!tasks) {
      return null;
    }

    const statusStats = new Map<string, number>();
    const draftStatusStats = new Map<string, number>();
    let publishedLinkedCount = 0;
    let pendingActionCount = 0;

    for (const item of tasks) {
      statusStats.set(item.status, (statusStats.get(item.status) ?? 0) + 1);
      const draftStatus = this.pickString(item.draftStatus) ?? 'UNKNOWN';
      draftStatusStats.set(draftStatus, (draftStatusStats.get(draftStatus) ?? 0) + 1);
      if (item.publishedSkillId) {
        publishedLinkedCount += 1;
      }
      if (['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED'].includes(item.status)) {
        pendingActionCount += 1;
      }
    }

    const toSortedArray = (statMap: Map<string, number>) =>
      Array.from(statMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    return {
      window: query?.window ?? '24h',
      totalTasks: tasks.length,
      pendingActionCount,
      publishedLinkedCount,
      stats: {
        byStatus: toSortedArray(statusStats),
        byDraftStatus: toSortedArray(draftStatusStats),
      },
    };
  }

  async batchUpdateEphemeralCapabilityPromotionTasks(
    userId: string,
    sessionId: string,
    dto: {
      action: string;
      comment?: string;
      taskAssetIds?: string[];
      window?: '1h' | '24h' | '7d';
      status?: string;
      maxConcurrency?: number;
      maxRetries?: number;
      sourceBatchAssetId?: string;
    },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const explicitTaskIds = Array.isArray(dto.taskAssetIds)
      ? dto.taskAssetIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    const taskIds = explicitTaskIds.length
      ? explicitTaskIds
      : (
        await this.listEphemeralCapabilityPromotionTasks(userId, sessionId, {
          window: dto.window,
          status: dto.status,
        })
      )
        ?.map((item) => item.taskAssetId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];

    const uniqueTaskIds = Array.from(new Set(taskIds));
    const succeeded: Array<{ taskAssetId: string; status: string }> = [];
    const failed: Array<{ taskAssetId: string; code?: string; message: string }> = [];
    const maxConcurrency = this.normalizeBatchConcurrency(dto.maxConcurrency);
    const maxRetries = this.normalizeBatchRetry(dto.maxRetries);

    const runUpdateOnce = async (taskAssetId: string) => {
      const updated = await this.updateEphemeralCapabilityPromotionTask(userId, sessionId, taskAssetId, {
        action: dto.action,
        comment: dto.comment,
      });
      const status = this.pickString(updated?.task?.status) ?? 'UNKNOWN';
      succeeded.push({ taskAssetId, status });
    };

    const runUpdateWithRetry = async (taskAssetId: string) => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          await runUpdateOnce(taskAssetId);
          return;
        } catch (error) {
          if (
            attempt >= maxRetries ||
            error instanceof BadRequestException ||
            !this.isTransientPromotionBatchError(error)
          ) {
            throw error;
          }
          attempt += 1;
        }
      }
    };

    let cursor = 0;
    const workerCount = Math.min(maxConcurrency, Math.max(uniqueTaskIds.length, 1));
    const workers = Array.from({ length: workerCount }).map(async () => {
      while (cursor < uniqueTaskIds.length) {
        const taskAssetId = uniqueTaskIds[cursor];
        cursor += 1;
        try {
          await runUpdateWithRetry(taskAssetId);
        } catch (error) {
          if (error instanceof BadRequestException) {
            const response = error.getResponse() as Record<string, unknown>;
            failed.push({
              taskAssetId,
              code: this.pickString(response.code) ?? undefined,
              message: this.pickString(response.message) ?? '批量更新失败',
            });
          } else {
            failed.push({
              taskAssetId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    });
    await Promise.all(workers);

    const batchId = randomUUID();
    const batchAsset = await this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: `能力晋升批次 ${dto.action} ${batchId.slice(0, 8)}`,
      payload: {
        batchId,
        action: dto.action,
        sourceBatchAssetId: dto.sourceBatchAssetId ?? null,
        requestedCount: uniqueTaskIds.length,
        succeededCount: succeeded.length,
        failedCount: failed.length,
        maxConcurrency,
        maxRetries,
        window: dto.window ?? null,
        statusFilter: dto.status ?? null,
        failed,
        generatedAt: new Date().toISOString(),
      },
      tags: {
        taskType: 'PROMOTION_TASK_BATCH',
        batchId,
      },
    });

    return {
      action: dto.action,
      batchId,
      batchAssetId: batchAsset.id,
      requestedCount: uniqueTaskIds.length,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      succeeded,
      failed,
    };
  }

  async listEphemeralCapabilityPromotionTaskBatches(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d'; action?: string; limit?: number },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const createdAfter = this.resolveRoutingWindowStart(query?.window);
    const actionFilter = this.pickString(query?.action)?.toUpperCase();
    const limitValue = this.normalizeNumber(query?.limit);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 100) : 20;

    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'NOTE',
        title: {
          startsWith: '能力晋升批次',
        },
        ...(createdAfter
          ? {
            createdAt: {
              gte: createdAfter,
            },
          }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    const batches = assets
      .map((asset) => this.toPromotionTaskBatch(asset))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return actionFilter ? batches.filter((item) => item.action === actionFilter) : batches;
  }

  async replayFailedEphemeralCapabilityPromotionTaskBatch(
    userId: string,
    sessionId: string,
    batchAssetId: string,
    dto?: {
      maxConcurrency?: number;
      maxRetries?: number;
      replayMode?: 'RETRYABLE_ONLY' | 'ALL_FAILED';
      errorCodes?: string[];
    },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const batchAsset = await this.prisma.conversationAsset.findFirst({
      where: {
        id: batchAssetId,
        sessionId,
        assetType: 'NOTE',
      },
      select: {
        id: true,
        title: true,
        payload: true,
      },
    });
    if (!batchAsset || !batchAsset.title.startsWith('能力晋升批次')) {
      throw new BadRequestException({
        code: 'CONV_PROMOTION_BATCH_NOT_FOUND',
        message: '能力晋升批次不存在或不属于当前会话',
      });
    }

    const payload = this.toRecord(batchAsset.payload);
    const action = this.pickString(payload.action)?.toUpperCase();
    if (!action) {
      throw new BadRequestException({
        code: 'CONV_PROMOTION_BATCH_INVALID',
        message: '能力晋升批次缺少动作信息，无法重放',
      });
    }

    const replayMode = dto?.replayMode === 'ALL_FAILED' ? 'ALL_FAILED' : 'RETRYABLE_ONLY';
    const policy = await this.resolveEphemeralCapabilityPolicy(userId);
    const requestedErrorCodes = Array.isArray(dto?.errorCodes)
      ? dto.errorCodes
        .map((item) => this.pickString(item)?.toUpperCase())
        .filter((item): item is string => Boolean(item))
      : [];

    const failedItems = this.toArray(payload.failed)
      .map((item) => this.toRecord(item))
      .map((item) => ({
        taskAssetId: this.pickString(item.taskAssetId),
        code: this.pickString(item.code),
        message: this.pickString(item.message),
      }))
      .filter((item) => Boolean(item.taskAssetId));

    const selectedFailedItems =
      replayMode === 'ALL_FAILED'
        ? failedItems
        : failedItems.filter((item) => this.isRetryablePromotionFailure(item.code, item.message, policy));
    const finalSelectedFailedItems = requestedErrorCodes.length
      ? selectedFailedItems.filter((item) => requestedErrorCodes.includes((item.code ?? 'UNKNOWN').toUpperCase()))
      : selectedFailedItems;
    const taskAssetIds = Array.from(
      new Set(
        finalSelectedFailedItems
          .map((item) => item.taskAssetId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const replayResult = await this.batchUpdateEphemeralCapabilityPromotionTasks(userId, sessionId, {
      action,
      comment: `重放失败任务（来源批次 ${batchAsset.id}，模式 ${replayMode}）`,
      taskAssetIds,
      maxConcurrency: dto?.maxConcurrency,
      maxRetries: dto?.maxRetries,
      sourceBatchAssetId: batchAsset.id,
    });

    return {
      sourceBatchAssetId: batchAsset.id,
      sourceAction: action,
      sourceFailedCount: failedItems.length,
      selectedReplayCount: taskAssetIds.length,
      replayMode,
      selectedErrorCodes: requestedErrorCodes,
      replayResult,
    };
  }

  async updateEphemeralCapabilityPromotionTask(
    userId: string,
    sessionId: string,
    taskAssetId: string,
    dto: { action: string; comment?: string },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const taskAsset = await this.prisma.conversationAsset.findFirst({
      where: {
        id: taskAssetId,
        sessionId,
        assetType: 'NOTE',
      },
    });
    if (!taskAsset || !taskAsset.title.startsWith('能力晋升任务')) {
      throw new BadRequestException({
        code: 'CONV_PROMOTION_TASK_NOT_FOUND',
        message: '能力晋升任务不存在或不属于当前会话',
      });
    }

    const action = String(dto.action || '').toUpperCase() as PromotionTaskAction;
    const currentPayload = this.toRecord(taskAsset.payload);
    const currentStatus = this.normalizePromotionTaskStatus(currentPayload.status) ?? 'PENDING_REVIEW';
    const nextPayload: Record<string, unknown> = {
      ...currentPayload,
    };
    const draftId = this.pickString(currentPayload.draftId);
    const draft = draftId
      ? await this.prisma.agentSkillDraft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          status: true,
          publishedSkillId: true,
        },
      })
      : null;

    const resolveStatusByDraft = (status: string | null | undefined): PromotionTaskStatus => {
      if (status === 'PUBLISHED') {
        return 'PUBLISHED';
      }
      if (status === 'APPROVED') {
        return 'APPROVED';
      }
      if (status === 'REJECTED') {
        return 'REJECTED';
      }
      return 'IN_REVIEW';
    };

    let nextStatus: PromotionTaskStatus = currentStatus;
    if (action === 'START_REVIEW') {
      nextStatus = 'IN_REVIEW';
    } else if (action === 'MARK_APPROVED') {
      nextStatus = 'APPROVED';
    } else if (action === 'MARK_REJECTED') {
      nextStatus = 'REJECTED';
    } else if (action === 'MARK_PUBLISHED') {
      if (!draft?.publishedSkillId) {
        throw new BadRequestException({
          code: 'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
          message: '该草稿尚未发布，请先完成发布后再标记为已发布',
        });
      }
      nextStatus = 'PUBLISHED';
      nextPayload.publishedSkillId = draft.publishedSkillId;
    } else if (action === 'SYNC_DRAFT_STATUS') {
      nextStatus = resolveStatusByDraft(draft?.status);
      nextPayload.publishedSkillId = draft?.publishedSkillId ?? this.pickString(currentPayload.publishedSkillId);
    } else {
      throw new BadRequestException({
        code: 'CONV_PROMOTION_TASK_ACTION_INVALID',
        message: '不支持的能力晋升任务操作',
      });
    }

    nextPayload.status = nextStatus;
    nextPayload.lastAction = action;
    nextPayload.lastActionAt = new Date().toISOString();
    nextPayload.lastActionBy = userId;
    if (dto.comment?.trim()) {
      nextPayload.lastComment = dto.comment.trim();
    }

    const updated = await this.prisma.conversationAsset.update({
      where: { id: taskAsset.id },
      data: {
        payload: nextPayload as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: `能力晋升任务状态变更 ${this.pickString(currentPayload.suggestedSkillCode) ?? ''}`.trim(),
      payload: {
        taskAssetId: taskAsset.id,
        draftId,
        action,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        comment: dto.comment?.trim() || null,
      },
      tags: {
        taskType: 'PROMOTION_TASK',
        taskAssetId: taskAsset.id,
      },
    });

    const task = this.toPromotionTask(updated);
    return {
      task,
    };
  }

  private async createPromotionTaskAssets(
    sessionId: string,
    candidates: Array<{ draftId: string; suggestedSkillCode: string; hitCount: number; reason: string }>,
    window: '1h' | '24h' | '7d',
  ): Promise<number> {
    if (!candidates.length) {
      return 0;
    }

    const existing = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'NOTE',
        title: {
          startsWith: '能力晋升任务',
        },
      },
      select: {
        payload: true,
      },
      take: 500,
      orderBy: [{ createdAt: 'desc' }],
    });

    const existingDraftIds = new Set<string>();
    for (const item of existing) {
      const payload = this.toRecord(item.payload);
      const draftId = this.pickString(payload.draftId);
      if (draftId) {
        existingDraftIds.add(draftId);
      }
    }

    let created = 0;
    for (const candidate of candidates) {
      if (existingDraftIds.has(candidate.draftId)) {
        continue;
      }
      await this.createConversationAsset({
        sessionId,
        assetType: 'NOTE',
        title: `能力晋升任务 ${candidate.suggestedSkillCode}`,
        payload: {
          draftId: candidate.draftId,
          suggestedSkillCode: candidate.suggestedSkillCode,
          hitCount: candidate.hitCount,
          reason: candidate.reason,
          window,
          status: 'PENDING_REVIEW',
          generatedAt: new Date().toISOString(),
        },
        tags: {
          taskType: 'PROMOTION_TASK',
          draftId: candidate.draftId,
        },
      });
      created += 1;
    }

    return created;
  }

  private normalizePromotionTaskStatus(input: unknown): PromotionTaskStatus | null {
    const value = this.pickString(input)?.toUpperCase();
    if (!value) {
      return null;
    }
    if (['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(value)) {
      return value as PromotionTaskStatus;
    }
    return null;
  }

  private normalizeBatchConcurrency(input: unknown): number {
    const value = this.normalizeNumber(input);
    if (!Number.isFinite(value) || value <= 0) {
      return 4;
    }
    return Math.min(Math.max(Math.floor(value), 1), 12);
  }

  private normalizeBatchRetry(input: unknown): number {
    const value = this.normalizeNumber(input);
    if (!Number.isFinite(value) || value < 0) {
      return 1;
    }
    return Math.min(Math.max(Math.floor(value), 0), 3);
  }

  private isTransientPromotionBatchError(error: unknown): boolean {
    if (!error || error instanceof BadRequestException) {
      return false;
    }
    const errorText = error instanceof Error ? error.message : String(error);
    return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout/i.test(errorText);
  }

  private isRetryablePromotionFailure(
    code: string | null,
    message: string | null,
    policy?: EphemeralCapabilityPolicy,
  ): boolean {
    const normalizedCode = (code ?? '').toUpperCase();
    const blocklist =
      policy?.replayNonRetryableErrorCodeBlocklist ?? [
        'CONV_PROMOTION_TASK_NOT_FOUND',
        'CONV_PROMOTION_TASK_ACTION_INVALID',
        'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
        'SKILL_REVIEWER_CONFLICT',
        'SKILL_HIGH_RISK_REVIEW_REQUIRED',
      ];
    if (blocklist.includes(normalizedCode)) {
      return false;
    }
    const allowlist = policy?.replayRetryableErrorCodeAllowlist ?? [];
    if (allowlist.includes(normalizedCode)) {
      return true;
    }
    const text = `${code ?? ''} ${message ?? ''}`;
    return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout|429|5\d{2}/i.test(text);
  }

  private toPromotionTask(asset: {
    id: string;
    title: string;
    payload: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload = this.toRecord(asset.payload);
    const status = this.normalizePromotionTaskStatus(payload.status);
    const draftId = this.pickString(payload.draftId);
    const suggestedSkillCode = this.pickString(payload.suggestedSkillCode);
    const hitCount = this.normalizeNumber(payload.hitCount);
    if (!draftId || !suggestedSkillCode) {
      return null;
    }
    return {
      taskAssetId: asset.id,
      title: asset.title,
      draftId,
      suggestedSkillCode,
      hitCount: Number.isFinite(hitCount) ? hitCount : 0,
      reason: this.pickString(payload.reason),
      window: this.pickString(payload.window),
      status: status ?? 'PENDING_REVIEW',
      generatedAt: this.pickString(payload.generatedAt),
      lastAction: this.pickString(payload.lastAction),
      lastActionAt: this.pickString(payload.lastActionAt),
      lastActionBy: this.pickString(payload.lastActionBy),
      lastComment: this.pickString(payload.lastComment),
      publishedSkillId: this.pickString(payload.publishedSkillId),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private toPromotionTaskBatch(asset: {
    id: string;
    title: string;
    payload: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload = this.toRecord(asset.payload);
    const action = this.pickString(payload.action)?.toUpperCase();
    if (!action) {
      return null;
    }
    const failed = this.toArray(payload.failed)
      .map((item) => this.toRecord(item))
      .map((item) => ({
        taskAssetId: this.pickString(item.taskAssetId),
        code: this.pickString(item.code),
        message: this.pickString(item.message) ?? '批次处理失败',
      }))
      .filter((item) => Boolean(item.taskAssetId));
    return {
      batchAssetId: asset.id,
      batchId: this.pickString(payload.batchId) ?? asset.id,
      title: asset.title,
      action,
      requestedCount: this.normalizeNumber(payload.requestedCount),
      succeededCount: this.normalizeNumber(payload.succeededCount),
      failedCount: this.normalizeNumber(payload.failedCount),
      maxConcurrency: this.normalizeNumber(payload.maxConcurrency),
      maxRetries: this.normalizeNumber(payload.maxRetries),
      window: this.pickString(payload.window),
      statusFilter: this.pickString(payload.statusFilter),
      sourceBatchAssetId: this.pickString(payload.sourceBatchAssetId),
      failed,
      generatedAt: this.pickString(payload.generatedAt),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private resolveRoutingWindowStart(window?: '1h' | '24h' | '7d'): Date | null {
    if (!window) {
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
    if (window === '1h') {
      return new Date(Date.now() - 60 * 60 * 1000);
    }
    if (window === '24h') {
      return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
    if (window === '7d') {
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }
    return null;
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

  private extractAssetReferenceIds(message: string): string[] {
    const ids = new Set<string>();
    const patterns = [
      /\[asset:([0-9a-fA-F-]{36})\]/g,
      /资产#([0-9a-fA-F-]{36})/g,
      /asset#([0-9a-fA-F-]{36})/gi,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null = pattern.exec(message);
      while (match) {
        const id = match[1];
        if (this.isUuid(id)) {
          ids.add(id);
        }
        match = pattern.exec(message);
      }
    }
    return Array.from(ids);
  }

  private async resolveFollowupAssetReference(
    sessionId: string,
    message: string,
  ): Promise<{
    assetIds: string[];
    resolution: Record<string, unknown> | null;
  }> {
    const rank = this.extractOrdinalReference(message);
    if (!rank) {
      return {
        assetIds: [],
        resolution: null,
      };
    }

    const roundOffset = this.extractFollowupRoundOffset(message);

    const assistants = await this.prisma.conversationTurn.findMany({
      where: {
        sessionId,
        role: 'ASSISTANT',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        structuredPayload: true,
      },
    });

    const candidateTurns = assistants.filter((turn) => {
      const payload = this.toRecord(turn.structuredPayload);
      const reuseResolution = this.toRecord(payload.reuseResolution);
      const semanticResolution = this.toRecord(reuseResolution.semanticResolution);
      const topCandidatesRaw = semanticResolution.topCandidates;
      return Array.isArray(topCandidatesRaw) && topCandidatesRaw.length > 0;
    });

    const selectedTurn = candidateTurns[Math.min(roundOffset, Math.max(candidateTurns.length - 1, 0))];
    if (!selectedTurn) {
      return {
        assetIds: [],
        resolution: {
          mode: 'followup',
          roundOffset,
          requestedRank: rank,
          candidateTurnCount: 0,
        },
      };
    }

    const payload = this.toRecord(selectedTurn.structuredPayload);
    const reuseResolution = this.toRecord(payload.reuseResolution);
    const semanticResolution = this.toRecord(reuseResolution.semanticResolution);
    const topCandidatesRaw = semanticResolution.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.toRecord(item))
      : [];
    const selected = topCandidates[rank - 1];
    const selectedId = this.pickString(selected.id);
    if (selectedId && this.isUuid(selectedId)) {
      return {
        assetIds: [selectedId],
        resolution: {
          mode: 'followup',
          roundOffset,
          requestedRank: rank,
          selectedAssetId: selectedId,
          selectedAssetTitle: this.pickString(selected.title),
          candidateTurnCount: candidateTurns.length,
          candidateCount: topCandidates.length,
        },
      };
    }
    return {
      assetIds: [],
      resolution: {
        mode: 'followup',
        roundOffset,
        requestedRank: rank,
        candidateTurnCount: candidateTurns.length,
        candidateCount: topCandidates.length,
      },
    };
  }

  private extractFollowupRoundOffset(message: string): number {
    if (message.includes('上上轮') || message.includes('前两轮')) {
      return 2;
    }
    if (message.includes('上轮') || message.includes('上一轮')) {
      return 1;
    }
    if (message.includes('这轮') || message.includes('本轮')) {
      return 0;
    }
    return 0;
  }

  private extractOrdinalReference(message: string): number | null {
    const directMatch = message.match(/第\s*(\d+)\s*个/);
    if (directMatch) {
      const index = Number(directMatch[1]);
      if (Number.isFinite(index) && index >= 1 && index <= 10) {
        return index;
      }
    }

    if (message.includes('第一个') || message.includes('第一条')) {
      return 1;
    }
    if (message.includes('第二个') || message.includes('第二条')) {
      return 2;
    }
    if (message.includes('第三个') || message.includes('第三条')) {
      return 3;
    }
    return null;
  }

  private shouldResolveSemanticAssetReference(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('基于') ||
      normalized.includes('沿用') ||
      normalized.includes('复用') ||
      normalized.includes('参考') ||
      normalized.includes('继续用') ||
      normalized.includes('用上') ||
      normalized.includes('上一次') ||
      normalized.includes('最近一次') ||
      normalized.includes('最新')
    );
  }

  private inferSemanticAssetType(message: string):
    | 'PLAN'
    | 'EXECUTION'
    | 'RESULT_SUMMARY'
    | 'EXPORT_FILE'
    | 'BACKTEST_SUMMARY'
    | 'CONFLICT_SUMMARY'
    | 'SKILL_DRAFT'
    | null {
    if (message.includes('回测')) {
      return 'BACKTEST_SUMMARY';
    }
    if (message.includes('冲突')) {
      return 'CONFLICT_SUMMARY';
    }
    if (message.includes('导出') || message.includes('原文件') || message.includes('报告文件')) {
      return 'EXPORT_FILE';
    }
    if (message.includes('草稿') || message.toLowerCase().includes('skill')) {
      return 'SKILL_DRAFT';
    }
    if (message.includes('执行实例')) {
      return 'EXECUTION';
    }
    if (message.includes('计划')) {
      return 'PLAN';
    }
    if (message.includes('结果') || message.includes('结论') || message.includes('分析')) {
      return 'RESULT_SUMMARY';
    }
    return null;
  }

  private inferSemanticAssetOffset(message: string): number {
    if (message.includes('上上次') || message.includes('倒数第二') || message.includes('第二新')) {
      return 1;
    }
    return 0;
  }

  private async resolveSemanticAssetReferences(
    sessionId: string,
    message: string,
  ): Promise<{
    assetIds: string[];
    resolution: Record<string, unknown> | null;
  }> {
    if (!this.shouldResolveSemanticAssetReference(message)) {
      return {
        assetIds: [],
        resolution: null,
      };
    }

    const assetType = this.inferSemanticAssetType(message);
    const offset = this.inferSemanticAssetOffset(message);
    const explicitDisambiguated = offset > 0;

    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: assetType || undefined,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
      select: {
        id: true,
        title: true,
        assetType: true,
        createdAt: true,
      },
    });

    if (!assets.length) {
      return {
        assetIds: [],
        resolution: {
          mode: 'semantic',
          requestedType: assetType,
          candidateCount: 0,
          ambiguous: false,
        },
      };
    }

    const ranked = assets
      .map((asset, index) => {
        const recencyScore = Math.max(0, 100 - index * 3);
        const keywordScore = this.computeSemanticKeywordScore(message, asset.title);
        const typeBonus = assetType ? (asset.assetType === assetType ? 20 : -10) : 0;
        return {
          ...asset,
          score: recencyScore + keywordScore + typeBonus,
        };
      })
      .sort((a, b) => b.score - a.score);

    const picked = ranked[Math.min(offset, ranked.length - 1)] ?? ranked[0];
    const ambiguous = ranked.length > 1 && !explicitDisambiguated;

    return {
      assetIds: picked ? [picked.id] : [],
      resolution: {
        mode: 'semantic',
        requestedType: assetType,
        candidateCount: ranked.length,
        selectedAssetId: picked?.id,
        selectedAssetTitle: picked?.title,
        selectedScore: picked?.score,
        ambiguous,
        topCandidates: ranked.slice(0, 3).map((item) => ({
          id: item.id,
          title: item.title,
          assetType: item.assetType,
          score: item.score,
        })),
      },
    };
  }

  private computeSemanticKeywordScore(message: string, title: string): number {
    const normalizedMessage = message.toLowerCase();
    const normalizedTitle = title.toLowerCase();
    const keywords = ['回测', '计划', '结果', '结论', '导出', '冲突', '草稿', '报告', 'risk', 'weekly'];
    return keywords.reduce((score, keyword) => {
      if (normalizedMessage.includes(keyword) && normalizedTitle.includes(keyword)) {
        return score + 10;
      }
      return score;
    }, 0);
  }

  private buildReuseReceiptMessage(
    referencedAssets: Array<{ id: string; title: string; assetType: string }>,
    resolution?: Record<string, unknown>,
  ) {
    const semantic = this.toRecord(resolution?.semanticResolution);
    const followup = this.toRecord(resolution?.followupResolution);
    const ambiguous = semantic.ambiguous === true;
    const candidateCount = this.normalizeNumber(semantic.candidateCount);
    const topCandidatesRaw = semantic.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.toRecord(item)).slice(0, 3)
      : [];

    if (!referencedAssets.length) {
      if (candidateCount === 0) {
        return '未匹配到可复用资产。你可以说“用最近一次回测结果”或直接使用 [asset:<id>]。';
      }
      return '';
    }

    const selected = referencedAssets[0];
    if (this.pickString(followup.selectedAssetId)) {
      return `已按序号复用资产：${selected.title}。`;
    }
    if (ambiguous && candidateCount > 1) {
      const candidateTips = topCandidates
        .map((item, index) => `${index + 1}.${this.pickString(item.title) || this.pickString(item.id) || '-'}`)
        .join('；');
      return `已为你匹配并复用资产：${selected.title}（候选 ${candidateCount} 项，已自动选择最相关项。可回复“用第2个”重新指定。候选：${candidateTips}）`;
    }
    return `已复用资产：${selected.title}。`;
  }

  private normalizeDeliveryTemplateCode(templateCode: unknown):
    | 'DEFAULT'
    | 'MORNING_BRIEF'
    | 'WEEKLY_REVIEW'
    | 'RISK_ALERT' {
    if (templateCode === 'MORNING_BRIEF') {
      return 'MORNING_BRIEF';
    }
    if (templateCode === 'WEEKLY_REVIEW') {
      return 'WEEKLY_REVIEW';
    }
    if (templateCode === 'RISK_ALERT') {
      return 'RISK_ALERT';
    }
    return 'DEFAULT';
  }

  private resolveDeliverySubject(
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU',
    templateCode: 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT',
    customSubject?: string,
  ) {
    if (customSubject?.trim()) {
      return customSubject.trim();
    }
    const channelName = this.channelDisplayName(channel);
    if (templateCode === 'MORNING_BRIEF') {
      return `${channelName}晨报 - CTBMS 对话助手`;
    }
    if (templateCode === 'WEEKLY_REVIEW') {
      return `${channelName}周复盘 - CTBMS 对话助手`;
    }
    if (templateCode === 'RISK_ALERT') {
      return `${channelName}风险提示 - CTBMS 对话助手`;
    }
    return 'CTBMS 对话助手分析报告';
  }

  private resolveDeliveryContent(
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU',
    templateCode: 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT',
    customContent?: string,
  ) {
    if (customContent?.trim()) {
      return customContent.trim();
    }
    const channelName = this.channelDisplayName(channel);
    if (templateCode === 'MORNING_BRIEF') {
      return `${channelName}晨报已生成，请查收附件原文件与摘要。`;
    }
    if (templateCode === 'WEEKLY_REVIEW') {
      return `${channelName}周度复盘已生成，请查收本周关键结论和风险提示。`;
    }
    if (templateCode === 'RISK_ALERT') {
      return `${channelName}风险告警已触发，请优先查看风险暴露与应对建议。`;
    }
    return '请查收本次对话分析结果。';
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

  private mergeDeliveryRecipients(primary?: string[], fallback?: string[]): string[] {
    const merged = [...(primary ?? []), ...(fallback ?? [])]
      .map((item) => item.trim())
      .filter(Boolean);
    return merged.filter((item, index) => merged.indexOf(item) === index);
  }

  private async resolveDeliveryProfileDefaults(
    userId: string,
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU',
  ): Promise<{
    to?: string[];
    target?: string;
    templateCode?: 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT';
    sendRawFile?: boolean;
  }> {
    const bindings = await this.prisma.userConfigBinding.findMany({
      where: {
        userId,
        bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES',
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 10,
      select: {
        metadata: true,
      },
    });

    for (const binding of bindings) {
      const metadata = this.toRecord(binding.metadata);
      const rawProfiles = metadata.profiles;
      if (!Array.isArray(rawProfiles)) {
        continue;
      }

      const profiles = rawProfiles.map((item) => this.toRecord(item));
      const channelProfiles = profiles.filter((profile) => this.pickString(profile.channel) === channel);
      if (!channelProfiles.length) {
        continue;
      }

      const selected =
        channelProfiles.find((profile) => Boolean(profile.isDefault)) ?? channelProfiles[0] ?? null;
      if (!selected) {
        continue;
      }

      const to = Array.isArray(selected.to)
        ? selected.to
          .map((item) => this.pickString(item))
          .filter((item): item is string => Boolean(item))
        : undefined;
      const rawTemplateCode = this.pickString(selected.templateCode);

      return {
        to,
        target: this.pickString(selected.target) ?? undefined,
        templateCode: rawTemplateCode ? this.normalizeDeliveryTemplateCode(rawTemplateCode) : undefined,
        sendRawFile: typeof selected.sendRawFile === 'boolean' ? selected.sendRawFile : undefined,
      };
    }

    return {};
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

  private async resolveCapabilityRoutingPolicy(userId: string): Promise<CapabilityRoutingPolicy> {
    const defaults: CapabilityRoutingPolicy = {
      allowOwnerPool: true,
      allowPublicPool: true,
      preferOwnerFirst: true,
      minOwnerScore: 0,
      minPublicScore: 0.35,
    };

    const binding = await this.prisma.userConfigBinding.findFirst({
      where: {
        userId,
        bindingType: 'AGENT_CAPABILITY_ROUTING_POLICY',
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: { metadata: true },
    });
    if (!binding?.metadata) {
      return defaults;
    }

    const metadata = this.toRecord(binding.metadata);
    const toBoolean = (value: unknown, fallback: boolean) =>
      typeof value === 'boolean' ? value : fallback;
    const toScore = (value: unknown, fallback: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.min(1, parsed));
    };

    return {
      allowOwnerPool: toBoolean(metadata.allowOwnerPool, defaults.allowOwnerPool),
      allowPublicPool: toBoolean(metadata.allowPublicPool, defaults.allowPublicPool),
      preferOwnerFirst: toBoolean(metadata.preferOwnerFirst, defaults.preferOwnerFirst),
      minOwnerScore: toScore(metadata.minOwnerScore, defaults.minOwnerScore),
      minPublicScore: toScore(metadata.minPublicScore, defaults.minPublicScore),
    };
  }

  private async resolveEphemeralCapabilityPolicy(userId: string): Promise<EphemeralCapabilityPolicy> {
    const defaults: EphemeralCapabilityPolicy = {
      draftSemanticReuseThreshold: 0.72,
      publishedSkillReuseThreshold: 0.76,
      runtimeGrantTtlHours: 24,
      runtimeGrantMaxUseCount: 30,
      replayRetryableErrorCodeAllowlist: ['NETWORK_ERROR', 'TIMEOUT', 'FETCH_FAILED', 'HTTP_429', 'HTTP_5XX'],
      replayNonRetryableErrorCodeBlocklist: [
        'CONV_PROMOTION_TASK_NOT_FOUND',
        'CONV_PROMOTION_TASK_ACTION_INVALID',
        'CONV_PROMOTION_TASK_PUBLISH_BLOCKED',
        'SKILL_REVIEWER_CONFLICT',
        'SKILL_HIGH_RISK_REVIEW_REQUIRED',
      ],
    };

    const binding = await this.prisma.userConfigBinding.findFirst({
      where: {
        userId,
        bindingType: 'AGENT_EPHEMERAL_CAPABILITY_POLICY',
        isActive: true,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: { metadata: true },
    });
    if (!binding?.metadata) {
      return defaults;
    }

    const metadata = this.toRecord(binding.metadata);
    const toScore = (value: unknown, fallback: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.min(1, parsed));
    };
    const toInt = (value: unknown, fallback: number, min: number, max: number) => {
      const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(min, Math.min(max, Math.round(parsed)));
    };
    const toStringArray = (value: unknown, fallback: string[]) => {
      if (!Array.isArray(value)) {
        return fallback;
      }
      const normalized = value
        .map((item) => this.pickString(item)?.toUpperCase())
        .filter((item): item is string => Boolean(item));
      return normalized.length ? Array.from(new Set(normalized)) : fallback;
    };

    return {
      draftSemanticReuseThreshold: toScore(metadata.draftSemanticReuseThreshold, defaults.draftSemanticReuseThreshold),
      publishedSkillReuseThreshold: toScore(
        metadata.publishedSkillReuseThreshold,
        defaults.publishedSkillReuseThreshold,
      ),
      runtimeGrantTtlHours: toInt(metadata.runtimeGrantTtlHours, defaults.runtimeGrantTtlHours, 1, 168),
      runtimeGrantMaxUseCount: toInt(
        metadata.runtimeGrantMaxUseCount,
        defaults.runtimeGrantMaxUseCount,
        1,
        200,
      ),
      replayRetryableErrorCodeAllowlist: toStringArray(
        metadata.replayRetryableErrorCodeAllowlist,
        defaults.replayRetryableErrorCodeAllowlist,
      ),
      replayNonRetryableErrorCodeBlocklist: toStringArray(
        metadata.replayNonRetryableErrorCodeBlocklist,
        defaults.replayNonRetryableErrorCodeBlocklist,
      ),
    };
  }

  private async logCapabilityRoutingDecisionAsset(
    sessionId: string,
    payload: {
      routeType: 'WORKFLOW_REUSE' | 'SKILL_DRAFT_REUSE' | 'SKILL_DRAFT_CREATE';
      routePolicy: string[];
      selectedSource: string;
      selectedScore?: number;
      selectedWorkflowDefinitionId?: string | null;
      selectedDraftId?: string | null;
      selectedSkillCode?: string | null;
      intent?: string | null;
      missingSlots?: string[];
      reason?: string;
      routePolicyDetails?: Record<string, unknown>;
    },
  ) {
    const key = this.computeRoutingDecisionKey(payload);
    return this.createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title: `能力路由日志 ${payload.routeType} ${key.slice(0, 12)}`,
      payload: {
        ...payload,
        dedupeKey: key,
        loggedAt: new Date().toISOString(),
      },
      tags: {
        routeType: payload.routeType,
        dedupeKey: key,
      },
    });
  }

  private computeRoutingDecisionKey(input: {
    routeType: string;
    selectedSource: string;
    selectedWorkflowDefinitionId?: string | null;
    selectedDraftId?: string | null;
    selectedSkillCode?: string | null;
    intent?: string | null;
  }): string {
    return [
      input.routeType,
      input.selectedSource,
      input.selectedWorkflowDefinitionId ?? '-',
      input.selectedDraftId ?? '-',
      input.selectedSkillCode ?? '-',
      input.intent ?? '-',
    ].join('|');
  }

  private async findReusableSkillDraft(
    ownerUserId: string,
    dto: CreateSkillDraftDto,
    policy: EphemeralCapabilityPolicy,
  ): Promise<
    | {
      id: string;
      gapType: string;
      requiredCapability: string;
      suggestedSkillCode: string;
      status: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      provisionalEnabled: boolean;
      reuseReason: 'EXACT_CODE' | 'SEMANTIC_MATCH';
    }
    | null
  > {
    const normalizedCode = this.normalizeCapabilityText(dto.suggestedSkillCode);
    const capabilityTokens = this.extractCapabilityTokens(`${dto.gapType} ${dto.requiredCapability}`);

    const candidates = await this.prisma.agentSkillDraft.findMany({
      where: {
        ownerUserId,
        status: {
          in: ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 80,
      select: {
        id: true,
        gapType: true,
        requiredCapability: true,
        suggestedSkillCode: true,
        status: true,
        riskLevel: true,
        provisionalEnabled: true,
      },
    });

    for (const draft of candidates) {
      if (this.normalizeCapabilityText(draft.suggestedSkillCode) === normalizedCode) {
        return {
          ...draft,
          reuseReason: 'EXACT_CODE',
        };
      }
    }

    let bestCandidate: {
      id: string;
      gapType: string;
      requiredCapability: string;
      suggestedSkillCode: string;
      status: string;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      provisionalEnabled: boolean;
      score: number;
    } | null = null;

    for (const draft of candidates) {
      const draftTokens = this.extractCapabilityTokens(`${draft.gapType} ${draft.requiredCapability}`);
      const score = this.computeCapabilitySimilarity(capabilityTokens, draftTokens);
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          ...draft,
          score,
        };
      }
    }

    if (bestCandidate && bestCandidate.score >= policy.draftSemanticReuseThreshold) {
      return {
        id: bestCandidate.id,
        gapType: bestCandidate.gapType,
        requiredCapability: bestCandidate.requiredCapability,
        suggestedSkillCode: bestCandidate.suggestedSkillCode,
        status: bestCandidate.status,
        riskLevel: bestCandidate.riskLevel,
        provisionalEnabled: bestCandidate.provisionalEnabled,
        reuseReason: 'SEMANTIC_MATCH',
      };
    }

    return null;
  }

  private async findReusablePublishedSkill(
    ownerUserId: string,
    dto: CreateSkillDraftDto,
    policy: CapabilityRoutingPolicy,
    ephemeralPolicy: EphemeralCapabilityPolicy,
  ): Promise<
    | {
      id: string;
      skillCode: string;
      name: string;
      description: string;
      templateSource: string;
      score: number;
    }
    | null
  > {
    const normalizedCode = this.normalizeCapabilityText(dto.suggestedSkillCode);
    const capabilityTokens = this.extractCapabilityTokens(`${dto.gapType} ${dto.requiredCapability}`);
    const whereOr: Array<Record<string, unknown>> = [];
    if (policy.allowOwnerPool) {
      whereOr.push({ ownerUserId });
    }
    if (policy.allowPublicPool) {
      whereOr.push({ templateSource: 'PUBLIC' });
    }
    if (!whereOr.length) {
      return null;
    }

    const candidates = await this.prisma.agentSkill.findMany({
      where: {
        isActive: true,
        OR: whereOr,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        ownerUserId: true,
        skillCode: true,
        name: true,
        description: true,
        templateSource: true,
      },
    });

    const ownerCandidates = candidates.filter((item) => item.ownerUserId === ownerUserId);
    const publicCandidates = candidates.filter((item) => item.ownerUserId !== ownerUserId);

    const preferredOrdered = policy.preferOwnerFirst
      ? [...ownerCandidates, ...publicCandidates]
      : [...candidates];

    for (const skill of preferredOrdered) {
      if (this.normalizeCapabilityText(skill.skillCode) === normalizedCode) {
        if (skill.ownerUserId !== ownerUserId && !policy.allowPublicPool) {
          continue;
        }
        return {
          ...skill,
          score: 1,
        };
      }
    }

    let best: {
      id: string;
      skillCode: string;
      name: string;
      description: string;
      templateSource: string;
      score: number;
    } | null = null;

    for (const skill of preferredOrdered) {
      const skillTokens = this.extractCapabilityTokens(`${skill.name} ${skill.description}`);
      const score = this.computeCapabilitySimilarity(capabilityTokens, skillTokens);
      if (skill.ownerUserId !== ownerUserId && score < policy.minPublicScore) {
        continue;
      }
      if (skill.ownerUserId === ownerUserId && score < policy.minOwnerScore) {
        continue;
      }
      if (!best || score > best.score) {
        best = {
          ...skill,
          score,
        };
      }
    }

    if (best && best.score >= ephemeralPolicy.publishedSkillReuseThreshold) {
      return {
        ...best,
        score: Number(best.score.toFixed(3)),
      };
    }

    return null;
  }

  private async upsertPublishedSkillBridgeDraft(input: {
    sessionId: string;
    ownerUserId: string;
    dto: CreateSkillDraftDto;
    skill: {
      id: string;
      skillCode: string;
      score: number;
      templateSource: string;
    };
    derivedRisk: {
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      sideEffectRisk: boolean;
      allowRuntimeGrant: boolean;
    };
  }) {
    const existing = await this.prisma.agentSkillDraft.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        publishedSkillId: input.skill.id,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (existing) {
      return existing;
    }

    return this.prisma.agentSkillDraft.create({
      data: {
        sessionId: input.sessionId,
        ownerUserId: input.ownerUserId,
        gapType: input.dto.gapType,
        requiredCapability: input.dto.requiredCapability,
        suggestedSkillCode: input.skill.skillCode,
        draftSpec: {
          source: 'PUBLISHED_SKILL_REUSE',
          score: input.skill.score,
          templateSource: input.skill.templateSource,
          publishedSkillId: input.skill.id,
        } as Prisma.InputJsonValue,
        status: 'PUBLISHED',
        riskLevel: input.derivedRisk.riskLevel,
        sideEffectRisk: input.derivedRisk.sideEffectRisk,
        provisionalEnabled: false,
        publishedSkillId: input.skill.id,
      },
    });
  }

  private async ensureRuntimeGrantForDraft(
    draftId: string,
    sessionId: string,
    ownerUserId: string,
    provisionalEnabled: boolean,
    policy: EphemeralCapabilityPolicy,
  ): Promise<string | null> {
    if (!provisionalEnabled) {
      return null;
    }
    const activeGrant = await this.prisma.agentSkillRuntimeGrant.findFirst({
      where: {
        draftId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true },
    });
    if (activeGrant) {
      return activeGrant.id;
    }

    const runtimeGrant = await this.prisma.agentSkillRuntimeGrant.create({
      data: {
        draftId,
        sessionId,
        ownerUserId,
        status: 'ACTIVE',
        maxUseCount: policy.runtimeGrantMaxUseCount,
        expiresAt: new Date(Date.now() + policy.runtimeGrantTtlHours * 60 * 60 * 1000),
      },
    });

    await this.prisma.agentSkillGovernanceEvent.create({
      data: {
        ownerUserId,
        draftId,
        runtimeGrantId: runtimeGrant.id,
        eventType: 'RUNTIME_GRANT_CREATED',
        message: `运行时授权已创建：${runtimeGrant.id}`,
        payload: {
          maxUseCount: runtimeGrant.maxUseCount,
          expiresAt: runtimeGrant.expiresAt,
          reuseGenerated: true,
        } as Prisma.InputJsonValue,
      },
    });

    return runtimeGrant.id;
  }

  private normalizeCapabilityText(value: string): string {
    return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  private extractCapabilityTokens(value: string): string[] {
    const tokens = value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
    const unique = new Set(tokens.filter(Boolean));
    return Array.from(unique);
  }

  private computeCapabilitySimilarity(baseTokens: string[], candidateTokens: string[]): number {
    if (!baseTokens.length || !candidateTokens.length) {
      return 0;
    }
    const base = new Set(baseTokens);
    const candidate = new Set(candidateTokens);
    const intersection = Array.from(base).filter((token) => candidate.has(token)).length;
    const union = new Set([...base, ...candidate]).size;
    if (union === 0) {
      return 0;
    }
    return Number((intersection / union).toFixed(3));
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

  private buildReplyOptions(input: {
    hasMissingSlots: boolean;
    missingSlots: string[];
    autoExecution: boolean;
    intent: IntentCode;
    slots: SlotMap;
  }): ReplyOption[] {
    if (input.hasMissingSlots) {
      const targetSlot = input.missingSlots[0] || 'timeRange';
      const defaults: Record<string, string[]> = {
        timeRange: ['最近7天', '最近30天'],
        region: ['东北', '华北'],
        outputFormat: ['markdown', 'json'],
      };
      const values = defaults[targetSlot] ?? ['使用默认值'];
      return [...values.slice(0, 2), '使用默认值'].map((value, index) => ({
        id: `slot_${targetSlot}_${index + 1}`,
        label: value,
        mode: 'SEND',
        value: value === '使用默认值' ? '用默认值继续' : value,
      }));
    }

    const options: ReplyOption[] = [];
    if (input.autoExecution) {
      options.push({
        id: 'view_result',
        label: '查看结果',
        mode: 'OPEN_TAB',
        tab: 'result',
      });
    } else {
      options.push({
        id: 'confirm_run',
        label: '开始执行',
        mode: 'OPEN_TAB',
        tab: 'progress',
      });
    }

    const region = this.pickString(input.slots.region) ?? '华北';
    options.push({
      id: 'refine_region',
      label: `改成${region === '东北' ? '华北' : '东北'}范围`,
      mode: 'SEND',
      value: `改成${region === '东北' ? '华北' : '东北'}范围再分析一次`,
    });
    options.push({
      id: 'deliver_report',
      label: '发送报告',
      mode: 'OPEN_TAB',
      tab: 'delivery',
    });
    options.push({
      id: 'summarize_next_actions',
      label: '给我三条行动建议',
      mode: 'SEND',
      value: '请基于当前结论给我三条可执行行动建议。',
    });
    options.push({
      id: 'schedule_report',
      label: '设置定时发送',
      mode: 'OPEN_TAB',
      tab: 'schedule',
    });

    return options.slice(0, 4);
  }

  private async tryEnhanceAssistantReplyWithLLM(input: {
    userMessage: string;
    assistantMessage: string;
    hasMissingSlots: boolean;
    missingSlots: string[];
    autoExecution: boolean;
    intent: IntentCode;
    slots: SlotMap;
    fallbackReplyOptions: ReplyOption[];
  }): Promise<{ assistantMessage: string; replyOptions: ReplyOption[] } | null> {
    if (process.env.AGENT_COPILOT_LLM_REPLY_ENABLED === 'false') {
      return null;
    }

    const model = await this.aiModelService.getSystemModelConfig();
    if (!model) {
      return null;
    }

    try {
      const provider = this.aiProviderFactory.getProvider(model.provider);
      const systemPrompt = [
        '你是面向普通用户的中文对话助手。',
        '你的目标是：降低理解门槛，给出简洁可执行回复。',
        '请严格输出 JSON，不要输出 markdown。',
        'JSON 结构：{"assistantMessage": string, "replyOptions": [{"id": string, "label": string, "mode": "SEND"|"OPEN_TAB", "value"?: string, "tab"?: "progress"|"result"|"delivery"|"schedule"}]}',
        '要求：assistantMessage 不超过 120 字；replyOptions 2-4 个；label 用普通中文短句。',
      ].join('\n');

      const userPrompt = JSON.stringify(
        {
          userMessage: input.userMessage,
          currentAssistantDraft: input.assistantMessage,
          state: {
            hasMissingSlots: input.hasMissingSlots,
            missingSlots: input.missingSlots,
            autoExecution: input.autoExecution,
            intent: input.intent,
            slots: input.slots,
          },
          fallbackReplyOptions: input.fallbackReplyOptions,
        },
        null,
        2,
      );

      const raw = await provider.generateResponse(systemPrompt, userPrompt, {
        modelName: model.modelId,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
        temperature: 0.2,
        maxTokens: 300,
        timeoutSeconds: 10,
        maxRetries: 1,
      });

      const parsed = this.parseJsonObject(raw);
      if (!parsed) {
        return null;
      }

      const assistantMessage = this.pickString(parsed.assistantMessage) ?? input.assistantMessage;
      const replyOptions = this.normalizeReplyOptions(parsed.replyOptions, input.fallbackReplyOptions);

      return {
        assistantMessage,
        replyOptions,
      };
    } catch {
      return null;
    }
  }

  private parseJsonObject(value: string): Record<string, unknown> | null {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      const block = text.match(/\{[\s\S]*\}/);
      if (!block) {
        return null;
      }
      try {
        const parsed = JSON.parse(block[0]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
  }

  private normalizeReplyOptions(raw: unknown, fallback: ReplyOption[]): ReplyOption[] {
    if (!Array.isArray(raw)) {
      return fallback;
    }

    const normalized = raw
      .map((item) => this.toRecord(item))
      .map((item, index) => {
        const mode = this.pickString(item.mode);
        const normalizedMode = mode === 'OPEN_TAB' ? 'OPEN_TAB' : 'SEND';
        const label = this.pickString(item.label) ?? '';
        const tabRaw = this.pickString(item.tab);
        const tab =
          tabRaw === 'progress' || tabRaw === 'result' || tabRaw === 'delivery' || tabRaw === 'schedule'
            ? (tabRaw as 'progress' | 'result' | 'delivery' | 'schedule')
            : undefined;
        return {
          id: this.pickString(item.id) ?? `llm_option_${index + 1}`,
          label,
          mode: normalizedMode as 'SEND' | 'OPEN_TAB',
          value: this.pickString(item.value) ?? undefined,
          tab,
        };
      })
      .filter((item) => item.label)
      .slice(0, 4);

    return normalized.length ? normalized : fallback;
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

  private toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
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

  private async pickWorkflowDefinitionCandidate(
    ownerUserId: string,
    intent: IntentCode,
    slots: SlotMap,
    policy: CapabilityRoutingPolicy,
  ): Promise<
    | {
      id: string;
      reuseSource: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC';
      score: number;
    }
    | null
  > {
    const whereOr: Array<Record<string, unknown>> = [];
    if (policy.allowOwnerPool) {
      whereOr.push({ ownerUserId });
    }
    if (policy.allowPublicPool) {
      whereOr.push({ templateSource: 'PUBLIC' });
    }
    if (!whereOr.length) {
      return null;
    }

    const candidates = await this.prisma.workflowDefinition.findMany({
      where: {
        OR: whereOr,
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        ownerUserId: true,
        templateSource: true,
        isPublished: true,
        stars: true,
        name: true,
        description: true,
      },
    });

    if (!candidates.length) {
      return null;
    }

    const keywords = this.buildWorkflowCapabilityKeywords(intent, slots);
    let best: { id: string; reuseSource: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC'; score: number } | null = null;

    for (const candidate of candidates) {
      let score = candidate.ownerUserId === ownerUserId ? 0.45 : 0.2;
      if (candidate.templateSource === 'PUBLIC') {
        score += 0.08;
      }
      if (candidate.isPublished) {
        score += 0.08;
      }
      score += Math.min(0.1, (candidate.stars ?? 0) / 1000);

      const haystack = `${candidate.name} ${candidate.description ?? ''}`.toLowerCase();
      const hitCount = keywords.filter((keyword) => haystack.includes(keyword)).length;
      score += Math.min(0.29, hitCount * 0.06);

      const normalized = Number(score.toFixed(3));
      if (candidate.ownerUserId !== ownerUserId && normalized < policy.minPublicScore) {
        continue;
      }
      if (candidate.ownerUserId === ownerUserId && normalized < policy.minOwnerScore) {
        continue;
      }

      if (!best || normalized > best.score) {
        best = {
          id: candidate.id,
          reuseSource: candidate.ownerUserId === ownerUserId ? 'USER_PRIVATE' : 'TEAM_OR_PUBLIC',
          score: normalized,
        };
      }
    }

    if (policy.preferOwnerFirst) {
      const ownerBest = candidates
        .filter((item) => item.ownerUserId === ownerUserId)
        .map((candidate) => {
          let score = 0.45;
          if (candidate.isPublished) {
            score += 0.08;
          }
          score += Math.min(0.1, (candidate.stars ?? 0) / 1000);
          const haystack = `${candidate.name} ${candidate.description ?? ''}`.toLowerCase();
          const hitCount = keywords.filter((keyword) => haystack.includes(keyword)).length;
          score += Math.min(0.29, hitCount * 0.06);
          return {
            id: candidate.id,
            score: Number(score.toFixed(3)),
          };
        })
        .filter((item) => item.score >= policy.minOwnerScore)
        .sort((a, b) => b.score - a.score)[0];
      if (ownerBest) {
        return {
          id: ownerBest.id,
          reuseSource: 'USER_PRIVATE',
          score: ownerBest.score,
        };
      }
    }

    return best;
  }

  private buildWorkflowCapabilityKeywords(intent: IntentCode, slots: SlotMap): string[] {
    const keywords = new Set<string>();
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      keywords.add('辩论');
      keywords.add('debate');
      keywords.add('judge');
      keywords.add('裁判');
    } else {
      keywords.add('市场');
      keywords.add('分析');
      keywords.add('summary');
      keywords.add('forecast');
    }

    const region = this.pickString(slots.region);
    const timeRange = this.pickString(slots.timeRange);
    if (region) {
      keywords.add(region.toLowerCase());
    }
    if (timeRange) {
      keywords.add(timeRange.toLowerCase());
    }
    return Array.from(keywords);
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

  // ─── copilot-v2 灰度开关 ───────────────────────────────────────────────

  async resolveCopilotVersion(userId: string): Promise<{ version: 'v1' | 'v2' }> {
    const binding = await this.prisma.userConfigBinding.findFirst({
      where: {
        userId,
        bindingType: 'AGENT_COPILOT_VERSION',
        isActive: true,
      },
      orderBy: { priority: 'desc' },
      select: { metadata: true },
    });
    const metadata = this.toRecord(binding?.metadata);
    const version = metadata.version === 'v2' ? 'v2' : 'v1';
    return { version };
  }

  // ─── DeliveryChannelBinding 独立查询 ────────────────────────────────────

  async resolveDeliveryChannelBinding(
    userId: string,
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU',
  ): Promise<{
    id: string;
    to?: string[];
    target?: string;
    templateCode?: 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT';
    sendRawFile?: boolean;
  } | null> {
    const binding = await this.prisma.deliveryChannelBinding.findFirst({
      where: {
        ownerUserId: userId,
        channel,
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!binding) {
      return null;
    }
    const to = Array.isArray(binding.to)
      ? (binding.to as unknown[])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
      : undefined;
    const rawTemplateCode = binding.templateCode;
    return {
      id: binding.id,
      to,
      target: binding.target ?? undefined,
      templateCode: rawTemplateCode
        ? this.normalizeDeliveryTemplateCode(rawTemplateCode)
        : undefined,
      sendRawFile: binding.sendRawFile,
    };
  }

  async listDeliveryChannelBindings(userId: string) {
    return this.prisma.deliveryChannelBinding.findMany({
      where: { ownerUserId: userId, isActive: true },
      orderBy: [{ channel: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async upsertDeliveryChannelBinding(
    userId: string,
    data: {
      id?: string;
      channel: string;
      target?: string;
      to?: string[];
      templateCode?: string;
      sendRawFile?: boolean;
      description?: string;
      isDefault?: boolean;
    },
  ) {
    if (data.id) {
      return this.prisma.deliveryChannelBinding.update({
        where: { id: data.id },
        data: {
          channel: data.channel,
          target: data.target,
          to: data.to ?? undefined,
          templateCode: data.templateCode,
          sendRawFile: data.sendRawFile,
          description: data.description,
          isDefault: data.isDefault,
        },
      });
    }
    return this.prisma.deliveryChannelBinding.create({
      data: {
        ownerUserId: userId,
        channel: data.channel,
        target: data.target,
        to: data.to ?? undefined,
        templateCode: data.templateCode,
        sendRawFile: data.sendRawFile ?? true,
        description: data.description,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  // ─── ConversationSchedulePolicy 独立查询 ─────────────────────────────────

  async listSchedulePolicies(userId: string) {
    return this.prisma.conversationSchedulePolicy.findMany({
      where: { ownerUserId: userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsertSchedulePolicy(
    userId: string,
    data: {
      id?: string;
      name: string;
      cronExpr: string;
      timezone?: string;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      maxRetries?: number;
      retryIntervalMs?: number;
      maxConcurrent?: number;
    },
  ) {
    if (data.id) {
      return this.prisma.conversationSchedulePolicy.update({
        where: { id: data.id },
        data: {
          name: data.name,
          cronExpr: data.cronExpr,
          timezone: data.timezone,
          quietHoursStart: data.quietHoursStart,
          quietHoursEnd: data.quietHoursEnd,
          maxRetries: data.maxRetries,
          retryIntervalMs: data.retryIntervalMs,
          maxConcurrent: data.maxConcurrent,
        },
      });
    }
    return this.prisma.conversationSchedulePolicy.create({
      data: {
        ownerUserId: userId,
        name: data.name,
        cronExpr: data.cronExpr,
        timezone: data.timezone ?? 'Asia/Shanghai',
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        maxRetries: data.maxRetries ?? 3,
        retryIntervalMs: data.retryIntervalMs ?? 60000,
        maxConcurrent: data.maxConcurrent ?? 1,
      },
    });
  }

  async resolveSchedulePolicy(policyId: string) {
    return this.prisma.conversationSchedulePolicy.findUnique({
      where: { id: policyId },
    });
  }
}

