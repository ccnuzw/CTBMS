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
class WorkflowSubflowE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const runPolicy = {
  nodeDefaults: {
    timeoutMs: 30000,
    retryCount: 1,
    retryBackoffMs: 200,
    onError: 'FAIL_FAST',
  },
};

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

const requestHeaders = (ownerUserId: string) => ({
  'Content-Type': 'application/json',
  'x-virtual-user-id': ownerUserId,
});

async function main() {
  const app = await NestFactory.create(WorkflowSubflowE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_subflow_${Date.now()}`;
  const selfRulePackCode = `${token}_SELF_RULE_PACK`.toUpperCase();

  try {
    await prisma.decisionRulePack.create({
      data: {
        rulePackCode: selfRulePackCode,
        name: `self rule pack ${token}`,
        ownerUserId,
        version: 2,
      },
    });

    const childWorkflowId = `${token}_child`;
    const childCreate = await fetchJson<{
      definition: { id: string };
      version: { id: string };
    }>(`${baseUrl}/workflow-definitions`, {
      method: 'POST',
      headers: requestHeaders(ownerUserId),
      body: JSON.stringify({
        workflowId: childWorkflowId,
        name: `child workflow ${token}`,
        mode: 'LINEAR',
        usageMethod: 'ON_DEMAND',
        templateSource: 'PRIVATE',
        dslSnapshot: {
          workflowId: childWorkflowId,
          name: `child workflow ${token}`,
          mode: 'LINEAR',
          usageMethod: 'ON_DEMAND',
          version: '1.0.0',
          status: 'DRAFT',
          ownerUserId,
          nodes: [
            { id: 'n_trigger', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
            {
              id: 'n_notify',
              type: 'notify',
              name: 'notify',
              enabled: true,
              config: { channels: ['DASHBOARD'] },
            },
          ],
          edges: [{ id: 'e1', from: 'n_trigger', to: 'n_notify', edgeType: 'control-edge' }],
          runPolicy,
        },
      }),
    });
    assert.equal(childCreate.status, 201, JSON.stringify(childCreate.body));
    const childDefinitionId = childCreate.body.definition.id;
    const childVersionId = childCreate.body.version.id;

    const parentWorkflowId = `${token}_parent`;
    const parentCreate = await fetchJson<{
      definition: { id: string };
      version: { id: string };
    }>(`${baseUrl}/workflow-definitions`, {
      method: 'POST',
      headers: requestHeaders(ownerUserId),
      body: JSON.stringify({
        workflowId: parentWorkflowId,
        name: `parent workflow ${token}`,
        mode: 'LINEAR',
        usageMethod: 'ON_DEMAND',
        templateSource: 'PRIVATE',
        dslSnapshot: {
          workflowId: parentWorkflowId,
          name: `parent workflow ${token}`,
          mode: 'LINEAR',
          usageMethod: 'ON_DEMAND',
          version: '1.0.0',
          status: 'DRAFT',
          ownerUserId,
          nodes: [
            { id: 'n_trigger', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
            {
              id: 'n_subflow',
              type: 'subflow-call',
              name: 'subflow call',
              enabled: true,
              config: {
                workflowDefinitionId: childDefinitionId,
                workflowVersionId: childVersionId,
                outputKeyPrefix: 'child',
              },
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
            { id: 'e1', from: 'n_trigger', to: 'n_subflow', edgeType: 'control-edge' },
            { id: 'e2', from: 'n_subflow', to: 'n_notify', edgeType: 'control-edge' },
          ],
          runPolicy,
        },
      }),
    });
    assert.equal(parentCreate.status, 201, JSON.stringify(parentCreate.body));
    const parentDefinitionId = parentCreate.body.definition.id;
    const parentVersionId = parentCreate.body.version.id;

    const triggerParent = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-executions/trigger`,
      {
        method: 'POST',
        headers: requestHeaders(ownerUserId),
        body: JSON.stringify({
          workflowDefinitionId: parentDefinitionId,
          workflowVersionId: parentVersionId,
          triggerType: 'MANUAL',
        }),
      },
    );
    assert.equal(triggerParent.status, 201, JSON.stringify(triggerParent.body));
    assert.equal(triggerParent.body.status, 'SUCCESS');

    const parentExecution = await prisma.workflowExecution.findUnique({
      where: { id: triggerParent.body.id },
    });
    assert.ok(parentExecution);
    assert.equal(parentExecution?.status, 'SUCCESS');

    const subflowNodeExecution = await prisma.nodeExecution.findFirst({
      where: {
        workflowExecutionId: triggerParent.body.id,
        nodeId: 'n_subflow',
      },
    });
    assert.ok(subflowNodeExecution);
    const subflowOutput = (subflowNodeExecution?.outputSnapshot ?? {}) as Record<string, unknown>;
    const subflowExecutionId =
      typeof subflowOutput.subflowExecutionId === 'string' ? subflowOutput.subflowExecutionId : '';
    assert.ok(subflowExecutionId, JSON.stringify(subflowOutput));

    const childExecution = await prisma.workflowExecution.findUnique({
      where: { id: subflowExecutionId },
    });
    assert.ok(childExecution);
    assert.equal(childExecution?.status, 'SUCCESS');
    assert.equal(childExecution?.workflowVersionId, childVersionId);
    assert.equal(childExecution?.sourceExecutionId, triggerParent.body.id);

    const selfWorkflowId = `${token}_self`;
    const selfCreate = await fetchJson<{
      definition: { id: string };
      version: { id: string };
    }>(`${baseUrl}/workflow-definitions`, {
      method: 'POST',
      headers: requestHeaders(ownerUserId),
      body: JSON.stringify({
        workflowId: selfWorkflowId,
        name: `self workflow ${token}`,
        mode: 'LINEAR',
        usageMethod: 'ON_DEMAND',
        templateSource: 'PRIVATE',
        dslSnapshot: {
          workflowId: selfWorkflowId,
          name: `self workflow ${token}`,
          mode: 'LINEAR',
          usageMethod: 'ON_DEMAND',
          version: '1.0.0',
          status: 'DRAFT',
          ownerUserId,
          nodes: [
            { id: 'n_trigger', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
            { id: 'n_notify', type: 'notify', name: 'notify', enabled: true, config: { channels: ['DASHBOARD'] } },
          ],
          edges: [{ id: 'e1', from: 'n_trigger', to: 'n_notify', edgeType: 'control-edge' }],
          runPolicy,
        },
      }),
    });
    assert.equal(selfCreate.status, 201, JSON.stringify(selfCreate.body));
    const selfDefinitionId = selfCreate.body.definition.id;

    const selfVersion = await fetchJson<{ id: string }>(
      `${baseUrl}/workflow-definitions/${selfDefinitionId}/versions`,
      {
        method: 'POST',
        headers: requestHeaders(ownerUserId),
        body: JSON.stringify({
          dslSnapshot: {
            workflowId: selfWorkflowId,
            name: `self workflow ${token}`,
            mode: 'LINEAR',
            usageMethod: 'ON_DEMAND',
            version: '1.0.0',
            status: 'DRAFT',
            ownerUserId,
            nodes: [
              { id: 'n_trigger', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
              { id: 'n_data', type: 'data-fetch', name: 'data', enabled: true, config: {} },
              {
                id: 'n_rule',
                type: 'rule-eval',
                name: 'rule',
                enabled: true,
                config: { rulePackCode: selfRulePackCode },
              },
              { id: 'n_agent', type: 'single-agent', name: 'agent', enabled: true, config: {} },
              {
                id: 'n_subflow',
                type: 'subflow-call',
                name: 'self subflow',
                enabled: true,
                config: {
                  workflowDefinitionId: selfDefinitionId,
                },
              },
              {
                id: 'n_risk',
                type: 'risk-gate',
                name: 'risk',
                enabled: true,
                config: { riskProfileCode: 'SELF_SUBFLOW_RISK' },
              },
              { id: 'n_notify', type: 'notify', name: 'notify', enabled: true, config: { channels: ['DASHBOARD'] } },
            ],
            edges: [
              { id: 'e1', from: 'n_trigger', to: 'n_data', edgeType: 'control-edge' },
              { id: 'e2', from: 'n_data', to: 'n_rule', edgeType: 'data-edge' },
              { id: 'e3', from: 'n_rule', to: 'n_agent', edgeType: 'data-edge' },
              { id: 'e4', from: 'n_agent', to: 'n_subflow', edgeType: 'control-edge' },
              { id: 'e5', from: 'n_subflow', to: 'n_risk', edgeType: 'control-edge' },
              { id: 'e6', from: 'n_risk', to: 'n_notify', edgeType: 'control-edge' },
            ],
            runPolicy,
          },
          changelog: 'self subflow test',
        }),
      },
    );
    assert.equal(selfVersion.status, 201, JSON.stringify(selfVersion.body));

    const publishSelf = await fetchJson<{ issues?: Array<{ code: string; message: string }> }>(
      `${baseUrl}/workflow-definitions/${selfDefinitionId}/publish`,
      {
        method: 'POST',
        headers: requestHeaders(ownerUserId),
        body: JSON.stringify({
          versionId: selfVersion.body.id,
        }),
      },
    );
    assert.equal(publishSelf.status, 400, JSON.stringify(publishSelf.body));
    const selfIssue = (publishSelf.body.issues ?? []).find((item) => item.code === 'WF107');
    assert.ok(selfIssue, JSON.stringify(publishSelf.body));
    assert.equal(selfIssue?.message.includes('不允许引用当前流程自身'), true);

    process.stdout.write('[workflow-subflow.e2e] passed\n');
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
          startsWith: token.toUpperCase(),
        },
      },
    });
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    process.stderr.write(`[workflow-subflow.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`);
  } else {
    process.stderr.write(`[workflow-subflow.e2e] failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
