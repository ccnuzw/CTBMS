import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

type SeedTriggerConfig = {
  workflowId: string;
  triggerType: 'MANUAL' | 'SCHEDULE' | 'API' | 'EVENT' | 'ON_DEMAND';
  name: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  cronConfig?: Record<string, unknown>;
  apiConfig?: Record<string, unknown>;
  eventConfig?: Record<string, unknown>;
  paramOverrides?: Record<string, unknown>;
  cronState?: 'IDLE' | 'SCHEDULED' | 'RUNNING' | 'PAUSED';
};

const TRIGGER_CONFIGS: SeedTriggerConfig[] = [
  {
    workflowId: 'quick_rule_guard_public_v1',
    triggerType: 'MANUAL',
    name: '快速风控手动触发',
    description: '用于即时触发快速规则风控流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      route: 'NORTH_TO_SOUTH',
      strategy: 'DAY_TRADE',
      context: {
        operator: 'SYSTEM_SEED',
      },
    },
  },
  {
    workflowId: 'quick_rule_guard_public_v1',
    triggerType: 'SCHEDULE',
    name: '每日开盘风控巡检',
    description: '工作日早盘自动运行快速规则风控流程。',
    status: 'ACTIVE',
    cronState: 'IDLE',
    cronConfig: {
      cronExpression: '0 9 * * 1-5',
      timezone: 'Asia/Shanghai',
      maxConcurrent: 1,
      catchUpMissed: false,
    },
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      route: 'NORTH_TO_SOUTH',
      strategy: 'SWING',
    },
  },
  {
    workflowId: 'dag_signal_fusion_public_v1',
    triggerType: 'MANUAL',
    name: '多信号并行融合触发',
    description: '手动触发 DAG 多信号融合流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      route: 'NORTH_TO_SOUTH',
      strategy: 'AGGRESSIVE',
      sessionOverrides: {
        volatilityFactor: 1.5,
      },
    },
  },
  {
    workflowId: 'debate_risk_committee_public_v1',
    triggerType: 'MANUAL',
    name: '辩论决策手动触发',
    description: '手动触发多角色辩论决策流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      strategy: 'DAY_TRADE',
      topic: '当前玉米现货上涨背景下是否追涨',
    },
  },
  {
    workflowId: 'linear_policy_event_guard_public_v1',
    triggerType: 'MANUAL',
    name: '政策事件联防手动触发',
    description: '手动触发政策事件联防流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      strategy: 'CONSERVATIVE',
      context: {
        eventType: 'POLICY',
      },
    },
  },
  {
    workflowId: 'dag_multi_agent_fusion_public_v1',
    triggerType: 'MANUAL',
    name: '多智能体融合手动触发',
    description: '手动触发多智能体融合流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      route: 'NORTH_TO_SOUTH',
      strategy: 'AGGRESSIVE',
      sessionOverrides: {
        volatilityFactor: 1.35,
      },
    },
  },
  {
    workflowId: 'linear_trade_playbook_public_v1',
    triggerType: 'ON_DEMAND',
    name: '交易剧本按需触发',
    description: '按需触发交易剧本生成流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      strategy: 'DAY_TRADE',
      topic: '日内交易剧本生成',
    },
  },
  {
    workflowId: 'debate_macro_policy_committee_public_v1',
    triggerType: 'ON_DEMAND',
    name: '宏观政策辩论按需触发',
    description: '按需触发宏观政策辩论流程。',
    status: 'ACTIVE',
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      strategy: 'SWING',
      topic: '政策扰动场景下是否降低风险暴露',
    },
  },
  {
    workflowId: 'dag_stress_defense_public_v1',
    triggerType: 'SCHEDULE',
    name: '压力防御日终巡检',
    description: '每日收盘后触发压力防御流程。',
    status: 'ACTIVE',
    cronState: 'IDLE',
    cronConfig: {
      cronExpression: '30 16 * * 1-5',
      timezone: 'Asia/Shanghai',
      maxConcurrent: 1,
      catchUpMissed: false,
    },
    paramOverrides: {
      commodity: 'CORN',
      region: 'NORTH_CHINA',
      strategy: 'CONSERVATIVE',
    },
  },
];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function seedTriggerConfigs() {
  console.log('🌱 开始播种触发器配置...');

  const workflowDefinitions = await prisma.workflowDefinition.findMany({
    where: {
      workflowId: {
        in: [...new Set(TRIGGER_CONFIGS.map((item) => item.workflowId))],
      },
    },
    select: {
      id: true,
      workflowId: true,
    },
  });

  const workflowIdMap = new Map(workflowDefinitions.map((item) => [item.workflowId, item.id]));

  for (const config of TRIGGER_CONFIGS) {
    const workflowDefinitionId = workflowIdMap.get(config.workflowId);
    if (!workflowDefinitionId) {
      throw new Error(`未找到工作流定义: ${config.workflowId}`);
    }

    const existing = await prisma.triggerConfig.findFirst({
      where: {
        workflowDefinitionId,
        triggerType: config.triggerType,
        name: config.name,
        createdByUserId: DEFAULT_ADMIN_USER_ID,
      },
      select: {
        id: true,
      },
    });

    const payload = {
      workflowDefinitionId,
      triggerType: config.triggerType,
      name: config.name,
      description: config.description,
      status: config.status,
      cronConfig: config.cronConfig ? toJsonValue(config.cronConfig) : undefined,
      apiConfig: config.apiConfig ? toJsonValue(config.apiConfig) : undefined,
      eventConfig: config.eventConfig ? toJsonValue(config.eventConfig) : undefined,
      paramOverrides: config.paramOverrides ? toJsonValue(config.paramOverrides) : undefined,
      cronState: config.cronState,
      createdByUserId: DEFAULT_ADMIN_USER_ID,
    };

    if (existing) {
      await prisma.triggerConfig.update({
        where: {
          id: existing.id,
        },
        data: payload,
      });
      continue;
    }

    await prisma.triggerConfig.create({
      data: payload,
    });
  }

  console.log(`✅ 触发器配置播种完成，共 ${TRIGGER_CONFIGS.length} 条`);
}

seedTriggerConfigs()
  .catch((error) => {
    console.error('❌ 触发器配置播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
