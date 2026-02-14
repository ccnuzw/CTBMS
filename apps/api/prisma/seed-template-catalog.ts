import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

type SeedTemplate = {
  templateCode: string;
  workflowId: string;
  name: string;
  description: string;
  category: 'TRADING' | 'RISK_MANAGEMENT' | 'ANALYSIS' | 'MONITORING' | 'REPORTING' | 'CUSTOM';
  tags: string[];
  rating: number;
  usageCount: number;
};

const TEMPLATES: SeedTemplate[] = [
  {
    templateCode: 'TPL_QUICK_RULE_GUARD_V1',
    workflowId: 'quick_rule_guard_public_v1',
    name: '快速规则风控模板',
    description: '适用于日常盘中快速风控巡检的线性模板。',
    category: 'RISK_MANAGEMENT',
    tags: ['risk-gate', 'rule-pack', 'linear'],
    rating: 4.7,
    usageCount: 32,
  },
  {
    templateCode: 'TPL_DAG_SIGNAL_FUSION_V1',
    workflowId: 'dag_signal_fusion_public_v1',
    name: '多信号并行融合模板',
    description: '并行评估规则与计算结果，适配多源信号决策。',
    category: 'ANALYSIS',
    tags: ['dag', 'signal-fusion', 'join'],
    rating: 4.8,
    usageCount: 21,
  },
  {
    templateCode: 'TPL_DEBATE_COMMITTEE_V1',
    workflowId: 'debate_risk_committee_public_v1',
    name: '多角色辩论决策模板',
    description: '多 Agent 辩论与裁决协同模板，适用于分歧决策场景。',
    category: 'TRADING',
    tags: ['debate', 'judge-agent', 'committee'],
    rating: 4.6,
    usageCount: 15,
  },
];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseDslCounts(dslSnapshot: Prisma.JsonValue | null): {
  nodeCount: number;
  edgeCount: number;
} {
  if (!dslSnapshot || typeof dslSnapshot !== 'object' || Array.isArray(dslSnapshot)) {
    return { nodeCount: 0, edgeCount: 0 };
  }

  const snapshot = dslSnapshot as Record<string, unknown>;
  const nodeCount = Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0;
  const edgeCount = Array.isArray(snapshot.edges) ? snapshot.edges.length : 0;

  return { nodeCount, edgeCount };
}

async function seedTemplateCatalog() {
  console.log('🌱 开始播种流程模板市场数据...');

  const workflowIds = TEMPLATES.map((item) => item.workflowId);
  const definitions = await prisma.workflowDefinition.findMany({
    where: {
      workflowId: {
        in: workflowIds,
      },
    },
    select: {
      id: true,
      workflowId: true,
    },
  });

  const definitionMap = new Map(definitions.map((item) => [item.workflowId, item.id]));

  for (const item of TEMPLATES) {
    const workflowDefinitionId = definitionMap.get(item.workflowId);
    if (!workflowDefinitionId) {
      throw new Error(`未找到工作流定义: ${item.workflowId}`);
    }

    const version = await prisma.workflowVersion.findFirst({
      where: {
        workflowDefinitionId,
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      select: {
        dslSnapshot: true,
      },
    });

    if (!version) {
      throw new Error(`未找到工作流版本: ${item.workflowId}`);
    }

    const { nodeCount, edgeCount } = parseDslCounts(version.dslSnapshot);

    await prisma.templateCatalog.upsert({
      where: {
        templateCode: item.templateCode,
      },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        status: 'PUBLISHED',
        tags: toJsonValue(item.tags),
        dslSnapshot: toJsonValue(version.dslSnapshot),
        nodeCount,
        edgeCount,
        usageCount: item.usageCount,
        rating: item.rating,
        authorUserId: DEFAULT_ADMIN_USER_ID,
        authorName: '系统管理员',
        isOfficial: true,
      },
      create: {
        templateCode: item.templateCode,
        name: item.name,
        description: item.description,
        category: item.category,
        status: 'PUBLISHED',
        tags: toJsonValue(item.tags),
        dslSnapshot: toJsonValue(version.dslSnapshot),
        nodeCount,
        edgeCount,
        usageCount: item.usageCount,
        rating: item.rating,
        authorUserId: DEFAULT_ADMIN_USER_ID,
        authorName: '系统管理员',
        isOfficial: true,
      },
    });
  }

  console.log(`✅ 流程模板市场播种完成，共 ${TEMPLATES.length} 条`);
}

seedTemplateCatalog()
  .catch((error) => {
    console.error('❌ 流程模板市场播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
