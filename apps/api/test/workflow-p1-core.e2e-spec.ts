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

const buildDslSnapshot = (
    workflowId: string,
    workflowName: string,
    ownerUserId: string,
    rulePackCode: string,
) => ({
    workflowId,
    name: workflowName,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    ownerUserId,
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
                rulePackCode,
            },
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
            to: 'n_notify',
            edgeType: 'control-edge',
        },
        {
            id: 'e4',
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

async function main() {
    const app = await NestFactory.create(WorkflowP1CoreE2eModule, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0);
    const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    const ownerUserId = randomUUID();
    const token = `wf_p1_core_${Date.now()}`;
    const workflowId = `${token}_workflow`;
    const workflowName = `workflow p1 core ${token}`;
    const rulePackCode = `${token}_RULE_PACK`;

    try {
        const rulePack = await prisma.decisionRulePack.create({
            data: {
                rulePackCode,
                name: `Rule Pack ${token}`,
                ownerUserId,
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
                dslSnapshot: buildDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
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
                dslSnapshot: buildDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
                changelog: 'draft update',
            }),
        });
        assert.equal(createVersion.status, 201);
        assert.equal(createVersion.body.versionCode, '1.0.1');
        assert.equal(createVersion.body.status, 'DRAFT');

        const publishValidation = await fetchJson<{
            valid: boolean;
            issues: Array<{ code: string; message: string }>;
        }>(`${baseUrl}/workflow-definitions/validate-dsl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-virtual-user-id': ownerUserId,
            },
            body: JSON.stringify({
                dslSnapshot: {
                    ...buildDslSnapshot(workflowId, workflowName, ownerUserId, rulePackCode),
                    runPolicy: undefined,
                },
                stage: 'PUBLISH',
            }),
        });
        assert.equal(publishValidation.status, 201);
        assert.equal(publishValidation.body.valid, false);
        assert.ok(
            publishValidation.body.issues.some((issue) => issue.code === 'WF106'),
            `expect WF106 in issues, actual: ${JSON.stringify(publishValidation.body.issues)}`,
        );

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
                publishedByUserId: string;
                publishedAt: string;
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
        assert.equal(latestAudit.publishedByUserId, ownerUserId);

        const publishedAt = new Date(latestAudit.publishedAt);
        const filterFrom = new Date(publishedAt.getTime() - 60 * 1000).toISOString();
        const filterTo = new Date(publishedAt.getTime() + 60 * 1000).toISOString();
        const publishAuditFilterParams = new URLSearchParams({
            workflowVersionId: createVersion.body.id,
            publishedByUserId: ownerUserId,
            publishedAtFrom: filterFrom,
            publishedAtTo: filterTo,
            page: '1',
            pageSize: '20',
        });
        const filteredPublishAudits = await fetchJson<{
            data: Array<{
                workflowVersionId: string;
                publishedByUserId: string;
            }>;
            total: number;
        }>(
            `${baseUrl}/workflow-definitions/${definitionId}/publish-audits?${publishAuditFilterParams.toString()}`,
            {
                headers: {
                    'x-virtual-user-id': ownerUserId,
                },
            },
        );
        assert.equal(filteredPublishAudits.status, 200);
        assert.equal(filteredPublishAudits.body.total, 1);
        assert.equal(filteredPublishAudits.body.data[0]?.workflowVersionId, createVersion.body.id);
        assert.equal(filteredPublishAudits.body.data[0]?.publishedByUserId, ownerUserId);

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
        process.stderr.write(`[workflow-p1-core.e2e] failed: ${error.message}\n${error.stack ?? ''}\n`);
    } else {
        process.stderr.write(`[workflow-p1-core.e2e] failed: ${String(error)}\n`);
    }
    process.exitCode = 1;
});
