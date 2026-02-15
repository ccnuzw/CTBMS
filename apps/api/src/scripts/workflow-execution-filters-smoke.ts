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
class WorkflowExecutionFiltersSmokeModule implements NestModule {
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

const APP_BOOTSTRAP_MAX_ATTEMPTS = 6;
const APP_BOOTSTRAP_RETRY_DELAY_MS = 2000;
const SMOKE_APP_HOST = '127.0.0.1';
const FETCH_TIMEOUT_MS = 10_000;

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
            candidate = await NestFactory.create(WorkflowExecutionFiltersSmokeModule, {
                logger: false,
            });
            candidate.useGlobalPipes(new ZodValidationPipe());
            await candidate.listen(0, SMOKE_APP_HOST);
            return candidate;
        } catch (error) {
            if (candidate) {
                await candidate.close().catch(() => undefined);
            }
            if (attempt >= APP_BOOTSTRAP_MAX_ATTEMPTS || !isDatabaseUnavailableError(error)) {
                throw error;
            }
            const waitMs = APP_BOOTSTRAP_RETRY_DELAY_MS * attempt;
            console.warn(
                `[workflow:execution-filters:smoke] database unavailable (attempt ${attempt}/${APP_BOOTSTRAP_MAX_ATTEMPTS}), retrying in ${waitMs}ms...`,
            );
            await sleep(waitMs);
        }
    }
    throw new Error('Failed to bootstrap workflow filter smoke app');
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
                riskProfileCode: 'FILTER_SMOKE_PROFILE',
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
    riskProfileCode: overrides.riskProfileCode ?? 'FILTER_SMOKE_PROFILE',
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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const responseText = await response.text();
    assert.equal(response.status, 200, `Expected 200, got ${response.status}, body=${responseText}`);
    return JSON.parse(responseText) as WorkflowExecutionPageResponse;
};

const toIdSet = (page: WorkflowExecutionPageResponse) => new Set(page.data.map((item) => item.id));

const assertExactIds = (
    label: string,
    page: WorkflowExecutionPageResponse,
    expectedIds: string[],
) => {
    const expected = new Set(expectedIds);
    const actual = toIdSet(page);

    assert.equal(
        actual.size,
        expected.size,
        `${label}: unexpected result size, expected=${expected.size}, actual=${actual.size}, actualIds=${[...actual].join(',')}`,
    );

    for (const id of expected) {
        assert.equal(actual.has(id), true, `${label}: missing expected id ${id}`);
    }
};

async function main() {
    let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
    let ownerDefinitionId: string | null = null;
    let otherDefinitionId: string | null = null;

    try {
        app = await bootstrapAppWithRetry();
        const baseUrl = await app.getUrl();

        const ownerUserId = randomUUID();
        const otherUserId = randomUUID();
        const token = `wf_filter_smoke_${Date.now()}`;
        const now = Date.now();

        const t1 = new Date(now - 5 * 60 * 60 * 1000);
        const t2 = new Date(now - 4 * 60 * 60 * 1000);
        const t3 = new Date(now - 3 * 60 * 60 * 1000);
        const t4 = new Date(now - 2 * 60 * 60 * 1000);
        const t5 = new Date(now - 1 * 60 * 60 * 1000);

        const ownerDefinition = await prisma.workflowDefinition.create({
            data: {
                workflowId: `${token}_owner`,
                name: `筛选回归-${token}`,
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
                dslSnapshot: buildDslSnapshot(`${token}_owner`, `筛选回归-${token}`),
                changelog: 'filter smoke',
                createdByUserId: ownerUserId,
                publishedAt: t1,
            },
        });

        const otherDefinition = await prisma.workflowDefinition.create({
            data: {
                workflowId: `${token}_other`,
                name: `筛选回归-${token}-other`,
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
                dslSnapshot: buildDslSnapshot(`${token}_other`, `筛选回归-${token}-other`),
                changelog: 'filter smoke other',
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

        const execHighSummary = await prisma.workflowExecution.create({
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

        const execMediumNoSummarySoftFail = await prisma.workflowExecution.create({
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

        const execErrorRouteSummary = await prisma.workflowExecution.create({
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

        const execFailedBlockedSummary = await prisma.workflowExecution.create({
            data: {
                workflowVersionId: ownerVersion.id,
                triggerType: 'MANUAL',
                triggerUserId: ownerUserId,
                status: 'FAILED',
                startedAt: t5,
                completedAt: t5,
                errorMessage: 'smoke failed',
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
                    workflowExecutionId: execHighSummary.id,
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
                    workflowExecutionId: execMediumNoSummarySoftFail.id,
                    nodeId: 'n1',
                    nodeType: 'analysis',
                    status: 'FAILED',
                    startedAt: t2,
                    completedAt: t2,
                    durationMs: 1,
                    errorMessage: 'soft failure for smoke',
                    inputSnapshot: {},
                    outputSnapshot: {
                        message: 'soft failure for smoke',
                    },
                },
                {
                    workflowExecutionId: execMediumNoSummarySoftFail.id,
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
                    workflowExecutionId: execErrorRouteSummary.id,
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
                    workflowExecutionId: execErrorRouteSummary.id,
                    nodeId: 'n3',
                    nodeType: 'notify',
                    status: 'SKIPPED',
                    startedAt: t3,
                    completedAt: t3,
                    durationMs: 0,
                    errorMessage: 'ROUTE_TO_ERROR: redirected by smoke case',
                    inputSnapshot: {},
                    outputSnapshot: {
                        skipped: true,
                    },
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
                    workflowExecutionId: execFailedBlockedSummary.id,
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

        assertExactIds(
            'all-by-workflow',
            await fetchExecutionPage(baseUrl, ownerUserId, baseQuery),
            [
                execHighSummary.id,
                execMediumNoSummarySoftFail.id,
                execErrorRouteSummary.id,
                execNoRiskNode.id,
                execFailedBlockedSummary.id,
            ],
        );

        assertExactIds(
            'status-failed',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                status: 'FAILED',
            }),
            [execFailedBlockedSummary.id],
        );

        assertExactIds(
            'trigger-api',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                triggerType: 'API',
            }),
            [execErrorRouteSummary.id],
        );

        assertExactIds(
            'has-risk-gate-node-true',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskGateNode: true,
            }),
            [
                execHighSummary.id,
                execMediumNoSummarySoftFail.id,
                execErrorRouteSummary.id,
                execFailedBlockedSummary.id,
            ],
        );

        assertExactIds(
            'has-risk-gate-node-false',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskGateNode: false,
            }),
            [execNoRiskNode.id],
        );

        assertExactIds(
            'has-risk-summary-true',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskSummary: true,
            }),
            [execHighSummary.id, execErrorRouteSummary.id, execFailedBlockedSummary.id],
        );

        assertExactIds(
            'has-risk-summary-false',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskSummary: false,
            }),
            [execMediumNoSummarySoftFail.id, execNoRiskNode.id],
        );

        assertExactIds(
            'missing-summary-and-risk-node',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskSummary: false,
                hasRiskGateNode: true,
            }),
            [execMediumNoSummarySoftFail.id],
        );

        assertExactIds(
            'risk-level-high',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                riskLevel: 'HIGH',
            }),
            [execHighSummary.id, execFailedBlockedSummary.id],
        );

        assertExactIds(
            'degrade-action-hold',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                degradeAction: 'HOLD',
            }),
            [execHighSummary.id],
        );

        assertExactIds(
            'risk-profile-code',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                riskProfileCode: 'FILTER_PROFILE_B',
            }),
            [execMediumNoSummarySoftFail.id],
        );

        assertExactIds(
            'risk-reason-keyword',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                riskReasonKeyword: 'volatility',
            }),
            [execHighSummary.id],
        );

        assertExactIds(
            'has-soft-failure',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasSoftFailure: true,
            }),
            [execMediumNoSummarySoftFail.id],
        );

        assertExactIds(
            'has-error-route',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasErrorRoute: true,
            }),
            [execErrorRouteSummary.id],
        );

        assertExactIds(
            'has-risk-blocked',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskBlocked: true,
            }),
            [execHighSummary.id, execFailedBlockedSummary.id],
        );

        assertExactIds(
            'started-at-range',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                startedAtFrom: new Date(t2.getTime() - 60 * 1000).toISOString(),
                startedAtTo: new Date(t3.getTime() + 60 * 1000).toISOString(),
            }),
            [execMediumNoSummarySoftFail.id, execErrorRouteSummary.id],
        );

        assertExactIds(
            'summary-true-plus-reduce',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskSummary: true,
                degradeAction: 'REDUCE',
            }),
            [execFailedBlockedSummary.id],
        );

        assertExactIds(
            'summary-false-plus-medium',
            await fetchExecutionPage(baseUrl, ownerUserId, {
                ...baseQuery,
                hasRiskSummary: false,
                riskLevel: 'MEDIUM',
            }),
            [execMediumNoSummarySoftFail.id],
        );

        const keywordPage = await fetchExecutionPage(baseUrl, ownerUserId, {
            page: 1,
            pageSize: 100,
            keyword: token,
        });
        const keywordIds = toIdSet(keywordPage);
        for (const id of [
            execHighSummary.id,
            execMediumNoSummarySoftFail.id,
            execErrorRouteSummary.id,
            execNoRiskNode.id,
            execFailedBlockedSummary.id,
        ]) {
            assert.equal(keywordIds.has(id), true, `keyword-scope: expected id ${id} to be returned`);
        }
        assert.equal(
            keywordIds.has(execOtherPrivate.id),
            false,
            'keyword-scope: private execution from another owner must not be returned',
        );

        console.log('Workflow execution filters smoke checks passed.');
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
    console.error('Workflow execution filters smoke checks failed:', error);
    process.exitCode = 1;
});
