import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AGENT_ROLE_TEMPLATES: Array<{
  roleType: string;
  promptCode: string;
  promptName: string;
  agentCode: string;
  agentName: string;
  objective: string;
}> = [
    {
      roleType: 'ANALYST',
      promptCode: 'MARKET_ANALYST_SYSTEM_V1',
      promptName: '市场分析师系统提示词',
      agentCode: 'MARKET_ANALYST_AGENT_V1',
      agentName: '市场分析智能体',
      objective: '识别市场情绪变化与关键事件，输出可追溯证据链。',
    },
    {
      roleType: 'COST_SPREAD',
      promptCode: 'COST_SPREAD_SYSTEM_V1',
      promptName: '成本价差分析系统提示词',
      agentCode: 'COST_SPREAD_AGENT_V1',
      agentName: '成本价差智能体',
      objective: '计算成本、运费、价差与套利空间，并给出可解释结论。',
    },
    {
      roleType: 'FUTURES_EXPERT',
      promptCode: 'FUTURES_EXPERT_SYSTEM_V1',
      promptName: '期货专家系统提示词',
      agentCode: 'FUTURES_EXPERT_AGENT_V1',
      agentName: '期货专家智能体',
      objective: '从基差与套保视角评估期货风险收益比。',
    },
    {
      roleType: 'SPOT_EXPERT',
      promptCode: 'SPOT_EXPERT_SYSTEM_V1',
      promptName: '现货专家系统提示词',
      agentCode: 'SPOT_EXPERT_AGENT_V1',
      agentName: '现货专家智能体',
      objective: '评估现货供需结构、流通效率与区域价格弹性。',
    },
    {
      roleType: 'LOGISTICS_EXPERT',
      promptCode: 'LOGISTICS_EXPERT_SYSTEM_V1',
      promptName: '物流专家系统提示词',
      agentCode: 'LOGISTICS_EXPERT_AGENT_V1',
      agentName: '物流专家智能体',
      objective: '识别物流链路瓶颈和运费异常，给出可行动建议。',
    },
    {
      roleType: 'RISK_OFFICER',
      promptCode: 'RISK_OFFICER_SYSTEM_V1',
      promptName: '风控官系统提示词',
      agentCode: 'RISK_OFFICER_AGENT_V1',
      agentName: '风控官智能体',
      objective: '基于硬性风险条款做阻断或降级建议。',
    },
    {
      roleType: 'EXECUTION_ADVISOR',
      promptCode: 'EXECUTION_ADVISOR_SYSTEM_V1',
      promptName: '执行顾问系统提示词',
      agentCode: 'EXECUTION_ADVISOR_AGENT_V1',
      agentName: '执行顾问智能体',
      objective: '将多方观点转为可执行的交易语言与行动列表。',
    },
    {
      roleType: 'JUDGE',
      promptCode: 'JUDGE_SYSTEM_V1',
      promptName: '裁判系统提示词',
      agentCode: 'JUDGE_AGENT_V1',
      agentName: '裁判智能体',
      objective: '整合多角色分歧，给出最终裁决与关键依据。',
    },
    {
      roleType: 'RISK_INSPECTOR',
      promptCode: 'RISK_INSPECTOR_SYSTEM_V1',
      promptName: '风险审查员系统提示词',
      agentCode: 'RISK_INSPECTOR_V1',
      agentName: '风险审查智能体',
      objective: '快速扫描数据中的合规性风险与异常指标。',
    },
    {
      roleType: 'SENTIMENT_ANALYST',
      promptCode: 'SENTIMENT_ANALYST_SYSTEM_V1',
      promptName: '舆情分析师系统提示词',
      agentCode: 'SENTIMENT_ANALYST_V1',
      agentName: '舆情分析智能体',
      objective: '分析市场新闻与社交媒体情绪，判断市场热度。',
    },
    {
      roleType: 'POLICY_ANALYST',
      promptCode: 'POLICY_ANALYST_SYSTEM_V1',
      promptName: '政策分析师系统提示词',
      agentCode: 'POLICY_ANALYST_AGENT_V1',
      agentName: '政策分析智能体',
      objective: '评估政策信号与监管动态对价格、基差和执行窗口的影响。',
    },
    {
      roleType: 'INVENTORY_ANALYST',
      promptCode: 'INVENTORY_ANALYST_SYSTEM_V1',
      promptName: '库存分析师系统提示词',
      agentCode: 'INVENTORY_ANALYST_AGENT_V1',
      agentName: '库存分析智能体',
      objective: '识别库存结构变化、去库节奏与区域供需错配风险。',
    },
    {
      roleType: 'BASIS_ARBITRAGE',
      promptCode: 'BASIS_ARBITRAGE_SYSTEM_V1',
      promptName: '基差套利系统提示词',
      agentCode: 'BASIS_ARBITRAGE_AGENT_V1',
      agentName: '基差套利智能体',
      objective: '识别基差异常与套利窗口，输出可执行的套保与套利建议。',
    },
    {
      roleType: 'COMPLIANCE_GUARD',
      promptCode: 'COMPLIANCE_GUARD_SYSTEM_V1',
      promptName: '合规守门系统提示词',
      agentCode: 'COMPLIANCE_GUARD_AGENT_V1',
      agentName: '合规守门智能体',
      objective: '识别交易建议中的合规风险与监管红线，给出阻断或降级建议。',
    },
    {
      roleType: 'POSITION_SIZING',
      promptCode: 'POSITION_SIZING_SYSTEM_V1',
      promptName: '仓位管理系统提示词',
      agentCode: 'POSITION_SIZING_AGENT_V1',
      agentName: '仓位管理智能体',
      objective: '根据波动、保证金占用和风险预算给出仓位与分批执行建议。',
    },
    {
      roleType: 'EVENT_IMPACT',
      promptCode: 'EVENT_IMPACT_SYSTEM_V1',
      promptName: '事件冲击系统提示词',
      agentCode: 'EVENT_IMPACT_AGENT_V1',
      agentName: '事件冲击智能体',
      objective: '评估突发事件对供需、物流和情绪的冲击路径与时效窗口。',
    },
    {
      roleType: 'CASHFLOW_RISK',
      promptCode: 'CASHFLOW_RISK_SYSTEM_V1',
      promptName: '资金流风险系统提示词',
      agentCode: 'CASHFLOW_RISK_AGENT_V1',
      agentName: '资金流风险智能体',
      objective: '评估保证金压力、现金流稳定性与回撤承受能力。',
    },
    {
      roleType: 'SCENARIO_STRESS',
      promptCode: 'SCENARIO_STRESS_SYSTEM_V1',
      promptName: '情景压力测试系统提示词',
      agentCode: 'SCENARIO_STRESS_AGENT_V1',
      agentName: '情景压力测试智能体',
      objective: '构建多情景压力测试并输出关键脆弱点与应对动作。',
    },
  ];

async function seedAgentRoleTemplates() {
  console.log('🌱 开始播种 Agent 角色模板与配置...');

  for (const item of AGENT_ROLE_TEMPLATES) {
    const strictSystemPrompt = [
      `你是${item.agentName}，目标：${item.objective}`,
      '你必须输出严格 JSON（UTF-8），且只能输出一个 JSON 对象，不允许任何解释、前后缀、markdown、代码块。',
      'JSON 必须包含字段：',
      '- thesis: string，核心结论（不超过120字）',
      '- confidence: number，范围 0 到 1',
      '- evidence: string[]，至少 2 条，每条不超过80字',
      '- action: "BUY" | "SELL" | "HOLD" | "REDUCE" | "REVIEW_ONLY"',
      '- riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME"',
      '如果信息不足，也必须按上述结构返回，并在 thesis 中明确“信息不足”。',
    ].join('\n');

    const strictUserPrompt = [
      '以下是流程上下文(JSON)：',
      '{{context}}',
      '',
      '请基于上下文完成分析并直接返回 JSON 对象。',
    ].join('\n');

    await prisma.agentPromptTemplate.upsert({
      where: { promptCode: item.promptCode },
      update: {
        name: item.promptName,
        roleType: item.roleType,
        systemPrompt: strictSystemPrompt,
        userPromptTemplate: strictUserPrompt,
        outputFormat: 'json',
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        templateSource: 'PUBLIC',
        isActive: true,
      },
      create: {
        promptCode: item.promptCode,
        name: item.promptName,
        roleType: item.roleType,
        systemPrompt: strictSystemPrompt,
        userPromptTemplate: strictUserPrompt,
        outputFormat: 'json',
        variables: {
          context: '流程上下文数据',
        },
        guardrails: {
          requireEvidence: true,
          noHallucination: true,
        },
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        templateSource: 'PUBLIC',
        isActive: true,
      },
    });

    await prisma.agentProfile.upsert({
      where: { agentCode: item.agentCode },
      update: {
        agentName: item.agentName,
        roleType: item.roleType,
        objective: item.objective,
        modelConfigKey: 'DEFAULT',
        agentPromptCode: item.promptCode,
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        timeoutMs: 30000,
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
      create: {
        agentCode: item.agentCode,
        agentName: item.agentName,
        roleType: item.roleType,
        objective: item.objective,
        modelConfigKey: 'DEFAULT',
        agentPromptCode: item.promptCode,
        memoryPolicy: 'none',
        toolPolicy: {
          allowedTools: ['market-intel', 'workflow-context'],
        },
        guardrails: {
          requireEvidence: true,
          noHallucination: true,
        },
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        timeoutMs: 30000,
        retryPolicy: {
          retryCount: 1,
          retryBackoffMs: 2000,
        },
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
    });
  }

  console.log(`✅ Agent 角色模板播种完成，共 ${AGENT_ROLE_TEMPLATES.length} 套`);
}

seedAgentRoleTemplates()
  .catch((error) => {
    console.error('❌ Agent 角色模板播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
