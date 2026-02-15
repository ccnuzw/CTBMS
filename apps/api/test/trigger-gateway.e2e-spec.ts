import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { TriggerGatewayModule } from '../src/modules/trigger-gateway';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, WorkflowDefinitionModule, WorkflowExecutionModule, TriggerGatewayModule],
})
class TriggerGatewayE2eModule implements NestModule {
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
    {
      id: 'n_trigger',
      type: 'manual-trigger',
      name: 'manual trigger',
      enabled: true,
      config: {},
    },
    {
      id: 'n_rule_eval',
      type: 'rule-eval',
      name: 'rule eval',
      enabled: true,
      config: {
        rulePackCode,
      },
    },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: {
        riskProfileCode: 'TRIGGER_GATEWAY_E2E',
      },
    },
    {
      id: 'n_notify',
      type: 'notify',
      name: 'notify',
      enabled: true,
      config: {
        channels: ['DASHBOARD'],
      },
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
      timeoutMs: 30000,
      retryCount: 0,
      retryBackoffMs: 0,
      onError: 'FAIL_FAST',
    },
  },
});

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(TriggerGatewayE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const token = `trigger_gateway_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Trigger Gateway ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  const triggerName = `TG ${token}`;
  let definitionId = '';
  let triggerConfigId = '';
  let publishedVersionId = '';

  try {
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
        changelog: 'trigger gateway e2e create',
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
    assert.equal(publishVersion.status, 201, JSON.stringify(publishVersion.body));
    assert.equal(publishVersion.body.status, 'PUBLISHED');
    publishedVersionId = publishVersion.body.id;

    const createTrigger = await fetchJson<{ id: string; status: string; name: string }>(
      `${baseUrl}/trigger-configs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          workflowDefinitionId: definitionId,
          triggerType: 'ON_DEMAND',
          name: triggerName,
          description: 'trigger gateway e2e',
          paramOverrides: {
            source: 'trigger-config',
          },
        }),
      },
    );
    assert.equal(createTrigger.status, 201);
    assert.equal(createTrigger.body.status, 'ACTIVE');
    triggerConfigId = createTrigger.body.id;

    const outsiderList = await fetchJson<{ total: number; data: Array<{ id: string }> }>(
      `${baseUrl}/trigger-configs`,
      {
        headers: {
          'x-virtual-user-id': outsiderUserId,
        },
      },
    );
    assert.equal(outsiderList.status, 200);
    assert.equal(outsiderList.body.total, 0);
    assert.equal(outsiderList.body.data.length, 0);

    const outsiderFindOne = await fetchJson<{ message?: string }>(`${baseUrl}/trigger-configs/${triggerConfigId}`, {
      headers: {
        'x-virtual-user-id': outsiderUserId,
      },
    });
    assert.equal(outsiderFindOne.status, 404);

    const outsiderFire = await fetchJson<{ message?: string }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/fire`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': outsiderUserId,
        },
        body: JSON.stringify({ workflowVersionId: publishedVersionId }),
      },
    );
    assert.equal(outsiderFire.status, 404);

    const fireTrigger = await fetchJson<{
      workflowExecutionId: string;
      executionStatus: string;
      durationMs: number;
    }>(`${baseUrl}/trigger-configs/${triggerConfigId}/fire`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        workflowVersionId: publishedVersionId,
        idempotencyKey: `${token}_idempotent`,
        paramSnapshot: {
          fromFire: true,
        },
      }),
    });
    assert.equal(fireTrigger.status, 201);
    assert.ok(fireTrigger.body.workflowExecutionId);
    assert.equal(fireTrigger.body.executionStatus, 'SUCCESS');
    assert.ok(fireTrigger.body.durationMs >= 0);

    const logPage = await fetchJson<{ total: number; data: Array<{ status: string }> }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/logs`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(logPage.status, 200);
    assert.ok(logPage.body.total >= 1);
    assert.ok(logPage.body.data.some((item) => item.status === 'SUCCESS'));

    const outsiderLogPage = await fetchJson<{ total: number; data: Array<{ status: string }> }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/logs`,
      {
        headers: {
          'x-virtual-user-id': outsiderUserId,
        },
      },
    );
    assert.equal(outsiderLogPage.status, 200);
    assert.equal(outsiderLogPage.body.total, 0);
    assert.equal(outsiderLogPage.body.data.length, 0);

    const outsiderDeactivate = await fetchJson<{ message?: string }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/deactivate`,
      {
        method: 'POST',
        headers: {
          'x-virtual-user-id': outsiderUserId,
        },
      },
    );
    assert.equal(outsiderDeactivate.status, 404);

    const deactivate = await fetchJson<{ status: string }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/deactivate`,
      {
        method: 'POST',
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(deactivate.status, 201);
    assert.equal(deactivate.body.status, 'INACTIVE');

    const fireWhenInactive = await fetchJson<{ message?: string }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/fire`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(fireWhenInactive.status, 400);

    const skippedLogs = await fetchJson<{ total: number; data: Array<{ status: string }> }>(
      `${baseUrl}/trigger-configs/${triggerConfigId}/logs?status=SKIPPED`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(skippedLogs.status, 200);
    assert.ok(skippedLogs.body.total >= 1);
    assert.ok(skippedLogs.body.data.some((item) => item.status === 'SKIPPED'));
  } finally {
    if (triggerConfigId) {
      await prisma.triggerLog.deleteMany({ where: { triggerConfigId } });
      await prisma.triggerConfig.deleteMany({ where: { id: triggerConfigId } });
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
    await prisma.decisionRulePack.deleteMany({
      where: {
        rulePackCode,
      },
    });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('trigger-gateway e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(`trigger-gateway e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
