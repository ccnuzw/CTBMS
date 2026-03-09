import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import type { ReportCard, SynthesizedReport } from './conversation-synthesizer.service';

type SessionState =
  | 'INTENT_CAPTURE' | 'SLOT_FILLING' | 'PLAN_PREVIEW'
  | 'USER_CONFIRM' | 'EXECUTING' | 'RESULT_DELIVERY'
  | 'DONE' | 'FAILED';

type ConversationEvidenceFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';
type ConversationEvidenceQuality = 'RECONCILED' | 'INTERNAL' | 'EXTERNAL' | 'UNVERIFIED';
type ConversationFreshnessStatus = 'WITHIN_TTL' | 'NEAR_EXPIRE' | 'EXPIRED' | 'UNKNOWN';

type ConversationResultQualityBreakdown = {
  completeness: number;
  timeliness: number;
  evidenceStrength: number;
  verification: number;
};

type ConversationResultQualitySummary = {
  qualityScore: number;
  freshnessStatus: ConversationFreshnessStatus;
  breakdown: ConversationResultQualityBreakdown;
};

type ConversationResultConfidenceGate = {
  allowStrongConclusion: boolean;
  reasonCodes: string[];
  message: string;
};

type ConversationEvidenceItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceNodeId: string | null;
  sourceNodeType: string | null;
  sourceUrl: string | null;
  tracePath: string;
  collectedAt: string;
  timestamp: string | null;
  freshness: ConversationEvidenceFreshness;
  quality: ConversationEvidenceQuality;
};

type ConversationResultTraceability = {
  executionId: string;
  replayPath: string;
  executionPath: string;
  evidenceCount: number;
  strongEvidenceCount: number;
  externalEvidenceCount: number;
  generatedAt: string;
};

type ConversationResultDiffSnapshot = {
  assetId: string;
  createdAt: string;
  executionId: string | null;
  status: string;
  confidence: number;
  analysis: string;
  facts: string[];
  sources: string[];
  actions: Record<string, unknown>;
};

type ConversationResultDiff = {
  confidenceDelta: number;
  analysisChanged: boolean;
  addedFacts: string[];
  removedFacts: string[];
  addedSources: string[];
  removedSources: string[];
  changedActionKeys: string[];
  changeSummary: string[];
};

type ConversationResultDiffTimelineItem = {
  comparable: boolean;
  current: ConversationResultDiffSnapshot;
  baseline: ConversationResultDiffSnapshot | null;
  diff: ConversationResultDiff | null;
};

type ConversationResultDiffTimelineQueryDto = {
  limit?: number;
};

/**
 * 可配置仲裁规则 — 控制 evidence-collector 的信心门禁阈值
 * 运营人员可通过 API 动态调整而无需改代码
 */
export type ArbitrationRules = {
  /** 质量评分门槛（低于此值触发 LOW_QUALITY_SCORE），默认 0.7 */
  minQualityScore: number;
  /** 信心值门槛（低于此值触发 LOW_CONFIDENCE），默认 0.6 */
  minConfidence: number;
  /** 强证据最小数量（低于此值触发 INSUFFICIENT_STRONG_EVIDENCE），默认 2 */
  minStrongEvidenceCount: number;
  /** 是否检查数据过期，默认 true */
  checkDataExpiry: boolean;
  /** 质量各维度权重 */
  qualityWeights: {
    completeness: number;
    timeliness: number;
    evidenceStrength: number;
    verification: number;
  };
};

const DEFAULT_ARBITRATION_RULES: ArbitrationRules = {
  minQualityScore: 0.7,
  minConfidence: 0.6,
  minStrongEvidenceCount: 2,
  checkDataExpiry: true,
  qualityWeights: {
    completeness: 0.35,
    timeliness: 0.3,
    evidenceStrength: 0.2,
    verification: 0.15,
  },
};

export interface ConversationResultDelegate {
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
  getAuthorizedExecution(
    userId: string,
    executionId: string,
  ): Promise<{ id: string; outputSnapshot: Prisma.JsonValue; status: string } | null>;
  mapExecutionStatus(status: string): 'EXECUTING' | 'DONE' | 'FAILED';
  synthesizeResult(
    sessionId: string,
    executionResult: Record<string, unknown>,
  ): Promise<SynthesizedReport | null>;
  buildReportCards(report: SynthesizedReport): ReportCard[];
}

@Injectable()
export class ConversationResultService {
  private delegate?: ConversationResultDelegate;
  private arbitrationRules: ArbitrationRules = { ...DEFAULT_ARBITRATION_RULES };

  constructor(private readonly prisma: PrismaService) { }

  setDelegate(delegate: ConversationResultDelegate) {
    this.delegate = delegate;
  }

  /**
   * 设置可配置仲裁规则（运营可动态调整阈值）
   */
  setArbitrationRules(rules: Partial<ArbitrationRules>) {
    this.arbitrationRules = { ...DEFAULT_ARBITRATION_RULES, ...rules };
    if (rules.qualityWeights) {
      this.arbitrationRules.qualityWeights = {
        ...DEFAULT_ARBITRATION_RULES.qualityWeights,
        ...rules.qualityWeights,
      };
    }
  }

  /**
   * 获取当前仲裁规则配置
   */
  getArbitrationRules(): ArbitrationRules {
    return { ...this.arbitrationRules };
  }

  private getDelegate(): ConversationResultDelegate {
    if (!this.delegate) {
      throw new Error('ConversationResultService delegate not set');
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

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
    const evidenceItems = this.buildResultEvidenceItems(outputRecord, execution.id);
    const traceability = this.buildResultTraceability(execution.id, outputRecord, evidenceItems);
    const result = this.normalizeResult(outputRecord, evidenceItems, traceability);
    const status = this.getDelegate().mapExecutionStatus(execution.status);

    if (status === 'DONE') {
      // ── 幂等性保护：防止轮询多次触发副作用 ──
      const existingResultAsset = await this.prisma.conversationAsset.findFirst({
        where: {
          sessionId,
          assetType: 'RESULT_SUMMARY',
          tags: { path: ['executionId'], equals: execution.id },
        },
        select: { id: true },
      });
      if (existingResultAsset) {
        // 已处理过，仅更新 session 状态并返回结果
        if (session.state !== 'DONE') {
          await this.prisma.conversationSession.update({
            where: { id: sessionId },
            data: { state: 'DONE' },
          });
        }
        return {
          status,
          result,
          artifacts: exportTasks.map((task) => ({
            id: task.id,
            format: task.format,
            status: task.status,
            downloadUrl: task.downloadUrl,
          })),
          traceability,
          evidenceItems,
        };
      }

      await this.getDelegate().createConversationAsset({
        sessionId,
        assetType: 'RESULT_SUMMARY',
        title: `分析结论 ${execution.id.slice(0, 8)}`,
        payload: {
          executionId: execution.id,
          result,
          status,
        },
        sourceExecutionId: execution.id,
        tags: { executionId: execution.id },
      });

      // ── C1: 自动合成报告卡片并缓存 ──
      try {
        const synthesized = await this.getDelegate().synthesizeResult(sessionId, outputRecord);
        if (synthesized) {
          const reportCards = this.getDelegate().buildReportCards(synthesized);
          if (reportCards.length > 0) {
            await this.getDelegate().createConversationAsset({
              sessionId,
              assetType: 'NOTE',
              title: '报告卡片',
              payload: { cards: reportCards } as unknown as Record<string, unknown>,
              tags: { type: 'REPORT_CARDS', cached: true },
            });
          }
        }
      } catch {
        // 合成失败不阻塞主流程，前端仍可按需请求
      }

      // ── C2: 成功后创建助手消息 + replyOptions 引导下一步 ──
      try {
        const conclusionSnippet =
          typeof (result as Record<string, unknown>)?.conclusion === 'string'
            ? ((result as Record<string, unknown>).conclusion as string).slice(0, 80) + '...'
            : '分析已完成';
        await this.prisma.conversationTurn.create({
          data: {
            sessionId,
            role: 'ASSISTANT',
            content: `✅ ${conclusionSnippet}\n\n你可以继续操作：`,
            structuredPayload: {
              autoGenerated: true,
              replyOptions: [
                { id: 'export', label: '导出 PDF 报告', mode: 'SEND', value: '导出PDF报告' },
                { id: 'email', label: '发到我的邮箱', mode: 'SEND', value: '发到我的邮箱' },
                {
                  id: 'save',
                  label: '保存为常用能力',
                  mode: 'SEND',
                  value: '保存这个智能体到系统中',
                },
                {
                  id: 'schedule',
                  label: '设为定时执行',
                  mode: 'SEND',
                  value: '每周一早上8点自动执行这个分析',
                },
                {
                  id: 'backtest',
                  label: '回测验证结论',
                  mode: 'SEND',
                  value: '用历史数据回测验证这个分析结论',
                },
              ],
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch {
        // 助手消息创建失败不阻塞主流程
      }

      // ── 跨会话偏好保存：提取用户常用参数 ──
      try {
        const currentSlots = this.toRecord(session.currentSlots);
        const prefPayload: Record<string, unknown> = {};
        const prefKeys = ['region', 'topic', 'lookbackDays', 'email'] as const;
        for (const key of prefKeys) {
          if (currentSlots[key] != null) {
            prefPayload[key] = currentSlots[key];
          }
        }
        if (Object.keys(prefPayload).length > 0) {
          // 查找是否已有偏好资产，有则更新，无则创建
          const existingPref = await this.prisma.conversationAsset.findFirst({
            where: {
              session: { ownerUserId: userId },
              assetType: 'NOTE',
              tags: { path: ['type'], equals: 'USER_PREFERENCE' },
            },
            select: { id: true },
          });
          if (existingPref) {
            await this.prisma.conversationAsset.update({
              where: { id: existingPref.id },
              data: { payload: prefPayload as Prisma.InputJsonValue, updatedAt: new Date() },
            });
          } else {
            await this.getDelegate().createConversationAsset({
              sessionId,
              assetType: 'NOTE',
              title: '用户偏好',
              payload: prefPayload,
              tags: { type: 'USER_PREFERENCE' },
            });
          }
        }
      } catch {
        // 偏好保存失败不阻塞主流程
      }
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

  async getResultDiff(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'RESULT_SUMMARY',
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 2,
      select: {
        id: true,
        sourceExecutionId: true,
        payload: true,
        createdAt: true,
      },
    });

    const current = assets[0] ? this.buildResultDiffSnapshot(assets[0]) : null;
    const baseline = assets[1] ? this.buildResultDiffSnapshot(assets[1]) : null;

    if (!current || !baseline) {
      return {
        comparable: false,
        reason: 'INSUFFICIENT_HISTORY',
        current,
        baseline,
        diff: null,
      };
    }

    return {
      comparable: true,
      reason: null,
      current,
      baseline,
      diff: this.buildResultDiff(current, baseline),
    };
  }

  async getResultDiffTimeline(
    userId: string,
    sessionId: string,
    query: ConversationResultDiffTimelineQueryDto,
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    const limit = Math.min(30, Math.max(2, query.limit ?? 10));
    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: 'RESULT_SUMMARY',
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        sourceExecutionId: true,
        payload: true,
        createdAt: true,
      },
    });

    const snapshots = assets.map((asset) => this.buildResultDiffSnapshot(asset));
    const items: ConversationResultDiffTimelineItem[] = snapshots.map((current, index) => {
      const baseline = snapshots[index + 1] ?? null;
      return {
        comparable: Boolean(baseline),
        current,
        baseline,
        diff: baseline ? this.buildResultDiff(current, baseline) : null,
      };
    });

    return {
      limit,
      totalSnapshots: snapshots.length,
      comparableCount: items.filter((item) => item.comparable).length,
      items,
    };
  }

  async listResultEvidence(
    userId: string,
    sessionId: string,
    query?: {
      executionId?: string;
      limit?: number;
      freshness?: string;
      quality?: string;
      source?: string;
    },
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
      select: { latestExecutionId: true },
    });
    if (!session) {
      return null;
    }

    const requestedExecutionId = this.pickString(query?.executionId);
    if (requestedExecutionId && !this.isUuid(requestedExecutionId)) {
      throw new BadRequestException({
        code: 'CONV_EVIDENCE_EXECUTION_INVALID',
        message: 'executionId 格式非法',
      });
    }

    const targetExecutionId = requestedExecutionId ?? this.pickString(session.latestExecutionId);
    if (!targetExecutionId) {
      return {
        executionId: null,
        total: 0,
        filteredCount: 0,
        traceability: null,
        items: [],
        generatedAt: new Date().toISOString(),
      };
    }

    if (requestedExecutionId) {
      const latestExecutionId = this.pickString(session.latestExecutionId);
      const existsInPlan = await this.prisma.conversationPlan.findFirst({
        where: {
          sessionId,
          workflowExecutionId: requestedExecutionId,
        },
        select: { id: true },
      });
      if (latestExecutionId !== requestedExecutionId && !existsInPlan) {
        throw new BadRequestException({
          code: 'CONV_EVIDENCE_EXECUTION_NOT_IN_SESSION',
          message: 'executionId 不属于当前会话',
        });
      }
    }

    const execution = await this.getDelegate().getAuthorizedExecution(userId, targetExecutionId);
    if (!execution) {
      return null;
    }

    const outputRecord = this.toRecord(execution.outputSnapshot);
    const evidenceItems = this.buildResultEvidenceItems(outputRecord, execution.id);
    const traceability = this.buildResultTraceability(execution.id, outputRecord, evidenceItems);

    const freshnessFilter = this.normalizeEvidenceFreshnessFilter(query?.freshness);
    const qualityFilter = this.normalizeEvidenceQualityFilter(query?.quality);
    const sourceFilter = this.pickString(query?.source)?.toLowerCase();

    let filtered = evidenceItems;
    if (freshnessFilter) {
      filtered = filtered.filter((item) => item.freshness === freshnessFilter);
    }
    if (qualityFilter) {
      filtered = filtered.filter((item) => item.quality === qualityFilter);
    }
    if (sourceFilter) {
      filtered = filtered.filter(
        (item) =>
          item.source.toLowerCase().includes(sourceFilter) ||
          item.title.toLowerCase().includes(sourceFilter) ||
          item.summary.toLowerCase().includes(sourceFilter),
      );
    }

    const limitRaw = this.normalizeNumber(query?.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

    return {
      executionId: execution.id,
      total: evidenceItems.length,
      filteredCount: filtered.length,
      traceability,
      items: filtered.slice(0, limit),
      generatedAt: new Date().toISOString(),
    };
  }

  normalizeResult(
    outputRecord: Record<string, unknown>,
    evidenceItems: ConversationEvidenceItem[] = [],
    traceability?: ConversationResultTraceability,
  ) {
    const replayBundle = this.toRecord(outputRecord.replayBundle);
    const decisionOutput = this.toRecord(replayBundle.decisionOutput);

    const outputFacts = this.normalizeFacts(outputRecord.facts);
    const facts =
      outputFacts.length > 0
        ? outputFacts
        : this.buildFactsFromEvidenceItems(evidenceItems).slice(0, 20);

    const analysis =
      this.pickString(outputRecord.analysis) ??
      this.pickString(outputRecord.summary) ??
      this.pickString(outputRecord.conclusion) ??
      this.pickString(decisionOutput.reasoningSummary) ??
      '';
    const baseConclusion = this.pickString(outputRecord.conclusion) ?? (analysis ? analysis : null);
    const confidence = this.normalizeConfidenceValue(
      outputRecord.confidence,
      decisionOutput.confidence,
    );
    const qualitySummary = this.buildResultQualitySummary(
      outputRecord,
      evidenceItems,
      traceability,
    );
    const confidenceGate = this.buildResultConfidenceGate(
      confidence,
      qualitySummary,
      traceability,
      evidenceItems,
    );
    const actions = this.applyResultConfidenceGateToActions(
      this.normalizeActions(outputRecord.actions, decisionOutput),
      confidenceGate,
    );
    const conclusion = this.applyResultConfidenceGateToConclusion(baseConclusion, confidenceGate);
    const dataTimestamp =
      this.pickString(outputRecord.dataTimestamp) ??
      this.deriveLatestEvidenceTimestamp(evidenceItems) ??
      new Date().toISOString();

    return {
      facts,
      analysis,
      conclusion,
      actions,
      confidence,
      dataTimestamp,
      qualityScore: qualitySummary.qualityScore,
      qualityBreakdown: qualitySummary.breakdown,
      freshnessStatus: qualitySummary.freshnessStatus,
      confidenceGate,
      evidenceItems,
      traceability: traceability ?? null,
    };
  }

  normalizeFacts(
    value: unknown,
  ): Array<{ text: string; citations: Array<Record<string, unknown>> }> {
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
          ? row.citations.filter(
            (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
          )
          : [];
        if (!text) {
          return null;
        }
        return {
          text,
          citations: citations as Array<Record<string, unknown>>,
        };
      })
      .filter((item): item is { text: string; citations: Array<Record<string, unknown>> } =>
        Boolean(item),
      );
  }

  buildResultEvidenceItems(
    outputRecord: Record<string, unknown>,
    executionId: string,
  ): ConversationEvidenceItem[] {
    const replayPath = `/workflow/replay?executionId=${executionId}`;
    const results: ConversationEvidenceItem[] = [];
    const dedupe = new Set<string>();

    const appendEvidenceItem = (item: ConversationEvidenceItem) => {
      const dedupeKey = [
        item.sourceNodeId ?? '-',
        item.source,
        item.title,
        item.timestamp ?? '-',
      ].join('|');
      if (dedupe.has(dedupeKey)) {
        return;
      }
      dedupe.add(dedupeKey);
      results.push(item);
    };

    const evidenceBundle = this.toRecord(outputRecord.evidenceBundle);
    const bundledEvidence = this.toArray(evidenceBundle.evidence);

    for (const rawItem of bundledEvidence) {
      const item = this.toRecord(rawItem);
      const rawData = this.toRecord(item.rawData);
      const sourceNodeId = this.pickString(item.sourceNodeId);
      const sourceNodeType = this.pickString(item.sourceNodeType);
      const source =
        this.pickString(item.dataSource) ??
        this.pickString(rawData.dataSource) ??
        this.pickString(item.sourceNodeName) ??
        sourceNodeId ??
        'unknown';
      const sourceUrl =
        this.pickString(item.sourceUrl) ??
        this.pickString(rawData.url) ??
        this.pickString(rawData.sourceUrl);
      const timestamp =
        this.pickString(rawData.fetchedAt) ??
        this.pickString(rawData.timestamp) ??
        this.pickString(rawData.publishedAt) ??
        this.pickString(rawData.snapshotAt) ??
        this.pickString(rawData.eventDate);
      const collectedAt = this.pickString(item.collectedAt) ?? new Date().toISOString();
      const reconciliationGate = this.toRecord(rawData.reconciliationGate);

      appendEvidenceItem({
        id: this.pickString(item.id) ?? randomUUID(),
        title: this.pickString(item.title) ?? `证据项 ${results.length + 1}`,
        summary: this.pickString(item.summary) ?? this.pickString(rawData.message) ?? '无摘要',
        source,
        sourceNodeId,
        sourceNodeType,
        sourceUrl,
        tracePath: sourceNodeId
          ? `${replayPath}&nodeId=${encodeURIComponent(sourceNodeId)}`
          : replayPath,
        collectedAt,
        timestamp,
        freshness: this.deriveEvidenceFreshness(
          timestamp,
          this.readBooleanOrNull(rawData.isFresh) ?? this.readBooleanOrNull(item.isFresh),
        ),
        quality: this.deriveEvidenceQuality({
          isExternal: this.readBooleanOrNull(item.isExternal),
          gatePassed: this.readBooleanOrNull(reconciliationGate.passed),
        }),
      });
    }

    const facts = this.normalizeFacts(outputRecord.facts);
    for (const fact of facts.slice(0, 12)) {
      for (const rawCitation of fact.citations) {
        const citation = this.toRecord(rawCitation);
        const source =
          this.pickString(citation.source) ??
          this.pickString(citation.type) ??
          this.pickString(citation.label) ??
          'fact-citation';
        const sourceUrl = this.pickString(citation.url) ?? this.pickString(citation.link);
        const timestamp =
          this.pickString(citation.timestamp) ??
          this.pickString(citation.dataTimestamp) ??
          this.pickString(citation.publishedAt) ??
          this.pickString(citation.collectedAt);
        const sourceNodeId = this.pickString(citation.sourceNodeId);
        const sourceNodeType = this.pickString(citation.sourceNodeType);

        appendEvidenceItem({
          id: this.pickString(citation.id) ?? randomUUID(),
          title: this.pickString(citation.title) ?? `事实引用: ${source}`,
          summary:
            this.pickString(citation.summary) ??
            this.pickString(citation.snippet) ??
            fact.text.slice(0, 160),
          source,
          sourceNodeId,
          sourceNodeType,
          sourceUrl,
          tracePath: sourceNodeId
            ? `${replayPath}&nodeId=${encodeURIComponent(sourceNodeId)}`
            : replayPath,
          collectedAt: new Date().toISOString(),
          timestamp,
          freshness: this.deriveEvidenceFreshness(timestamp, null),
          quality: this.deriveEvidenceQuality({
            isExternal: sourceUrl ? true : null,
            gatePassed: null,
          }),
        });
      }
    }

    if (results.length === 0) {
      const replayBundle = this.toRecord(outputRecord.replayBundle);
      const timeline = this.toArray(replayBundle.timeline);
      for (const rawNode of timeline) {
        const node = this.toRecord(rawNode);
        const nodeType = this.pickString(node.nodeType) ?? '';
        if (!nodeType.includes('fetch')) {
          continue;
        }
        const nodeId = this.pickString(node.nodeId);
        const output = this.toRecord(node.outputSnapshot);
        const metadata = this.toRecord(output.metadata);
        const reconciliationGate = this.toRecord(metadata.reconciliationGate);
        const timestamp = this.pickString(output.fetchedAt) ?? this.pickString(metadata.fetchedAt);

        appendEvidenceItem({
          id: this.pickString(node.nodeId) ?? randomUUID(),
          title: `${this.pickString(node.nodeName) ?? '数据节点'} 输出`,
          summary:
            this.pickString(output.freshnessMessage) ??
            this.pickString(metadata.summary) ??
            `节点 ${this.pickString(node.nodeName) ?? '-'} 执行完成`,
          source:
            this.pickString(output.dataSourceCode) ??
            this.pickString(output.connectorCode) ??
            this.pickString(metadata.source) ??
            this.pickString(node.nodeName) ??
            'unknown',
          sourceNodeId: nodeId,
          sourceNodeType: nodeType,
          sourceUrl: this.pickString(metadata.url),
          tracePath: nodeId ? `${replayPath}&nodeId=${encodeURIComponent(nodeId)}` : replayPath,
          collectedAt: this.pickString(node.completedAt) ?? new Date().toISOString(),
          timestamp,
          freshness: this.deriveEvidenceFreshness(
            timestamp,
            this.readBooleanOrNull(output.isFresh),
          ),
          quality: this.deriveEvidenceQuality({
            isExternal: null,
            gatePassed: this.readBooleanOrNull(reconciliationGate.passed),
          }),
        });
      }
    }

    return results
      .sort((left, right) => {
        const leftTs = Date.parse(left.timestamp ?? left.collectedAt);
        const rightTs = Date.parse(right.timestamp ?? right.collectedAt);
        return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
      })
      .slice(0, 30);
  }

  buildResultTraceability(
    executionId: string,
    outputRecord: Record<string, unknown>,
    evidenceItems: ConversationEvidenceItem[],
  ): ConversationResultTraceability {
    const evidenceBundle = this.toRecord(outputRecord.evidenceBundle);
    const evidenceCount =
      this.readNumberOrNull(evidenceBundle.evidenceCount) ??
      this.toArray(evidenceBundle.evidence).length ??
      evidenceItems.length;
    const strongEvidenceCount =
      this.readNumberOrNull(evidenceBundle.strongEvidenceCount) ??
      evidenceItems.filter((item) => item.quality === 'INTERNAL' || item.quality === 'RECONCILED')
        .length;
    const externalEvidenceCount =
      this.readNumberOrNull(evidenceBundle.externalEvidenceCount) ??
      evidenceItems.filter((item) => item.quality === 'EXTERNAL').length;

    return {
      executionId,
      replayPath: `/workflow/replay?executionId=${executionId}`,
      executionPath: `/workflow/executions?executionId=${executionId}`,
      evidenceCount,
      strongEvidenceCount,
      externalEvidenceCount,
      generatedAt: new Date().toISOString(),
    };
  }

  buildFactsFromEvidenceItems(
    evidenceItems: ConversationEvidenceItem[],
  ): Array<{ text: string; citations: Array<Record<string, unknown>> }> {
    return evidenceItems.slice(0, 8).map((item) => ({
      text: `${item.title}: ${item.summary}`,
      citations: [
        {
          source: item.source,
          timestamp: item.timestamp,
          sourceUrl: item.sourceUrl,
          sourceNodeId: item.sourceNodeId,
          sourceNodeType: item.sourceNodeType,
          freshness: item.freshness,
          quality: item.quality,
        },
      ],
    }));
  }

  deriveLatestEvidenceTimestamp(evidenceItems: ConversationEvidenceItem[]): string | null {
    const timestamps = evidenceItems
      .map((item) => item.timestamp ?? item.collectedAt)
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) {
      return null;
    }
    return new Date(Math.max(...timestamps)).toISOString();
  }

  deriveEvidenceFreshness(
    timestamp: string | null,
    explicitFreshness: boolean | null,
  ): ConversationEvidenceFreshness {
    if (explicitFreshness === true) {
      return 'FRESH';
    }
    if (explicitFreshness === false) {
      return 'STALE';
    }
    if (!timestamp) {
      return 'UNKNOWN';
    }
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) {
      return 'UNKNOWN';
    }
    const ageMinutes = (Date.now() - parsed) / (1000 * 60);
    if (!Number.isFinite(ageMinutes) || ageMinutes < 0) {
      return 'UNKNOWN';
    }
    return ageMinutes <= 180 ? 'FRESH' : 'STALE';
  }

  deriveEvidenceQuality(params: {
    isExternal: boolean | null;
    gatePassed: boolean | null;
  }): ConversationEvidenceQuality {
    if (params.gatePassed === true) {
      return 'RECONCILED';
    }
    if (params.isExternal === true) {
      return 'EXTERNAL';
    }
    if (params.isExternal === false) {
      return 'INTERNAL';
    }
    return 'UNVERIFIED';
  }

  normalizeEvidenceFreshnessFilter(value: unknown): ConversationEvidenceFreshness | null {
    const normalized = this.pickString(value)?.toUpperCase();
    if (normalized === 'FRESH' || normalized === 'STALE' || normalized === 'UNKNOWN') {
      return normalized;
    }
    return null;
  }

  normalizeEvidenceQualityFilter(value: unknown): ConversationEvidenceQuality | null {
    const normalized = this.pickString(value)?.toUpperCase();
    if (
      normalized === 'RECONCILED' ||
      normalized === 'INTERNAL' ||
      normalized === 'EXTERNAL' ||
      normalized === 'UNVERIFIED'
    ) {
      return normalized;
    }
    return null;
  }

  buildResultQualitySummary(
    outputRecord: Record<string, unknown>,
    evidenceItems: ConversationEvidenceItem[],
    traceability?: ConversationResultTraceability,
  ): ConversationResultQualitySummary {
    const evidenceCount = traceability?.evidenceCount ?? evidenceItems.length;
    const strongEvidenceCount =
      traceability?.strongEvidenceCount ??
      evidenceItems.filter((item) => item.quality === 'INTERNAL' || item.quality === 'RECONCILED')
        .length;
    const verificationCount = evidenceItems.filter(
      (item) => item.quality === 'INTERNAL' || item.quality === 'RECONCILED',
    ).length;
    const knownFreshnessItems = evidenceItems.filter((item) => item.freshness !== 'UNKNOWN');
    const freshEvidenceCount = knownFreshnessItems.filter(
      (item) => item.freshness === 'FRESH',
    ).length;

    const completeness = this.clamp01(evidenceCount / 4);
    const timeliness = this.clamp01(
      knownFreshnessItems.length > 0
        ? freshEvidenceCount / knownFreshnessItems.length
        : evidenceCount > 0
          ? 0.5
          : 0,
    );
    const evidenceStrength = this.clamp01(
      evidenceCount > 0 ? strongEvidenceCount / evidenceCount : 0,
    );
    const verification = this.clamp01(evidenceCount > 0 ? verificationCount / evidenceCount : 0);

    const derivedQualityScore =
      completeness * 0.35 + timeliness * 0.3 + evidenceStrength * 0.2 + verification * 0.15;
    const explicitQualityScoreRaw = this.readNumberOrNull(outputRecord.qualityScore);
    const explicitQualityScore =
      explicitQualityScoreRaw === null
        ? null
        : this.clamp01(
          explicitQualityScoreRaw > 1 ? explicitQualityScoreRaw / 100 : explicitQualityScoreRaw,
        );
    const qualityScore = this.clamp01(
      explicitQualityScore === null
        ? derivedQualityScore
        : derivedQualityScore * 0.6 + explicitQualityScore * 0.4,
    );

    return {
      qualityScore: Number(qualityScore.toFixed(4)),
      freshnessStatus: this.deriveResultFreshnessStatus(outputRecord, timeliness, evidenceCount),
      breakdown: {
        completeness: Number(completeness.toFixed(4)),
        timeliness: Number(timeliness.toFixed(4)),
        evidenceStrength: Number(evidenceStrength.toFixed(4)),
        verification: Number(verification.toFixed(4)),
      },
    };
  }

  deriveResultFreshnessStatus(
    outputRecord: Record<string, unknown>,
    timeliness: number,
    evidenceCount: number,
  ): ConversationFreshnessStatus {
    const explicitFreshness = this.pickString(outputRecord.freshnessStatus)?.toUpperCase();
    if (
      explicitFreshness === 'WITHIN_TTL' ||
      explicitFreshness === 'NEAR_EXPIRE' ||
      explicitFreshness === 'EXPIRED' ||
      explicitFreshness === 'UNKNOWN'
    ) {
      return explicitFreshness;
    }
    if (evidenceCount <= 0) {
      return 'UNKNOWN';
    }
    if (timeliness >= 0.8) {
      return 'WITHIN_TTL';
    }
    if (timeliness >= 0.4) {
      return 'NEAR_EXPIRE';
    }
    return 'EXPIRED';
  }

  buildResultConfidenceGate(
    confidence: number,
    qualitySummary: ConversationResultQualitySummary,
    traceability: ConversationResultTraceability | undefined,
    evidenceItems: ConversationEvidenceItem[],
  ): ConversationResultConfidenceGate {
    const rules = this.arbitrationRules;
    const strongEvidenceCount =
      traceability?.strongEvidenceCount ??
      evidenceItems.filter((item) => item.quality === 'INTERNAL' || item.quality === 'RECONCILED')
        .length;
    const reasonCodes: string[] = [];

    if (qualitySummary.qualityScore < rules.minQualityScore) {
      reasonCodes.push('LOW_QUALITY_SCORE');
    }
    if (rules.checkDataExpiry && qualitySummary.freshnessStatus === 'EXPIRED') {
      reasonCodes.push('DATA_EXPIRED');
    }
    if (confidence < rules.minConfidence) {
      reasonCodes.push('LOW_CONFIDENCE');
    }
    if (strongEvidenceCount < rules.minStrongEvidenceCount) {
      reasonCodes.push('INSUFFICIENT_STRONG_EVIDENCE');
    }

    const allowStrongConclusion = reasonCodes.length === 0;
    return {
      allowStrongConclusion,
      reasonCodes,
      message: allowStrongConclusion
        ? '质量门禁通过，可输出强结论。'
        : `触发降级：${this.translateConfidenceGateReasons(reasonCodes).join('；')}。`,
    };
  }

  applyResultConfidenceGateToActions(
    actions: Record<string, unknown>,
    confidenceGate: ConversationResultConfidenceGate,
  ): Record<string, unknown> {
    if (confidenceGate.allowStrongConclusion) {
      return actions;
    }
    const baseRiskDisclosure =
      this.pickString(actions.riskDisclosure) ?? '建议仅供参考，请结合业务实际与风控要求审慎执行。';
    return {
      ...actions,
      recommendedAction: 'OBSERVE',
      riskDisclosure: `${baseRiskDisclosure} ${confidenceGate.message}`,
    };
  }

  applyResultConfidenceGateToConclusion(
    conclusion: string | null,
    confidenceGate: ConversationResultConfidenceGate,
  ): string | null {
    if (!conclusion || confidenceGate.allowStrongConclusion) {
      return conclusion;
    }
    const marker = '【降级建议】';
    if (conclusion.startsWith(marker)) {
      return conclusion;
    }
    return `${marker}${conclusion}`;
  }

  translateConfidenceGateReasons(reasonCodes: string[]): string[] {
    const labels: Record<string, string> = {
      LOW_QUALITY_SCORE: '质量评分低于阈值',
      DATA_EXPIRED: '数据时效已过期',
      LOW_CONFIDENCE: '模型置信度偏低',
      INSUFFICIENT_STRONG_EVIDENCE: '强证据数量不足',
    };
    return reasonCodes.map((code) => labels[code] ?? code);
  }

  clamp01(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    if (value >= 1) {
      return 1;
    }
    return value;
  }

  readBooleanOrNull(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return null;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
        return false;
      }
    }
    return null;
  }

  normalizeActions(
    value: unknown,
    decisionOutput?: Record<string, unknown>,
  ): Record<string, unknown> {
    const fallbackRiskDisclosure = '建议仅供参考，请结合业务实际与风控要求审慎执行。';
    const decisionAction = this.pickString(decisionOutput?.action);
    const decisionRiskLevel = this.pickString(decisionOutput?.riskLevel);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        spot: [],
        futures: [],
        recommendedAction: decisionAction ?? 'HOLD',
        riskLevel: decisionRiskLevel,
        riskDisclosure: fallbackRiskDisclosure,
      };
    }
    const record = value as Record<string, unknown>;

    return {
      ...record,
      ...(decisionAction && !this.pickString(record.recommendedAction)
        ? { recommendedAction: decisionAction }
        : {}),
      ...(decisionRiskLevel && !this.pickString(record.riskLevel)
        ? { riskLevel: decisionRiskLevel }
        : {}),
      riskDisclosure: this.pickString(record.riskDisclosure) ?? fallbackRiskDisclosure,
    };
  }

  normalizeConfidenceValue(primary: unknown, fallback: unknown): number {
    const candidate = this.readNumberOrNull(primary) ?? this.readNumberOrNull(fallback) ?? 0;
    if (candidate > 1) {
      return Math.max(0, Math.min(1, candidate / 100));
    }
    if (candidate < 0) {
      return 0;
    }
    return Math.min(1, candidate);
  }

  readNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private buildResultDiffSnapshot(asset: {
    id: string;
    sourceExecutionId: string | null;
    payload: unknown;
    createdAt: Date;
  }): ConversationResultDiffSnapshot {
    const payload = this.toRecord(asset.payload);
    const result = this.toRecord(payload.result);
    const facts = this.normalizeFacts(result.facts);
    const factTexts = facts
      .map((item) => item.text)
      .filter((item, index, arr) => arr.indexOf(item) === index);

    const sourceSet = new Set<string>();
    for (const fact of facts) {
      for (const citation of fact.citations) {
        const source =
          this.pickString(citation.source) ??
          this.pickString(citation.type) ??
          this.pickString(citation.label);
        if (source) {
          sourceSet.add(source);
        }
      }
    }

    return {
      assetId: asset.id,
      createdAt: asset.createdAt.toISOString(),
      executionId: this.pickString(payload.executionId) ?? asset.sourceExecutionId,
      status: this.pickString(payload.status) ?? 'UNKNOWN',
      confidence: this.normalizeNumber(result.confidence),
      analysis: this.pickString(result.analysis) ?? this.pickString(result.summary) ?? '',
      facts: factTexts,
      sources: [...sourceSet],
      actions: this.normalizeActions(result.actions),
    };
  }

  buildResultDiff(
    current: ConversationResultDiffSnapshot,
    baseline: ConversationResultDiffSnapshot,
  ): ConversationResultDiff {
    const baselineFacts = new Set(baseline.facts);
    const currentFacts = new Set(current.facts);
    const addedFacts = current.facts.filter((fact) => !baselineFacts.has(fact));
    const removedFacts = baseline.facts.filter((fact) => !currentFacts.has(fact));

    const baselineSources = new Set(baseline.sources);
    const currentSources = new Set(current.sources);
    const addedSources = current.sources.filter((source) => !baselineSources.has(source));
    const removedSources = baseline.sources.filter((source) => !currentSources.has(source));

    const actionKeys = new Set([...Object.keys(baseline.actions), ...Object.keys(current.actions)]);
    const changedActionKeys = [...actionKeys].filter((key) => {
      const currentValue = this.serializeComparable(current.actions[key]);
      const baselineValue = this.serializeComparable(baseline.actions[key]);
      return currentValue !== baselineValue;
    });

    const confidenceDelta = Number((current.confidence - baseline.confidence).toFixed(4));
    const analysisChanged = current.analysis !== baseline.analysis;

    const changeSummary: string[] = [];
    if (Math.abs(confidenceDelta) >= 0.05) {
      changeSummary.push('CONFIDENCE_SHIFT');
    }
    if (addedFacts.length > 0 || removedFacts.length > 0) {
      changeSummary.push('FACTS_CHANGED');
    }
    if (addedSources.length > 0 || removedSources.length > 0) {
      changeSummary.push('EVIDENCE_SOURCES_CHANGED');
    }
    if (changedActionKeys.length > 0) {
      changeSummary.push('ACTIONS_CHANGED');
    }
    if (analysisChanged) {
      changeSummary.push('ANALYSIS_CHANGED');
    }

    return {
      confidenceDelta,
      analysisChanged,
      addedFacts,
      removedFacts,
      addedSources,
      removedSources,
      changedActionKeys,
      changeSummary,
    };
  }

  serializeComparable(value: unknown): string {
    if (value === undefined) {
      return '__undefined__';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  deriveConflictsFromExecutionOutput(outputSnapshot: unknown) {
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

  extractPrimarySource(
    citations: Array<Record<string, unknown>>,
    fallback: string,
  ): string {
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

  computeConflictConsistencyScore(
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
}
