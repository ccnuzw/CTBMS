import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
    MiddlewareConsumer,
    Module,
    NestModule,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../common/middleware/mock-auth.middleware';
import { WorkflowExecutionModule } from '../modules/workflow-execution';
import { PrismaModule } from '../prisma';

@Module({
    imports: [PrismaModule, WorkflowExecutionModule],
})
class WorkflowExecutionSmokeModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(MockAuthMiddleware).forRoutes('*');
    }
}

type WorkflowExecutionPageResponse = {
    data: Array<{ id: string }>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

type WorkflowExecutionFilters = {
    hasRiskSummary: boolean;
    hasRiskGateNode?: boolean;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    degradeAction?: 'HOLD' | 'REDUCE' | 'REVIEW_ONLY';
};

const APP_BOOTSTRAP_MAX_ATTEMPTS = 12;
const APP_BOOTSTRAP_RETRY_DELAY_MS = 2000;

const normalizeDatabaseUrl = () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !databaseUrl.includes('localhost')) {
        return;
    }
    // Prefer IPv4 loopback to avoid intermittent localhost resolution issues.
    process.env.DATABASE_URL = databaseUrl.replace('localhost', '127.0.0.1');
};

normalizeDatabaseUrl();

const prisma = new PrismaClient();

const buildDslSnapshot = (workflowId: string, workflowName: string) => ({
    workflowId,
    name: workflowName,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'ACTIVE',
    nodes: [
        {
            id: 'n1',
            type: 'manual-trigger',
            name: '手工触发',
            enabled: true,
            config: {},
        },
        {
            id: 'n2',
            type: 'risk-gate',
            name: '风险闸门',
            enabled: true,
            config: {
                riskProfileCode: 'SMOKE_RISK_PROFILE',
            },
        },
        {
            id: 'n3',
            type: 'notify',
            name: '通知',
            enabled: true,
            config: {
                channel: 'console',
            },
        },
    ],
    edges: [
        { id: 'e1', from: 'n1', to: 'n2', edgeType: 'control-edge' },
        { id: 'e2', from: 'n2', to: 'n3', edgeType: 'control-edge' },
    ],
});

const fetchExecutionPage = async (
    baseUrl: string,
    ownerUserId: string,
    filters: WorkflowExecutionFilters,
): Promise<WorkflowExecutionPageResponse> => {
    const query = new URLSearchParams();
    query.set('page', '1');
    query.set('pageSize', '50');
    query.set('hasRiskSummary', String(filters.hasRiskSummary));
    if (filters.hasRiskGateNode !== undefined) {
        query.set('hasRiskGateNode', String(filters.hasRiskGateNode));
    }
    if (filters.riskLevel) {
        query.set('riskLevel', filters.riskLevel);
    }
    if (filters.degradeAction) {
        query.set('degradeAction', filters.degradeAction);
    }
    const response = await fetch(`${baseUrl}/workflow-executions?${query.toString()}`, {
        headers: {
            'x-virtual-user-id': ownerUserId,
        },
    });
    const responseText = await response.text();
    assert.equal(response.status, 200, `Expected 200, got ${response.status}, body=${responseText}`);
    return JSON.parse(responseText) as WorkflowExecutionPageResponse;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDatabaseUnavailableError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return false;
    }

    return error.message.includes("Can't reach database server");
};

const bootstrapAppWithRetry = async () => {
    for (let attempt = 1; attempt <= APP_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        let candidate: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
        try {
            candidate = await NestFactory.create(WorkflowExecutionSmokeModule, {
                logger: false,
            });
            candidate.useGlobalPipes(new ZodValidationPipe());
            await candidate.listen(0);
            return candidate;
        } catch (error) {
            if (candidate) {
                await candidate.close().catch(() => undefined);
            }
            if (attempt >= APP_BOOTSTRAP_MAX_ATTEMPTS || !isDatabaseUnavailableError(error)) {
                throw error;
            }
            await sleep(APP_BOOTSTRAP_RETRY_DELAY_MS * attempt);
        }
    }

    throw new Error('Failed to bootstrap workflow smoke app');
};

async function main() {
    let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
    let definitionId: string | null = null;

    try {
        app = await bootstrapAppWithRetry();
        const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

        const ownerUserId = randomUUID();
        const workflowId = `wf_risk_summary_smoke_${Date.now()}`;
        const workflowName = '风险摘要筛选冒烟';
        const now = new Date();

        const definition = await prisma.workflowDefinition.create({
            data: {
                workflowId,
                name: workflowName,
                mode: 'LINEAR',
                usageMethod: 'COPILOT',
                status: 'ACTIVE',
                ownerUserId,
                templateSource: 'PRIVATE',
                latestVersionCode: '1.0.0',
            },
        });
        definitionId = definition.id;

        const version = await prisma.workflowVersion.create({
            data: {
                workflowDefinitionId: definition.id,
                versionCode: '1.0.0',
                status: 'PUBLISHED',
                dslSnapshot: buildDslSnapshot(workflowId, workflowName),
                changelog: 'smoke',
                createdByUserId: ownerUserId,
                publishedAt: now,
            },
        });

        const executionWithSummary = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: version.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: now,
                completedAt: now,
                outputSnapshot: {
                    nodeCount: 3,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 0,
                    riskGate: {
                        summarySchemaVersion: '1.0',
                        riskLevel: 'HIGH',
                        riskGatePassed: false,
                        riskGateBlocked: true,
                        blockReason: 'smoke-blocked',
                        degradeAction: 'HOLD',
                        blockers: ['signal.forceBlock'],
                        blockerCount: 1,
                        riskProfileCode: 'SMOKE_RISK_PROFILE',
                        threshold: 'HIGH',
                        blockedByRiskLevel: true,
                        hardBlock: false,
                        riskEvaluatedAt: now.toISOString(),
                    },
                },
            },
        });

        const executionWithoutSummaryButRiskNode = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: version.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'FAILED',
                startedAt: now,
                completedAt: now,
                outputSnapshot: {
                    nodeCount: 2,
                    latestNodeId: 'n2',
                    latestNodeType: 'risk-gate',
                    softFailureCount: 0,
                },
            },
        });

        await prisma.nodeExecution.create({
            data: {
                workflowExecutionId: executionWithSummary.id,
                nodeId: 'n2',
                nodeType: 'risk-gate',
                status: 'SUCCESS',
                startedAt: now,
                completedAt: now,
                durationMs: 1,
                inputSnapshot: {},
                outputSnapshot: {
                    summarySchemaVersion: '1.0',
                    riskLevel: 'HIGH',
                    riskGatePassed: false,
                    riskGateBlocked: true,
                    blockReason: 'smoke-blocked',
                    degradeAction: 'HOLD',
                    blockers: ['signal.forceBlock'],
                    blockerCount: 1,
                    riskProfileCode: 'SMOKE_RISK_PROFILE',
                    threshold: 'HIGH',
                    blockedByRiskLevel: true,
                    hardBlock: false,
                    riskEvaluatedAt: now.toISOString(),
                },
            },
        });

        await prisma.nodeExecution.create({
            data: {
                workflowExecutionId: executionWithoutSummaryButRiskNode.id,
                nodeId: 'n2',
                nodeType: 'risk-gate',
                status: 'SUCCESS',
                startedAt: now,
                completedAt: now,
                durationMs: 1,
                inputSnapshot: {},
                outputSnapshot: {
                    summarySchemaVersion: '1.0',
                    riskLevel: 'MEDIUM',
                    riskGatePassed: true,
                    riskGateBlocked: false,
                    blockReason: null,
                    degradeAction: null,
                    blockers: [],
                    blockerCount: 0,
                    riskProfileCode: 'SMOKE_RISK_PROFILE',
                    threshold: 'HIGH',
                    blockedByRiskLevel: false,
                    hardBlock: false,
                    riskEvaluatedAt: now.toISOString(),
                },
            },
        });

        const executionWithoutSummaryAndRiskNode = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: version.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: now,
                completedAt: now,
                outputSnapshot: {
                    nodeCount: 1,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 0,
                },
            },
        });

        await prisma.nodeExecution.create({
            data: {
                workflowExecutionId: executionWithoutSummaryAndRiskNode.id,
                nodeId: 'n3',
                nodeType: 'notify',
                status: 'SUCCESS',
                startedAt: now,
                completedAt: now,
                durationMs: 1,
                inputSnapshot: {},
                outputSnapshot: {},
            },
        });

        const withSummaryPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: true,
        });
        const withSummaryIds = new Set(withSummaryPage.data.map((item) => item.id));
        assert.equal(withSummaryIds.has(executionWithSummary.id), true, 'Expected execution with summary to be returned');
        assert.equal(
            withSummaryIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution without outputSnapshot.riskGate must not be returned when hasRiskSummary=true',
        );
        assert.equal(
            withSummaryIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without summary and without risk node must not be returned when hasRiskSummary=true',
        );

        const withoutSummaryPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: false,
        });
        const withoutSummaryIds = new Set(withoutSummaryPage.data.map((item) => item.id));
        assert.equal(
            withoutSummaryIds.has(executionWithSummary.id),
            false,
            'Execution with summary must not be returned when hasRiskSummary=false',
        );
        assert.equal(
            withoutSummaryIds.has(executionWithoutSummaryButRiskNode.id),
            true,
            'Execution without outputSnapshot.riskGate should be returned when hasRiskSummary=false',
        );
        assert.equal(
            withoutSummaryIds.has(executionWithoutSummaryAndRiskNode.id),
            true,
            'Execution without summary should be returned when hasRiskSummary=false',
        );

        const withoutSummaryWithRiskNodePage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: false,
            hasRiskGateNode: true,
        });
        const withoutSummaryWithRiskNodeIds = new Set(
            withoutSummaryWithRiskNodePage.data.map((item) => item.id),
        );
        assert.equal(
            withoutSummaryWithRiskNodeIds.has(executionWithSummary.id),
            false,
            'Execution with summary must not be returned for hasRiskSummary=false + hasRiskGateNode=true',
        );
        assert.equal(
            withoutSummaryWithRiskNodeIds.has(executionWithoutSummaryButRiskNode.id),
            true,
            'Execution missing summary but having risk node should be returned for combined filter',
        );
        assert.equal(
            withoutSummaryWithRiskNodeIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without risk node must not be returned for hasRiskGateNode=true',
        );

        const withoutSummaryWithoutRiskNodePage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: false,
            hasRiskGateNode: false,
        });
        const withoutSummaryWithoutRiskNodeIds = new Set(
            withoutSummaryWithoutRiskNodePage.data.map((item) => item.id),
        );
        assert.equal(
            withoutSummaryWithoutRiskNodeIds.has(executionWithSummary.id),
            false,
            'Execution with summary must not be returned for hasRiskSummary=false + hasRiskGateNode=false',
        );
        assert.equal(
            withoutSummaryWithoutRiskNodeIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution with risk node must not be returned for hasRiskGateNode=false',
        );
        assert.equal(
            withoutSummaryWithoutRiskNodeIds.has(executionWithoutSummaryAndRiskNode.id),
            true,
            'Execution missing summary and risk node should be returned for combined filter',
        );

        const withSummaryWithRiskNodePage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: true,
            hasRiskGateNode: true,
        });
        const withSummaryWithRiskNodeIds = new Set(
            withSummaryWithRiskNodePage.data.map((item) => item.id),
        );
        assert.equal(
            withSummaryWithRiskNodeIds.has(executionWithSummary.id),
            true,
            'Execution with summary and risk node should be returned for hasRiskSummary=true + hasRiskGateNode=true',
        );
        assert.equal(
            withSummaryWithRiskNodeIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution without summary must not be returned for hasRiskSummary=true + hasRiskGateNode=true',
        );
        assert.equal(
            withSummaryWithRiskNodeIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without summary should not be returned for hasRiskSummary=true + hasRiskGateNode=true',
        );

        const withSummaryAndRiskLevelPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: true,
            riskLevel: 'HIGH',
        });
        const withSummaryAndRiskLevelIds = new Set(
            withSummaryAndRiskLevelPage.data.map((item) => item.id),
        );
        assert.equal(
            withSummaryAndRiskLevelIds.has(executionWithSummary.id),
            true,
            'Execution with summary and HIGH riskLevel should be returned for combined filter',
        );
        assert.equal(
            withSummaryAndRiskLevelIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution without summary must not be returned for hasRiskSummary=true + riskLevel=HIGH',
        );
        assert.equal(
            withSummaryAndRiskLevelIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without risk summary must not be returned for hasRiskSummary=true + riskLevel=HIGH',
        );

        const withSummaryAndDegradeActionPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: true,
            degradeAction: 'HOLD',
        });
        const withSummaryAndDegradeActionIds = new Set(
            withSummaryAndDegradeActionPage.data.map((item) => item.id),
        );
        assert.equal(
            withSummaryAndDegradeActionIds.has(executionWithSummary.id),
            true,
            'Execution with summary and HOLD degradeAction should be returned for combined filter',
        );
        assert.equal(
            withSummaryAndDegradeActionIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution without summary must not be returned for hasRiskSummary=true + degradeAction=HOLD',
        );
        assert.equal(
            withSummaryAndDegradeActionIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without summary must not be returned for hasRiskSummary=true + degradeAction=HOLD',
        );

        const withoutSummaryAndRiskLevelPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: false,
            riskLevel: 'MEDIUM',
        });
        const withoutSummaryAndRiskLevelIds = new Set(
            withoutSummaryAndRiskLevelPage.data.map((item) => item.id),
        );
        assert.equal(
            withoutSummaryAndRiskLevelIds.has(executionWithSummary.id),
            false,
            'Execution with summary must not be returned for hasRiskSummary=false + riskLevel=MEDIUM',
        );
        assert.equal(
            withoutSummaryAndRiskLevelIds.has(executionWithoutSummaryButRiskNode.id),
            true,
            'Execution without summary and MEDIUM riskLevel should be returned for combined filter',
        );
        assert.equal(
            withoutSummaryAndRiskLevelIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without risk node must not be returned for hasRiskSummary=false + riskLevel=MEDIUM',
        );

        const withoutSummaryAndDegradeActionPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            hasRiskSummary: false,
            degradeAction: 'HOLD',
        });
        const withoutSummaryAndDegradeActionIds = new Set(
            withoutSummaryAndDegradeActionPage.data.map((item) => item.id),
        );
        assert.equal(
            withoutSummaryAndDegradeActionIds.has(executionWithSummary.id),
            false,
            'Execution with summary must not be returned for hasRiskSummary=false + degradeAction=HOLD',
        );
        assert.equal(
            withoutSummaryAndDegradeActionIds.has(executionWithoutSummaryButRiskNode.id),
            false,
            'Execution without matching degradeAction must not be returned for hasRiskSummary=false + degradeAction=HOLD',
        );
        assert.equal(
            withoutSummaryAndDegradeActionIds.has(executionWithoutSummaryAndRiskNode.id),
            false,
            'Execution without risk node must not be returned for hasRiskSummary=false + degradeAction=HOLD',
        );

        console.log('Workflow execution hasRiskSummary API smoke checks passed.');
    } finally {
        if (definitionId) {
            await prisma.workflowDefinition.delete({
                where: { id: definitionId },
            }).catch(() => undefined);
        }
        if (app) {
            await app.close();
        }
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Workflow execution hasRiskSummary API smoke checks failed:', error);
    process.exitCode = 1;
});
