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
class WorkflowP1CoreE2eModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(MockAuthMiddleware).forRoutes('*');
    }
}

const prisma = new PrismaClient();

const buildDslSnapshot = (workflowId: string, workflowName: string) => ({
    workflowId,
    name: workflowName,
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
                riskProfileCode: 'P1_CORE_PROFILE',
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

async function main() {
    const app = await NestFactory.create(WorkflowP1CoreE2eModule, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0);
    const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    const ownerUserId = randomUUID();
    const token = `wf_p1_core_${Date.now()}`;
    const workflowId = `${token}_workflow`;
    const workflowName = `workflow p1 core ${token}`;

    try {
        const createDefinition = await fetchJson<{
            definition: { id: string };
            version: { id: string; versionCode: string; status: string };
        }>(`${baseUrl}/workflow-definitions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowId,
                name: workflowName,
                mode: 'LINEAR',
                usageMethod: 'COPILOT',
                templateSource: 'PRIVATE',
                dslSnapshot: buildDslSnapshot(workflowId, workflowName),
                changelog: 'create definition',
            }),
        });
        assert.equal(
            createDefinition.status,
            201,
            `create definition failed: ${JSON.stringify(createDefinition.body)}`,
        );
        const definitionId = createDefinition.body.definition.id;
        const initialVersionId = createDefinition.body.version.id;
        assert.equal(createDefinition.body.version.versionCode, '1.0.0');
        assert.equal(createDefinition.body.version.status, 'DRAFT');

        const createVersion = await fetchJson<{
            id: string;
            versionCode: string;
            status: string;
        }>(`${baseUrl}/workflow-definitions/${definitionId}/versions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                dslSnapshot: buildDslSnapshot(workflowId, workflowName),
                changelog: 'draft update',
            }),
        });
        assert.equal(createVersion.status, 201);
        assert.equal(createVersion.body.versionCode, '1.0.1');
        assert.equal(createVersion.body.status, 'DRAFT');

        const publishVersion = await fetchJson<{
            id: string;
            versionCode: string;
            status: string;
        }>(`${baseUrl}/workflow-definitions/${definitionId}/publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                versionId: createVersion.body.id,
            }),
        });
        assert.equal(publishVersion.status, 201);
        assert.equal(publishVersion.body.id, createVersion.body.id);
        assert.equal(publishVersion.body.versionCode, '1.0.1');
        assert.equal(publishVersion.body.status, 'PUBLISHED');

        const listVersions = await fetchJson<Array<{
            id: string;
            versionCode: string;
            status: string;
        }>>(`${baseUrl}/workflow-definitions/${definitionId}/versions`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(listVersions.status, 200);
        assert.ok(listVersions.body.some((item) => item.id === initialVersionId && item.status === 'DRAFT'));
        assert.ok(listVersions.body.some((item) => item.id === createVersion.body.id && item.status === 'PUBLISHED'));
        assert.ok(listVersions.body.some((item) => item.versionCode === '1.0.2' && item.status === 'DRAFT'));

        const publishAudits = await fetchJson<{
            data: Array<{
                workflowVersionId: string;
                operation: string;
                snapshot: { autoCreatedDraftVersionCode?: string } | null;
            }>;
            total: number;
        }>(`${baseUrl}/workflow-definitions/${definitionId}/publish-audits`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(publishAudits.status, 200);
        assert.ok(publishAudits.body.total >= 1);
        const latestAudit = publishAudits.body.data[0];
        assert.equal(latestAudit.workflowVersionId, createVersion.body.id);
        assert.equal(latestAudit.operation, 'PUBLISH');
        assert.equal(latestAudit.snapshot?.autoCreatedDraftVersionCode, '1.0.2');

        const triggerExecution = await fetchJson<{
            id: string;
            status: string;
        }>(`${baseUrl}/workflow-executions/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                workflowDefinitionId: definitionId,
                workflowVersionId: createVersion.body.id,
                triggerType: 'MANUAL',
                paramSnapshot: {
                    risk: {
                        level: 'MEDIUM',
                    },
                },
            }),
        });
        assert.equal(triggerExecution.status, 201);
        assert.equal(triggerExecution.body.status, 'SUCCESS');

        const executionId = triggerExecution.body.id;
        const executionDetail = await fetchJson<{
            id: string;
            status: string;
            runtimeEvents?: Array<{ eventType: string }>;
            nodeExecutions: Array<{ id: string; status: string }>;
        }>(`${baseUrl}/workflow-executions/${executionId}`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(executionDetail.status, 200);
        assert.equal(executionDetail.body.status, 'SUCCESS');
        assert.ok(Array.isArray(executionDetail.body.runtimeEvents));
        assert.ok((executionDetail.body.runtimeEvents?.length ?? 0) > 0);
        assert.ok(executionDetail.body.nodeExecutions.length > 0);

        const timeline = await fetchJson<{
            data: Array<{ eventType: string }>;
            total: number;
        }>(`${baseUrl}/workflow-executions/${executionId}/timeline`, {
            headers: {
                'x-virtual-user-id': ownerUserId,
            },
        });
        assert.equal(timeline.status, 200);
        assert.ok(timeline.body.total > 0);
        const eventTypes = new Set(timeline.body.data.map((item) => item.eventType));
        assert.ok(eventTypes.has('EXECUTION_STARTED'));
        assert.ok(eventTypes.has('NODE_STARTED'));
        assert.ok(eventTypes.has('NODE_SUCCEEDED'));
        assert.ok(eventTypes.has('EXECUTION_SUCCEEDED'));

        process.stdout.write('[workflow-p1-core.e2e] passed\n');
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
        process.stderr.write(`[workflow-p1-core.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`);
    } else {
        process.stderr.write(`[workflow-p1-core.e2e] failed: ${String(error)}\n`);
    }
    process.exitCode = 1;
});
