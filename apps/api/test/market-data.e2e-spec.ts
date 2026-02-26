import assert from 'node:assert/strict';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { MarketDataModule } from '../src/modules/market-data';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, MarketDataModule],
})
class MarketDataE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

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
  const app = await NestFactory.create(MarketDataE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  try {
    const query = await fetchJson<{
      success: boolean;
      data: { rows: unknown[]; meta: Record<string, unknown> };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        limit: 10,
      }),
    });
    assert.equal(query.status, 201);
    assert.equal(query.body.success, true);
    assert.ok(Array.isArray(query.body.data.rows));

    const aggregate = await fetchJson<{
      success: boolean;
      data: { rows: unknown[]; meta: Record<string, unknown> };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/aggregate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        groupBy: ['commodityCode'],
        metrics: [{ field: 'spotPrice', op: 'avg', as: 'avgSpotPrice' }],
        limit: 100,
      }),
    });
    assert.equal(aggregate.status, 201);
    assert.equal(aggregate.body.success, true);
    assert.ok(Array.isArray(aggregate.body.data.rows));

    const preview = await fetchJson<{
      success: boolean;
      data: { dataset: string; previewRows: unknown[] };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/standardization/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
        'x-trace-id': 'tr_market_data_preview_e2e',
      },
      body: JSON.stringify({
        dataset: 'PRICE_DATA',
        sampleLimit: 5,
        mappingVersion: 'v1',
      }),
    });
    assert.equal(preview.status, 201);
    assert.equal(preview.body.success, true);
    assert.equal(preview.body.data.dataset, 'PRICE_DATA');
    assert.ok(Array.isArray(preview.body.data.previewRows));
    assert.equal(preview.body.traceId, 'tr_market_data_preview_e2e');

    const reconcileCreated = await fetchJson<{
      success: boolean;
      data: { jobId: string; status: string };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        timeRange: {
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        },
        threshold: {
          maxDiffRate: 0.05,
          maxMissingRate: 0.05,
        },
      }),
    });
    assert.equal(reconcileCreated.status, 201);
    assert.equal(reconcileCreated.body.success, true);
    assert.ok(reconcileCreated.body.data.jobId.length > 0);

    const reconcileDetail = await fetchJson<{
      success: boolean;
      data: { jobId: string; status: string };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(reconcileDetail.status, 200);
    assert.equal(reconcileDetail.body.success, true);
    assert.equal(reconcileDetail.body.data.jobId, reconcileCreated.body.data.jobId);

    console.log('Market data e2e checks passed.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Market data e2e checks failed:', error);
  process.exitCode = 1;
});
