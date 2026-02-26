import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { AgentConversationModule } from '../src/modules/agent-conversation';
import { AgentSkillModule } from '../src/modules/agent-skill';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AgentSkillModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    AgentConversationModule,
  ],
})
class AgentConversationSkillDraftE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildDsl = (workflowId: string, workflowName: string, rulePackCode: string) => ({
  workflowId,
  name: workflowName,
  mode: 'LINEAR',
  usageMethod: 'COPILOT',
  version: '1.0.0',
  status: 'DRAFT',
  nodes: [
    { id: 'n_trigger', type: 'manual-trigger', name: 'manual trigger', enabled: true, config: {} },
    { id: 'n_rule_eval', type: 'rule-eval', name: 'rule eval', enabled: true, config: { rulePackCode } },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: { riskProfileCode: 'AGENT_CONVERSATION_SKILL_DRAFT_E2E' },
    },
    { id: 'n_notify', type: 'notify', name: 'notify', enabled: true, config: { channels: ['DASHBOARD'] } },
    { id: 'n_data_evidence', type: 'mock-fetch', name: 'mock fetch', enabled: true, config: {} },
    { id: 'n_model_evidence', type: 'single-agent', name: 'single agent', enabled: true, config: {} },
  ],
  edges: [
    { id: 'e1', from: 'n_trigger', to: 'n_rule_eval', edgeType: 'control-edge' },
    { id: 'e2', from: 'n_rule_eval', to: 'n_risk_gate', edgeType: 'control-edge' },
    { id: 'e3', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
    { id: 'e4', from: 'n_data_evidence', to: 'n_model_evidence', edgeType: 'control-edge' },
  ],
  runPolicy: {
    nodeDefaults: {
      timeoutSeconds: 30,
      retryCount: 0,
      retryIntervalSeconds: 0,
      onError: 'FAIL_FAST',
    },
  },
});

const fetchJson = async <T>(input: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(AgentConversationSkillDraftE2eModule, {
    logger: ['error', 'warn'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const reviewerUserId = randomUUID();
  const publicSkillOwnerUserId = randomUUID();
  const token = `agent_skill_draft_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Skill Draft ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  const skillCode = `skill_${token}`;
  const highRiskSkillCode = `${skillCode}_high_risk`;
  const publicSkillCode = `${skillCode}_public_pool`;

  let definitionId = '';
  let conversationSessionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Skill Draft ${token}`,
      },
    });
    await prisma.user.create({
      data: {
        id: reviewerUserId,
        username: `${token}_reviewer`,
        email: `${token}_reviewer@example.com`,
        name: `Agent Skill Draft Reviewer ${token}`,
      },
    });
    await prisma.user.create({
      data: {
        id: publicSkillOwnerUserId,
        username: `${token}_public_owner`,
        email: `${token}_public_owner@example.com`,
        name: `Agent Skill Public Owner ${token}`,
      },
    });

    await prisma.agentSkill.create({
      data: {
        skillCode: publicSkillCode,
        name: '公开行情能力',
        description: '用于获取交易所公开行情与持仓数据，适用于普通市场分析。',
        parameters: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
          },
        } as Prisma.InputJsonValue,
        handlerCode: `skill.public.${publicSkillCode}`,
        ownerUserId: publicSkillOwnerUserId,
        templateSource: 'PUBLIC',
        isActive: true,
      },
    });

    const rulePack = await prisma.decisionRulePack.create({
      data: {
        rulePackCode,
        name: `Rule Pack ${token}`,
        ownerUserId,
        version: 2,
      },
    });
    await prisma.decisionRule.create({
      data: {
        rulePackId: rulePack.id,
        ruleCode: `${token}_RULE_1`,
        name: 'exists check',
        fieldPath: 'triggeredAt',
        operator: 'EXISTS',
        expectedValue: Prisma.JsonNull,
        weight: 1,
      },
    });

    const createDefinition = await fetchJson<{
      definition: { id: string };
      version: { id: string };
    }>(`${baseUrl}/workflow-definitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        workflowId,
        name: workflowName,
        mode: 'LINEAR',
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDsl(workflowId, workflowName, rulePackCode),
        changelog: 'agent skill draft create',
      }),
    });
    assert.equal(createDefinition.status, 201);
    definitionId = createDefinition.body.definition.id;

    const publishVersion = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-definitions/${definitionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ versionId: createDefinition.body.version.id }),
      },
    );
    assert.equal(publishVersion.status, 201);

    const createSession = await fetchJson<{ id: string }>(`${baseUrl}/agent-conversations/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({ title: 'Skill Draft Session' }),
    });
    assert.equal(createSession.status, 201);
    conversationSessionId = createSession.body.id;

    await prisma.userConfigBinding.create({
      data: {
        userId: ownerUserId,
        bindingType: 'AGENT_EPHEMERAL_CAPABILITY_POLICY',
        targetId: 'agent-ephemeral-capability-policy-default',
        targetCode: 'agent-ephemeral-capability-policy-default',
        metadata: {
          draftSemanticReuseThreshold: 0.7,
          publishedSkillReuseThreshold: 0.75,
          runtimeGrantTtlHours: 12,
          runtimeGrantMaxUseCount: 5,
        } as Prisma.InputJsonValue,
        isActive: true,
        priority: 200,
      },
    });

    const createDraft = await fetchJson<{
      draftId: string;
      status: string;
      reviewRequired: boolean;
      riskLevel: string;
      provisionalEnabled: boolean;
      runtimeGrantId?: string | null;
    }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-gap/skill-draft`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          gapType: 'MISSING_FUTURES_OPEN_API',
          requiredCapability: '获取交易所公开持仓排名数据',
          suggestedSkillCode: skillCode,
        }),
      },
    );
    assert.equal(createDraft.status, 201);
    assert.equal(createDraft.body.status, 'DRAFT');
    assert.equal(createDraft.body.reviewRequired, true);
    assert.equal(createDraft.body.riskLevel, 'LOW');
    assert.equal(createDraft.body.provisionalEnabled, true);
    assert.ok(createDraft.body.runtimeGrantId);

    const reuseDraft = await fetchJson<{
      draftId: string;
      status: string;
      reused?: boolean;
      reuseSource?: string;
      runtimeGrantId?: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-gap/skill-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        gapType: 'MISSING_FUTURES_OPEN_API',
        requiredCapability: '获取交易所公开持仓排名数据并做周度更新',
        suggestedSkillCode: skillCode,
      }),
    });
    assert.equal(reuseDraft.status, 201);
    assert.equal(reuseDraft.body.draftId, createDraft.body.draftId);
    assert.equal(reuseDraft.body.reused, true);
    assert.ok(
      reuseDraft.body.reuseSource === 'EXACT_CODE' || reuseDraft.body.reuseSource === 'SEMANTIC_MATCH',
    );

    const routingLogs = await fetchJson<
      Array<{
        routeType: string;
        selectedDraftId?: string | null;
        selectedSource?: string | null;
        routePolicyDetails?: Record<string, unknown>;
      }>
    >(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-routing-logs?routeType=SKILL_DRAFT_REUSE&window=24h`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(routingLogs.status, 200);
    assert.ok(routingLogs.body.length > 0);
    assert.ok(routingLogs.body.every((item) => item.routeType === 'SKILL_DRAFT_REUSE'));
    assert.ok(routingLogs.body.some((item) => item.selectedDraftId === createDraft.body.draftId));
    assert.ok(routingLogs.body.some((item) => Boolean(item.routePolicyDetails)));

    const ephemeralSummary = await fetchJson<{
      window: string;
      totals: {
        drafts: number;
        runtimeGrants: number;
      };
      policy: {
        runtimeGrantMaxUseCount: number;
        runtimeGrantTtlHours: number;
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/summary?window=24h`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(ephemeralSummary.status, 200);
    assert.equal(ephemeralSummary.body.window, '24h');
    assert.ok(ephemeralSummary.body.totals.drafts >= 1);
    assert.equal(ephemeralSummary.body.policy.runtimeGrantMaxUseCount, 5);
    assert.equal(ephemeralSummary.body.policy.runtimeGrantTtlHours, 12);

    const evolutionPlan = await fetchJson<{
      window: string;
      recommendations: {
        promoteDraftCandidates: Array<{ draftId: string; suggestedSkillCode: string; hitCount: number }>;
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/evolution-plan?window=24h`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(evolutionPlan.status, 200);
    assert.equal(evolutionPlan.body.window, '24h');
    assert.ok(Array.isArray(evolutionPlan.body.recommendations.promoteDraftCandidates));

    const evolutionApply = await fetchJson<{
      window: string;
      expiredGrantCount: number;
      disabledDraftCount: number;
      promoteSuggestionCount: number;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/evolution-apply?window=24h`, {
      method: 'POST',
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(evolutionApply.status, 201);
    assert.equal(evolutionApply.body.window, '24h');
    assert.equal(typeof evolutionApply.body.promoteSuggestionCount, 'number');

    const promotionTasks = await fetchJson<
      Array<{
        taskAssetId: string;
        draftId: string;
        suggestedSkillCode: string;
        status: string;
      }>
    >(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-tasks?window=24h`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(promotionTasks.status, 200);
    assert.ok(Array.isArray(promotionTasks.body));

    if (promotionTasks.body.length > 0) {
      const firstTask = promotionTasks.body[0];
      assert.ok(firstTask.taskAssetId);
      assert.ok(firstTask.draftId);
      assert.ok(firstTask.suggestedSkillCode);

      const markReviewing = await fetchJson<{ task: { status: string } }>(
        `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-tasks/${firstTask.taskAssetId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-virtual-user-id': ownerUserId,
          },
          body: JSON.stringify({
            action: 'START_REVIEW',
            comment: 'e2e mark reviewing',
          }),
        },
      );
      assert.equal(markReviewing.status, 200);
      assert.equal(markReviewing.body.task.status, 'IN_REVIEW');

      const promotionSummary = await fetchJson<{
        window: string;
        totalTasks: number;
        pendingActionCount: number;
        stats: {
          byStatus: Array<{ key: string; count: number }>;
        };
      }>(
        `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-tasks/summary?window=24h`,
        {
          headers: {
            'x-virtual-user-id': ownerUserId,
          },
        },
      );
      assert.equal(promotionSummary.status, 200);
      assert.equal(promotionSummary.body.window, '24h');
      assert.ok(promotionSummary.body.totalTasks >= 1);
      assert.ok(Array.isArray(promotionSummary.body.stats.byStatus));

      const batchSync = await fetchJson<{
        action: string;
        batchId?: string;
        batchAssetId?: string;
        requestedCount: number;
        succeededCount: number;
      }>(
        `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-tasks/batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-virtual-user-id': ownerUserId,
          },
          body: JSON.stringify({
            action: 'SYNC_DRAFT_STATUS',
            taskAssetIds: [firstTask.taskAssetId],
            maxConcurrency: 2,
            maxRetries: 1,
          }),
        },
      );
      assert.equal(batchSync.status, 201);
      assert.equal(batchSync.body.action, 'SYNC_DRAFT_STATUS');
      assert.ok(batchSync.body.batchId);
      assert.ok(batchSync.body.batchAssetId);
      assert.equal(batchSync.body.requestedCount, 1);
      assert.equal(batchSync.body.succeededCount, 1);

      const batchList = await fetchJson<
        Array<{
          batchAssetId: string;
          batchId: string;
          action: string;
          failedCount: number;
        }>
      >(
        `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-task-batches?window=24h&limit=20`,
        {
          headers: {
            'x-virtual-user-id': ownerUserId,
          },
        },
      );
      assert.equal(batchList.status, 200);
      assert.ok(Array.isArray(batchList.body));
      assert.ok(batchList.body.length >= 1);
      const latestBatch = batchList.body[0];
      assert.ok(latestBatch.batchAssetId);
      assert.equal(latestBatch.action, 'SYNC_DRAFT_STATUS');

      const replayFailed = await fetchJson<{
        sourceBatchAssetId: string;
        sourceAction: string;
        sourceFailedCount: number;
        selectedReplayCount: number;
        replayMode: string;
        replayResult: {
          action: string;
          requestedCount: number;
        };
      }>(
        `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/promotion-task-batches/${latestBatch.batchAssetId}/replay-failed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-virtual-user-id': ownerUserId,
          },
          body: JSON.stringify({
            maxConcurrency: 2,
            maxRetries: 1,
            replayMode: 'RETRYABLE_ONLY',
          }),
        },
      );
      assert.equal(replayFailed.status, 201);
      assert.equal(replayFailed.body.sourceBatchAssetId, latestBatch.batchAssetId);
      assert.equal(replayFailed.body.sourceAction, 'SYNC_DRAFT_STATUS');
      assert.equal(replayFailed.body.replayMode, 'RETRYABLE_ONLY');
      assert.ok(replayFailed.body.selectedReplayCount >= 0);
      assert.equal(replayFailed.body.replayResult.action, 'SYNC_DRAFT_STATUS');
    }

    const ephemeralHousekeeping = await fetchJson<{
      expiredGrantCount: number;
      disabledDraftCount: number;
      checkedAt: string;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/ephemeral-capabilities/housekeeping`, {
      method: 'POST',
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(ephemeralHousekeeping.status, 201);
    assert.equal(typeof ephemeralHousekeeping.body.checkedAt, 'string');

    const reusePublishedSkill = await fetchJson<{
      draftId: string;
      status: string;
      reviewRequired: boolean;
      reused?: boolean;
      reuseSource?: string;
      runtimeGrantId?: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-gap/skill-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        gapType: 'MARKET_ANALYSIS_ASSIST',
        requiredCapability: '需要一个公开可复用的行情能力',
        suggestedSkillCode: publicSkillCode,
      }),
    });
    assert.equal(reusePublishedSkill.status, 201);
    assert.equal(reusePublishedSkill.body.status, 'PUBLISHED');
    assert.equal(reusePublishedSkill.body.reviewRequired, false);
    assert.equal(reusePublishedSkill.body.reused, true);
    assert.equal(reusePublishedSkill.body.reuseSource, 'PUBLISHED_SKILL');
    assert.equal(reusePublishedSkill.body.runtimeGrantId ?? null, null);

    const runtimeGrants = await fetchJson<Array<{ id: string; status: string; maxUseCount: number }>>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/runtime-grants`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(runtimeGrants.status, 200);
    assert.ok(runtimeGrants.body.some((item) => item.status === 'ACTIVE'));
    assert.ok(runtimeGrants.body.some((item) => item.maxUseCount === 5));

    const createHighRiskDraft = await fetchJson<{
      draftId: string;
      riskLevel: string;
      provisionalEnabled: boolean;
      runtimeGrantId?: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-gap/skill-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        gapType: 'TRADE_EXECUTION_AUTOMATION',
        requiredCapability: '自动下单并执行交易',
        suggestedSkillCode: highRiskSkillCode,
        riskLevel: 'HIGH',
        sideEffectRisk: true,
      }),
    });
    assert.equal(createHighRiskDraft.status, 201);
    assert.equal(createHighRiskDraft.body.riskLevel, 'HIGH');
    assert.equal(createHighRiskDraft.body.provisionalEnabled, false);
    assert.equal(createHighRiskDraft.body.runtimeGrantId ?? null, null);

    const consumeGrant = await fetchJson<{ useCount: number; status: string }>(
      `${baseUrl}/agent-skills/runtime-grants/${createDraft.body.runtimeGrantId}/use`,
      {
        method: 'POST',
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(consumeGrant.status, 201);
    assert.equal(consumeGrant.body.useCount, 1);
    assert.equal(consumeGrant.body.status, 'ACTIVE');

    const overview = await fetchJson<{
      activeRuntimeGrants: number;
      highRiskPendingReview: number;
    }>(`${baseUrl}/agent-skills/governance/overview`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(overview.status, 200);
    assert.ok(overview.body.activeRuntimeGrants >= 1);
    assert.ok(overview.body.highRiskPendingReview >= 1);

    await prisma.agentSkillRuntimeGrant.update({
      where: { id: String(createDraft.body.runtimeGrantId) },
      data: {
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const housekeeping = await fetchJson<{
      expiredGrantCount: number;
      disabledDraftCount: number;
    }>(`${baseUrl}/agent-skills/governance/housekeeping`, {
      method: 'POST',
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(housekeeping.status, 201);
    assert.ok(housekeeping.body.expiredGrantCount >= 1);

    const grantsAfterHousekeeping = await fetchJson<Array<{ id: string; status: string }>>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/runtime-grants`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(grantsAfterHousekeeping.status, 200);
    const mutatedGrant = grantsAfterHousekeeping.body.find(
      (item) => item.id === String(createDraft.body.runtimeGrantId),
    );
    assert.equal(mutatedGrant?.status, 'EXPIRED');

    const approveHighRiskByOwner = await fetchJson<{ code?: string }>(
      `${baseUrl}/agent-skills/drafts/${createHighRiskDraft.body.draftId}/review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          action: 'APPROVE',
          comment: 'owner should be blocked',
        }),
      },
    );
    assert.equal(approveHighRiskByOwner.status, 400);
    assert.equal(approveHighRiskByOwner.body.code, 'SKILL_REVIEWER_CONFLICT');

    const approveHighRiskByReviewer = await fetchJson<{ status: string }>(
      `${baseUrl}/agent-skills/drafts/${createHighRiskDraft.body.draftId}/review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': reviewerUserId,
        },
        body: JSON.stringify({
          action: 'APPROVE',
          comment: 'approved by reviewer',
        }),
      },
    );
    assert.equal(approveHighRiskByReviewer.status, 201);
    assert.equal(approveHighRiskByReviewer.body.status, 'APPROVED');

    const publishHighRisk = await fetchJson<{ status: string; publishedSkillId?: string | null }>(
      `${baseUrl}/agent-skills/drafts/${createHighRiskDraft.body.draftId}/publish`,
      {
        method: 'POST',
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(publishHighRisk.status, 201);
    assert.equal(publishHighRisk.body.status, 'PUBLISHED');
    assert.ok(publishHighRisk.body.publishedSkillId);

    const governanceEvents = await fetchJson<Array<{ eventType: string; draftId?: string | null }>>(
      `${baseUrl}/agent-skills/governance/events?draftId=${createHighRiskDraft.body.draftId}&limit=20`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(governanceEvents.status, 200);
    const eventTypes = governanceEvents.body.map((item) => item.eventType);
    assert.ok(eventTypes.includes('DRAFT_CREATED'));
    assert.ok(eventTypes.includes('REVIEW_APPROVED'));
    assert.ok(eventTypes.includes('PUBLISHED'));

    const sandbox = await fetchJson<{ testRunId: string; status: string; passedCount: number; failedCount: number }>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/sandbox-test`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          testCases: [
            {
              input: { symbol: 'C', date: '2026-02-25', openInterest: 123 },
              expectContains: ['symbol', 'openInterest'],
            },
          ],
        }),
      },
    );
    assert.equal(sandbox.status, 201);
    assert.equal(sandbox.body.status, 'PASSED');
    assert.equal(sandbox.body.passedCount, 1);
    assert.equal(sandbox.body.failedCount, 0);

    const submitReview = await fetchJson<{ draftId: string; status: string }>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/submit-review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(submitReview.status, 201);
    assert.equal(submitReview.body.status, 'READY_FOR_REVIEW');

    const approve = await fetchJson<{ draftId: string; status: string }>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/review`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          action: 'APPROVE',
          comment: 'e2e auto approve',
        }),
      },
    );
    assert.equal(approve.status, 201);
    assert.equal(approve.body.status, 'APPROVED');

    const publish = await fetchJson<{ draftId: string; status: string; publishedSkillId: string }>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(publish.status, 201);
    assert.equal(publish.body.status, 'PUBLISHED');
    assert.ok(publish.body.publishedSkillId);

    const skill = await prisma.agentSkill.findUnique({ where: { id: publish.body.publishedSkillId } });
    assert.ok(skill);
    assert.equal(skill?.skillCode, skillCode);
  } finally {
    if (conversationSessionId) {
      await prisma.conversationSession.deleteMany({ where: { id: conversationSessionId } });
    }
    await prisma.agentSkill.deleteMany({
      where: { skillCode: { in: [skillCode, highRiskSkillCode, publicSkillCode] } },
    });
    if (definitionId) {
      await prisma.workflowExecution.deleteMany({
        where: {
          workflowVersion: {
            workflowDefinitionId: definitionId,
          },
        },
      });
      await prisma.workflowVersion.deleteMany({ where: { workflowDefinitionId: definitionId } });
      await prisma.workflowDefinition.deleteMany({ where: { id: definitionId } });
    }
    await prisma.decisionRulePack.deleteMany({ where: { rulePackCode } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, reviewerUserId, publicSkillOwnerUserId] } } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation-skill-draft e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-skill-draft e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
