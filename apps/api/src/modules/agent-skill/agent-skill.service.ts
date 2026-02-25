import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';
import type {
  ReviewSkillDraftDto,
  SandboxSkillDraftDto,
  RevokeSkillRuntimeGrantDto,
} from '@packages/types';

@Injectable()
export class AgentSkillService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(where: Prisma.AgentSkillWhereInput, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.agentSkill.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.agentSkill.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const skill = await this.prisma.agentSkill.findUnique({
      where: { id },
    });
    if (!skill) throw new NotFoundException(`AgentSkill not found: ${id}`);
    return skill;
  }

  async toggleActive(id: string): Promise<unknown> {
    const skill = await this.findOne(id);
    return this.prisma.agentSkill.update({
      where: { id },
      data: { isActive: !skill.isActive },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ): Promise<unknown> {
    await this.findOne(id); // validate existence
    return this.prisma.agentSkill.update({
      where: { id },
      data,
    });
  }

  async getDraft(userId: string, draftId: string) {
    return this.prisma.agentSkillDraft.findFirst({
      where: { id: draftId, ownerUserId: userId },
      include: {
        testRuns: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async listDrafts(userId: string, status?: string) {
    return this.prisma.agentSkillDraft.findMany({
      where: {
        ownerUserId: userId,
        status: status as never,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      include: {
        testRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async sandboxTestDraft(userId: string, draftId: string, dto: SandboxSkillDraftDto) {
    const draft = await this.prisma.agentSkillDraft.findFirst({ where: { id: draftId, ownerUserId: userId } });
    if (!draft) {
      return null;
    }

    await this.prisma.agentSkillDraft.update({
      where: { id: draftId },
      data: { status: 'SANDBOX_TESTING' },
    });

    const run = await this.prisma.agentSkillDraftTestRun.create({
      data: {
        draftId,
        status: 'RUNNING',
        inputSnapshot: dto as unknown as Prisma.InputJsonValue,
      },
    });

    const testResults = dto.testCases.map((testCase) => {
      const text = JSON.stringify(testCase.input);
      const passed =
        !testCase.expectContains.length ||
        testCase.expectContains.every((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
      return {
        input: testCase.input,
        expectContains: testCase.expectContains,
        passed,
      };
    });
    const passedCount = testResults.filter((item) => item.passed).length;
    const failedCount = testResults.length - passedCount;
    const status = failedCount === 0 ? 'PASSED' : 'FAILED';

    await this.prisma.agentSkillDraftTestRun.update({
      where: { id: run.id },
      data: {
        status,
        passedCount,
        failedCount,
        resultSnapshot: {
          testResults,
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    await this.prisma.agentSkillDraft.update({
      where: { id: draftId },
      data: {
        status: failedCount === 0 ? 'READY_FOR_REVIEW' : 'DRAFT',
      },
    });

    return {
      testRunId: run.id,
      status,
      passedCount,
      failedCount,
    };
  }

  async submitDraftReview(userId: string, draftId: string) {
    const draft = await this.prisma.agentSkillDraft.findFirst({ where: { id: draftId, ownerUserId: userId } });
    if (!draft) {
      return null;
    }
    const updated = await this.prisma.agentSkillDraft.update({
      where: { id: draftId },
      data: { status: 'READY_FOR_REVIEW' },
    });
    await this.logGovernanceEvent({
      ownerUserId: userId,
      draftId,
      eventType: 'REVIEW_SUBMITTED',
      message: `Skill Draft 已提交审批：${draftId}`,
      payload: {
        status: 'READY_FOR_REVIEW',
      },
    });
    return {
      draftId: updated.id,
      status: updated.status,
    };
  }

  async reviewDraft(reviewerUserId: string, draftId: string, dto: ReviewSkillDraftDto) {
    const draft = await this.prisma.agentSkillDraft.findUnique({ where: { id: draftId } });
    if (!draft) {
      return null;
    }

    if (dto.action === 'APPROVE' && draft.riskLevel === 'HIGH' && reviewerUserId === draft.ownerUserId) {
      throw new BadRequestException({
        code: 'SKILL_REVIEWER_CONFLICT',
        message: '高风险 Skill Draft 不能由创建者本人审批通过',
      });
    }

    const status = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.agentSkillDraft.update({
      where: { id: draftId },
      data: {
        status,
        reviewComment: dto.comment,
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
      },
    });

    await this.logGovernanceEvent({
      ownerUserId: draft.ownerUserId,
      draftId,
      eventType: status === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
      message:
        status === 'APPROVED'
          ? `Skill Draft 审批通过：${draftId}`
          : `Skill Draft 审批拒绝：${draftId}`,
      payload: {
        reviewerUserId,
        comment: dto.comment,
      },
    });

    return {
      draftId: updated.id,
      status: updated.status,
      reviewComment: updated.reviewComment,
    };
  }

  async publishDraft(userId: string, draftId: string) {
    const draft = await this.prisma.agentSkillDraft.findFirst({ where: { id: draftId, ownerUserId: userId } });
    if (!draft) {
      return null;
    }
    if (draft.status !== 'APPROVED') {
      return {
        draftId: draft.id,
        status: draft.status,
        publishedSkillId: null,
      };
    }

    if (draft.riskLevel === 'HIGH') {
      if (!draft.reviewedByUserId || draft.reviewedByUserId === draft.ownerUserId) {
        throw new BadRequestException({
          code: 'SKILL_HIGH_RISK_REVIEW_REQUIRED',
          message: '高风险 Skill Draft 必须由非创建者审批后才能发布',
        });
      }
    }

    const existing = await this.prisma.agentSkill.findUnique({ where: { skillCode: draft.suggestedSkillCode } });
    const skill = existing
      ? await this.prisma.agentSkill.update({
          where: { id: existing.id },
          data: {
            description: draft.requiredCapability,
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        })
      : await this.prisma.agentSkill.create({
          data: {
            skillCode: draft.suggestedSkillCode,
            name: draft.suggestedSkillCode,
            description: draft.requiredCapability,
            parameters: {
              type: 'object',
              properties: {},
            } as Prisma.InputJsonValue,
            handlerCode: `skill.draft.${draft.suggestedSkillCode}`,
            ownerUserId: userId,
            templateSource: 'PRIVATE',
            isActive: true,
            version: 1,
          },
        });

    const updatedDraft = await this.prisma.agentSkillDraft.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        publishedSkillId: skill.id,
      },
    });

    await this.logGovernanceEvent({
      ownerUserId: userId,
      draftId,
      eventType: 'PUBLISHED',
      message: `Skill Draft 已发布：${draftId}`,
      payload: {
        publishedSkillId: skill.id,
        skillCode: skill.skillCode,
      },
    });

    return {
      draftId: updatedDraft.id,
      status: updatedDraft.status,
      publishedSkillId: skill.id,
    };
  }

  async listRuntimeGrants(userId: string, draftId: string) {
    const draft = await this.prisma.agentSkillDraft.findFirst({ where: { id: draftId, ownerUserId: userId } });
    if (!draft) {
      return null;
    }
    return this.prisma.agentSkillRuntimeGrant.findMany({
      where: { draftId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
  }

  async revokeRuntimeGrant(userId: string, grantId: string, dto: RevokeSkillRuntimeGrantDto) {
    const grant = await this.prisma.agentSkillRuntimeGrant.findFirst({
      where: {
        id: grantId,
        draft: {
          ownerUserId: userId,
        },
      },
      include: {
        draft: true,
      },
    });
    if (!grant) {
      return null;
    }

    const updated = await this.prisma.agentSkillRuntimeGrant.update({
      where: { id: grantId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: dto.reason,
      },
    });

    await this.logGovernanceEvent({
      ownerUserId: userId,
      draftId: grant.draftId,
      runtimeGrantId: grant.id,
      eventType: 'RUNTIME_GRANT_REVOKED',
      message: `运行时授权已撤销：${grant.id}`,
      payload: {
        reason: dto.reason,
      },
    });

    const activeCount = await this.prisma.agentSkillRuntimeGrant.count({
      where: {
        draftId: grant.draftId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeCount === 0) {
      await this.prisma.agentSkillDraft.update({
        where: { id: grant.draftId },
        data: {
          provisionalEnabled: false,
        },
      });
    }

    return updated;
  }

  async consumeRuntimeGrant(userId: string, grantId: string) {
    const grant = await this.prisma.agentSkillRuntimeGrant.findFirst({
      where: {
        id: grantId,
        draft: {
          ownerUserId: userId,
        },
      },
    });
    if (!grant) {
      return null;
    }

    if (grant.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'SKILL_RUNTIME_GRANT_INACTIVE',
        message: '运行时授权已失效，不能继续使用',
      });
    }

    if (grant.expiresAt <= new Date()) {
      await this.prisma.agentSkillRuntimeGrant.update({
        where: { id: grantId },
        data: { status: 'EXPIRED' },
      });
      await this.logGovernanceEvent({
        ownerUserId: userId,
        draftId: grant.draftId,
        runtimeGrantId: grant.id,
        eventType: 'RUNTIME_GRANT_EXPIRED',
        message: `运行时授权已过期：${grant.id}`,
      });
      throw new BadRequestException({
        code: 'SKILL_RUNTIME_GRANT_EXPIRED',
        message: '运行时授权已过期',
      });
    }

    const nextUseCount = grant.useCount + 1;
    const nextStatus = nextUseCount >= grant.maxUseCount ? 'EXPIRED' : 'ACTIVE';

    const updated = await this.prisma.agentSkillRuntimeGrant.update({
      where: { id: grantId },
      data: {
        useCount: nextUseCount,
        status: nextStatus,
      },
    });

    await this.logGovernanceEvent({
      ownerUserId: userId,
      draftId: grant.draftId,
      runtimeGrantId: grant.id,
      eventType: nextStatus === 'EXPIRED' ? 'RUNTIME_GRANT_EXPIRED' : 'RUNTIME_GRANT_USED',
      message:
        nextStatus === 'EXPIRED'
          ? `运行时授权次数已用尽并过期：${grant.id}`
          : `运行时授权已使用：${grant.id}`,
      payload: {
        useCount: nextUseCount,
        maxUseCount: grant.maxUseCount,
      },
    });

    return updated;
  }

  async governanceOverview(userId: string) {
    const [draftStats, activeGrants, expiringSoon, highRiskPendingReview] = await Promise.all([
      this.prisma.agentSkillDraft.groupBy({
        by: ['riskLevel', 'status'],
        where: { ownerUserId: userId },
        _count: { _all: true },
      }),
      this.prisma.agentSkillRuntimeGrant.count({
        where: {
          ownerUserId: userId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.agentSkillRuntimeGrant.count({
        where: {
          ownerUserId: userId,
          status: 'ACTIVE',
          expiresAt: {
            gt: new Date(),
            lte: new Date(Date.now() + 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.agentSkillDraft.count({
        where: {
          ownerUserId: userId,
          riskLevel: 'HIGH',
          status: { in: ['DRAFT', 'SANDBOX_TESTING', 'READY_FOR_REVIEW'] },
        },
      }),
    ]);

    return {
      activeRuntimeGrants: activeGrants,
      runtimeGrantsExpiringIn1h: expiringSoon,
      highRiskPendingReview,
      draftStats,
    };
  }

  async listGovernanceEvents(userId: string, draftId?: string, limit = 30) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30;
    return this.prisma.agentSkillGovernanceEvent.findMany({
      where: {
        ownerUserId: userId,
        draftId: draftId || undefined,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: safeLimit,
    });
  }

  private async logGovernanceEvent(input: {
    ownerUserId: string;
    draftId?: string;
    runtimeGrantId?: string;
    eventType:
      | 'DRAFT_CREATED'
      | 'REVIEW_SUBMITTED'
      | 'REVIEW_APPROVED'
      | 'REVIEW_REJECTED'
      | 'PUBLISHED'
      | 'RUNTIME_GRANT_CREATED'
      | 'RUNTIME_GRANT_USED'
      | 'RUNTIME_GRANT_REVOKED'
      | 'RUNTIME_GRANT_EXPIRED';
    message: string;
    payload?: Record<string, unknown>;
  }) {
    await this.prisma.agentSkillGovernanceEvent.create({
      data: {
        ownerUserId: input.ownerUserId,
        draftId: input.draftId,
        runtimeGrantId: input.runtimeGrantId,
        eventType: input.eventType,
        message: input.message,
        payload: input.payload ? (input.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }
}
