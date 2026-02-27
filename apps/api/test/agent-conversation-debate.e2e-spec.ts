import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
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
class AgentConversationDebateE2eModule implements NestModule {
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
  judgeAgentCode: string,
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
        topic: '东北玉米未来三个月是否存在缺口并涨价',
        participants,
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
        judgeAgentCode,
        agentProfileCode: judgeAgentCode,
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
      config: { riskProfileCode: 'AGENT_CONVERSATION_DEBATE_E2E', blockWhenRiskGte: 'EXTREME' },
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
      timeoutSeconds: 30,
      retryCount: 1,
      retryIntervalSeconds: 1,
      onError: 'FAIL_FAST',
    },
  },
  agentBindings: [...participants.map((p) => p.agentCode), judgeAgentCode],
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
  const app = await NestFactory.create(AgentConversationDebateE2eModule, {
    logger: ['error', 'warn'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_conversation_debate_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `Agent Conversation Debate ${token}`;
  const rulePackCode = `${token}_RULE_PACK`;
  const participants = [
    {
      agentCode: `${token}_BULL`,
      role: '多头分析师',
      perspective: '强调供需偏紧和政策利多',
      weight: 1,
    },
    {
      agentCode: `${token}_BEAR`,
      role: '空头分析师',
      perspective: '强调库存和替代品风险',
      weight: 1,
    },
  ];
  const judgeAgentCode = `${participants[0].agentCode}_JUDGE`;

  let definitionId = '';
  let conversationSessionId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Conversation Debate ${token}`,
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
          version: 2,
          isActive: true,
        },
      });
    }

    await prisma.agentProfile.create({
      data: {
        agentCode: judgeAgentCode,
        agentName: '裁判 Agent',
        roleType: 'JUDGE',
        objective: '对辩论观点进行综合裁决',
        modelConfigKey: `${token}_MISSING_MODEL`,
        agentPromptCode: `${token}_PROMPT_JUDGE`,
        outputSchemaCode: 'DEFAULT_JSON',
        ownerUserId,
        version: 2,
        isActive: true,
      },
    });

    await prisma.agentProfile.upsert({
      where: { agentCode: 'JUDGE_V1' },
      update: {
        version: 2,
        isActive: true,
        templateSource: 'PUBLIC',
      },
      create: {
        agentCode: 'JUDGE_V1',
        agentName: '默认裁判 Agent',
        roleType: 'JUDGE',
        objective: '默认裁判',
        modelConfigKey: `${token}_MISSING_MODEL`,
        agentPromptCode: `${token}_PROMPT_JUDGE_DEFAULT`,
        outputSchemaCode: 'DEFAULT_JSON',
        ownerUserId,
        version: 2,
        isActive: true,
        templateSource: 'PUBLIC',
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
        mode: 'DEBATE',
        usageMethod: 'COPILOT',
        templateSource: 'PRIVATE',
        dslSnapshot: buildDebateDslSnapshot(
          workflowId,
          workflowName,
          ownerUserId,
          rulePackCode,
          participants,
          judgeAgentCode,
        ),
        changelog: 'agent conversation debate create',
      }),
    });
    assert.equal(createDefinition.status, 201, JSON.stringify(createDefinition.body));
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
    assert.equal(publishVersion.status, 201, JSON.stringify(publishVersion.body));
    assert.equal(publishVersion.body.status, 'PUBLISHED');

    const createSession = await fetchJson<{ id: string; state: string }>(
      `${baseUrl}/agent-conversations/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ title: 'Debate Session' }),
      },
    );
    assert.equal(createSession.status, 201);
    conversationSessionId = createSession.body.id;

    const sendTurn = await fetchJson<{
      state: string;
      intent: string;
      proposedPlan: { planId: string; planType: string } | null;
      confirmRequired: boolean;
      executionId?: string;
    }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        message:
          '请就东北玉米未来三个月是否存在缺口并涨价进行辩论，时间最近一个月，区域东北，裁判策略 JUDGE_AGENT。',
        contextPatch: {
          autoExecute: false,
        },
      }),
    });
    assert.equal(sendTurn.status, 201);
    let debateTurn = sendTurn.body;
    if (debateTurn.state === 'SLOT_FILLING') {
      const fillSlotsTurn = await fetchJson<{
        state: string;
        intent: string;
        proposedPlan: { planId: string; planType: string } | null;
        confirmRequired: boolean;
        executionId?: string;
      }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          message: '补充主题：东北玉米未来三个月供需缺口与涨价风险，裁判策略 JUDGE_AGENT。',
          contextPatch: {
            autoExecute: false,
          },
        }),
      });
      assert.equal(fillSlotsTurn.status, 201);
      debateTurn = fillSlotsTurn.body;
    }

    assert.ok(['PLAN_PREVIEW', 'EXECUTING'].includes(debateTurn.state));
    assert.equal(debateTurn.intent, 'DEBATE_MARKET_JUDGEMENT');
    assert.equal(debateTurn.proposedPlan?.planType, 'DEBATE_PLAN');

    let executionId = debateTurn.executionId;
    if (!executionId) {
      const sessionDetail = await fetchJson<{
        plans: Array<{ version: number; planSnapshot: { planId: string } }>;
      }>(`${baseUrl}/agent-conversations/sessions/${conversationSessionId}`, {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      });
      assert.equal(sessionDetail.status, 200);
      const latestPlan = sessionDetail.body.plans[0];
      assert.ok(latestPlan);

      const confirmPlan = await fetchJson<{
        accepted?: boolean;
        executionId?: string;
        status?: string;
        message?: string;
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
      if (confirmPlan.status === 201) {
        assert.equal(confirmPlan.body.accepted, true);
        assert.equal(confirmPlan.body.status, 'EXECUTING');
        executionId = confirmPlan.body.executionId;
      } else {
        assert.equal(confirmPlan.status, 500);
      }
    }
    if (executionId) {
      const executionDetail = await fetchJson<{
        status: string;
        nodeExecutions: Array<{ nodeType: string; status: string }>;
      }>(`${baseUrl}/workflow-executions/${executionId}`, {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      });
      assert.equal(executionDetail.status, 200);
      const nodeTypes = new Set(executionDetail.body.nodeExecutions.map((item) => item.nodeType));
      assert.ok(nodeTypes.has('debate-round'));
      assert.ok(nodeTypes.has('judge-agent'));

      const traces = await fetchJson<Array<{ participantCode: string; roundNumber: number }>>(
        `${baseUrl}/workflow-executions/${executionId}/debate-traces`,
        {
          headers: {
            'x-virtual-user-id': ownerUserId,
          },
        },
      );
      assert.equal(traces.status, 200);
      assert.ok(Array.isArray(traces.body));
      assert.ok(traces.body.length > 0);
    }

    const result = await fetchJson<{ status: string; executionId?: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/result`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(result.status, 200);
    if (executionId) {
      assert.equal(result.body.executionId, executionId);
    }
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
    await prisma.agentProfile.deleteMany({
      where: {
        agentCode: {
          startsWith: token,
        },
      },
    });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation-debate e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-debate e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
