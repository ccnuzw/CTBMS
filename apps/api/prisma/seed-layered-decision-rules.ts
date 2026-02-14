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
    description: '默认层规则，保障最小可执行风控校验。',
    ruleLayer: 'DEFAULT',
    applicableScopes: ['CORN'],
    priority: 100,
    rules: [
      {
        ruleCode: 'hit_score_floor',
        name: '命中分最低阈值',
        description: '命中分过低时触发保守策略。',
        fieldPath: 'hitScore',
        operator: 'GTE',
        expectedValue: 55,
        weight: 4,
        priority: 100,
      },
      {
        ruleCode: 'risk_level_not_extreme',
        name: '风险等级不得为极高',
        fieldPath: 'riskLevel',
        operator: 'NOT_IN',
        expectedValue: ['EXTREME'],
        weight: 5,
        priority: 90,
      },
      {
        ruleCode: 'confidence_floor',
        name: '置信度最低阈值',
        fieldPath: 'confidence',
        operator: 'GTE',
        expectedValue: 50,
        weight: 3,
        priority: 80,
      },
    ],
  },
  {
    rulePackCode: 'corn_industry_rule_pack_v1',
    name: '玉米行业规则包 v1',
    description: '行业层规则，聚焦库存、运费与政策冲击。',
    ruleLayer: 'INDUSTRY',
    applicableScopes: ['CORN', 'NORTH_CHINA'],
    priority: 120,
    rules: [
      {
        ruleCode: 'inventory_pressure_guard',
        name: '库存压力阈值',
        fieldPath: 'inventoryPressure',
        operator: 'LTE',
        expectedValue: 0.92,
        weight: 4,
        priority: 100,
      },
      {
        ruleCode: 'freight_spike_guard',
        name: '运费波动阈值',
        fieldPath: 'freightSpikePct',
        operator: 'LTE',
        expectedValue: 12,
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
    description: '经验层规则，结合交易员执行与操作习惯。',
    ruleLayer: 'EXPERIENCE',
    applicableScopes: ['CORN', 'DAY_TRADE', 'SWING'],
    priority: 140,
    rules: [
      {
        ruleCode: 'trader_confidence_floor',
        name: '交易员置信度阈值',
        fieldPath: 'traderConfidence',
        operator: 'GTE',
        expectedValue: 55,
        weight: 4,
        priority: 100,
      },
      {
        ruleCode: 'execution_window_guard',
        name: '执行窗口必须开启',
        fieldPath: 'executionWindowOpen',
        operator: 'EQ',
        expectedValue: true,
        weight: 3,
        priority: 90,
      },
      {
        ruleCode: 'volatility_tolerance_floor',
        name: '波动容忍度阈值',
        fieldPath: 'volatilityTolerance',
        operator: 'GTE',
        expectedValue: 0.6,
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
        ruleCode: 'emergency_stop_guard',
        name: '紧急停机开关',
        fieldPath: 'emergencyStop',
        operator: 'EQ',
        expectedValue: false,
        weight: 10,
        priority: 200,
      },
      {
        ruleCode: 'compliance_status_guard',
        name: '合规状态校验',
        fieldPath: 'complianceStatus',
        operator: 'IN',
        expectedValue: ['GREEN', 'YELLOW'],
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
        version: 2,
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
        version: 2,
        priority: pack.priority,
      },
    });

    const ruleCodes = pack.rules.map((rule) => rule.ruleCode);
    await prisma.decisionRule.updateMany({
      where: {
        rulePackId: savedPack.id,
        ruleCode: {
          notIn: ruleCodes,
        },
      },
      data: {
        isActive: false,
      },
    });

    for (const rule of pack.rules) {
      await prisma.decisionRule.upsert({
        where: {
          rulePackId_ruleCode: {
            rulePackId: savedPack.id,
            ruleCode: rule.ruleCode,
          },
        },
        update: {
          name: rule.name,
          description: rule.description,
          fieldPath: rule.fieldPath,
          operator: rule.operator,
          expectedValue: rule.expectedValue,
          weight: rule.weight,
          priority: rule.priority,
          isActive: true,
        },
        create: {
          rulePackId: savedPack.id,
          ruleCode: rule.ruleCode,
          name: rule.name,
          description: rule.description,
          fieldPath: rule.fieldPath,
          operator: rule.operator,
          expectedValue: rule.expectedValue,
          weight: rule.weight,
          priority: rule.priority,
          isActive: true,
        },
      });
    }
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
