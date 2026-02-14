import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

type BindingType =
  | 'PARAMETER_SET'
  | 'DECISION_RULE_PACK'
  | 'AGENT_PROFILE'
  | 'TEMPLATE_CATALOG'
  | 'WORKFLOW_DEFINITION';

type SeedBindingTarget = {
  bindingType: BindingType;
  code: string;
  priority: number;
  metadata?: Record<string, unknown>;
};

const BINDING_TARGETS: SeedBindingTarget[] = [
  {
    bindingType: 'PARAMETER_SET',
    code: 'BASELINE_SET',
    priority: 10,
    metadata: { role: 'default', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'PARAMETER_SET',
    code: 'VOLATILE_SET',
    priority: 20,
    metadata: { role: 'volatile', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'DECISION_RULE_PACK',
    code: 'corn_baseline_rule_pack_v1',
    priority: 10,
    metadata: { role: 'default', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'DECISION_RULE_PACK',
    code: 'corn_runtime_override_rule_pack_v1',
    priority: 30,
    metadata: { role: 'runtime_override', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'AGENT_PROFILE',
    code: 'MARKET_ANALYST_AGENT_V1',
    priority: 10,
    metadata: { role: 'analyst', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'AGENT_PROFILE',
    code: 'RISK_OFFICER_AGENT_V1',
    priority: 20,
    metadata: { role: 'risk', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'AGENT_PROFILE',
    code: 'JUDGE_AGENT_V1',
    priority: 30,
    metadata: { role: 'judge', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'WORKFLOW_DEFINITION',
    code: 'quick_rule_guard_public_v1',
    priority: 10,
    metadata: { role: 'entry', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'WORKFLOW_DEFINITION',
    code: 'debate_risk_committee_public_v1',
    priority: 20,
    metadata: { role: 'debate', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'TEMPLATE_CATALOG',
    code: 'TPL_QUICK_RULE_GUARD_V1',
    priority: 40,
    metadata: { role: 'official-template', source: 'SYSTEM_SEED' },
  },
  {
    bindingType: 'TEMPLATE_CATALOG',
    code: 'TPL_DAG_SIGNAL_FUSION_V1',
    priority: 50,
    metadata: { role: 'official-template', source: 'SYSTEM_SEED' },
  },
];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function resolveTarget(
  bindingType: BindingType,
  code: string,
): Promise<{ id: string; code: string } | null> {
  if (bindingType === 'PARAMETER_SET') {
    const target = await prisma.parameterSet.findUnique({
      where: { setCode: code },
      select: { id: true, setCode: true },
    });
    return target ? { id: target.id, code: target.setCode } : null;
  }

  if (bindingType === 'DECISION_RULE_PACK') {
    const target = await prisma.decisionRulePack.findUnique({
      where: { rulePackCode: code },
      select: { id: true, rulePackCode: true },
    });
    return target ? { id: target.id, code: target.rulePackCode } : null;
  }

  if (bindingType === 'AGENT_PROFILE') {
    const target = await prisma.agentProfile.findUnique({
      where: { agentCode: code },
      select: { id: true, agentCode: true },
    });
    return target ? { id: target.id, code: target.agentCode } : null;
  }

  if (bindingType === 'WORKFLOW_DEFINITION') {
    const target = await prisma.workflowDefinition.findUnique({
      where: { workflowId: code },
      select: { id: true, workflowId: true },
    });
    return target ? { id: target.id, code: target.workflowId } : null;
  }

  if (bindingType === 'TEMPLATE_CATALOG') {
    const target = await prisma.templateCatalog.findUnique({
      where: { templateCode: code },
      select: { id: true, templateCode: true },
    });
    return target ? { id: target.id, code: target.templateCode } : null;
  }

  return null;
}

async function seedUserConfigBindings() {
  console.log('🌱 开始播种用户配置绑定...');

  for (const item of BINDING_TARGETS) {
    const target = await resolveTarget(item.bindingType, item.code);
    if (!target) {
      console.warn(`⚠️  跳过绑定 ${item.bindingType}:${item.code}，目标不存在`);
      continue;
    }

    await prisma.userConfigBinding.upsert({
      where: {
        userId_bindingType_targetId: {
          userId: DEFAULT_ADMIN_USER_ID,
          bindingType: item.bindingType,
          targetId: target.id,
        },
      },
      update: {
        targetCode: target.code,
        metadata: item.metadata ? toJsonValue(item.metadata) : undefined,
        isActive: true,
        priority: item.priority,
      },
      create: {
        userId: DEFAULT_ADMIN_USER_ID,
        bindingType: item.bindingType,
        targetId: target.id,
        targetCode: target.code,
        metadata: item.metadata ? toJsonValue(item.metadata) : undefined,
        isActive: true,
        priority: item.priority,
      },
    });
  }

  console.log(`✅ 用户配置绑定播种完成，共 ${BINDING_TARGETS.length} 条`);
}

seedUserConfigBindings()
  .catch((error) => {
    console.error('❌ 用户配置绑定播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
