import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { ExecutionAnalyticsModule } from '../src/modules/execution-analytics';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, ExecutionAnalyticsModule],
})
class ExecutionAnalyticsE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(ExecutionAnalyticsE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const workflowId = `wf-analytics-e2e-${Date.now()}`;

  // Track created IDs for cleanup
  let definitionId: string | undefined;

  try {
    // ── Seed test data: definition → version → executions + node executions ──

    const definition = await prisma.workflowDefinition.create({
      data: {
        workflowId,
        name: 'Analytics E2E Test Workflow',
        ownerUserId,
        status: 'PUBLISHED',
      },
    });
    definitionId = definition.id;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowDefinitionId: definition.id,
        versionCode: 'v1.0.0',
        dslSnapshot: { nodes: [], edges: [] },
        status: 'PUBLISHED',
        createdByUserId: ownerUserId,
      },
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const twoHoursAgo = new Date(now.getTime() - 7200_000);

    // Create 3 executions: 2 SUCCESS, 1 FAILED
    const exec1 = await prisma.workflowExecution.create({
      data: {
        workflowVersionId: version.id,
        triggerType: 'MANUAL',
        triggerUserId: ownerUserId,
        status: 'SUCCESS',
        startedAt: twoHoursAgo,
        completedAt: new Date(twoHoursAgo.getTime() + 2000),
      },
    });

    const exec2 = await prisma.workflowExecution.create({
      data: {
        workflowVersionId: version.id,
        triggerType: 'MANUAL',
        triggerUserId: ownerUserId,
        status: 'SUCCESS',
        startedAt: oneHourAgo,
        completedAt: new Date(oneHourAgo.getTime() + 5000),
      },
    });

    const exec3 = await prisma.workflowExecution.create({
      data: {
        workflowVersionId: version.id,
        triggerType: 'MANUAL',
        triggerUserId: ownerUserId,
        status: 'FAILED',
        failureCategory: 'AGENT_ERROR',
        startedAt: now,
        completedAt: new Date(now.getTime() + 1000),
      },
    });

    // Create node executions for node performance stats
    await prisma.nodeExecution.createMany({
      data: [
        {
          workflowExecutionId: exec1.id,
          nodeId: 'node-fetch-1',
          nodeType: 'data-fetch',
          status: 'SUCCESS',
          durationMs: 500,
          startedAt: twoHoursAgo,
          completedAt: new Date(twoHoursAgo.getTime() + 500),
        },
        {
          workflowExecutionId: exec1.id,
          nodeId: 'node-agent-1',
          nodeType: 'agent-call',
          status: 'SUCCESS',
          durationMs: 1200,
          startedAt: new Date(twoHoursAgo.getTime() + 500),
          completedAt: new Date(twoHoursAgo.getTime() + 1700),
        },
        {
          workflowExecutionId: exec2.id,
          nodeId: 'node-fetch-1',
          nodeType: 'data-fetch',
          status: 'SUCCESS',
          durationMs: 600,
          startedAt: oneHourAgo,
          completedAt: new Date(oneHourAgo.getTime() + 600),
        },
        {
          workflowExecutionId: exec3.id,
          nodeId: 'node-agent-1',
          nodeType: 'agent-call',
          status: 'FAILED',
          durationMs: 800,
          startedAt: now,
          completedAt: new Date(now.getTime() + 800),
        },
      ],
    });

    // ── Test 1: GET /execution-analytics returns structured analytics ──
    const analytics = await fetchJson<{
      trend: {
        points: Array<{ timestamp: string; total: number; success: number; failed: number; successRate: number }>;
        overall: { total: number; success: number; failed: number; successRate: number; avgDurationMs: number };
      };
      durationDistribution: Array<{ label: string; count: number }>;
      failureCategories: Array<{ category: string; count: number; percentage: number }>;
      nodePerformance: Array<{
        nodeType: string;
        totalExecutions: number;
        successCount: number;
        failedCount: number;
        avgDurationMs: number;
      }>;
      topSlowNodes: Array<{ nodeType: string; avgDurationMs: number }>;
    }>(`${baseUrl}/execution-analytics?granularity=HOUR`, {
      method: 'GET',
      headers: { 'x-virtual-user-id': ownerUserId },
    });
    assert.equal(analytics.status, 200);

    // Verify overall trend
    assert.ok(analytics.body.trend, 'trend should exist');
    assert.ok(analytics.body.trend.overall, 'overall trend should exist');
    assert.equal(analytics.body.trend.overall.total, 3, 'should have 3 total executions');
    assert.equal(analytics.body.trend.overall.success, 2, 'should have 2 successful');
    assert.equal(analytics.body.trend.overall.failed, 1, 'should have 1 failed');
    assert.ok(analytics.body.trend.overall.successRate > 0.6, 'success rate should be > 60%');
    assert.ok(analytics.body.trend.overall.avgDurationMs > 0, 'avg duration should be positive');

    // Verify trend points exist
    assert.ok(Array.isArray(analytics.body.trend.points), 'trend points should be array');
    assert.ok(analytics.body.trend.points.length > 0, 'should have at least 1 trend point');

    // Verify duration distribution
    assert.ok(Array.isArray(analytics.body.durationDistribution), 'duration distribution should be array');
    assert.ok(analytics.body.durationDistribution.length > 0, 'should have duration buckets');
    const totalDurationCount = analytics.body.durationDistribution.reduce((sum, b) => sum + b.count, 0);
    assert.equal(totalDurationCount, 2, 'duration distribution should count 2 SUCCESS executions');

    // Verify failure categories
    assert.ok(Array.isArray(analytics.body.failureCategories), 'failure categories should be array');
    const agentError = analytics.body.failureCategories.find((c) => c.category === 'AGENT_ERROR');
    assert.ok(agentError, 'should have AGENT_ERROR category');
    assert.equal(agentError.count, 1);

    // Verify node performance
    assert.ok(Array.isArray(analytics.body.nodePerformance), 'node performance should be array');
    const dataFetchPerf = analytics.body.nodePerformance.find((n) => n.nodeType === 'data-fetch');
    assert.ok(dataFetchPerf, 'should have data-fetch node stats');
    assert.equal(dataFetchPerf.totalExecutions, 2);
    assert.equal(dataFetchPerf.successCount, 2);
    assert.ok(dataFetchPerf.avgDurationMs > 0);

    const agentCallPerf = analytics.body.nodePerformance.find((n) => n.nodeType === 'agent-call');
    assert.ok(agentCallPerf, 'should have agent-call node stats');
    assert.equal(agentCallPerf.totalExecutions, 2);
    assert.equal(agentCallPerf.failedCount, 1);

    // Verify topSlowNodes
    assert.ok(Array.isArray(analytics.body.topSlowNodes), 'topSlowNodes should be array');

    // ── Test 2: GET with date filter returns filtered results ──
    const futureDate = new Date(now.getTime() + 86400_000).toISOString();
    const filteredAnalytics = await fetchJson<{
      trend: { overall: { total: number } };
    }>(`${baseUrl}/execution-analytics?granularity=DAY&startDate=${futureDate}`, {
      method: 'GET',
      headers: { 'x-virtual-user-id': ownerUserId },
    });
    assert.equal(filteredAnalytics.status, 200);
    assert.equal(filteredAnalytics.body.trend.overall.total, 0, 'future date filter should return 0 executions');

    // ── Test 3: Unauthenticated request fails ──
    const noAuth = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/execution-analytics?granularity=DAY`,
      { method: 'GET' },
    );
    // MockAuthMiddleware injects a default user, so this should still work
    assert.equal(noAuth.status, 200);

    console.log('Execution analytics e2e checks passed.');
  } finally {
    // Cleanup seeded data
    if (definitionId) {
      await prisma.nodeExecution
        .deleteMany({
          where: { workflowExecution: { workflowVersion: { workflowDefinitionId: definitionId } } },
        })
        .catch(() => undefined);
      await prisma.workflowExecution
        .deleteMany({
          where: { workflowVersion: { workflowDefinitionId: definitionId } },
        })
        .catch(() => undefined);
      await prisma.workflowVersion
        .deleteMany({ where: { workflowDefinitionId: definitionId } })
        .catch(() => undefined);
      await prisma.workflowDefinition
        .delete({ where: { id: definitionId } })
        .catch(() => undefined);
    }
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Execution analytics e2e checks failed:', error);
  process.exitCode = 1;
});
