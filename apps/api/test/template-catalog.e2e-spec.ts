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
  const templateCode = `TPL_E2E_${Date.now()}`;
  const workflowId = `wf-tpl-e2e-${Date.now()}`;

  let definitionId: string | undefined;
  let versionId: string | undefined;
  let templateId: string | undefined;

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
        passwordHash: 'not-a-real-hash',
        name: 'Template E2E User',
      },
    });

    const definition = await prisma.workflowDefinition.create({
      data: {
        workflowId,
        name: 'Template Source Workflow',
        ownerUserId,
        status: 'PUBLISHED',
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

    // ── Test 1: Create template from workflow version ──
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

    // ── Test 2: Get template detail ──
    const detail = await fetchJson<{ id: string; templateCode: string }>(
      `${baseUrl}/template-catalog/${templateId}`,
      { method: 'GET' },
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.templateCode, templateCode);

    // ── Test 3: Update template ──
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

    // ── Test 4: List my templates ──
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

    // ── Test 5: Public listing does NOT include DRAFT templates ──
    const publicList = await fetchJson<{
      data: Array<{ id: string }>;
      total: number;
    }>(`${baseUrl}/template-catalog`, { method: 'GET' });
    assert.equal(publicList.status, 200);
    const draftInPublic = publicList.body.data.find((t) => t.id === templateId);
    assert.equal(draftInPublic, undefined, 'DRAFT template should not appear in public listing');

    // ── Test 6: Publish template ──
    const published = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/template-catalog/${templateId}/publish`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(published.status, 201);
    assert.equal(published.body.status, 'PUBLISHED');

    // ── Test 7: Published template now appears in public listing ──
    const publicListAfter = await fetchJson<{
      data: Array<{ id: string }>;
    }>(`${baseUrl}/template-catalog`, { method: 'GET' });
    assert.equal(publicListAfter.status, 200);
    const publishedInPublic = publicListAfter.body.data.find((t) => t.id === templateId);
    assert.ok(publishedInPublic, 'PUBLISHED template should appear in public listing');

    // ── Test 8: Duplicate publish returns 400 ──
    const dupPublish = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${templateId}/publish`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(dupPublish.status, 400);

    // ── Test 9: Copy template to workspace ──
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
      { method: 'GET' },
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

    // ── Test 10: Archive template ──
    const archived = await fetchJson<{ id: string; status: string }>(
      `${baseUrl}/template-catalog/${templateId}/archive`,
      {
        method: 'POST',
        headers: { 'x-virtual-user-id': ownerUserId },
      },
    );
    assert.equal(archived.status, 201);
    assert.equal(archived.body.status, 'ARCHIVED');

    // ── Test 11: Delete template ──
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

    // ── Test 12: Deleted template returns 404 ──
    const notFound = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/template-catalog/${archived.body.id}`,
      { method: 'GET' },
    );
    assert.equal(notFound.status, 404);

    // ── Test 13: Non-owner cannot update ──
    // Create a new template for cross-user test
    const otherTemplate = await fetchJson<{ id: string }>(
      `${baseUrl}/template-catalog`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          sourceVersionId: versionId,
          templateCode: `${templateCode}_CROSS`,
          name: 'Cross User Test',
          category: 'TRADING',
        }),
      },
    );
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

    console.log('Template catalog e2e checks passed.');
  } finally {
    // Cleanup
    if (templateId) {
      await prisma.templateCatalog.delete({ where: { id: templateId } }).catch(() => undefined);
    }
    await prisma.templateCatalog
      .deleteMany({ where: { templateCode: { startsWith: templateCode } } })
      .catch(() => undefined);
    if (versionId) {
      await prisma.workflowVersion.delete({ where: { id: versionId } }).catch(() => undefined);
    }
    if (definitionId) {
      await prisma.workflowDefinition.delete({ where: { id: definitionId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Template catalog e2e checks failed:', error);
  process.exitCode = 1;
});
