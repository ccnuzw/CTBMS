import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { UserConfigBindingModule } from '../src/modules/user-config-binding';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, UserConfigBindingModule],
})
class UserConfigBindingE2eModule implements NestModule {
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
  const app = await NestFactory.create(UserConfigBindingE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const targetId = `PARAM_${Date.now()}`;
  let bindingId: string | undefined;

  try {
    await prisma.user.upsert({
      where: { id: ownerUserId },
      update: {},
      create: {
        id: ownerUserId,
        username: `binding-owner-${Date.now()}`,
        email: `binding-owner-${Date.now()}@test.com`,
        name: 'Binding Owner',
      },
    });
    await prisma.user.upsert({
      where: { id: outsiderUserId },
      update: {},
      create: {
        id: outsiderUserId,
        username: `binding-outsider-${Date.now()}`,
        email: `binding-outsider-${Date.now()}@test.com`,
        name: 'Binding Outsider',
      },
    });

    const created = await fetchJson<{ id: string; bindingType: string; targetId: string; priority: number }>(
      `${baseUrl}/user-config-bindings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          bindingType: 'PARAMETER_SET',
          targetId,
          targetCode: 'CORN_BASE_SET',
          priority: 50,
          metadata: {
            scope: 'GLOBAL',
            source: 'e2e',
          },
        }),
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.bindingType, 'PARAMETER_SET');
    assert.equal(created.body.targetId, targetId);
    bindingId = created.body.id;

    const upserted = await fetchJson<{ id: string; priority: number }>(`${baseUrl}/user-config-bindings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        bindingType: 'PARAMETER_SET',
        targetId,
        targetCode: 'CORN_BASE_SET_V2',
        priority: 20,
        isActive: true,
      }),
    });
    assert.equal(upserted.status, 201);
    assert.equal(upserted.body.id, bindingId);
    assert.equal(upserted.body.priority, 20);

    const list = await fetchJson<{ total: number; data: Array<{ id: string }> }>(
      `${baseUrl}/user-config-bindings?bindingType=PARAMETER_SET`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(list.status, 200);
    assert.ok(list.body.total >= 1);
    assert.ok(list.body.data.some((item) => item.id === bindingId));

    const detail = await fetchJson<{ id: string; targetCode: string }>(
      `${baseUrl}/user-config-bindings/${bindingId}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.id, bindingId);

    const outsiderGet = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/user-config-bindings/${bindingId}`,
      {
        headers: {
          'x-virtual-user-id': outsiderUserId,
        },
      },
    );
    assert.equal(outsiderGet.status, 404);

    const updated = await fetchJson<{ isActive: boolean; priority: number }>(
      `${baseUrl}/user-config-bindings/${bindingId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          isActive: false,
          priority: 10,
          metadata: {
            scope: 'COMMODITY',
            commodity: 'CORN',
          },
        }),
      },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.isActive, false);
    assert.equal(updated.body.priority, 10);

    const inactiveList = await fetchJson<{ total: number; data: Array<{ id: string }> }>(
      `${baseUrl}/user-config-bindings?isActive=false`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(inactiveList.status, 200);
    assert.ok(inactiveList.body.total >= 1);
    assert.ok(inactiveList.body.data.some((item) => item.id === bindingId));

    const removed = await fetchJson<{ deleted: boolean }>(
      `${baseUrl}/user-config-bindings/${bindingId}`,
      {
        method: 'DELETE',
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.deleted, true);
    bindingId = undefined;

    const afterDelete = await fetchJson<{ statusCode: number }>(
      `${baseUrl}/user-config-bindings/${created.body.id}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(afterDelete.status, 404);

    process.stdout.write('user-config-binding e2e passed\n');
  } finally {
    if (bindingId) {
      await prisma.userConfigBinding.delete({ where: { id: bindingId } }).catch(() => undefined);
    }
    await prisma.userConfigBinding.deleteMany({ where: { userId: { in: [ownerUserId, outsiderUserId] } } });
    await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: outsiderUserId } }).catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    process.stderr.write(`user-config-binding e2e failed: ${error.stack ?? error.message}\n`);
  } else {
    process.stderr.write(`user-config-binding e2e failed: ${String(error)}\n`);
  }
  process.exitCode = 1;
});
