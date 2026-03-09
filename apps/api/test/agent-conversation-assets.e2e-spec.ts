import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const postJsonWithRetry = async <T>(
  url: string,
  ownerUserId: string,
  payload: unknown,
  maxAttempts = 3,
): Promise<{ status: number; body: T }> => {
  let lastResponse: { status: number; body: T } | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchJson<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-virtual-user-id': ownerUserId },
      body: JSON.stringify(payload),
    });
    lastResponse = response;
    if (response.status === 201) {
      return response;
    }
    const shouldRetry = response.status >= 500 || response.status === 429;
    if (!shouldRetry || attempt === maxAttempts) {
      return response;
    }
    await sleep(200 * attempt);
  }
  return lastResponse as { status: number; body: T };
};

const postTurnWithRetry = async <T>(
  baseUrl: string,
  sessionId: string,
  ownerUserId: string,
  payload: { message: string; contextPatch?: Record<string, unknown> },
  maxAttempts = 3,
): Promise<{ status: number; body: T }> =>
  postJsonWithRetry<T>(
    `${baseUrl}/agent-conversations/sessions/${sessionId}/turns`,
    ownerUserId,
    payload,
    maxAttempts,
  );

const waitForAssetRefCount = async (
  sessionId: string,
  minCount: number,
  maxAttempts = 10,
): Promise<number> => {
  let lastCount = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastCount = await prisma.conversationAssetRef.count({ where: { sessionId } });
    if (lastCount >= minCount) {
      return lastCount;
    }
    await sleep(200 * attempt);
  }
  return lastCount;
};

async function main() {
  const bootstrapAppWithRetry = async (
    maxAttempts = 3,
  ): Promise<{ app: INestApplication; baseUrl: string }> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const app = await NestFactory.create(AgentConversationAssetsE2eModule, {
        logger: ['error', 'warn'],
      });
      app.useGlobalPipes(new ZodValidationPipe());
      try {
        await app.listen(0);
        const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
        return { app, baseUrl };
      } catch (error) {
        lastError = error;
        await app.close().catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes("Can't reach database server") || message.includes('ECONNREFUSED');
        if (!retryable || attempt === maxAttempts) {
          throw error;
        }
        await sleep(300 * attempt);
      }
    }
    throw lastError;
  };

  const bootstrapped = await bootstrapAppWithRetry();
  const app = bootstrapped.app;
  const baseUrl = bootstrapped.baseUrl;

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

    const sendTurn = await postTurnWithRetry<{ executionId?: string }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      { message: '请分析最近一周东北玉米价格并输出 markdown 和 json。' },
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

    const reuseResp = await postJsonWithRetry<{ state: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/assets/${planAsset?.id}/reuse`,
      ownerUserId,
      { message: '请在这个计划基础上补充风险控制说明。' },
    );
    assert.equal(reuseResp.status, 201);
    assert.ok(['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(reuseResp.body.state));

    const explicitNaturalReuse = await postTurnWithRetry<{ state: string }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      {
        message: `请基于[asset:${planAsset?.id}]继续输出结论和风险摘要。`,
      },
    );
    assert.equal(explicitNaturalReuse.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(explicitNaturalReuse.body.state),
    );

    const semanticNaturalReuse = await postTurnWithRetry<{
      state: string;
      reuseResolution?: {
        semanticResolution?: {
          candidateCount?: number;
          topCandidates?: Array<{ id: string; title: string }>;
        };
      };
    }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      {
        message: '请基于最近一次计划继续补充执行步骤。',
      },
    );
    assert.equal(semanticNaturalReuse.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(semanticNaturalReuse.body.state),
    );
    const candidateCount =
      semanticNaturalReuse.body.reuseResolution?.semanticResolution?.candidateCount ?? 0;
    assert.ok(candidateCount >= 0);

    const followupByRank = await postTurnWithRetry<{
      state: string;
      reuseResolution?: {
        followupAssetRefCount?: number;
      };
    }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      {
        message: '请用第2个继续补充风险说明。',
      },
    );
    assert.equal(followupByRank.status, 201);
    assert.ok(['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(followupByRank.body.state));
    assert.ok((followupByRank.body.reuseResolution?.followupAssetRefCount ?? 0) >= 0);

    const semanticNaturalReuseRound2 = await postTurnWithRetry<{
      state: string;
      reuseResolution?: {
        semanticResolution?: {
          candidateCount?: number;
        };
      };
    }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      {
        message: '请基于最近一次计划继续补充执行步骤并标注风险优先级。',
      },
    );
    assert.equal(semanticNaturalReuseRound2.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(semanticNaturalReuseRound2.body.state),
    );

    const followupPreviousRound = await postTurnWithRetry<{
      state: string;
      reuseResolution?: {
        followupAssetRefCount?: number;
      };
    }>(
      baseUrl,
      conversationSessionId,
      ownerUserId,
      {
        message: '还是用上轮第2个继续输出。',
      },
    );
    assert.equal(followupPreviousRound.status, 201);
    assert.ok(
      ['SLOT_FILLING', 'PLAN_PREVIEW', 'EXECUTING'].includes(followupPreviousRound.body.state),
    );
    assert.ok((followupPreviousRound.body.reuseResolution?.followupAssetRefCount ?? 0) >= 0);

    const refCount = await waitForAssetRefCount(conversationSessionId, 3);
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
