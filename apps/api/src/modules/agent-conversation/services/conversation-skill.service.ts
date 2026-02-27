/**
 * ConversationSkillService — Skill 草稿管理
 *
 * 职责：
 *   - createSkillDraft：创建/复用 Skill 草稿
 *   - listAssets / listCapabilityRoutingLogs / getCapabilityRoutingSummary
 *   - findReusableSkillDraft / findReusablePublishedSkill
 *   - upsertPublishedSkillBridgeDraft / ensureRuntimeGrantForDraft
 *   - resolveCapabilityRoutingPolicy / resolveEphemeralCapabilityPolicy
 *   - resolveSkillRisk / logCapabilityRoutingDecisionAsset
 *
 * 注意：此文件从 agent-conversation.service.ts (L1242-1525, L3734-4260) 提取。
 * 所有原始方法的签名和行为完全保留。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateSkillDraftDto } from '@packages/types';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';
import type {
    CapabilityRoutingPolicy,
    EphemeralCapabilityPolicy,
} from './conversation.types';

@Injectable()
export class ConversationSkillService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── createSkillDraft ───────────────────────────────────────────────────────

    async createSkillDraft(userId: string, sessionId: string, dto: CreateSkillDraftDto) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const derivedRisk = this.resolveSkillRisk(dto);
        const routingPolicy = await this.resolveCapabilityRoutingPolicy(userId);
        const ephemeralPolicy = await this.resolveEphemeralCapabilityPolicy(userId);

        // Step 1: 尝试复用已有草稿
        const reuseCandidate = await this.findReusableSkillDraft(userId, dto, ephemeralPolicy);
        if (reuseCandidate) {
            const runtimeGrantId = await this.ensureRuntimeGrantForDraft(
                reuseCandidate.id, sessionId, userId, reuseCandidate.provisionalEnabled, ephemeralPolicy,
            );
            const reviewRequired = reuseCandidate.status !== 'PUBLISHED';

            await this.prisma.conversationTurn.create({
                data: {
                    sessionId, role: 'ASSISTANT',
                    content: `已复用已有能力草稿：${reuseCandidate.suggestedSkillCode}`,
                    structuredPayload: {
                        draftId: reuseCandidate.id, status: reuseCandidate.status, reviewRequired,
                        riskLevel: reuseCandidate.riskLevel, provisionalEnabled: reuseCandidate.provisionalEnabled,
                        runtimeGrantId, reused: true, reuseSource: reuseCandidate.reuseReason,
                    } as Prisma.InputJsonValue,
                },
            });

            await this.assetService.createAsset({
                sessionId, assetType: 'SKILL_DRAFT',
                title: `Skill Draft ${reuseCandidate.suggestedSkillCode}`,
                payload: {
                    draftId: reuseCandidate.id, gapType: reuseCandidate.gapType,
                    requiredCapability: reuseCandidate.requiredCapability,
                    suggestedSkillCode: reuseCandidate.suggestedSkillCode,
                    status: reuseCandidate.status, reused: true, reuseSource: reuseCandidate.reuseReason,
                },
            });

            await this.logCapabilityRoutingDecisionAsset(sessionId, {
                routeType: 'SKILL_DRAFT_REUSE', routePolicy: ['USER_PRIVATE'],
                selectedSource: reuseCandidate.reuseReason, selectedDraftId: reuseCandidate.id,
                selectedSkillCode: reuseCandidate.suggestedSkillCode,
                selectedScore: reuseCandidate.reuseReason === 'EXACT_CODE' ? 1 : 0.72,
                intent: session.currentIntent, reason: '复用已有能力草稿，避免重复创建。',
                routePolicyDetails: { capabilityRoutingPolicy: routingPolicy, ephemeralCapabilityPolicy: ephemeralPolicy },
            });

            return {
                draftId: reuseCandidate.id, status: reuseCandidate.status, reviewRequired,
                riskLevel: reuseCandidate.riskLevel, provisionalEnabled: reuseCandidate.provisionalEnabled,
                runtimeGrantId, reused: true, reuseSource: reuseCandidate.reuseReason,
            };
        }

        // Step 2: 尝试复用已发布能力
        const reusablePublishedSkill = await this.findReusablePublishedSkill(userId, dto, routingPolicy, ephemeralPolicy);
        if (reusablePublishedSkill) {
            const bridgeDraft = await this.upsertPublishedSkillBridgeDraft({
                sessionId, ownerUserId: userId, dto, skill: reusablePublishedSkill, derivedRisk,
            });

            await this.prisma.conversationTurn.create({
                data: {
                    sessionId, role: 'ASSISTANT',
                    content: `已复用可用能力：${reusablePublishedSkill.skillCode}，无需重复创建草稿。`,
                    structuredPayload: {
                        draftId: bridgeDraft.id, status: bridgeDraft.status, reviewRequired: false,
                        riskLevel: bridgeDraft.riskLevel, provisionalEnabled: false, runtimeGrantId: null,
                        reused: true, reuseSource: 'PUBLISHED_SKILL', publishedSkillId: reusablePublishedSkill.id,
                    } as Prisma.InputJsonValue,
                },
            });

            await this.assetService.createAsset({
                sessionId, assetType: 'SKILL_DRAFT',
                title: `Skill Draft ${bridgeDraft.suggestedSkillCode}`,
                payload: {
                    draftId: bridgeDraft.id, gapType: bridgeDraft.gapType,
                    requiredCapability: bridgeDraft.requiredCapability,
                    suggestedSkillCode: bridgeDraft.suggestedSkillCode, status: bridgeDraft.status,
                    reused: true, reuseSource: 'PUBLISHED_SKILL', publishedSkillId: reusablePublishedSkill.id,
                },
            });

            await this.logCapabilityRoutingDecisionAsset(sessionId, {
                routeType: 'SKILL_DRAFT_REUSE', routePolicy: ['USER_PRIVATE', 'TEAM_OR_PUBLIC'],
                selectedSource: 'PUBLISHED_SKILL', selectedDraftId: bridgeDraft.id,
                selectedSkillCode: reusablePublishedSkill.skillCode, selectedScore: reusablePublishedSkill.score,
                intent: session.currentIntent, reason: '命中可用已发布能力，复用能力并建立本用户映射草稿。',
                routePolicyDetails: { capabilityRoutingPolicy: routingPolicy, ephemeralCapabilityPolicy: ephemeralPolicy },
            });

            return {
                draftId: bridgeDraft.id, status: bridgeDraft.status, reviewRequired: false,
                riskLevel: bridgeDraft.riskLevel, provisionalEnabled: false, runtimeGrantId: null,
                reused: true, reuseSource: 'PUBLISHED_SKILL',
            };
        }

        // Step 3: 创建新草稿
        const draftSpec = {
            gapType: dto.gapType, requiredCapability: dto.requiredCapability,
            suggestedSkillCode: dto.suggestedSkillCode, sourceSessionId: sessionId,
            sourceIntent: session.currentIntent, riskLevel: derivedRisk.riskLevel,
            sideEffectRisk: derivedRisk.sideEffectRisk,
        };

        const draft = await this.prisma.agentSkillDraft.create({
            data: {
                sessionId, ownerUserId: userId, gapType: dto.gapType,
                requiredCapability: dto.requiredCapability, suggestedSkillCode: dto.suggestedSkillCode,
                draftSpec: draftSpec as Prisma.InputJsonValue, status: 'DRAFT',
                riskLevel: derivedRisk.riskLevel, sideEffectRisk: derivedRisk.sideEffectRisk,
                provisionalEnabled: derivedRisk.allowRuntimeGrant,
            },
        });

        await this.prisma.agentSkillGovernanceEvent.create({
            data: {
                ownerUserId: userId, draftId: draft.id, eventType: 'DRAFT_CREATED',
                message: `Skill Draft 已创建：${draft.id}`,
                payload: { riskLevel: derivedRisk.riskLevel, sideEffectRisk: derivedRisk.sideEffectRisk } as Prisma.InputJsonValue,
            },
        });

        let runtimeGrantId: string | null = null;
        if (derivedRisk.allowRuntimeGrant) {
            const runtimeGrant = await this.prisma.agentSkillRuntimeGrant.create({
                data: {
                    draftId: draft.id, sessionId, ownerUserId: userId, status: 'ACTIVE',
                    maxUseCount: ephemeralPolicy.runtimeGrantMaxUseCount,
                    expiresAt: new Date(Date.now() + ephemeralPolicy.runtimeGrantTtlHours * 60 * 60 * 1000),
                },
            });
            runtimeGrantId = runtimeGrant.id;

            await this.prisma.agentSkillGovernanceEvent.create({
                data: {
                    ownerUserId: userId, draftId: draft.id, runtimeGrantId: runtimeGrant.id,
                    eventType: 'RUNTIME_GRANT_CREATED',
                    message: `运行时授权已创建：${runtimeGrant.id}`,
                    payload: { maxUseCount: runtimeGrant.maxUseCount, expiresAt: runtimeGrant.expiresAt } as Prisma.InputJsonValue,
                },
            });
        }

        await this.prisma.conversationTurn.create({
            data: {
                sessionId, role: 'ASSISTANT',
                content: `已创建 Skill Draft：${dto.suggestedSkillCode}`,
                structuredPayload: {
                    draftId: draft.id, status: draft.status, reviewRequired: true,
                    riskLevel: derivedRisk.riskLevel, provisionalEnabled: derivedRisk.allowRuntimeGrant, runtimeGrantId,
                } as Prisma.InputJsonValue,
            },
        });

        await this.assetService.createAsset({
            sessionId, assetType: 'SKILL_DRAFT',
            title: `Skill Draft ${dto.suggestedSkillCode}`,
            payload: {
                draftId: draft.id, gapType: dto.gapType, requiredCapability: dto.requiredCapability,
                suggestedSkillCode: dto.suggestedSkillCode, status: draft.status,
            },
        });

        await this.logCapabilityRoutingDecisionAsset(sessionId, {
            routeType: 'SKILL_DRAFT_CREATE', routePolicy: ['USER_PRIVATE'],
            selectedSource: 'NEW_DRAFT', selectedDraftId: draft.id,
            selectedSkillCode: dto.suggestedSkillCode, selectedScore: 0,
            intent: session.currentIntent, reason: '未命中可复用草稿，创建新草稿。',
            routePolicyDetails: { capabilityRoutingPolicy: routingPolicy, ephemeralCapabilityPolicy: ephemeralPolicy },
        });

        return {
            draftId: draft.id, status: draft.status, reviewRequired: true,
            riskLevel: derivedRisk.riskLevel, provisionalEnabled: derivedRisk.allowRuntimeGrant,
            runtimeGrantId, reused: false, reuseSource: 'NEW_DRAFT',
        };
    }

    // ── Routing Logs ──────────────────────────────────────────────────────────

    async listCapabilityRoutingLogs(
        userId: string,
        sessionId: string,
        query?: { routeType?: string; limit?: number; window?: '1h' | '24h' | '7d' },
    ) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId }, select: { id: true },
        });
        if (!session) return null;

        const limit = Math.max(1, Math.min(200, query?.limit ?? 50));
        const routeTypeFilter = this.utils.pickString(query?.routeType)?.toUpperCase();
        const createdAfter = this.resolveRoutingWindowStart(query?.window);
        const notes = await this.prisma.conversationAsset.findMany({
            where: {
                sessionId, assetType: 'NOTE', title: { startsWith: '能力路由日志' },
                ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}),
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 300,
        });

        const filtered = notes.filter((item) => {
            if (!routeTypeFilter) return true;
            const payload = this.utils.toRecord(item.payload);
            return this.utils.pickString(payload.routeType)?.toUpperCase() === routeTypeFilter;
        });

        return filtered.slice(0, limit).map((item) => {
            const payload = this.utils.toRecord(item.payload);
            return {
                id: item.id, title: item.title,
                routeType: this.utils.pickString(payload.routeType) ?? 'UNKNOWN',
                selectedSource: this.utils.pickString(payload.selectedSource),
                selectedScore: this.utils.normalizeNumber(payload.selectedScore),
                selectedWorkflowDefinitionId: this.utils.pickString(payload.selectedWorkflowDefinitionId),
                selectedDraftId: this.utils.pickString(payload.selectedDraftId),
                selectedSkillCode: this.utils.pickString(payload.selectedSkillCode),
                routePolicy: Array.isArray(payload.routePolicy)
                    ? payload.routePolicy.filter((v): v is string => typeof v === 'string') : [],
                reason: this.utils.pickString(payload.reason),
                routePolicyDetails: this.utils.toRecord(payload.routePolicyDetails),
                createdAt: item.createdAt,
            };
        });
    }

    // ── Policy Resolution ─────────────────────────────────────────────────────

    async resolveCapabilityRoutingPolicy(userId: string): Promise<CapabilityRoutingPolicy> {
        const binding = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_CAPABILITY_ROUTING_POLICY', isActive: true },
            orderBy: { priority: 'desc' }, select: { metadata: true },
        });
        const metadata = this.utils.toRecord(binding?.metadata);
        const toBoolean = (value: unknown, fallback: boolean) =>
            typeof value === 'boolean' ? value : fallback;
        const toScore = (value: unknown, fallback: number) => {
            if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
            return fallback;
        };
        return {
            allowOwnerPool: toBoolean(metadata.allowOwnerPool, true),
            allowPublicPool: toBoolean(metadata.allowPublicPool, true),
            preferOwnerFirst: toBoolean(metadata.preferOwnerFirst, true),
            minOwnerScore: toScore(metadata.minOwnerScore, 0.3),
            minPublicScore: toScore(metadata.minPublicScore, 0.5),
        };
    }

    async resolveEphemeralCapabilityPolicy(userId: string): Promise<EphemeralCapabilityPolicy> {
        const binding = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_EPHEMERAL_CAPABILITY_POLICY', isActive: true },
            orderBy: { priority: 'desc' }, select: { metadata: true },
        });
        const metadata = this.utils.toRecord(binding?.metadata);
        const toScore = (value: unknown, fallback: number) => {
            if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
            return fallback;
        };
        const toInt = (value: unknown, fallback: number, min: number, max: number) => {
            if (typeof value === 'number' && Number.isFinite(value))
                return Math.max(min, Math.min(max, Math.floor(value)));
            return fallback;
        };
        const toStringArray = (value: unknown, fallback: string[]) => {
            if (Array.isArray(value)) {
                const filtered = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
                return filtered.length > 0 ? filtered : fallback;
            }
            return fallback;
        };

        return {
            draftSemanticReuseThreshold: toScore(metadata.draftSemanticReuseThreshold, 0.6),
            publishedSkillReuseThreshold: toScore(metadata.publishedSkillReuseThreshold, 0.5),
            runtimeGrantTtlHours: toInt(metadata.runtimeGrantTtlHours, 24, 1, 168),
            runtimeGrantMaxUseCount: toInt(metadata.runtimeGrantMaxUseCount, 50, 1, 1000),
            replayRetryableErrorCodeAllowlist: toStringArray(metadata.replayRetryableErrorCodeAllowlist, []),
            replayNonRetryableErrorCodeBlocklist: toStringArray(
                metadata.replayNonRetryableErrorCodeBlocklist,
                ['CONV_PROMOTION_TASK_NOT_FOUND', 'CONV_PROMOTION_TASK_ACTION_INVALID',
                    'CONV_PROMOTION_TASK_PUBLISH_BLOCKED', 'SKILL_REVIEWER_CONFLICT', 'SKILL_HIGH_RISK_REVIEW_REQUIRED'],
            ),
        };
    }

    // ── Risk Assessment ────────────────────────────────────────────────────────

    resolveSkillRisk(dto: CreateSkillDraftDto): {
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        sideEffectRisk: boolean;
        allowRuntimeGrant: boolean;
    } {
        const code = (dto.suggestedSkillCode ?? '').toUpperCase();
        const capability = (dto.requiredCapability ?? '').toLowerCase();

        const hasDbWrite = capability.includes('write') || capability.includes('写入') || capability.includes('删除');
        const hasExternalApi = capability.includes('external') || capability.includes('外部') || capability.includes('webhook');
        const hasCredential = capability.includes('credential') || capability.includes('密钥') || capability.includes('token');

        if (hasCredential || (hasDbWrite && hasExternalApi)) {
            return { riskLevel: 'HIGH', sideEffectRisk: true, allowRuntimeGrant: false };
        }
        if (hasDbWrite || hasExternalApi) {
            return { riskLevel: 'MEDIUM', sideEffectRisk: true, allowRuntimeGrant: true };
        }
        if (code.includes('QUERY') || code.includes('READ') || code.includes('FETCH')) {
            return { riskLevel: 'LOW', sideEffectRisk: false, allowRuntimeGrant: true };
        }
        return { riskLevel: 'LOW', sideEffectRisk: false, allowRuntimeGrant: true };
    }

    // ── Private Helpers ────────────────────────────────────────────────────────

    async logCapabilityRoutingDecisionAsset(
        sessionId: string,
        payload: {
            routeType: string; routePolicy: string[]; selectedSource: string;
            selectedScore?: number; selectedWorkflowDefinitionId?: string | null;
            selectedDraftId?: string | null; selectedSkillCode?: string | null;
            intent?: string | null; missingSlots?: string[]; reason?: string;
            routePolicyDetails?: Record<string, unknown>;
        },
    ) {
        const key = this.computeRoutingDecisionKey(payload);
        return this.assetService.createAsset({
            sessionId, assetType: 'NOTE',
            title: `能力路由日志 ${payload.routeType} ${key.slice(0, 8)}`,
            payload: { ...payload, routingDecisionKey: key },
            tags: { routingDecision: true, routeType: payload.routeType },
        });
    }

    private computeRoutingDecisionKey(input: {
        routeType: string; selectedSource: string;
        selectedWorkflowDefinitionId?: string | null;
        selectedDraftId?: string | null; selectedSkillCode?: string | null;
        intent?: string | null;
    }): string {
        const parts = [
            input.routeType ?? '', input.selectedSource ?? '',
            input.selectedWorkflowDefinitionId ?? '', input.selectedDraftId ?? '',
            input.selectedSkillCode ?? '', input.intent ?? '',
        ];
        return parts.join('|');
    }

    resolveRoutingWindowStart(window?: '1h' | '24h' | '7d'): Date | null {
        if (!window) return new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (window === '1h') return new Date(Date.now() - 60 * 60 * 1000);
        if (window === '24h') return new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (window === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return null;
    }

    private async findReusableSkillDraft(
        ownerUserId: string, dto: CreateSkillDraftDto, policy: EphemeralCapabilityPolicy,
    ) {
        const exactMatch = await this.prisma.agentSkillDraft.findFirst({
            where: { ownerUserId, suggestedSkillCode: dto.suggestedSkillCode, status: { not: 'REJECTED' } },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, gapType: true, requiredCapability: true, suggestedSkillCode: true, status: true, riskLevel: true, provisionalEnabled: true },
        });
        if (exactMatch) {
            return { ...exactMatch, reuseReason: 'EXACT_CODE' as const };
        }

        const semanticCandidates = await this.prisma.agentSkillDraft.findMany({
            where: { ownerUserId, status: { not: 'REJECTED' } },
            orderBy: { updatedAt: 'desc' }, take: 50,
            select: { id: true, gapType: true, requiredCapability: true, suggestedSkillCode: true, status: true, riskLevel: true, provisionalEnabled: true },
        });

        const baseTokens = this.extractCapabilityTokens(dto.requiredCapability);
        for (const candidate of semanticCandidates) {
            const candidateTokens = this.extractCapabilityTokens(candidate.requiredCapability);
            const similarity = this.computeCapabilitySimilarity(baseTokens, candidateTokens);
            if (similarity >= policy.draftSemanticReuseThreshold) {
                return { ...candidate, reuseReason: 'SEMANTIC_MATCH' as const };
            }
        }
        return null;
    }

    private async findReusablePublishedSkill(
        ownerUserId: string, dto: CreateSkillDraftDto,
        policy: CapabilityRoutingPolicy, ephemeralPolicy: EphemeralCapabilityPolicy,
    ) {
        if (!policy.allowPublicPool && !policy.allowOwnerPool) return null;

        const skills = await this.prisma.agentSkill.findMany({
            where: { isActive: true },
            orderBy: { updatedAt: 'desc' }, take: 100,
            select: { id: true, skillCode: true, name: true, description: true, templateSource: true },
        });

        const baseTokens = this.extractCapabilityTokens(dto.requiredCapability);
        let bestMatch: { id: string; skillCode: string; name: string; description: string; templateSource: string; score: number } | null = null;

        for (const skill of skills) {
            const skillText = `${skill.skillCode} ${skill.name} ${skill.description ?? ''}`;
            const skillTokens = this.extractCapabilityTokens(skillText);
            const score = this.computeCapabilitySimilarity(baseTokens, skillTokens);
            if (score >= ephemeralPolicy.publishedSkillReuseThreshold && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { ...skill, description: skill.description ?? '', score };
            }
        }
        return bestMatch;
    }

    private async upsertPublishedSkillBridgeDraft(input: {
        sessionId: string; ownerUserId: string; dto: CreateSkillDraftDto;
        skill: { id: string; skillCode: string; score: number; templateSource: string };
        derivedRisk: { riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; sideEffectRisk: boolean; allowRuntimeGrant: boolean };
    }) {
        const existing = await this.prisma.agentSkillDraft.findFirst({
            where: { ownerUserId: input.ownerUserId, publishedSkillId: input.skill.id },
            orderBy: { updatedAt: 'desc' },
        });
        if (existing) return existing;

        return this.prisma.agentSkillDraft.create({
            data: {
                sessionId: input.sessionId, ownerUserId: input.ownerUserId,
                gapType: input.dto.gapType, requiredCapability: input.dto.requiredCapability,
                suggestedSkillCode: input.skill.skillCode,
                draftSpec: { bridgedFromPublishedSkill: input.skill.id, templateSource: input.skill.templateSource } as Prisma.InputJsonValue,
                status: 'PUBLISHED', riskLevel: input.derivedRisk.riskLevel,
                sideEffectRisk: input.derivedRisk.sideEffectRisk, provisionalEnabled: false,
                publishedSkillId: input.skill.id,
            },
        });
    }

    private async ensureRuntimeGrantForDraft(
        draftId: string, sessionId: string, ownerUserId: string,
        provisionalEnabled: boolean, policy: EphemeralCapabilityPolicy,
    ): Promise<string | null> {
        if (!provisionalEnabled) return null;

        const existing = await this.prisma.agentSkillRuntimeGrant.findFirst({
            where: { draftId, sessionId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
        if (existing) return existing.id;

        const grant = await this.prisma.agentSkillRuntimeGrant.create({
            data: {
                draftId, sessionId, ownerUserId, status: 'ACTIVE',
                maxUseCount: policy.runtimeGrantMaxUseCount,
                expiresAt: new Date(Date.now() + policy.runtimeGrantTtlHours * 60 * 60 * 1000),
            },
        });
        return grant.id;
    }

    private extractCapabilityTokens(value: string): string[] {
        return value.toLowerCase().split(/[\s_\-,;|/\\.:]+/).filter((token) => token.length > 1);
    }

    private computeCapabilitySimilarity(baseTokens: string[], candidateTokens: string[]): number {
        if (!baseTokens.length || !candidateTokens.length) return 0;
        const candidateSet = new Set(candidateTokens);
        let hits = 0;
        for (const token of baseTokens) {
            if (candidateSet.has(token)) hits += 1;
        }
        return hits / Math.max(baseTokens.length, 1);
    }
}
