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
    timeoutSeconds: 25,
    retryCount: 0,
    retryIntervalSeconds: 1,
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
      agentBindings: ['RISK_INSPECTOR_V1'],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_data_fetch',
          type: 'data-fetch',
          name: '基础数据获取',
          config: {
            dataSourceCode: 'MARKET_INTEL_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 1,
          },
        },
        {
          id: 'n_ai_inspector',
          type: 'single-agent',
          name: 'AI 风险初审',
          config: {
            agentProfileCode: 'RISK_INSPECTOR_V1',
            temperature: 0.1,
          },
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
          to: 'n_data_fetch',
          edgeType: 'data-edge',
        },
        {
          id: 'e_new_1',
          from: 'n_data_fetch',
          to: 'n_ai_inspector',
          edgeType: 'data-edge',
        },
        {
          id: 'e_new_2',
          from: 'n_ai_inspector',
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
      agentBindings: ['SENTIMENT_ANALYST_V1'],
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
          id: 'n_market_data',
          type: 'data-fetch',
          name: '市场波动数据',
          config: {
            dataSourceCode: 'MARKET_EVENT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 7,
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
          id: 'n_sentiment_analysis',
          type: 'single-agent',
          name: '市场舆情分析',
          config: {
            agentProfileCode: 'SENTIMENT_ANALYST_V1',
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
          id: 'e_new_1',
          from: 'n_trigger',
          to: 'n_market_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_new_2',
          from: 'n_trigger',
          to: 'n_sentiment_analysis',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_market_data',
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
          id: 'e_new_3',
          from: 'n_sentiment_analysis',
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
      paramSetBindings: ['BASELINE_SET', 'TRADER_EXPERIENCE_SET', 'DEBATE_SCENARIO_SET'],
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
          id: 'n_market_data',
          type: 'data-fetch',
          name: '市场行情获取',
          config: {
            dataSourceCode: 'MARKET_INTEL_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 3,
          },
        },
        {
          id: 'n_pre_check',
          type: 'rule-pack-eval',
          name: '前置规则校验',
          config: {
            rulePackCode: 'corn_baseline_rule_pack_v1',
            minHitScore: 60,
          },
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
            timeoutSeconds: 90,
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
          to: 'n_market_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_new_1',
          from: 'n_market_data',
          to: 'n_pre_check',
          edgeType: 'data-edge',
        },
        {
          id: 'e_new_2',
          from: 'n_pre_check',
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
  {
    workflowId: 'linear_policy_event_guard_public_v1',
    name: '政策事件联防流程（LINEAR）',
    description: '面向政策扰动与突发事件的线性联防流程，含合规守门与风险闸门。',
    mode: 'LINEAR',
    usageMethod: 'HEADLESS',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'linear_policy_event_guard_public_v1',
      name: '政策事件联防流程（LINEAR）',
      mode: 'LINEAR',
      usageMethod: 'HEADLESS',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: [
        'BASELINE_SET',
        'VOLATILE_SET',
        'POLICY_SHOCK_SET',
        'WORKFLOW_RUNTIME_GUARDRAIL_SET',
      ],
      agentBindings: [
        'POLICY_ANALYST_AGENT_V1',
        'EVENT_IMPACT_AGENT_V1',
        'COMPLIANCE_GUARD_AGENT_V1',
      ],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_event_data',
          type: 'data-fetch',
          name: '事件数据采集',
          config: {
            dataSourceCode: 'MARKET_EVENT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 2,
          },
        },
        {
          id: 'n_policy_agent',
          type: 'single-agent',
          name: '政策解读',
          config: {
            agentProfileCode: 'POLICY_ANALYST_AGENT_V1',
          },
        },
        {
          id: 'n_event_impact_agent',
          type: 'single-agent',
          name: '冲击评估',
          config: {
            agentProfileCode: 'EVENT_IMPACT_AGENT_V1',
          },
        },
        {
          id: 'n_compliance_agent',
          type: 'single-agent',
          name: '合规守门',
          config: {
            agentProfileCode: 'COMPLIANCE_GUARD_AGENT_V1',
          },
        },
        {
          id: 'n_rule_eval',
          type: 'rule-pack-eval',
          name: '分层规则校验',
          config: {
            includeLayeredPacks: true,
            ruleLayers: ['DEFAULT', 'INDUSTRY', 'RUNTIME_OVERRIDE'],
            applicableScopes: ['CORN', 'NORTH_CHINA', 'EMERGENCY'],
            minHitScore: 50,
          },
        },
        {
          id: 'n_risk_gate',
          type: 'risk-gate',
          name: '风险闸门',
          config: {
            riskProfileCode: 'RISK_PROFILE_POLICY_EVENT',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'HIGH',
            hardBlock: false,
            degradeAction: 'REVIEW_ONLY',
            blockerRules: ['emergencyStop', 'complianceStatus'],
          },
        },
        {
          id: 'n_notify',
          type: 'notify',
          name: '结果通知',
          config: {
            channels: ['DASHBOARD', 'WORKFLOW_LOG', 'WEBHOOK'],
          },
        },
      ],
      edges: [
        {
          id: 'e_1',
          from: 'n_trigger',
          to: 'n_event_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_event_data',
          to: 'n_policy_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_policy_agent',
          to: 'n_event_impact_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_event_impact_agent',
          to: 'n_compliance_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_compliance_agent',
          to: 'n_rule_eval',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_rule_eval',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_7',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'dag_multi_agent_fusion_public_v1',
    name: '多智能体融合流程（DAG）',
    description: '并行汇聚舆情、库存、基差与规则信号，形成多维决策输出。',
    mode: 'DAG',
    usageMethod: 'COPILOT',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'dag_multi_agent_fusion_public_v1',
      name: '多智能体融合流程（DAG）',
      mode: 'DAG',
      usageMethod: 'COPILOT',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'VOLATILE_SET', 'WORKFLOW_RUNTIME_GUARDRAIL_SET'],
      agentBindings: [
        'SENTIMENT_ANALYST_V1',
        'INVENTORY_ANALYST_AGENT_V1',
        'BASIS_ARBITRAGE_AGENT_V1',
      ],
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
            ruleLayers: ['DEFAULT', 'INDUSTRY'],
            applicableScopes: ['CORN', 'NORTH_CHINA'],
            minHitScore: 55,
          },
        },
        {
          id: 'n_intel_data',
          type: 'data-fetch',
          name: '情报数据采集',
          config: {
            dataSourceCode: 'MARKET_INTEL_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 3,
          },
        },
        {
          id: 'n_event_data',
          type: 'data-fetch',
          name: '事件数据采集',
          config: {
            dataSourceCode: 'MARKET_EVENT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 5,
          },
        },
        {
          id: 'n_sentiment_agent',
          type: 'single-agent',
          name: '舆情分析',
          config: {
            agentProfileCode: 'SENTIMENT_ANALYST_V1',
          },
        },
        {
          id: 'n_inventory_agent',
          type: 'single-agent',
          name: '库存分析',
          config: {
            agentProfileCode: 'INVENTORY_ANALYST_AGENT_V1',
          },
        },
        {
          id: 'n_arbitrage_agent',
          type: 'single-agent',
          name: '基差套利分析',
          config: {
            agentProfileCode: 'BASIS_ARBITRAGE_AGENT_V1',
          },
        },
        {
          id: 'n_formula',
          type: 'formula-calc',
          name: '复合因子计算',
          config: {
            expression: '((priceSpread+policyShockScore)*volatilityFactor)-freightSpikePct',
            parameterRefs: ['priceSpread', 'policyShockScore', 'volatilityFactor', 'freightSpikePct'],
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
            riskProfileCode: 'RISK_PROFILE_MULTI_AGENT',
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
          to: 'n_rule_eval',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_trigger',
          to: 'n_intel_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_trigger',
          to: 'n_event_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_intel_data',
          to: 'n_sentiment_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_intel_data',
          to: 'n_inventory_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_event_data',
          to: 'n_arbitrage_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_7',
          from: 'n_event_data',
          to: 'n_formula',
          edgeType: 'data-edge',
        },
        {
          id: 'e_8',
          from: 'n_rule_eval',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_9',
          from: 'n_sentiment_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_10',
          from: 'n_inventory_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_11',
          from: 'n_arbitrage_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_12',
          from: 'n_formula',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_13',
          from: 'n_join',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_14',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'linear_trade_playbook_public_v1',
    name: '交易剧本生成流程（LINEAR）',
    description: '串行生成市场判断、套利建议、仓位建议与执行剧本。',
    mode: 'LINEAR',
    usageMethod: 'ON_DEMAND',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'linear_trade_playbook_public_v1',
      name: '交易剧本生成流程（LINEAR）',
      mode: 'LINEAR',
      usageMethod: 'ON_DEMAND',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'TRADER_EXPERIENCE_SET', 'WORKFLOW_RUNTIME_GUARDRAIL_SET'],
      agentBindings: [
        'MARKET_ANALYST_AGENT_V1',
        'BASIS_ARBITRAGE_AGENT_V1',
        'POSITION_SIZING_AGENT_V1',
        'EXECUTION_ADVISOR_AGENT_V1',
      ],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_data_fetch',
          type: 'data-fetch',
          name: '市场情报采集',
          config: {
            dataSourceCode: 'MARKET_INTEL_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 2,
          },
        },
        {
          id: 'n_market_agent',
          type: 'single-agent',
          name: '市场判断',
          config: {
            agentProfileCode: 'MARKET_ANALYST_AGENT_V1',
          },
        },
        {
          id: 'n_arbitrage_agent',
          type: 'single-agent',
          name: '套利建议',
          config: {
            agentProfileCode: 'BASIS_ARBITRAGE_AGENT_V1',
          },
        },
        {
          id: 'n_budget_formula',
          type: 'formula-calc',
          name: '风险预算计算',
          config: {
            expression: '(marginUsagePct*volatilityFactor)',
            parameterRefs: ['marginUsagePct', 'volatilityFactor'],
            precision: 2,
            roundingMode: 'HALF_UP',
            nullPolicy: 'USE_DEFAULT',
            nullDefault: 1,
          },
        },
        {
          id: 'n_position_agent',
          type: 'single-agent',
          name: '仓位建议',
          config: {
            agentProfileCode: 'POSITION_SIZING_AGENT_V1',
          },
        },
        {
          id: 'n_execution_agent',
          type: 'single-agent',
          name: '执行剧本',
          config: {
            agentProfileCode: 'EXECUTION_ADVISOR_AGENT_V1',
          },
        },
        {
          id: 'n_rule_eval',
          type: 'rule-pack-eval',
          name: '基线规则校验',
          config: {
            rulePackCode: 'corn_baseline_rule_pack_v1',
            minHitScore: 60,
          },
        },
        {
          id: 'n_risk_gate',
          type: 'risk-gate',
          name: '风险闸门',
          config: {
            riskProfileCode: 'RISK_PROFILE_TRADE_PLAYBOOK',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'EXTREME',
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
          to: 'n_data_fetch',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_data_fetch',
          to: 'n_market_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_market_agent',
          to: 'n_arbitrage_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_arbitrage_agent',
          to: 'n_budget_formula',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_budget_formula',
          to: 'n_position_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_position_agent',
          to: 'n_execution_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_7',
          from: 'n_execution_agent',
          to: 'n_rule_eval',
          edgeType: 'data-edge',
        },
        {
          id: 'e_8',
          from: 'n_rule_eval',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_9',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'debate_macro_policy_committee_public_v1',
    name: '宏观政策辩论流程（DEBATE）',
    description: '围绕宏观、政策、物流与风控四角色展开辩论并裁决。',
    mode: 'DEBATE',
    usageMethod: 'ON_DEMAND',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'debate_macro_policy_committee_public_v1',
      name: '宏观政策辩论流程（DEBATE）',
      mode: 'DEBATE',
      usageMethod: 'ON_DEMAND',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'POLICY_SHOCK_SET', 'WORKFLOW_RUNTIME_GUARDRAIL_SET'],
      agentBindings: [
        'MARKET_ANALYST_AGENT_V1',
        'POLICY_ANALYST_AGENT_V1',
        'LOGISTICS_EXPERT_AGENT_V1',
        'RISK_OFFICER_AGENT_V1',
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
          id: 'n_event_data',
          type: 'data-fetch',
          name: '事件情报采集',
          config: {
            dataSourceCode: 'MARKET_EVENT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 3,
          },
        },
        {
          id: 'n_context',
          type: 'context-builder',
          name: '上下文构建',
          config: {
            includeHistorical: true,
            maxContextSize: 8000,
          },
        },
        {
          id: 'n_debate',
          type: 'debate-round',
          name: '多角色辩论',
          config: {
            topic: '政策扰动下玉米跨区域交易策略是否应收缩风险敞口',
            maxRounds: 1,
            judgePolicy: 'WEIGHTED',
            consensusThreshold: 0.68,
            timeoutSeconds: 90,
            participants: [
              {
                agentCode: 'MARKET_ANALYST_AGENT_V1',
                role: '市场分析师',
                perspective: '需求弹性与价格结构',
                weight: 1,
              },
              {
                agentCode: 'POLICY_ANALYST_AGENT_V1',
                role: '政策分析师',
                perspective: '政策窗口与监管节奏',
                weight: 1,
              },
              {
                agentCode: 'LOGISTICS_EXPERT_AGENT_V1',
                role: '物流专家',
                perspective: '跨区域运力与成本扰动',
                weight: 1,
              },
              {
                agentCode: 'RISK_OFFICER_AGENT_V1',
                role: '风控官',
                perspective: '风险上限与止损纪律',
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
            scoringDimensions: ['逻辑性', '证据完备度', '风险识别', '执行可行性'],
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
            riskProfileCode: 'RISK_PROFILE_MACRO_POLICY_DEBATE',
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
          to: 'n_event_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_event_data',
          to: 'n_context',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_context',
          to: 'n_debate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_debate',
          to: 'n_judge',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_judge',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_risk_gate',
          to: 'n_notify',
          edgeType: 'data-edge',
        },
      ],
    },
  },
  {
    workflowId: 'dag_stress_defense_public_v1',
    name: '压力防御流程（DAG）',
    description: '并行情景压力、资金流风险与风控审查，形成防御型动作建议。',
    mode: 'DAG',
    usageMethod: 'HEADLESS',
    versionCode: '1.0.0',
    dslSnapshot: {
      workflowId: 'dag_stress_defense_public_v1',
      name: '压力防御流程（DAG）',
      mode: 'DAG',
      usageMethod: 'HEADLESS',
      version: '1.0.0',
      status: 'ACTIVE',
      ownerUserId: DEFAULT_ADMIN_USER_ID,
      templateSource: 'PUBLIC',
      runPolicy: COMMON_RUN_POLICY,
      paramSetBindings: ['BASELINE_SET', 'POLICY_SHOCK_SET', 'WORKFLOW_RUNTIME_GUARDRAIL_SET'],
      agentBindings: [
        'SCENARIO_STRESS_AGENT_V1',
        'CASHFLOW_RISK_AGENT_V1',
        'RISK_OFFICER_AGENT_V1',
      ],
      nodes: [
        {
          id: 'n_trigger',
          type: 'manual-trigger',
          name: '手动触发',
          config: {},
        },
        {
          id: 'n_event_data',
          type: 'data-fetch',
          name: '事件数据采集',
          config: {
            dataSourceCode: 'MARKET_EVENT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 7,
          },
        },
        {
          id: 'n_insight_data',
          type: 'data-fetch',
          name: '洞察数据采集',
          config: {
            dataSourceCode: 'MARKET_INSIGHT_INTERNAL_DB',
            timeRangeType: 'LAST_N_DAYS',
            lookbackDays: 7,
          },
        },
        {
          id: 'n_stress_agent',
          type: 'single-agent',
          name: '情景压力测试',
          config: {
            agentProfileCode: 'SCENARIO_STRESS_AGENT_V1',
          },
        },
        {
          id: 'n_cashflow_agent',
          type: 'single-agent',
          name: '资金流风险评估',
          config: {
            agentProfileCode: 'CASHFLOW_RISK_AGENT_V1',
          },
        },
        {
          id: 'n_risk_officer_agent',
          type: 'single-agent',
          name: '风控审查',
          config: {
            agentProfileCode: 'RISK_OFFICER_AGENT_V1',
          },
        },
        {
          id: 'n_rule_eval',
          type: 'rule-pack-eval',
          name: '覆盖规则评估',
          config: {
            includeLayeredPacks: true,
            ruleLayers: ['DEFAULT', 'RUNTIME_OVERRIDE'],
            applicableScopes: ['CORN', 'EMERGENCY'],
            minHitScore: 50,
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
            riskProfileCode: 'RISK_PROFILE_STRESS_DEFENSE',
            thresholdParamCode: 'SIGNAL_BLOCK_RISK_GTE',
            blockWhenRiskGte: 'HIGH',
            hardBlock: true,
            degradeAction: 'HOLD',
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
          to: 'n_event_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_2',
          from: 'n_trigger',
          to: 'n_insight_data',
          edgeType: 'data-edge',
        },
        {
          id: 'e_3',
          from: 'n_trigger',
          to: 'n_rule_eval',
          edgeType: 'data-edge',
        },
        {
          id: 'e_4',
          from: 'n_event_data',
          to: 'n_stress_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_5',
          from: 'n_event_data',
          to: 'n_cashflow_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_6',
          from: 'n_insight_data',
          to: 'n_risk_officer_agent',
          edgeType: 'data-edge',
        },
        {
          id: 'e_7',
          from: 'n_stress_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_8',
          from: 'n_cashflow_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_9',
          from: 'n_risk_officer_agent',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_10',
          from: 'n_rule_eval',
          to: 'n_join',
          edgeType: 'data-edge',
        },
        {
          id: 'e_11',
          from: 'n_join',
          to: 'n_risk_gate',
          edgeType: 'data-edge',
        },
        {
          id: 'e_12',
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
