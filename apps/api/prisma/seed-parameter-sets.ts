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
  {
    setCode: 'WORKFLOW_RUNTIME_GUARDRAIL_SET',
    name: '工作流运行治理参数集',
    description: '面向真实联调与验收的运行治理参数模板。',
    items: [
      {
        paramCode: 'WORKFLOW_AGENT_STRICT_MODE',
        paramName: '智能体鉴权严格模式',
        paramType: 'boolean',
        value: false,
        defaultValue: false,
        scopeLevel: 'GLOBAL',
        source: 'SYSTEM_SEED',
        changeReason: '联调阶段可切换鉴权失败行为',
      },
      {
        paramCode: 'AGENT_MIN_CONFIDENCE',
        paramName: 'Agent 最小置信度',
        paramType: 'number',
        value: 0.55,
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'AGENT_MIN_EVIDENCE_COUNT',
        paramName: 'Agent 最小证据条数',
        paramType: 'number',
        value: 2,
        defaultValue: 2,
        minValue: 1,
        maxValue: 10,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'AGENT_NODE_TIMEOUT_MS',
        paramName: 'Agent 节点超时',
        paramType: 'number',
        unit: 'MILLISECOND',
        value: 45000,
        defaultValue: 30000,
        minValue: 5000,
        maxValue: 180000,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'AGENT_MAX_RETRY',
        paramName: 'Agent 最大重试次数',
        paramType: 'number',
        value: 1,
        defaultValue: 1,
        minValue: 0,
        maxValue: 5,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'DEBATE_CONSENSUS_THRESHOLD',
        paramName: '辩论共识阈值',
        paramType: 'number',
        value: 0.7,
        defaultValue: 0.68,
        minValue: 0.4,
        maxValue: 1,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'DEBATE_TIMEOUT_MS',
        paramName: '辩论节点超时',
        paramType: 'number',
        unit: 'MILLISECOND',
        value: 90000,
        defaultValue: 60000,
        minValue: 10000,
        maxValue: 300000,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'JUDGE_MIN_CONFIDENCE_FOR_ACTION',
        paramName: '裁判执行动作最低置信度',
        paramType: 'number',
        value: 0.5,
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'RISK_GATE_DEFAULT_DEGRADE_ACTION',
        paramName: '风险闸门默认降级动作',
        paramType: 'string',
        value: 'REVIEW_ONLY',
        defaultValue: 'REVIEW_ONLY',
        scopeLevel: 'GLOBAL',
      },
      {
        paramCode: 'WORKFLOW_RUN_MAX_PARALLEL_AGENTS',
        paramName: '工作流最大并行智能体数',
        paramType: 'number',
        value: 3,
        defaultValue: 3,
        minValue: 1,
        maxValue: 8,
        scopeLevel: 'GLOBAL',
      },
    ],
  },
  {
    setCode: 'DEBATE_SCENARIO_SET',
    name: '辩论制高点参数集',
    description: '提供多角色辩论论题与设定，面向辩论节点与裁判节点。',
    items: [
      {
        paramCode: 'debateTopic',
        paramName: '辩论主题',
        paramType: 'string',
        value: '近期纯碱现货上涨是否具有持续性？',
        defaultValue: '请分析当前市场的核心矛盾。',
        scopeLevel: 'GLOBAL',
        source: 'SYSTEM_SEED',
        changeReason: '用于测试前端快速触发组件',
      },
      {
        paramCode: 'debateRounds',
        paramName: '最大反驳轮次',
        paramType: 'number',
        value: 3,
        defaultValue: 2,
        minValue: 1,
        maxValue: 10,
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
        version: 3,
      },
      create: {
        setCode: set.setCode,
        name: set.name,
        description: set.description,
        templateSource: 'PUBLIC',
        isActive: true,
        version: 3,
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
        version: 3,
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
