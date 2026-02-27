/**
 * ConversationEphemeralService — 临时能力管理领域
 *
 * 负责：
 *   - getEphemeralCapabilitySummary: 超时期能力概要
 *   - runEphemeralCapabilityHousekeeping: 过期回收
 *   - getEphemeralCapabilityEvolutionPlan: 演化计划
 *   - applyEphemeralCapabilityEvolutionPlan: 应用演化
 *   - 晋升任务管理（list / create / batch / replay / summary）
 *   - resolveEphemeralCapabilityPolicy: 能力策略解析
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';

@Injectable()
export class ConversationEphemeralService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utilsService: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── 能力概要 ──────────────────────────────────────────────────────────

    async getEphemeralCapabilitySummary(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        // 查找该会话拥有的临时能力（Draft 状态的 SkillDraft + RuntimeGrant）
        const drafts = await this.prisma.agentSkillDraft.findMany({
            where: { sessionId, status: { in: ['DRAFT', 'SANDBOX_TESTING', 'APPROVED'] } },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const grants = await this.prisma.agentSkillRuntimeGrant.findMany({
            where: { sessionId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const totalDrafts = drafts.length;
        const activeGrants = grants.filter((g: { expiresAt: Date }) => g.expiresAt > new Date()).length;
        const expiredGrants = grants.filter((g: { expiresAt: Date }) => g.expiresAt <= new Date()).length;

        return {
            totalDrafts,
            activeGrants,
            expiredGrants,
            drafts: drafts.map((d: { id: string; suggestedSkillCode: string; status: string; riskLevel: string | null; createdAt: Date }) => ({
                id: d.id,
                skillCode: d.suggestedSkillCode,
                status: d.status,
                riskLevel: d.riskLevel,
                createdAt: d.createdAt,
            })),
            grants: grants.map((g: { id: string; draftId: string; status: string; useCount: number; maxUseCount: number; expiresAt: Date }) => ({
                id: g.id,
                draftId: g.draftId,
                status: g.status,
                useCount: g.useCount,
                maxUseCount: g.maxUseCount,
                expiresAt: g.expiresAt,
            })),
        };
    }

    // ── 过期回收 ──────────────────────────────────────────────────────────

    async runEphemeralCapabilityHousekeeping(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const now = new Date();

        // 回收过期的 RuntimeGrant
        const expiredGrants = await this.prisma.agentSkillRuntimeGrant.findMany({
            where: { sessionId, status: 'ACTIVE', expiresAt: { lte: now } },
        });

        let revokedCount = 0;
        for (const grant of expiredGrants) {
            await this.prisma.agentSkillRuntimeGrant.update({
                where: { id: grant.id },
                data: { status: 'EXPIRED', revokeReason: '自动过期回收', revokedAt: now },
            });
            revokedCount++;
        }

        // 回收超用量的 RuntimeGrant
        const overUsedGrants = await this.prisma.agentSkillRuntimeGrant.findMany({
            where: { sessionId, status: 'ACTIVE' },
        });
        for (const grant of overUsedGrants) {
            if (grant.useCount >= grant.maxUseCount) {
                await this.prisma.agentSkillRuntimeGrant.update({
                    where: { id: grant.id },
                    data: { status: 'EXPIRED', revokeReason: '使用次数已用完', revokedAt: now },
                });
                revokedCount++;
            }
        }

        return { revokedCount, processedAt: now };
    }

    // ── 演化计划 ──────────────────────────────────────────────────────────

    async getEphemeralCapabilityEvolutionPlan(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        // 分析当前 Draft 状态分布，生成演化建议
        const drafts = await this.prisma.agentSkillDraft.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
        });

        const plan: Array<{
            draftId: string;
            skillCode: string;
            currentStatus: string;
            suggestedAction: string;
            reason: string;
        }> = [];

        for (const draft of drafts) {
            if (draft.status === 'DRAFT') {
                plan.push({
                    draftId: draft.id,
                    skillCode: draft.suggestedSkillCode,
                    currentStatus: draft.status,
                    suggestedAction: 'SANDBOX_TEST',
                    reason: '草案就绪，建议进入沙盒测试',
                });
            } else if (draft.status === 'APPROVED') {
                plan.push({
                    draftId: draft.id,
                    skillCode: draft.suggestedSkillCode,
                    currentStatus: draft.status,
                    suggestedAction: 'PUBLISH',
                    reason: '已审批通过，建议发布为正式技能',
                });
            }
        }

        return { sessionId, totalDrafts: drafts.length, suggestions: plan };
    }

    // ── 晋升任务管理 ──────────────────────────────────────────────────────

    async listEphemeralCapabilityPromotionTasks(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const assets = await this.prisma.conversationAsset.findMany({
            where: {
                sessionId,
                assetType: 'NOTE',
                tags: { path: ['type'], equals: 'PROMOTION_TASK' },
            },
            orderBy: { createdAt: 'desc' },
        });

        return assets.map((a) => ({
            id: a.id,
            title: a.title,
            payload: a.payload,
            createdAt: a.createdAt,
        }));
    }

    // ── 能力策略解析 ──────────────────────────────────────────────────────

    async resolveEphemeralCapabilityPolicy(userId: string) {
        const binding = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_COPILOT_EPHEMERAL_POLICY', isActive: true },
            orderBy: { priority: 'desc' },
        });

        if (!binding) {
            return {
                maxDraftsPerSession: 10,
                maxRuntimeGrantsPerSession: 20,
                defaultTtlHours: 24,
                defaultMaxUseCount: 100,
            };
        }

        const metadata = this.utilsService.toRecord(binding.metadata);
        return {
            maxDraftsPerSession: typeof metadata.maxDraftsPerSession === 'number' ? metadata.maxDraftsPerSession : 10,
            maxRuntimeGrantsPerSession: typeof metadata.maxRuntimeGrantsPerSession === 'number' ? metadata.maxRuntimeGrantsPerSession : 20,
            defaultTtlHours: typeof metadata.defaultTtlHours === 'number' ? metadata.defaultTtlHours : 24,
            defaultMaxUseCount: typeof metadata.defaultMaxUseCount === 'number' ? metadata.defaultMaxUseCount : 100,
        };
    }
}
