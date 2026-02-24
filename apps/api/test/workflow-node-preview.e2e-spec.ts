import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { WorkflowDsl } from '@packages/types';
import { ZodValidationPipe } from 'nestjs-zod';
import { WorkflowDefinitionController } from '../src/modules/workflow-definition/workflow-definition.controller';
import { WorkflowDefinitionService } from '../src/modules/workflow-definition/workflow-definition.service';
import { WorkflowDslValidator } from '../src/modules/workflow-definition/workflow-dsl-validator';
import { WorkflowNodePreviewService } from '../src/modules/workflow-definition/workflow-node-preview.service';
import { VariableResolver } from '../src/modules/workflow-execution/engine/variable-resolver';
import { PrismaService } from '../src/prisma';

@Module({
  controllers: [WorkflowDefinitionController],
  providers: [
    WorkflowDefinitionService,
    WorkflowDslValidator,
    WorkflowNodePreviewService,
    VariableResolver,
    {
      provide: PrismaService,
      useValue: {},
    },
  ],
})
class WorkflowNodePreviewE2eModule {}

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

const buildPreviewDsl = (): WorkflowDsl => ({
  workflowId: `wf_node_preview_${Date.now()}`,
  name: 'workflow node preview',
  mode: 'LINEAR',
  usageMethod: 'COPILOT',
  version: '1.0.0',
  status: 'DRAFT',
  ownerUserId: 'preview-owner',
  nodes: [
    {
      id: 'n_source',
      type: 'manual-trigger',
      name: 'source',
      enabled: true,
      config: {},
      outputSchema: {
        fields: {
          id: 'string',
          value: 'number',
          a: 'number',
          b: 'number',
        },
      },
    },
    {
      id: 'n_target',
      type: 'notify',
      name: 'target',
      enabled: true,
      config: { channels: ['DASHBOARD'] },
    },
  ],
  edges: [{ id: 'e1', from: 'n_source', to: 'n_target', edgeType: 'data-edge' }],
  runPolicy: {
    nodeDefaults: {
      timeoutSeconds: 30,
      retryCount: 1,
      retryIntervalSeconds: 2,
      onError: 'FAIL_FAST',
    },
  },
});

async function main() {
  const app = await NestFactory.create(WorkflowNodePreviewE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  try {
    const preview = await fetchJson<{
      nodeId: string;
      rows: Array<{
        field: string;
        status: string;
        value?: unknown;
        note?: string;
      }>;
      resolvedPayload: Record<string, unknown>;
    }>(`${baseUrl}/workflow-definitions/preview-node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dslSnapshot: buildPreviewDsl(),
        nodeId: 'n_target',
        sampleInput: {
          upstream: {
            n_source: {
              id: 'SO-1001',
              value: 11,
              a: 2,
              b: 3,
            },
          },
          params: {
            discount: 0.2,
          },
          meta: {
            executionId: 'exec_preview_001',
            triggerUserId: 'u_preview',
            timestamp: '2026-02-17T10:00:00.000Z',
          },
        },
        inputsSchema: [
          { name: 'score', type: 'number', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'calc', type: 'number', required: true },
          { name: 'fallbackScore', type: 'number' },
          { name: 'unresolvedField', type: 'string' },
          { name: 'paramEcho', type: 'number' },
          { name: 'metaEcho', type: 'string' },
          { name: 'unsupportedExpr', type: 'number' },
        ],
        inputBindings: {
          score: '{{n_source.value | default: 7}}',
          title: '订单{{n_source.id}}',
          calc: '{{n_source.a}} + {{n_source.b}}',
          fallbackScore: '{{n_source.unknown_score}}',
          unresolvedField: '{{n_source.unknown_text}}',
          paramEcho: '{{params.discount}}',
          metaEcho: '{{meta.executionId}}',
          unsupportedExpr: 'n_source.value + 1',
        },
        defaultValues: {
          fallbackScore: 99,
        },
        nullPolicies: {
          fallbackScore: 'USE_DEFAULT',
          unresolvedField: 'FAIL',
        },
        stage: 'SAVE',
      }),
    });

    assert.equal(preview.status, 201, JSON.stringify(preview.body));
    assert.equal(preview.body.nodeId, 'n_target');

    const rowMap = new Map(preview.body.rows.map((row) => [row.field, row]));
    assert.equal(rowMap.get('score')?.status, 'resolved');
    assert.equal(rowMap.get('score')?.value, 11);
    assert.equal(rowMap.get('title')?.status, 'resolved');
    assert.equal(rowMap.get('title')?.value, '订单SO-1001');
    assert.equal(rowMap.get('calc')?.status, 'resolved');
    assert.equal(rowMap.get('calc')?.value, 5);
    assert.equal(rowMap.get('fallbackScore')?.status, 'default');
    assert.equal(rowMap.get('fallbackScore')?.value, 99);
    assert.equal(rowMap.get('unresolvedField')?.status, 'missing');
    assert.equal(rowMap.get('paramEcho')?.value, 0.2);
    assert.equal(rowMap.get('metaEcho')?.value, 'exec_preview_001');
    assert.equal(rowMap.get('unsupportedExpr')?.status, 'expression');
    assert.match(rowMap.get('unsupportedExpr')?.note ?? '', /仅支持 .* 模板表达式预览/);

    assert.equal(preview.body.resolvedPayload.score, 11);
    assert.equal(preview.body.resolvedPayload.title, '订单SO-1001');
    assert.equal(preview.body.resolvedPayload.calc, 5);
    assert.equal(preview.body.resolvedPayload.fallbackScore, 99);
    assert.equal(preview.body.resolvedPayload.paramEcho, 0.2);
    assert.equal(preview.body.resolvedPayload.metaEcho, 'exec_preview_001');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
