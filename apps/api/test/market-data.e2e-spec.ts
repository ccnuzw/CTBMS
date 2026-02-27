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
      data: { jobId: string; status: string; retriedFromJobId: string | null; retryCount: number };
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
    assert.equal(reconcileCreated.body.data.retriedFromJobId, null);
    assert.equal(reconcileCreated.body.data.retryCount, 0);

    const gateEvaluation = await fetchJson<{
      success: boolean;
      data: {
        enabled: boolean;
        passed: boolean;
        reason: string;
        checkedAt: string;
        maxAgeMinutes?: number;
        ageMinutes?: number;
        latest?: { jobId: string; status: string };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/gate/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        filters: {
          commodityCode: 'CORN',
        },
      }),
    });
    assert.equal(gateEvaluation.status, 201);
    assert.equal(gateEvaluation.body.success, true);
    assert.ok(gateEvaluation.body.data.reason.length > 0);
    assert.ok(gateEvaluation.body.data.checkedAt.length > 0);

    const windowMetrics = await fetchJson<{
      success: boolean;
      data: {
        dataset: string;
        windowDays: number;
        source: string;
        totalJobs: number;
        doneJobs: number;
        passedJobs: number;
        daily: Array<{ date: string; passed: boolean; totalJobs: number }>;
        consecutivePassedDays: number;
        meetsWindowTarget: boolean;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/window?dataset=SPOT_PRICE&days=7`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(windowMetrics.status, 200);
    assert.equal(windowMetrics.body.success, true);
    assert.equal(windowMetrics.body.data.dataset, 'SPOT_PRICE');
    assert.equal(windowMetrics.body.data.windowDays, 7);
    assert.equal(windowMetrics.body.data.daily.length, 7);

    const snapshotMetrics = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        windowDays: number;
        source: string;
        results: Array<{
          dataset: string;
          totalJobs: number;
          passedJobs: number;
          consecutivePassedDays: number;
          meetsWindowTarget: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        datasets: ['SPOT_PRICE'],
      }),
    });
    assert.equal(snapshotMetrics.status, 201);
    assert.equal(snapshotMetrics.body.success, true);
    assert.equal(snapshotMetrics.body.data.windowDays, 7);
    assert.ok(snapshotMetrics.body.data.results.some((item) => item.dataset === 'SPOT_PRICE'));

    const dailyMetricsHistory = await fetchJson<{
      success: boolean;
      data: {
        dataset: string;
        windowDays: number;
        days: number;
        source: string;
        items: Array<{
          metricDate: string;
          totalJobs: number;
          doneJobs: number;
          passedJobs: number;
          dayPassed: boolean;
          consecutivePassedDays: number;
          meetsWindowTarget: boolean;
          generatedAt: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/daily?dataset=SPOT_PRICE&windowDays=7&days=30`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(dailyMetricsHistory.status, 200);
    assert.equal(dailyMetricsHistory.body.success, true);
    assert.equal(dailyMetricsHistory.body.data.dataset, 'SPOT_PRICE');
    assert.equal(dailyMetricsHistory.body.data.windowDays, 7);

    const createdAtFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const createdAtTo = new Date().toISOString();

    const reconcileList = await fetchJson<{
      success: boolean;
      data: {
        items: Array<{
          jobId: string;
          status: string;
          dataset: string;
          retriedFromJobId: string | null;
          retryCount: number;
          summaryPass?: boolean;
        }>;
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/jobs?page=1&pageSize=20&dataset=SPOT_PRICE&status=DONE&createdAtFrom=${encodeURIComponent(createdAtFrom)}&createdAtTo=${encodeURIComponent(createdAtTo)}&sortBy=createdAt&sortOrder=desc`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reconcileList.status, 200);
    assert.equal(reconcileList.body.success, true);
    assert.equal(reconcileList.body.data.page, 1);
    assert.equal(reconcileList.body.data.pageSize, 20);
    assert.ok(reconcileList.body.data.total >= 1);
    const createdListItem = reconcileList.body.data.items.find(
      (item) => item.jobId === reconcileCreated.body.data.jobId,
    );
    assert.ok(createdListItem);
    if (createdListItem) {
      assert.equal(createdListItem.retryCount, 0);
    }

    const reconcileDetail = await fetchJson<{
      success: boolean;
      data: {
        jobId: string;
        status: string;
        retriedFromJobId: string | null;
        retryCount: number;
        summaryPass?: boolean;
        summary?: { pass?: boolean };
      };
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
    assert.equal(reconcileDetail.body.data.retriedFromJobId, null);
    assert.equal(reconcileDetail.body.data.retryCount, 0);
    if (
      typeof reconcileDetail.body.data.summaryPass === 'boolean' &&
      typeof reconcileDetail.body.data.summary?.pass === 'boolean'
    ) {
      assert.equal(reconcileDetail.body.data.summaryPass, reconcileDetail.body.data.summary.pass);
    }

    const cancelDone = await fetchJson<{
      statusCode: number;
      message: string | string[];
      error: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        reason: 'manual-cancel-test',
      }),
    });
    assert.equal(cancelDone.status, 400);

    const retry = await fetchJson<{
      success: boolean;
      data: {
        jobId: string;
        status: string;
        dataset: string;
        retryCount: number;
        createdAt: string;
        retriedFromJobId: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}/retry`, {
      method: 'POST',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });

    assert.equal(retry.status, 201);
    assert.equal(retry.body.success, true);
    assert.equal(retry.body.data.retryCount, 1);
    assert.equal(retry.body.data.retriedFromJobId, reconcileCreated.body.data.jobId);
    assert.notEqual(retry.body.data.jobId, reconcileCreated.body.data.jobId);

    const retryDetail = await fetchJson<{
      success: boolean;
      data: { jobId: string; retriedFromJobId: string | null; retryCount: number };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${retry.body.data.jobId}`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(retryDetail.status, 200);
    assert.equal(retryDetail.body.success, true);
    assert.equal(retryDetail.body.data.retriedFromJobId, reconcileCreated.body.data.jobId);
    assert.equal(retryDetail.body.data.retryCount, 1);

    const pass = reconcileDetail.body.data.summary?.pass;
    if (typeof pass === 'boolean') {
      const reconcileListWithPass = await fetchJson<{
        success: boolean;
        data: {
          items: Array<{ jobId: string; retryCount: number; summaryPass?: boolean }>;
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
          storage: string;
        };
        traceId: string;
        ts: string;
      }>(
        `${baseUrl}/market-data/reconciliation/jobs?page=1&pageSize=20&pass=${pass ? 'true' : 'false'}`,
        {
          method: 'GET',
          headers: {
            'x-virtual-user-id': 'admin-user',
          },
        },
      );

      assert.equal(reconcileListWithPass.status, 200);
      assert.equal(reconcileListWithPass.body.success, true);
      for (const item of reconcileListWithPass.body.data.items) {
        if (typeof item.summaryPass === 'boolean') {
          assert.equal(item.summaryPass, pass);
        }
      }
      assert.ok(
        reconcileListWithPass.body.data.items.some(
          (item) => item.jobId === reconcileCreated.body.data.jobId,
        ),
      );
    }

    console.log('Market data e2e checks passed.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Market data e2e checks failed:', error);
  process.exitCode = 1;
});
