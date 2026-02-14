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
];

async function seedAgentRoleTemplates() {
  console.log('🌱 开始播种 Agent 角色模板与配置...');

  for (const item of AGENT_ROLE_TEMPLATES) {
    await prisma.agentPromptTemplate.upsert({
      where: { promptCode: item.promptCode },
      update: {
        name: item.promptName,
        roleType: item.roleType,
        systemPrompt: `你是${item.agentName}。请围绕目标输出结构化结论。`,
        userPromptTemplate:
          '上下文:\n{{context}}\n\n请输出 thesis/confidence/evidence，并补充角色特定扩展字段。',
        outputFormat: 'json',
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        templateSource: 'PUBLIC',
        isActive: true,
      },
      create: {
        promptCode: item.promptCode,
        name: item.promptName,
        roleType: item.roleType,
        systemPrompt: `你是${item.agentName}。请围绕目标输出结构化结论。`,
        userPromptTemplate:
          '上下文:\n{{context}}\n\n请输出 thesis/confidence/evidence，并补充角色特定扩展字段。',
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
