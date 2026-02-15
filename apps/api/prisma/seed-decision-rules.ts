import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RULE_PACK_CODE = 'corn_baseline_rule_pack_v1';

async function seedDecisionRules() {
  console.log('🌱 开始播种决策规则包 (Decision Rule Pack Seed)...');

  const pack = await prisma.decisionRulePack.upsert({
    where: { rulePackCode: RULE_PACK_CODE },
    update: {
      name: '玉米基线规则包 v1',
      description: '用于 rule-pack-eval 的标准基线包（与 Agent 结构化输出对齐）',
      applicableScopes: ['CORN'],
      ruleLayer: 'DEFAULT',
      ownerType: 'SYSTEM',
      templateSource: 'PUBLIC',
      isActive: true,
      version: 3,
      priority: 100,
    },
    create: {
      rulePackCode: RULE_PACK_CODE,
      name: '玉米基线规则包 v1',
      description: '用于 rule-pack-eval 的标准基线包（与 Agent 结构化输出对齐）',
      applicableScopes: ['CORN'],
      ruleLayer: 'DEFAULT',
      ownerType: 'SYSTEM',
      templateSource: 'PUBLIC',
      isActive: true,
      version: 3,
      priority: 100,
    },
  });

  const rules = [
    {
      ruleCode: 'parsed_thesis_exists',
      name: '结构化结论存在',
      fieldPath: 'parsed.thesis',
      operator: 'EXISTS',
      expectedValue: true,
      weight: 4,
      priority: 120,
    },
    {
      ruleCode: 'parsed_confidence_floor',
      name: '结构化置信度阈值',
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
      name: '结构化证据列表存在',
      fieldPath: 'parsed.evidence',
      operator: 'EXISTS',
      expectedValue: true,
      weight: 3,
      priority: 90,
    },
  ] as const;

  const activeRuleCodes = rules.map((rule) => rule.ruleCode);
  await prisma.decisionRule.updateMany({
    where: {
      rulePackId: pack.id,
      ruleCode: {
        notIn: activeRuleCodes,
      },
    },
    data: {
      isActive: false,
    },
  });

  for (const rule of rules) {
    await prisma.decisionRule.upsert({
      where: {
        rulePackId_ruleCode: {
          rulePackId: pack.id,
          ruleCode: rule.ruleCode,
        },
      },
      update: {
        name: rule.name,
        fieldPath: rule.fieldPath,
        operator: rule.operator,
        expectedValue: rule.expectedValue,
        weight: rule.weight,
        priority: rule.priority,
        isActive: true,
      },
      create: {
        rulePackId: pack.id,
        ruleCode: rule.ruleCode,
        name: rule.name,
        fieldPath: rule.fieldPath,
        operator: rule.operator,
        expectedValue: rule.expectedValue,
        weight: rule.weight,
        priority: rule.priority,
        isActive: true,
      },
    });
  }

  console.log(`✅ 决策规则包已更新: ${RULE_PACK_CODE}`);
}

seedDecisionRules()
  .catch((error) => {
    console.error('❌ 决策规则包播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
