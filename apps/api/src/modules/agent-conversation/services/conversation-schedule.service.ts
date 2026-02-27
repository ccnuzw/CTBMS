/**
 * ConversationScheduleService — 定时订阅管理
 *
 * 职责：
 *   - 订阅 CRUD（list / create / update / runNow）
 *   - 定时触发处理（processDueSubscriptions / runSubscription）
 *   - 调度指令解析（resolveScheduleCommand / parseScheduleInstruction）
 *   - Cron 推导与下次执行时间计算
 *   - DeliveryChannelBinding / SchedulePolicy 管理
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
    CreateConversationSubscriptionDto,
    UpdateConversationSubscriptionDto,
    ResolveConversationScheduleDto,
} from '@packages/types';
import { PrismaService } from '../../../prisma';
import { WorkflowExecutionService } from '../../workflow-execution';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationDeliveryService } from './conversation-delivery.service';

@Injectable()
export class ConversationScheduleService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly workflowExecutionService: WorkflowExecutionService,
        private readonly utils: ConversationUtilsService,
        private readonly deliveryService: ConversationDeliveryService,
    ) { }

    // ── Subscription CRUD ──────────────────────────────────────────────────────

    async listSubscriptions(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        return this.prisma.conversationSubscription.findMany({
            where: { sessionId, ownerUserId: userId },
            orderBy: [{ createdAt: 'desc' }],
            include: { runs: { orderBy: { startedAt: 'desc' }, take: 5 } },
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
        if (!session) return null;

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

        const planSnapshot = this.utils.toRecord(plan.planSnapshot);
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
        if (!subscription) return null;

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
        if (!subscription) return null;
        return this.runSubscription(subscription.id, 'RERUN', userId);
    }

    // ── Schedule Command Resolution ────────────────────────────────────────────

    async resolveScheduleCommand(
        userId: string,
        sessionId: string,
        dto: ResolveConversationScheduleDto,
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const parsed = this.parseScheduleInstruction(dto.instruction);
        let result: Record<string, unknown>;

        if (parsed.action === 'CREATE') {
            const created = await this.createSubscription(userId, sessionId, {
                name: parsed.subscriptionName,
                cronExpr: parsed.cronExpr,
                timezone: parsed.timezone,
                deliveryConfig: { channel: parsed.channel, target: parsed.target },
            });
            if (!created) return null;
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
                result = { action: 'PAUSE', subscriptionId: subscription.id, status: updated?.status };
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
                    deliveryConfig: { channel: parsed.channel, target: parsed.target },
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

    // ── Due Subscriptions Processing ───────────────────────────────────────────

    async processDueSubscriptions() {
        const now = new Date();
        const dueSubscriptions = await this.prisma.conversationSubscription.findMany({
            where: { status: 'ACTIVE', nextRunAt: { lte: now } },
            orderBy: { nextRunAt: 'asc' },
            take: 20,
        });
        for (const subscription of dueSubscriptions) {
            await this.runSubscription(subscription.id, 'SCHEDULED', subscription.ownerUserId);
        }
    }

    // ── DeliveryChannelBinding / SchedulePolicy ────────────────────────────────

    async resolveDeliveryChannelBinding(
        userId: string,
        channel: 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU',
    ) {
        const binding = await this.prisma.deliveryChannelBinding.findFirst({
            where: { ownerUserId: userId, channel, isActive: true },
            orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
        if (!binding) return null;
        const to = Array.isArray(binding.to)
            ? (binding.to as unknown[]).map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
            : undefined;
        const rawTemplateCode = binding.templateCode;
        return {
            id: binding.id,
            to,
            target: binding.target ?? undefined,
            templateCode: rawTemplateCode
                ? this.deliveryService.normalizeDeliveryTemplateCode(rawTemplateCode)
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
        return this.prisma.conversationSchedulePolicy.findUnique({ where: { id: policyId } });
    }

    async resolveCopilotVersion(userId: string): Promise<{ version: 'v1' | 'v2' }> {
        const binding = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_COPILOT_VERSION', isActive: true },
            orderBy: { priority: 'desc' },
            select: { metadata: true },
        });
        const metadata = this.utils.toRecord(binding?.metadata);
        const version = metadata.version === 'v2' ? 'v2' : 'v1';
        return { version };
    }

    // ── Private: runSubscription ───────────────────────────────────────────────

    private async runSubscription(
        subscriptionId: string,
        triggerMode: 'SCHEDULED' | 'RERUN',
        userId: string,
    ) {
        const subscription = await this.prisma.conversationSubscription.findUnique({
            where: { id: subscriptionId },
            include: { session: true },
        });
        if (!subscription) return null;

        const run = await this.prisma.conversationSubscriptionRun.create({
            data: { subscriptionId, status: 'RUNNING', triggerMode },
        });

        try {
            const planSnapshot = this.utils.toRecord(subscription.planSnapshot);
            const workflowDefinitionId = this.utils.pickString(planSnapshot.workflowDefinitionId);
            if (!workflowDefinitionId || !this.utils.isUuid(workflowDefinitionId)) {
                throw new Error('订阅计划缺少有效 workflowDefinitionId');
            }
            const paramSnapshot = this.utils.toRecord(planSnapshot.paramSnapshot);
            const compiledParamSnapshot = this.compileExecutionParams(planSnapshot, paramSnapshot);

            const execution = await this.workflowExecutionService.trigger(userId, {
                workflowDefinitionId,
                triggerType: 'SCHEDULE',
                paramSnapshot: compiledParamSnapshot,
                idempotencyKey: `subscription-${subscriptionId}-${Date.now()}`,
            });
            if (!execution) throw new Error('订阅任务触发执行失败');

            await this.prisma.conversationSubscriptionRun.update({
                where: { id: run.id },
                data: { status: 'SUCCESS', workflowExecutionId: execution.id, endedAt: new Date() },
            });

            const nextRunAt = this.computeNextRunAt(subscription.cronExpr, subscription.timezone);
            await this.prisma.conversationSubscription.update({
                where: { id: subscriptionId },
                data: { lastRunAt: new Date(), nextRunAt, status: 'ACTIVE' },
            });

            await this.prisma.conversationTurn.create({
                data: {
                    sessionId: subscription.sessionId,
                    role: 'SYSTEM',
                    content: `订阅任务已执行（${triggerMode}）。`,
                    structuredPayload: {
                        subscriptionId, runId: run.id, workflowExecutionId: execution.id, triggerMode, nextRunAt,
                    } as Prisma.InputJsonValue,
                },
            });

            return { runId: run.id, workflowExecutionId: execution.id, status: 'SUCCESS', nextRunAt };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.prisma.conversationSubscriptionRun.update({
                where: { id: run.id },
                data: { status: 'FAILED', errorMessage, endedAt: new Date() },
            });
            await this.prisma.conversationSubscription.update({
                where: { id: subscriptionId },
                data: { status: 'FAILED', nextRunAt: null },
            });
            await this.prisma.conversationTurn.create({
                data: {
                    sessionId: subscription.sessionId,
                    role: 'SYSTEM',
                    content: `订阅任务执行失败：${errorMessage}`,
                    structuredPayload: {
                        subscriptionId, runId: run.id, triggerMode, errorMessage,
                    } as Prisma.InputJsonValue,
                },
            });
            return { runId: run.id, status: 'FAILED', errorMessage };
        }
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    compileExecutionParams(
        mergedPlan: Record<string, unknown>,
        paramSnapshot: Record<string, unknown>,
    ): Record<string, unknown> {
        const planType = this.utils.pickString(mergedPlan.planType);
        if (planType !== 'DEBATE_PLAN') return paramSnapshot;

        const debateTopic = this.utils.pickString(paramSnapshot.topic) ?? '市场趋势辩论';
        const judgePolicy = this.normalizeJudgePolicy(this.utils.pickString(paramSnapshot.judgePolicy));
        const maxRounds = this.normalizeRounds(paramSnapshot.maxRounds);
        const participants = this.normalizeParticipants(paramSnapshot.participants);

        return {
            ...paramSnapshot,
            taskMode: 'DEBATE',
            topic: debateTopic,
            judgePolicy, maxRounds, participants,
            debateContext: {
                topic: debateTopic, judgePolicy, maxRounds,
                participantCount: participants.length,
                timeRange: this.utils.pickString(paramSnapshot.timeRange),
                region: this.utils.pickString(paramSnapshot.region),
            },
        };
    }

    private normalizeJudgePolicy(value: string | null): 'WEIGHTED' | 'MAJORITY' | 'JUDGE_AGENT' {
        if (value === 'WEIGHTED' || value === 'MAJORITY' || value === 'JUDGE_AGENT') return value;
        return 'JUDGE_AGENT';
    }

    private normalizeRounds(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(1, Math.min(5, Math.floor(value)));
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return Math.max(1, Math.min(5, Math.floor(parsed)));
        }
        return 2;
    }

    private normalizeParticipants(
        value: unknown,
    ): Array<{ agentCode: string; role: string; perspective: string; weight: number }> {
        if (!Array.isArray(value) || value.length === 0) return this.buildDefaultParticipants();
        return value
            .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
            .map((item) => {
                const record = item as Record<string, unknown>;
                return {
                    agentCode: this.utils.pickString(record.agentCode) ?? 'unknown_agent',
                    role: this.utils.pickString(record.role) ?? 'unknown',
                    perspective: this.utils.pickString(record.perspective) ?? '',
                    weight: this.normalizeWeight(record.weight),
                };
            });
    }

    private normalizeWeight(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
        }
        return 1;
    }

    private buildDefaultParticipants() {
        return [
            { agentCode: 'MARKET_ANALYST', role: 'proponent', perspective: '看多：供给收紧+需求回暖支撑价格', weight: 0.5 },
            { agentCode: 'RISK_CONTROLLER', role: 'opponent', perspective: '看空：库存回升+深加工走弱压制上行', weight: 0.5 },
        ];
    }

    computeNextRunAt(cronExpr: string, timezone: string): Date {
        const fields = cronExpr.trim().split(/\s+/);
        if (fields.length < 6) return new Date(Date.now() + 60 * 60 * 1000);

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
                if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
                return candidate;
            }

            const targetDow = Number(dayOfWeek);
            if (Number.isFinite(targetDow)) {
                const normalizedTarget = targetDow % 7;
                let diff = normalizedTarget - candidate.getUTCDay();
                if (diff < 0) diff += 7;
                candidate.setUTCDate(candidate.getUTCDate() + diff);
                if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 7);
                return candidate;
            }
        }

        const tzFallback = timezone ? 60 : 60;
        return new Date(Date.now() + tzFallback * 60 * 1000);
    }

    private parseScheduleInstruction(instruction: string) {
        const text = instruction.trim();
        const normalized = text.toLowerCase();

        const action = normalized.includes('暂停') || normalized.includes('停用')
            ? 'PAUSE' as const
            : normalized.includes('恢复') || normalized.includes('启用') || normalized.includes('开启')
                ? 'RESUME' as const
                : normalized.includes('补跑') || normalized.includes('立即执行') || normalized.includes('马上执行')
                    ? 'RUN' as const
                    : normalized.includes('修改') || normalized.includes('改成') || normalized.includes('改为')
                        ? 'UPDATE' as const
                        : 'CREATE' as const;

        const channel = normalized.includes('钉钉')
            ? 'DINGTALK' as const
            : normalized.includes('企微') || normalized.includes('企业微信')
                ? 'WECOM' as const
                : normalized.includes('飞书') ? 'FEISHU' as const : 'EMAIL' as const;

        const targetMatch = text.match(/(?:发到|发送到|推送到|到)\s*([^，。\s]+)/);
        const target = targetMatch ? targetMatch[1] : null;
        const nameMatch = text.match(/(?:订阅名|订阅名称|名称)[:：]?\s*([^，。\s]+)/);
        const subscriptionName = nameMatch?.[1] ?? `对话订阅-${new Date().toISOString().slice(0, 10)}`;
        const cronExpr = this.inferCronExprFromInstruction(text);

        return { action, subscriptionName, cronExpr, timezone: 'Asia/Shanghai', channel, target };
    }

    private inferCronExprFromInstruction(text: string): string {
        const timeMatch = text.match(/(\d{1,2})\s*(?:点|:|时)(\d{1,2})?/);
        const hour = Math.max(0, Math.min(23, Number(timeMatch?.[1] ?? 9)));
        const minute = Math.max(0, Math.min(59, Number(timeMatch?.[2] ?? 0)));

        if (text.includes('每周')) {
            const day = text.includes('周一') ? 1 : text.includes('周二') ? 2 : text.includes('周三') ? 3
                : text.includes('周四') ? 4 : text.includes('周五') ? 5 : text.includes('周六') ? 6
                    : text.includes('周日') || text.includes('周天') ? 0 : 1;
            return `0 ${minute} ${hour} * * ${day}`;
        }
        if (text.includes('每月')) {
            const dayMatch = text.match(/每月\s*(\d{1,2})\s*(?:号|日)?/);
            const day = Math.max(1, Math.min(28, Number(dayMatch?.[1] ?? 1)));
            return `0 ${minute} ${hour} ${day} * *`;
        }
        return `0 ${minute} ${hour} * * *`;
    }

    private async pickTargetSubscription(userId: string, sessionId: string, subscriptionName?: string) {
        if (subscriptionName) {
            const named = await this.prisma.conversationSubscription.findFirst({
                where: { ownerUserId: userId, sessionId, name: { contains: subscriptionName, mode: 'insensitive' } },
                orderBy: { updatedAt: 'desc' },
            });
            if (named) return named;
        }
        return this.prisma.conversationSubscription.findFirst({
            where: { ownerUserId: userId, sessionId },
            orderBy: { updatedAt: 'desc' },
        });
    }

    private buildScheduleResolutionMessage(result: Record<string, unknown>) {
        const action = this.utils.pickString(result.action) || 'UNKNOWN';
        const status = this.utils.pickString(result.status) || '-';
        const subscriptionId = this.utils.pickString(result.subscriptionId) || '-';
        if (action === 'RUN') return `已执行订阅补跑：${subscriptionId}，状态 ${status}。`;
        if (action === 'PAUSE') return `已暂停订阅：${subscriptionId}。`;
        if (action === 'RESUME') return `已恢复订阅：${subscriptionId}，状态 ${status}。`;
        if (action === 'UPDATE') return `已更新订阅：${subscriptionId}，状态 ${status}。`;
        return `已创建订阅：${subscriptionId}，状态 ${status}。`;
    }
}
