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
class WorkflowRuntimeSemanticsE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

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
  const app = await NestFactory.create(WorkflowRuntimeSemanticsE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_runtime_semantics_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow runtime semantics ${token}`;

  try {
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
        usageMethod: 'ON_DEMAND',
        templateSource: 'PRIVATE',
        dslSnapshot: {
          workflowId,
          name: workflowName,
          mode: 'LINEAR',
          usageMethod: 'ON_DEMAND',
          version: '1.0.0',
          status: 'DRAFT',
          ownerUserId,
          nodes: [
            { id: 'n_trigger', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
            {
              id: 'n_calc',
              type: 'formula-calc',
              name: 'calc',
              enabled: true,
              config: { expression: '2' },
            },
            {
              id: 'n_bind',
              type: 'formula-calc',
              name: 'bind',
              enabled: true,
              config: { expression: 'value + 1' },
              inputBindings: {
                value: '{{n_calc.result}}',
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
            { id: 'e1', from: 'n_trigger', to: 'n_calc', edgeType: 'control-edge' },
            { id: 'e2', from: 'n_calc', to: 'n_bind', edgeType: 'data-edge' },
            {
              id: 'e3',
              from: 'n_bind',
              to: 'n_notify',
              edgeType: 'condition-edge',
              condition: {
                field: 'result',
                operator: 'gt',
                value: 99,
              },
            },
          ],
          runPolicy: {
            nodeDefaults: {
              timeoutMs: 30000,
              retryCount: 1,
              retryBackoffMs: 200,
              onError: 'FAIL_FAST',
            },
          },
        },
      }),
    });
    assert.equal(createDefinition.status, 201, JSON.stringify(createDefinition.body));

    const definitionId = createDefinition.body.definition.id;
    const versionId = createDefinition.body.version.id;

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
    assert.equal(triggerExecution.status, 201, JSON.stringify(triggerExecution.body));
    assert.equal(triggerExecution.body.status, 'SUCCESS');

    const executionId = triggerExecution.body.id;
    const bindExecution = await prisma.nodeExecution.findFirst({
      where: {
        workflowExecutionId: executionId,
        nodeId: 'n_bind',
      },
    });
    assert.ok(bindExecution);
    const bindInput = (bindExecution?.inputSnapshot ?? {}) as Record<string, unknown>;
    assert.equal(bindInput.value, 2, JSON.stringify(bindInput));

    const notifyExecution = await prisma.nodeExecution.findFirst({
      where: {
        workflowExecutionId: executionId,
        nodeId: 'n_notify',
      },
    });
    assert.ok(notifyExecution);
    assert.equal(notifyExecution?.status, 'SKIPPED', JSON.stringify(notifyExecution));
    assert.equal((notifyExecution?.errorMessage ?? '').includes('无满足条件的入边'), true);

    process.stdout.write('[workflow-runtime-semantics.e2e] passed\n');
  } finally {
    await prisma.workflowDefinition.deleteMany({
      where: {
        workflowId: {
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
      `[workflow-runtime-semantics.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`,
    );
  } else {
    process.stderr.write(`[workflow-runtime-semantics.e2e] failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
