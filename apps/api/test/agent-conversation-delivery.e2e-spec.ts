import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { AgentConversationModule } from '../src/modules/agent-conversation';
import { ReportExportModule } from '../src/modules/report-export';
import { AgentSkillModule } from '../src/modules/agent-skill';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AgentSkillModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    ReportExportModule,
    AgentConversationModule,
  ],
})
class AgentConversationDeliveryE2eModule implements NestModule {
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
      config: { riskProfileCode: 'AGENT_CONVERSATION_DELIVERY_E2E' },
    },
    {
      id: 'n_notify',
      type: 'notify',
      name: 'notify',
      enabled: true,
      config: { channels: ['DASHBOARD'] },
    },
    {
      id: 'n_data_evidence',
      type: 'mock-fetch',
      name: 'mock fetch',
      enabled: true,
      config: {},
    },
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

const fetchJson = async <T>(input: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const webhookPayloads: Array<Record<string, unknown>> = [];
  const webhookServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        webhookPayloads.push(JSON.parse(body) as Record<string, unknown>);
      } catch {
        webhookPayloads.push({ parseError: true });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', () => resolve()));
  const webhookPort = (webhookServer.address() as { port: number }).port;
  process.env.MAIL_DELIVERY_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}`;
  process.env.DINGTALK_DELIVERY_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}`;
  process.env.WECOM_DELIVERY_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}`;
  process.env.FEISHU_DELIVERY_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}`;

  const app = await NestFactory.create(AgentConversationDeliveryE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_conversation_delivery_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Conversation Delivery ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;

  let definitionId = '';
  let conversationSessionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Conversation Delivery ${token}`,
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
        changelog: 'agent conversation delivery create',
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
      body: JSON.stringify({ title: 'Delivery Session' }),
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
        body: JSON.stringify({
          message: '请分析最近一周东北玉米价格并输出 markdown 和 json。',
          contextPatch: {
            autoExecute: false,
          },
        }),
      },
    );
    assert.equal(sendTurn.status, 201);
    assert.equal(sendTurn.body.state, 'PLAN_PREVIEW');

    const sessionDetail = await fetchJson<{
      plans: Array<{ version: number; planSnapshot: { planId: string } }>;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(sessionDetail.status, 200);
    const latestPlan = sessionDetail.body.plans[0];

    const confirmPlan = await fetchJson<{ executionId: string; status: string }>(
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
    assert.equal(confirmPlan.status, 201);
    const executionId = confirmPlan.body.executionId;

    const exportResult = await fetchJson<{
      exportTaskId: string;
      status: string;
      workflowExecutionId: string;
      downloadUrl: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        workflowExecutionId: executionId,
        format: 'JSON',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
        includeRawData: true,
      }),
    });
    assert.equal(exportResult.status, 201);
    assert.equal(exportResult.body.workflowExecutionId, executionId);
    assert.ok(exportResult.body.exportTaskId);

    const deliver = await fetchJson<{
      deliveryTaskId: string;
      channel: string;
      status: string;
      errorMessage?: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/deliver/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        exportTaskId: exportResult.body.exportTaskId,
        to: [`${token}@mail.test`],
        subject: 'E2E Delivery',
        content: 'E2E Delivery Body',
      }),
    });
    assert.equal(deliver.status, 201);
    assert.equal(deliver.body.status, 'SENT');
    assert.equal(deliver.body.channel, 'EMAIL');
    assert.ok(deliver.body.deliveryTaskId);

    const deliverToDingTalk = await fetchJson<{
      deliveryTaskId: string;
      channel: string;
      status: string;
      errorMessage?: string | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/deliver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        exportTaskId: exportResult.body.exportTaskId,
        channel: 'DINGTALK',
        target: 'ops-group-01',
        templateCode: 'MORNING_BRIEF',
        sendRawFile: true,
      }),
    });
    assert.equal(deliverToDingTalk.status, 201);
    assert.equal(deliverToDingTalk.body.status, 'SENT');
    assert.equal(deliverToDingTalk.body.channel, 'DINGTALK');

    assert.ok(webhookPayloads.length > 1, '投递 webhook 应至少被调用两次');
    const payload = webhookPayloads[0];
    const payload2 = webhookPayloads[1];
    assert.equal(payload.exportTaskId, exportResult.body.exportTaskId);
    assert.equal(payload.channel, 'EMAIL');
    assert.equal(payload.subject, 'E2E Delivery');
    assert.ok(String((payload.attachment as Record<string, unknown>)?.downloadUrl ?? '').includes('/report-exports/'));
    assert.equal(payload2.channel, 'DINGTALK');
    assert.equal(payload2.target, 'ops-group-01');
    assert.equal(payload2.templateCode, 'MORNING_BRIEF');
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
    await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    delete process.env.MAIL_DELIVERY_WEBHOOK_URL;
    delete process.env.DINGTALK_DELIVERY_WEBHOOK_URL;
    delete process.env.WECOM_DELIVERY_WEBHOOK_URL;
    delete process.env.FEISHU_DELIVERY_WEBHOOK_URL;
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation-delivery e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-delivery e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
