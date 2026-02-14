import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

type SeedWorkflow = {
  workflowId: string;
  name: string;
  description: string;
  mode: 'LINEAR' | 'DAG' | 'DEBATE';
  usageMethod: 'HEADLESS' | 'COPILOT' | 'ON_DEMAND';
  versionCode: string;
  dslSnapshot: Record<string, unknown>;
};

const COMMON_RUN_POLICY = {
  nodeDefaults: {
    timeoutMs: 25000,
    retryCount: 0,
    retryBackoffMs: 1000,
    onError: 'CONTINUE',
  },
};

const WORKFLOW_TEMPLATES: SeedWorkflow[] = [
  {
    workflowId: 'quick_rule_guard_public_v1',
    name: '快速规则风控流程（开箱）',
    description: '手动触发后完成规则评估、风险闸门与通知输出。',
    mode: 'LINEAR',
    usageMethod: 'HEADLESS',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'quick_rule_guard_public_v1',
      name: '快速规则风控流程（开箱）',
      mode: 'LINEAR',
      usageMethod: 'HEADLESS',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'TRADER_EXPERIENCE_SET'],
      agentBindings: [],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_rule_eval',
          type: 'rule-pack-eval',
          name: '分层规则评估',
          config: {
            includeLayeredPacks: true,
            ruleLayers: ['DEFAULT', 'INDUSTRY', 'EXPERIENCE'],
            applicableScopes: ['CORN', 'NORTH_CHINA'],
            minHitScore: 55,
          },
        },
        {
          id: 'n_risk_gate',
          type: 'risk-gate',
          name: '风险闸门',
          config: {
            riskProfileCode: 'RISK_PROFILE_BASELINE',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'EXTREME',
            hardBlock: false,
            degradeAction: 'REVIEW_ONLY',
            blockerRules: ['emergencyStop'],
          },
        },
        {
          id: 'n_notify',
          type: 'notify',
          name: '结果通知',
          config: {
            channels: ['DASHBOARD', 'WEBHOOK'],
          },
        },
      ],
      edges: [
        {
          id: 'e_1',
          from: 'n_trigger',
          to: 'n_rule_eval',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_rule_eval',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'dag_signal_fusion_public_v1',
    name: '多信号并行融合流程（DAG）',
    description: '并行执行规则与计算节点，经 join 聚合后输出风控结果。',
    mode: 'DAG',
    usageMethod: 'COPILOT',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'dag_signal_fusion_public_v1',
      name: '多信号并行融合流程（DAG）',
      mode: 'DAG',
      usageMethod: 'COPILOT',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'VOLATILE_SET'],
      agentBindings: [],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_rule_base',
          type: 'rule-pack-eval',
          name: '基础规则评估',
          config: {
            rulePackCode: 'corn_baseline_rule_pack_v1',
            minHitScore: 50,
          },
        },
        {
          id: 'n_rule_layered',
          type: 'rule-pack-eval',
          name: '行业分层规则评估',
          config: {
            includeLayeredPacks: true,
            ruleLayers: ['DEFAULT', 'INDUSTRY', 'RUNTIME_OVERRIDE'],
            applicableScopes: ['CORN', 'NORTH_CHINA'],
            minHitScore: 60,
          },
        },
        {
          id: 'n_formula_calc',
          type: 'formula-calc',
          name: '波动复合计算',
          config: {
            expression: '((priceSpread+inventoryPressure)*volatilityFactor)',
            parameterRefs: ['priceSpread', 'inventoryPressure', 'volatilityFactor'],
            precision: 2,
            roundingMode: 'HALF_UP',
            nullPolicy: 'USE_DEFAULT',
            nullDefault: 1,
          },
        },
        {
          id: 'n_join',
          type: 'join',
          name: '并行汇聚',
          config: {
            joinPolicy: 'ALL_REQUIRED',
          },
        },
        {
          id: 'n_risk_gate',
          type: 'risk-gate',
          name: '风险闸门',
          config: {
            riskProfileCode: 'RISK_PROFILE_DAG',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'HIGH',
            hardBlock: false,
            degradeAction: 'REDUCE',
            blockerRules: ['emergencyStop'],
          },
        },
        {
          id: 'n_notify',
          type: 'notify',
          name: '结果通知',
          config: {
            channels: ['DASHBOARD', 'WORKFLOW_LOG'],
          },
        },
      ],
      edges: [
        {
          id: 'e_1',
          from: 'n_trigger',
          to: 'n_rule_base',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_trigger',
          to: 'n_rule_layered',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_trigger',
          to: 'n_formula_calc',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_rule_base',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_rule_layered',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_formula_calc',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_7',
          from: 'n_join',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_8',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'debate_risk_committee_public_v1',
    name: '多角色辩论决策流程（DEBATE）',
    description: '由多角色 Agent 进行一轮辩论并输出裁决，再经过风险闸门。',
    mode: 'DEBATE',
    usageMethod: 'ON_DEMAND',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'debate_risk_committee_public_v1',
      name: '多角色辩论决策流程（DEBATE）',
      mode: 'DEBATE',
      usageMethod: 'ON_DEMAND',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'TRADER_EXPERIENCE_SET'],
      agentBindings: [
        'MARKET_ANALYST_AGENT_V1',
        'FUTURES_EXPERT_AGENT_V1',
        'SPOT_EXPERT_AGENT_V1',
        'JUDGE_AGENT_V1',
      ],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_context',
          type: 'context-builder',
          name: '上下文构建',
          config: {
            includeHistorical: false,
            maxContextSize: 6000,
          },
        },
        {
          id: 'n_debate',
          type: 'debate-round',
          name: '多角色辩论',
          config: {
            topic: '玉米现货与基差交易策略评估',
            maxRounds: 1,
            judgePolicy: 'WEIGHTED',
            consensusThreshold: 0.7,
            participants: [
              {
                agentCode: 'MARKET_ANALYST_AGENT_V1',
                role: '市场分析师',
                perspective: '宏观与供需平衡',
                weight: 1,
              },
              {
                agentCode: 'FUTURES_EXPERT_AGENT_V1',
                role: '期货专家',
                perspective: '基差与套保结构',
                weight: 1,
              },
              {
                agentCode: 'SPOT_EXPERT_AGENT_V1',
                role: '现货专家',
                perspective: '区域流通与现货弹性',
                weight: 1,
              },
            ],
          },
        },
        {
          id: 'n_judge',
          type: 'judge-agent',
          name: '裁判裁决',
          config: {
            judgeAgentCode: 'JUDGE_AGENT_V1',
            scoringDimensions: ['逻辑性', '证据完备度', '风险识别'],
            outputAction: true,
            minConfidenceForAction: 50,
            verdictFormat: 'structured',
          },
        },
        {
          id: 'n_risk_gate',
          type: 'risk-gate',
          name: '风险闸门',
          config: {
            riskProfileCode: 'RISK_PROFILE_DEBATE',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'EXTREME',
            hardBlock: false,
            degradeAction: 'REVIEW_ONLY',
          },
        },
        {
          id: 'n_notify',
          type: 'notify',
          name: '结果通知',
          config: {
            channels: ['DASHBOARD', 'WORKFLOW_LOG'],
          },
        },
      ],
      edges: [
        {
          id: 'e_1',
          from: 'n_trigger',
          to: 'n_context',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_context',
          to: 'n_debate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_debate',
          to: 'n_judge',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_judge',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function seedWorkflowTemplates() {
  console.log('🌱 开始播种内置工作流模板...');

  for (const item of WORKFLOW_TEMPLATES) {
    const definition = await prisma.workflowDefinition.upsert({
      where: {
        workflowId: item.workflowId,
      },
      update: {
        name: item.name,
        description: item.description,
        mode: item.mode,
        usageMethod: item.usageMethod,
        status: 'ACTIVE',
        ownerUserId: DEFAULT_ADMIN_USER_ID,
        templateSource: 'PUBLIC',
        isActive: true,
        latestVersionCode: item.versionCode,
      },
      create: {
        workflowId: item.workflowId,
        name: item.name,
        description: item.description,
        mode: item.mode,
        usageMethod: item.usageMethod,
        status: 'ACTIVE',
        ownerUserId: DEFAULT_ADMIN_USER_ID,
        templateSource: 'PUBLIC',
        isActive: true,
        latestVersionCode: item.versionCode,
      },
    });

    const version = await prisma.workflowVersion.upsert({
      where: {
        workflowDefinitionId_versionCode: {
          workflowDefinitionId: definition.id,
          versionCode: item.versionCode,
        },
      },
      update: {
        status: 'PUBLISHED',
        dslSnapshot: toJsonValue(item.dslSnapshot),
        changelog: '内置模板初始化',
        createdByUserId: DEFAULT_ADMIN_USER_ID,
        publishedAt: new Date(),
      },
      create: {
        workflowDefinitionId: definition.id,
        versionCode: item.versionCode,
        status: 'PUBLISHED',
        dslSnapshot: toJsonValue(item.dslSnapshot),
        changelog: '内置模板初始化',
        createdByUserId: DEFAULT_ADMIN_USER_ID,
        publishedAt: new Date(),
      },
    });

    const existingAudit = await prisma.workflowPublishAudit.findFirst({
      where: {
        workflowDefinitionId: definition.id,
        workflowVersionId: version.id,
        operation: 'PUBLISH',
      },
      select: {
        id: true,
      },
    });

    if (!existingAudit) {
      await prisma.workflowPublishAudit.create({
        data: {
          workflowDefinitionId: definition.id,
          workflowVersionId: version.id,
          operation: 'PUBLISH',
          publishedByUserId: DEFAULT_ADMIN_USER_ID,
          comment: '系统内置模板初始化发布',
          snapshot: toJsonValue({
            workflowId: item.workflowId,
            versionCode: item.versionCode,
            source: 'SYSTEM_SEED',
          }),
          publishedAt: new Date(),
        },
      });
    }
  }

  console.log(`✅ 工作流模板播种完成，共 ${WORKFLOW_TEMPLATES.length} 套`);
}

seedWorkflowTemplates()
  .catch((error) => {
    console.error('❌ 工作流模板播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
