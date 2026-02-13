import assert from 'node:assert/strict';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { DataConnectorModule } from '../src/modules/data-connector';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, DataConnectorModule],
})
class DataConnectorE2eModule implements NestModule {
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
  const app = await NestFactory.create(DataConnectorE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const token = `${Date.now()}`;
  const dbConnectorCode = `INTERNAL_DB_${token}`;
  const apiConnectorCode = `EXTERNAL_API_${token}`;

  try {
    const createdDb = await fetchJson<{ id: string }>(`${baseUrl}/data-connectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        connectorCode: dbConnectorCode,
        connectorName: 'internal db connector',
        connectorType: 'INTERNAL_DB',
        category: 'PRICE',
        ownerType: 'SYSTEM',
      }),
    });
    assert.equal(createdDb.status, 201);

    const dbHealth = await fetchJson<{ healthy: boolean }>(
      `${baseUrl}/data-connectors/${createdDb.body.id}/health-check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify({ timeoutMs: 500 }),
      },
    );
    assert.equal(dbHealth.status, 201);
    assert.equal(dbHealth.body.healthy, true);

    const createdApi = await fetchJson<{ id: string }>(`${baseUrl}/data-connectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        connectorCode: apiConnectorCode,
        connectorName: 'external api connector',
        connectorType: 'REST_API',
        category: 'FUTURES',
        ownerType: 'ADMIN',
        endpointConfig: {},
      }),
    });
    assert.equal(createdApi.status, 201);

    const apiHealth = await fetchJson<{ healthy: boolean }>(
      `${baseUrl}/data-connectors/${createdApi.body.id}/health-check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify({ timeoutMs: 500 }),
      },
    );
    assert.equal(apiHealth.status, 201);
    assert.equal(apiHealth.body.healthy, false);

    console.log('Data connector e2e checks passed.');
  } finally {
    await prisma.dataConnector
      .deleteMany({
        where: {
          connectorCode: {
            in: [dbConnectorCode, apiConnectorCode],
          },
        },
      })
      .catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Data connector e2e checks failed:', error);
  process.exitCode = 1;
});
