import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateConversationBacktestDto,
  CreateSkillDraftDto,
  ConfirmConversationPlanDto,
  CreateConversationSessionDto,
  CreateConversationTurnDto,
  ExportConversationResultDto,
  ReuseConversationAssetDto,
} from '@packages/types';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkflowExecutionService } from '../workflow-execution';
import { ReportExportService } from '../report-export';
import { AIModelService } from '../ai/ai-model.service';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import {
  ConversationUtilsService,
  ConversationIntentService,
  ConversationOrchestratorService,
  ConversationSynthesizerService,
  ConversationPreflightService,
  ConversationCapabilityService,
  ConversationResultService,
  ConversationSubscriptionService,
} from './services';

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
  workflowReuseSource?: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC' | 'NONE';
  workflowMatchScore?: number;
  skills: string[];
  paramSnapshot: SlotMap;
  estimatedCost: {
    token: number;
    latencyMs: number;
  };
};

type ReplyOption = {
  id: string;
  label: string;
  mode: 'SEND' | 'OPEN_TAB';
  value?: string;
  tab?: 'progress' | 'result' | 'delivery' | 'schedule';
};

type ConversationSessionQueryDto = {
  state?: SessionState;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

type ConversationObservabilitySummaryQueryDto = {
  windowDays?: number;
  maxSessions?: number;
};

type CapabilityRoutingPolicy = {
  allowOwnerPool: boolean;
  allowPublicPool: boolean;
  preferOwnerFirst: boolean;
  minOwnerScore: number;
  minPublicScore: number;
};

const SESSION_DETAIL_TURN_LIMIT = 80;
const SESSION_DETAIL_PLAN_LIMIT = 20;

@Injectable()
export class AgentConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly reportExportService: ReportExportService,
    private readonly aiModelService: AIModelService,
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly intentService: ConversationIntentService,
    private readonly utilsService: ConversationUtilsService,
    private readonly orchestratorService: ConversationOrchestratorService,
    private readonly synthesizerService: ConversationSynthesizerService,
    private readonly preflightService: ConversationPreflightService,
    readonly capabilityService: ConversationCapabilityService,
    readonly resultService: ConversationResultService,
    readonly subscriptionService: ConversationSubscriptionService,
  ) {
    this.resultService.setDelegate({
      createConversationAsset: (input) => this.createConversationAsset(input),
      getAuthorizedExecution: (userId, executionId) => this.getAuthorizedExecution(userId, executionId),
      mapExecutionStatus: (status) => this.mapExecutionStatus(status),
      synthesizeResult: (sessionId, executionResult) => this.synthesizeResult(sessionId, executionResult),
      buildReportCards: (report) => this.buildReportCards(report),
    });
    this.subscriptionService.setDelegate({
      createConversationAsset: (input) => this.createConversationAsset(input),
      compileExecutionParams: (mergedPlan, paramSnapshot) => this.compileExecutionParams(mergedPlan, paramSnapshot),
      mergeDeliveryRecipients: (existing, incoming) => this.mergeDeliveryRecipients(existing as string[], incoming as string[]) as unknown[],
      confirmPlan: (userId, sessionId, dto, options) =>
        this.confirmPlan(userId, sessionId, dto as ConfirmConversationPlanDto, options),
      preflightCheck: (input) =>
        this.preflightService.runExecutionPreflight(
          input as Parameters<ConversationPreflightService['runExecutionPreflight']>[0],
        ),
    });
    this.capabilityService.setDelegate({
      createConversationAsset: (input) => this.createConversationAsset(input),
      batchUpdateEphemeralCapabilityPromotionTasks: async (userId, sessionId, data) =>
        (await this.capabilityService.batchUpdateEphemeralCapabilityPromotionTasks(
          userId,
          sessionId,
          data as Parameters<
            ConversationCapabilityService['batchUpdateEphemeralCapabilityPromotionTasks']
          >[2],
        )) as Record<string, unknown>,
    });
  }

  async createSession(userId: string, dto: CreateConversationSessionDto) {
    return this.prisma.conversationSession.create({
      data: {
        title: dto.title ?? null,
        ownerUserId: userId,
      },
    });
  }

  async deleteSession(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    // 使用事务级联删除所有关联数据
    await this.prisma.$transaction(async (tx) => {
      // 删除关联的 subscription runs
      const subscriptions = await tx.conversationSubscription.findMany({
        where: { sessionId },
        select: { id: true },
      });
      if (subscriptions.length > 0) {
        await tx.conversationSubscriptionRun.deleteMany({
          where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
        });
      }
      // 删除 subscriptions
      await tx.conversationSubscription.deleteMany({ where: { sessionId } });
      // 删除 turns、plans、assets
      await tx.conversationTurn.deleteMany({ where: { sessionId } });
      await tx.conversationPlan.deleteMany({ where: { sessionId } });
      await tx.conversationAsset.deleteMany({ where: { sessionId } });
      // 删除 skill draft + runtime grant
      const drafts = await tx.agentSkillDraft.findMany({
        where: { sessionId },
        select: { id: true },
      });
      if (drafts.length > 0) {
        await tx.agentSkillRuntimeGrant.deleteMany({
          where: { draftId: { in: drafts.map((d) => d.id) } },
        });
      }
      await tx.agentSkillDraft.deleteMany({ where: { sessionId } });
      // 最后删除会话
      await tx.conversationSession.delete({ where: { id: sessionId } });
    });

    return { deleted: true };
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
          orderBy: { createdAt: 'desc' },
          take: SESSION_DETAIL_TURN_LIMIT,
        },
        plans: {
          orderBy: { version: 'desc' },
          take: SESSION_DETAIL_PLAN_LIMIT,
        },
      },
    });

    if (!session) {
      return null;
    }

    // Return latest window in chronological order for stable timeline rendering.
    session.turns = [...session.turns].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    return session;
  }

  async createTurn(userId: string, sessionId: string, dto: CreateConversationTurnDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });

    if (!session) {
      return null;
    }

    // -- Unified Intent: detect action intents via IntentService --
    const unifiedIntent = await this.intentService.detectUnifiedIntent(
      dto.message,
      session.state as SessionState,
      session.currentIntent,
    );
    const actionType = unifiedIntent.type;
    const isActionFastPath =
      actionType === 'EXPORT' ||
      actionType === 'DELIVER_EMAIL' ||
      actionType === 'SCHEDULE' ||
      actionType === 'HELP' ||
      actionType === 'CREATE_AGENT' ||
      actionType === 'ASSEMBLE_WORKFLOW' ||
      actionType === 'PROMOTE_AGENT' ||
      actionType === 'RETRY' ||
      actionType === 'BACKTEST' ||
      actionType === 'COMPARE' ||
      actionType === 'MODIFY_PARAM' ||
      actionType === 'MULTI_STEP';
    if (isActionFastPath) {
      // HELP intent: return dynamic capability discovery message
      if (actionType === 'HELP') {
        const helpMessage = await this.intentService.buildCapabilityDiscoveryMessage(userId);
        const helpOptions = this.intentService.buildSmartNextStepOptions({
          sessionState: session.state as SessionState,
          hasResult: false,
          hasExport: false,
        });
        await this.prisma.conversationTurn.create({
          data: {
            sessionId,
            role: 'USER',
            content: dto.message,
            structuredPayload: { actionIntent: 'HELP' } as Prisma.InputJsonValue,
          },
        });
        await this.prisma.conversationTurn.create({
          data: {
            sessionId,
            role: 'ASSISTANT',
            content: helpMessage,
            structuredPayload: {
              actionIntent: 'HELP',
              replyOptions: helpOptions,
            } as Prisma.InputJsonValue,
          },
        });
        return {
          assistantMessage: helpMessage,
          state: session.state as SessionState,
          intent: (session.currentIntent ?? 'MARKET_SUMMARY_WITH_FORECAST') as IntentCode,
          missingSlots: [] as string[],
          proposedPlan: null,
          confirmRequired: false,
          autoExecuted: false,
          replyOptions: helpOptions,
        };
      }
      const actionIntent = {
        type: actionType,
        format: unifiedIntent.format,
        emailTo: unifiedIntent.emailTo,
        cronNatural: unifiedIntent.cronNatural,
      };
      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'USER',
          content: dto.message,
          structuredPayload: { actionIntent: actionIntent.type } as Prisma.InputJsonValue,
        },
      });

      let actionResponse = '';
      const actionPayload: Record<string, unknown> = { actionIntent: actionIntent.type };

      if (actionIntent.type === 'EXPORT') {
        try {
          const exportResult = await this.exportResult(userId, sessionId, {
            format: 'PDF',
            sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
            includeRawData: false,
          });
          actionResponse = exportResult?.downloadUrl
            ? '\u597d\u7684\uff0c\u62a5\u544a\u5df2\u751f\u6210\uff0c\u4f60\u53ef\u4ee5\u4e0b\u8f7d\u4e86\u3002'
            : '\u597d\u7684\uff0c\u62a5\u544a\u6b63\u5728\u751f\u6210\u4e2d\uff0c\u7a0d\u540e\u4f1a\u901a\u77e5\u4f60\u3002';
          actionPayload.exportResult = exportResult;
        } catch {
          actionResponse =
            '\u5bfc\u51fa\u9047\u5230\u4e86\u95ee\u9898\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
        }
      } else if (actionIntent.type === 'DELIVER_EMAIL') {
        if (actionIntent.emailTo && actionIntent.emailTo.length > 0) {
          try {
            const exportResult = await this.exportResult(userId, sessionId, {
              format: 'PDF',
              sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
              includeRawData: false,
            });
            const exportTaskId =
              typeof exportResult?.exportTaskId === 'string' ? exportResult.exportTaskId : '';
            if (exportTaskId) {
              await this.subscriptionService.deliver(userId, sessionId, {
                exportTaskId,
                channel: 'EMAIL',
                to: actionIntent.emailTo,
              });
              actionResponse =
                '\u597d\u7684\uff0c\u62a5\u544a\u5df2\u53d1\u9001\u5230 ' +
                actionIntent.emailTo.join('\u3001') +
                '\u3002';
            } else {
              actionResponse =
                '\u62a5\u544a\u5bfc\u51fa\u4e2d\uff0c\u5b8c\u6210\u540e\u4f1a\u81ea\u52a8\u53d1\u9001\u5230\u90ae\u7bb1\u3002';
            }
          } catch {
            actionResponse =
              '\u53d1\u9001\u90ae\u4ef6\u9047\u5230\u4e86\u95ee\u9898\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
          }
        } else {
          actionResponse =
            '\u8bf7\u544a\u8bc9\u6211\u6536\u4ef6\u4eba\u7684\u90ae\u7bb1\u5730\u5740\uff0c\u6bd4\u5982\u201c\u53d1\u5230 test@example.com\u201d\u3002';
        }
      } else if (actionIntent.type === 'SCHEDULE') {
        actionResponse =
          '\u597d\u7684\uff0c\u5b9a\u65f6\u4efb\u52a1\u529f\u80fd\u6b63\u5728\u5f00\u53d1\u4e2d\u3002\u4f60\u53ef\u4ee5\u544a\u8bc9\u6211\u5177\u4f53\u7684\u6267\u884c\u9891\u7387\uff0c\u6bd4\u5982\u201c\u6bcf\u5468\u4e00\u65e9\u4e0a8\u70b9\u6267\u884c\u201d\u3002';
        actionPayload.cronNatural = actionIntent.cronNatural;
      } else if (actionIntent.type === 'CREATE_AGENT') {
        try {
          const agent = await this.orchestratorService.generateEphemeralAgent(userId, sessionId, {
            userInstruction: dto.message,
          });
          if (agent) {
            actionResponse = `\u5df2\u521b\u5efa\u4e34\u65f6\u667a\u80fd\u4f53\u300c${agent.name}\u300d(${agent.agentCode})\u3002\u8be5\u667a\u80fd\u4f53\u5c06\u5728 ${agent.ttlHours} \u5c0f\u65f6\u540e\u81ea\u52a8\u8fc7\u671f\u3002\u4f60\u53ef\u4ee5\u5728\u540e\u7eed\u5bf9\u8bdd\u4e2d\u4f7f\u7528\u5b83\u3002`;
            actionPayload.ephemeralAgent = agent;
          } else {
            actionResponse =
              '\u667a\u80fd\u4f53\u521b\u5efa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : '\u672a\u77e5\u9519\u8bef';
          actionResponse = `\u521b\u5efa\u667a\u80fd\u4f53\u65f6\u9047\u5230\u95ee\u9898\uff1a${msg}`;
        }
      } else if (actionIntent.type === 'ASSEMBLE_WORKFLOW') {
        try {
          const workflow = await this.orchestratorService.assembleEphemeralWorkflow(
            userId,
            sessionId,
            { userInstruction: dto.message },
          );
          if (workflow) {
            actionResponse = `已组装临时工作流「${workflow.name}」(${workflow.mode} 模式，${workflow.nodes.length} 个节点)。该工作流将在 ${workflow.ttlHours} 小时后自动过期。`;
            actionPayload.ephemeralWorkflow = workflow;
          } else {
            actionResponse = '工作流组装失败。请确保会话内有可用的智能体，或先创建临时智能体。';
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : '未知错误';
          actionResponse = `组装工作流时遇到问题：${msg}`;
        }
      } else if (actionIntent.type === 'PROMOTE_AGENT') {
        try {
          const agents = await this.orchestratorService.listEphemeralAgents(userId, sessionId);
          const activeAgent = agents?.find((a) => a.status === 'ACTIVE');
          if (activeAgent) {
            const result = await this.orchestratorService.promoteEphemeralAgent(
              userId,
              sessionId,
              activeAgent.id,
            );
            if (result) {
              actionResponse = `临时智能体「${result.agentCode}」已提交晋升审批。审批通过后将成为可复用的持久化能力。`;
              actionPayload.promotionResult = result;
            } else {
              actionResponse = '晋升操作失败，请稍后再试。';
            }
          } else {
            actionResponse = '当前会话没有活跃的临时智能体可供晋升。请先创建一个临时智能体。';
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : '未知错误';
          actionResponse = `晋升智能体时遇到问题：${msg}`;
        }
      } else if (actionIntent.type === 'RETRY') {
        // ── A1: 重试上次分析 ──
        try {
          const latestExecutionId = session.latestExecutionId;
          if (latestExecutionId) {
            actionResponse = '好的，正在使用相同参数重新分析...';
            actionPayload.retryExecutionId = latestExecutionId;
          } else {
            actionResponse = '没有找到可重试的执行记录，请先进行一次分析。';
          }
        } catch {
          actionResponse = '重试遇到问题，请稍后再试。';
        }
      } else if (actionIntent.type === 'BACKTEST') {
        // ── A2: 触发回测验证 ──
        try {
          const backtestResult = await this.createBacktest(userId, sessionId, {
            strategySource: 'LATEST_ACTIONS',
            lookbackDays: 90,
            feeModel: { spotFeeBps: 8, futuresFeeBps: 3 },
          });
          if (backtestResult) {
            actionResponse =
              '好的，回测任务已提交。系统将使用过去 90 天的历史数据进行验证，完成后会通知你。';
            actionPayload.backtestResult = backtestResult;
          } else {
            actionResponse = '回测任务创建失败，请确保当前会话有已完成的分析结果。';
          }
        } catch {
          actionResponse = '回测任务创建遇到问题，请稍后再试。';
        }
      } else if (actionIntent.type === 'COMPARE') {
        // ── A3: 对比分析 ──
        actionResponse =
          '好的，正在准备对比分析。请告诉我你想对比哪些方面？例如：\n• 对比不同品种（玉米 vs 大豆）\n• 对比不同时间段（本周 vs 上周）\n• 对比不同地区（东北 vs 华北）';
        actionPayload.compareMode = true;
        actionPayload.replyOptions = [
          { id: 'cmp_variety', label: '对比不同品种', mode: 'SEND', value: '对比玉米和大豆的走势' },
          { id: 'cmp_time', label: '对比上周数据', mode: 'SEND', value: '对比本周和上周同期数据' },
          { id: 'cmp_region', label: '对比不同地区', mode: 'SEND', value: '对比东北和华北的行情' },
        ];
      } else if (actionIntent.type === 'MODIFY_PARAM') {
        // ── A4: 动态修改参数 ──
        const slotUpdates = (unifiedIntent as unknown as Record<string, unknown>).slotUpdates as
          | Record<string, unknown>
          | undefined;
        if (slotUpdates && Object.keys(slotUpdates).length > 0) {
          const currentSlots = this.toRecord(session.currentSlots);
          await this.prisma.conversationSession.update({
            where: { id: sessionId },
            data: {
              currentSlots: { ...currentSlots, ...slotUpdates } as unknown as Prisma.InputJsonValue,
            },
          });
          const updatedKeys = Object.keys(slotUpdates).join('、');
          actionResponse = `已更新参数：${updatedKeys}。你可以说「重新分析」让我用新参数重新执行。`;
          actionPayload.slotUpdates = slotUpdates;
        } else {
          actionResponse =
            '请告诉我你想修改哪些参数。例如：\n• 「时间范围改为最近一个月」\n• 「地区改为华北」\n• 「关注主题改为大豆」';
        }
      } else if (actionIntent.type === 'MULTI_STEP') {
        // ── 多步任务分解 (Plan-and-Execute) ──
        const rawSteps = (unifiedIntent as unknown as Record<string, unknown>).steps as
          | string[]
          | undefined;
        const steps =
          rawSteps && rawSteps.length > 1
            ? rawSteps
            : dto.message
              .split(/[，,。；;]|然后|最后|再|接着/)
              .map((s) => s.trim())
              .filter((s) => s.length > 2);

        if (steps.length > 1) {
          // 存储任务计划
          const taskPlan = steps.map((step, idx) => ({
            stepIndex: idx + 1,
            instruction: step,
            status: idx === 0 ? 'PENDING' : 'WAITING',
          }));
          await this.createConversationAsset({
            sessionId,
            assetType: 'NOTE',
            title: '多步任务计划',
            payload: { steps: taskPlan } as unknown as Record<string, unknown>,
            tags: { type: 'MULTI_STEP_PLAN' },
          });

          const stepList = steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n');
          actionResponse = `好的，我已制定以下分步任务计划：\n\n${stepList}\n\n现在开始执行第 1 步：「${steps[0]}」`;
          actionPayload.multiStepPlan = taskPlan;
          actionPayload.replyOptions = [
            {
              id: 'execute_step1',
              label: `开始：${steps[0].slice(0, 20)}`,
              mode: 'SEND',
              value: steps[0],
            },
            { id: 'adjust_plan', label: '调整计划', mode: 'SEND', value: '调整一下这个计划' },
          ];
        } else {
          actionResponse =
            '请描述多个步骤让我帮你分步执行。例如：\n「先分析玉米走势，然后对比大豆，最后把报告发到邮箱」';
        }
      }

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: actionResponse,
          structuredPayload: actionPayload as Prisma.InputJsonValue,
        },
      });

      return {
        assistantMessage: actionResponse,
        state: session.state as SessionState,
        intent: (session.currentIntent ?? 'MARKET_SUMMARY_WITH_FORECAST') as IntentCode,
        missingSlots: [] as string[],
        proposedPlan: null,
        confirmRequired: false,
        autoExecuted: false,
        replyOptions: [] as ReplyOption[],
      };
    }

    const referencedAssetIds = this.extractAssetReferenceIds(dto.message);
    const followupResolved = await this.resolveFollowupAssetReference(sessionId, dto.message);
    const followupReferencedAssetIds = followupResolved.assetIds;
    const semanticResolved = await this.resolveSemanticAssetReferences(sessionId, dto.message);
    const semanticReferencedAssetIds = semanticResolved.assetIds;
    const contextReferencedAssetId = this.pickString(dto.contextPatch?.reusedAssetId);
    const requestedAssetIds = [
      ...(contextReferencedAssetId ? [contextReferencedAssetId] : []),
      ...referencedAssetIds,
      ...followupReferencedAssetIds,
      ...semanticReferencedAssetIds,
    ]
      .filter((id): id is string => this.isUuid(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const referencedAssets = requestedAssetIds.length
      ? await this.prisma.conversationAsset.findMany({
        where: {
          sessionId,
          id: { in: requestedAssetIds },
        },
        select: { id: true, title: true, assetType: true },
      })
      : [];

    const effectiveContextPatch: Record<string, unknown> = {
      ...(dto.contextPatch ?? {}),
    };

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
        followupAssetRefCount: followupReferencedAssetIds.length,
        semanticAssetRefCount: semanticReferencedAssetIds.length,
        followupResolution: followupResolved.resolution,
        semanticResolution: semanticResolved.resolution,
      };
    }

    const userTurn = await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'USER',
        content: dto.message,
        structuredPayload: this.toJson(effectiveContextPatch),
      },
    });

    for (const asset of referencedAssets) {
      await this.prisma.conversationAssetRef.create({
        data: {
          sessionId,
          turnId: userTurn.id,
          assetId: asset.id,
          note: 'user_context_reuse',
        },
      });
    }

    const intent = this.intentService.detectAnalysisIntent(dto.message, session.currentIntent);
    const mergedSlots = this.utilsService.mergeSlots(
      this.utilsService.normalizeSlots(session.currentSlots),
      this.intentService.extractSlots(dto.message),
      effectiveContextPatch,
    );

    // ── 跨会话偏好记忆：加载用户历史偏好自动填充空缺 slot ──
    try {
      const prefAsset = await this.prisma.conversationAsset.findFirst({
        where: {
          session: { ownerUserId: userId },
          assetType: 'NOTE',
          tags: { path: ['type'], equals: 'USER_PREFERENCE' },
        },
        orderBy: { updatedAt: 'desc' },
        select: { payload: true },
      });
      if (prefAsset?.payload) {
        const prefs = this.toRecord(prefAsset.payload);
        const prefKeys = ['region', 'topic', 'lookbackDays', 'email'] as const;
        const mergedSlotsRecord = mergedSlots as Record<string, unknown>;
        for (const key of prefKeys) {
          if (this.utilsService.isSlotMissing(mergedSlotsRecord[key]) && prefs[key] != null) {
            mergedSlotsRecord[key] = prefs[key];
          }
        }
      }
    } catch {
      // 偏好加载失败不阻塞主流程
    }

    // Apply slot defaults to minimize SLOT_FILLING interruptions
    const slotsWithDefaults = this.intentService.applySlotDefaults(mergedSlots, intent);

    const requiredSlots = this.intentService.requiredSlotsByIntent(intent);
    const missingSlots = requiredSlots.filter((key) =>
      this.utilsService.isSlotMissing(slotsWithDefaults[key]),
    );
    const hasMissingSlots = missingSlots.length > 0;
    const routingPolicy = await this.capabilityService.resolveCapabilityRoutingPolicy(session.ownerUserId);

    const state: SessionState = hasMissingSlots ? 'SLOT_FILLING' : 'PLAN_PREVIEW';
    const planId = `plan_${randomUUID()}`;
    const workflowCandidate = hasMissingSlots
      ? null
      : await this.pickWorkflowDefinitionCandidate(
        session.ownerUserId,
        intent,
        slotsWithDefaults,
        routingPolicy,
      );
    const proposedPlan: ProposedPlan | null = hasMissingSlots
      ? null
      : {
        planId,
        planType: intent === 'DEBATE_MARKET_JUDGEMENT' ? 'DEBATE_PLAN' : 'RUN_PLAN',
        intent,
        workflowDefinitionId: workflowCandidate?.id ?? null,
        workflowReuseSource: workflowCandidate?.reuseSource ?? 'NONE',
        workflowMatchScore: workflowCandidate?.score ?? 0,
        skills:
          intent === 'DEBATE_MARKET_JUDGEMENT'
            ? ['price_series_query', 'knowledge_search', 'futures_quote_fetch', 'debate_round']
            : ['price_series_query', 'knowledge_search', 'futures_quote_fetch'],
        paramSnapshot: slotsWithDefaults,
        estimatedCost: {
          token: intent === 'DEBATE_MARKET_JUDGEMENT' ? 28000 : 18000,
          latencyMs: intent === 'DEBATE_MARKET_JUDGEMENT' ? 20000 : 12000,
        },
      };

    let nextPlanVersion: number | null = null;
    if (proposedPlan) {
      const latestPlan = await this.prisma.conversationPlan.findFirst({
        where: { sessionId },
        orderBy: { version: 'desc' },
      });
      nextPlanVersion = (latestPlan?.version ?? 0) + 1;
      await this.prisma.conversationPlan.create({
        data: {
          sessionId,
          version: nextPlanVersion,
          planType: proposedPlan.planType,
          planSnapshot: proposedPlan as Prisma.InputJsonValue,
        },
      });
      await this.createConversationAsset({
        sessionId,
        assetType: 'PLAN',
        title: `执行计划 v${nextPlanVersion}`,
        payload: proposedPlan,
        sourceTurnId: userTurn.id,
        sourcePlanVersion: nextPlanVersion,
      });
      await this.capabilityService.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'WORKFLOW_REUSE',
        routePolicy: ['USER_PRIVATE', 'TEAM_OR_PUBLIC'],
        selectedSource: proposedPlan.workflowReuseSource ?? 'NONE',
        selectedScore: proposedPlan.workflowMatchScore ?? 0,
        selectedWorkflowDefinitionId: proposedPlan.workflowDefinitionId,
        intent,
        missingSlots,
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
        },
      });
    }

    let autoExecution:
      | {
        accepted: boolean;
        executionId: string;
        status: string;
        traceId: string;
      }
      | undefined;

    if (proposedPlan && nextPlanVersion && this.shouldAutoExecute(effectiveContextPatch)) {
      const execution = await this.confirmPlan(
        userId,
        sessionId,
        {
          planId: proposedPlan.planId,
          planVersion: nextPlanVersion,
        },
        { recordTurn: false },
      );
      if (execution) {
        autoExecution = execution;
      }
    }

    const reuseReceipt = this.buildReuseReceiptMessage(
      referencedAssets,
      effectiveContextPatch.reuseResolution as Record<string, unknown> | undefined,
    );

    const assistantMessage = hasMissingSlots
      ? this.intentService.buildSlotPrompt(missingSlots)
      : autoExecution
        ? '我已生成计划并自动开始执行。你可以继续补充要求，结果会在当前会话持续更新。'
        : '我已完成计划编排。请确认执行，或告诉我需要调整的参数。';

    const assistantMessageWithReuse = reuseReceipt
      ? `${assistantMessage}\n${reuseReceipt}`
      : assistantMessage;
    const fallbackReplyOptions = this.buildReplyOptions({
      hasMissingSlots,
      missingSlots,
      autoExecution: Boolean(autoExecution),
      intent,
      slots: mergedSlots,
    });
    const llmEnhancedReply = await this.tryEnhanceAssistantReplyWithLLM({
      userMessage: dto.message,
      assistantMessage: assistantMessageWithReuse,
      hasMissingSlots,
      missingSlots,
      autoExecution: Boolean(autoExecution),
      intent,
      slots: mergedSlots,
      fallbackReplyOptions,
    });
    const finalAssistantMessage = llmEnhancedReply?.assistantMessage ?? assistantMessageWithReuse;
    const replyOptions = llmEnhancedReply?.replyOptions?.length
      ? llmEnhancedReply.replyOptions
      : this.intentService.buildSmartNextStepOptions({
        sessionState: autoExecution ? 'EXECUTING' : state,
        intent,
        hasResult: Boolean(autoExecution),
        hasExport: false,
      });

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: finalAssistantMessage,
        structuredPayload: {
          intent,
          missingSlots,
          proposedPlan,
          autoExecuted: Boolean(autoExecution),
          executionId: autoExecution?.executionId,
          reuseResolution: effectiveContextPatch.reuseResolution,
          replyOptions,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        currentIntent: intent,
        currentSlots: mergedSlots,
        state: autoExecution ? 'EXECUTING' : state,
        latestPlanType:
          proposedPlan?.planType === 'DEBATE_PLAN'
            ? 'DEBATE_PLAN'
            : proposedPlan
              ? 'RUN_PLAN'
              : null,
        latestPlanSnapshot: proposedPlan
          ? (proposedPlan as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return {
      assistantMessage: finalAssistantMessage,
      state: autoExecution ? 'EXECUTING' : state,
      intent,
      missingSlots,
      proposedPlan,
      confirmRequired: !hasMissingSlots && !autoExecution,
      autoExecuted: Boolean(autoExecution),
      executionId: autoExecution?.executionId,
      reuseResolution: effectiveContextPatch.reuseResolution,
      replyOptions,
    };
  }

  async confirmPlan(
    userId: string,
    sessionId: string,
    dto: ConfirmConversationPlanDto,
    options?: { recordTurn?: boolean },
  ) {
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

    // ── D1: 多轮上下文穿透 —— 最近 6 轮对话摘要注入 ──
    try {
      const recentTurns = await this.prisma.conversationTurn.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { role: true, content: true },
      });
      if (recentTurns.length > 0) {
        const contextLines = recentTurns
          .reverse()
          .map((t) => `[${t.role}] ${(t.content ?? '').slice(0, 200)}`)
          .join('\n');
        paramSnapshot.conversationContext = contextLines;
      }
    } catch {
      // 摘要注入失败不阻塞执行
    }

    // ── D2: 前轮结果自动引用 —— 最近 RESULT_SUMMARY 资产 ──
    try {
      const latestResultAsset = await this.prisma.conversationAsset.findFirst({
        where: { sessionId, assetType: 'RESULT_SUMMARY' },
        orderBy: { createdAt: 'desc' },
        select: { payload: true },
      });
      if (latestResultAsset?.payload) {
        const resultPayload = this.toRecord(latestResultAsset.payload);
        const previousResult = this.toRecord(resultPayload.result);
        // 提取关键字段：结论 + 置信度 + 关键事实
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
      // 前轮引用失败不阻塞执行
    }

    const compiledParamSnapshot = this.compileExecutionParams(mergedPlan, paramSnapshot);

    const preflight = await this.preflightService.runExecutionPreflight({
      userId,
      workflowDefinitionId,
      planSnapshot: mergedPlan,
      paramSnapshot: compiledParamSnapshot,
    });

    if (!preflight.passed) {
      throw new BadRequestException({
        code: 'CONV_PREFLIGHT_FAILED',
        message: preflight.message,
        preflight,
      });
    }

    const execution = await this.workflowExecutionService.trigger(userId, {
      workflowDefinitionId,
      workflowVersionId: preflight.workflowVersionId ?? undefined,
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

    await this.createConversationAsset({
      sessionId,
      assetType: 'EXECUTION',
      title: `执行实例 ${execution.id.slice(0, 8)}`,
      payload: {
        executionId: execution.id,
        planVersion: dto.planVersion,
        workflowDefinitionId,
        workflowVersionId: preflight.workflowVersionId,
        paramSnapshot: compiledParamSnapshot,
        preflight,
      },
      sourceExecutionId: execution.id,
      sourcePlanVersion: dto.planVersion,
    });

    if (options?.recordTurn !== false) {
      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: '已确认执行计划，任务已启动。',
          structuredPayload: {
            executionId: execution.id,
            planVersion: dto.planVersion,
            preflight,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      accepted: true,
      executionId: execution.id,
      status: 'EXECUTING',
      traceId: session.traceId ?? `trace_${sessionId}`,
      preflight,
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

    await this.createConversationAsset({
      sessionId,
      assetType: 'EXPORT_FILE',
      title: `导出文件 ${dto.format}`,
      payload: {
        exportTaskId: exportTask.id,
        format: dto.format,
        workflowExecutionId,
        status: exportTask.status,
      },
      sourceExecutionId: workflowExecutionId,
    });

    return {
      exportTaskId: exportTask.id,
      status: exportTask.status,
      workflowExecutionId,
      downloadUrl: exportTask.downloadUrl,
    };
  }

  async createBacktest(userId: string, sessionId: string, dto: CreateConversationBacktestDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const workflowExecutionId = dto.executionId ?? session.latestExecutionId;
    if (!workflowExecutionId || !this.isUuid(workflowExecutionId)) {
      throw new BadRequestException({
        code: 'CONV_BACKTEST_EXECUTION_NOT_FOUND',
        message: '未找到可回测的执行实例，请先完成一次执行',
      });
    }

    const execution = await this.getAuthorizedExecution(userId, workflowExecutionId);
    if (!execution) {
      throw new BadRequestException({
        code: 'CONV_BACKTEST_EXECUTION_NOT_FOUND',
        message: '执行实例不存在或无权限访问',
      });
    }

    const inputConfig = {
      executionId: workflowExecutionId,
      strategySource: dto.strategySource,
      lookbackDays: dto.lookbackDays,
      feeModel: dto.feeModel,
    };

    const backtest = await this.prisma.conversationBacktestJob.create({
      data: {
        sessionId,
        workflowExecutionId,
        status: 'RUNNING',
        inputConfig: inputConfig as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    try {
      const outputRecord = this.toRecord(execution.outputSnapshot);
      const result = this.resultService.normalizeResult(outputRecord);
      const summary = this.computeBacktestSummary(
        result.confidence,
        dto.lookbackDays,
        dto.feeModel,
      );
      const metrics = {
        sampleSize: Math.max(20, Math.round(dto.lookbackDays * 0.35)),
        assumptions: {
          lookbackDays: dto.lookbackDays,
          feeModel: dto.feeModel,
          strategySource: dto.strategySource,
        },
      };

      const completed = await this.prisma.conversationBacktestJob.update({
        where: { id: backtest.id },
        data: {
          status: 'COMPLETED',
          resultSummary: summary as Prisma.InputJsonValue,
          metrics: metrics as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `回测完成：收益 ${summary.returnPct}%，最大回撤 ${summary.maxDrawdownPct}%，胜率 ${summary.winRatePct}%。`,
          structuredPayload: {
            backtestJobId: completed.id,
            status: completed.status,
            summary,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'BACKTEST_SUMMARY',
        title: `回测结果 ${completed.id.slice(0, 8)}`,
        payload: {
          backtestJobId: completed.id,
          summary,
          metrics,
          status: completed.status,
        },
        sourceExecutionId: workflowExecutionId,
      });

      return {
        backtestJobId: completed.id,
        status: completed.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.conversationBacktestJob.update({
        where: { id: backtest.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });
      throw new BadRequestException({
        code: 'CONV_BACKTEST_RUN_FAILED',
        message: errorMessage,
      });
    }
  }

  async getBacktest(userId: string, sessionId: string, backtestJobId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const backtest = await this.prisma.conversationBacktestJob.findFirst({
      where: { id: backtestJobId, sessionId },
    });
    if (!backtest) {
      return null;
    }

    return {
      backtestJobId: backtest.id,
      status: backtest.status,
      summary: this.toRecord(backtest.resultSummary),
      assumptions: this.toRecord(backtest.inputConfig),
      metrics: this.toRecord(backtest.metrics),
      errorMessage: backtest.errorMessage,
      completedAt: backtest.completedAt,
    };
  }

  async listBacktests(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return [];
    }

    const jobs = await this.prisma.conversationBacktestJob.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });

    return jobs.map((job) => ({
      backtestJobId: job.id,
      status: job.status,
      summary: this.toRecord(job.resultSummary),
      assumptions: this.toRecord(job.inputConfig),
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));
  }

  async compareBacktests(userId: string, sessionId: string, jobA: string, jobB: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const [a, b] = await Promise.all([
      this.prisma.conversationBacktestJob.findFirst({
        where: { id: jobA, sessionId },
      }),
      this.prisma.conversationBacktestJob.findFirst({
        where: { id: jobB, sessionId },
      }),
    ]);

    if (!a || !b) {
      throw new BadRequestException({
        code: 'CONV_BACKTEST_COMPARE_INVALID',
        message: '其中一个或两个回测任务不存在',
      });
    }

    const summaryA = this.toRecord(a.resultSummary);
    const summaryB = this.toRecord(b.resultSummary);

    const toNum = (v: unknown): number => (typeof v === 'number' ? v : 0);
    const delta = (key: string) => ({
      a: toNum(summaryA[key]),
      b: toNum(summaryB[key]),
      diff: Number((toNum(summaryB[key]) - toNum(summaryA[key])).toFixed(4)),
    });

    return {
      jobA: { id: a.id, createdAt: a.createdAt, assumptions: this.toRecord(a.inputConfig) },
      jobB: { id: b.id, createdAt: b.createdAt, assumptions: this.toRecord(b.inputConfig) },
      comparison: {
        returnPct: delta('returnPct'),
        maxDrawdownPct: delta('maxDrawdownPct'),
        winRatePct: delta('winRatePct'),
        score: delta('score'),
      },
    };
  }

  async getConflicts(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    let conflicts = await this.prisma.conversationConflictRecord.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
    });

    if (!conflicts.length && session.latestExecutionId && this.isUuid(session.latestExecutionId)) {
      const execution = await this.getAuthorizedExecution(userId, session.latestExecutionId);
      if (execution) {
        const generated = this.resultService.deriveConflictsFromExecutionOutput(execution.outputSnapshot);
        if (generated.length) {
          await this.prisma.conversationConflictRecord.createMany({
            data: generated.map((item) => ({
              sessionId,
              workflowExecutionId: execution.id,
              topic: item.topic,
              consistencyScore: item.consistencyScore,
              sourceA: item.sourceA,
              sourceB: item.sourceB,
              valueA: item.valueA as Prisma.InputJsonValue,
              valueB: item.valueB as Prisma.InputJsonValue,
              resolution: item.resolution,
              resolutionReason: item.reason,
            })),
          });
          conflicts = await this.prisma.conversationConflictRecord.findMany({
            where: { sessionId },
            orderBy: [{ createdAt: 'desc' }],
            take: 20,
          });
        }
      }
    }

    const consistencyScore = this.resultService.computeConflictConsistencyScore(conflicts);

    if (conflicts.length) {
      await this.createConversationAsset({
        sessionId,
        assetType: 'CONFLICT_SUMMARY',
        title: `冲突摘要 ${new Date().toISOString().slice(0, 10)}`,
        payload: {
          consistencyScore,
          conflicts: conflicts.slice(0, 10).map((item) => ({
            conflictId: item.id,
            topic: item.topic,
            sourceA: item.sourceA,
            sourceB: item.sourceB,
            resolution: item.resolution,
            resolutionReason: item.resolutionReason,
            consistencyScore: item.consistencyScore,
          })),
        },
        sourceExecutionId: session.latestExecutionId ?? null,
      });
    }

    return {
      consistencyScore,
      conflicts: conflicts.map((item) => ({
        conflictId: item.id,
        topic: item.topic,
        sources: [item.sourceA, item.sourceB],
        resolution: item.resolution,
        reason: item.resolutionReason,
        consistencyScore: item.consistencyScore,
      })),
    };
  }

  async createSkillDraft(userId: string, sessionId: string, dto: CreateSkillDraftDto) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const derivedRisk = this.resolveSkillRisk(dto);
    const routingPolicy = await this.capabilityService.resolveCapabilityRoutingPolicy(userId);
    const ephemeralPolicy = await this.capabilityService.resolveEphemeralCapabilityPolicy(userId);
    const reuseCandidate = await this.capabilityService.findReusableSkillDraft(userId, dto, ephemeralPolicy);
    if (reuseCandidate) {
      const runtimeGrantId = await this.capabilityService.ensureRuntimeGrantForDraft(
        reuseCandidate.id,
        sessionId,
        userId,
        reuseCandidate.provisionalEnabled,
        ephemeralPolicy,
      );
      const reviewRequired = reuseCandidate.status !== 'PUBLISHED';

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `已复用已有能力草稿：${reuseCandidate.suggestedSkillCode}`,
          structuredPayload: {
            draftId: reuseCandidate.id,
            status: reuseCandidate.status,
            reviewRequired,
            riskLevel: reuseCandidate.riskLevel,
            provisionalEnabled: reuseCandidate.provisionalEnabled,
            runtimeGrantId,
            reused: true,
            reuseSource: reuseCandidate.reuseReason,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'SKILL_DRAFT',
        title: `Skill Draft ${reuseCandidate.suggestedSkillCode}`,
        payload: {
          draftId: reuseCandidate.id,
          gapType: reuseCandidate.gapType,
          requiredCapability: reuseCandidate.requiredCapability,
          suggestedSkillCode: reuseCandidate.suggestedSkillCode,
          status: reuseCandidate.status,
          reused: true,
          reuseSource: reuseCandidate.reuseReason,
        },
        sourceTurnId: null,
      });

      await this.capabilityService.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'SKILL_DRAFT_REUSE',
        routePolicy: ['USER_PRIVATE'],
        selectedSource: reuseCandidate.reuseReason,
        selectedDraftId: reuseCandidate.id,
        selectedSkillCode: reuseCandidate.suggestedSkillCode,
        selectedScore: reuseCandidate.reuseReason === 'EXACT_CODE' ? 1 : 0.72,
        intent: session.currentIntent,
        reason: '复用已有能力草稿，避免重复创建。',
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
          ephemeralCapabilityPolicy: ephemeralPolicy,
        },
      });

      return {
        draftId: reuseCandidate.id,
        status: reuseCandidate.status,
        reviewRequired,
        riskLevel: reuseCandidate.riskLevel,
        provisionalEnabled: reuseCandidate.provisionalEnabled,
        runtimeGrantId,
        reused: true,
        reuseSource: reuseCandidate.reuseReason,
      };
    }

    const reusablePublishedSkill = await this.capabilityService.findReusablePublishedSkill(
      userId,
      dto,
      routingPolicy,
      ephemeralPolicy,
    );
    if (reusablePublishedSkill) {
      const bridgeDraft = await this.capabilityService.upsertPublishedSkillBridgeDraft({
        sessionId,
        ownerUserId: userId,
        dto,
        skill: reusablePublishedSkill,
        derivedRisk,
      });

      await this.prisma.conversationTurn.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: `已复用可用能力：${reusablePublishedSkill.skillCode}，无需重复创建草稿。`,
          structuredPayload: {
            draftId: bridgeDraft.id,
            status: bridgeDraft.status,
            reviewRequired: false,
            riskLevel: bridgeDraft.riskLevel,
            provisionalEnabled: false,
            runtimeGrantId: null,
            reused: true,
            reuseSource: 'PUBLISHED_SKILL',
            publishedSkillId: reusablePublishedSkill.id,
          } as Prisma.InputJsonValue,
        },
      });

      await this.createConversationAsset({
        sessionId,
        assetType: 'SKILL_DRAFT',
        title: `Skill Draft ${bridgeDraft.suggestedSkillCode}`,
        payload: {
          draftId: bridgeDraft.id,
          gapType: bridgeDraft.gapType,
          requiredCapability: bridgeDraft.requiredCapability,
          suggestedSkillCode: bridgeDraft.suggestedSkillCode,
          status: bridgeDraft.status,
          reused: true,
          reuseSource: 'PUBLISHED_SKILL',
          publishedSkillId: reusablePublishedSkill.id,
        },
        sourceTurnId: null,
      });

      await this.capabilityService.logCapabilityRoutingDecisionAsset(sessionId, {
        routeType: 'SKILL_DRAFT_REUSE',
        routePolicy: ['USER_PRIVATE', 'TEAM_OR_PUBLIC'],
        selectedSource: 'PUBLISHED_SKILL',
        selectedDraftId: bridgeDraft.id,
        selectedSkillCode: reusablePublishedSkill.skillCode,
        selectedScore: reusablePublishedSkill.score,
        intent: session.currentIntent,
        reason: '命中可用已发布能力，复用能力并建立本用户映射草稿。',
        routePolicyDetails: {
          capabilityRoutingPolicy: routingPolicy,
          ephemeralCapabilityPolicy: ephemeralPolicy,
        },
      });

      return {
        draftId: bridgeDraft.id,
        status: bridgeDraft.status,
        reviewRequired: false,
        riskLevel: bridgeDraft.riskLevel,
        provisionalEnabled: false,
        runtimeGrantId: null,
        reused: true,
        reuseSource: 'PUBLISHED_SKILL',
      };
    }

    const draftSpec = {
      gapType: dto.gapType,
      requiredCapability: dto.requiredCapability,
      suggestedSkillCode: dto.suggestedSkillCode,
      sourceSessionId: sessionId,
      sourceIntent: session.currentIntent,
      riskLevel: derivedRisk.riskLevel,
      sideEffectRisk: derivedRisk.sideEffectRisk,
    };

    const draft = await this.prisma.agentSkillDraft.create({
      data: {
        sessionId,
        ownerUserId: userId,
        gapType: dto.gapType,
        requiredCapability: dto.requiredCapability,
        suggestedSkillCode: dto.suggestedSkillCode,
        draftSpec: draftSpec as Prisma.InputJsonValue,
        status: 'DRAFT',
        riskLevel: derivedRisk.riskLevel,
        sideEffectRisk: derivedRisk.sideEffectRisk,
        provisionalEnabled: derivedRisk.allowRuntimeGrant,
      },
    });

    await this.prisma.agentSkillGovernanceEvent.create({
      data: {
        ownerUserId: userId,
        draftId: draft.id,
        eventType: 'DRAFT_CREATED',
        message: `Skill Draft 已创建：${draft.id}`,
        payload: {
          riskLevel: derivedRisk.riskLevel,
          sideEffectRisk: derivedRisk.sideEffectRisk,
        } as Prisma.InputJsonValue,
      },
    });

    let runtimeGrantId: string | null = null;
    if (derivedRisk.allowRuntimeGrant) {
      const runtimeGrant = await this.prisma.agentSkillRuntimeGrant.create({
        data: {
          draftId: draft.id,
          sessionId,
          ownerUserId: userId,
          status: 'ACTIVE',
          maxUseCount: ephemeralPolicy.runtimeGrantMaxUseCount,
          expiresAt: new Date(Date.now() + ephemeralPolicy.runtimeGrantTtlHours * 60 * 60 * 1000),
        },
      });
      runtimeGrantId = runtimeGrant.id;

      await this.prisma.agentSkillGovernanceEvent.create({
        data: {
          ownerUserId: userId,
          draftId: draft.id,
          runtimeGrantId: runtimeGrant.id,
          eventType: 'RUNTIME_GRANT_CREATED',
          message: `运行时授权已创建：${runtimeGrant.id}`,
          payload: {
            maxUseCount: runtimeGrant.maxUseCount,
            expiresAt: runtimeGrant.expiresAt,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.conversationTurn.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: `已创建 Skill Draft：${dto.suggestedSkillCode}`,
        structuredPayload: {
          draftId: draft.id,
          status: draft.status,
          reviewRequired: true,
          riskLevel: derivedRisk.riskLevel,
          provisionalEnabled: derivedRisk.allowRuntimeGrant,
          runtimeGrantId,
        } as Prisma.InputJsonValue,
      },
    });

    await this.createConversationAsset({
      sessionId,
      assetType: 'SKILL_DRAFT',
      title: `Skill Draft ${dto.suggestedSkillCode}`,
      payload: {
        draftId: draft.id,
        gapType: dto.gapType,
        requiredCapability: dto.requiredCapability,
        suggestedSkillCode: dto.suggestedSkillCode,
        status: draft.status,
      },
      sourceTurnId: null,
    });

    await this.capabilityService.logCapabilityRoutingDecisionAsset(sessionId, {
      routeType: 'SKILL_DRAFT_CREATE',
      routePolicy: ['USER_PRIVATE'],
      selectedSource: 'NEW_DRAFT',
      selectedDraftId: draft.id,
      selectedSkillCode: dto.suggestedSkillCode,
      selectedScore: 0,
      intent: session.currentIntent,
      reason: '未命中可复用草稿，创建新草稿。',
      routePolicyDetails: {
        capabilityRoutingPolicy: routingPolicy,
        ephemeralCapabilityPolicy: ephemeralPolicy,
      },
    });

    return {
      draftId: draft.id,
      status: draft.status,
      reviewRequired: true,
      riskLevel: derivedRisk.riskLevel,
      provisionalEnabled: derivedRisk.allowRuntimeGrant,
      runtimeGrantId,
      reused: false,
      reuseSource: 'NEW_DRAFT',
    };
  }

  async listAssets(userId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    return this.prisma.conversationAsset.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  async reuseAsset(
    userId: string,
    sessionId: string,
    assetId: string,
    dto: ReuseConversationAssetDto,
  ) {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, ownerUserId: userId },
    });
    if (!session) {
      return null;
    }

    const asset = await this.prisma.conversationAsset.findFirst({
      where: { id: assetId, sessionId },
    });
    if (!asset) {
      return null;
    }

    const reuseMessage = dto.message?.trim() || `请基于资产「${asset.title}」继续处理。`;
    return this.createTurn(userId, sessionId, {
      message: reuseMessage,
      contextPatch: {
        ...(dto.contextPatch ?? {}),
        reusedAssetId: asset.id,
      },
    });
  }

  private shouldAutoExecute(contextPatch?: Record<string, unknown>): boolean {
    const explicit = contextPatch?.autoExecute;
    if (typeof explicit === 'boolean') {
      return explicit;
    }
    return true;
  }

  private extractAssetReferenceIds(message: string): string[] {
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
        if (this.isUuid(id)) {
          ids.add(id);
        }
        match = pattern.exec(message);
      }
    }
    return Array.from(ids);
  }

  private async resolveFollowupAssetReference(
    sessionId: string,
    message: string,
  ): Promise<{
    assetIds: string[];
    resolution: Record<string, unknown> | null;
  }> {
    const rank = this.extractOrdinalReference(message);
    if (!rank) {
      return {
        assetIds: [],
        resolution: null,
      };
    }

    const roundOffset = this.extractFollowupRoundOffset(message);

    const assistants = await this.prisma.conversationTurn.findMany({
      where: {
        sessionId,
        role: 'ASSISTANT',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        structuredPayload: true,
      },
    });

    const candidateTurns = assistants.filter((turn) => {
      const payload = this.toRecord(turn.structuredPayload);
      const reuseResolution = this.toRecord(payload.reuseResolution);
      const semanticResolution = this.toRecord(reuseResolution.semanticResolution);
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

    const payload = this.toRecord(selectedTurn.structuredPayload);
    const reuseResolution = this.toRecord(payload.reuseResolution);
    const semanticResolution = this.toRecord(reuseResolution.semanticResolution);
    const topCandidatesRaw = semanticResolution.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.toRecord(item))
      : [];
    const selected = topCandidates[rank - 1];
    const selectedId = this.pickString(selected.id);
    if (selectedId && this.isUuid(selectedId)) {
      return {
        assetIds: [selectedId],
        resolution: {
          mode: 'followup',
          roundOffset,
          requestedRank: rank,
          selectedAssetId: selectedId,
          selectedAssetTitle: this.pickString(selected.title),
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

  private inferSemanticAssetType(
    message: string,
  ):
    | 'PLAN'
    | 'EXECUTION'
    | 'RESULT_SUMMARY'
    | 'EXPORT_FILE'
    | 'BACKTEST_SUMMARY'
    | 'CONFLICT_SUMMARY'
    | 'SKILL_DRAFT'
    | null {
    if (message.includes('回测')) {
      return 'BACKTEST_SUMMARY';
    }
    if (message.includes('冲突')) {
      return 'CONFLICT_SUMMARY';
    }
    if (message.includes('导出') || message.includes('原文件') || message.includes('报告文件')) {
      return 'EXPORT_FILE';
    }
    if (message.includes('草稿') || message.toLowerCase().includes('skill')) {
      return 'SKILL_DRAFT';
    }
    if (message.includes('执行实例')) {
      return 'EXECUTION';
    }
    if (message.includes('计划')) {
      return 'PLAN';
    }
    if (message.includes('结果') || message.includes('结论') || message.includes('分析')) {
      return 'RESULT_SUMMARY';
    }
    return null;
  }

  private inferSemanticAssetOffset(message: string): number {
    if (message.includes('上上次') || message.includes('倒数第二') || message.includes('第二新')) {
      return 1;
    }
    return 0;
  }

  private async resolveSemanticAssetReferences(
    sessionId: string,
    message: string,
  ): Promise<{
    assetIds: string[];
    resolution: Record<string, unknown> | null;
  }> {
    if (!this.shouldResolveSemanticAssetReference(message)) {
      return {
        assetIds: [],
        resolution: null,
      };
    }

    const assetType = this.inferSemanticAssetType(message);
    const offset = this.inferSemanticAssetOffset(message);
    const explicitDisambiguated = offset > 0;

    const assets = await this.prisma.conversationAsset.findMany({
      where: {
        sessionId,
        assetType: assetType || undefined,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
      select: {
        id: true,
        title: true,
        assetType: true,
        createdAt: true,
      },
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
        return {
          ...asset,
          score: recencyScore + keywordScore + typeBonus,
        };
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

  private buildReuseReceiptMessage(
    referencedAssets: Array<{ id: string; title: string; assetType: string }>,
    resolution?: Record<string, unknown>,
  ) {
    const semantic = this.toRecord(resolution?.semanticResolution);
    const followup = this.toRecord(resolution?.followupResolution);
    const ambiguous = semantic.ambiguous === true;
    const candidateCount = this.normalizeNumber(semantic.candidateCount);
    const topCandidatesRaw = semantic.topCandidates;
    const topCandidates = Array.isArray(topCandidatesRaw)
      ? topCandidatesRaw.map((item) => this.toRecord(item)).slice(0, 3)
      : [];

    if (!referencedAssets.length) {
      if (candidateCount === 0) {
        return '未匹配到可复用资产。你可以说“用最近一次回测结果”或直接使用 [asset:<id>]。';
      }
      return '';
    }

    const selected = referencedAssets[0];
    if (this.pickString(followup.selectedAssetId)) {
      return `已按序号复用资产：${selected.title}。`;
    }
    if (ambiguous && candidateCount > 1) {
      const candidateTips = topCandidates
        .map(
          (item, index) =>
            `${index + 1}.${this.pickString(item.title) || this.pickString(item.id) || '-'}`,
        )
        .join('；');
      return `已为你匹配并复用资产：${selected.title}（候选 ${candidateCount} 项，已自动选择最相关项。可回复“用第2个”重新指定。候选：${candidateTips}）`;
    }
    return `已复用资产：${selected.title}。`;
  }

  private mergeDeliveryRecipients(primary?: string[], fallback?: string[]): string[] {
    const merged = [...(primary ?? []), ...(fallback ?? [])]
      .map((item) => item.trim())
      .filter(Boolean);
    return merged.filter((item, index) => merged.indexOf(item) === index);
  }

  private async createConversationAsset(input: {
    sessionId: string;
    assetType:
    | 'PLAN'
    | 'EXECUTION'
    | 'RESULT_SUMMARY'
    | 'EXPORT_FILE'
    | 'BACKTEST_SUMMARY'
    | 'CONFLICT_SUMMARY'
    | 'SKILL_DRAFT'
    | 'NOTE';
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

  private resolveSkillRisk(dto: CreateSkillDraftDto): {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    sideEffectRisk: boolean;
    allowRuntimeGrant: boolean;
  } {
    const message =
      `${dto.gapType} ${dto.requiredCapability} ${dto.suggestedSkillCode}`.toLowerCase();
    const explicitRisk = dto.riskLevel;
    const explicitSideEffect = dto.sideEffectRisk === true;

    const hasHighRiskKeyword =
      message.includes('下单') ||
      message.includes('自动下单') ||
      message.includes('交易执行') ||
      message.includes('写库') ||
      message.includes('扣费') ||
      message.includes('payment') ||
      message.includes('trade execution') ||
      message.includes('place order') ||
      message.includes('create order');

    const hasMediumRiskKeyword =
      message.includes('外发') ||
      message.includes('推送') ||
      message.includes('webhook') ||
      message.includes('send');

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = explicitRisk
      ? explicitRisk
      : hasHighRiskKeyword
        ? 'HIGH'
        : hasMediumRiskKeyword
          ? 'MEDIUM'
          : 'LOW';

    const sideEffectRisk = explicitSideEffect || riskLevel !== 'LOW';
    const allowRuntimeGrant = riskLevel === 'LOW' && !sideEffectRisk;

    return {
      riskLevel,
      sideEffectRisk,
      allowRuntimeGrant,
    };
  }

  private detectIntent(message: string, currentIntent?: string | null): IntentCode {
    const lower = message.toLowerCase();
    if (lower.includes('辩论') || lower.includes('debate') || lower.includes('裁判')) {
      return 'DEBATE_MARKET_JUDGEMENT';
    }
    if (
      currentIntent === 'DEBATE_MARKET_JUDGEMENT' ||
      currentIntent === 'MARKET_SUMMARY_WITH_FORECAST'
    ) {
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

  private buildSlotPrompt(missingSlots: string[], _intent?: IntentCode): string {
    const questionMap: Record<string, string> = {
      timeRange: '你想分析哪个时间段的数据呢？比如"最近一周"或"最近一个月"',
      region: '分析哪个地区的数据？比如"东北地区"或"全国"',
      outputFormat: '你希望以什么形式查看结果？比如"分析报告"或"数据表格"',
      topic: '你想讨论什么主题？',
      judgePolicy: '你希望用什么方式来裁判辩论结果？',
    };

    if (missingSlots.length === 1) {
      return questionMap[missingSlots[0]] ?? '还需要补充一个信息：' + missingSlots[0];
    }
    const questions = missingSlots.map((slot) => questionMap[slot] ?? slot).join('\n- ');
    return '还需要你补充几个信息：\n- ' + questions + '\n\n你可以一次性告诉我，也可以逐个回答。';
  }

  /**
   * 补槽默认值：减少 SLOT_FILLING 触发频率，让更多对话直接进入执行
   */
  private applySlotDefaults(slots: SlotMap, intent: IntentCode): SlotMap {
    const defaults: Partial<SlotMap> = {
      timeRange: '最近一周',
      region: '全国',
      outputFormat: ['分析报告'],
    };
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      (defaults as Record<string, unknown>).judgePolicy = 'balanced';
    }
    const result = { ...slots };
    for (const [key, value] of Object.entries(defaults)) {
      if (this.isSlotMissing(result[key as keyof SlotMap])) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  }

  /**
   * 操作意图检测：从自然语言中识别导出、邮件、重试等操作意图
   */
  private detectActionIntent(
    message: string,
    sessionState: SessionState,
  ): {
    type: 'EXPORT' | 'DELIVER_EMAIL' | 'RETRY' | 'SCHEDULE' | null;
    format?: string;
    emailTo?: string[];
    cronNatural?: string;
  } {
    const lower = message.trim().toLowerCase();

    // 导出意图
    if (
      /导出|下载|生成pdf|生成报告|export/.test(lower) &&
      (sessionState === 'DONE' || sessionState === 'RESULT_DELIVERY')
    ) {
      const format = /excel|xlsx|csv/.test(lower) ? 'EXCEL' : 'PDF';
      return { type: 'EXPORT', format };
    }

    // 邮件发送意图
    if (
      /发[到给]邮箱|邮件|发送邮件|email|send.*mail/.test(lower) &&
      (sessionState === 'DONE' || sessionState === 'RESULT_DELIVERY')
    ) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = message.match(emailRegex) ?? [];
      return { type: 'DELIVER_EMAIL', emailTo: emails.length > 0 ? emails : undefined };
    }

    // 重试意图
    if (
      /重[新试来]|再来|再[分做执]|retry/.test(lower) &&
      (sessionState === 'FAILED' || sessionState === 'DONE')
    ) {
      return { type: 'RETRY' };
    }

    // 定时任务意图
    if (/每[天周月日]|定[时期]|自动执行|schedule|cron/.test(lower)) {
      return { type: 'SCHEDULE', cronNatural: message };
    }

    return { type: null };
  }

  private buildReplyOptions(input: {
    hasMissingSlots: boolean;
    missingSlots: string[];
    autoExecution: boolean;
    intent: IntentCode;
    slots: SlotMap;
  }): ReplyOption[] {
    if (input.hasMissingSlots) {
      const targetSlot = input.missingSlots[0] || 'timeRange';
      const defaults: Record<string, string[]> = {
        timeRange: ['最近7天', '最近30天'],
        region: ['东北', '华北'],
        outputFormat: ['markdown', 'json'],
      };
      const values = defaults[targetSlot] ?? ['使用默认值'];
      return [...values.slice(0, 2), '使用默认值'].map((value, index) => ({
        id: `slot_${targetSlot}_${index + 1}`,
        label: value,
        mode: 'SEND',
        value: value === '使用默认值' ? '用默认值继续' : value,
      }));
    }

    const options: ReplyOption[] = [];
    if (input.autoExecution) {
      options.push({
        id: 'view_result',
        label: '查看结果',
        mode: 'OPEN_TAB',
        tab: 'result',
      });
    } else {
      options.push({
        id: 'confirm_run',
        label: '开始执行',
        mode: 'OPEN_TAB',
        tab: 'progress',
      });
    }

    const region = this.pickString(input.slots.region) ?? '华北';
    options.push({
      id: 'refine_region',
      label: `改成${region === '东北' ? '华北' : '东北'}范围`,
      mode: 'SEND',
      value: `改成${region === '东北' ? '华北' : '东北'}范围再分析一次`,
    });
    options.push({
      id: 'deliver_report',
      label: '发送报告',
      mode: 'OPEN_TAB',
      tab: 'delivery',
    });
    options.push({
      id: 'summarize_next_actions',
      label: '给我三条行动建议',
      mode: 'SEND',
      value: '请基于当前结论给我三条可执行行动建议。',
    });
    options.push({
      id: 'schedule_report',
      label: '设置定时发送',
      mode: 'OPEN_TAB',
      tab: 'schedule',
    });

    return options.slice(0, 4);
  }

  private async tryEnhanceAssistantReplyWithLLM(input: {
    userMessage: string;
    assistantMessage: string;
    hasMissingSlots: boolean;
    missingSlots: string[];
    autoExecution: boolean;
    intent: IntentCode;
    slots: SlotMap;
    fallbackReplyOptions: ReplyOption[];
  }): Promise<{ assistantMessage: string; replyOptions: ReplyOption[] } | null> {
    if (process.env.AGENT_COPILOT_LLM_REPLY_ENABLED === 'false') {
      return null;
    }

    const model = await this.aiModelService.getSystemModelConfig();
    if (!model) {
      return null;
    }

    try {
      const provider = this.aiProviderFactory.getProvider(model.provider);
      const systemPrompt = [
        '你是面向普通用户的中文对话助手。',
        '你的目标是：降低理解门槛，给出简洁可执行回复。',
        '请严格输出 JSON，不要输出 markdown。',
        'JSON 结构：{"assistantMessage": string, "replyOptions": [{"id": string, "label": string, "mode": "SEND"|"OPEN_TAB", "value"?: string, "tab"?: "progress"|"result"|"delivery"|"schedule"}]}',
        '要求：assistantMessage 不超过 120 字；replyOptions 2-4 个；label 用普通中文短句。',
      ].join('\n');

      const userPrompt = JSON.stringify(
        {
          userMessage: input.userMessage,
          currentAssistantDraft: input.assistantMessage,
          state: {
            hasMissingSlots: input.hasMissingSlots,
            missingSlots: input.missingSlots,
            autoExecution: input.autoExecution,
            intent: input.intent,
            slots: input.slots,
          },
          fallbackReplyOptions: input.fallbackReplyOptions,
        },
        null,
        2,
      );

      const raw = await provider.generateResponse(systemPrompt, userPrompt, {
        modelName: model.modelId,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
        wireApi: model.wireApi,
        temperature: 0.2,
        maxTokens: 300,
        timeoutSeconds: 10,
        maxRetries: 1,
      });

      const parsed = this.parseJsonObject(raw);
      if (!parsed) {
        return null;
      }

      const assistantMessage = this.pickString(parsed.assistantMessage) ?? input.assistantMessage;
      const replyOptions = this.normalizeReplyOptions(
        parsed.replyOptions,
        input.fallbackReplyOptions,
      );

      return {
        assistantMessage,
        replyOptions,
      };
    } catch {
      return null;
    }
  }

  private parseJsonObject(value: string): Record<string, unknown> | null {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      const block = text.match(/\{[\s\S]*\}/);
      if (!block) {
        return null;
      }
      try {
        const parsed = JSON.parse(block[0]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
  }

  private normalizeReplyOptions(raw: unknown, fallback: ReplyOption[]): ReplyOption[] {
    if (!Array.isArray(raw)) {
      return fallback;
    }

    const normalized = raw
      .map((item) => this.toRecord(item))
      .map((item, index) => {
        const mode = this.pickString(item.mode);
        const normalizedMode = mode === 'OPEN_TAB' ? 'OPEN_TAB' : 'SEND';
        const label = this.pickString(item.label) ?? '';
        const tabRaw = this.pickString(item.tab);
        const tab =
          tabRaw === 'progress' ||
            tabRaw === 'result' ||
            tabRaw === 'delivery' ||
            tabRaw === 'schedule'
            ? (tabRaw as 'progress' | 'result' | 'delivery' | 'schedule')
            : undefined;
        return {
          id: this.pickString(item.id) ?? `llm_option_${index + 1}`,
          label,
          mode: normalizedMode as 'SEND' | 'OPEN_TAB',
          value: this.pickString(item.value) ?? undefined,
          tab,
        };
      })
      .filter((item) => item.label)
      .slice(0, 4);

    return normalized.length ? normalized : fallback;
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

  private toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
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

  private async getAuthorizedExecution(userId: string, executionId: string) {
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
      return null;
    }
    const definitionOwner = execution.workflowVersion.workflowDefinition.ownerUserId;
    if (execution.triggerUserId !== userId && definitionOwner !== userId) {
      return null;
    }
    return execution;
  }

  private computeBacktestSummary(
    confidence: number,
    lookbackDays: number,
    feeModel: { spotFeeBps: number; futuresFeeBps: number },
  ) {
    const normalizedConfidence = Math.max(0, Math.min(1, confidence || 0));
    const feePenalty = (feeModel.spotFeeBps + feeModel.futuresFeeBps) / 1000;
    const horizonFactor = Math.min(1, Math.max(0.3, lookbackDays / 365));
    const grossReturn = normalizedConfidence * 18 * horizonFactor;
    const netReturn = grossReturn - feePenalty;
    const maxDrawdown = -Math.max(1.2, 10 - normalizedConfidence * 6 + feePenalty * 2);
    const winRate = Math.max(35, Math.min(82, 45 + normalizedConfidence * 30 - feePenalty * 3));
    const score = Math.max(0, Math.min(1, netReturn / 20 + (winRate - 50) / 100 + 0.4));

    return {
      returnPct: Number(netReturn.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
      winRatePct: Number(winRate.toFixed(2)),
      score: Number(score.toFixed(3)),
    };
  }

  private async pickWorkflowDefinitionCandidate(
    ownerUserId: string,
    intent: IntentCode,
    slots: SlotMap,
    policy: CapabilityRoutingPolicy,
  ): Promise<{
    id: string;
    reuseSource: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC';
    score: number;
  } | null> {
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

    const candidates = await this.prisma.workflowDefinition.findMany({
      where: {
        OR: whereOr,
        isActive: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        ownerUserId: true,
        templateSource: true,
        isPublished: true,
        stars: true,
        name: true,
        description: true,
      },
    });

    if (!candidates.length) {
      return null;
    }

    const keywords = this.buildWorkflowCapabilityKeywords(intent, slots);
    let best: { id: string; reuseSource: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC'; score: number } | null =
      null;

    for (const candidate of candidates) {
      let score = candidate.ownerUserId === ownerUserId ? 0.45 : 0.2;
      if (candidate.templateSource === 'PUBLIC') {
        score += 0.08;
      }
      if (candidate.isPublished) {
        score += 0.08;
      }
      score += Math.min(0.1, (candidate.stars ?? 0) / 1000);

      const haystack = `${candidate.name} ${candidate.description ?? ''}`.toLowerCase();
      const hitCount = keywords.filter((keyword) => haystack.includes(keyword)).length;
      score += Math.min(0.29, hitCount * 0.06);

      const normalized = Number(score.toFixed(3));
      if (candidate.ownerUserId !== ownerUserId && normalized < policy.minPublicScore) {
        continue;
      }
      if (candidate.ownerUserId === ownerUserId && normalized < policy.minOwnerScore) {
        continue;
      }

      if (!best || normalized > best.score) {
        best = {
          id: candidate.id,
          reuseSource: candidate.ownerUserId === ownerUserId ? 'USER_PRIVATE' : 'TEAM_OR_PUBLIC',
          score: normalized,
        };
      }
    }

    if (policy.preferOwnerFirst) {
      const ownerBest = candidates
        .filter((item) => item.ownerUserId === ownerUserId)
        .map((candidate) => {
          let score = 0.45;
          if (candidate.isPublished) {
            score += 0.08;
          }
          score += Math.min(0.1, (candidate.stars ?? 0) / 1000);
          const haystack = `${candidate.name} ${candidate.description ?? ''}`.toLowerCase();
          const hitCount = keywords.filter((keyword) => haystack.includes(keyword)).length;
          score += Math.min(0.29, hitCount * 0.06);
          return {
            id: candidate.id,
            score: Number(score.toFixed(3)),
          };
        })
        .filter((item) => item.score >= policy.minOwnerScore)
        .sort((a, b) => b.score - a.score)[0];
      if (ownerBest) {
        return {
          id: ownerBest.id,
          reuseSource: 'USER_PRIVATE',
          score: ownerBest.score,
        };
      }
    }

    return best;
  }

  private buildWorkflowCapabilityKeywords(intent: IntentCode, slots: SlotMap): string[] {
    const keywords = new Set<string>();
    if (intent === 'DEBATE_MARKET_JUDGEMENT') {
      keywords.add('辩论');
      keywords.add('debate');
      keywords.add('judge');
      keywords.add('裁判');
    } else {
      keywords.add('市场');
      keywords.add('分析');
      keywords.add('summary');
      keywords.add('forecast');
    }

    const region = this.pickString(slots.region);
    const timeRange = this.pickString(slots.timeRange);
    if (region) {
      keywords.add(region.toLowerCase());
    }
    if (timeRange) {
      keywords.add(timeRange.toLowerCase());
    }
    return Array.from(keywords);
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

  // ─── copilot-v2 灰度开关 ───────────────────────────────────────────────

  // ─── DeliveryChannelBinding 独立查询 ────────────────────────────────────

  // ─── ConversationSchedulePolicy 独立查询 ─────────────────────────────────

  // ── Phase 7: 动态编排 Facade Delegates ──────────────────────────────────

  async synthesizeResult(sessionId: string, executionResult: Record<string, unknown>) {
    return this.synthesizerService.synthesizeResult(sessionId, executionResult);
  }

  buildReportCards(report: Parameters<typeof this.synthesizerService.buildReportCards>[0]) {
    return this.synthesizerService.buildReportCards(report);
  }

  async generateEphemeralAgent(
    userId: string,
    sessionId: string,
    request: { userInstruction: string; context?: string },
  ) {
    return this.orchestratorService.generateEphemeralAgent(userId, sessionId, request);
  }

  async listEphemeralAgents(userId: string, sessionId: string) {
    return this.orchestratorService.listEphemeralAgents(userId, sessionId);
  }

  async getAvailableAgents(userId: string, sessionId: string) {
    return this.orchestratorService.getAvailableAgents(userId, sessionId);
  }

  async assembleEphemeralWorkflow(
    userId: string,
    sessionId: string,
    request: { userInstruction: string; context?: string },
  ) {
    return this.orchestratorService.assembleEphemeralWorkflow(userId, sessionId, request);
  }

  async applyEphemeralOverrides(userId: string, sessionId: string, userMessage: string) {
    return this.orchestratorService.applyEphemeralOverrides(userId, sessionId, userMessage);
  }

  async promoteEphemeralAgent(
    userId: string,
    sessionId: string,
    agentAssetId: string,
    dto?: { reviewComment?: string },
  ) {
    return this.orchestratorService.promoteEphemeralAgent(userId, sessionId, agentAssetId, dto);
  }

  async getObservabilitySummary(userId: string, query: ConversationObservabilitySummaryQueryDto) {
    const now = new Date();
    const windowDays = Math.min(
      90,
      Math.max(1, Math.round(this.normalizeNumber(query.windowDays) || 7)),
    );
    const maxSessions = Math.min(
      2000,
      Math.max(50, Math.round(this.normalizeNumber(query.maxSessions) || 500)),
    );
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const totalSessionsInWindow = await this.prisma.conversationSession.count({
      where: {
        ownerUserId: userId,
        createdAt: { gte: windowStart },
      },
    });

    const sampledSessions = await this.prisma.conversationSession.findMany({
      where: {
        ownerUserId: userId,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
      take: maxSessions,
      select: {
        id: true,
      },
    });

    const sessionIds = sampledSessions.map((item) => item.id);

    if (sessionIds.length === 0) {
      return {
        generatedAt: now.toISOString(),
        windowDays,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
        sessionsInWindow: totalSessionsInWindow,
        sampledSessions: 0,
        truncated: false,
        totals: {
          sessionsWithUserTurn: 0,
          sessionsWithExecution: 0,
          executions: 0,
          completedExecutions: 0,
          successExecutions: 0,
          failedExecutions: 0,
        },
        successRate: 0,
        firstResponseLatency: {
          sampleSize: 0,
          p50Ms: null,
          p95Ms: null,
        },
        acceptanceLatency: {
          sampleSize: 0,
          p50Ms: null,
          p95Ms: null,
        },
        completionLatency: {
          sampleSize: 0,
          p50Ms: null,
          p95Ms: null,
        },
        citationCoverage: {
          executionWithFacts: 0,
          totalFacts: 0,
          citedFacts: 0,
          coverageRate: 0,
        },
      };
    }

    const turns = await this.prisma.conversationTurn.findMany({
      where: {
        sessionId: { in: sessionIds },
        role: { in: ['USER', 'ASSISTANT'] },
      },
      orderBy: [{ sessionId: 'asc' }, { createdAt: 'asc' }],
      select: {
        sessionId: true,
        role: true,
        createdAt: true,
      },
    });

    const firstUserTurnBySession = new Map<string, Date>();
    const firstAssistantTurnBySession = new Map<string, Date>();
    for (const turn of turns) {
      if (turn.role === 'USER') {
        if (!firstUserTurnBySession.has(turn.sessionId)) {
          firstUserTurnBySession.set(turn.sessionId, turn.createdAt);
        }
        continue;
      }
      const firstUserTurn = firstUserTurnBySession.get(turn.sessionId);
      if (!firstUserTurn) {
        continue;
      }
      if (!firstAssistantTurnBySession.has(turn.sessionId) && turn.createdAt >= firstUserTurn) {
        firstAssistantTurnBySession.set(turn.sessionId, turn.createdAt);
      }
    }

    const firstResponseLatencyValues: number[] = [];
    for (const [sessionId, firstUserTurn] of firstUserTurnBySession.entries()) {
      const firstAssistantTurn = firstAssistantTurnBySession.get(sessionId);
      if (!firstAssistantTurn) {
        continue;
      }
      firstResponseLatencyValues.push(firstAssistantTurn.getTime() - firstUserTurn.getTime());
    }

    const confirmedPlans = await this.prisma.conversationPlan.findMany({
      where: {
        sessionId: { in: sessionIds },
        isConfirmed: true,
        confirmedAt: { not: null },
      },
      orderBy: [{ sessionId: 'asc' }, { confirmedAt: 'asc' }],
      select: {
        sessionId: true,
        confirmedAt: true,
        workflowExecutionId: true,
      },
    });

    const firstConfirmedPlanBySession = new Map<
      string,
      {
        confirmedAt: Date;
        workflowExecutionId: string | null;
      }
    >();

    for (const plan of confirmedPlans) {
      if (firstConfirmedPlanBySession.has(plan.sessionId) || !plan.confirmedAt) {
        continue;
      }
      firstConfirmedPlanBySession.set(plan.sessionId, {
        confirmedAt: plan.confirmedAt,
        workflowExecutionId: this.pickString(plan.workflowExecutionId),
      });
    }

    const acceptanceLatencyValues: number[] = [];
    const executionIds = new Set<string>();
    for (const [sessionId, plan] of firstConfirmedPlanBySession.entries()) {
      const firstUserTurn = firstUserTurnBySession.get(sessionId);
      if (firstUserTurn) {
        acceptanceLatencyValues.push(plan.confirmedAt.getTime() - firstUserTurn.getTime());
      }
      if (plan.workflowExecutionId) {
        executionIds.add(plan.workflowExecutionId);
      }
    }

    const executions = executionIds.size
      ? await this.prisma.workflowExecution.findMany({
        where: {
          id: { in: Array.from(executionIds) },
        },
        select: {
          id: true,
          status: true,
          completedAt: true,
          outputSnapshot: true,
        },
      })
      : [];

    const executionById = new Map(executions.map((item) => [item.id, item]));
    const completionLatencyValues: number[] = [];
    let completedExecutions = 0;
    let successExecutions = 0;
    let failedExecutions = 0;
    let executionWithFacts = 0;
    let totalFacts = 0;
    let citedFacts = 0;

    for (const execution of executions) {
      if (execution.status === 'SUCCESS') {
        successExecutions += 1;
      }
      if (execution.status === 'FAILED' || execution.status === 'CANCELED') {
        failedExecutions += 1;
      }
      if (
        execution.status === 'SUCCESS' ||
        execution.status === 'FAILED' ||
        execution.status === 'CANCELED'
      ) {
        completedExecutions += 1;
      }

      const outputRecord = this.toRecord(execution.outputSnapshot);
      const facts = this.resultService.normalizeFacts(outputRecord.facts);
      if (facts.length > 0) {
        executionWithFacts += 1;
      }
      totalFacts += facts.length;
      citedFacts += facts.filter((fact) => fact.citations.length > 0).length;
    }

    for (const [sessionId, plan] of firstConfirmedPlanBySession.entries()) {
      const executionId = plan.workflowExecutionId;
      const firstUserTurn = firstUserTurnBySession.get(sessionId);
      if (!executionId || !firstUserTurn) {
        continue;
      }
      const execution = executionById.get(executionId);
      if (!execution?.completedAt) {
        continue;
      }
      completionLatencyValues.push(execution.completedAt.getTime() - firstUserTurn.getTime());
    }

    const successRate =
      completedExecutions > 0
        ? successExecutions / completedExecutions
        : successExecutions > 0
          ? 1
          : 0;
    const citationCoverageRate = totalFacts > 0 ? citedFacts / totalFacts : 0;
    const traceCoveredExecutions = Array.from(firstConfirmedPlanBySession.values()).filter(
      (plan) => !!plan.workflowExecutionId && executionById.has(plan.workflowExecutionId),
    ).length;
    const traceCoverageRate =
      firstConfirmedPlanBySession.size > 0
        ? traceCoveredExecutions / firstConfirmedPlanBySession.size
        : 0;

    const firstResponseLatency = this.buildLatencyPercentileSummary(firstResponseLatencyValues);
    const acceptanceLatency = this.buildLatencyPercentileSummary(acceptanceLatencyValues);
    const completionLatency = this.buildLatencyPercentileSummary(completionLatencyValues);
    const nfrGate = this.buildObservabilityNfrGate({
      firstResponseP95Ms: firstResponseLatency.p95Ms,
      acceptanceP95Ms: acceptanceLatency.p95Ms,
      completionP95Ms: completionLatency.p95Ms,
      successRate,
      citationCoverageRate,
      traceCoverageRate,
    });

    return {
      generatedAt: now.toISOString(),
      windowDays,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      sessionsInWindow: totalSessionsInWindow,
      sampledSessions: sampledSessions.length,
      truncated: totalSessionsInWindow > sampledSessions.length,
      totals: {
        sessionsWithUserTurn: firstUserTurnBySession.size,
        sessionsWithExecution: firstConfirmedPlanBySession.size,
        executions: executions.length,
        completedExecutions,
        successExecutions,
        failedExecutions,
      },
      successRate: Number(successRate.toFixed(4)),
      firstResponseLatency,
      acceptanceLatency,
      completionLatency,
      citationCoverage: {
        executionWithFacts,
        totalFacts,
        citedFacts,
        coverageRate: Number(citationCoverageRate.toFixed(4)),
      },
      nfrGate,
    };
  }

  private buildObservabilityNfrGate(input: {
    firstResponseP95Ms: number | null;
    acceptanceP95Ms: number | null;
    completionP95Ms: number | null;
    successRate: number;
    citationCoverageRate: number;
    traceCoverageRate: number;
  }) {
    const thresholdFirstResponseP95Ms = this.resolveNfrThreshold(
      process.env.CONV_NFR_FIRST_RESPONSE_P95_MS,
      3000,
      100,
      120000,
    );
    const thresholdAcceptanceP95Ms = this.resolveNfrThreshold(
      process.env.CONV_NFR_ACCEPTANCE_P95_MS,
      2000,
      100,
      120000,
    );
    const thresholdCompletionP95Ms = this.resolveNfrThreshold(
      process.env.CONV_NFR_COMPLETION_P95_MS,
      30000,
      500,
      600000,
    );
    const thresholdSuccessRate = this.resolveNfrThreshold(
      process.env.CONV_NFR_SUCCESS_RATE_MIN,
      0.99,
      0,
      1,
    );
    const thresholdCitationCoverage = this.resolveNfrThreshold(
      process.env.CONV_NFR_CITATION_COVERAGE_MIN,
      0.95,
      0,
      1,
    );
    const thresholdTraceCoverage = this.resolveNfrThreshold(
      process.env.CONV_NFR_TRACE_COVERAGE_MIN,
      1,
      0,
      1,
    );

    const checks = [
      {
        id: 'NFR-001',
        label: '对话首响应 P95',
        target: `<= ${thresholdFirstResponseP95Ms}ms`,
        actual: input.firstResponseP95Ms,
        passed:
          input.firstResponseP95Ms !== null &&
          input.firstResponseP95Ms <= thresholdFirstResponseP95Ms,
      },
      {
        id: 'NFR-002',
        label: '执行受理响应 P95',
        target: `<= ${thresholdAcceptanceP95Ms}ms`,
        actual: input.acceptanceP95Ms,
        passed: input.acceptanceP95Ms !== null && input.acceptanceP95Ms <= thresholdAcceptanceP95Ms,
      },
      {
        id: 'NFR-003',
        label: '工作流端到端成功率',
        target: `>= ${(thresholdSuccessRate * 100).toFixed(1)}%`,
        actual: Number((input.successRate * 100).toFixed(2)),
        passed: input.successRate >= thresholdSuccessRate,
      },
      {
        id: 'NFR-004',
        label: '核心链路 trace 覆盖率',
        target: `>= ${(thresholdTraceCoverage * 100).toFixed(1)}%`,
        actual: Number((input.traceCoverageRate * 100).toFixed(2)),
        passed: input.traceCoverageRate >= thresholdTraceCoverage,
      },
      {
        id: 'NFR-005',
        label: '事实型回答引用覆盖率',
        target: `>= ${(thresholdCitationCoverage * 100).toFixed(1)}%`,
        actual: Number((input.citationCoverageRate * 100).toFixed(2)),
        passed: input.citationCoverageRate >= thresholdCitationCoverage,
      },
      {
        id: 'NFR-006',
        label: '端到端完成时延 P95',
        target: `<= ${thresholdCompletionP95Ms}ms`,
        actual: input.completionP95Ms,
        passed: input.completionP95Ms !== null && input.completionP95Ms <= thresholdCompletionP95Ms,
      },
    ];

    const passed = checks.every((item) => item.passed);
    return {
      passed,
      generatedAt: new Date().toISOString(),
      thresholds: {
        firstResponseP95Ms: thresholdFirstResponseP95Ms,
        acceptanceP95Ms: thresholdAcceptanceP95Ms,
        completionP95Ms: thresholdCompletionP95Ms,
        successRateMin: thresholdSuccessRate,
        citationCoverageMin: thresholdCitationCoverage,
        traceCoverageMin: thresholdTraceCoverage,
      },
      checks,
    };
  }

  private resolveNfrThreshold(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = this.readNumberOrNull(value);
    if (parsed === null) {
      return fallback;
    }
    if (parsed < min) {
      return min;
    }
    if (parsed > max) {
      return max;
    }
    return parsed;
  }

  private buildLatencyPercentileSummary(values: number[]) {
    const cleaned = values
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.round(value));
    return {
      sampleSize: cleaned.length,
      p50Ms: this.calculateLatencyPercentile(cleaned, 0.5),
      p95Ms: this.calculateLatencyPercentile(cleaned, 0.95),
    };
  }

  private calculateLatencyPercentile(values: number[], percentile: number): number | null {
    if (!values.length) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil(sorted.length * percentile));
    return sorted[Math.min(sorted.length - 1, rank - 1)];
  }

  async getSessionCostSummary(userId: string, sessionId: string) {
    return this.orchestratorService.getSessionCostSummary(userId, sessionId);
  }

  private readNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
