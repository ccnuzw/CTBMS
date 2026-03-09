import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CreateConversationSubscriptionDto,
  DeliverConversationDto,
  DeliverConversationEmailDto,
  ResolveConversationScheduleDto,
  UpdateConversationSubscriptionDto,
} from '@packages/types';
import { PrismaService } from '../../../prisma';
import { WorkflowExecutionService } from '../../workflow-execution';
import { ReportExportService } from '../../report-export';

export interface ConversationSubscriptionDelegate {
  createConversationAsset(input: {
    sessionId: string;
    assetType: 'PLAN' | 'EXECUTION' | 'RESULT_SUMMARY' | 'EXPORT_FILE' | 'BACKTEST_SUMMARY' | 'CONFLICT_SUMMARY' | 'SKILL_DRAFT' | 'NOTE';
    title: string;
    payload: Record<string, unknown>;
    sourceTurnId?: string | null;
    sourceExecutionId?: string | null;
    sourcePlanVersion?: number | null;
    tags?: Record<string, unknown> | null;
  }): Promise<{ id: string }>;
  compileExecutionParams(
    mergedPlan: Record<string, unknown>,
    paramSnapshot: Record<string, unknown>,
  ): Record<string, unknown>;
  mergeDeliveryRecipients(
    existing: unknown[],
    incoming: unknown[],
  ): unknown[];
  confirmPlan(
    userId: string,
    sessionId: string,
    dto: Record<string, unknown>,
    options?: { recordTurn?: boolean },
  ): Promise<unknown>;
  preflightCheck(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
}

@Injectable()
export class ConversationSubscriptionService {
  private delegate?: ConversationSubscriptionDelegate;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly reportExportService: ReportExportService,
  ) { }

  setDelegate(delegate: ConversationSubscriptionDelegate) {
    this.delegate = delegate;
  }

  private getDelegate(): ConversationSubscriptionDelegate {
    if (!this.delegate) {
      throw new Error('ConversationSubscriptionService delegate not set');
    }
    return this.delegate;
  }

  // Utility methods
  private pickString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    return null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    return value as Prisma.InputJsonValue;
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
    const to =
      channel === 'EMAIL' ? this.getDelegate().mergeDeliveryRecipients(dto.to ?? [], profileDefaults.to ?? []) : undefined;
    const target =
      channel === 'EMAIL'
        ? undefined
        : dto.target?.trim() || profileDefaults.target?.trim() || undefined;
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
      // ── 指数退避重试投递（最多 3 次重试） ──
      const MAX_RETRIES = 3;
      const BASE_DELAY_MS = 1000;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
            break;
          } else {
            status = 'FAILED';
            errorMessage = `${channel} 投递网关返回 ${response.status}`;
          }
        } catch (error) {
          status = 'FAILED';
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        // 如果不是最后一次尝试且失败了，等待后重试
        if (attempt < MAX_RETRIES && status === 'FAILED') {
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
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

    await this.getDelegate().createConversationAsset({
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

  normalizeDeliveryTemplateCode(
    templateCode: unknown,
  ): 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT' {
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

  resolveDeliverySubject(
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

  resolveDeliveryContent(
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

  resolveDeliveryWebhook(channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU') {
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

  async resolveDeliveryProfileDefaults(
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
      const channelProfiles = profiles.filter(
        (profile) => this.pickString(profile.channel) === channel,
      );
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
        templateCode: rawTemplateCode
          ? this.normalizeDeliveryTemplateCode(rawTemplateCode)
          : undefined,
        sendRawFile: typeof selected.sendRawFile === 'boolean' ? selected.sendRawFile : undefined,
      };
    }

    return {};
  }

  channelDisplayName(channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU') {
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

  parseScheduleInstruction(instruction: string): {
    action: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME' | 'RUN';
    subscriptionName: string;
    cronExpr: string;
    timezone: string;
    channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU';
    target: string | null;
  } {
    const text = instruction.trim();
    const normalized = text.toLowerCase();

    const action =
      normalized.includes('暂停') || normalized.includes('停用')
        ? 'PAUSE'
        : normalized.includes('恢复') || normalized.includes('启用') || normalized.includes('开启')
          ? 'RESUME'
          : normalized.includes('补跑') ||
            normalized.includes('立即执行') ||
            normalized.includes('马上执行')
            ? 'RUN'
            : normalized.includes('修改') ||
              normalized.includes('改成') ||
              normalized.includes('改为')
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

  inferCronExprFromInstruction(text: string): string {
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

  async pickTargetSubscription(
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

  buildScheduleResolutionMessage(result: Record<string, unknown>) {
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

  computeNextRunAt(cronExpr: string, timezone: string): Date {
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

  async runSubscription(
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

      // ── D2: 定时执行也注入前轮结果（让定时分析能参考上次结论） ──
      try {
        const latestResultAsset = await this.prisma.conversationAsset.findFirst({
          where: { sessionId: subscription.sessionId, assetType: 'RESULT_SUMMARY' },
          orderBy: { createdAt: 'desc' },
          select: { payload: true },
        });
        if (latestResultAsset?.payload) {
          const resultPayload = this.toRecord(latestResultAsset.payload);
          const previousResult = this.toRecord(resultPayload.result);
          const previousAnalysis: Record<string, unknown> = {};
          if (previousResult.conclusion) previousAnalysis.conclusion = previousResult.conclusion;
          if (previousResult.confidence) previousAnalysis.confidence = previousResult.confidence;
          if (Array.isArray(previousResult.facts))
            previousAnalysis.facts = (previousResult.facts as string[]).slice(0, 10);
          if (Object.keys(previousAnalysis).length > 0) {
            paramSnapshot.previousAnalysis = previousAnalysis;
          }
        }
      } catch {
        // 注入失败不阻塞定时执行
      }

      const compiledParamSnapshot = this.getDelegate().compileExecutionParams(planSnapshot, paramSnapshot);

      const preflight = await this.getDelegate().preflightCheck({
        userId,
        workflowDefinitionId,
        planSnapshot,
        paramSnapshot: compiledParamSnapshot,
      }) as Record<string, unknown> | null;
      if (!preflight || !preflight.passed) {
        throw new Error(`执行前校验未通过：${this.pickString(preflight?.message) ?? '未知原因'}`);
      }

      const execution = await this.workflowExecutionService.trigger(userId, {
        workflowDefinitionId,
        workflowVersionId: this.pickString(preflight.workflowVersionId) ?? undefined,
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
            preflight,
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
