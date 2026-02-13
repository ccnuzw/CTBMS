import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { ReportExportModule } from '../src/modules/report-export';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, WorkflowDefinitionModule, WorkflowExecutionModule, ReportExportModule],
})
class ReportExportE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildDsl = (workflowId: string, workflowName: string) => ({
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
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: {
        riskProfileCode: 'REPORT_EXPORT_E2E',
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
  ],
  edges: [
    { id: 'e1', from: 'n_trigger', to: 'n_risk_gate', edgeType: 'control-edge' },
    { id: 'e2', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
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
  const app = await NestFactory.create(ReportExportE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `report_export_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Report Export ${token}`;
  let definitionId = '';
  let executionId = '';
  let exportTaskId = '';

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
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDsl(workflowId, workflowName),
        changelog: 'report export e2e create',
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
          workflowVersionId: publishVersion.body.id,
          triggerType: 'MANUAL',
          idempotencyKey: `${token}_execution`,
        }),
      },
    );
    assert.equal(triggerExecution.status, 201);
    assert.equal(triggerExecution.body.status, 'SUCCESS');
    executionId = triggerExecution.body.id;

    const createExport = await fetchJson<{
      id: string;
      status: string;
      downloadUrl: string | null;
    }>(`${baseUrl}/report-exports`, {
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
    assert.equal(createExport.status, 201);
    assert.equal(createExport.body.status, 'COMPLETED');
    assert.ok(createExport.body.downloadUrl);
    exportTaskId = createExport.body.id;

    const exportDetail = await fetchJson<{ id: string; downloadUrl: string | null }>(
      `${baseUrl}/report-exports/${exportTaskId}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(exportDetail.status, 200);
    assert.equal(exportDetail.body.id, exportTaskId);
    assert.ok(exportDetail.body.downloadUrl);

    const downloadResponse = await fetch(`${baseUrl}/report-exports/${exportTaskId}/download`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    const downloadText = await downloadResponse.text();
    assert.equal(downloadResponse.status, 200);
    assert.ok(downloadText.includes(executionId));

    const removeTask = await fetchJson<{ deleted: boolean }>(`${baseUrl}/report-exports/${exportTaskId}`, {
      method: 'DELETE',
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(removeTask.status, 200);
    assert.equal(removeTask.body.deleted, true);
    exportTaskId = '';

    const deletedDetail = await fetchJson<{ message?: string }>(
      `${baseUrl}/report-exports/${createExport.body.id}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(deletedDetail.status, 404);
  } finally {
    if (exportTaskId) {
      await prisma.exportTask.deleteMany({ where: { id: exportTaskId } });
    }
    if (executionId) {
      await prisma.exportTask.deleteMany({ where: { workflowExecutionId: executionId } });
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
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('report-export e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(`report-export e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
