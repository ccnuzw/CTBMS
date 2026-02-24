import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateConversationSubscriptionDto,
  ConfirmConversationPlanDto,
  CreateConversationSessionDto,
  CreateConversationTurnDto,
  ExportConversationResultDto,
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

type DeliverConversationEmailDto = {
  exportTaskId: string;
  to: string[];
  subject: string;
  content: string;
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

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'USER',
        content: dto.message,
        structuredPayload: this.toJson(dto.contextPatch),
      },
    });

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

    const assistantMessage = hasMissingSlots
      ? this.buildSlotPrompt(missingSlots)
      : '我已完成计划编排。请确认执行，或告诉我需要调整的参数。';

    if (proposedPlan) {
      const latestPlan = await this.prisma.conversationPlan.findFirst({
        where: { sessionId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latestPlan?.version ?? 0) + 1;
      await this.prisma.conversationPlan.create({
        data: {
          sessionId,
          version: nextVersion,
          planType: proposedPlan.planType,
          planSnapshot: proposedPlan as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: assistantMessage,
        structuredPayload: {
          intent,
          missingSlots,
          proposedPlan,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        currentIntent: intent,
        currentSlots: mergedSlots,
        state,
        latestPlanType:
          proposedPlan?.planType === 'DEBATE_PLAN' ? 'DEBATE_PLAN' : proposedPlan ? 'RUN_PLAN' : null,
        latestPlanSnapshot: proposedPlan
          ? (proposedPlan as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return {
      assistantMessage,
      state,
      intent,
      missingSlots,
      proposedPlan,
      confirmRequired: !hasMissingSlots,
    };
  }

  async confirmPlan(userId: string, sessionId: string, dto: ConfirmConversationPlanDto) {
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

    return {
      exportTaskId: exportTask.id,
      status: exportTask.status,
      workflowExecutionId,
      downloadUrl: exportTask.downloadUrl,
    };
  }

  async deliverEmail(userId: string, sessionId: string, dto: DeliverConversationEmailDto) {
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

    const deliveryTaskId = `delivery_${randomUUID()}`;
    const webhookUrl = process.env.MAIL_DELIVERY_WEBHOOK_URL?.trim();

    let status: 'QUEUED' | 'SENT' | 'FAILED' = 'QUEUED';
    let errorMessage: string | null = null;

    if (!webhookUrl) {
      status = 'FAILED';
      errorMessage = '未配置 MAIL_DELIVERY_WEBHOOK_URL，无法实际投递邮件';
    } else {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deliveryTaskId,
            exportTaskId: exportTask.id,
            to: dto.to,
            subject: dto.subject,
            content: dto.content,
            attachment: {
              fileName: `report-export-${exportTask.id}.${String(exportTask.format).toLowerCase()}`,
              downloadUrl: `/report-exports/${exportTask.id}/download`,
            },
          }),
        });

        if (response.ok) {
          status = 'SENT';
        } else {
          status = 'FAILED';
          errorMessage = `邮件投递网关返回 ${response.status}`;
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
            ? `邮件已发送至 ${dto.to.join(', ')}。`
            : `邮件发送失败：${errorMessage ?? '未知错误'}。`,
        structuredPayload: {
          deliveryTaskId,
          exportTaskId: exportTask.id,
          status,
          to: dto.to,
          subject: dto.subject,
          errorMessage,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      deliveryTaskId,
      status,
      errorMessage,
    };
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
        deliveryConfig: dto.deliveryConfig
          ? (dto.deliveryConfig as Prisma.InputJsonValue)
          : subscription.deliveryConfig,
        quietHours: dto.quietHours
          ? (dto.quietHours as Prisma.InputJsonValue)
          : subscription.quietHours,
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
        triggerType: 'SCHEDULED',
        paramSnapshot: compiledParamSnapshot,
        idempotencyKey: `subscription-${subscriptionId}-${Date.now()}`,
      });

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
