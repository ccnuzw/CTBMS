import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { TemplateCatalogModule } from '../src/modules/template-catalog';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, TemplateCatalogModule],
})
class TemplateCatalogE2eModule implements NestModule {
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
  const app = await NestFactory.create(TemplateCatalogE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const nonPrivilegedUserId = randomUUID();
  const templateCode = `TPL_E2E_${Date.now()}`;
  const workflowId = `wf-tpl-e2e-${Date.now()}`;
  const nonPrivilegedWorkflowId = `wf-tpl-e2e-non-priv-${Date.now()}`;

  let definitionId: string | undefined;
  let versionId: string | undefined;
  let templateId: string | undefined;
  let nonPrivilegedDefinitionId: string | undefined;
  let nonPrivilegedVersionId: string | undefined;
  let nonPrivilegedTemplateId: string | undefined;

  try {
    // ── Seed prerequisite data: user + workflow definition + version ──

    // Ensure test user exists (MockAuthMiddleware needs a real user for authorName lookup)
    await prisma.user.upsert({
      where: { id: ownerUserId },
      update: {},
      create: {
        id: ownerUserId,
        username: `tpl-e2e-${Date.now()}`,
        email: `tpl-e2e-${Date.now()}@test.com`,
        name: 'Template E2E User',
      },
    });
    await prisma.user.upsert({
      where: { id: nonPrivilegedUserId },
      update: {},
      create: {
        id: nonPrivilegedUserId,
        username: `tpl-non-priv-${Date.now()}`,
        email: `tpl-non-priv-${Date.now()}@test.com`,
        name: 'Template Non Privileged User',
      },
    });

    const templateAdminRole = await prisma.role.upsert({
      where: { code: 'TEMPLATE_ADMIN' },
      update: {
        name: '模板管理员',
      },
      create: {
        name: '模板管理员',
        code: 'TEMPLATE_ADMIN',
        isSystem: true,
      },
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: ownerUserId,
          roleId: templateAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: ownerUserId,
        roleId: templateAdminRole.id,
      },
    });

    const definition = await prisma.workflowDefinition.create({
      data: {
        workflowId,
        name: 'Template Source Workflow',
        ownerUserId,
        mode: 'LINEAR',
        usageMethod: 'COPILOT',
        status: 'ACTIVE',
      },
    });
    definitionId = definition.id;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowDefinitionId: definition.id,
        versionCode: 'v1.0.0',
        dslSnapshot: {
          nodes: [
            { id: 'start', type: 'manual-trigger', data: {} },
            { id: 'fetch', type: 'data-fetch', data: {} },
          ],
          edges: [{ source: 'start', target: 'fetch' }],
        },
        status: 'PUBLISHED',
        createdByUserId: ownerUserId,
      },
    });
    versionId = version.id;

    const nonPrivilegedDefinition = await prisma.workflowDefinition.create({
      data: {
        workflowId: nonPrivilegedWorkflowId,
        name: 'Template Source Workflow Non Privileged',
        ownerUserId: nonPrivilegedUserId,
        mode: 'LINEAR',
        usageMethod: 'COPILOT',
        status: 'ACTIVE',
      },
    });
    nonPrivilegedDefinitionId = nonPrivilegedDefinition.id;

    const nonPrivilegedVersion = await prisma.workflowVersion.create({
      data: {
        workflowDefinitionId: nonPrivilegedDefinition.id,
        versionCode: 'v1.0.0',
        dslSnapshot: {
          nodes: [
            { id: 'start', type: 'manual-trigger', data: {} },
            { id: 'fetch', type: 'data-fetch', data: {} },
          ],
          edges: [{ source: 'start', target: 'fetch' }],
        },
        status: 'PUBLISHED',
        createdByUserId: nonPrivilegedUserId,
      },
    });
    nonPrivilegedVersionId = nonPrivilegedVersion.id;

    // ── Test 1: Non-privileged user cannot create public template ──
    const nonPrivilegedCreate = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': nonPrivilegedUserId,
        },
        body: JSON.stringify({
          sourceVersionId: nonPrivilegedVersionId,
          sourceWorkflowDefinitionId: nonPrivilegedDefinitionId,
          templateCode: `${templateCode}_NON_PRIV`,
          name: 'Non Privileged Create',
          category: 'TRADING',
        }),
      },
    );
    assert.equal(nonPrivilegedCreate.status, 403);

    // ── Test 2: Create template from workflow version ──
    const created = await fetchJson<{
      id: string;
      templateCode: string;
      name: string;
      status: string;
      nodeCount: number;
      edgeCount: number;
    }>(`${baseUrl}/template-catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        sourceVersionId: versionId,
        sourceWorkflowDefinitionId: definitionId,
        templateCode,
        name: 'E2E Test Template',
        description: 'Created by E2E test',
        category: 'TRADING',
        tags: ['e2e', 'test'],
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.templateCode, templateCode);
    assert.equal(created.body.name, 'E2E Test Template');
    assert.equal(created.body.status, 'DRAFT');
    assert.equal(created.body.nodeCount, 2);
    assert.equal(created.body.edgeCount, 1);
    templateId = created.body.id;

    // ── Test 3: Get template detail ──
    const detail = await fetchJson<{ id: string; templateCode: string }>(
      `${baseUrl}/template-catalog/${templateId}`,
      {
        method: 'GET',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.templateCode, templateCode);

    // ── Test 4: Update template ──
    const updated = await fetchJson<{ id: string; name: string; description: string }>(
      `${baseUrl}/template-catalog/${templateId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          name: 'Updated E2E Template',
          description: 'Updated description',
        }),
      },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, 'Updated E2E Template');

    // ── Test 5: List my templates ──
    const myTemplates = await fetchJson<{
      data: Array<{ id: string }>;
      total: number;
    }>(`${baseUrl}/template-catalog/mine`, {
      method: 'GET',
      headers: { 'x-virtual-user-id': ownerUserId },
    });
    assert.equal(myTemplates.status, 200);
    assert.ok(myTemplates.body.total >= 1, 'should have at least 1 template');
    const found = myTemplates.body.data.find((t) => t.id === templateId);
    assert.ok(found, 'my templates should contain the created template');

    // ── Test 6: Public listing does NOT include DRAFT templates ──
    const publicList = await fetchJson<{
      data: Array<{ id: string }>;
      total: number;
    }>(`${baseUrl}/template-catalog`, { method: 'GET' });
    assert.equal(publicList.status, 200);
    const draftInPublic = publicList.body.data.find((t) => t.id === templateId);
    assert.equal(draftInPublic, undefined, 'DRAFT template should not appear in public listing');

    // ── Test 7: Quickstart business templates should expose 4 canonical scenarios ──
    const quickstartTemplates = await fetchJson<{
      templates: Array<{
        code: string;
        connectorCreateDrafts: Array<{ connectorCode: string; sourceDomain: string }>;
        recommendedConnectors: string[];
      }>;
      total: number;
    }>(`${baseUrl}/template-catalog/quickstart/business-templates`, {
      method: 'GET',
      headers: { 'x-virtual-user-id': ownerUserId },
    });
    assert.equal(quickstartTemplates.status, 200);
    assert.ok(quickstartTemplates.body.total >= 4);
    const quickstartCodes = quickstartTemplates.body.templates.map((item) => item.code);
    const expectedQuickstartCodes = [
      'WEEKLY_MARKET_REVIEW',
      'PRICE_ALERT_MONITORING',
      'WEATHER_LOGISTICS_IMPACT',
      'STRATEGY_BACKTEST',
    ];
    for (const code of expectedQuickstartCodes) {
      assert.ok(
        quickstartCodes.includes(code),
        `quickstart templates should include scenario code ${code}`,
      );
    }
    assert.ok(
      quickstartTemplates.body.templates.every(
        (template) =>
          template.connectorCreateDrafts.length >=
          Math.min(template.recommendedConnectors.length, 1),
      ),
      'each quickstart template should provide connector drafts for execution readiness',
    );

    // ── Test 8: Quickstart acceptance checklist should pass run/export/evidence gates ──
    const quickstartChecklist = await fetchJson<{
      strictContract: boolean;
      total: number;
      passed: number;
      failed: number;
      items: Array<{
        code: string;
        passed: boolean;
        failedChecks: string[];
        checks: Array<{ key: string; passed: boolean }>;
      }>;
    }>(
      `${baseUrl}/template-catalog/quickstart/business-templates/acceptance-checklist?strictContract=true`,
      {
        method: 'GET',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(quickstartChecklist.status, 200);
    assert.equal(quickstartChecklist.body.strictContract, true);
    assert.ok(quickstartChecklist.body.total >= 4);
    assert.equal(quickstartChecklist.body.failed, 0);
    assert.equal(quickstartChecklist.body.passed, quickstartChecklist.body.total);
    for (const code of expectedQuickstartCodes) {
      const item = quickstartChecklist.body.items.find((entry) => entry.code === code);
      assert.ok(item, `checklist should include scenario code ${code}`);
      assert.equal(item?.passed, true);
      assert.equal(item?.failedChecks.length, 0);
      const checkKeys = new Set((item?.checks ?? []).map((check) => check.key));
      assert.ok(checkKeys.has('RUN_READY'));
      assert.ok(checkKeys.has('EXPORT_READY'));
      assert.ok(checkKeys.has('EVIDENCE_READY'));
    }

    // ── Test 9: Checklist keyword filter should narrow to weather/logistics scenario ──
    const weatherChecklist = await fetchJson<{
      total: number;
      items: Array<{ code: string }>;
    }>(
      `${baseUrl}/template-catalog/quickstart/business-templates/acceptance-checklist?keyword=${encodeURIComponent('天气')}`,
      {
        method: 'GET',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(weatherChecklist.status, 200);
    assert.equal(weatherChecklist.body.total, 1);
    assert.equal(weatherChecklist.body.items[0]?.code, 'WEATHER_LOGISTICS_IMPACT');

    nonPrivilegedTemplateId = (
      await prisma.templateCatalog.create({
        data: {
          templateCode: `${templateCode}_NON_PRIV_DRAFT`,
          name: 'Non Privileged Draft',
          category: 'TRADING',
          status: 'DRAFT',
          dslSnapshot: {
            nodes: [{ id: 'start', type: 'manual-trigger', data: {} }],
            edges: [],
          },
          authorUserId: nonPrivilegedUserId,
          authorName: 'Template Non Privileged User',
          nodeCount: 1,
          edgeCount: 0,
        },
      })
    ).id;

    // ── Test 10: Non-privileged user cannot publish public template ──
    const nonPrivilegedPublish = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${nonPrivilegedTemplateId}/publish`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': nonPrivilegedUserId },
      },
    );
    assert.equal(nonPrivilegedPublish.status, 403);

    // ── Test 11: Publish template ──
    const published = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/template-catalog/${templateId}/publish`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(published.status, 201);
    assert.equal(published.body.status, 'PUBLISHED');

    // ── Test 12: Published template now appears in public listing ──
    const publicListAfter = await fetchJson<{
      data: Array<{ id: string }>;
    }>(`${baseUrl}/template-catalog`, { method: 'GET' });
    assert.equal(publicListAfter.status, 200);
    const publishedInPublic = publicListAfter.body.data.find((t) => t.id === templateId);
    assert.ok(publishedInPublic, 'PUBLISHED template should appear in public listing');

    // ── Test 13: Duplicate publish returns 400 ──
    const dupPublish = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${templateId}/publish`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(dupPublish.status, 400);

    // ── Test 14: Copy template to workspace ──
    const copied = await fetchJson<{
      id: string;
      workflowId: string;
      name: string;
      templateSource: string;
    }>(`${baseUrl}/template-catalog/copy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        templateId,
        newName: 'Copied Workflow',
      }),
    });
    assert.equal(copied.status, 201);
    assert.equal(copied.body.name, 'Copied Workflow');
    assert.equal(copied.body.templateSource, 'COPIED');

    // Verify usage count incremented
    const afterCopy = await fetchJson<{ id: string; usageCount: number }>(
      `${baseUrl}/template-catalog/${templateId}`,
      {
        method: 'GET',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(afterCopy.status, 200);
    assert.ok(afterCopy.body.usageCount >= 1, 'usage count should be incremented');

    // Clean up copied workflow
    await prisma.workflowVersion
      .deleteMany({ where: { workflowDefinition: { id: copied.body.id } } })
      .catch(() => undefined);
    await prisma.workflowDefinition
      .delete({ where: { id: copied.body.id } })
      .catch(() => undefined);

    // ── Test 15: Archive template ──
    const archived = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/template-catalog/${templateId}/archive`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(archived.status, 201);
    assert.equal(archived.body.status, 'ARCHIVED');

    // ── Test 16: Delete template ──
    const deleted = await fetchJson<{ deleted: boolean }>(
      `${baseUrl}/template-catalog/${templateId}`,
      {
        method: 'DELETE',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    templateId = undefined; // Already deleted

    // ── Test 17: Deleted template returns 404 ──
    const notFound = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${archived.body.id}`,
      { method: 'GET' },
    );
    assert.equal(notFound.status, 404);

    // ── Test 18: Non-owner cannot update ──
    // Create a new template for cross-user test
    const otherTemplate = await fetchJson<{ id: string }>(`${baseUrl}/template-catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        sourceVersionId: versionId,
        sourceWorkflowDefinitionId: definitionId,
        templateCode: `${templateCode}_CROSS`,
        name: 'Cross User Test',
        category: 'TRADING',
      }),
    });
    assert.equal(otherTemplate.status, 201);

    const otherUserId = randomUUID();
    const crossUpdate = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${otherTemplate.body.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': otherUserId,
        },
        body: JSON.stringify({ name: 'Hacked Name' }),
      },
    );
    assert.equal(crossUpdate.status, 404, 'non-owner update should return 404');

    // Cleanup cross-user test template
    await prisma.templateCatalog
      .delete({ where: { id: otherTemplate.body.id } })
      .catch(() => undefined);
    await prisma.templateCatalog
      .delete({ where: { id: nonPrivilegedTemplateId } })
      .catch(() => undefined);
    nonPrivilegedTemplateId = undefined;

    console.log('Template catalog e2e checks passed.');
  } finally {
    // Cleanup
    if (templateId) {
      await prisma.templateCatalog.delete({ where: { id: templateId } }).catch(() => undefined);
    }
    await prisma.templateCatalog
      .deleteMany({ where: { templateCode: { startsWith: templateCode } } })
      .catch(() => undefined);
    if (nonPrivilegedTemplateId) {
      await prisma.templateCatalog
        .delete({ where: { id: nonPrivilegedTemplateId } })
        .catch(() => undefined);
    }
    if (versionId) {
      await prisma.workflowVersion.delete({ where: { id: versionId } }).catch(() => undefined);
    }
    if (definitionId) {
      await prisma.workflowDefinition
        .delete({ where: { id: definitionId } })
        .catch(() => undefined);
    }
    if (nonPrivilegedVersionId) {
      await prisma.workflowVersion
        .delete({ where: { id: nonPrivilegedVersionId } })
        .catch(() => undefined);
    }
    if (nonPrivilegedDefinitionId) {
      await prisma.workflowDefinition
        .delete({ where: { id: nonPrivilegedDefinitionId } })
        .catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: nonPrivilegedUserId } }).catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Template catalog e2e checks failed:', error);
  process.exitCode = 1;
});
