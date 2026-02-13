import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { WorkflowDsl } from '@packages/types';
import { WorkflowDslValidator } from '../src/modules/workflow-definition/workflow-dsl-validator';

const validator = new WorkflowDslValidator();

const baseRunPolicy = {
  nodeDefaults: {
    timeoutMs: 30000,
    retryCount: 1,
    retryBackoffMs: 2000,
    onError: 'FAIL_FAST',
  },
} as const;

const createBaseDsl = (): WorkflowDsl => ({
  workflowId: `wf_validator_${Date.now()}`,
  name: 'workflow validator',
  mode: 'LINEAR',
  usageMethod: 'COPILOT',
  version: '1.0.0',
  status: 'DRAFT',
  ownerUserId: randomUUID(),
  nodes: [],
  edges: [],
  runPolicy: baseRunPolicy,
});

const assertHasIssue = (dsl: WorkflowDsl, code: string, stage: 'SAVE' | 'PUBLISH' = 'SAVE') => {
  const result = validator.validate(dsl, stage);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    `expect ${code}, actual=${JSON.stringify(result.issues)}`,
  );
};

async function main() {
  // WF201: data-edge 类型不兼容
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'compute',
        name: 'source',
        enabled: true,
        config: {},
        outputSchema: {
          fields: {
            price: 'number',
          },
        },
      },
      {
        id: 'n3',
        type: 'compute',
        name: 'target',
        enabled: true,
        config: {
          inputSchema: {
            fields: {
              price: 'string',
            },
          },
        },
        inputBindings: {
          price: '{{n2.price}}',
        },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'data-edge' },
    ];
    assertHasIssue(dsl, 'WF201');
  }

  // WF202: inputBindings 引用字段不存在
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'compute',
        name: 'source',
        enabled: true,
        config: {},
        outputSchema: {
          fields: {
            price: 'number',
          },
        },
      },
      {
        id: 'n3',
        type: 'compute',
        name: 'target',
        enabled: true,
        config: {
          inputSchema: {
            fields: {
              volume: 'number',
            },
          },
        },
        inputBindings: {
          volume: '{{n2.volume}}',
        },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'data-edge' },
    ];
    assertHasIssue(dsl, 'WF202');
  }

  // WF203: 参数表达式未绑定参数集
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'compute',
        name: 'calc',
        enabled: true,
        config: {
          expression: '{{params.MAX_POSITION_RATIO}}',
        },
      },
    ];
    dsl.edges = [{ id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' }];
    assertHasIssue(dsl, 'WF203');
  }

  // WF204: decision-merge 入边不足
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'decision-merge',
        name: 'merge',
        enabled: true,
        config: { decisionPolicy: 'HYBRID' },
      },
    ];
    dsl.edges = [{ id: 'e1', from: 'n1', to: 'n2', edgeType: 'data-edge' }];
    assertHasIssue(dsl, 'WF204');
  }

  // WF205: condition-edge 条件语法非法
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      { id: 'n2', type: 'compute', name: 'branch', enabled: true, config: {} },
      {
        id: 'n3',
        type: 'notify',
        name: 'notify',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'condition-edge', condition: null },
    ];
    assertHasIssue(dsl, 'WF205');
  }

  // WF304: 发布前 ownerUserId 必填
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'data-fetch',
        name: 'fetch',
        enabled: true,
        config: { connectorCode: 'MOCK' },
      },
      {
        id: 'n3',
        type: 'rule-pack-eval',
        name: 'rule',
        enabled: true,
        config: { rulePackCode: 'MOCK' },
      },
      {
        id: 'n4',
        type: 'single-agent',
        name: 'agent',
        enabled: true,
        config: { agentProfileCode: 'MOCK' },
      },
      {
        id: 'n5',
        type: 'risk-gate',
        name: 'risk',
        enabled: true,
        config: { riskProfileCode: 'MOCK' },
      },
      {
        id: 'n6',
        type: 'notify',
        name: 'notify',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'data-edge' },
      { id: 'e3', from: 'n3', to: 'n4', edgeType: 'data-edge' },
      { id: 'e4', from: 'n4', to: 'n5', edgeType: 'control-edge' },
      { id: 'e5', from: 'n5', to: 'n6', edgeType: 'control-edge' },
    ];
    dsl.ownerUserId = undefined;
    assertHasIssue(dsl, 'WF304', 'PUBLISH');
  }

  // WF305: 发布前证据链三类缺失
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'risk-gate',
        name: 'risk',
        enabled: true,
        config: { riskProfileCode: 'MOCK' },
      },
      {
        id: 'n3',
        type: 'notify',
        name: 'notify',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'control-edge' },
    ];
    assertHasIssue(dsl, 'WF305', 'PUBLISH');
  }

  // WF306: A/B 分流配置非法
  {
    const dsl = createBaseDsl();
    dsl.nodes = [
      { id: 'n1', type: 'manual-trigger', name: 'trigger', enabled: true, config: {} },
      {
        id: 'n2',
        type: 'data-fetch',
        name: 'fetch',
        enabled: true,
        config: { connectorCode: 'MOCK' },
      },
      {
        id: 'n3',
        type: 'rule-pack-eval',
        name: 'rule',
        enabled: true,
        config: { rulePackCode: 'MOCK' },
      },
      {
        id: 'n4',
        type: 'single-agent',
        name: 'agent',
        enabled: true,
        config: { agentProfileCode: 'MOCK' },
      },
      {
        id: 'n5',
        type: 'risk-gate',
        name: 'risk',
        enabled: true,
        config: { riskProfileCode: 'MOCK' },
      },
      {
        id: 'n6',
        type: 'notify',
        name: 'notify',
        enabled: true,
        config: { channels: ['DASHBOARD'] },
      },
    ];
    dsl.edges = [
      { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
      { id: 'e2', from: 'n2', to: 'n3', edgeType: 'data-edge' },
      { id: 'e3', from: 'n3', to: 'n4', edgeType: 'data-edge' },
      { id: 'e4', from: 'n4', to: 'n5', edgeType: 'control-edge' },
      { id: 'e5', from: 'n5', to: 'n6', edgeType: 'control-edge' },
    ];
    dsl.experimentConfig = {
      enabled: true,
      experimentCode: '',
      variants: [
        { version: '1.0.0', traffic: 0.8 },
        { version: '1.1.0', traffic: 0.1 },
      ],
      splitPolicy: 'INVALID',
      autoStop: {
        enabled: true,
        badCaseThreshold: 2,
      },
    };
    assertHasIssue(dsl, 'WF306', 'PUBLISH');
  }

  console.log('[workflow-dsl-validator.e2e-spec] all assertions passed');
}

main().catch((error) => {
  console.error('[workflow-dsl-validator.e2e-spec] failed');
  console.error(error);
  process.exit(1);
});
