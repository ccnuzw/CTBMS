import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { WorkflowValidationModule } from '../src/modules/workflow-validation';
import { WorkflowReplayModule } from '../src/modules/workflow-replay';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    PrismaModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    WorkflowValidationModule,
    WorkflowReplayModule,
  ],
})
class WorkflowApiAliasE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildDslSnapshot = (
  workflowId: string,
  workflowName: string,
  ownerUserId: string,
  rulePackCode: string,
) => ({
  workflowId,
  name: workflowName,
  mode: 'LINEAR',
  usageMethod: 'COPILOT',
  version: '1.0.0',
  status: 'DRAFT',
  ownerUserId,
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
      config: { riskProfileCode: 'ALIAS_PROFILE' },
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
      timeoutMs: 30000,
      retryCount: 1,
      retryBackoffMs: 2000,
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
  const app = await NestFactory.create(WorkflowApiAliasE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_alias_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow alias ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;

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
        name: 'score guard',
        fieldPath: 'score',
        operator: 'GT',
        expectedValue: 0,
        weight: 1,
      },
    });

    const validation = await fetchJson<{
      valid: boolean;
      issues: Array<{ code: string }>;
    }>(`${baseUrl}/workflow-validations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        dslSnapshot: {
          ...buildDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
          runPolicy: undefined,
        },
        stage: 'PUBLISH',
      }),
    });
    assert.equal(validation.status, 201);
    assert.equal(validation.body.valid, false);
    assert.ok(validation.body.issues.some((issue) => issue.code === 'WF106'));

    const createDefinition = await fetchJson<{
      definition: { id: string };
      version: { id: string; status: string };
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
        dslSnapshot: buildDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
        changelog: 'create definition for alias test',
      }),
    });
    assert.equal(createDefinition.status, 201);
    const definitionId = createDefinition.body.definition.id;
    const versionId = createDefinition.body.version.id;

    const publishVersion = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-definitions/${definitionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ versionId }),
      },
    );
    assert.equal(publishVersion.status, 201);
    assert.equal(publishVersion.body.status, 'PUBLISHED');

    const triggerExecution = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-executions/trigger`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          workflowDefinitionId: definitionId,
          workflowVersionId: versionId,
          triggerType: 'MANUAL',
        }),
      },
    );
    assert.equal(triggerExecution.status, 201);
    assert.equal(triggerExecution.body.status, 'SUCCESS');

    const executionId = triggerExecution.body.id;
    const replay = await fetchJson<{ execution: { id: string; status: string } }>(
      `${baseUrl}/workflow-replays/${executionId}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.execution.id, executionId);

    const timeline = await fetchJson<{ total: number }>(
      `${baseUrl}/workflow-replays/${executionId}/timeline`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(timeline.status, 200);
    assert.ok(timeline.body.total > 0);

    process.stdout.write('[workflow-api-alias.e2e] passed\n');
  } finally {
    await prisma.workflowDefinition.deleteMany({
      where: {
        workflowId: {
          startsWith: token,
        },
      },
    });
    await prisma.decisionRulePack.deleteMany({
      where: {
        rulePackCode: {
          startsWith: token,
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    process.stderr.write(
      `[workflow-api-alias.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`,
    );
  } else {
    process.stderr.write(`[workflow-api-alias.e2e] failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
