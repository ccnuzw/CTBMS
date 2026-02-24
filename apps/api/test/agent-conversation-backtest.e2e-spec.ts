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
class AgentConversationBacktestE2eModule implements NestModule {
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
      config: { riskProfileCode: 'AGENT_CONVERSATION_BACKTEST_E2E' },
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
  const app = await NestFactory.create(AgentConversationBacktestE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_backtest_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Backtest ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;

  let definitionId = '';
  let conversationSessionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Backtest ${token}`,
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
        changelog: 'agent backtest create',
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
    assert.equal(publishVersion.body.status, 'PUBLISHED');

    const createSession = await fetchJson<{ id: string }>(`${baseUrl}/agent-conversations/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({ title: 'Backtest Session' }),
    });
    assert.equal(createSession.status, 201);
    conversationSessionId = createSession.body.id;

    const sendTurn = await fetchJson<{ state: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ message: '请分析最近一周东北玉米价格并输出 markdown 和 json。' }),
      },
    );
    assert.equal(sendTurn.status, 201);
    assert.equal(sendTurn.body.state, 'PLAN_PREVIEW');

    const detail = await fetchJson<{
      plans: Array<{ version: number; planSnapshot: { planId: string } }>;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    const latestPlan = detail.body.plans[0];

    const confirm = await fetchJson<{ executionId: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/plan/confirm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          planId: latestPlan.planSnapshot.planId,
          planVersion: latestPlan.version,
        }),
      },
    );
    assert.equal(confirm.status, 201);

    const createBacktest = await fetchJson<{ backtestJobId: string; status: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/backtests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          executionId: confirm.body.executionId,
          strategySource: 'LATEST_ACTIONS',
          lookbackDays: 180,
          feeModel: {
            spotFeeBps: 8,
            futuresFeeBps: 3,
          },
        }),
      },
    );
    assert.equal(createBacktest.status, 201);
    assert.equal(createBacktest.body.status, 'COMPLETED');
    assert.ok(createBacktest.body.backtestJobId);

    const backtestDetail = await fetchJson<{
      backtestJobId: string;
      status: string;
      summary: {
        returnPct: number;
        maxDrawdownPct: number;
        winRatePct: number;
        score: number;
      };
      assumptions: { lookbackDays: number };
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/backtests/${createBacktest.body.backtestJobId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(backtestDetail.status, 200);
    assert.equal(backtestDetail.body.status, 'COMPLETED');
    assert.equal(backtestDetail.body.assumptions.lookbackDays, 180);
    assert.equal(typeof backtestDetail.body.summary.returnPct, 'number');
    assert.equal(typeof backtestDetail.body.summary.maxDrawdownPct, 'number');
    assert.equal(typeof backtestDetail.body.summary.winRatePct, 'number');
    assert.equal(typeof backtestDetail.body.summary.score, 'number');
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
    process.stdout.write('agent-conversation-backtest e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-backtest e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
