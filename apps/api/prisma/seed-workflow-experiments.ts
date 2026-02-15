import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

const EXPERIMENT_CODE = 'exp_dag_signal_fusion_ab_v1';
const BASE_WORKFLOW_ID = 'dag_signal_fusion_public_v1';
const VERSION_A = '1.0.0';
const VERSION_B = '1.1.0';

const EXPERIMENT_RUNS: Array<{
  id: string;
  workflowExecutionId: string;
  variant: 'A' | 'B';
  success: boolean;
  durationMs: number;
  nodeCount: number;
  failureCategory?: string;
  action?: string;
  confidence?: number;
  riskLevel?: string;
}> = [
  {
    id: 'f2000000-0000-0000-0000-000000000001',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000001',
    variant: 'A',
    success: true,
    durationMs: 1280,
    nodeCount: 7,
    action: 'REVIEW_ONLY',
    confidence: 72,
    riskLevel: 'MEDIUM',
  },
  {
    id: 'f2000000-0000-0000-0000-000000000002',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000002',
    variant: 'A',
    success: true,
    durationMs: 1345,
    nodeCount: 7,
    action: 'REDUCE',
    confidence: 69,
    riskLevel: 'HIGH',
  },
  {
    id: 'f2000000-0000-0000-0000-000000000003',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000003',
    variant: 'A',
    success: false,
    durationMs: 980,
    nodeCount: 5,
    failureCategory: 'EXECUTOR',
    action: 'HOLD',
    confidence: 40,
    riskLevel: 'HIGH',
  },
  {
    id: 'f2000000-0000-0000-0000-000000000004',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000004',
    variant: 'B',
    success: true,
    durationMs: 1160,
    nodeCount: 7,
    action: 'REVIEW_ONLY',
    confidence: 75,
    riskLevel: 'MEDIUM',
  },
  {
    id: 'f2000000-0000-0000-0000-000000000005',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000005',
    variant: 'B',
    success: true,
    durationMs: 1215,
    nodeCount: 7,
    action: 'REVIEW_ONLY',
    confidence: 78,
    riskLevel: 'MEDIUM',
  },
  {
    id: 'f2000000-0000-0000-0000-000000000006',
    workflowExecutionId: 'f3000000-0000-0000-0000-000000000006',
    variant: 'B',
    success: false,
    durationMs: 910,
    nodeCount: 4,
    failureCategory: 'VALIDATION',
    action: 'HOLD',
    confidence: 35,
    riskLevel: 'HIGH',
  },
];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ensureVariantBVersion(
  workflowDefinitionId: string,
): Promise<{ id: string; versionCode: string }> {
  const baseVersion = await prisma.workflowVersion.findFirst({
    where: {
      workflowDefinitionId,
      versionCode: VERSION_A,
    },
    select: {
      id: true,
      dslSnapshot: true,
      createdByUserId: true,
    },
  });

  if (!baseVersion) {
    throw new Error(`未找到基础版本: ${VERSION_A}`);
  }

  const dsl = (baseVersion.dslSnapshot ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(dsl.nodes)
    ? dsl.nodes.map((node) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
          return node;
        }
        const current = node as Record<string, unknown>;
        if (current.id === 'n_rule_layered') {
          return {
            ...current,
            config: {
              ...((current.config as Record<string, unknown>) ?? {}),
              minHitScore: 65,
            },
          };
        }
        if (current.id === 'n_risk_gate') {
          return {
            ...current,
            config: {
              ...((current.config as Record<string, unknown>) ?? {}),
              blockWhenRiskGte: 'MEDIUM',
            },
          };
        }
        return current;
      })
    : [];

  const dslVariantB = {
    ...dsl,
    version: VERSION_B,
    nodes,
  };

  const createdOrUpdated = await prisma.workflowVersion.upsert({
    where: {
      workflowDefinitionId_versionCode: {
        workflowDefinitionId,
        versionCode: VERSION_B,
      },
    },
    update: {
      status: 'DRAFT',
      dslSnapshot: toJsonValue(dslVariantB),
      changelog: 'A/B 实验 B 版本（更严格风控阈值）',
      createdByUserId: baseVersion.createdByUserId || DEFAULT_ADMIN_USER_ID,
    },
    create: {
      workflowDefinitionId,
      versionCode: VERSION_B,
      status: 'DRAFT',
      dslSnapshot: toJsonValue(dslVariantB),
      changelog: 'A/B 实验 B 版本（更严格风控阈值）',
      createdByUserId: baseVersion.createdByUserId || DEFAULT_ADMIN_USER_ID,
    },
    select: {
      id: true,
      versionCode: true,
    },
  });

  return createdOrUpdated;
}

async function seedWorkflowExperiments() {
  console.log('🌱 开始播种工作流实验数据...');

  const definition = await prisma.workflowDefinition.findUnique({
    where: {
      workflowId: BASE_WORKFLOW_ID,
    },
    select: {
      id: true,
    },
  });

  if (!definition) {
    throw new Error(`未找到工作流定义: ${BASE_WORKFLOW_ID}`);
  }

  const variantA = await prisma.workflowVersion.findFirst({
    where: {
      workflowDefinitionId: definition.id,
      versionCode: VERSION_A,
    },
    select: {
      id: true,
    },
  });

  if (!variantA) {
    throw new Error(`未找到实验版本 A: ${VERSION_A}`);
  }

  const variantB = await ensureVariantBVersion(definition.id);

  const experiment = await prisma.workflowExperiment.upsert({
    where: {
      experimentCode: EXPERIMENT_CODE,
    },
    update: {
      name: '多信号融合 A/B 实验（示例）',
      description: '用于展示实验路由与指标看板，B 版本采用更严格风险阈值。',
      workflowDefinitionId: definition.id,
      variantAVersionId: variantA.id,
      variantBVersionId: variantB.id,
      trafficSplitPercent: 50,
      status: 'COMPLETED',
      startedAt: new Date('2026-02-01T08:00:00.000Z'),
      endedAt: new Date('2026-02-10T08:00:00.000Z'),
      maxExecutions: 100,
      currentExecutionsA: 3,
      currentExecutionsB: 3,
      winnerVariant: 'B',
      conclusionSummary: 'B 版本在保持成功率的同时略优于 A 版本的平均耗时。',
      autoStopEnabled: true,
      badCaseThreshold: 0.2,
      metricsSnapshot: toJsonValue({
        variantA: {
          totalExecutions: 3,
          successCount: 2,
          failureCount: 1,
          successRate: 0.6667,
          avgDurationMs: 1201,
          p95DurationMs: 1345,
          badCaseRate: 0.3333,
        },
        variantB: {
          totalExecutions: 3,
          successCount: 2,
          failureCount: 1,
          successRate: 0.6667,
          avgDurationMs: 1095,
          p95DurationMs: 1215,
          badCaseRate: 0.3333,
        },
        lastUpdatedAt: '2026-02-10T08:00:00.000Z',
      }),
      createdByUserId: DEFAULT_ADMIN_USER_ID,
    },
    create: {
      experimentCode: EXPERIMENT_CODE,
      name: '多信号融合 A/B 实验（示例）',
      description: '用于展示实验路由与指标看板，B 版本采用更严格风险阈值。',
      workflowDefinitionId: definition.id,
      variantAVersionId: variantA.id,
      variantBVersionId: variantB.id,
      trafficSplitPercent: 50,
      status: 'COMPLETED',
      startedAt: new Date('2026-02-01T08:00:00.000Z'),
      endedAt: new Date('2026-02-10T08:00:00.000Z'),
      maxExecutions: 100,
      currentExecutionsA: 3,
      currentExecutionsB: 3,
      winnerVariant: 'B',
      conclusionSummary: 'B 版本在保持成功率的同时略优于 A 版本的平均耗时。',
      autoStopEnabled: true,
      badCaseThreshold: 0.2,
      metricsSnapshot: toJsonValue({
        variantA: {
          totalExecutions: 3,
          successCount: 2,
          failureCount: 1,
          successRate: 0.6667,
          avgDurationMs: 1201,
          p95DurationMs: 1345,
          badCaseRate: 0.3333,
        },
        variantB: {
          totalExecutions: 3,
          successCount: 2,
          failureCount: 1,
          successRate: 0.6667,
          avgDurationMs: 1095,
          p95DurationMs: 1215,
          badCaseRate: 0.3333,
        },
        lastUpdatedAt: '2026-02-10T08:00:00.000Z',
      }),
      createdByUserId: DEFAULT_ADMIN_USER_ID,
    },
    select: {
      id: true,
    },
  });

  for (const run of EXPERIMENT_RUNS) {
    await prisma.workflowExperimentRun.upsert({
      where: {
        id: run.id,
      },
      update: {
        experimentId: experiment.id,
        workflowExecutionId: run.workflowExecutionId,
        variant: run.variant,
        success: run.success,
        durationMs: run.durationMs,
        nodeCount: run.nodeCount,
        failureCategory: run.failureCategory ?? null,
        action: run.action ?? null,
        confidence: run.confidence ?? null,
        riskLevel: run.riskLevel ?? null,
        metricsPayload: toJsonValue({
          source: 'SYSTEM_SEED',
          seededAt: new Date().toISOString(),
        }),
      },
      create: {
        id: run.id,
        experimentId: experiment.id,
        workflowExecutionId: run.workflowExecutionId,
        variant: run.variant,
        success: run.success,
        durationMs: run.durationMs,
        nodeCount: run.nodeCount,
        failureCategory: run.failureCategory ?? null,
        action: run.action ?? null,
        confidence: run.confidence ?? null,
        riskLevel: run.riskLevel ?? null,
        metricsPayload: toJsonValue({
          source: 'SYSTEM_SEED',
          seededAt: new Date().toISOString(),
        }),
      },
    });
  }

  console.log('✅ 工作流实验数据播种完成');
}

seedWorkflowExperiments()
  .catch((error) => {
    console.error('❌ 工作流实验数据播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
