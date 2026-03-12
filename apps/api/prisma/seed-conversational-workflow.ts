/**
 * 对话工作流 seed — 补齐 12 场景 DSL 引用的 DataConnector + AgentProfile
 *
 * 运行方式:
 *   pnpm --filter api exec ts-node prisma/seed-conversational-workflow.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════
//  Part 1: DataConnector — DSL 引用的 10 个 dataSourceCode
// ══════════════════════════════════════════════════

type SeedConnector = {
  connectorCode: string;
  connectorName: string;
  connectorType: string;
  category: string;
  queryTemplates?: Record<string, unknown>;
  endpointConfig?: Record<string, unknown>;
  freshnessPolicy?: Record<string, unknown>;
  fallbackConnectorCode?: string | null;
};

const DATA_CONNECTORS: SeedConnector[] = [
  {
    connectorCode: 'INTERNAL_PRICE_DATA',
    connectorName: '现货价格-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'PRICE',
    queryTemplates: {
      tableName: 'PriceData',
      defaultTimeField: 'createdAt',
      defaultLimit: 200,
    },
    freshnessPolicy: { maxMinutes: 60 },
  },
  {
    connectorCode: 'INTERNAL_MARKET_INTEL',
    connectorName: '市场情报-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'MARKET_INTEL',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 120 },
    fallbackConnectorCode: 'MARKET_INTEL_INTERNAL_DB',
  },
  {
    connectorCode: 'MANUAL_FREIGHT_PARAM',
    connectorName: '物流运费参数-手动录入',
    connectorType: 'INTERNAL_DB',
    category: 'LOGISTICS',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 50,
    },
    freshnessPolicy: { maxMinutes: 1440 },
  },
  {
    connectorCode: 'INTERNAL_POSITION_DATA',
    connectorName: '持仓数据-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'RISK',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 60 },
  },
  {
    connectorCode: 'INTERNAL_LOGISTICS_DATA',
    connectorName: '物流在途-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'LOGISTICS',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 240 },
  },
  {
    connectorCode: 'INTERNAL_CONTRACT_DATA',
    connectorName: '合同数据-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'COMPLIANCE',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 1440 },
  },
  {
    connectorCode: 'INTERNAL_EXECUTION_HISTORY',
    connectorName: '工作流执行历史',
    connectorType: 'INTERNAL_DB',
    category: 'WORKFLOW',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 200,
    },
    freshnessPolicy: { maxMinutes: 60 },
  },
  {
    connectorCode: 'INTERNAL_DECISION_RECORDS',
    connectorName: '决策记录-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'WORKFLOW',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 120 },
  },
  {
    connectorCode: 'INTERNAL_STRATEGY_DATA',
    connectorName: '策略数据-内部库',
    connectorType: 'INTERNAL_DB',
    category: 'STRATEGY',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: { maxMinutes: 1440 },
  },
  {
    connectorCode: 'WEATHER_API',
    connectorName: '天气 API-外部服务',
    connectorType: 'REST_API',
    category: 'LOGISTICS',
    endpointConfig: {
      url: 'https://api.weatherapi.com/v1/forecast.json',
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    freshnessPolicy: { maxMinutes: 60 },
  },
];

// ══════════════════════════════════════════════════
//  Part 2: AgentProfile + PromptTemplate — DSL 引用的 12 个 agentCode
// ══════════════════════════════════════════════════

type SceneAgent = {
  agentCode: string;
  agentName: string;
  roleType: string;
  objective: string;
  promptCode: string;
  promptName: string;
};

const SCENE_AGENTS: SceneAgent[] = [
  {
    agentCode: 'SpotSupplyDemandAgent',
    agentName: '现货供需分析师',
    roleType: 'ANALYST',
    objective: '综合分析品种的现货、期货和最新情报，给出行情研判和操作建议。',
    promptCode: 'SPOT_SUPPLY_DEMAND_V1',
    promptName: '现货供需分析提示词',
  },
  {
    agentCode: 'RegionalSpreadAgent',
    agentName: '区域价差分析师',
    roleType: 'COST_SPREAD',
    objective: '分析产区到销区的价差走势、套利窗口和操作时机。',
    promptCode: 'REGIONAL_SPREAD_V1',
    promptName: '区域价差分析提示词',
  },
  {
    agentCode: 'IntradayAlertAgent',
    agentName: '盘中异动分析师',
    roleType: 'ANALYST',
    objective: '快速分析品种异动原因并给出速报。',
    promptCode: 'INTRADAY_ALERT_V1',
    promptName: '盘中异动分析提示词',
  },
  {
    agentCode: 'ClosingReviewAgent',
    agentName: '收盘复盘分析师',
    roleType: 'ANALYST',
    objective: '复盘品种当日行情变化和次日关注要点。',
    promptCode: 'CLOSING_REVIEW_V1',
    promptName: '收盘复盘分析提示词',
  },
  {
    agentCode: 'BasisAnalysisAgent',
    agentName: '期现基差分析师',
    roleType: 'FUTURES_EXPERT',
    objective: '分析品种的基差走势和套保建议。',
    promptCode: 'BASIS_ANALYSIS_V1',
    promptName: '期现基差分析提示词',
  },
  {
    agentCode: 'SupplyDemandAgent',
    agentName: '供需平衡分析师',
    roleType: 'ANALYST',
    objective: '全面分析品种的供需格局和价格展望。',
    promptCode: 'SUPPLY_DEMAND_V1',
    promptName: '供需平衡分析提示词',
  },
  {
    agentCode: 'PositionRiskAgent',
    agentName: '持仓风险顾问',
    roleType: 'RISK_OFFICER',
    objective: '评估当前持仓风险并给出调整建议。',
    promptCode: 'POSITION_RISK_V1',
    promptName: '持仓风险分析提示词',
  },
  {
    agentCode: 'LogisticsRiskAgent',
    agentName: '物流风险分析师',
    roleType: 'LOGISTICS_EXPERT',
    objective: '评估运输路线的物流风险。',
    promptCode: 'LOGISTICS_RISK_V1',
    promptName: '物流风险分析提示词',
  },
  {
    agentCode: 'ComplianceAgent',
    agentName: '合规审查员',
    roleType: 'COMPLIANCE_GUARD',
    objective: '审查合同条款合规性并标记风险项。',
    promptCode: 'COMPLIANCE_CHECK_V1',
    promptName: '合规审查分析提示词',
  },
  {
    agentCode: 'StrategyReviewAgent',
    agentName: '策略复盘分析师',
    roleType: 'ANALYST',
    objective: '复盘策略表现并给出优化建议。',
    promptCode: 'STRATEGY_REVIEW_V1',
    promptName: '策略复盘分析提示词',
  },
  {
    agentCode: 'BacktestAnalysisAgent',
    agentName: '绩效回测分析师',
    roleType: 'ANALYST',
    objective: '分析策略的月度表现和参数校准建议。',
    promptCode: 'BACKTEST_ANALYSIS_V1',
    promptName: '绩效回测分析提示词',
  },
];

// ══════════════════════════════════════════════════
//  执行
// ══════════════════════════════════════════════════

async function seedConversationalWorkflow() {
  console.log('🌱 开始播种 对话工作流专用 DataConnector + AgentProfile...\n');

  // ── DataConnector ────────────────
  let connectorCount = 0;
  for (const c of DATA_CONNECTORS) {
    await prisma.dataConnector.upsert({
      where: { connectorCode: c.connectorCode },
      update: {
        connectorName: c.connectorName,
        connectorType: c.connectorType,
        category: c.category,
        endpointConfig: (c.endpointConfig as never) ?? undefined,
        queryTemplates: (c.queryTemplates as never) ?? undefined,
        freshnessPolicy: (c.freshnessPolicy as never) ?? undefined,
        fallbackConnectorCode: c.fallbackConnectorCode ?? null,
        ownerType: 'SYSTEM',
        isActive: true,
      },
      create: {
        connectorCode: c.connectorCode,
        connectorName: c.connectorName,
        connectorType: c.connectorType,
        category: c.category,
        endpointConfig: (c.endpointConfig as never) ?? undefined,
        queryTemplates: (c.queryTemplates as never) ?? undefined,
        freshnessPolicy: (c.freshnessPolicy as never) ?? undefined,
        fallbackConnectorCode: c.fallbackConnectorCode ?? null,
        ownerType: 'SYSTEM',
        isActive: true,
      },
    });
    connectorCount++;
  }
  console.log(`  ✅ DataConnector × ${connectorCount}`);

  // ── AgentPromptTemplate + AgentProfile ────────────────
  let agentCount = 0;
  for (const a of SCENE_AGENTS) {
    const systemPrompt = [
      `你是${a.agentName}，目标：${a.objective}`,
      '你必须输出严格 JSON（UTF-8），且只能输出一个 JSON 对象，不允许任何解释、前后缀、markdown、代码块。',
      'JSON 必须包含字段：',
      '- thesis: string，核心结论（不超过120字）',
      '- confidence: number，范围 0 到 1',
      '- evidence: string[]，至少 2 条，每条不超过80字',
      '- action: "BUY" | "SELL" | "HOLD" | "REDUCE" | "REVIEW_ONLY"',
      '- riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME"',
      '如果信息不足，也必须按上述结构返回，并在 thesis 中明确"信息不足"。',
    ].join('\n');

    const userPrompt = [
      '以下是流程上下文(JSON)：',
      '{{context}}',
      '',
      '请基于上下文完成分析并直接返回 JSON 对象。',
    ].join('\n');

    await prisma.agentPromptTemplate.upsert({
      where: { promptCode: a.promptCode },
      update: {
        name: a.promptName,
        roleType: a.roleType,
        systemPrompt,
        userPromptTemplate: userPrompt,
        outputFormat: 'json',
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        templateSource: 'PUBLIC',
        isActive: true,
      },
      create: {
        promptCode: a.promptCode,
        name: a.promptName,
        roleType: a.roleType,
        systemPrompt,
        userPromptTemplate: userPrompt,
        outputFormat: 'json',
        variables: { context: '流程上下文数据' },
        guardrails: { requireEvidence: true, noHallucination: true },
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        templateSource: 'PUBLIC',
        isActive: true,
      },
    });

    await prisma.agentProfile.upsert({
      where: { agentCode: a.agentCode },
      update: {
        agentName: a.agentName,
        roleType: a.roleType,
        objective: a.objective,
        modelConfigKey: 'DEFAULT',
        agentPromptCode: a.promptCode,
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        timeoutSeconds: 30,
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
      create: {
        agentCode: a.agentCode,
        agentName: a.agentName,
        roleType: a.roleType,
        objective: a.objective,
        modelConfigKey: 'DEFAULT',
        agentPromptCode: a.promptCode,
        memoryPolicy: 'none',
        guardrails: { requireEvidence: true, noHallucination: true },
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        timeoutSeconds: 30,
        retryPolicy: { retryCount: 1, retryIntervalSeconds: 2 },
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
    });
    agentCount++;
  }
  console.log(`  ✅ AgentPromptTemplate + AgentProfile × ${agentCount}`);

  console.log('\n🎉 对话工作流 seed 完成！');
}

seedConversationalWorkflow()
  .catch((error) => {
    console.error('❌ 对话工作流 seed 失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
