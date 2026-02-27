/**
 * ConversationScheduleService — 定时订阅领域
 *
 * 负责：
 *   - listSubscriptions / createSubscription / updateSubscription
 *   - runSubscriptionNow / resolveScheduleCommand
 *   - processDueSubscriptions (定时扫描)
 *   - Cron 解析、静默时段检查、下次执行时间计算
 *   - Schedule Policy 管理
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import type {
    CreateConversationSubscriptionDto,
    UpdateConversationSubscriptionDto,
} from '@packages/types';

@Injectable()
export class ConversationScheduleService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utilsService: ConversationUtilsService,
    ) { }

    // ── Public API ───────────────────────────────────────────────────────────

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

        const planSnapshot = this.utilsService.toRecord(plan.planSnapshot);
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

    // ── Schedule Policy ─────────────────────────────────────────────────────

    async listSchedulePolicies(userId: string) {
        return this.prisma.userConfigBinding.findMany({
            where: { userId, bindingType: 'AGENT_COPILOT_SCHEDULE_POLICY' },
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        });
    }

    async upsertSchedulePolicy(userId: string, data: Record<string, unknown>) {
        const existing = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_COPILOT_SCHEDULE_POLICY' },
        });
        if (existing) {
            return this.prisma.userConfigBinding.update({
                where: { id: existing.id },
                data: { metadata: data as Prisma.InputJsonValue, updatedAt: new Date() },
            });
        }
        return this.prisma.userConfigBinding.create({
            data: {
                userId,
                bindingType: 'AGENT_COPILOT_SCHEDULE_POLICY',
                targetId: 'DEFAULT',
                metadata: data as Prisma.InputJsonValue,
                isActive: true,
                priority: 1,
            },
        });
    }

    async resolveSchedulePolicy(policyId: string) {
        return this.prisma.userConfigBinding.findUnique({
            where: { id: policyId },
        });
    }

    compileExecutionParams(
        mergedPlan: Record<string, unknown>,
        paramSnapshot: Record<string, unknown>,
    ): Record<string, unknown> {
        const planType = this.utilsService.pickString(mergedPlan.planType);
        if (planType !== 'DEBATE_PLAN') {
            return paramSnapshot;
        }

        const debateTopic = this.utilsService.pickString(paramSnapshot.topic) ?? '市场趋势辩论';
        const judgePolicy = this.normalizeJudgePolicy(this.utilsService.pickString(paramSnapshot.judgePolicy));
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
                timeRange: this.utilsService.pickString(paramSnapshot.timeRange),
                region: this.utilsService.pickString(paramSnapshot.region),
            },
        };
    }

    // ── Private Helpers ─────────────────────────────────────────────────────

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
                const agentCode = this.utilsService.pickString(row.agentCode);
                const role = this.utilsService.pickString(row.role);
                if (!agentCode || !role) {
                    return null;
                }
                return {
                    agentCode,
                    role,
                    perspective: this.utilsService.pickString(row.perspective) ?? '',
                    weight: this.normalizeWeight(row.weight),
                };
            })
            .filter(
                (item): item is { agentCode: string; role: string; perspective: string; weight: number } =>
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

    computeNextRunAt(cronExpr: string, _timezone: string): Date {
        // 简化实现：解析 cron 表达式得到下次执行时间
        // 实际应使用 cron-parser 库
        const now = new Date();
        const parts = cronExpr.split(/\s+/);
        if (parts.length < 5) {
            // 无法解析，默认 24 小时后
            return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }

        const minute = parts[0] === '*' ? 0 : parseInt(parts[0], 10);
        const hour = parts[1] === '*' ? 8 : parseInt(parts[1], 10);

        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    parseScheduleInstruction(instruction: string): {
        action: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME' | 'RUN';
        subscriptionName: string;
        cronExpr: string;
        timezone: string;
    } {
        const lower = instruction.toLowerCase();
        let action: 'CREATE' | 'UPDATE' | 'PAUSE' | 'RESUME' | 'RUN' = 'CREATE';
        if (/暂停|停止|pause/.test(lower)) action = 'PAUSE';
        else if (/恢复|继续|resume/.test(lower)) action = 'RESUME';
        else if (/立即执行|run/.test(lower)) action = 'RUN';
        else if (/修改|更新|update/.test(lower)) action = 'UPDATE';

        const cronExpr = this.inferCronExprFromInstruction(lower);
        return {
            action,
            subscriptionName: `自动分析-${new Date().toISOString().slice(0, 10)}`,
            cronExpr,
            timezone: 'Asia/Shanghai',
        };
    }

    private inferCronExprFromInstruction(text: string): string {
        if (/每天.*?(\d+).*?点/.test(text)) {
            const match = text.match(/(\d+)/);
            const hour = match ? parseInt(match[1], 10) : 8;
            return `0 ${hour} * * *`;
        }
        if (/每周一/.test(text)) return '0 8 * * 1';
        if (/每周五/.test(text)) return '0 8 * * 5';
        if (/每周/.test(text)) return '0 8 * * 1';
        if (/每月/.test(text)) return '0 8 1 * *';
        return '0 8 * * 1'; // 默认每周一早上8点
    }
}
