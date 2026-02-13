import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { WorkflowExperimentModule } from '../src/modules/workflow-experiment';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    PrismaModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    WorkflowExperimentModule,
  ],
})
class WorkflowExperimentE2eModule implements NestModule {
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
        riskProfileCode: 'WORKFLOW_EXPERIMENT_E2E',
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
  const app = await NestFactory.create(WorkflowExperimentE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `workflow_experiment_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Workflow Experiment ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  let definitionId = '';
  let experimentId = '';
  let variantAVersionId = '';
  let variantBVersionId = '';

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
        changelog: 'workflow experiment e2e create',
      }),
    });
    assert.equal(createDefinition.status, 201);
    definitionId = createDefinition.body.definition.id;

    const publishA = await fetchJson<{ id: string; status: string }>(
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
    assert.equal(publishA.status, 201);
    assert.equal(publishA.body.status, 'PUBLISHED');
    variantAVersionId = publishA.body.id;

    const versions = await fetchJson<
      Array<{ id: string; status: string; versionCode: string }>
    >(`${baseUrl}/workflow-definitions/${definitionId}/versions`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(versions.status, 200);
    const draftVersion = versions.body.find((item) => item.status === 'DRAFT');
    assert.ok(draftVersion, 'expected auto-created draft version after publish');

    const publishB = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-definitions/${definitionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ versionId: draftVersion!.id }),
      },
    );
    assert.equal(publishB.status, 201);
    assert.equal(publishB.body.status, 'PUBLISHED');
    variantBVersionId = publishB.body.id;
    assert.notEqual(variantAVersionId, variantBVersionId);

    const createExperiment = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-experiments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          experimentCode: `${token}_AB`,
          name: `Experiment ${token}`,
          workflowDefinitionId: definitionId,
          variantAVersionId,
          variantBVersionId,
          trafficSplitPercent: 50,
          maxExecutions: 100,
        }),
      },
    );
    assert.equal(createExperiment.status, 201);
    assert.equal(createExperiment.body.status, 'DRAFT');
    experimentId = createExperiment.body.id;

    const startExperiment = await fetchJson<{ status: string }>(
      `${baseUrl}/workflow-experiments/${experimentId}/start`,
      {
        method: 'POST',
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(startExperiment.status, 201);
    assert.equal(startExperiment.body.status, 'RUNNING');

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
          experimentId,
          triggerType: 'ON_DEMAND',
          idempotencyKey: `${token}_run_1`,
          paramSnapshot: {
            source: 'experiment-e2e',
          },
        }),
      },
    );
    assert.equal(triggerExecution.status, 201);
    assert.equal(triggerExecution.body.status, 'SUCCESS');

    const runPage = await fetchJson<{
      total: number;
      data: Array<{ workflowExecutionId: string; variant: 'A' | 'B'; success: boolean }>;
    }>(`${baseUrl}/workflow-experiments/${experimentId}/runs`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(runPage.status, 200);
    assert.ok(runPage.body.total >= 1);
    assert.ok(runPage.body.data.some((item) => item.workflowExecutionId === triggerExecution.body.id));

    const experimentDetail = await fetchJson<{
      status: string;
      currentExecutionsA: number;
      currentExecutionsB: number;
    }>(`${baseUrl}/workflow-experiments/${experimentId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(experimentDetail.status, 200);
    assert.equal(experimentDetail.body.status, 'RUNNING');
    assert.ok(experimentDetail.body.currentExecutionsA + experimentDetail.body.currentExecutionsB >= 1);

    const evaluation = await fetchJson<{
      recentRuns: Array<{ workflowExecutionId: string }>;
      metrics: Record<string, unknown> | null;
    }>(`${baseUrl}/workflow-experiments/${experimentId}/evaluation`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(evaluation.status, 200);
    assert.ok(evaluation.body.recentRuns.length >= 1);
    assert.ok(evaluation.body.metrics);
  } finally {
    if (experimentId) {
      await prisma.workflowExperimentRun.deleteMany({ where: { experimentId } });
      await prisma.workflowExperiment.deleteMany({ where: { id: experimentId } });
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
    process.stdout.write('workflow-experiment e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `workflow-experiment e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
