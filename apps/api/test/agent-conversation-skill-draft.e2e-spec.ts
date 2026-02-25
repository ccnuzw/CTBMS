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
  const token = `agent_skill_draft_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Skill Draft ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  const skillCode = `skill_${token}`;
  const highRiskSkillCode = `${skillCode}_high_risk`;

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

    const runtimeGrants = await fetchJson<Array<{ id: string; status: string }>>(
      `${baseUrl}/agent-skills/drafts/${createDraft.body.draftId}/runtime-grants`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(runtimeGrants.status, 200);
    assert.ok(runtimeGrants.body.some((item) => item.status === 'ACTIVE'));

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
    await prisma.agentSkill.deleteMany({ where: { skillCode: { in: [skillCode, highRiskSkillCode] } } });
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
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, reviewerUserId] } } });
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
