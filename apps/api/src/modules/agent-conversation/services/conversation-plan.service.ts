/**
 * ConversationPlanService — 计划管理
 *
 * 职责：
 *   - 确认计划并触发工作流执行（confirmPlan）
 *   - 工作流候选匹配（pickWorkflowDefinitionCandidate）
 *   - 计划版本管理
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ConfirmConversationPlanDto } from '@packages/types';
import { PrismaService } from '../../../prisma';
import { WorkflowExecutionService } from '../../workflow-execution';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';
import { ConversationScheduleService } from './conversation-schedule.service';
import { ConversationSynthesizerService } from './conversation-synthesizer.service';
import type { IntentCode, SlotMap, CapabilityRoutingPolicy } from './conversation.types';

@Injectable()
export class ConversationPlanService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly workflowExecutionService: WorkflowExecutionService,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
        private readonly scheduleService: ConversationScheduleService,
        private readonly synthesizerService: ConversationSynthesizerService,
    ) { }

    async confirmPlan(
        userId: string,
        sessionId: string,
        dto: ConfirmConversationPlanDto,
        options?: { recordTurn?: boolean },
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

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

        const snapshot = this.utils.toRecord(plan.planSnapshot);
        const snapshotPlanId = typeof snapshot.planId === 'string' ? snapshot.planId : '';
        if (snapshotPlanId !== dto.planId) {
            throw new BadRequestException({
                code: 'CONV_PLAN_ID_MISMATCH',
                message: '计划ID与版本不匹配，请刷新后重试',
            });
        }

        const mergedPlan = { ...snapshot, ...(dto.confirmedPlan ?? {}) };
        const workflowDefinitionId = this.utils.pickString(mergedPlan.workflowDefinitionId);
        if (!workflowDefinitionId || !this.utils.isUuid(workflowDefinitionId)) {
            throw new BadRequestException({
                code: 'CONV_WORKFLOW_NOT_BINDABLE',
                message: '计划未绑定可执行流程，请先在工作流中心选择可执行模板',
            });
        }

        const paramSnapshot = this.utils.toRecord(mergedPlan.paramSnapshot);
        const compiledParamSnapshot = this.scheduleService.compileExecutionParams(
            mergedPlan,
            paramSnapshot,
        );

        // Phase 2: 注入对话上下文 + 前轮结果引用
        const contextSnapshot = await this.buildConversationContextSnapshot(sessionId);
        if (contextSnapshot.conversationContext) {
            compiledParamSnapshot.conversationContext = contextSnapshot.conversationContext;
        }
        if (contextSnapshot.previousAnalysis) {
            compiledParamSnapshot.previousAnalysis = contextSnapshot.previousAnalysis;
        }

        const execution = await this.workflowExecutionService.trigger(userId, {
            workflowDefinitionId,
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

        await this.assetService.createAsset({
            sessionId,
            assetType: 'EXECUTION',
            title: `执行实例 ${execution.id.slice(0, 8)}`,
            payload: {
                executionId: execution.id,
                planVersion: dto.planVersion,
                workflowDefinitionId,
                paramSnapshot: compiledParamSnapshot,
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
                    } as Prisma.InputJsonValue,
                },
            });
        }

        return {
            accepted: true,
            executionId: execution.id,
            status: 'EXECUTING',
            traceId: session.traceId ?? `trace_${sessionId}`,
        };
    }

    // ── 上下文构建 ────────────────────────────────────────────────────────────

    /**
     * 构建对话上下文快照，注入到 paramSnapshot 供 Agent 读取。
     *
     * 包含两部分：
     *   1. conversationContext — 最近 6 轮对话的角色+内容摘要
     *   2. previousAnalysis — 最近一次 RESULT_SUMMARY 资产的 payload
     */
    async buildConversationContextSnapshot(sessionId: string): Promise<{
        conversationContext: string | null;
        previousAnalysis: Record<string, unknown> | null;
    }> {
        // 1. 获取最近 N 轮对话
        const MAX_CONTEXT_TURNS = 6;
        const recentTurns = await this.prisma.conversationTurn.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: MAX_CONTEXT_TURNS,
            select: { role: true, content: true, createdAt: true },
        });

        let conversationContext: string | null = null;
        if (recentTurns.length > 0) {
            const reversed = [...recentTurns].reverse();
            const lines = reversed.map((turn) => {
                const role = turn.role === 'USER' ? '用户' : turn.role === 'ASSISTANT' ? '助手' : '系统';
                const content = (turn.content ?? '').slice(0, 300);
                return `[${role}] ${content}`;
            });
            conversationContext = lines.join('\n');
        }

        // 2. 获取最近的 RESULT_SUMMARY 资产
        let previousAnalysis: Record<string, unknown> | null = null;
        const latestResultSummary = await this.prisma.conversationAsset.findFirst({
            where: { sessionId, assetType: 'RESULT_SUMMARY' },
            orderBy: { createdAt: 'desc' },
            select: { payload: true, title: true, createdAt: true },
        });

        if (latestResultSummary) {
            const payload = this.utils.toRecord(latestResultSummary.payload);
            // 提取关键分析信息，避免注入过多数据
            previousAnalysis = {
                title: latestResultSummary.title,
                analyzedAt: latestResultSummary.createdAt.toISOString(),
                conclusion: this.utils.pickString(payload.conclusion) ?? this.utils.pickString(payload.analysis),
                facts: Array.isArray(payload.facts) ? payload.facts.slice(0, 5) : [],
                confidence: payload.confidence,
                dataTimestamp: this.utils.pickString(payload.dataTimestamp),
            };
        }

        return { conversationContext, previousAnalysis };
    }

    // ── 工作流匹配 ────────────────────────────────────────────────────────────

    async pickWorkflowDefinitionCandidate(
        ownerUserId: string,
        intent: IntentCode,
        slots: SlotMap,
        policy: CapabilityRoutingPolicy,
        userMessage?: string,
    ): Promise<{ id: string; reuseSource: 'USER_PRIVATE' | 'TEAM_OR_PUBLIC' | 'LLM_SELECTOR'; score: number } | null> {
        const keywords = this.buildWorkflowCapabilityKeywords(intent, slots);

        if (policy.allowOwnerPool) {
            const ownerMatch = await this.findBestWorkflowMatch(ownerUserId, keywords, policy.minOwnerScore);
            if (ownerMatch && ownerMatch.score >= 0.6) {
                return { id: ownerMatch.id, reuseSource: 'USER_PRIVATE', score: ownerMatch.score };
            }
        }

        if (policy.allowPublicPool) {
            const publicMatch = await this.findBestWorkflowMatch(null, keywords, policy.minPublicScore);
            if (publicMatch && publicMatch.score >= 0.6) {
                return { id: publicMatch.id, reuseSource: 'TEAM_OR_PUBLIC', score: publicMatch.score };
            }
        }

        // Phase 3: LLM Fallback —— 规则匹配分 < 0.6 时用 LLM 选择
        const LLM_ROUTING_THRESHOLD = 0.6;
        const allCandidates = await this.getAllWorkflowCandidates(ownerUserId, policy);
        if (allCandidates.length > 0 && userMessage) {
            const llmResult = await this.synthesizerService.llmSelectWorkflow(
                intent, userMessage, allCandidates,
            );
            if (llmResult && llmResult.score >= LLM_ROUTING_THRESHOLD) {
                return { id: llmResult.selectedId, reuseSource: 'LLM_SELECTOR', score: llmResult.score };
            }
        }

        // 如果 LLM 也没选出，退回低分规则匹配
        if (policy.allowOwnerPool) {
            const ownerMatch = await this.findBestWorkflowMatch(ownerUserId, keywords, 0);
            if (ownerMatch && ownerMatch.score > 0) {
                return { id: ownerMatch.id, reuseSource: 'USER_PRIVATE', score: ownerMatch.score };
            }
        }
        if (policy.allowPublicPool) {
            const publicMatch = await this.findBestWorkflowMatch(null, keywords, 0);
            if (publicMatch && publicMatch.score > 0) {
                return { id: publicMatch.id, reuseSource: 'TEAM_OR_PUBLIC', score: publicMatch.score };
            }
        }

        return null;
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    private buildWorkflowCapabilityKeywords(intent: IntentCode, slots: SlotMap): string[] {
        const keywords: string[] = [];
        keywords.push(intent);

        const isDebate = intent === 'DEBATE_MARKET_JUDGEMENT';
        if (isDebate) {
            keywords.push('DEBATE', 'debate', '辩论');
        } else {
            keywords.push('MARKET_SUMMARY', 'market_summary', '行情');
        }

        if (slots.region) keywords.push(slots.region);
        if (slots.timeRange) keywords.push(slots.timeRange);
        if (slots.topic) keywords.push(slots.topic);

        return keywords;
    }

    private async findBestWorkflowMatch(
        ownerUserId: string | null,
        keywords: string[],
        minScore: number,
    ): Promise<{ id: string; score: number } | null> {
        const whereClause: Prisma.WorkflowDefinitionWhereInput = ownerUserId
            ? { ownerUserId, isActive: true }
            : {
                isActive: true,
                OR: [{ templateSource: 'PUBLIC' }, { templateSource: 'COPIED' }],
            };

        const definitions = await this.prisma.workflowDefinition.findMany({
            where: whereClause,
            select: { id: true, name: true, description: true },
            take: 100,
            orderBy: { updatedAt: 'desc' },
        });

        let bestMatch: { id: string; score: number } | null = null;

        for (const def of definitions) {
            const searchText = `${def.name} ${def.description ?? ''}`.toLowerCase();
            let score = 0;
            for (const keyword of keywords) {
                if (searchText.includes(keyword.toLowerCase())) {
                    score += 1 / keywords.length;
                }
            }
            if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { id: def.id, score };
            }
        }

        return bestMatch;
    }

    private async getAllWorkflowCandidates(
        ownerUserId: string,
        policy: CapabilityRoutingPolicy,
    ): Promise<Array<{ id: string; name: string; description: string | null }>> {
        const ownerDefs = policy.allowOwnerPool
            ? await this.prisma.workflowDefinition.findMany({
                where: { ownerUserId, isActive: true },
                select: { id: true, name: true, description: true },
                take: 50, orderBy: { updatedAt: 'desc' },
            })
            : [];

        const publicDefs = policy.allowPublicPool
            ? await this.prisma.workflowDefinition.findMany({
                where: {
                    isActive: true,
                    OR: [{ templateSource: 'PUBLIC' }, { templateSource: 'COPIED' }],
                },
                select: { id: true, name: true, description: true },
                take: 50, orderBy: { updatedAt: 'desc' },
            })
            : [];

        const deduped = new Map<string, { id: string; name: string; description: string | null }>();
        for (const def of [...ownerDefs, ...publicDefs]) {
            if (!deduped.has(def.id)) deduped.set(def.id, def);
        }
        return Array.from(deduped.values());
    }
}
