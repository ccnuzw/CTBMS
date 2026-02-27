/**
 * ConversationEphemeralService — 临时能力治理
 *
 * 职责：
 *   - 临时能力摘要（getEphemeralCapabilitySummary）
 *   - 能力清理（runEphemeralCapabilityHousekeeping）
 *   - 进化计划（getEphemeralCapabilityEvolutionPlan / apply）
 *   - 晋升任务管理（list / summary / update / batch / replay）
 *   - 资产复用（reuseAsset）
 *   - 路由摘要（getCapabilityRoutingSummary）
 *
 * 从 agent-conversation.service.ts L1694-2815 提取。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReuseConversationAssetDto } from '@packages/types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';
import { ConversationSkillService } from './conversation-skill.service';
import type { PromotionTaskStatus, PromotionTaskAction, EphemeralCapabilityPolicy } from './conversation.types';

@Injectable()
export class ConversationEphemeralService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
        private readonly skillService: ConversationSkillService,
    ) { }

    // ── 临时能力摘要 ──────────────────────────────────────────────────────────

    async getEphemeralCapabilitySummary(
        userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d' },
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId }, select: { id: true },
        });
        if (!session) return null;

        const effectivePolicy = await this.skillService.resolveEphemeralCapabilityPolicy(userId);
        const createdAfter = this.skillService.resolveRoutingWindowStart(query?.window);
        const now = new Date();
        const staleDraftBefore = new Date(now.getTime() - effectivePolicy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

        const drafts = await this.prisma.agentSkillDraft.findMany({
            where: { sessionId, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            select: { id: true, status: true, suggestedSkillCode: true, updatedAt: true, provisionalEnabled: true },
            orderBy: [{ createdAt: 'desc' }], take: 500,
        });

        const grants = await this.prisma.agentSkillRuntimeGrant.findMany({
            where: { sessionId, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            select: { id: true, status: true, expiresAt: true, useCount: true, maxUseCount: true },
            orderBy: [{ createdAt: 'desc' }], take: 500,
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
            (g) => g.status === 'ACTIVE' && g.expiresAt > now && g.expiresAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000),
        ).length;

        const staleDrafts = drafts.filter(
            (d) => ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'].includes(d.status)
                && d.updatedAt < staleDraftBefore && d.provisionalEnabled,
        ).length;

        const toSorted = (m: Map<string, number>) =>
            Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

        return {
            window: query?.window ?? '24h',
            totals: { drafts: drafts.length, runtimeGrants: grants.length, expiringRuntimeGrantsIn24h: expiringIn24h, staleDrafts },
            policy: effectivePolicy,
            stats: { draftStatus: toSorted(draftStatusStats), grantStatus: toSorted(grantStatusStats), topSkillCodes: toSorted(skillCodeStats).slice(0, 10) },
        };
    }

    // ── 能力清理 ──────────────────────────────────────────────────────────────

    async runEphemeralCapabilityHousekeeping(userId: string, sessionId: string) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId }, select: { id: true },
        });
        if (!session) return null;

        const policy = await this.skillService.resolveEphemeralCapabilityPolicy(userId);
        const now = new Date();
        const staleDraftBefore = new Date(now.getTime() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

        const expiredGrants = await this.prisma.agentSkillRuntimeGrant.updateMany({
            where: { sessionId, status: 'ACTIVE', expiresAt: { lt: now } },
            data: { status: 'EXPIRED' },
        });

        const disabledDrafts = await this.prisma.agentSkillDraft.updateMany({
            where: {
                sessionId, status: { in: ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'] },
                provisionalEnabled: true, updatedAt: { lt: staleDraftBefore },
            },
            data: { provisionalEnabled: false },
        });

        await this.assetService.createAsset({
            sessionId, assetType: 'NOTE', title: '临时能力治理清理',
            payload: { expiredGrantCount: expiredGrants.count, disabledDraftCount: disabledDrafts.count, policy, checkedAt: now.toISOString() },
            tags: { housekeeping: true },
        });

        return { checkedAt: now.toISOString(), expiredGrantCount: expiredGrants.count, disabledDraftCount: disabledDrafts.count, policy };
    }

    // ── 进化计划 ──────────────────────────────────────────────────────────────

    async getEphemeralCapabilityEvolutionPlan(
        userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d' },
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId }, select: { id: true },
        });
        if (!session) return null;

        const policy = await this.skillService.resolveEphemeralCapabilityPolicy(userId);
        const createdAfter = this.skillService.resolveRoutingWindowStart(query?.window);
        const staleDraftBefore = new Date(Date.now() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000);

        const routingLogs = await this.skillService.listCapabilityRoutingLogs(userId, sessionId, {
            routeType: 'SKILL_DRAFT_REUSE', limit: 300, window: query?.window,
        });

        const draftHitMap = new Map<string, number>();
        const skillCodeHitMap = new Map<string, number>();
        for (const log of routingLogs ?? []) {
            const rec = log as unknown as Record<string, unknown>;
            const draftId = this.utils.pickString(rec.selectedDraftId);
            const skillCode = this.utils.pickString(rec.selectedSkillCode);
            if (draftId) draftHitMap.set(draftId, (draftHitMap.get(draftId) ?? 0) + 1);
            if (skillCode) skillCodeHitMap.set(skillCode, (skillCodeHitMap.get(skillCode) ?? 0) + 1);
        }

        const drafts = await this.prisma.agentSkillDraft.findMany({
            where: { sessionId, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            select: { id: true, status: true, suggestedSkillCode: true, updatedAt: true, provisionalEnabled: true, publishedSkillId: true },
            orderBy: [{ updatedAt: 'desc' }], take: 500,
        });

        const promoteDraftCandidates = drafts
            .map((d) => ({
                draftId: d.id, suggestedSkillCode: d.suggestedSkillCode, hitCount: draftHitMap.get(d.id) ?? 0,
                reason: d.publishedSkillId ? '已映射到发布能力，可进入能力池优先级提升评估' : '复用命中较高，建议进入发布评审',
            }))
            .filter((item) => item.hitCount >= 2).slice(0, 20);

        const staleDraftCandidates = drafts
            .filter((d) => ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'].includes(d.status) && d.provisionalEnabled && d.updatedAt < staleDraftBefore)
            .map((d) => ({ draftId: d.id, suggestedSkillCode: d.suggestedSkillCode, status: d.status, updatedAt: d.updatedAt }))
            .slice(0, 50);

        const grants = await this.prisma.agentSkillRuntimeGrant.findMany({
            where: { sessionId, status: 'ACTIVE' },
            select: { id: true, draftId: true, expiresAt: true },
            orderBy: [{ expiresAt: 'asc' }], take: 300,
        });

        const expiredGrantCandidates = grants
            .filter((g) => g.expiresAt < new Date())
            .map((g) => ({ grantId: g.id, draftId: g.draftId, expiresAt: g.expiresAt }));

        return {
            window: query?.window ?? '24h', policy,
            recommendations: { promoteDraftCandidates, staleDraftCandidates, expiredGrantCandidates },
            metrics: { totalRoutingLogs: (routingLogs ?? []).length, uniqueDraftHits: draftHitMap.size, uniqueSkillCodeHits: skillCodeHitMap.size },
        };
    }

    async applyEphemeralCapabilityEvolutionPlan(userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d' }) {
        const plan = await this.getEphemeralCapabilityEvolutionPlan(userId, sessionId, query);
        if (!plan) return null;

        const now = new Date();
        const expiredGrantIds = plan.recommendations.expiredGrantCandidates.map((i) => i.grantId);
        const staleDraftIds = plan.recommendations.staleDraftCandidates.map((i) => i.draftId);

        const expiredGrantResult = expiredGrantIds.length
            ? await this.prisma.agentSkillRuntimeGrant.updateMany({ where: { id: { in: expiredGrantIds }, status: 'ACTIVE' }, data: { status: 'EXPIRED' } })
            : { count: 0 };

        const staleDraftResult = staleDraftIds.length
            ? await this.prisma.agentSkillDraft.updateMany({ where: { id: { in: staleDraftIds }, provisionalEnabled: true }, data: { provisionalEnabled: false } })
            : { count: 0 };

        const promotionTaskCount = await this.createPromotionTaskAssets(sessionId, plan.recommendations.promoteDraftCandidates, plan.window as '1h' | '24h' | '7d');

        await this.assetService.createAsset({
            sessionId, assetType: 'NOTE', title: '临时能力进化执行记录',
            payload: {
                checkedAt: now.toISOString(), expiredGrantCount: expiredGrantResult.count,
                disabledDraftCount: staleDraftResult.count, promoteSuggestionCount: plan.recommendations.promoteDraftCandidates.length,
                promotionTaskCount, window: plan.window,
            },
            tags: { housekeeping: true, evolution: true },
        });

        return {
            checkedAt: now.toISOString(), window: plan.window,
            expiredGrantCount: expiredGrantResult.count, disabledDraftCount: staleDraftResult.count,
            promoteSuggestionCount: plan.recommendations.promoteDraftCandidates.length, promotionTaskCount,
        };
    }

    // ── 晋升任务 ──────────────────────────────────────────────────────────────

    async listEphemeralCapabilityPromotionTasks(
        userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d'; status?: string },
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId }, select: { id: true },
        });
        if (!session) return null;

        const createdAfter = this.skillService.resolveRoutingWindowStart(query?.window);
        const statusFilter = this.normalizePromotionTaskStatus(query?.status);
        const assets = await this.prisma.conversationAsset.findMany({
            where: { sessionId, assetType: 'NOTE', title: { startsWith: '能力晋升任务' }, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            orderBy: [{ createdAt: 'desc' }], take: 300,
        });

        const parsed = assets.map((a) => this.toPromotionTask(a)).filter((i): i is NonNullable<typeof i> => Boolean(i));
        const draftIds = parsed.map((i) => i.draftId).filter((v): v is string => Boolean(v));
        const uniqueDraftIds = Array.from(new Set(draftIds));
        const drafts = uniqueDraftIds.length
            ? await this.prisma.agentSkillDraft.findMany({ where: { id: { in: uniqueDraftIds } }, select: { id: true, status: true, publishedSkillId: true, updatedAt: true } })
            : [];
        const draftMap = new Map(drafts.map((i) => [i.id, i]));

        const enriched = parsed.map((item) => {
            const draft = item.draftId ? draftMap.get(item.draftId) : null;
            return { ...item, draftStatus: draft?.status ?? null, publishedSkillId: item.publishedSkillId ?? draft?.publishedSkillId ?? null, draftUpdatedAt: draft?.updatedAt ?? null };
        });

        return statusFilter ? enriched.filter((i) => i.status === statusFilter) : enriched;
    }

    async getEphemeralCapabilityPromotionTaskSummary(userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d' }) {
        const tasks = await this.listEphemeralCapabilityPromotionTasks(userId, sessionId, query);
        if (!tasks) return null;

        const statusStats = new Map<string, number>();
        const draftStatusStats = new Map<string, number>();
        let publishedLinkedCount = 0;
        let pendingActionCount = 0;

        for (const item of tasks) {
            statusStats.set(item.status, (statusStats.get(item.status) ?? 0) + 1);
            const ds = this.utils.pickString(item.draftStatus) ?? 'UNKNOWN';
            draftStatusStats.set(ds, (draftStatusStats.get(ds) ?? 0) + 1);
            if (item.publishedSkillId) publishedLinkedCount += 1;
            if (['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED'].includes(item.status)) pendingActionCount += 1;
        }

        const toSorted = (m: Map<string, number>) => Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
        return { window: query?.window ?? '24h', totalTasks: tasks.length, pendingActionCount, publishedLinkedCount, stats: { byStatus: toSorted(statusStats), byDraftStatus: toSorted(draftStatusStats) } };
    }

    async updateEphemeralCapabilityPromotionTask(userId: string, sessionId: string, taskAssetId: string, dto: { action: string; comment?: string }) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId }, select: { id: true } });
        if (!session) return null;

        const taskAsset = await this.prisma.conversationAsset.findFirst({ where: { id: taskAssetId, sessionId, assetType: 'NOTE' } });
        if (!taskAsset || !taskAsset.title.startsWith('能力晋升任务')) {
            throw new BadRequestException({ code: 'CONV_PROMOTION_TASK_NOT_FOUND', message: '能力晋升任务不存在或不属于当前会话' });
        }

        const action = String(dto.action || '').toUpperCase() as PromotionTaskAction;
        const currentPayload = this.utils.toRecord(taskAsset.payload);
        const currentStatus = this.normalizePromotionTaskStatus(currentPayload.status) ?? 'PENDING_REVIEW';
        const nextPayload: Record<string, unknown> = { ...currentPayload };
        const draftId = this.utils.pickString(currentPayload.draftId);
        const draft = draftId ? await this.prisma.agentSkillDraft.findUnique({ where: { id: draftId }, select: { id: true, status: true, publishedSkillId: true } }) : null;

        const resolveStatusByDraft = (status: string | null | undefined): PromotionTaskStatus => {
            if (status === 'PUBLISHED') return 'PUBLISHED';
            if (status === 'APPROVED') return 'APPROVED';
            if (status === 'REJECTED') return 'REJECTED';
            return 'IN_REVIEW';
        };

        let nextStatus: PromotionTaskStatus = currentStatus;
        if (action === 'START_REVIEW') nextStatus = 'IN_REVIEW';
        else if (action === 'MARK_APPROVED') nextStatus = 'APPROVED';
        else if (action === 'MARK_REJECTED') nextStatus = 'REJECTED';
        else if (action === 'MARK_PUBLISHED') {
            if (!draft?.publishedSkillId) throw new BadRequestException({ code: 'CONV_PROMOTION_TASK_PUBLISH_BLOCKED', message: '该草稿尚未发布，请先完成发布后再标记为已发布' });
            nextStatus = 'PUBLISHED';
            nextPayload.publishedSkillId = draft.publishedSkillId;
        } else if (action === 'SYNC_DRAFT_STATUS') {
            nextStatus = resolveStatusByDraft(draft?.status);
            nextPayload.publishedSkillId = draft?.publishedSkillId ?? this.utils.pickString(currentPayload.publishedSkillId);
        } else {
            throw new BadRequestException({ code: 'CONV_PROMOTION_TASK_ACTION_INVALID', message: '不支持的能力晋升任务操作' });
        }

        nextPayload.status = nextStatus;
        nextPayload.lastAction = action;
        nextPayload.lastActionAt = new Date().toISOString();
        nextPayload.lastActionBy = userId;
        if (dto.comment?.trim()) nextPayload.lastComment = dto.comment.trim();

        const updated = await this.prisma.conversationAsset.update({ where: { id: taskAsset.id }, data: { payload: nextPayload as Prisma.InputJsonValue } });

        await this.assetService.createAsset({
            sessionId, assetType: 'NOTE',
            title: `能力晋升任务状态变更 ${this.utils.pickString(currentPayload.suggestedSkillCode) ?? ''}`.trim(),
            payload: { taskAssetId: taskAsset.id, draftId, action, fromStatus: currentStatus, toStatus: nextStatus, comment: dto.comment?.trim() || null },
            tags: { taskType: 'PROMOTION_TASK', taskAssetId: taskAsset.id },
        });

        return { task: this.toPromotionTask(updated) };
    }

    async batchUpdateEphemeralCapabilityPromotionTasks(
        userId: string, sessionId: string,
        dto: { action: string; comment?: string; taskAssetIds?: string[]; window?: '1h' | '24h' | '7d'; status?: string; maxConcurrency?: number; maxRetries?: number; sourceBatchAssetId?: string },
    ) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId }, select: { id: true } });
        if (!session) return null;

        const explicitTaskIds = Array.isArray(dto.taskAssetIds) ? dto.taskAssetIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
        const taskIds = explicitTaskIds.length
            ? explicitTaskIds
            : (await this.listEphemeralCapabilityPromotionTasks(userId, sessionId, { window: dto.window, status: dto.status }))
                ?.map((i) => i.taskAssetId).filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];

        const uniqueTaskIds = Array.from(new Set(taskIds));
        const succeeded: Array<{ taskAssetId: string; status: string }> = [];
        const failed: Array<{ taskAssetId: string; code?: string; message: string }> = [];
        const maxConcurrency = this.normalizeBatchConcurrency(dto.maxConcurrency);
        const maxRetries = this.normalizeBatchRetry(dto.maxRetries);

        const runUpdateWithRetry = async (taskAssetId: string) => {
            let attempt = 0;
            while (attempt <= maxRetries) {
                try {
                    const updated = await this.updateEphemeralCapabilityPromotionTask(userId, sessionId, taskAssetId, { action: dto.action, comment: dto.comment });
                    const status = this.utils.pickString(updated?.task?.status) ?? 'UNKNOWN';
                    succeeded.push({ taskAssetId, status });
                    return;
                } catch (error) {
                    if (attempt >= maxRetries || error instanceof BadRequestException || !this.isTransientPromotionBatchError(error)) throw error;
                    attempt += 1;
                }
            }
        };

        let cursor = 0;
        const workerCount = Math.min(maxConcurrency, Math.max(uniqueTaskIds.length, 1));
        const workers = Array.from({ length: workerCount }).map(async () => {
            while (cursor < uniqueTaskIds.length) {
                const taskAssetId = uniqueTaskIds[cursor]; cursor += 1;
                try { await runUpdateWithRetry(taskAssetId); }
                catch (error) {
                    if (error instanceof BadRequestException) {
                        const response = error.getResponse() as Record<string, unknown>;
                        failed.push({ taskAssetId, code: this.utils.pickString(response.code) ?? undefined, message: this.utils.pickString(response.message) ?? '批量更新失败' });
                    } else { failed.push({ taskAssetId, message: error instanceof Error ? error.message : String(error) }); }
                }
            }
        });
        await Promise.all(workers);

        const batchId = randomUUID();
        const batchAsset = await this.assetService.createAsset({
            sessionId, assetType: 'NOTE', title: `能力晋升批次 ${dto.action} ${batchId.slice(0, 8)}`,
            payload: {
                batchId, action: dto.action, sourceBatchAssetId: dto.sourceBatchAssetId ?? null,
                requestedCount: uniqueTaskIds.length, succeededCount: succeeded.length, failedCount: failed.length,
                maxConcurrency, maxRetries, window: dto.window ?? null, statusFilter: dto.status ?? null, failed, generatedAt: new Date().toISOString(),
            },
            tags: { taskType: 'PROMOTION_TASK_BATCH', batchId },
        });

        return { action: dto.action, batchId, batchAssetId: batchAsset.id, requestedCount: uniqueTaskIds.length, succeededCount: succeeded.length, failedCount: failed.length, succeeded, failed };
    }

    async listEphemeralCapabilityPromotionTaskBatches(
        userId: string, sessionId: string, query?: { window?: '1h' | '24h' | '7d'; action?: string; limit?: number },
    ) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId }, select: { id: true } });
        if (!session) return null;

        const createdAfter = this.skillService.resolveRoutingWindowStart(query?.window);
        const actionFilter = this.utils.pickString(query?.action)?.toUpperCase();
        const limitValue = this.utils.normalizeNumber(query?.limit);
        const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 100) : 20;

        const assets = await this.prisma.conversationAsset.findMany({
            where: { sessionId, assetType: 'NOTE', title: { startsWith: '能力晋升批次' }, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            orderBy: [{ createdAt: 'desc' }], take: limit,
        });

        const batches = assets.map((a) => this.toPromotionTaskBatch(a)).filter((i): i is NonNullable<typeof i> => Boolean(i));
        return actionFilter ? batches.filter((i) => i.action === actionFilter) : batches;
    }

    async replayFailedEphemeralCapabilityPromotionTaskBatch(
        userId: string, sessionId: string, batchAssetId: string,
        dto?: { maxConcurrency?: number; maxRetries?: number; replayMode?: 'RETRYABLE_ONLY' | 'ALL_FAILED'; errorCodes?: string[] },
    ) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId }, select: { id: true } });
        if (!session) return null;

        const batchAsset = await this.prisma.conversationAsset.findFirst({ where: { id: batchAssetId, sessionId, assetType: 'NOTE' }, select: { id: true, title: true, payload: true } });
        if (!batchAsset || !batchAsset.title.startsWith('能力晋升批次')) {
            throw new BadRequestException({ code: 'CONV_PROMOTION_BATCH_NOT_FOUND', message: '能力晋升批次不存在或不属于当前会话' });
        }

        const payload = this.utils.toRecord(batchAsset.payload);
        const action = this.utils.pickString(payload.action)?.toUpperCase();
        if (!action) throw new BadRequestException({ code: 'CONV_PROMOTION_BATCH_INVALID', message: '能力晋升批次缺少动作信息，无法重放' });

        const replayMode = dto?.replayMode === 'ALL_FAILED' ? 'ALL_FAILED' : 'RETRYABLE_ONLY';
        const policy = await this.skillService.resolveEphemeralCapabilityPolicy(userId);
        const requestedErrorCodes = Array.isArray(dto?.errorCodes)
            ? dto.errorCodes.map((i) => this.utils.pickString(i)?.toUpperCase()).filter((i): i is string => Boolean(i)) : [];

        const failedItems = this.utils.toArray(payload.failed).map((i) => this.utils.toRecord(i))
            .map((i) => ({ taskAssetId: this.utils.pickString(i.taskAssetId), code: this.utils.pickString(i.code), message: this.utils.pickString(i.message) }))
            .filter((i) => Boolean(i.taskAssetId));

        const selectedFailedItems = replayMode === 'ALL_FAILED' ? failedItems : failedItems.filter((i) => this.isRetryablePromotionFailure(i.code, i.message, policy));
        const finalSelectedFailedItems = requestedErrorCodes.length ? selectedFailedItems.filter((i) => requestedErrorCodes.includes((i.code ?? 'UNKNOWN').toUpperCase())) : selectedFailedItems;
        const taskAssetIds = Array.from(new Set(finalSelectedFailedItems.map((i) => i.taskAssetId).filter((v): v is string => Boolean(v))));

        const replayResult = await this.batchUpdateEphemeralCapabilityPromotionTasks(userId, sessionId, {
            action, comment: `重放失败任务（来源批次 ${batchAsset.id}，模式 ${replayMode}）`,
            taskAssetIds, maxConcurrency: dto?.maxConcurrency, maxRetries: dto?.maxRetries, sourceBatchAssetId: batchAsset.id,
        });

        return { sourceBatchAssetId: batchAsset.id, sourceAction: action, sourceFailedCount: failedItems.length, selectedReplayCount: taskAssetIds.length, replayMode, selectedErrorCodes: requestedErrorCodes, replayResult };
    }

    // ── 路由摘要 ──────────────────────────────────────────────────────────────

    async getCapabilityRoutingSummary(userId: string, sessionId: string, query?: { limit?: number; window?: '1h' | '24h' | '7d' }) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId }, select: { id: true } });
        if (!session) return null;

        const effectiveCapabilityRoutingPolicy = await this.skillService.resolveCapabilityRoutingPolicy(userId);
        const effectiveEphemeralCapabilityPolicy = await this.skillService.resolveEphemeralCapabilityPolicy(userId);
        const limit = Math.max(20, Math.min(500, query?.limit ?? 200));
        const createdAfter = this.skillService.resolveRoutingWindowStart(query?.window);

        const notes = await this.prisma.conversationAsset.findMany({
            where: { sessionId, assetType: 'NOTE', title: { startsWith: '能力路由日志' }, ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}) },
            orderBy: [{ createdAt: 'desc' }], take: limit,
        });

        const routeTypeStats = new Map<string, number>();
        const selectedSourceStats = new Map<string, number>();
        const trendBuckets = new Map<string, { total: number; byRouteType: Record<string, number> }>();

        for (const item of notes) {
            const p = this.utils.toRecord(item.payload);
            const rt = this.utils.pickString(p.routeType) ?? 'UNKNOWN';
            const ss = this.utils.pickString(p.selectedSource) ?? 'UNKNOWN';
            routeTypeStats.set(rt, (routeTypeStats.get(rt) ?? 0) + 1);
            selectedSourceStats.set(ss, (selectedSourceStats.get(ss) ?? 0) + 1);
            const bk = item.createdAt.toISOString().slice(0, 13);
            const bucket = trendBuckets.get(bk) ?? { total: 0, byRouteType: {} };
            bucket.total += 1; bucket.byRouteType[rt] = (bucket.byRouteType[rt] ?? 0) + 1;
            trendBuckets.set(bk, bucket);
        }

        const toSorted = (m: Map<string, number>) => Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
        const trend = Array.from(trendBuckets.entries()).map(([bucket, v]) => ({ bucket, total: v.total, byRouteType: v.byRouteType })).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

        return {
            sampleWindow: { window: query?.window ?? '24h', totalLogs: notes.length, analyzedLimit: limit },
            effectivePolicies: { capabilityRoutingPolicy: effectiveCapabilityRoutingPolicy, ephemeralCapabilityPolicy: effectiveEphemeralCapabilityPolicy },
            stats: { routeType: toSorted(routeTypeStats), selectedSource: toSorted(selectedSourceStats) }, trend,
        };
    }

    // ── 资产复用 ──────────────────────────────────────────────────────────────

    async reuseAsset(userId: string, sessionId: string, assetId: string, dto: ReuseConversationAssetDto) {
        const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, ownerUserId: userId } });
        if (!session) return null;
        const asset = await this.prisma.conversationAsset.findFirst({ where: { id: assetId, sessionId } });
        if (!asset) return null;
        // reuseAsset 需要调用 createTurn，这里返回必要信息让 Facade 调用
        return {
            message: dto.message?.trim() || `请基于资产「${asset.title}」继续处理。`,
            contextPatch: { ...(dto.contextPatch ?? {}), reusedAssetId: asset.id },
        };
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    private async createPromotionTaskAssets(
        sessionId: string,
        candidates: Array<{ draftId: string; suggestedSkillCode: string; hitCount: number; reason: string }>,
        window: '1h' | '24h' | '7d',
    ): Promise<number> {
        if (!candidates.length) return 0;

        const existing = await this.prisma.conversationAsset.findMany({
            where: { sessionId, assetType: 'NOTE', title: { startsWith: '能力晋升任务' } },
            select: { payload: true }, take: 500, orderBy: [{ createdAt: 'desc' }],
        });

        const existingDraftIds = new Set<string>();
        for (const item of existing) {
            const draftId = this.utils.pickString(this.utils.toRecord(item.payload).draftId);
            if (draftId) existingDraftIds.add(draftId);
        }

        let created = 0;
        for (const candidate of candidates) {
            if (existingDraftIds.has(candidate.draftId)) continue;
            await this.assetService.createAsset({
                sessionId, assetType: 'NOTE', title: `能力晋升任务 ${candidate.suggestedSkillCode}`,
                payload: { draftId: candidate.draftId, suggestedSkillCode: candidate.suggestedSkillCode, hitCount: candidate.hitCount, reason: candidate.reason, window, status: 'PENDING_REVIEW', generatedAt: new Date().toISOString() },
                tags: { taskType: 'PROMOTION_TASK', draftId: candidate.draftId },
            });
            created += 1;
        }
        return created;
    }

    private normalizePromotionTaskStatus(input: unknown): PromotionTaskStatus | null {
        const value = this.utils.pickString(input)?.toUpperCase();
        if (!value) return null;
        if (['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(value)) return value as PromotionTaskStatus;
        return null;
    }

    private normalizeBatchConcurrency(input: unknown): number {
        const value = this.utils.normalizeNumber(input);
        if (!Number.isFinite(value) || value <= 0) return 4;
        return Math.min(Math.max(Math.floor(value), 1), 12);
    }

    private normalizeBatchRetry(input: unknown): number {
        const value = this.utils.normalizeNumber(input);
        if (!Number.isFinite(value) || value < 0) return 1;
        return Math.min(Math.max(Math.floor(value), 0), 3);
    }

    private isTransientPromotionBatchError(error: unknown): boolean {
        if (!error || error instanceof BadRequestException) return false;
        const errorText = error instanceof Error ? error.message : String(error);
        return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout/i.test(errorText);
    }

    private isRetryablePromotionFailure(code: string | null, message: string | null, policy?: EphemeralCapabilityPolicy): boolean {
        const normalizedCode = (code ?? '').toUpperCase();
        const blocklist = policy?.replayNonRetryableErrorCodeBlocklist ?? [
            'CONV_PROMOTION_TASK_NOT_FOUND', 'CONV_PROMOTION_TASK_ACTION_INVALID',
            'CONV_PROMOTION_TASK_PUBLISH_BLOCKED', 'SKILL_REVIEWER_CONFLICT', 'SKILL_HIGH_RISK_REVIEW_REQUIRED',
        ];
        if (blocklist.includes(normalizedCode)) return false;
        const allowlist = policy?.replayRetryableErrorCodeAllowlist ?? [];
        if (allowlist.includes(normalizedCode)) return true;
        const text = `${code ?? ''} ${message ?? ''}`;
        return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout|429|5\d{2}/i.test(text);
    }

    private toPromotionTask(asset: { id: string; title: string; payload: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
        const payload = this.utils.toRecord(asset.payload);
        const status = this.normalizePromotionTaskStatus(payload.status);
        const draftId = this.utils.pickString(payload.draftId);
        const suggestedSkillCode = this.utils.pickString(payload.suggestedSkillCode);
        const hitCount = this.utils.normalizeNumber(payload.hitCount);
        if (!draftId || !suggestedSkillCode) return null;
        return {
            taskAssetId: asset.id, title: asset.title, draftId, suggestedSkillCode,
            hitCount: Number.isFinite(hitCount) ? hitCount : 0,
            reason: this.utils.pickString(payload.reason), window: this.utils.pickString(payload.window),
            status: status ?? 'PENDING_REVIEW', generatedAt: this.utils.pickString(payload.generatedAt),
            lastAction: this.utils.pickString(payload.lastAction), lastActionAt: this.utils.pickString(payload.lastActionAt),
            lastActionBy: this.utils.pickString(payload.lastActionBy), lastComment: this.utils.pickString(payload.lastComment),
            publishedSkillId: this.utils.pickString(payload.publishedSkillId),
            createdAt: asset.createdAt, updatedAt: asset.updatedAt,
        };
    }

    private toPromotionTaskBatch(asset: { id: string; title: string; payload: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
        const payload = this.utils.toRecord(asset.payload);
        const action = this.utils.pickString(payload.action)?.toUpperCase();
        if (!action) return null;
        const failed = this.utils.toArray(payload.failed).map((i) => this.utils.toRecord(i))
            .map((i) => ({ taskAssetId: this.utils.pickString(i.taskAssetId), code: this.utils.pickString(i.code), message: this.utils.pickString(i.message) ?? '批次处理失败' }))
            .filter((i) => Boolean(i.taskAssetId));
        return {
            batchAssetId: asset.id, batchId: this.utils.pickString(payload.batchId) ?? asset.id, title: asset.title, action,
            requestedCount: this.utils.normalizeNumber(payload.requestedCount), succeededCount: this.utils.normalizeNumber(payload.succeededCount),
            failedCount: this.utils.normalizeNumber(payload.failedCount), maxConcurrency: this.utils.normalizeNumber(payload.maxConcurrency),
            maxRetries: this.utils.normalizeNumber(payload.maxRetries), window: this.utils.pickString(payload.window),
            statusFilter: this.utils.pickString(payload.statusFilter), sourceBatchAssetId: this.utils.pickString(payload.sourceBatchAssetId),
            failed, generatedAt: this.utils.pickString(payload.generatedAt), createdAt: asset.createdAt, updatedAt: asset.updatedAt,
        };
    }
}
