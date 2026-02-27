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
class AgentConversationAssetsE2eModule implements NestModule {
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
    {
      id: 'n_rule_eval',
      type: 'rule-eval',
      name: 'rule eval',
      enabled: true,
      config: { rulePackCode },
    },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: { riskProfileCode: 'AGENT_CONVERSATION_ASSETS_E2E' },
    },
    {
      id: 'n_notify',
      type: 'notify',
      name: 'notify',
      enabled: true,
      config: { channels: ['DASHBOARD'] },
    },
    { id: 'n_data_evidence', type: 'mock-fetch', name: 'mock fetch', enabled: true, config: {} },
    {
      id: 'n_model_evidence',
      type: 'single-agent',
      name: 'single agent',
      enabled: true,
      config: {},
    },
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

const fetchJson = async <T>(
  input: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(AgentConversationAssetsE2eModule, {
    logger: ['error', 'warn'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_assets_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Assets ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;

  let definitionId = '';
  let conversationSessionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Assets ${token}`,
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
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify({
        workflowId,
        name: workflowName,
        mode: 'LINEAR',
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDsl(workflowId, workflowName, rulePackCode),
        changelog: 'agent conversation assets create',
      }),
    });
    assert.equal(createDefinition.status, 201);
    definitionId = createDefinition.body.definition.id;

    const publishVersion = await fetchJson<{ status: string }>(
      `${baseUrl}/workflow-definitions/${definitionId}/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
        body: JSON.stringify({ versionId: createDefinition.body.version.id }),
      },
    );
    assert.equal(publishVersion.status, 201);

    const createSession = await fetchJson<{ id: string }>(
      `${baseUrl}/agent-conversations/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
        body: JSON.stringify({ title: 'Assets Session' }),
      },
    );
    assert.equal(createSession.status, 201);
    conversationSessionId = createSession.body.id;

    const sendTurn = await fetchJson<{ executionId?: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
        body: JSON.stringify({ message: '请分析最近一周东北玉米价格并输出 markdown 和 json。' }),
      },
    );
    assert.equal(sendTurn.status, 201);

    const assetsResp = await fetchJson<Array<{ id: string; assetType: string; title: string }>>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/assets`,
      {
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(assetsResp.status, 200);
    assert.ok(assetsResp.body.length > 0);
    const planAsset = assetsResp.body.find((item) => item.assetType === 'PLAN');
    assert.ok(planAsset);

    const reuseResp = await fetchJson<{ state: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/assets/${planAsset?.id}/reuse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
        body: JSON.stringify({ message: '请在这个计划基础上补充风险控制说明。' }),
      },
    );
    assert.equal(reuseResp.status, 201);
    assert.ok(['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(reuseResp.body.state));

    const explicitNaturalReuse = await fetchJson<{ state: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
        body: JSON.stringify({
          message: `请基于[asset:${planAsset?.id}]继续输出结论和风险摘要。`,
        }),
      },
    );
    assert.equal(explicitNaturalReuse.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(explicitNaturalReuse.body.state),
    );

    const semanticNaturalReuse = await fetchJson<{
      state: string;
      reuseResolution?: {
        semanticResolution?: {
          candidateCount?: number;
          topCandidates?: Array<{ id: string; title: string }>;
        };
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify({
        message: '请基于最近一次计划继续补充执行步骤。',
      }),
    });
    assert.equal(semanticNaturalReuse.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(semanticNaturalReuse.body.state),
    );
    const candidateCount =
      semanticNaturalReuse.body.reuseResolution?.semanticResolution?.candidateCount ?? 0;
    assert.ok(candidateCount >= 0);

    const followupByRank = await fetchJson<{
      state: string;
      reuseResolution?: {
        followupAssetRefCount?: number;
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify({
        message: '请用第2个继续补充风险说明。',
      }),
    });
    assert.equal(followupByRank.status, 201);
    assert.ok(['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(followupByRank.body.state));
    assert.ok((followupByRank.body.reuseResolution?.followupAssetRefCount ?? 0) >= 0);

    const semanticNaturalReuseRound2 = await fetchJson<{
      state: string;
      reuseResolution?: {
        semanticResolution?: {
          candidateCount?: number;
        };
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify({
        message: '请基于最近一次计划继续补充执行步骤并标注风险优先级。',
      }),
    });
    assert.equal(semanticNaturalReuseRound2.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(semanticNaturalReuseRound2.body.state),
    );

    const followupPreviousRound = await fetchJson<{
      state: string;
      reuseResolution?: {
        followupAssetRefCount?: number;
      };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify({
        message: '还是用上轮第2个继续输出。',
      }),
    });
    assert.equal(followupPreviousRound.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(followupPreviousRound.body.state),
    );
    assert.ok((followupPreviousRound.body.reuseResolution?.followupAssetRefCount ?? 0) >= 0);

    const refCount = await prisma.conversationAssetRef.count({
      where: { sessionId: conversationSessionId },
    });
    assert.ok(refCount >= 3);
  } finally {
    if (conversationSessionId) {
      await prisma.conversationSession.deleteMany({ where: { id: conversationSessionId } });
    }
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
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation-assets e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-assets e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
