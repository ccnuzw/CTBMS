import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { AgentProfileModule } from '../src/modules/agent-profile';
import { DecisionRuleModule } from '../src/modules/decision-rule';
import { ParameterCenterModule } from '../src/modules/parameter-center';
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    PrismaModule,
    WorkflowDefinitionModule,
    DecisionRuleModule,
    ParameterCenterModule,
    AgentProfileModule,
  ],
})
class WorkflowGovernancePublishE2eModule implements NestModule {
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
  const app = await NestFactory.create(WorkflowGovernancePublishE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `wf_governance_${Date.now()}`;
  const workflowId = `${token}_workflow`;
  const workflowName = `workflow governance ${token}`;
  const rulePackCode = `${token}_RULE_PACK`.toUpperCase();
  const parameterSetCode = `${token}_PARAM_SET`.toUpperCase();
  const agentCode = `${token}_AGENT`.toUpperCase();

  let workflowDefinitionId: string | null = null;
  let rulePackId: string | null = null;
  let parameterSetId: string | null = null;
  let agentProfileId: string | null = null;

  try {
    const createRulePack = await fetchJson<{ id: string }>(`${baseUrl}/decision-rule-packs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        rulePackCode,
        name: `rule pack ${token}`,
        templateSource: 'PRIVATE',
        rules: [
          {
            ruleCode: `${token}_RULE_1`,
            name: 'rule 1',
            fieldPath: 'risk.score',
            operator: 'GTE',
            expectedValue: 60,
          },
        ],
      }),
    });
    assert.equal(createRulePack.status, 201, JSON.stringify(createRulePack.body));
    rulePackId = createRulePack.body.id;

    const createParameterSet = await fetchJson<{ id: string }>(`${baseUrl}/parameter-sets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        setCode: parameterSetCode,
        name: `parameter set ${token}`,
        templateSource: 'PRIVATE',
      }),
    });
    assert.equal(createParameterSet.status, 201, JSON.stringify(createParameterSet.body));
    parameterSetId = createParameterSet.body.id;

    const createAgentProfile = await fetchJson<{ id: string }>(`${baseUrl}/agent-profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        agentCode,
        agentName: `agent ${token}`,
        roleType: 'ANALYST',
        modelConfigKey: 'DEFAULT',
        agentPromptCode: 'PROMPT_DEFAULT',
        outputSchemaCode: 'agent_output_v1',
        templateSource: 'PRIVATE',
      }),
    });
    assert.equal(createAgentProfile.status, 201, JSON.stringify(createAgentProfile.body));
    agentProfileId = createAgentProfile.body.id;

    const dslSnapshot = {
      workflowId,
      name: workflowName,
      mode: 'LINEAR',
      usageMethod: 'COPILOT',
      version: '1.0.0',
      status: 'DRAFT',
      paramSetBindings: [parameterSetCode],
      agentBindings: [agentCode],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: 'manual trigger',
          enabled: true,
          config: {},
        },
        {
          id: 'n_fetch',
          type: 'market-data-fetch',
          name: 'market fetch',
          enabled: true,
          config: { dataSourceCode: 'MOCK_SOURCE' },
        },
        {
          id: 'n_rule',
          type: 'rule-pack-eval',
          name: 'rule eval',
          enabled: true,
          config: { rulePackCode },
        },
        {
          id: 'n_agent',
          type: 'single-agent',
          name: 'single agent',
          enabled: true,
          config: {
            agentProfileCode: agentCode,
            outputSchemaCode: 'agent_output_v1',
          },
        },
        {
          id: 'n_risk',
          type: 'risk-gate',
          name: 'risk gate',
          enabled: true,
          config: { riskProfileCode: 'WF_GOVERNANCE_PROFILE' },
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
        { id: 'e2', from: 'n_fetch', to: 'n_rule', edgeType: 'data-edge' },
        { id: 'e3', from: 'n_rule', to: 'n_agent', edgeType: 'data-edge' },
        { id: 'e4', from: 'n_agent', to: 'n_risk', edgeType: 'control-edge' },
        { id: 'e5', from: 'n_risk', to: 'n_notify', edgeType: 'control-edge' },
      ],
      runPolicy: {
        nodeDefaults: {
          timeoutMs: 30000,
          retryCount: 1,
          retryBackoffMs: 2000,
          onError: 'FAIL_FAST',
        },
      },
    };

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
        dslSnapshot,
      }),
    });
    assert.equal(createDefinition.status, 201, JSON.stringify(createDefinition.body));
    workflowDefinitionId = createDefinition.body.definition.id;

    const publishBeforeDependencies = await fetchJson<{
      message?: string;
      issues?: Array<{ code: string }>;
    }>(`${baseUrl}/workflow-definitions/${workflowDefinitionId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        versionId: createDefinition.body.version.id,
      }),
    });
    assert.equal(publishBeforeDependencies.status, 400);
    const beforeIssueCodes = new Set(
      (publishBeforeDependencies.body.issues ?? []).map((item) => item.code),
    );
    assert.equal(
      beforeIssueCodes.has('WF301'),
      true,
      JSON.stringify(publishBeforeDependencies.body),
    );
    assert.equal(
      beforeIssueCodes.has('WF302'),
      true,
      JSON.stringify(publishBeforeDependencies.body),
    );
    assert.equal(
      beforeIssueCodes.has('WF303'),
      true,
      JSON.stringify(publishBeforeDependencies.body),
    );

    const publishRulePack = await fetchJson<{ id: string; version: number }>(
      `${baseUrl}/decision-rule-packs/${rulePackId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(publishRulePack.status, 201);
    assert.equal(publishRulePack.body.version >= 2, true);

    const publishParameterSet = await fetchJson<{ id: string; version: number }>(
      `${baseUrl}/parameter-sets/${parameterSetId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(publishParameterSet.status, 201);
    assert.equal(publishParameterSet.body.version >= 2, true);

    const publishAgent = await fetchJson<{ id: string; version: number }>(
      `${baseUrl}/agent-profiles/${agentProfileId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(publishAgent.status, 201);
    assert.equal(publishAgent.body.version >= 2, true);

    const publishAfterDependencies = await fetchJson<{ status: string }>(
      `${baseUrl}/workflow-definitions/${workflowDefinitionId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          versionId: createDefinition.body.version.id,
        }),
      },
    );
    assert.equal(
      publishAfterDependencies.status,
      201,
      `publish should pass after dependencies published: ${JSON.stringify(publishAfterDependencies.body)}`,
    );
    assert.equal(publishAfterDependencies.body.status, 'PUBLISHED');

    console.log('[workflow-governance-publish.e2e-spec] all assertions passed');
  } finally {
    if (workflowDefinitionId) {
      await prisma.workflowDefinition
        .delete({ where: { id: workflowDefinitionId } })
        .catch(() => undefined);
    }
    if (rulePackId) {
      await prisma.decisionRulePack.delete({ where: { id: rulePackId } }).catch(() => undefined);
    }
    if (parameterSetId) {
      await prisma.parameterSet.delete({ where: { id: parameterSetId } }).catch(() => undefined);
    }
    if (agentProfileId) {
      await prisma.agentProfile.delete({ where: { id: agentProfileId } }).catch(() => undefined);
    }
    await app.close();
  }
}

main().catch((error) => {
  console.error('[workflow-governance-publish.e2e-spec] failed');
  console.error(error);
  process.exit(1);
});
