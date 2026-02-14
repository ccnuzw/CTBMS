import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedParameterItem = {
  paramCode: string;
  paramName: string;
  paramType: string;
  unit?: string;
  value: unknown;
  defaultValue?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  scopeLevel: string;
  scopeValue?: string | null;
  inheritedFrom?: string;
  source?: string;
  changeReason?: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
};

type SeedParameterSet = {
  setCode: string;
  name: string;
  description: string;
  items: SeedParameterItem[];
};

const PARAMETER_SETS: SeedParameterSet[] = [
  {
    setCode: 'BASELINE_SET',
    name: '基础运行参数集',
    description: '默认可运行参数模板，覆盖风控、规则评估与计算节点。',
    items: [
      {
        paramCode: 'SIGNAL_BLOCK_RISK_GTE',
        paramName: '风险阻断阈值',
        paramType: 'enum',
        value: 'HIGH',
        defaultValue: 'HIGH',
        scopeLevel: 'GLOBAL',
        source: 'SYSTEM_SEED',
      },
      {
        paramCode: 'priceSpread',
        paramName: '价差基准',
        paramType: 'number',
        unit: 'CNY_PER_TON',
        value: 180,
        defaultValue: 160,
        minValue: 0,
        maxValue: 500,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'inventoryPressure',
        paramName: '库存压力系数',
        paramType: 'number',
        value: 0.72,
        defaultValue: 0.7,
        minValue: 0,
        maxValue: 2,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'volatilityFactor',
        paramName: '波动放大系数',
        paramType: 'number',
        value: 1.15,
        defaultValue: 1,
        minValue: 0.1,
        maxValue: 3,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'traderConfidence',
        paramName: '交易员置信度',
        paramType: 'number',
        value: 68,
        defaultValue: 60,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'executionWindowOpen',
        paramName: '执行窗口开启',
        paramType: 'boolean',
        value: true,
        defaultValue: true,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'volatilityTolerance',
        paramName: '波动容忍度',
        paramType: 'number',
        value: 0.65,
        defaultValue: 0.6,
        minValue: 0,
        maxValue: 1,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'policyShockScore',
        paramName: '政策冲击得分',
        paramType: 'number',
        value: 35,
        defaultValue: 35,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'freightSpikePct',
        paramName: '运费波动百分比',
        paramType: 'number',
        unit: 'PERCENT',
        value: 8,
        defaultValue: 8,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'marginUsagePct',
        paramName: '保证金占用率',
        paramType: 'number',
        unit: 'PERCENT',
        value: 62,
        defaultValue: 60,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'complianceStatus',
        paramName: '合规状态',
        paramType: 'string',
        value: 'GREEN',
        defaultValue: 'GREEN',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'emergencyStop',
        paramName: '紧急停机',
        paramType: 'boolean',
        value: false,
        defaultValue: false,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'volatilityFactor',
        paramName: '波动放大系数（华北）',
        paramType: 'number',
        value: 1.28,
        scopeLevel: 'REGION',
        scopeValue: 'NORTH_CHINA',
        inheritedFrom: 'GLOBAL:volatilityFactor',
      },
      {
        paramCode: 'priceSpread',
        paramName: '价差基准（北粮南运）',
        paramType: 'number',
        unit: 'CNY_PER_TON',
        value: 230,
        scopeLevel: 'ROUTE',
        scopeValue: 'NORTH_TO_SOUTH',
        inheritedFrom: 'GLOBAL:priceSpread',
      },
    ],
  },
  {
    setCode: 'VOLATILE_SET',
    name: '波动行情参数集',
    description: '高波动场景下的参数覆盖模板。',
    items: [
      {
        paramCode: 'SIGNAL_BLOCK_RISK_GTE',
        paramName: '风险阻断阈值（波动）',
        paramType: 'enum',
        value: 'MEDIUM',
        defaultValue: 'HIGH',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'volatilityFactor',
        paramName: '波动放大系数（波动）',
        paramType: 'number',
        value: 1.45,
        defaultValue: 1.2,
        minValue: 0.1,
        maxValue: 4,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'inventoryPressure',
        paramName: '库存压力系数（波动）',
        paramType: 'number',
        value: 0.88,
        defaultValue: 0.8,
        minValue: 0,
        maxValue: 2,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'policyShockScore',
        paramName: '政策冲击得分（波动）',
        paramType: 'number',
        value: 72,
        defaultValue: 60,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'freightSpikePct',
        paramName: '运费波动百分比（波动）',
        paramType: 'number',
        value: 15,
        defaultValue: 12,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'volatilityFactor',
        paramName: '波动放大系数（北粮南运）',
        paramType: 'number',
        value: 1.62,
        scopeLevel: 'ROUTE',
        scopeValue: 'NORTH_TO_SOUTH',
        inheritedFrom: 'GLOBAL:volatilityFactor',
      },
      {
        paramCode: 'marginUsagePct',
        paramName: '保证金占用率（波动）',
        paramType: 'number',
        unit: 'PERCENT',
        value: 78,
        defaultValue: 70,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
    ],
  },
  {
    setCode: 'POLICY_SHOCK_SET',
    name: '政策冲击参数集',
    description: '政策突发场景的参数模板，偏防守。',
    items: [
      {
        paramCode: 'SIGNAL_BLOCK_RISK_GTE',
        paramName: '风险阻断阈值（政策）',
        paramType: 'enum',
        value: 'MEDIUM',
        defaultValue: 'HIGH',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'policyShockScore',
        paramName: '政策冲击得分',
        paramType: 'number',
        value: 90,
        defaultValue: 80,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'policyShockScore',
        paramName: '政策冲击得分（华北）',
        paramType: 'number',
        value: 95,
        scopeLevel: 'REGION',
        scopeValue: 'NORTH_CHINA',
        inheritedFrom: 'GLOBAL:policyShockScore',
      },
      {
        paramCode: 'complianceStatus',
        paramName: '合规状态（政策）',
        paramType: 'string',
        value: 'YELLOW',
        defaultValue: 'GREEN',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'riskOverrideAction',
        paramName: '风险覆盖动作',
        paramType: 'string',
        value: 'REDUCE',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'emergencyStop',
        paramName: '紧急停机（激进策略）',
        paramType: 'boolean',
        value: true,
        scopeLevel: 'STRATEGY',
        scopeValue: 'AGGRESSIVE',
      },
      {
        paramCode: 'policyWindowHours',
        paramName: '政策观察窗口小时数',
        paramType: 'number',
        unit: 'HOUR',
        value: 48,
        defaultValue: 24,
        minValue: 1,
        maxValue: 240,
        scopeLevel: 'GLOBAL',
      },
    ],
  },
  {
    setCode: 'TRADER_EXPERIENCE_SET',
    name: '交易员经验参数集',
    description: '按策略与经验等级调整执行强度。',
    items: [
      {
        paramCode: 'traderConfidence',
        paramName: '交易员置信度（日内）',
        paramType: 'number',
        value: 74,
        defaultValue: 65,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'STRATEGY',
        scopeValue: 'DAY_TRADE',
      },
      {
        paramCode: 'traderConfidence',
        paramName: '交易员置信度（波段）',
        paramType: 'number',
        value: 66,
        defaultValue: 60,
        minValue: 0,
        maxValue: 100,
        scopeLevel: 'STRATEGY',
        scopeValue: 'SWING',
      },
      {
        paramCode: 'volatilityTolerance',
        paramName: '波动容忍度（日内）',
        paramType: 'number',
        value: 0.75,
        defaultValue: 0.65,
        minValue: 0,
        maxValue: 1,
        scopeLevel: 'STRATEGY',
        scopeValue: 'DAY_TRADE',
      },
      {
        paramCode: 'volatilityTolerance',
        paramName: '波动容忍度（保守）',
        paramType: 'number',
        value: 0.45,
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        scopeLevel: 'STRATEGY',
        scopeValue: 'CONSERVATIVE',
      },
      {
        paramCode: 'executionCadenceMin',
        paramName: '执行节奏（分钟）',
        paramType: 'number',
        unit: 'MINUTE',
        value: 15,
        defaultValue: 30,
        minValue: 1,
        maxValue: 240,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'SIGNAL_BLOCK_RISK_GTE',
        paramName: '风险阻断阈值（激进）',
        paramType: 'enum',
        value: 'MEDIUM',
        defaultValue: 'HIGH',
        scopeLevel: 'STRATEGY',
        scopeValue: 'AGGRESSIVE',
      },
      {
        paramCode: 'SIGNAL_BLOCK_RISK_GTE',
        paramName: '风险阻断阈值（保守）',
        paramType: 'enum',
        value: 'HIGH',
        defaultValue: 'HIGH',
        scopeLevel: 'STRATEGY',
        scopeValue: 'CONSERVATIVE',
      },
      {
        paramCode: 'executionWindowOpen',
        paramName: '执行窗口开启',
        paramType: 'boolean',
        value: true,
        defaultValue: true,
        scopeLevel: 'GLOBAL',
      },
    ],
  },
];

async function seedParameterSets() {
  console.log('🌱 开始播种参数包与参数项...');

  for (const set of PARAMETER_SETS) {
    const savedSet = await prisma.parameterSet.upsert({
      where: {
        setCode: set.setCode,
      },
      update: {
        name: set.name,
        description: set.description,
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
      create: {
        setCode: set.setCode,
        name: set.name,
        description: set.description,
        templateSource: 'PUBLIC',
        isActive: true,
        version: 2,
      },
    });

    const itemKeys = set.items.map(
      (item) => `${item.paramCode}::${item.scopeLevel}::${item.scopeValue ?? ''}`,
    );

    const existingItems = await prisma.parameterItem.findMany({
      where: {
        parameterSetId: savedSet.id,
      },
      select: {
        id: true,
        paramCode: true,
        scopeLevel: true,
        scopeValue: true,
      },
    });

    const staleItemIds = existingItems
      .filter(
        (item) =>
          !itemKeys.includes(`${item.paramCode}::${item.scopeLevel}::${item.scopeValue ?? ''}`),
      )
      .map((item) => item.id);

    if (staleItemIds.length > 0) {
      await prisma.parameterItem.updateMany({
        where: {
          id: {
            in: staleItemIds,
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    for (const item of set.items) {
      const existingItem = await prisma.parameterItem.findFirst({
        where: {
          parameterSetId: savedSet.id,
          paramCode: item.paramCode,
          scopeLevel: item.scopeLevel,
          ...(item.scopeValue === null || item.scopeValue === undefined
            ? { scopeValue: null }
            : { scopeValue: item.scopeValue }),
        },
      });

      const payload = {
        paramName: item.paramName,
        paramType: item.paramType,
        unit: item.unit,
        value: item.value as never,
        defaultValue: item.defaultValue as never,
        minValue: item.minValue as never,
        maxValue: item.maxValue as never,
        scopeLevel: item.scopeLevel,
        scopeValue: item.scopeValue ?? null,
        inheritedFrom: item.inheritedFrom,
        source: item.source ?? 'SYSTEM_SEED',
        changeReason: item.changeReason ?? '初始化内置参数',
        ownerType: 'SYSTEM' as const,
        itemSource: 'PUBLIC' as const,
        version: 2,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        isActive: true,
      };

      if (existingItem) {
        await prisma.parameterItem.update({
          where: { id: existingItem.id },
          data: payload,
        });
        continue;
      }

      await prisma.parameterItem.create({
        data: {
          parameterSetId: savedSet.id,
          paramCode: item.paramCode,
          ...payload,
        },
      });
    }
  }

  console.log(`✅ 参数包播种完成，共 ${PARAMETER_SETS.length} 套`);
}

seedParameterSets()
  .catch((error) => {
    console.error('❌ 参数包播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
