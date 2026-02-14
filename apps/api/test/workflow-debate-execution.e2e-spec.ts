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
class WorkflowDebateExecutionE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildDebateDslSnapshot = (
  workflowId: string,
  workflowName: string,
  ownerUserId: string,
  rulePackCode: string,
  participants: Array<{ agentCode: string; role: string; perspective: string; weight: number }>,
) => ({
  workflowId,
  name: workflowName,
  mode: 'DEBATE',
  usageMethod: 'COPILOT',
  version: '1.0.0',
  status: 'DRAFT',
  ownerUserId,
  nodes: [
    { id: 'n_trigger', type: 'manual-trigger', name: 'manual trigger', enabled: true, config: {} },
    { id: 'n_fetch', type: 'mock-fetch', name: 'mock fetch', enabled: true, config: {} },
    {
      id: 'n_rule_eval',
      type: 'rule-eval',
      name: 'rule eval',
      enabled: true,
      config: { rulePackCode },
    },
    {
      id: 'n_context',
      type: 'context-builder',
      name: 'context builder',
      enabled: true,
      config: {
        contextSchema: [{ key: 'topic', sourceField: 'topic', label: 'Topic', required: false }],
      },
    },
    {
      id: 'n_debate',
      type: 'debate-round',
      name: 'debate round',
      enabled: true,
      config: {
        topic: '政策冲击对玉米价格的影响',
        participants: participants.map((p) => p.agentCode),
        maxRounds: 2,
        judgePolicy: 'WEIGHTED',
        consensusThreshold: 0.95,
      },
    },
    {
      id: 'n_judge',
      type: 'judge-agent',
      name: 'judge agent',
      enabled: true,
      config: {
        scoringDimensions: ['逻辑性', '数据支撑', '风险识别'],
        outputAction: true,
        verdictFormat: 'structured',
      },
    },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: { riskProfileCode: 'DEBATE_E2E_PROFILE', blockWhenRiskGte: 'EXTREME' },
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
    { id: 'e1', from: 'n_trigger', to: 'n_fetch', edgeType: 'control-edge' },
    { id: 'e2', from: 'n_fetch', to: 'n_rule_eval', edgeType: 'control-edge' },
    { id: 'e3', from: 'n_rule_eval', to: 'n_context', edgeType: 'control-edge' },
    { id: 'e4', from: 'n_context', to: 'n_debate', edgeType: 'control-edge' },
    { id: 'e5', from: 'n_debate', to: 'n_judge', edgeType: 'control-edge' },
    { id: 'e6', from: 'n_judge', to: 'n_risk_gate', edgeType: 'control-edge' },
    { id: 'e7', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
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
  const app = await NestFactory.create(WorkflowDebateExecutionE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_debate_exec_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow debate ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  const participants = [
    {
      agentCode: `${token}_BULL`,
      role: '多头分析师',
      perspective: '强调供需和政策利多',
      weight: 1,
    },
    {
      agentCode: `${token}_BEAR`,
      role: '空头分析师',
      perspective: '强调库存与风险敞口',
      weight: 1,
    },
  ];

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

    for (const participant of participants) {
      await prisma.agentProfile.create({
        data: {
          agentCode: participant.agentCode,
          agentName: participant.role,
          roleType: 'ANALYST',
          objective: participant.perspective,
          modelConfigKey: `${token}_MISSING_MODEL`,
          agentPromptCode: `${token}_PROMPT`,
          outputSchemaCode: 'DEFAULT_JSON',
          ownerUserId,
          version: 1,
          isActive: true,
        },
      });
    }

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
        mode: 'DEBATE',
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDebateDslSnapshot(
          workflowId,
          workflowName,
          ownerUserId,
          rulePackCode,
          participants,
        ),
        changelog: 'create debate definition',
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
            topic: '政策冲击对玉米价格的影响',
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
    assert.ok(nodeTypes.has('debate-round'));
    assert.ok(nodeTypes.has('judge-agent'));

    const traces = await fetchJson<{
      data: Array<{ participantCode: string; roundNumber: number }>;
      total: number;
    }>(`${baseUrl}/workflow-executions/${executionId}/debate-traces`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(traces.status, 200);

    const timeline = await fetchJson<{
      rounds: Array<{ roundNumber: number }>;
      totalRounds: number;
    }>(`${baseUrl}/workflow-executions/${executionId}/debate-timeline`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(timeline.status, 200);

    // 4. 验证决策记录生成
    const decisionRecords = await prisma.decisionRecord.findMany({
      where: { workflowExecutionId: executionId },
    });
    // 我们期望至少有一个决策记录（来自 Judge Agent，无论是 AI 还是规则降级）
    assert.ok(decisionRecords.length > 0, 'Should create at least one decision record');
    const record = decisionRecords[0];
    assert.ok(record.action, 'Decision record should have an action');
    assert.equal(record.riskLevel, 'MEDIUM'); // 规则裁决默认 MEDIUM
    console.log('Decision Record Verified:', record.id, record.action);

    // 验证 DebateTrace (Check DB directly)
    const dbTraces = await prisma.debateRoundTrace.findMany({
      where: { workflowExecutionId: executionId },
    });
    assert.ok(dbTraces.length > 0, 'Should create debate traces in DB');

    process.stdout.write('[workflow-debate-execution.e2e] passed\n');
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
    await prisma.agentProfile.deleteMany({
      where: {
        agentCode: {
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
      `[workflow-debate-execution.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`,
    );
  } else {
    process.stderr.write(`[workflow-debate-execution.e2e] failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
