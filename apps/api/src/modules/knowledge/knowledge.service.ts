import { KnowledgeSyncService } from './knowledge-sync.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  IntelCategory,
  KnowledgePeriodType,
  KnowledgeRelationType,
  KnowledgeStatus,
  KnowledgeType,
  PriceSourceType,
  PriceSubType,
  GeoLevel,
  Prisma,
} from '@prisma/client';
import { ContentType, AIAnalysisResult } from '@packages/types';
import { AIService } from '../ai/ai.service';
import { PrismaService } from '../../prisma';
import { RagPipelineService } from './rag/rag-pipeline.service';
import { IntelTaskService } from '../intel-task/intel-task.service';
import { IntelTaskStateService } from '../intel-task/intel-task-state.service';
import { DeepAnalysisService } from './services/deep-analysis.service';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import * as KnowledgeUtils from "./knowledge.utils";
export type CreateKnowledgeInput = {
  type: KnowledgeType;
  title: string;
  contentPlain: string;
  contentRich?: string;
  sourceType?: string;
  publishAt?: Date;
  effectiveAt?: Date;
  periodType?: KnowledgePeriodType;
  periodKey?: string;
  location?: string;
  region?: string[];
  commodities?: string[];
  status?: KnowledgeStatus;
  authorId: string;
  summary?: string;
  tags?: string[];
};

export type UpdateKnowledgeInput = Partial<CreateKnowledgeInput>;

@Injectable()
export class KnowledgeService {

  async findOne(id: string) {
    return this.searchService.findOne(id);
  }


  async syncFromMarketIntel(intelId: string, options?: { skipRecursiveReportSync?: boolean }) {
    return this.syncService.syncFromMarketIntel(intelId, options);
  }

  async backfillFromLegacy(limit = 500) {
    return this.syncService.backfillFromLegacy(limit);
  }

  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(forwardRef(() => KnowledgeSyncService)) private readonly syncService: KnowledgeSyncService,
    @Inject(forwardRef(() => KnowledgeSearchService)) private readonly searchService: KnowledgeSearchService,
    private prisma: PrismaService,
    private aiService: AIService,
    private ragPipelineService: RagPipelineService,
    @Inject(forwardRef(() => IntelTaskService)) private intelTaskService: IntelTaskService,
        private readonly intelTaskStateService: IntelTaskStateService,
    private deepAnalysisService: DeepAnalysisService,
  ) { }

  async create(input: CreateKnowledgeInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.knowledgeItem.create({
        data: {
          type: input.type,
          title: input.title,
          contentPlain: input.contentPlain,
          contentRich: input.contentRich,
          sourceType: input.sourceType,
          publishAt: input.publishAt,
          effectiveAt: input.effectiveAt,
          periodType: input.periodType || 'ADHOC',
          periodKey: input.periodKey,
          location: input.location,
          region: input.region || [],
          commodities: input.commodities || [],
          status: input.status || 'DRAFT',
          authorId: input.authorId,
        },
      });

      if (input.summary || input.tags?.length) {
        await tx.knowledgeAnalysis.create({
          data: {
            knowledgeId: item.id,
            summary: input.summary,
            tags: input.tags || [],
          },
        });
      }

      return item;
    });

    const fullItem = await this.findOne(result.id);
    await this.ragPipelineService.ingest(fullItem.id, fullItem.contentPlain || fullItem.contentRich || '');
    return fullItem;
  }

  /**
   * 提交报告并创建 KnowledgeItem（路径 A：人工填报）
   * 支持日报/周报/月报，可选关联 IntelTask 自动标记为 SUBMITTED
   */
  async submitReport(input: {
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    title: string;
    contentPlain: string;
    contentRich?: string;
    commodities?: string[];
    region?: string[];
    authorId: string;
    taskId?: string;
    triggerAnalysis?: boolean;
  }) {
    const periodTypeMap = {
      DAILY: KnowledgePeriodType.DAY,
      WEEKLY: KnowledgePeriodType.WEEK,
      MONTHLY: KnowledgePeriodType.MONTH,
    };

    const now = new Date();
    const periodType = periodTypeMap[input.type];

    // 自动生成 periodKey
    let periodKey: string;
    if (input.type === 'DAILY') {
      periodKey = now.toISOString().split('T')[0]; // 2026-02-10
    } else if (input.type === 'WEEKLY') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      periodKey = `${startOfWeek.toISOString().split('T')[0]}_W`;
    } else {
      periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 创建 KnowledgeItem
      const item = await tx.knowledgeItem.create({
        data: {
          type: KnowledgeType[input.type],
          title: input.title,
          contentPlain: input.contentPlain,
          contentRich: input.contentRich,
          sourceType: 'MANUAL_REPORT',
          publishAt: now,
          effectiveAt: now,
          periodType,
          periodKey,
          region: input.region || [],
          commodities: input.commodities || [],
          status: 'PENDING_REVIEW',
          authorId: input.authorId,
        },
      });

      // 2. 如果有关联任务，自动标记为 SUBMITTED
      if (input.taskId) {
        const task = await tx.intelTask.findUnique({
          where: { id: input.taskId },
        });
        if (task && (task.status === 'PENDING' || task.status === 'RETURNED' || task.status === 'OVERDUE')) {
          await tx.intelTask.update({
            where: { id: input.taskId },
            data: {
              status: 'SUBMITTED',
              completedAt: now,
            },
          });
        }
      }

      let weeklyKeyPoints: Prisma.InputJsonValue | undefined;
      if (input.type === 'WEEKLY') {
        const parsed = KnowledgeUtils.parseWeeklyContent(input.contentRich || input.contentPlain || '');
        weeklyKeyPoints = {
          market: parsed.market,
          events: parsed.events,
          risks: parsed.risks,
          outlook: parsed.outlook,
        } as Prisma.InputJsonValue;

        await tx.knowledgeAnalysis.upsert({
          where: { knowledgeId: item.id },
          create: {
            knowledgeId: item.id,
            reportType: 'MARKET',
            reportPeriod: 'WEEKLY',
            keyPoints: weeklyKeyPoints,
            tags: input.commodities || [],
          },
          update: {
            reportType: 'MARKET',
            reportPeriod: 'WEEKLY',
            keyPoints: weeklyKeyPoints,
            tags: input.commodities || [],
          },
        });
      }

      // 3. 触发 AI 分析（异步，不阻塞返回）
      if (input.triggerAnalysis !== false) {
        this.reanalyze(item.id, true).catch((err) => {
          this.logger.warn(`[submitReport] AI analysis failed for ${item.id}:`, err.message);
        });
      }

      return item;
    });

    const fullItem = await this.findOne(result.id);
    await this.ragPipelineService.ingest(fullItem.id, fullItem.contentPlain || fullItem.contentRich || '');
    return fullItem;
  }

  async update(id: string, input: UpdateKnowledgeInput) {
    await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeItem.update({
        where: { id },
        data: {
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.contentPlain !== undefined ? { contentPlain: input.contentPlain } : {}),
          ...(input.contentRich !== undefined ? { contentRich: input.contentRich } : {}),
          ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
          ...(input.publishAt !== undefined ? { publishAt: input.publishAt } : {}),
          ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
          ...(input.periodType !== undefined ? { periodType: input.periodType } : {}),
          ...(input.periodKey !== undefined ? { periodKey: input.periodKey } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.commodities !== undefined ? { commodities: input.commodities } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.authorId !== undefined ? { authorId: input.authorId } : {}),
        },
      });

      if (input.summary !== undefined || input.tags !== undefined) {
        await tx.knowledgeAnalysis.upsert({
          where: { knowledgeId: id },
          create: {
            knowledgeId: id,
            summary: input.summary,
            tags: input.tags || [],
          },
          update: {
            ...(input.summary !== undefined ? { summary: input.summary } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
          },
        });
      }
    });

    const updated = await this.findOne(id);
    if (input.contentPlain || input.contentRich) {
      await this.ragPipelineService.ingest(updated.id, updated.contentPlain || updated.contentRich || '');
    }
    return updated;
  }

  async updateReport(id: string, input: {
    title?: string;
    contentPlain?: string;
    contentRich?: string;
    commodities?: string[];
    region?: string[];
    authorId: string; // 用于校验权限
  }) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`报告 ID ${id} 不存在`);
    }

    if (item.authorId !== input.authorId) {
      throw new BadRequestException('无权修改他人报告');
    }

    if (item.status !== 'PENDING_REVIEW' && item.status !== 'REJECTED') {
      throw new BadRequestException('只有待审核或被驳回的报告可以修改');
    }

    // 更新报告（同时重置状态为 PENDING_REVIEW 如果是被驳回的）
    // 如果是 PENDING_REVIEW，保持不变。如果是 REJECTED，修改后变回 PENDING_REVIEW
    const newStatus = item.status === 'REJECTED' ? 'PENDING_REVIEW' : item.status;

    await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.contentPlain ? { contentPlain: input.contentPlain } : {}),
        ...(input.contentRich ? { contentRich: input.contentRich } : {}),
        ...(input.commodities ? { commodities: input.commodities } : {}),
        ...(input.region ? { region: input.region } : {}),
        status: newStatus,
      },
    });

    if (item.type === 'WEEKLY' && (input.contentRich || input.contentPlain)) {
      const parsed = KnowledgeUtils.parseWeeklyContent(input.contentRich || input.contentPlain || '');
      const weeklyKeyPoints = {
        market: parsed.market,
        events: parsed.events,
        risks: parsed.risks,
        outlook: parsed.outlook,
      } as Prisma.InputJsonValue;

      await this.prisma.knowledgeAnalysis.upsert({
        where: { knowledgeId: item.id },
        create: {
          knowledgeId: item.id,
          reportType: 'MARKET',
          reportPeriod: 'WEEKLY',
          keyPoints: weeklyKeyPoints,
          tags: input.commodities || item.commodities || [],
        },
        update: {
          keyPoints: weeklyKeyPoints,
          ...(input.commodities ? { tags: input.commodities } : {}),
        },
      });
    }

    // 触发重新分析（如果是被驳回修改的，可能需要重新分析）
    this.reanalyze(id, true).catch((err) => {
      this.logger.warn(`[updateReport] AI re-analysis failed for ${id}:`, err.message);
    });

    const updated = await this.findOne(id);
    if (input.contentPlain || input.contentRich) {
      await this.ragPipelineService.ingest(updated.id, updated.contentPlain || updated.contentRich || '');
    }
    return updated;
  }

  async getPendingReviewList(page = 1, pageSize = 20) {
    const [data, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({
        where: { status: 'PENDING_REVIEW' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          analysis: true,
        },
      }),
      this.prisma.knowledgeItem.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);

    return { data, total, page, pageSize };
  }

  async reviewReport(
    id: string,
    input: {
      action: 'APPROVE' | 'REJECT';
      reviewerId: string;
      rejectReason?: string;
    },
  ) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`报告 ID ${id} 不存在`);
    }

    if (item.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('该报告不在待审核状态');
    }

    const now = new Date();
    const newStatus =
      input.action === 'APPROVE' ? KnowledgeStatus.PUBLISHED : KnowledgeStatus.REJECTED;

    await this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        status: newStatus,
        reviewerId: input.reviewerId,
        reviewedAt: now,
        rejectReason: input.action === 'REJECT' ? input.rejectReason : null,
      },
    });

    // 如果通过审核 & 之前未分析成功，触发重新分析
    if (input.action === 'APPROVE') {
      // 可以在这里触发后续逻辑，如积分计算、自动关联等
      this.reanalyze(id, false).catch((err) => {
        this.logger.warn(`[reviewReport] Post-approval analysis failed for ${id}:`, err.message);
      });
    }

    return this.findOne(id);
  }
  async reanalyze(id: string, triggerDeepAnalysis = true) {
    const item = await this.findOne(id);
    const content = item.contentPlain || item.contentRich || '';
    if (!content.trim()) {
      throw new BadRequestException('内容为空，无法执行分析');
    }

    const contentType = KnowledgeUtils.toContentType(item.type);
    const result = await this.aiService.analyzeContent(
      content,
      IntelCategory.C_DOCUMENT,
      item.location || undefined,
      undefined,
      undefined,
      contentType as unknown as ContentType,
    );

    const summary = triggerDeepAnalysis ? result.summary : (result.summary || '').slice(0, 200);

    let finalKeyPoints = result.keyPoints as Prisma.InputJsonValue;
    if (item.type === 'WEEKLY' && item.analysis?.keyPoints && typeof item.analysis.keyPoints === 'object' && !Array.isArray(item.analysis.keyPoints)) {
      finalKeyPoints = {
        ...(item.analysis.keyPoints as Record<string, unknown>),
        aiKeyPoints: result.keyPoints,
      } as Prisma.InputJsonValue;
    }

    await this.prisma.knowledgeAnalysis.upsert({
      where: { knowledgeId: id },
      create: {
        knowledgeId: id,
        summary,
        sentiment: result.sentiment,
        confidenceScore: result.confidenceScore,
        reportType: result.reportType,
        reportPeriod: result.reportPeriod,
        keyPoints: finalKeyPoints,
        prediction: result.prediction as Prisma.InputJsonValue,
        dataPoints: result.dataPoints as Prisma.InputJsonValue,
        events: result.events as Prisma.InputJsonValue,
        insights: result.insights as Prisma.InputJsonValue,
        marketSentiment: result.marketSentiment as Prisma.InputJsonValue,
        tags: result.tags || [],
        traceLogs: result.traceLogs as Prisma.InputJsonValue,
      },
      update: {
        summary,
        sentiment: result.sentiment,
        confidenceScore: result.confidenceScore,
        reportType: result.reportType,
        reportPeriod: result.reportPeriod,
        keyPoints: finalKeyPoints,
        prediction: result.prediction as Prisma.InputJsonValue,
        dataPoints: result.dataPoints as Prisma.InputJsonValue,
        events: result.events as Prisma.InputJsonValue,
        insights: result.insights as Prisma.InputJsonValue,
        marketSentiment: result.marketSentiment as Prisma.InputJsonValue,
        tags: result.tags || [],
        traceLogs: result.traceLogs as Prisma.InputJsonValue,
      },
    });

    // 仅日报触发 B 类子表提取（周报/月报/研报等汇总性内容不提取）
    if (item.type === 'DAILY') {
      this.extractToIntelTables(id, result, item).catch((err) =>
        this.logger.warn(`[reanalyze] extractToIntelTables failed for ${id}: ${err.message}`),
      );
    }

    return this.findOne(id);
  }

  async createRelation(
    fromKnowledgeId: string,
    toKnowledgeId: string,
    relationType: KnowledgeRelationType,
    weight = 50,
    evidence?: string,
  ) {
    if (fromKnowledgeId === toKnowledgeId) {
      throw new BadRequestException('fromKnowledgeId 和 toKnowledgeId 不能相同');
    }

    await Promise.all([this.findOne(fromKnowledgeId), this.findOne(toKnowledgeId)]);

    return this.prisma.knowledgeRelation.upsert({
      where: {
        fromKnowledgeId_toKnowledgeId_relationType: {
          fromKnowledgeId,
          toKnowledgeId,
          relationType,
        },
      },
      create: {
        fromKnowledgeId,
        toKnowledgeId,
        relationType,
        weight,
        evidence,
      },
      update: {
        weight,
        evidence,
      },
      include: {
        fromKnowledge: { select: { id: true, title: true, type: true } },
        toKnowledge: { select: { id: true, title: true, type: true } },
      },
    });
  }

  // =============================================
  // 研报专用方法（统一到 KnowledgeItem）
  // =============================================

  /**
   * 创建研报（直接写入 KnowledgeItem，不经过 MarketIntel）
   */
  async createResearchReport(input: {
    title: string;
    contentPlain: string;
    contentRich?: string;
    reportType?: string;
    reportPeriod?: string;
    publishAt?: Date;
    sourceType?: string;
    commodities?: string[];
    region?: string[];
    authorId: string;
    summary?: string;
    keyPoints?: unknown;
    prediction?: unknown;
    dataPoints?: unknown;
    triggerAnalysis?: boolean;
    intelId?: string;
    attachmentIds?: string[];
  }) {
    const periodType = KnowledgeUtils.mapReportPeriodToKnowledgePeriodType(
      (input.reportPeriod as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ADHOC') || null,
    );
    const publishAt = input.publishAt || new Date();

    const item = await this.prisma.knowledgeItem.create({
      data: {
        type: 'RESEARCH',
        title: input.title,
        contentFormat: 'MARKDOWN',
        contentPlain: input.contentPlain,
        contentRich: input.contentRich,
        sourceType: input.sourceType || 'INTERNAL_REPORT',
        publishAt,
        effectiveAt: publishAt,
        periodType,
        periodKey: KnowledgeUtils.toPeriodKey(publishAt, periodType),
        commodities: input.commodities || [],
        region: input.region || [],
        status: 'DRAFT',
        authorId: input.authorId,
        originLegacyType: input.intelId ? 'MARKET_INTEL' : undefined,
        originLegacyId: input.intelId || undefined,
      },
    });

    // 创建分析记录
    if (input.summary || input.keyPoints || input.prediction || input.dataPoints || input.reportType) {
      await this.prisma.knowledgeAnalysis.create({
        data: {
          knowledgeId: item.id,
          summary: input.summary || input.contentPlain.slice(0, 500),
          reportType: input.reportType,
          reportPeriod: input.reportPeriod,
          keyPoints: input.keyPoints as Prisma.InputJsonValue,
          prediction: input.prediction as Prisma.InputJsonValue,
          dataPoints: input.dataPoints as Prisma.InputJsonValue,
          tags: input.commodities || [],
        },
      });
    }

    // 触发向量化
    const content = input.contentPlain || input.contentRich || '';
    if (content.length > 50) {
      this.ragPipelineService.ingest(item.id, content).catch((err) => {
        this.logger.error('[KnowledgeService.createResearchReport] RAG ingest failed:', err);
      });
    }

    // 复制文档附件
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      const intelAttachments = await this.prisma.intelAttachment.findMany({
        where: { id: { in: input.attachmentIds } },
      });
      if (intelAttachments.length > 0) {
        await this.prisma.knowledgeAttachment.createMany({
          data: intelAttachments.map((att) => ({
            knowledgeId: item.id,
            filename: att.filename,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            storagePath: att.storagePath,
            ocrText: att.ocrText,
          })),
        });
      }
    }

    if (input.triggerAnalysis !== false && content.length > 50) {
      this.reanalyze(item.id, true).catch((err) => {
        this.logger.error('[KnowledgeService.createResearchReport] AI analysis failed:', err);
      });
    }

    // 异步调用 MARKET_INTEL_SUMMARY_GENERATOR 模板生成高质量摘要
    if (content.length > 50 && !input.summary) {
      this.deepAnalysisService.generateSummary(content).then(async (aiSummary) => {
        if (aiSummary) {
          await this.prisma.knowledgeAnalysis.updateMany({
            where: { knowledgeId: item.id },
            data: { summary: aiSummary },
          });
          this.logger.log(`[createResearchReport] AI 摘要已回填到 KnowledgeItem ${item.id}`);
        }
      }).catch((err) => {
        this.logger.error('[createResearchReport] AI 摘要生成失败:', err);
      });
    }

    return this.findOne(item.id);
  }

  /**
   * 将草稿研报提交审核
   */
  async submitDraftReport(id: string, taskId?: string, authorId?: string) {
    const item = await this.prisma.knowledgeItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`Knowledge items with id ${id} not found`);
    }

    if (item.type !== 'RESEARCH') {
      throw new BadRequestException('Only RESEARCH reports can be submitted');
    }

    if (item.status !== 'DRAFT') {
      throw new BadRequestException(`Report is currently ${item.status}, expected DRAFT`);
    }

    // 更新研报状态为待审核
    const updatedReport = await this.prisma.knowledgeItem.update({
      where: { id },
      data: { status: 'PENDING_REVIEW' },
    });

    // 若传入了 taskId，触发任务联动提交
    if (taskId) {
      if (!this.intelTaskService) {
        this.logger.warn('IntelTaskService is not injected, task binding skipped.');
      } else {
        try {
          // 调用任务的提交功能，将任务置于完成/待审状态
          await this.intelTaskStateService.submitTask(taskId, authorId || item.authorId || 'system-user-placeholder', {
            intelId: id,
          });
        } catch (error) {
          this.logger.error(`Failed to submit task ${taskId} for report ${id}:`, error);
          // 这里可以考虑不要因此中断研报自己的提审流程，只打错误日志
        }
      }
    }

    return updatedReport;
  }

  /**
   * 更新研报
   */
  async updateResearchReport(id: string, input: {
    title?: string;
    contentPlain?: string;
    contentRich?: string;
    reportType?: string;
    reportPeriod?: string;
    publishAt?: Date;
    sourceType?: string;
    commodities?: string[];
    region?: string[];
    summary?: string;
    keyPoints?: unknown;
    prediction?: unknown;
    dataPoints?: unknown;
    intelId?: string;
    attachmentIds?: string[];
  }) {
    const data: Prisma.KnowledgeItemUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.contentPlain !== undefined) data.contentPlain = input.contentPlain;
    if (input.contentRich !== undefined) data.contentRich = input.contentRich;
    if (input.sourceType !== undefined) data.sourceType = input.sourceType;
    if (input.commodities !== undefined) data.commodities = input.commodities;
    if (input.region !== undefined) data.region = input.region;
    if (input.publishAt !== undefined) {
      data.publishAt = input.publishAt;
      data.effectiveAt = input.publishAt;
    }

    const item = await this.prisma.knowledgeItem.update({
      where: { id },
      data,
    });

    // 同步更新分析记录
    const analysisData: Prisma.KnowledgeAnalysisUpdateInput = {};
    if (input.summary !== undefined) analysisData.summary = input.summary;
    if (input.reportType !== undefined) analysisData.reportType = input.reportType;
    if (input.reportPeriod !== undefined) analysisData.reportPeriod = input.reportPeriod;
    if (input.keyPoints !== undefined) analysisData.keyPoints = input.keyPoints as Prisma.InputJsonValue;
    if (input.prediction !== undefined) analysisData.prediction = input.prediction as Prisma.InputJsonValue;
    if (input.dataPoints !== undefined) analysisData.dataPoints = input.dataPoints as Prisma.InputJsonValue;

    if (Object.keys(analysisData).length > 0) {
      await this.prisma.knowledgeAnalysis.upsert({
        where: { knowledgeId: id },
        create: {
          knowledgeId: id,
          ...analysisData,
          tags: input.commodities || [],
        } as Prisma.KnowledgeAnalysisCreateInput,
        update: analysisData,
      });
    }

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      const intelAttachments = await this.prisma.intelAttachment.findMany({
        where: { id: { in: input.attachmentIds } },
      });
      if (intelAttachments.length > 0) {
        const existing = await this.prisma.knowledgeAttachment.findMany({
          where: { knowledgeId: id },
        });
        const existingPaths = new Set(existing.map((e) => e.storagePath));
        const newAttachments = intelAttachments
          .filter((att) => !existingPaths.has(att.storagePath))
          .map((att) => ({
            knowledgeId: item.id,
            filename: att.filename,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            storagePath: att.storagePath,
            ocrText: att.ocrText,
          }));

        if (newAttachments.length > 0) {
          await this.prisma.knowledgeAttachment.createMany({
            data: newAttachments,
          });
        }
      }
    }

    // 重新向量化
    const content = input.contentPlain || item.contentPlain;
    if (content && content.length > 50) {
      this.ragPipelineService.ingest(item.id, content).catch((err) => {
        this.logger.error('[KnowledgeService.updateResearchReport] RAG ingest failed:', err);
      });
    }

    return this.findOne(item.id);
  }

  /**
   * 删除研报
   */
  async deleteReport(id: string) {
    await this.prisma.knowledgeItem.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 批量删除研报
   */
  async batchDeleteReports(ids: string[]) {
    const result = await this.prisma.knowledgeItem.deleteMany({
      where: { id: { in: ids }, type: 'RESEARCH' },
    });
    return { success: true, deletedCount: result.count };
  }

  /**
   * 增加浏览次数
   */
  async incrementReportViewCount(id: string) {
    return this.prisma.knowledgeItem.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { id: true, viewCount: true },
    });
  }

  /**
   * 增加下载次数
   */
  async incrementReportDownloadCount(id: string) {
    return this.prisma.knowledgeItem.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
      select: { id: true, downloadCount: true },
    });
  }

  /**
   * 从 AI 分析结果中提取结构化数据，写入 B 类子表（PriceData / MarketEvent / MarketInsight）
   * 使用 knowledgeId 关联，不依赖 MarketIntel 主表
   */
  private async extractToIntelTables(
    knowledgeId: string,
    result: AIAnalysisResult,
    item: { authorId: string; effectiveAt?: Date | null; publishAt?: Date | null; commodities?: string[]; location?: string | null },
  ) {
    const effectiveDate = item.effectiveAt || item.publishAt || new Date();

    // ========== 1. 提取价格数据 → PriceData ==========
    if (result.pricePoints && result.pricePoints.length > 0) {
      for (const point of result.pricePoints) {
        if (!point.location || !point.price) continue;

        const resolvedSourceType = Object.values(PriceSourceType).includes(
          point.sourceType as PriceSourceType,
        )
          ? (point.sourceType as PriceSourceType)
          : PriceSourceType.REGIONAL;
        const resolvedSubType = Object.values(PriceSubType).includes(
          point.subType as PriceSubType,
        )
          ? (point.subType as PriceSubType)
          : PriceSubType.LISTED;
        const resolvedGeoLevel = Object.values(GeoLevel).includes(
          point.geoLevel as GeoLevel,
        )
          ? (point.geoLevel as GeoLevel)
          : GeoLevel.CITY;

        const priceDate = new Date(effectiveDate);
        priceDate.setHours(0, 0, 0, 0);

        const priceData = {
          sourceType: resolvedSourceType,
          subType: resolvedSubType,
          geoLevel: resolvedGeoLevel,
          location: point.location,
          province: point.province || null,
          city: point.city || null,
          region: result.reportMeta?.region ? [result.reportMeta.region] : [],
          longitude: point.longitude || null,
          latitude: point.latitude || null,
          collectionPointId: point.collectionPointId || null,
          regionCode: point.regionCode || null,
          effectiveDate: priceDate,
          commodity: point.commodity || result.reportMeta?.commodity || '玉米',
          grade: point.grade || null,
          price: point.price,
          dayChange: point.change ?? null,
          note: point.note || null,
          knowledgeId,
          authorId: item.authorId,
        };

        // 查找是否已存在同一来源的价格数据
        const existing = await this.prisma.priceData.findFirst({
          where: {
            effectiveDate: priceData.effectiveDate,
            commodity: priceData.commodity,
            location: priceData.location,
            sourceType: priceData.sourceType,
            subType: priceData.subType,
          },
        });

        if (existing) {
          await this.prisma.priceData.update({
            where: { id: existing.id },
            data: {
              price: priceData.price,
              dayChange: priceData.dayChange,
              knowledgeId: priceData.knowledgeId,
              collectionPointId: priceData.collectionPointId,
              regionCode: priceData.regionCode,
              note: priceData.note,
            },
          });
        } else {
          await this.prisma.priceData.create({ data: priceData });
        }
      }

      this.logger.log(`[extractToIntelTables] Wrote ${result.pricePoints.length} price points for knowledge ${knowledgeId}`);
    }

    // ========== 2. 提取市场事件 → MarketEvent ==========
    if (result.events && result.events.length > 0) {
      // 获取默认事件类型
      const defaultEventType = await this.prisma.eventTypeConfig.findFirst();
      if (defaultEventType) {
        for (const event of result.events) {
          let eventTypeId = defaultEventType.id;
          if (event.eventTypeCode) {
            const matched = await this.prisma.eventTypeConfig.findUnique({
              where: { code: event.eventTypeCode },
            });
            if (matched) eventTypeId = matched.id;
          }

          await this.prisma.marketEvent.create({
            data: {
              knowledgeId,
              eventTypeId,
              subject: event.subject || '未知主体',
              action: event.action || '未知动作',
              content: event.content || event.sourceText || `${event.subject || ''}${event.action || ''}`,
              impact: event.impact,
              impactLevel: event.impactLevel || 'MEDIUM',
              sentiment: event.sentiment || 'neutral',
              commodity: event.commodity || result.reportMeta?.commodity,
              regionCode: event.regionCode || result.reportMeta?.region,
              sourceText: event.sourceText || '',
              sourceStart: event.sourceStart,
              sourceEnd: event.sourceEnd,
              eventDate: new Date(effectiveDate),
            },
          });
        }

        this.logger.log(`[extractToIntelTables] Wrote ${result.events.length} events for knowledge ${knowledgeId}`);
      }
    }

    // ========== 3. 提取后市预判 → MarketInsight ==========
    if (result.forecast && result.forecast.shortTerm) {
      const forecastType = await this.prisma.insightTypeConfig.findUnique({
        where: { code: 'FORECAST' },
      });
      const typeId = forecastType?.id || (await this.prisma.insightTypeConfig.findFirst())?.id;

      if (typeId) {
        await this.prisma.marketInsight.create({
          data: {
            knowledgeId,
            insightTypeId: typeId,
            title: '短期后市预判',
            content: result.forecast.shortTerm,
            timeframe: 'SHORT_TERM',
            direction: 'STABLE',
            confidence: 80,
            factors: result.forecast.keyFactors || [],
            commodity: result.reportMeta?.commodity,
            regionCode: result.reportMeta?.region,
            sourceText: result.forecast.shortTerm,
          },
        });

        this.logger.log(`[extractToIntelTables] Wrote forecast insight for knowledge ${knowledgeId}`);
      }
    }
  }
}
