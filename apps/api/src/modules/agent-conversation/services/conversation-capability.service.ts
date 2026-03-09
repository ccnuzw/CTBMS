import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  CreateSkillDraftDto,
} from '@packages/types';
import { PrismaService } from '../../../prisma';

type PromotionTaskStatus = 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
type PromotionTaskAction =
  | 'START_REVIEW'
  | 'MARK_APPROVED'
  | 'MARK_REJECTED'
  | 'MARK_PUBLISHED'
  | 'SYNC_DRAFT_STATUS';

interface CapabilityRoutingPolicy {
  allowOwnerPool: boolean;
  allowPublicPool: boolean;
  preferOwnerFirst: boolean;
  minOwnerScore: number;
  minPublicScore: number;
}

interface EphemeralCapabilityPolicy {
  draftSemanticReuseThreshold: number;
  publishedSkillReuseThreshold: number;
  runtimeGrantTtlHours: number;
  runtimeGrantMaxUseCount: number;
  replayRetryableErrorCodeAllowlist: string[];
  replayNonRetryableErrorCodeBlocklist: string[];
}

/**
 * Delegate interface for cross-service calls.
 */
export interface ConversationCapabilityDelegate {
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
  batchUpdateEphemeralCapabilityPromotionTasks(
    userId: string,
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

@Injectable()
export class ConversationCapabilityService {
  private readonly logger = new Logger(ConversationCapabilityService.name);
  private delegate?: ConversationCapabilityDelegate;

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  setDelegate(delegate: ConversationCapabilityDelegate) {
    this.delegate = delegate;
  }

  private getDelegate(): ConversationCapabilityDelegate {
    if (!this.delegate) {
      throw new Error('ConversationCapabilityService delegate not set');
    }
    return this.delegate;
  }

  // Utility methods used by extracted methods
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

  private toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private normalizeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
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
    const staleDraftBefore = new Date(
      now.getTime() - effectivePolicy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000,
    );

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
      skillCodeStats.set(
        draft.suggestedSkillCode,
        (skillCodeStats.get(draft.suggestedSkillCode) ?? 0) + 1,
      );
    }
    for (const grant of grants) {
      grantStatusStats.set(grant.status, (grantStatusStats.get(grant.status) ?? 0) + 1);
    }

    const expiringIn24h = grants.filter(
      (grant) =>
        grant.status === 'ACTIVE' &&
        grant.expiresAt > now &&
        grant.expiresAt <= new Date(now.getTime() + 24 * 60 * 60 * 1000),
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
    const staleDraftBefore = new Date(
      now.getTime() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000,
    );

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

    await this.getDelegate().createConversationAsset({
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
    const staleDraftBefore = new Date(
      Date.now() - policy.runtimeGrantTtlHours * 3 * 60 * 60 * 1000,
    );

    const routingLogs = await this.listCapabilityRoutingLogs(userId, sessionId, {
      routeType: 'SKILL_DRAFT_REUSE',
      limit: 300,
      window: query?.window,
    });

    const draftHitMap = new Map<string, number>();
    const skillCodeHitMap = new Map<string, number>();
    for (const log of routingLogs ?? []) {
      const draftId = this.pickString((log as unknown as Record<string, unknown>).selectedDraftId);
      const skillCode = this.pickString(
        (log as unknown as Record<string, unknown>).selectedSkillCode,
      );
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

  async applyEphemeralCapabilityEvolutionPlan(
    userId: string,
    sessionId: string,
    query?: { window?: '1h' | '24h' | '7d' },
  ) {
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

    await this.getDelegate().createConversationAsset({
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
      : ((
        await this.listEphemeralCapabilityPromotionTasks(userId, sessionId, {
          window: dto.window,
          status: dto.status,
        })
      )
        ?.map((item) => item.taskAssetId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0) ?? []);

    const uniqueTaskIds = Array.from(new Set(taskIds));
    const succeeded: Array<{ taskAssetId: string; status: string }> = [];
    const failed: Array<{ taskAssetId: string; code?: string; message: string }> = [];
    const maxConcurrency = this.normalizeBatchConcurrency(dto.maxConcurrency);
    const maxRetries = this.normalizeBatchRetry(dto.maxRetries);

    const runUpdateOnce = async (taskAssetId: string) => {
      const updated = await this.updateEphemeralCapabilityPromotionTask(
        userId,
        sessionId,
        taskAssetId,
        {
          action: dto.action,
          comment: dto.comment,
        },
      );
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
    const batchAsset = await this.getDelegate().createConversationAsset({
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
    const limit = Number.isFinite(limitValue)
      ? Math.min(Math.max(Math.floor(limitValue), 1), 100)
      : 20;

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
        : failedItems.filter((item) =>
          this.isRetryablePromotionFailure(item.code, item.message, policy),
        );
    const finalSelectedFailedItems = requestedErrorCodes.length
      ? selectedFailedItems.filter((item) =>
        requestedErrorCodes.includes((item.code ?? 'UNKNOWN').toUpperCase()),
      )
      : selectedFailedItems;
    const taskAssetIds = Array.from(
      new Set(
        finalSelectedFailedItems
          .map((item) => item.taskAssetId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const replayResult = await this.getDelegate().batchUpdateEphemeralCapabilityPromotionTasks(
      userId,
      sessionId,
      {
        action,
        comment: `重放失败任务（来源批次 ${batchAsset.id}，模式 ${replayMode}）`,
        taskAssetIds,
        maxConcurrency: dto?.maxConcurrency,
        maxRetries: dto?.maxRetries,
        sourceBatchAssetId: batchAsset.id,
      },
    );

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
    const currentStatus =
      this.normalizePromotionTaskStatus(currentPayload.status) ?? 'PENDING_REVIEW';
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
      nextPayload.publishedSkillId =
        draft?.publishedSkillId ?? this.pickString(currentPayload.publishedSkillId);
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

    await this.getDelegate().createConversationAsset({
      sessionId,
      assetType: 'NOTE',
      title:
        `能力晋升任务状态变更 ${this.pickString(currentPayload.suggestedSkillCode) ?? ''}`.trim(),
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

  async createPromotionTaskAssets(
    sessionId: string,
    candidates: Array<{
      draftId: string;
      suggestedSkillCode: string;
      hitCount: number;
      reason: string;
    }>,
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
      await this.getDelegate().createConversationAsset({
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

  normalizePromotionTaskStatus(input: unknown): PromotionTaskStatus | null {
    const value = this.pickString(input)?.toUpperCase();
    if (!value) {
      return null;
    }
    if (['PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(value)) {
      return value as PromotionTaskStatus;
    }
    return null;
  }

  normalizeBatchConcurrency(input: unknown): number {
    const value = this.normalizeNumber(input);
    if (!Number.isFinite(value) || value <= 0) {
      return 4;
    }
    return Math.min(Math.max(Math.floor(value), 1), 12);
  }

  normalizeBatchRetry(input: unknown): number {
    const value = this.normalizeNumber(input);
    if (!Number.isFinite(value) || value < 0) {
      return 1;
    }
    return Math.min(Math.max(Math.floor(value), 0), 3);
  }

  isTransientPromotionBatchError(error: unknown): boolean {
    if (!error || error instanceof BadRequestException) {
      return false;
    }
    const errorText = error instanceof Error ? error.message : String(error);
    return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout/i.test(
      errorText,
    );
  }

  isRetryablePromotionFailure(
    code: string | null,
    message: string | null,
    policy?: EphemeralCapabilityPolicy,
  ): boolean {
    const normalizedCode = (code ?? '').toUpperCase();
    const blocklist = policy?.replayNonRetryableErrorCodeBlocklist ?? [
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
    return /fetch failed|timeout|temporarily unavailable|network|econnreset|etimedout|429|5\d{2}/i.test(
      text,
    );
  }

  toPromotionTask(asset: {
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

  toPromotionTaskBatch(asset: {
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

  resolveRoutingWindowStart(window?: '1h' | '24h' | '7d'): Date | null {
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

  async resolveCapabilityRoutingPolicy(userId: string): Promise<CapabilityRoutingPolicy> {
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
      const parsed =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
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

  async resolveEphemeralCapabilityPolicy(
    userId: string,
  ): Promise<EphemeralCapabilityPolicy> {
    const defaults: EphemeralCapabilityPolicy = {
      draftSemanticReuseThreshold: 0.72,
      publishedSkillReuseThreshold: 0.76,
      runtimeGrantTtlHours: 24,
      runtimeGrantMaxUseCount: 30,
      replayRetryableErrorCodeAllowlist: [
        'NETWORK_ERROR',
        'TIMEOUT',
        'FETCH_FAILED',
        'HTTP_429',
        'HTTP_5XX',
      ],
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
      const parsed =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.max(0, Math.min(1, parsed));
    };
    const toInt = (value: unknown, fallback: number, min: number, max: number) => {
      const parsed =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
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
      draftSemanticReuseThreshold: toScore(
        metadata.draftSemanticReuseThreshold,
        defaults.draftSemanticReuseThreshold,
      ),
      publishedSkillReuseThreshold: toScore(
        metadata.publishedSkillReuseThreshold,
        defaults.publishedSkillReuseThreshold,
      ),
      runtimeGrantTtlHours: toInt(
        metadata.runtimeGrantTtlHours,
        defaults.runtimeGrantTtlHours,
        1,
        168,
      ),
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

  async logCapabilityRoutingDecisionAsset(
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
    return this.getDelegate().createConversationAsset({
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

  computeRoutingDecisionKey(input: {
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

  async findReusableSkillDraft(
    ownerUserId: string,
    dto: CreateSkillDraftDto,
    policy: EphemeralCapabilityPolicy,
  ): Promise<{
    id: string;
    gapType: string;
    requiredCapability: string;
    suggestedSkillCode: string;
    status: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    provisionalEnabled: boolean;
    reuseReason: 'EXACT_CODE' | 'SEMANTIC_MATCH';
  } | null> {
    const normalizedCode = this.normalizeCapabilityText(dto.suggestedSkillCode);
    const capabilityTokens = this.extractCapabilityTokens(
      `${dto.gapType} ${dto.requiredCapability}`,
    );

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
      const draftTokens = this.extractCapabilityTokens(
        `${draft.gapType} ${draft.requiredCapability}`,
      );
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

  async findReusablePublishedSkill(
    ownerUserId: string,
    dto: CreateSkillDraftDto,
    policy: CapabilityRoutingPolicy,
    ephemeralPolicy: EphemeralCapabilityPolicy,
  ): Promise<{
    id: string;
    skillCode: string;
    name: string;
    description: string;
    templateSource: string;
    score: number;
  } | null> {
    const normalizedCode = this.normalizeCapabilityText(dto.suggestedSkillCode);
    const capabilityTokens = this.extractCapabilityTokens(
      `${dto.gapType} ${dto.requiredCapability}`,
    );
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

  async upsertPublishedSkillBridgeDraft(input: {
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

  async ensureRuntimeGrantForDraft(
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

  normalizeCapabilityText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  extractCapabilityTokens(value: string): string[] {
    const tokens = value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
    const unique = new Set(tokens.filter(Boolean));
    return Array.from(unique);
  }

  computeCapabilitySimilarity(baseTokens: string[], candidateTokens: string[]): number {
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

}
