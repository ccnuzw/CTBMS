import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { AgentConversationModule } from '../src/modules/agent-conversation';
import { AgentSkillModule } from '../src/modules/agent-skill';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AgentSkillModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    AgentConversationModule,
  ],
})
class AgentConversationE2eModule implements NestModule {
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
        riskProfileCode: 'AGENT_CONVERSATION_E2E',
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
      timeoutSeconds: 30,
      retryCount: 0,
      retryIntervalSeconds: 0,
      onError: 'FAIL_FAST',
    },
  },
});

const fetchJson = async <T>(
  input: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(AgentConversationE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_conversation_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Conversation ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;

  let definitionId = '';
  let conversationSessionId = '';
  let executionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Conversation ${token}`,
      },
    });

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
        changelog: 'agent conversation e2e create',
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

    const createSession = await fetchJson<{ id: string; state: string }>(
      `${baseUrl}/agent-conversations/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          title: 'E2E Conversation Session',
        }),
      },
    );
    assert.equal(createSession.status, 201);
    conversationSessionId = createSession.body.id;
    assert.equal(createSession.body.state, 'INTENT_CAPTURE');

    const sendTurn = await fetchJson<{
      state: string;
      confirmRequired: boolean;
      autoExecuted?: boolean;
      executionId?: string;
      proposedPlan: { planId: string } | null;
      missingSlots: string[];
      replyOptions?: Array<{ id: string; label: string; mode: string }>;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        message: '请分析最近一周东北玉米价格并结合日报周报，输出 markdown 和 json 的结论建议。',
      }),
    });
    assert.equal(sendTurn.status, 201);
    assert.ok(['PLAN_PREVIEW', 'EXECUTING'].includes(sendTurn.body.state));
    assert.ok(sendTurn.body.proposedPlan?.planId);
    assert.equal(sendTurn.body.missingSlots.length, 0);
    assert.ok(Array.isArray(sendTurn.body.replyOptions));
    assert.ok((sendTurn.body.replyOptions ?? []).length >= 1);

    if (sendTurn.body.autoExecuted) {
      assert.equal(sendTurn.body.confirmRequired, false);
      executionId = String(sendTurn.body.executionId ?? '');
      assert.ok(executionId);
    }

    const sessionDetail = await fetchJson<{
      plans: Array<{ id: string; version: number; planSnapshot: { planId: string } }>;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(sessionDetail.status, 200);
    assert.ok(sessionDetail.body.plans.length > 0);
    const latestPlan = sessionDetail.body.plans[0];

    if (!executionId) {
      const confirmPlan = await fetchJson<{
        accepted: boolean;
        executionId: string;
        status: string;
      }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/plan/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          planId: latestPlan.planSnapshot.planId,
          planVersion: latestPlan.version,
        }),
      });
      assert.equal(confirmPlan.status, 201);
      assert.equal(confirmPlan.body.accepted, true);
      assert.equal(confirmPlan.body.status, 'EXECUTING');
      executionId = confirmPlan.body.executionId;
    }

    let latestResultStatus = '';
    let finalResultBody: {
      status: string;
      result: {
        facts: Array<{ text: string }>;
        qualityScore?: number;
        freshnessStatus?: string;
        qualityBreakdown?: {
          completeness: number;
          timeliness: number;
          evidenceStrength: number;
          verification: number;
        };
        confidenceGate?: {
          allowStrongConclusion: boolean;
          reasonCodes: string[];
          message: string;
        } | null;
        evidenceItems?: Array<{
          id: string;
          title: string;
          source: string;
          freshness: string;
          quality: string;
          tracePath?: string | null;
        }>;
        traceability?: {
          executionId: string;
          replayPath: string;
          executionPath: string;
          evidenceCount: number;
        } | null;
        analysis: string;
        actions: Record<string, unknown>;
        confidence: number;
      } | null;
      executionId?: string;
    } | null = null;

    for (let i = 0; i < 5; i += 1) {
      const result = await fetchJson<{
        status: string;
        result: {
          facts: Array<{ text: string }>;
          qualityScore?: number;
          freshnessStatus?: string;
          qualityBreakdown?: {
            completeness: number;
            timeliness: number;
            evidenceStrength: number;
            verification: number;
          };
          confidenceGate?: {
            allowStrongConclusion: boolean;
            reasonCodes: string[];
            message: string;
          } | null;
          evidenceItems?: Array<{
            id: string;
            title: string;
            source: string;
            freshness: string;
            quality: string;
            tracePath?: string | null;
          }>;
          traceability?: {
            executionId: string;
            replayPath: string;
            executionPath: string;
            evidenceCount: number;
          } | null;
          analysis: string;
          actions: Record<string, unknown>;
          confidence: number;
        } | null;
        executionId?: string;
      }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/result`, {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      });
      assert.equal(result.status, 200);
      latestResultStatus = result.body.status;
      finalResultBody = result.body;
      if (latestResultStatus !== 'EXECUTING') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    assert.ok(finalResultBody);
    assert.ok(['DONE', 'RESULT_DELIVERY', 'EXECUTING'].includes(latestResultStatus));
    assert.equal(finalResultBody?.executionId, executionId);
    if (finalResultBody?.result) {
      assert.ok(Array.isArray(finalResultBody.result.facts));
      assert.equal(typeof finalResultBody.result.analysis, 'string');
      assert.equal(typeof finalResultBody.result.confidence, 'number');
    }

    if (latestResultStatus === 'DONE' && finalResultBody?.result) {
      assert.equal(typeof finalResultBody.result.qualityScore, 'number');
      assert.ok((finalResultBody.result.qualityScore ?? 0) >= 0);
      assert.ok((finalResultBody.result.qualityScore ?? 0) <= 1);
      assert.ok(
        ['WITHIN_TTL', 'NEAR_EXPIRE', 'EXPIRED', 'UNKNOWN'].includes(
          String(finalResultBody.result.freshnessStatus ?? 'UNKNOWN'),
        ),
      );
      assert.equal(typeof finalResultBody.result.confidenceGate?.allowStrongConclusion, 'boolean');
      assert.equal(typeof finalResultBody.result.confidenceGate?.message, 'string');
      assert.ok(Array.isArray(finalResultBody.result.evidenceItems));
      assert.ok((finalResultBody.result.evidenceItems ?? []).length >= 1);
      assert.equal(finalResultBody.result.traceability?.executionId, executionId);
      assert.ok(finalResultBody.result.traceability?.replayPath?.includes(executionId));
      assert.ok(finalResultBody.result.traceability?.executionPath?.includes(executionId));
      assert.ok((finalResultBody.result.traceability?.evidenceCount ?? 0) >= 1);
    }

    const evidenceList = await fetchJson<{
      executionId: string | null;
      total: number;
      filteredCount: number;
      items: Array<{
        id: string;
        source: string;
        freshness: string;
        quality: string;
        tracePath?: string | null;
      }>;
      traceability: {
        executionId: string;
        evidenceCount: number;
      } | null;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/evidence?limit=20`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(evidenceList.status, 200);
    assert.equal(evidenceList.body.executionId, executionId);
    assert.ok(Array.isArray(evidenceList.body.items));
    assert.ok(evidenceList.body.filteredCount <= evidenceList.body.total);

    if (latestResultStatus === 'DONE') {
      assert.ok(evidenceList.body.items.length >= 1);
      assert.equal(evidenceList.body.traceability?.executionId, executionId);
      assert.ok((evidenceList.body.traceability?.evidenceCount ?? 0) >= 1);
    }

    const filteredFreshEvidence = await fetchJson<{
      items: Array<{ freshness: string }>;
    }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/evidence?freshness=FRESH&limit=5`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(filteredFreshEvidence.status, 200);
    assert.ok(filteredFreshEvidence.body.items.every((item) => item.freshness === 'FRESH'));

    const routingLogs = await fetchJson<
      Array<{
        id: string;
        routeType: string;
        selectedSource?: string | null;
        selectedWorkflowDefinitionId?: string | null;
        routePolicyDetails?: Record<string, unknown>;
      }>
    >(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-routing-logs?routeType=WORKFLOW_REUSE`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(routingLogs.status, 200);
    assert.ok(routingLogs.body.length > 0);
    assert.ok(routingLogs.body.every((item) => item.routeType === 'WORKFLOW_REUSE'));
    assert.ok(
      routingLogs.body.some(
        (item) => item.selectedWorkflowDefinitionId && item.selectedWorkflowDefinitionId.length > 0,
      ),
    );
    assert.ok(routingLogs.body.some((item) => Boolean(item.routePolicyDetails)));

    const routingSummary = await fetchJson<{
      sampleWindow: { window: string; totalLogs: number; analyzedLimit: number };
      effectivePolicies: {
        capabilityRoutingPolicy: Record<string, unknown>;
        ephemeralCapabilityPolicy: Record<string, unknown>;
      };
      stats: { routeType: Array<{ key: string; count: number }> };
    }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/capability-routing-summary`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(routingSummary.status, 200);
    assert.ok(['1h', '24h', '7d'].includes(routingSummary.body.sampleWindow.window));
    assert.ok(routingSummary.body.sampleWindow.totalLogs >= 1);
    assert.ok(Array.isArray(routingSummary.body.stats.routeType));
    assert.ok(Boolean(routingSummary.body.effectivePolicies.capabilityRoutingPolicy));
    assert.ok(Boolean(routingSummary.body.effectivePolicies.ephemeralCapabilityPolicy));

    const observabilitySummary = await fetchJson<{
      windowDays: number;
      sessionsInWindow: number;
      sampledSessions: number;
      totals: {
        sessionsWithUserTurn: number;
        sessionsWithExecution: number;
        executions: number;
        completedExecutions: number;
      };
      successRate: number;
      firstResponseLatency: { sampleSize: number; p95Ms: number | null };
      acceptanceLatency: { sampleSize: number; p95Ms: number | null };
      completionLatency: { sampleSize: number; p95Ms: number | null };
      citationCoverage: {
        totalFacts: number;
        citedFacts: number;
        coverageRate: number;
      };
      nfrGate?: {
        passed: boolean;
        checks: Array<{ id: string; passed: boolean }>;
      };
    }>(
      `${baseUrl}/agent-conversations/sessions/observability/summary?windowDays=7&maxSessions=200`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(observabilitySummary.status, 200);
    assert.equal(observabilitySummary.body.windowDays, 7);
    assert.ok(observabilitySummary.body.sessionsInWindow >= 1);
    assert.ok(observabilitySummary.body.sampledSessions >= 1);
    assert.ok(observabilitySummary.body.totals.sessionsWithUserTurn >= 1);
    assert.ok(observabilitySummary.body.totals.sessionsWithExecution >= 1);
    assert.ok(observabilitySummary.body.totals.executions >= 1);
    assert.ok(observabilitySummary.body.successRate >= 0);
    assert.ok(observabilitySummary.body.successRate <= 1);
    assert.ok(observabilitySummary.body.firstResponseLatency.sampleSize >= 1);
    assert.ok(observabilitySummary.body.acceptanceLatency.sampleSize >= 1);
    assert.ok(observabilitySummary.body.citationCoverage.totalFacts >= 0);
    assert.ok(observabilitySummary.body.citationCoverage.citedFacts >= 0);
    assert.ok(observabilitySummary.body.citationCoverage.coverageRate >= 0);
    assert.ok(observabilitySummary.body.citationCoverage.coverageRate <= 1);
    assert.equal(typeof observabilitySummary.body.nfrGate?.passed, 'boolean');
    assert.ok(Array.isArray(observabilitySummary.body.nfrGate?.checks));
    const nfrCheckIds = new Set(
      (observabilitySummary.body.nfrGate?.checks ?? []).map((item) => item.id),
    );
    assert.ok(nfrCheckIds.has('NFR-001'));
    assert.ok(nfrCheckIds.has('NFR-005'));
  } finally {
    if (conversationSessionId) {
      await prisma.conversationSession.deleteMany({ where: { id: conversationSessionId } });
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
    await prisma.decisionRulePack.deleteMany({ where: { rulePackCode } });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
