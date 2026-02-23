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

  const conditionAST = {
    root: {
      logic: 'AND',
      children: [
        {
          id: 'parsed_thesis_exists',
          fieldPath: 'parsed.thesis',
          operator: 'EXISTS',
          expectedValue: true,
        },
        {
          id: 'parsed_confidence_floor',
          fieldPath: 'parsed.confidence',
          operator: 'GTE',
          expectedValue: 0.55,
        },
        {
          id: 'parsed_risk_level_not_extreme',
          fieldPath: 'parsed.riskLevel',
          operator: 'NOT_IN',
          expectedValue: ['EXTREME'],
        },
        {
          id: 'parsed_evidence_exists',
          fieldPath: 'parsed.evidence',
          operator: 'EXISTS',
          expectedValue: true,
        },
      ],
    },
  };

  await prisma.decisionRulePack.update({
    where: { id: pack.id },
    data: {
      conditionAST,
    },
  });

  // Since we migrated to AST, we will deactivate old flat rules.
  await prisma.decisionRule.updateMany({
    where: {
      rulePackId: pack.id,
    },
    data: {
      isActive: false,
    },
  });

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
