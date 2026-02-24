import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedRule = {
  ruleCode: string;
  name: string;
  description?: string;
  fieldPath: string;
  operator: string;
  expectedValue: Prisma.InputJsonValue;
  weight: number;
  priority: number;
};

type SeedRulePack = {
  rulePackCode: string;
  name: string;
  description: string;
  ruleLayer: string;
  applicableScopes: string[];
  priority: number;
  rules: SeedRule[];
};

const RULE_PACKS: SeedRulePack[] = [
  {
    rulePackCode: 'corn_baseline_rule_pack_v1',
    name: '玉米基础规则包 v1',
    description: '默认层规则，面向结构化 Agent 输出的首层质量校验。',
    ruleLayer: 'DEFAULT',
    applicableScopes: ['CORN'],
    priority: 100,
    rules: [
      {
        ruleCode: 'parsed_thesis_exists',
        name: '结构化结论存在',
        description: '必须返回结构化 thesis 字段。',
        fieldPath: 'parsed.thesis',
        operator: 'EXISTS',
        expectedValue: true,
        weight: 4,
        priority: 120,
      },
      {
        ruleCode: 'parsed_confidence_floor',
        name: '结构化置信度阈值',
        description: '结构化 confidence 低于阈值时判定命中不足。',
        fieldPath: 'parsed.confidence',
        operator: 'GTE',
        expectedValue: 0.55,
        weight: 5,
        priority: 110,
      },
      {
        ruleCode: 'parsed_risk_level_not_extreme',
        name: '结构化风险等级不得为极高',
        fieldPath: 'parsed.riskLevel',
        operator: 'NOT_IN',
        expectedValue: ['EXTREME'],
        weight: 6,
        priority: 100,
      },
      {
        ruleCode: 'parsed_evidence_exists',
        name: '结构化证据存在',
        fieldPath: 'parsed.evidence',
        operator: 'EXISTS',
        expectedValue: true,
        weight: 3,
        priority: 90,
      },
    ],
  },
  {
    rulePackCode: 'corn_industry_rule_pack_v1',
    name: '玉米行业规则包 v1',
    description: '行业层规则，聚焦数据采集质量与事件波动约束。',
    ruleLayer: 'INDUSTRY',
    applicableScopes: ['CORN', 'NORTH_CHINA'],
    priority: 120,
    rules: [
      {
        ruleCode: 'record_count_guard',
        name: '采集记录数量阈值',
        fieldPath: 'recordCount',
        operator: 'GTE',
        expectedValue: 1,
        weight: 4,
        priority: 100,
      },
      {
        ruleCode: 'data_fresh_guard',
        name: '数据新鲜度校验',
        fieldPath: 'isFresh',
        operator: 'EQ',
        expectedValue: true,
        weight: 3,
        priority: 90,
      },
      {
        ruleCode: 'policy_shock_guard',
        name: '政策冲击阈值',
        fieldPath: 'policyShockScore',
        operator: 'LTE',
        expectedValue: 85,
        weight: 5,
        priority: 80,
      },
    ],
  },
  {
    rulePackCode: 'corn_experience_rule_pack_v1',
    name: '玉米经验规则包 v1',
    description: '经验层规则，聚焦执行纪律与策略一致性。',
    ruleLayer: 'EXPERIENCE',
    applicableScopes: ['CORN', 'DAY_TRADE', 'SWING'],
    priority: 140,
    rules: [
      {
        ruleCode: 'execution_window_guard',
        name: '执行窗口必须开启',
        fieldPath: 'executionWindowOpen',
        operator: 'EQ',
        expectedValue: true,
        weight: 4,
        priority: 100,
      },
      {
        ruleCode: 'volatility_tolerance_floor',
        name: '波动容忍度阈值',
        fieldPath: 'volatilityTolerance',
        operator: 'GTE',
        expectedValue: 0.6,
        weight: 3,
        priority: 90,
      },
      {
        ruleCode: 'trader_confidence_floor',
        name: '交易员置信度阈值',
        fieldPath: 'traderConfidence',
        operator: 'GTE',
        expectedValue: 55,
        weight: 3,
        priority: 80,
      },
    ],
  },
  {
    rulePackCode: 'corn_runtime_override_rule_pack_v1',
    name: '玉米运行时覆盖规则包 v1',
    description: '运行时覆盖层规则，优先处理紧急停机与合规信号。',
    ruleLayer: 'RUNTIME_OVERRIDE',
    applicableScopes: ['CORN', 'EMERGENCY'],
    priority: 200,
    rules: [
      {
        ruleCode: 'emergency_stop_not_triggered',
        name: '紧急停机不得触发',
        fieldPath: 'emergencyStop',
        operator: 'NOT_IN',
        expectedValue: [true, 'true', 1],
        weight: 10,
        priority: 200,
      },
      {
        ruleCode: 'compliance_not_blocked',
        name: '合规状态不得阻断',
        fieldPath: 'complianceStatus',
        operator: 'NOT_IN',
        expectedValue: ['RED', 'BLOCKED'],
        weight: 7,
        priority: 180,
      },
      {
        ruleCode: 'margin_usage_guard',
        name: '保证金占用阈值',
        fieldPath: 'marginUsagePct',
        operator: 'LTE',
        expectedValue: 85,
        weight: 6,
        priority: 160,
      },
    ],
  },
];

async function seedLayeredDecisionRules() {
  console.log('🌱 开始播种分层决策规则包...');

  for (const pack of RULE_PACKS) {
    const savedPack = await prisma.decisionRulePack.upsert({
      where: { rulePackCode: pack.rulePackCode },
      update: {
        name: pack.name,
        description: pack.description,
        applicableScopes: pack.applicableScopes,
        ruleLayer: pack.ruleLayer,
        ownerType: 'SYSTEM',
        templateSource: 'PUBLIC',
        isActive: true,
        version: 3,
        priority: pack.priority,
      },
      create: {
        rulePackCode: pack.rulePackCode,
        name: pack.name,
        description: pack.description,
        applicableScopes: pack.applicableScopes,
        ruleLayer: pack.ruleLayer,
        ownerType: 'SYSTEM',
        templateSource: 'PUBLIC',
        isActive: true,
        version: 3,
        priority: pack.priority,
      },
    });

    const conditionAST = {
      root: {
        logic: 'AND',
        children: pack.rules.map((rule) => ({
          id: rule.ruleCode,
          fieldPath: rule.fieldPath,
          operator: rule.operator,
          expectedValue: rule.expectedValue,
        })),
      },
    };

    await prisma.decisionRulePack.update({
      where: { id: savedPack.id },
      data: { conditionAST },
    });

    // Inactivate legacy flat rules
    await prisma.decisionRule.updateMany({
      where: {
        rulePackId: savedPack.id,
      },
      data: {
        isActive: false,
      },
    });
  }

  console.log(`✅ 分层决策规则包播种完成，共 ${RULE_PACKS.length} 个规则包`);
}

seedLayeredDecisionRules()
  .catch((error) => {
    console.error('❌ 分层决策规则包播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
