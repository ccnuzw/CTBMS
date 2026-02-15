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
    ownerUserId: string;
    rulePackCode: string;
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
    ownerUserId: params.ownerUserId,
    nodes: [
        {
            id: 'n_trigger',
            type: 'manual-trigger',
            name: 'manual trigger',
            enabled: true,
            config: {},
        },
        {
            id: 'n_rule_eval',
            type: 'rule-eval',
            name: 'rule eval',
            enabled: true,
            config: {
                rulePackCode: params.rulePackCode,
            },
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
        {
            id: 'n_data_evidence',
            type: 'mock-fetch',
            name: 'mock fetch',
            enabled: true,
            config: {},
        },
        {
            id: 'n_model_evidence',
            type: 'single-agent',
            name: 'single agent',
            enabled: true,
            config: {},
        },
    ],
    edges: [
        {
            id: 'e1',
            from: 'n_trigger',
            to: 'n_rule_eval',
            edgeType: 'control-edge',
        },
        {
            id: 'e2',
            from: 'n_rule_eval',
            to: 'n_risk_gate',
            edgeType: 'control-edge',
        },
        {
            id: 'e3',
            from: 'n_risk_gate',
            to: 'n_passthrough',
            edgeType: 'control-edge',
        },
        {
            id: 'e4',
            from: 'n_passthrough',
            to: 'n_notify',
            edgeType: 'control-edge',
        },
        {
            id: 'e5',
            from: 'n_data_evidence',
            to: 'n_model_evidence',
            edgeType: 'control-edge',
        },
    ],
    runPolicy: {
        nodeDefaults: {
            timeoutMs: 30000,
            retryCount: 1,
            retryBackoffMs: 2000,
            onError: 'FAIL_FAST',
        },
    },
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
    rulePackCode: string;
    workflowId: string;
    name: string;
    templateSource?: 'PRIVATE' | 'PUBLIC';
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
            templateSource: params.templateSource ?? 'PRIVATE',
            dslSnapshot: createDslSnapshot({
                workflowId: params.workflowId,
                name: params.name,
                ownerUserId: params.ownerUserId,
                rulePackCode: params.rulePackCode,
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
    const outsiderUserId = randomUUID();
    const token = `wf_p2_reliability_${Date.now()}`;
    const rulePackCode = `${token}_RULE_PACK`;

    try {
        const rulePack = await prisma.decisionRulePack.create({
            data: {
                rulePackCode,
                name: `Rule Pack ${token}`,
                ownerUserId,
                templateSource: 'PUBLIC',
                version: 2,
            },
        });
        await prisma.decisionRule.create({
            data: {
                rulePackId: rulePack.id,
                ruleCode: `${token}_RULE_1`,
                name: 'score guard',
                fieldPath: 'score',
                operator: 'GT',
                expectedValue: 0,
                weight: 1,
            },
        });

        const idempotentDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            rulePackCode,
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
            rulePackCode,
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

        const publicCancelDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            rulePackCode,
            workflowId: `${token}_public_cancel`,
            name: `workflow public cancel ${token}`,
            templateSource: 'PUBLIC',
            passthroughDelayMs: 4000,
            passthroughTimeoutMs: 20_000,
        });

        const publicTriggerPromise = fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: publicCancelDef.definitionId,
                workflowVersionId: publicCancelDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `public_cancel_${token}`,
            }),
        });

        await sleep(300);
        const runningPublicExecution = await prisma.workflowExecution.findFirst({
            where: {
                workflowVersionId: publicCancelDef.publishedVersionId,
                status: 'RUNNING',
            },
            orderBy: { createdAt: 'desc' },
        });
        assert.ok(runningPublicExecution, 'expected running execution for public cancel case');

        const outsiderCancelResponse = await fetchJson<{ message?: string }>(
            `${baseUrl}/workflow-executions/${runningPublicExecution!.id}/cancel`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-virtual-user-id': outsiderUserId,
                },
                body: JSON.stringify({
                    reason: 'outsider cancel should fail',
                }),
            },
        );
        assert.equal(outsiderCancelResponse.status, 404);

        const ownerCancelPublicResponse = await fetchJson<{ status: string }>(
            `${baseUrl}/workflow-executions/${runningPublicExecution!.id}/cancel`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-virtual-user-id': ownerUserId,
                },
                body: JSON.stringify({
                    reason: 'owner cleanup cancel',
                }),
            },
        );
        assert.equal(ownerCancelPublicResponse.status, 201);
        assert.equal(ownerCancelPublicResponse.body.status, 'CANCELED');

        const publicTriggerResult = await publicTriggerPromise;
        assert.equal(publicTriggerResult.status, 201);
        assert.equal(publicTriggerResult.body.status, 'CANCELED');

        const visibilityDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            rulePackCode,
            workflowId: `${token}_public_visibility`,
            name: `workflow public visibility ${token}`,
            templateSource: 'PUBLIC',
        });

        const ownerVisibilityTrigger = await fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: visibilityDef.definitionId,
                workflowVersionId: visibilityDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `visibility_owner_${token}`,
            }),
        });
        assert.equal(ownerVisibilityTrigger.status, 201);
        assert.equal(ownerVisibilityTrigger.body.status, 'SUCCESS');

        const outsiderVisibilityTrigger = await fetchJson<{ id: string; status: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': outsiderUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: visibilityDef.definitionId,
                workflowVersionId: visibilityDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `visibility_outsider_${token}`,
            }),
        });
        assert.equal(outsiderVisibilityTrigger.status, 201);
        assert.equal(outsiderVisibilityTrigger.body.status, 'SUCCESS');

        const outsiderVisibilityList = await fetchJson<{
            data: Array<{ id: string }>;
            total: number;
        }>(`${baseUrl}/workflow-executions?workflowDefinitionId=${visibilityDef.definitionId}`, {
            headers: {
                'x-virtual-user-id': outsiderUserId,
            },
        });
        assert.equal(outsiderVisibilityList.status, 200);
        assert.ok(outsiderVisibilityList.body.data.some((item) => item.id === outsiderVisibilityTrigger.body.id));
        assert.ok(!outsiderVisibilityList.body.data.some((item) => item.id === ownerVisibilityTrigger.body.id));

        const outsiderReadOwnerExecution = await fetchJson<{ message?: string }>(
            `${baseUrl}/workflow-executions/${ownerVisibilityTrigger.body.id}`,
            {
                headers: {
                    'x-virtual-user-id': outsiderUserId,
                },
            },
        );
        assert.equal(outsiderReadOwnerExecution.status, 404);

        const outsiderReadOwnerTimeline = await fetchJson<{ message?: string }>(
            `${baseUrl}/workflow-executions/${ownerVisibilityTrigger.body.id}/timeline`,
            {
                headers: {
                    'x-virtual-user-id': outsiderUserId,
                },
            },
        );
        assert.equal(outsiderReadOwnerTimeline.status, 404);

        const ownerVisibilityList = await fetchJson<{
            data: Array<{ id: string }>;
        }>(`${baseUrl}/workflow-executions?workflowDefinitionId=${visibilityDef.definitionId}`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(ownerVisibilityList.status, 200);
        assert.ok(ownerVisibilityList.body.data.some((item) => item.id === ownerVisibilityTrigger.body.id));
        assert.ok(ownerVisibilityList.body.data.some((item) => item.id === outsiderVisibilityTrigger.body.id));

        const timeoutDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            rulePackCode,
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

        const publicTimeoutDef = await createAndPublishDefinition({
            baseUrl,
            ownerUserId,
            rulePackCode,
            workflowId: `${token}_public_timeout`,
            name: `workflow public timeout ${token}`,
            templateSource: 'PUBLIC',
            passthroughDelayMs: 1500,
            passthroughTimeoutMs: 1000,
            passthroughRetryCount: 0,
        });

        const publicTimeoutTrigger = await fetchJson<{ message?: string }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: publicTimeoutDef.definitionId,
                workflowVersionId: publicTimeoutDef.publishedVersionId,
                triggerType: 'MANUAL',
                idempotencyKey: `public_timeout_${token}`,
            }),
        });
        assert.equal(publicTimeoutTrigger.status, 500);

        const publicTimeoutExecution = await prisma.workflowExecution.findFirst({
            where: {
                workflowVersionId: publicTimeoutDef.publishedVersionId,
            },
            orderBy: { createdAt: 'desc' },
        });
        assert.ok(publicTimeoutExecution);
        assert.equal(publicTimeoutExecution?.status, 'FAILED');

        const outsiderRerunResponse = await fetchJson<{ message?: string }>(
            `${baseUrl}/workflow-executions/${publicTimeoutExecution!.id}/rerun`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-virtual-user-id': outsiderUserId,
                },
            },
        );
        assert.equal(outsiderRerunResponse.status, 404);

        process.stdout.write('[workflow-p2-reliability.e2e] passed\n');
    } finally {
        await prisma.workflowDefinition.deleteMany({
            where: {
                workflowId: {
                    startsWith: token,
                },
            },
        });
        await prisma.decisionRulePack.deleteMany({
            where: {
                rulePackCode: {
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
