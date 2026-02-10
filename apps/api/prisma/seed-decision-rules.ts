import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RULE_PACK_CODE = 'corn_baseline_rule_pack_v1';

async function seedDecisionRules() {
    console.log('🌱 开始播种决策规则包 (Decision Rule Pack Seed)...');

    const pack = await prisma.decisionRulePack.upsert({
        where: { rulePackCode: RULE_PACK_CODE },
        update: {
            name: '玉米基线规则包 v1',
            description: '用于工作流 rule-pack-eval 节点的最小可用规则包',
            templateSource: 'PUBLIC',
            isActive: true,
            priority: 100,
        },
        create: {
            rulePackCode: RULE_PACK_CODE,
            name: '玉米基线规则包 v1',
            description: '用于工作流 rule-pack-eval 节点的最小可用规则包',
            templateSource: 'PUBLIC',
            isActive: true,
            priority: 100,
        },
    });

    const rules = [
        {
            ruleCode: 'price_confidence_min',
            name: '置信度最低阈值',
            fieldPath: 'confidence',
            operator: 'GTE',
            expectedValue: 60,
            weight: 3,
            priority: 100,
        },
        {
            ruleCode: 'risk_score_upper_bound',
            name: '风险分不得过高',
            fieldPath: 'riskScore',
            operator: 'LTE',
            expectedValue: 75,
            weight: 4,
            priority: 90,
        },
        {
            ruleCode: 'signal_direction_contains_bullish',
            name: '信号方向包含 bullish',
            fieldPath: 'signalTags',
            operator: 'CONTAINS',
            expectedValue: 'bullish',
            weight: 2,
            priority: 80,
        },
    ] as const;

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
