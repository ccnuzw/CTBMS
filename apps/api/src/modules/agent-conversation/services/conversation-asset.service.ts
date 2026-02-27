/**
 * ConversationAssetService — 会话资产管理
 *
 * 职责：
 *   - 资产 CRUD（创建、查询、复用）
 *   - 显式引用提取 [asset:xxx]
 *   - 基于 followup 的序号引用解析
 *   - 基于语义的资产引用解析
 *   - 复用收据消息构建
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';

export type AssetType =
  | 'PLAN'
  | 'EXECUTION'
  | 'RESULT_SUMMARY'
  | 'EXPORT_FILE'
  | 'BACKTEST_SUMMARY'
  | 'CONFLICT_SUMMARY'
  | 'SKILL_DRAFT'
  | 'NOTE';

export type AssetReference = {
  assetIds: string[];
  resolution: Record<string, unknown> | null;
};

@Injectable()
export class ConversationAssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly utils: ConversationUtilsService,
  ) {}

  // ── Asset CRUD ─────────────────────────────────────────────────────────────

  async createAsset(input: {
    sessionId: string;
    assetType: AssetType;
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

  async listAssets(sessionId: string) {
    return this.prisma.conversationAsset.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── 显式引用提取 [asset:xxx] ────────────────────────────────────────────────

  extractAssetReferenceIds(message: string): string[] {
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
        if (this.utils.isUuid(id)) {
          ids.add(id);
        }
        match = pattern.exec(message);
      }
    }
    return Array.from(ids);
  }

  // ── Followup 引用解析（"用第2个"） ──────────────────────────────────────────

  async resolveFollowupAssetReference(
    sessionId: string,
    message: string,
  ): Promise<AssetReference> {
    const rank = this.extractOrdinalReference(message);
    if (!rank) {
      return { assetIds: [], resolution: null };
    }

    const roundOffset = this.extractFollowupRoundOffset(message);

    const assistants = await this.prisma.conversationTurn.findMany({
      where: { sessionId, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { structuredPayload: true },
    });

    const candidateTurns = assistants.filter((turn) => {
      const payload = this.utils.toRecord(turn.structuredPayload);
      const reuseResolution = this.utils.toRecord(payload.reuseResolution);
      const semanticResolution = this.utils.toRecord(reuseResolution.semanticResolution);
      const topCandidatesRaw = semanticResolution.topCandidates;
      return Array.isArray(topCandidatesRaw) && topCandidatesRaw.length > 0;
    });

    const selectedTurn =
      candidateTurns[Math.min(roundOffset, Math.max(candidateTurns.length - 1, 0))];
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

    const payload = this.utils.toRecord(selectedTurn.structuredPayload);
    const reuseResolution = this.utils.toRecord(payload.reuseResolution);
    const semanticResolution = this.utils.toRecord(reuseResolution.semanticResolution);
    const topCandidatesRaw = semanticResolution.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.utils.toRecord(item))
      : [];
    const selected = topCandidates[rank - 1];
    const selectedId = this.utils.pickString(selected?.id);
    if (selectedId && this.utils.isUuid(selectedId)) {
      return {
        assetIds: [selectedId],
        resolution: {
          mode: 'followup',
          roundOffset,
          requestedRank: rank,
          selectedAssetId: selectedId,
          selectedAssetTitle: this.utils.pickString(selected.title),
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

  // ── 语义引用解析（"基于上次分析"） ──────────────────────────────────────────

  async resolveSemanticAssetReferences(
    sessionId: string,
    message: string,
  ): Promise<AssetReference> {
    if (!this.shouldResolveSemanticAssetReference(message)) {
      return { assetIds: [], resolution: null };
    }

    const assetType = this.inferSemanticAssetType(message);
    const offset = this.inferSemanticAssetOffset(message);
    const explicitDisambiguated = offset > 0;

    const assets = await this.prisma.conversationAsset.findMany({
      where: { sessionId, assetType: assetType || undefined },
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
      select: { id: true, title: true, assetType: true, createdAt: true },
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
        return { ...asset, score: recencyScore + keywordScore + typeBonus };
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

  // ── 复用收据消息 ──────────────────────────────────────────────────────────

  buildReuseReceiptMessage(
    referencedAssets: Array<{ id: string; title: string; assetType: string }>,
    resolution?: Record<string, unknown>,
  ): string {
    const semantic = this.utils.toRecord(resolution?.semanticResolution);
    const followup = this.utils.toRecord(resolution?.followupResolution);
    const ambiguous = semantic.ambiguous === true;
    const candidateCount = this.utils.normalizeNumber(semantic.candidateCount);
    const topCandidatesRaw = semantic.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.utils.toRecord(item)).slice(0, 3)
      : [];

    if (!referencedAssets.length) {
      if (candidateCount === 0) {
        return '未匹配到可复用资产。你可以说"用最近一次回测结果"或直接使用 [asset:<id>]。';
      }
      return '';
    }

    const selected = referencedAssets[0];
    if (this.utils.pickString(followup.selectedAssetId)) {
      return `已按序号复用资产：${selected.title}。`;
    }
    if (ambiguous && candidateCount > 1) {
      const candidateTips = topCandidates
        .map(
          (item, index) =>
            `${index + 1}.${this.utils.pickString(item.title) || this.utils.pickString(item.id) || '-'}`,
        )
        .join('；');
      return `已为你匹配并复用资产：${selected.title}（候选 ${candidateCount} 项，已自动选择最相关项。可回复"用第2个"重新指定。候选：${candidateTips}）`;
    }
    return `已复用资产：${selected.title}。`;
  }

  // ── 全量引用聚合 ──────────────────────────────────────────────────────────

  async resolveAllReferences(
    sessionId: string,
    message: string,
    contextPatch?: Record<string, unknown>,
  ): Promise<{
    referencedAssets: Array<{ id: string; title: string; assetType: string }>;
    effectiveContextPatch: Record<string, unknown>;
  }> {
    const referencedAssetIds = this.extractAssetReferenceIds(message);
    const followupResolved = await this.resolveFollowupAssetReference(sessionId, message);
    const semanticResolved = await this.resolveSemanticAssetReferences(sessionId, message);
    const contextReferencedAssetId = this.utils.pickString(contextPatch?.reusedAssetId);

    const requestedAssetIds = [
      ...(contextReferencedAssetId ? [contextReferencedAssetId] : []),
      ...referencedAssetIds,
      ...followupResolved.assetIds,
      ...semanticResolved.assetIds,
    ]
      .filter((id): id is string => this.utils.isUuid(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const referencedAssets = requestedAssetIds.length
      ? await this.prisma.conversationAsset.findMany({
          where: { sessionId, id: { in: requestedAssetIds } },
          select: { id: true, title: true, assetType: true },
        })
      : [];

    const effectiveContextPatch: Record<string, unknown> = { ...(contextPatch ?? {}) };

    if (!effectiveContextPatch.reusedAssetId && referencedAssets.length > 0) {
      effectiveContextPatch.reusedAssetId = referencedAssets[0].id;
    }

    if (referencedAssets.length > 0) {
      effectiveContextPatch.reusedAssets = referencedAssets.map(
        (asset: { id: string; title: string; assetType: string }) => ({
          assetId: asset.id,
          title: asset.title,
          assetType: asset.assetType,
        }),
      );
      effectiveContextPatch.reuseResolution = {
        explicitAssetRefCount: referencedAssetIds.length,
        followupAssetRefCount: followupResolved.assetIds.length,
        semanticAssetRefCount: semanticResolved.assetIds.length,
        followupResolution: followupResolved.resolution,
        semanticResolution: semanticResolved.resolution,
      };
    }

    return { referencedAssets, effectiveContextPatch };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

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

  private inferSemanticAssetType(message: string): AssetType | null {
    if (message.includes('回测')) return 'BACKTEST_SUMMARY';
    if (message.includes('冲突')) return 'CONFLICT_SUMMARY';
    if (message.includes('导出') || message.includes('原文件') || message.includes('报告文件'))
      return 'EXPORT_FILE';
    if (message.includes('草稿') || message.toLowerCase().includes('skill')) return 'SKILL_DRAFT';
    if (message.includes('执行实例')) return 'EXECUTION';
    if (message.includes('计划')) return 'PLAN';
    if (message.includes('结果') || message.includes('结论') || message.includes('分析'))
      return 'RESULT_SUMMARY';
    return null;
  }

  private inferSemanticAssetOffset(message: string): number {
    if (
      message.includes('上上次') ||
      message.includes('倒数第二') ||
      message.includes('第二新')
    ) {
      return 1;
    }
    return 0;
  }

  private computeSemanticKeywordScore(message: string, title: string): number {
    const normalizedMessage = message.toLowerCase();
    const normalizedTitle = title.toLowerCase();
    const keywords = [
      '回测',
      '计划',
      '结果',
      '结论',
      '导出',
      '冲突',
      '草稿',
      '报告',
      'risk',
      'weekly',
    ];
    return keywords.reduce((score, keyword) => {
      if (normalizedMessage.includes(keyword) && normalizedTitle.includes(keyword)) {
        return score + 10;
      }
      return score;
    }, 0);
  }
}
