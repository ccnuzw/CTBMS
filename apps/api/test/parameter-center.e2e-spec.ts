import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { ParameterCenterModule } from '../src/modules/parameter-center';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, ParameterCenterModule],
})
class ParameterCenterE2eModule implements NestModule {
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
  const app = await NestFactory.create(ParameterCenterE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `PARAM_SET_${Date.now()}`;

  try {
    const createdSet = await fetchJson<{ id: string; setCode: string }>(
      `${baseUrl}/parameter-sets`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          setCode: token,
          name: `set-${token}`,
          templateSource: 'PRIVATE',
        }),
      },
    );
    assert.equal(createdSet.status, 201);

    const globalItem = await fetchJson<{ id: string }>(
      `${baseUrl}/parameter-sets/${createdSet.body.id}/items`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          paramCode: 'risk.threshold.global',
          paramName: 'global threshold',
          paramType: 'number',
          value: 80,
          scopeLevel: 'GLOBAL',
        }),
      },
    );
    assert.equal(globalItem.status, 201);

    const regionItem = await fetchJson<{ id: string }>(
      `${baseUrl}/parameter-sets/${createdSet.body.id}/items`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          paramCode: 'risk.threshold.region',
          paramName: 'region threshold',
          paramType: 'number',
          value: 70,
          scopeLevel: 'REGION',
          scopeValue: 'NORTH',
        }),
      },
    );
    assert.equal(regionItem.status, 201);

    const resolved = await fetchJson<{
      parameterSetId: string;
      resolved: Array<{ paramCode: string; value: unknown; sourceScope: string }>;
    }>(`${baseUrl}/parameter-sets/${createdSet.body.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        region: 'NORTH',
        sessionOverrides: {
          'risk.threshold.global': 65,
        },
      }),
    });
    assert.equal(resolved.status, 201);
    assert.equal(resolved.body.parameterSetId, createdSet.body.id);

    const byCode = new Map(resolved.body.resolved.map((item) => [item.paramCode, item]));
    assert.equal(byCode.get('risk.threshold.global')?.sourceScope, 'SESSION');
    assert.equal(byCode.get('risk.threshold.global')?.value, 65);
    assert.equal(byCode.get('risk.threshold.region')?.sourceScope, 'REGION');
    assert.equal(byCode.get('risk.threshold.region')?.value, 70);

    console.log('Parameter center e2e checks passed.');
  } finally {
    await prisma.parameterSet
      .deleteMany({
        where: { setCode: token },
      })
      .catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Parameter center e2e checks failed:', error);
  process.exitCode = 1;
});
