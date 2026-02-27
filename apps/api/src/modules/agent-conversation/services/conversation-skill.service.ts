/**
 * ConversationSkillService — 技能草案领域
 *
 * 负责：
 *   - createSkillDraft: 创建技能草案
 *   - findReusableSkillDraft / findReusablePublishedSkill: 技能复用查找
 *   - upsertPublishedSkillBridgeDraft: 已发布技能桥接草案管理
 *   - ensureRuntimeGrantForDraft: 运行时授权管理
 *   - resolveSkillRisk: 技能风险评估
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';
import type { CreateSkillDraftDto } from '@packages/types';

@Injectable()
export class ConversationSkillService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utilsService: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── Public API ───────────────────────────────────────────────────────────

    async createSkillDraft(userId: string, sessionId: string, dto: CreateSkillDraftDto) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const riskAssessment = this.resolveSkillRisk(dto);

        // 查找是否已有可复用的草案或已发布技能
        const reusable = await this.findReusableSkillDraft(sessionId, dto.suggestedSkillCode);
        if (reusable) {
            return { draft: reusable, reused: true };
        }

        const published = await this.findReusablePublishedSkill(dto.suggestedSkillCode);
        if (published) {
            const bridged = await this.upsertPublishedSkillBridgeDraft({
                sessionId,
                ownerUserId: userId,
                publishedSkill: published,
                dto,
                riskAssessment,
            });
            return { draft: bridged, reused: true, fromPublished: true };
        }

        // 创建新草案
        const draft = await this.prisma.agentSkillDraft.create({
            data: {
                sessionId,
                ownerUserId: userId,
                gapType: dto.gapType,
                requiredCapability: dto.requiredCapability,
                suggestedSkillCode: dto.suggestedSkillCode,
                draftSpec: {},
                status: 'DRAFT',
                riskLevel: riskAssessment.level,
                sideEffectRisk: riskAssessment.hasSideEffect,
            },
        });

        await this.assetService.createAsset({
            sessionId,
            assetType: 'SKILL_DRAFT',
            title: `技能草案: ${dto.suggestedSkillCode}`,
            payload: {
                draftId: draft.id,
                gapType: dto.gapType,
                requiredCapability: dto.requiredCapability,
                suggestedSkillCode: dto.suggestedSkillCode,
                riskLevel: riskAssessment.level,
            } as unknown as Record<string, unknown>,
        });

        return { draft, reused: false };
    }

    // ── Private Helpers ─────────────────────────────────────────────────────

    resolveSkillRisk(
        dto: CreateSkillDraftDto,
    ): { level: 'LOW' | 'MEDIUM' | 'HIGH'; hasSideEffect: boolean } {
        const sideEffectRisk = dto.sideEffectRisk ?? false;
        if (dto.riskLevel === 'HIGH' || sideEffectRisk) {
            return { level: 'HIGH', hasSideEffect: sideEffectRisk };
        }
        if (dto.riskLevel === 'MEDIUM') {
            return { level: 'MEDIUM', hasSideEffect: false };
        }
        return { level: dto.riskLevel ?? 'LOW', hasSideEffect: false };
    }

    private async findReusableSkillDraft(sessionId: string, skillCode: string) {
        return this.prisma.agentSkillDraft.findFirst({
            where: {
                sessionId,
                suggestedSkillCode: skillCode,
                status: { in: ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED'] },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    private async findReusablePublishedSkill(skillCode: string) {
        return this.prisma.agentSkillDraft.findFirst({
            where: {
                suggestedSkillCode: skillCode,
                status: 'PUBLISHED',
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    private async upsertPublishedSkillBridgeDraft(input: {
        sessionId: string;
        ownerUserId: string;
        publishedSkill: { id: string; suggestedSkillCode: string; gapType: string; requiredCapability: string };
        dto: CreateSkillDraftDto;
        riskAssessment: { level: 'LOW' | 'MEDIUM' | 'HIGH'; hasSideEffect: boolean };
    }) {
        const existing = await this.prisma.agentSkillDraft.findFirst({
            where: {
                sessionId: input.sessionId,
                suggestedSkillCode: input.publishedSkill.suggestedSkillCode,
            },
        });
        if (existing) return existing;

        return this.prisma.agentSkillDraft.create({
            data: {
                sessionId: input.sessionId,
                ownerUserId: input.ownerUserId,
                gapType: input.dto.gapType,
                requiredCapability: input.dto.requiredCapability,
                suggestedSkillCode: input.dto.suggestedSkillCode,
                draftSpec: {},
                status: 'PUBLISHED',
                riskLevel: input.riskAssessment.level,
                sideEffectRisk: input.riskAssessment.hasSideEffect,
            },
        });
    }
}
