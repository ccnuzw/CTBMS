import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { AIProviderFactory } from '../src/modules/ai/providers/provider.factory';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { PrismaModule } from '../src/prisma';

@Module({
  providers: [AIProviderFactory],
  exports: [AIProviderFactory],
})
@Global()
class AIProviderMockModule {}

@Module({
  imports: [PrismaModule, AIProviderMockModule, WorkflowDefinitionModule, WorkflowExecutionModule],
})
class WorkflowDebateReplayE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const buildLinearDsl = (workflowId: string, workflowName: string) => ({
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
      id: 'n_data_fetch',
      type: 'data-fetch',
      name: 'data fetch',
      enabled: true,
      config: {
        sourceType: 'mock',
      },
    },
    {
      id: 'n_rule_eval',
      type: 'rule-pack-eval',
      name: 'rule pack eval',
      enabled: true,
      config: {
        rulePackCode: 'MOCK_RULE_PACK',
      },
    },
    {
      id: 'n_agent_call',
      type: 'agent-call',
      name: 'agent call',
      enabled: true,
      config: {
        agentCode: 'MOCK_AGENT',
      },
    },
    {
      id: 'n_risk_gate',
      type: 'risk-gate',
      name: 'risk gate',
      enabled: true,
      config: {
        riskProfileCode: 'DEBATE_REPLAY_PROFILE',
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
    { id: 'e1', from: 'n_trigger', to: 'n_data_fetch', edgeType: 'control-edge' },
    { id: 'e2', from: 'n_data_fetch', to: 'n_rule_eval', edgeType: 'control-edge' },
    { id: 'e3', from: 'n_rule_eval', to: 'n_agent_call', edgeType: 'control-edge' },
    { id: 'e4', from: 'n_agent_call', to: 'n_risk_gate', edgeType: 'control-edge' },
    { id: 'e5', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
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
  const app = await NestFactory.create(WorkflowDebateReplayE2eModule, {
    logger: ['error', 'warn'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const token = `wf_debate_replay_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow debate replay ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  let definitionId = '';
  let executionId = '';

  try {
    await prisma.decisionRulePack.create({
      data: {
        rulePackCode,
        name: `${rulePackCode}_name`,
        ownerUserId,
        templateSource: 'PRIVATE',
        version: 2,
      },
    });

    const created = await fetchJson<{
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
        dslSnapshot: {
          ...buildLinearDsl(workflowId, workflowName),
          nodes: buildLinearDsl(workflowId, workflowName).nodes.map((node) =>
            node.id === 'n_rule_eval'
              ? {
                  ...node,
                  config: {
                    ...(node.config as Record<string, unknown>),
                    rulePackCode,
                  },
                }
              : node,
          ),
        },
        changelog: 'debate replay create',
      }),
    });
    assert.equal(created.status, 201, `create definition failed: ${JSON.stringify(created.body)}`);
    definitionId = created.body.definition.id;

    const published = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/workflow-definitions/${definitionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ versionId: created.body.version.id }),
      },
    );
    assert.equal(
      published.status,
      201,
      `publish definition failed: ${JSON.stringify(published.body)}`,
    );

    const createdExecution = await prisma.workflowExecution.create({
      data: {
        workflowVersionId: published.body.id,
        triggerType: 'MANUAL',
        triggerUserId: ownerUserId,
        status: 'SUCCESS',
        startedAt: new Date(),
        completedAt: new Date(),
      },
      select: { id: true },
    });
    executionId = createdExecution.id;

    await prisma.debateRoundTrace.createMany({
      data: [
        {
          workflowExecutionId: executionId,
          roundNumber: 1,
          participantCode: 'LONG_AGENT',
          participantRole: '多头分析师',
          statementText: '供应端偏紧，基差可能走强。',
          confidence: 0.76,
          keyPoints: ['供应偏紧', '需求稳定'],
          isJudgement: false,
        },
        {
          workflowExecutionId: executionId,
          roundNumber: 1,
          participantCode: 'SHORT_AGENT',
          participantRole: '空头分析师',
          statementText: '政策风险可能导致需求回落。',
          confidence: 0.62,
          keyPoints: ['政策风险'],
          isJudgement: false,
        },
        {
          workflowExecutionId: executionId,
          roundNumber: 2,
          participantCode: 'JUDGE_AGENT',
          participantRole: '裁判',
          statementText: '综合判断维持审慎偏多。',
          confidence: 0.71,
          keyPoints: ['审慎偏多'],
          isJudgement: true,
          judgementVerdict: 'REVIEW_ONLY',
          judgementReasoning: '供需信号偏多但政策扰动较大。',
        },
      ],
    });

    const traces = await fetchJson<Array<{ roundNumber: number; participantCode: string }>>(
      `${baseUrl}/workflow-executions/${executionId}/debate-traces`,
      { headers: { 'x-virtual-user-id': ownerUserId } },
    );
    assert.equal(traces.status, 200);
    assert.equal(traces.body.length, 3);

    const filteredByRole = await fetchJson<Array<{ participantRole: string }>>(
      `${baseUrl}/workflow-executions/${executionId}/debate-traces?participantRole=${encodeURIComponent('裁判')}`,
      { headers: { 'x-virtual-user-id': ownerUserId } },
    );
    assert.equal(filteredByRole.status, 200);
    assert.equal(filteredByRole.body.length, 1);

    const filteredByKeyword = await fetchJson<Array<{ statementText: string }>>(
      `${baseUrl}/workflow-executions/${executionId}/debate-traces?keyword=${encodeURIComponent('政策')}`,
      { headers: { 'x-virtual-user-id': ownerUserId } },
    );
    assert.equal(filteredByKeyword.status, 200);
    assert.ok(filteredByKeyword.body.length >= 1);

    const judgementOnly = await fetchJson<Array<{ isJudgement: boolean }>>(
      `${baseUrl}/workflow-executions/${executionId}/debate-traces?isJudgement=true`,
      { headers: { 'x-virtual-user-id': ownerUserId } },
    );
    assert.equal(judgementOnly.status, 200);
    assert.equal(judgementOnly.body.length, 1);
    assert.equal(judgementOnly.body[0].isJudgement, true);

    const timeline = await fetchJson<{
      executionId: string;
      totalRounds: number;
      rounds: Array<{ roundNumber: number; entries: Array<{ participantCode: string }> }>;
    }>(`${baseUrl}/workflow-executions/${executionId}/debate-timeline`, {
      headers: { 'x-virtual-user-id': ownerUserId },
    });
    assert.equal(timeline.status, 200);
    assert.equal(timeline.body.executionId, executionId);
    assert.equal(timeline.body.totalRounds, 2);
    assert.equal(timeline.body.rounds.length, 2);
    assert.equal(timeline.body.rounds[0].entries.length, 2);

    const outsiderTimeline = await fetchJson<{ message?: string }>(
      `${baseUrl}/workflow-executions/${executionId}/debate-timeline`,
      {
        headers: { 'x-virtual-user-id': outsiderUserId },
      },
    );
    assert.equal(outsiderTimeline.status, 404);

    console.log('Workflow debate replay e2e checks passed.');
  } finally {
    if (executionId) {
      await prisma.debateRoundTrace
        .deleteMany({ where: { workflowExecutionId: executionId } })
        .catch(() => undefined);
      await prisma.workflowRuntimeEvent
        .deleteMany({ where: { workflowExecutionId: executionId } })
        .catch(() => undefined);
      await prisma.nodeExecution
        .deleteMany({ where: { workflowExecutionId: executionId } })
        .catch(() => undefined);
      await prisma.workflowExecution
        .deleteMany({ where: { id: executionId } })
        .catch(() => undefined);
    }

    if (definitionId) {
      await prisma.workflowPublishAudit
        .deleteMany({ where: { workflowDefinitionId: definitionId } })
        .catch(() => undefined);
      await prisma.workflowVersion
        .deleteMany({ where: { workflowDefinitionId: definitionId } })
        .catch(() => undefined);
      await prisma.workflowDefinition
        .deleteMany({ where: { id: definitionId } })
        .catch(() => undefined);
    }

    await prisma.decisionRulePack.deleteMany({ where: { rulePackCode } }).catch(() => undefined);

    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Workflow debate replay e2e checks failed:', error);
  process.exitCode = 1;
});
