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
import { WorkflowDefinitionModule } from '../src/modules/workflow-definition';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { PrismaModule } from '../src/prisma';

@Module({
    imports: [PrismaModule, WorkflowDefinitionModule, WorkflowExecutionModule],
})
class WorkflowP2ReliabilityE2eModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(MockAuthMiddleware).forRoutes('*');
    }
}

const prisma = new PrismaClient();

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createDslSnapshot = (params: {
    workflowId: string;
    name: string;
    passthroughDelayMs?: number;
    passthroughTimeoutMs?: number;
    passthroughRetryCount?: number;
}) => ({
    workflowId: params.workflowId,
    name: params.name,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
        {
            id: 'n_trigger',
            type: 'manual-trigger',
            name: 'manual trigger',
            enabled: true,
            config: {},
        },
        {
            id: 'n_risk_gate',
            type: 'risk-gate',
            name: 'risk gate',
            enabled: true,
            config: {
                riskProfileCode: 'P2_RELIABILITY_PROFILE',
            },
        },
        {
            id: 'n_passthrough',
            type: 'passthrough',
            name: 'passthrough',
            enabled: true,
            config: {
                delayMs: params.passthroughDelayMs ?? 0,
            },
            runtimePolicy: {
                timeoutMs: params.passthroughTimeoutMs ?? 30_000,
                retryCount: params.passthroughRetryCount ?? 0,
                retryBackoffMs: 0,
                onError: 'FAIL_FAST',
            },
        },
        {
            id: 'n_notify',
            type: 'notify',
            name: 'notify',
            enabled: true,
            config: {
                channels: ['DASHBOARD'],
            },
        },
    ],
    edges: [
        {
            id: 'e1',
            from: 'n_trigger',
            to: 'n_risk_gate',
            edgeType: 'control-edge',
        },
        {
            id: 'e2',
            from: 'n_risk_gate',
            to: 'n_passthrough',
            edgeType: 'control-edge',
        },
        {
            id: 'e3',
            from: 'n_passthrough',
            to: 'n_notify',
            edgeType: 'control-edge',
        },
    ],
});

const fetchJson = async <T>(input: string, init: RequestInit): Promise<{ status: number; body: T }> => {
    const response = await fetch(input, init);
    const text = await response.text();
    const body = text ? JSON.parse(text) as T : ({} as T);
    return { status: response.status, body };
};

async function createAndPublishDefinition(params: {
    baseUrl: string;
    ownerUserId: string;
    workflowId: string;
    name: string;
    passthroughDelayMs?: number;
    passthroughTimeoutMs?: number;
    passthroughRetryCount?: number;
}): Promise<{ definitionId: string; publishedVersionId: string }> {
    const createDefinition = await fetchJson<{
        definition: { id: string };
        version: { id: string };
    }>(`${params.baseUrl}/workflow-definitions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-virtual-user-id': params.ownerUserId,
        },
        body: JSON.stringify({
            workflowId: params.workflowId,
            name: params.name,
            mode: 'LINEAR',
            usageMethod: 'COPILOT',
            templateSource: 'PRIVATE',
            dslSnapshot: createDslSnapshot({
                workflowId: params.workflowId,
                name: params.name,
                passthroughDelayMs: params.passthroughDelayMs,
                passthroughTimeoutMs: params.passthroughTimeoutMs,
                passthroughRetryCount: params.passthroughRetryCount,
            }),
            changelog: 'p2 reliability create',
        }),
    });
    assert.equal(createDefinition.status, 201);

    const publishDefinition = await fetchJson<{
        id: string;
        status: string;
    }>(`${params.baseUrl}/workflow-definitions/${createDefinition.body.definition.id}/publish`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-virtual-user-id': params.ownerUserId,
        },
        body: JSON.stringify({
            versionId: createDefinition.body.version.id,
        }),
    });
    assert.equal(publishDefinition.status, 201);
    assert.equal(publishDefinition.body.status, 'PUBLISHED');

    return {
        definitionId: createDefinition.body.definition.id,
        publishedVersionId: publishDefinition.body.id,
    };
}

async function main() {
    const app = await NestFactory.create(WorkflowP2ReliabilityE2eModule, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0);
    const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    const ownerUserId = randomUUID();
    const token = `wf_p2_reliability_${Date.now()}`;

    try {
        const idempotentDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            workflowId: `${token}_idempotent`,
            name: `workflow idempotent ${token}`,
        });

        const idempotencyKey = `idempotency_${token}`;
        const triggerFirst = await fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: idempotentDef.definitionId,
                workflowVersionId: idempotentDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey,
            }),
        });
        assert.equal(triggerFirst.status, 201);
        assert.equal(triggerFirst.body.status, 'SUCCESS');

        const triggerSecond = await fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: idempotentDef.definitionId,
                workflowVersionId: idempotentDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey,
            }),
        });
        assert.equal(triggerSecond.status, 201);
        assert.equal(triggerSecond.body.id, triggerFirst.body.id);

        const sameKeyExecutions = await prisma.workflowExecution.count({
            where: {
                workflowVersionId: idempotentDef.publishedVersionId,
                triggerUserId: ownerUserId,
                idempotencyKey,
            },
        });
        assert.equal(sameKeyExecutions, 1);

        const cancelDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            workflowId: `${token}_cancel`,
            name: `workflow cancel ${token}`,
            passthroughDelayMs: 4000,
            passthroughTimeoutMs: 20_000,
        });

        const triggerCancelablePromise = fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: cancelDef.definitionId,
                workflowVersionId: cancelDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `cancel_${token}`,
            }),
        });

        await sleep(300);
        const runningCancelableExecution = await prisma.workflowExecution.findFirst({
            where: {
                workflowVersionId: cancelDef.publishedVersionId,
                status: 'RUNNING',
            },
            orderBy: { createdAt: 'desc' },
        });
        assert.ok(runningCancelableExecution, 'expected running execution for cancel case');

        const cancelResponse = await fetchJson<{ id: string; status: string }>(
            `${baseUrl}/workflow-executions/${runningCancelableExecution!.id}/cancel`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-virtual-user-id': ownerUserId,
                },
                body: JSON.stringify({
                    reason: 'cancel test',
                }),
            },
        );
        assert.equal(cancelResponse.status, 201);
        assert.equal(cancelResponse.body.status, 'CANCELED');

        const cancelTriggerResult = await triggerCancelablePromise;
        assert.equal(cancelTriggerResult.status, 201);
        assert.equal(cancelTriggerResult.body.status, 'CANCELED');

        const canceledExecution = await prisma.workflowExecution.findUnique({
            where: { id: runningCancelableExecution!.id },
        });
        assert.ok(canceledExecution);
        assert.equal(canceledExecution?.status, 'CANCELED');
        assert.equal(canceledExecution?.failureCategory, 'CANCELED');
        assert.equal(canceledExecution?.failureCode, 'EXECUTION_CANCELED');

        const timeoutDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            workflowId: `${token}_timeout`,
            name: `workflow timeout ${token}`,
            passthroughDelayMs: 1500,
            passthroughTimeoutMs: 1000,
            passthroughRetryCount: 0,
        });

        const timeoutTrigger = await fetchJson<{ message?: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: timeoutDef.definitionId,
                workflowVersionId: timeoutDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `timeout_${token}`,
            }),
        });
        assert.equal(timeoutTrigger.status, 500);

        const timeoutExecution = await prisma.workflowExecution.findFirst({
            where: {
                workflowVersionId: timeoutDef.publishedVersionId,
            },
            orderBy: { createdAt: 'desc' },
            include: {
                nodeExecutions: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        assert.ok(timeoutExecution);
        assert.equal(timeoutExecution?.status, 'FAILED');
        assert.equal(timeoutExecution?.failureCategory, 'TIMEOUT');
        assert.equal(timeoutExecution?.failureCode, 'EXECUTION_TIMEOUT');
        const failedNodeExecution = timeoutExecution?.nodeExecutions.find((item) => item.status === 'FAILED');
        assert.ok(failedNodeExecution);
        assert.equal(failedNodeExecution?.failureCategory, 'TIMEOUT');
        assert.equal(failedNodeExecution?.failureCode, 'NODE_TIMEOUT');

        const timeoutFiltered = await fetchJson<{
            data: Array<{ id: string }>;
        }>(`${baseUrl}/workflow-executions?workflowDefinitionId=${timeoutDef.definitionId}&failureCategory=TIMEOUT`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(timeoutFiltered.status, 200);
        assert.ok(timeoutFiltered.body.data.some((item) => item.id === timeoutExecution?.id));

        process.stdout.write('[workflow-p2-reliability.e2e] passed\n');
    } finally {
        await prisma.workflowDefinition.deleteMany({
            where: {
                workflowId: {
                    startsWith: token,
                },
            },
        });
        await app.close();
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    if (error instanceof Error) {
        process.stderr.write(`[workflow-p2-reliability.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`);
    } else {
        process.stderr.write(`[workflow-p2-reliability.e2e] failed: ${String(error)}\n`);
    }
    process.exitCode = 1;
});
