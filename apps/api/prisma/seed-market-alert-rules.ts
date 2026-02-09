import { MarketAlertRuleType, MarketAlertSeverity, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedAlertRule = {
  seedKey: string;
  name: string;
  type: MarketAlertRuleType;
  threshold?: number;
  days?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
  severity: MarketAlertSeverity;
  priority: number;
  isActive: boolean;
};

const ALERT_RULE_SEEDS: SeedAlertRule[] = [
  {
    seedKey: 'SEED_ALERT_RULE_DAY_CHANGE_ABS_HIGH',
    name: '单日涨跌额高波动预警',
    type: MarketAlertRuleType.DAY_CHANGE_ABS,
    threshold: 35,
    severity: MarketAlertSeverity.HIGH,
    priority: 100,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_DAY_CHANGE_ABS_CRITICAL',
    name: '单日涨跌额极端波动预警',
    type: MarketAlertRuleType.DAY_CHANGE_ABS,
    threshold: 60,
    severity: MarketAlertSeverity.CRITICAL,
    priority: 120,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_DAY_CHANGE_PCT_MEDIUM',
    name: '单日涨跌幅波动预警',
    type: MarketAlertRuleType.DAY_CHANGE_PCT,
    threshold: 3.5,
    severity: MarketAlertSeverity.MEDIUM,
    priority: 80,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_DAY_CHANGE_PCT_HIGH',
    name: '单日涨跌幅高波动预警',
    type: MarketAlertRuleType.DAY_CHANGE_PCT,
    threshold: 6,
    severity: MarketAlertSeverity.HIGH,
    priority: 95,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_DEVIATION_FROM_MEAN_PCT',
    name: '偏离均值预警',
    type: MarketAlertRuleType.DEVIATION_FROM_MEAN_PCT,
    threshold: 5,
    severity: MarketAlertSeverity.MEDIUM,
    priority: 70,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_CONTINUOUS_UP_3D',
    name: '连续上涨3天预警',
    type: MarketAlertRuleType.CONTINUOUS_DAYS,
    days: 3,
    direction: 'UP',
    severity: MarketAlertSeverity.MEDIUM,
    priority: 60,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_CONTINUOUS_DOWN_3D',
    name: '连续下跌3天预警',
    type: MarketAlertRuleType.CONTINUOUS_DAYS,
    days: 3,
    direction: 'DOWN',
    severity: MarketAlertSeverity.HIGH,
    priority: 65,
    isActive: true,
  },
  {
    seedKey: 'SEED_ALERT_RULE_CONTINUOUS_BOTH_5D',
    name: '连续5天趋势预警',
    type: MarketAlertRuleType.CONTINUOUS_DAYS,
    days: 5,
    direction: 'BOTH',
    severity: MarketAlertSeverity.CRITICAL,
    priority: 90,
    isActive: true,
  },
];

async function main() {
  console.log('Start seeding market alert rules...');

  for (const rule of ALERT_RULE_SEEDS) {
    await prisma.marketAlertRule.upsert({
      where: { legacyRuleId: rule.seedKey },
      create: {
        name: rule.name,
        type: rule.type,
        threshold: rule.type === MarketAlertRuleType.CONTINUOUS_DAYS ? null : rule.threshold ?? null,
        days: rule.type === MarketAlertRuleType.CONTINUOUS_DAYS ? rule.days ?? null : null,
        direction: rule.direction ?? 'BOTH',
        severity: rule.severity,
        priority: rule.priority,
        isActive: rule.isActive,
        legacyRuleId: rule.seedKey,
      },
      update: {
        name: rule.name,
        type: rule.type,
        threshold: rule.type === MarketAlertRuleType.CONTINUOUS_DAYS ? null : rule.threshold ?? null,
        days: rule.type === MarketAlertRuleType.CONTINUOUS_DAYS ? rule.days ?? null : null,
        direction: rule.direction ?? 'BOTH',
        severity: rule.severity,
        priority: rule.priority,
        isActive: rule.isActive,
      },
    });
    console.log(`Upserted alert rule: ${rule.name}`);
  }

  const total = await prisma.marketAlertRule.count();
  console.log(`✅ Seeded ${ALERT_RULE_SEEDS.length} market alert rules (total rules: ${total}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
