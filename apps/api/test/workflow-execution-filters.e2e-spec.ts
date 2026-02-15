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
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { PrismaModule } from '../src/prisma';

@Module({
    imports: [PrismaModule, WorkflowExecutionModule],
})
class WorkflowExecutionFiltersE2eModule implements NestModule {
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

type QueryValue = string | number | boolean | undefined;
type WorkflowExecutionQuery = Record<string, QueryValue>;

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
            candidate = await NestFactory.create(WorkflowExecutionFiltersE2eModule, {
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
    throw new Error('Failed to bootstrap workflow filter e2e app');
};

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
            name: 'manual trigger',
            enabled: true,
            config: {},
        },
        {
            id: 'n2',
            type: 'risk-gate',
            name: 'risk gate',
            enabled: true,
            config: {
                riskProfileCode: 'FILTER_E2E_PROFILE',
            },
        },
        {
            id: 'n3',
            type: 'notify',
            name: 'notify',
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

const buildRiskGateOutput = (
    overrides: Partial<{
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
        riskGatePassed: boolean;
        riskGateBlocked: boolean;
        blockReason: string | null;
        degradeAction: 'HOLD' | 'REDUCE' | 'REVIEW_ONLY' | null;
        blockers: string[];
        blockerCount: number;
        riskProfileCode: string;
        threshold: string;
        blockedByRiskLevel: boolean;
        hardBlock: boolean;
        riskEvaluatedAt: string;
    }> = {},
) => ({
    summarySchemaVersion: '1.0',
    riskLevel: overrides.riskLevel ?? 'LOW',
    riskGatePassed: overrides.riskGatePassed ?? true,
    riskGateBlocked: overrides.riskGateBlocked ?? false,
    blockReason: overrides.blockReason ?? null,
    degradeAction: overrides.degradeAction ?? null,
    blockers: overrides.blockers ?? [],
    blockerCount: overrides.blockerCount ?? (overrides.blockers?.length ?? 0),
    riskProfileCode: overrides.riskProfileCode ?? 'FILTER_E2E_PROFILE',
    threshold: overrides.threshold ?? 'HIGH',
    blockedByRiskLevel: overrides.blockedByRiskLevel ?? false,
    hardBlock: overrides.hardBlock ?? false,
    riskEvaluatedAt: overrides.riskEvaluatedAt ?? new Date().toISOString(),
});

const fetchExecutionPage = async (
    baseUrl: string,
    ownerUserId: string,
    queryParams: WorkflowExecutionQuery,
): Promise<WorkflowExecutionPageResponse> => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        query.set(key, String(value));
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

const toSortedIds = (page: WorkflowExecutionPageResponse) => page.data.map((item) => item.id).sort();

const assertExactIds = (
    label: string,
    page: WorkflowExecutionPageResponse,
    expectedIds: string[],
) => {
    const expected = [...expectedIds].sort();
    const actual = toSortedIds(page);

    assert.deepEqual(
        actual,
        expected,
        `${label}: unexpected ids, expected=${expected.join(',')}, actual=${actual.join(',')}`,
    );
};

async function main() {
    let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
    let ownerDefinitionId: string | null = null;
    let otherDefinitionId: string | null = null;

    try {
        app = await bootstrapAppWithRetry();
        const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

        const ownerUserId = randomUUID();
        const otherUserId = randomUUID();
        const token = `wf_filter_e2e_${Date.now()}`;
        const now = Date.now();

        const t1 = new Date(now - 5 * 60 * 60 * 1000);
        const t2 = new Date(now - 4 * 60 * 60 * 1000);
        const t3 = new Date(now - 3 * 60 * 60 * 1000);
        const t4 = new Date(now - 2 * 60 * 60 * 1000);
        const t5 = new Date(now - 1 * 60 * 60 * 1000);

        const ownerDefinition = await prisma.workflowDefinition.create({
            data: {
                workflowId: `${token}_owner`,
                name: `filter e2e owner ${token}`,
                mode: 'LINEAR',
                usageMethod: 'COPILOT',
                status: 'ACTIVE',
                ownerUserId,
                templateSource: 'PRIVATE',
                latestVersionCode: '1.0.0',
            },
        });
        ownerDefinitionId = ownerDefinition.id;

        const ownerVersion = await prisma.workflowVersion.create({
            data: {
                workflowDefinitionId: ownerDefinition.id,
                versionCode: '1.0.0',
                status: 'PUBLISHED',
                dslSnapshot: buildDslSnapshot(`${token}_owner`, `filter e2e owner ${token}`),
                changelog: 'workflow filters e2e',
                createdByUserId: ownerUserId,
                publishedAt: t1,
            },
        });

        const otherDefinition = await prisma.workflowDefinition.create({
            data: {
                workflowId: `${token}_other`,
                name: `filter e2e other ${token}`,
                mode: 'LINEAR',
                usageMethod: 'COPILOT',
                status: 'ACTIVE',
                ownerUserId: otherUserId,
                templateSource: 'PRIVATE',
                latestVersionCode: '1.0.0',
            },
        });
        otherDefinitionId = otherDefinition.id;

        const otherVersion = await prisma.workflowVersion.create({
            data: {
                workflowDefinitionId: otherDefinition.id,
                versionCode: '1.0.0',
                status: 'PUBLISHED',
                dslSnapshot: buildDslSnapshot(`${token}_other`, `filter e2e other ${token}`),
                changelog: 'workflow filters e2e other',
                createdByUserId: otherUserId,
                publishedAt: t1,
            },
        });

        const highBlockedSummary = buildRiskGateOutput({
            riskLevel: 'HIGH',
            riskGatePassed: false,
            riskGateBlocked: true,
            blockReason: 'market-volatility',
            degradeAction: 'HOLD',
            blockers: ['signal.forceBlock'],
            blockerCount: 1,
            riskProfileCode: 'FILTER_PROFILE_A',
            threshold: 'HIGH',
            blockedByRiskLevel: true,
            riskEvaluatedAt: t1.toISOString(),
        });

        const mediumPassSummary = buildRiskGateOutput({
            riskLevel: 'MEDIUM',
            riskGatePassed: true,
            riskGateBlocked: false,
            blockReason: null,
            degradeAction: 'REVIEW_ONLY',
            blockers: [],
            blockerCount: 0,
            riskProfileCode: 'FILTER_PROFILE_B',
            threshold: 'HIGH',
            blockedByRiskLevel: false,
            riskEvaluatedAt: t2.toISOString(),
        });

        const lowPassSummary = buildRiskGateOutput({
            riskLevel: 'LOW',
            riskGatePassed: true,
            riskGateBlocked: false,
            blockReason: null,
            degradeAction: null,
            blockers: [],
            blockerCount: 0,
            riskProfileCode: 'FILTER_PROFILE_C',
            threshold: 'HIGH',
            blockedByRiskLevel: false,
            riskEvaluatedAt: t3.toISOString(),
        });

        const highBlockedReduceSummary = buildRiskGateOutput({
            riskLevel: 'HIGH',
            riskGatePassed: false,
            riskGateBlocked: true,
            blockReason: 'position-limit',
            degradeAction: 'REDUCE',
            blockers: ['risk.position.limit'],
            blockerCount: 1,
            riskProfileCode: 'FILTER_PROFILE_D',
            threshold: 'HIGH',
            blockedByRiskLevel: true,
            riskEvaluatedAt: t5.toISOString(),
        });

        const execHighSummaryHold = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: t1,
                completedAt: t1,
                outputSnapshot: {
                    nodeCount: 3,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 0,
                    riskGate: highBlockedSummary,
                },
            },
        });

        const execMediumNoSummary = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: t2,
                completedAt: t2,
                outputSnapshot: {
                    nodeCount: 3,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 1,
                },
            },
        });

        const execLowSummaryPass = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'API',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: t3,
                completedAt: t3,
                outputSnapshot: {
                    nodeCount: 3,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 0,
                    riskGate: lowPassSummary,
                },
            },
        });

        const execNoRiskNode = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'SCHEDULE',
                triggerUserId: ownerUserId,
                status: 'SUCCESS',
                startedAt: t4,
                completedAt: t4,
                outputSnapshot: {
                    nodeCount: 1,
                    latestNodeId: 'n3',
                    latestNodeType: 'notify',
                    softFailureCount: 0,
                },
            },
        });

        const execHighSummaryReduce = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'FAILED',
                startedAt: t5,
                completedAt: t5,
                errorMessage: 'e2e failed',
                outputSnapshot: {
                    nodeCount: 2,
                    latestNodeId: 'n2',
                    latestNodeType: 'risk-gate',
                    softFailureCount: 0,
                    riskGate: highBlockedReduceSummary,
                },
            },
        });

        const execOtherPrivate = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: otherVersion.id,
                triggerType: 'MANUAL',
                triggerUserId: otherUserId,
                status: 'SUCCESS',
                startedAt: t2,
                completedAt: t2,
                outputSnapshot: {
                    nodeCount: 2,
                    latestNodeId: 'n2',
                    latestNodeType: 'risk-gate',
                    softFailureCount: 0,
                    riskGate: highBlockedSummary,
                },
            },
        });

        await prisma.nodeExecution.createMany({
            data: [
                {
                    workflowExecutionId: execHighSummaryHold.id,
                    nodeId: 'n2',
                    nodeType: 'risk-gate',
                    status: 'SUCCESS',
                    startedAt: t1,
                    completedAt: t1,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: highBlockedSummary,
                },
                {
                    workflowExecutionId: execMediumNoSummary.id,
                    nodeId: 'n2',
                    nodeType: 'risk-gate',
                    status: 'SUCCESS',
                    startedAt: t2,
                    completedAt: t2,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: mediumPassSummary,
                },
                {
                    workflowExecutionId: execLowSummaryPass.id,
                    nodeId: 'n2',
                    nodeType: 'risk-gate',
                    status: 'SUCCESS',
                    startedAt: t3,
                    completedAt: t3,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: lowPassSummary,
                },
                {
                    workflowExecutionId: execNoRiskNode.id,
                    nodeId: 'n3',
                    nodeType: 'notify',
                    status: 'SUCCESS',
                    startedAt: t4,
                    completedAt: t4,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: {
                        channel: 'console',
                    },
                },
                {
                    workflowExecutionId: execHighSummaryReduce.id,
                    nodeId: 'n2',
                    nodeType: 'risk-gate',
                    status: 'SUCCESS',
                    startedAt: t5,
                    completedAt: t5,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: highBlockedReduceSummary,
                },
                {
                    workflowExecutionId: execOtherPrivate.id,
                    nodeId: 'n2',
                    nodeType: 'risk-gate',
                    status: 'SUCCESS',
                    startedAt: t2,
                    completedAt: t2,
                    durationMs: 1,
                    inputSnapshot: {},
                    outputSnapshot: highBlockedSummary,
                },
            ],
        });

        const baseQuery: WorkflowExecutionQuery = {
            workflowDefinitionId: ownerDefinition.id,
            page: 1,
            pageSize: 100,
        };

        const comboCases: Array<{
            label: string;
            query: WorkflowExecutionQuery;
            expectedIds: string[];
        }> = [
            {
                label: 'summary+node+high+hold',
                query: {
                    ...baseQuery,
                    hasRiskSummary: true,
                    hasRiskGateNode: true,
                    riskLevel: 'HIGH',
                    degradeAction: 'HOLD',
                },
                expectedIds: [execHighSummaryHold.id],
            },
            {
                label: 'summary+node+high+reduce',
                query: {
                    ...baseQuery,
                    hasRiskSummary: true,
                    hasRiskGateNode: true,
                    riskLevel: 'HIGH',
                    degradeAction: 'REDUCE',
                },
                expectedIds: [execHighSummaryReduce.id],
            },
            {
                label: 'missing-summary+node+medium',
                query: {
                    ...baseQuery,
                    hasRiskSummary: false,
                    hasRiskGateNode: true,
                    riskLevel: 'MEDIUM',
                },
                expectedIds: [execMediumNoSummary.id],
            },
            {
                label: 'missing-summary+no-risk-node',
                query: {
                    ...baseQuery,
                    hasRiskSummary: false,
                    hasRiskGateNode: false,
                },
                expectedIds: [execNoRiskNode.id],
            },
            {
                label: 'summary+no-risk-node',
                query: {
                    ...baseQuery,
                    hasRiskSummary: true,
                    hasRiskGateNode: false,
                },
                expectedIds: [],
            },
        ];

        for (const comboCase of comboCases) {
            const page = await fetchExecutionPage(baseUrl, ownerUserId, comboCase.query);
            assertExactIds(comboCase.label, page, comboCase.expectedIds);
        }

        const keywordPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            page: 1,
            pageSize: 100,
            keyword: token,
        });

        const keywordIds = new Set(keywordPage.data.map((item) => item.id));
        for (const id of [
            execHighSummaryHold.id,
            execMediumNoSummary.id,
            execLowSummaryPass.id,
            execNoRiskNode.id,
            execHighSummaryReduce.id,
        ]) {
            assert.equal(keywordIds.has(id), true, `keyword-scope: expected id ${id} to be returned`);
        }
        assert.equal(
            keywordIds.has(execOtherPrivate.id),
            false,
            'keyword-scope: private execution from another owner must not be returned',
        );

        console.log('Workflow execution filters e2e checks passed.');
    } finally {
        if (ownerDefinitionId) {
            await prisma.workflowDefinition.delete({
                where: { id: ownerDefinitionId },
            }).catch(() => undefined);
        }
        if (otherDefinitionId) {
            await prisma.workflowDefinition.delete({
                where: { id: otherDefinitionId },
            }).catch(() => undefined);
        }
        if (app) {
            await app.close();
        }
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Workflow execution filters e2e checks failed:', error);
    process.exitCode = 1;
});
