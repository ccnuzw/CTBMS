import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, WorkflowDefinitionModule, WorkflowExecutionModule],
})
class WorkflowDagE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildDagDslSnapshot = (
  workflowId: string,
  workflowName: string,
  ownerUserId: string,
  rulePackCode: string,
) => ({
  workflowId,
  name: workflowName,
  mode: 'DAG',
  usageMethod: 'HEADLESS',
  version: '1.0.0',
  status: 'DRAFT',
  ownerUserId,
  nodes: [
    { id: 'n_trigger', type: 'manual-trigger', name: 'manual trigger', enabled: true, config: {} },
    {
      id: 'n_split',
      type: 'parallel-split',
      name: 'parallel split',
      enabled: true,
      config: { branchIds: ['branch_market', 'branch_rule'], splitStrategy: 'clone' },
    },
    { id: 'n_fetch', type: 'mock-fetch', name: 'mock fetch', enabled: true, config: {} },
    {
      id: 'n_rule_eval',
      type: 'rule-eval',
      name: 'rule eval',
      enabled: true,
      config: { rulePackCode },
    },
    {
      id: 'n_join',
      type: 'join',
      name: 'join',
      enabled: true,
      config: { joinPolicy: 'ALL_REQUIRED' },
    },
    { id: 'n_model', type: 'single-agent', name: 'model node', enabled: true, config: {} },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: { riskProfileCode: 'DAG_E2E_PROFILE', blockWhenRiskGte: 'EXTREME' },
    },
    {
      id: 'n_notify',
      type: 'notify',
      name: 'notify',
      enabled: true,
      config: { channels: ['DASHBOARD'] },
    },
  ],
  edges: [
    { id: 'e1', from: 'n_trigger', to: 'n_split', edgeType: 'control-edge' },
    { id: 'e2', from: 'n_split', to: 'n_fetch', edgeType: 'control-edge' },
    { id: 'e3', from: 'n_split', to: 'n_rule_eval', edgeType: 'control-edge' },
    { id: 'e4', from: 'n_fetch', to: 'n_join', edgeType: 'control-edge' },
    { id: 'e5', from: 'n_rule_eval', to: 'n_join', edgeType: 'control-edge' },
    { id: 'e6', from: 'n_join', to: 'n_model', edgeType: 'control-edge' },
    { id: 'e7', from: 'n_model', to: 'n_risk_gate', edgeType: 'control-edge' },
    { id: 'e8', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
  ],
  runPolicy: {
    nodeDefaults: {
      timeoutMs: 30000,
      retryCount: 1,
      retryBackoffMs: 200,
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
  const app = await NestFactory.create(WorkflowDagE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_dag_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow dag ${token}`;
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
        mode: 'DAG',
        usageMethod: 'HEADLESS',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDagDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
        changelog: 'create dag definition',
      }),
    });
    assert.equal(createDefinition.status, 201, JSON.stringify(createDefinition.body));
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
    assert.equal(publishVersion.status, 201, JSON.stringify(publishVersion.body));
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
          paramSnapshot: {
            risk: { level: 'LOW' },
          },
        }),
      },
    );
    assert.equal(triggerExecution.status, 201, JSON.stringify(triggerExecution.body));
    assert.equal(triggerExecution.body.status, 'SUCCESS');

    const executionId = triggerExecution.body.id;
    const executionDetail = await fetchJson<{
      status: string;
      nodeExecutions: Array<{ nodeType: string; status: string }>;
    }>(`${baseUrl}/workflow-executions/${executionId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(executionDetail.status, 200);
    assert.equal(executionDetail.body.status, 'SUCCESS');
    const nodeTypes = new Set(executionDetail.body.nodeExecutions.map((item) => item.nodeType));
    assert.ok(nodeTypes.has('parallel-split'));
    assert.ok(nodeTypes.has('join'));

    const timeline = await fetchJson<{ data: Array<{ eventType: string }> }>(
      `${baseUrl}/workflow-executions/${executionId}/timeline`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(timeline.status, 200);
    const timelineTypes = new Set(timeline.body.data.map((item) => item.eventType));
    assert.ok(timelineTypes.has('DAG_LAYERS_RESOLVED'));
    assert.ok(timelineTypes.has('EXECUTION_SUCCEEDED'));

    process.stdout.write('[workflow-dag.e2e] passed\n');
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
    process.stderr.write(`[workflow-dag.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`);
  } else {
    process.stderr.write(`[workflow-dag.e2e] failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
