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

    const readCoverage = await fetchJson<{
      success: boolean;
      data: {
        windowDays: number;
        fromDate: string;
        toDate: string;
        targetCoverageRate: number;
        totalDataFetchNodes: number;
        standardReadNodes: number;
        legacyReadNodes: number;
        otherSourceNodes: number;
        gateEvaluatedNodes: number;
        gatePassedNodes: number;
        coverageRate: number;
        meetsCoverageTarget: boolean;
        consecutiveCoverageDays: number;
        daily: Array<{
          date: string;
          totalDataFetchNodes: number;
          coverageRate: number;
          meetsTarget: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/read-coverage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        days: 7,
        targetCoverageRate: 0.9,
      }),
    });
    assert.equal(readCoverage.status, 201);
    assert.equal(readCoverage.body.success, true);
    assert.equal(readCoverage.body.data.windowDays, 7);
    assert.equal(readCoverage.body.data.targetCoverageRate, 0.9);
    assert.equal(readCoverage.body.data.daily.length, 7);

    const rollbackDrillCreated = await fetchJson<{
      success: boolean;
      data: {
        drillId: string;
        dataset: string;
        status: string;
        workflowVersionId?: string;
        scenario: string;
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/drills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        scenario: 'standard_to_legacy_weekly_report',
        status: 'PASSED',
        rollbackPath: 'STANDARD_READ->LEGACY_READ',
        notes: 'm1 rehearsal',
      }),
    });
    assert.equal(rollbackDrillCreated.status, 201);
    assert.equal(rollbackDrillCreated.body.success, true);
    assert.equal(rollbackDrillCreated.body.data.dataset, 'SPOT_PRICE');
    assert.equal(rollbackDrillCreated.body.data.status, 'PASSED');

    const rollbackDrills = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          drillId: string;
          dataset: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/drills?page=1&pageSize=20&dataset=SPOT_PRICE&status=PASSED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(rollbackDrills.status, 200);
    assert.equal(rollbackDrills.body.success, true);
    assert.ok(rollbackDrills.body.data.total >= 1);
    assert.ok(
      rollbackDrills.body.data.items.some(
        (item) => item.drillId === rollbackDrillCreated.body.data.drillId,
      ),
    );

    const m1Readiness = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        windowDays: number;
        datasets: string[];
        summary: {
          meetsReconciliationTarget: boolean;
          meetsCoverageTarget: boolean;
          hasRecentRollbackDrillEvidence: boolean;
          ready: boolean;
        };
        coverage: {
          windowDays: number;
          targetCoverageRate: number;
          coverageRate: number;
        };
        reconciliation: Array<{
          dataset: string;
          meetsWindowTarget: boolean;
          consecutivePassedDays: number;
        }>;
        rollbackDrills: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
          drillId?: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1Readiness.status, 200);
    assert.equal(m1Readiness.body.success, true);
    assert.equal(m1Readiness.body.data.windowDays, 7);
    assert.ok(m1Readiness.body.data.datasets.includes('SPOT_PRICE'));
    assert.equal(m1Readiness.body.data.coverage.windowDays, 7);
    assert.ok(m1Readiness.body.data.reconciliation.length >= 1);
    assert.ok(m1Readiness.body.data.rollbackDrills.length >= 1);

    const m1ReadinessReportMarkdown = await fetchJson<{
      success: boolean;
      data: {
        format: string;
        generatedAt: string;
        fileName: string;
        readiness: { windowDays: number; datasets: string[] };
        report: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1ReadinessReportMarkdown.status, 200);
    assert.equal(m1ReadinessReportMarkdown.body.success, true);
    assert.equal(m1ReadinessReportMarkdown.body.data.format, 'markdown');
    assert.equal(m1ReadinessReportMarkdown.body.data.readiness.windowDays, 7);
    assert.ok(m1ReadinessReportMarkdown.body.data.fileName.endsWith('.md'));
    assert.ok(
      m1ReadinessReportMarkdown.body.data.report.includes('Reconciliation M1 Readiness Report'),
    );

    const m1ReadinessReportJson = await fetchJson<{
      success: boolean;
      data: {
        format: string;
        generatedAt: string;
        fileName: string;
        readiness: { windowDays: number; datasets: string[] };
        report: { windowDays: number; datasets: string[] };
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&format=json`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1ReadinessReportJson.status, 200);
    assert.equal(m1ReadinessReportJson.body.success, true);
    assert.equal(m1ReadinessReportJson.body.data.format, 'json');
    assert.equal(m1ReadinessReportJson.body.data.readiness.windowDays, 7);
    assert.equal(m1ReadinessReportJson.body.data.report.windowDays, 7);
    assert.ok(m1ReadinessReportJson.body.data.fileName.endsWith('.json'));

    const reportSnapshotCreated = await fetchJson<{
      success: boolean;
      data: {
        snapshotId: string;
        format: string;
        fileName: string;
        windowDays: number;
        targetCoverageRate: number;
        datasets: string[];
        readiness: {
          summary: {
            ready: boolean;
          };
        };
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        format: 'markdown',
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
      }),
    });
    assert.equal(reportSnapshotCreated.status, 201);
    assert.equal(reportSnapshotCreated.body.success, true);
    assert.equal(reportSnapshotCreated.body.data.format, 'markdown');
    assert.equal(reportSnapshotCreated.body.data.windowDays, 7);
    assert.ok(reportSnapshotCreated.body.data.snapshotId.length > 0);

    const reportSnapshotList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          snapshotId: string;
          format: string;
          fileName: string;
          windowDays: number;
          summary: {
            ready: boolean;
          };
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots?page=1&pageSize=20&format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reportSnapshotList.status, 200);
    assert.equal(reportSnapshotList.body.success, true);
    assert.ok(reportSnapshotList.body.data.total >= 1);
    assert.ok(
      reportSnapshotList.body.data.items.some(
        (item) => item.snapshotId === reportSnapshotCreated.body.data.snapshotId,
      ),
    );

    const reportSnapshotDetail = await fetchJson<{
      success: boolean;
      data: {
        snapshotId: string;
        format: string;
        report: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots/${reportSnapshotCreated.body.data.snapshotId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reportSnapshotDetail.status, 200);
    assert.equal(reportSnapshotDetail.body.success, true);
    assert.equal(
      reportSnapshotDetail.body.data.snapshotId,
      reportSnapshotCreated.body.data.snapshotId,
    );
    assert.ok(reportSnapshotDetail.body.data.report.includes('Reconciliation M1 Readiness Report'));

    const cutoverDecisionCreated = await fetchJson<{
      success: boolean;
      data: {
        decisionId: string;
        status: string;
        reasonCodes: string[];
        reportSnapshotId: string;
        readinessSummary: {
          ready: boolean;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        note: 'm1 cutover gate decision',
      }),
    });
    assert.equal(cutoverDecisionCreated.status, 201);
    assert.equal(cutoverDecisionCreated.body.success, true);
    assert.ok(cutoverDecisionCreated.body.data.decisionId.length > 0);
    assert.ok(cutoverDecisionCreated.body.data.reportSnapshotId.length > 0);
    assert.ok(
      cutoverDecisionCreated.body.data.status === 'APPROVED' ||
        cutoverDecisionCreated.body.data.status === 'REJECTED',
    );

    const cutoverExecute = await fetchJson<{
      success: boolean;
      data: {
        executedAt: string;
        decision: {
          decisionId: string;
          status: string;
        };
        applied: boolean;
        config: {
          standardizedRead: {
            before: boolean;
            after: boolean;
          };
          reconciliationGate: {
            before: boolean;
            after: boolean;
          };
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        note: 'execute cutover gate',
      }),
    });
    assert.equal(cutoverExecute.status, 201);
    assert.equal(cutoverExecute.body.success, true);
    assert.ok(cutoverExecute.body.data.executedAt.length > 0);
    assert.ok(cutoverExecute.body.data.decision.decisionId.length > 0);
    assert.ok(
      cutoverExecute.body.data.decision.status === 'APPROVED' ||
        cutoverExecute.body.data.decision.status === 'REJECTED',
    );
    if (cutoverExecute.body.data.decision.status === 'APPROVED') {
      assert.equal(cutoverExecute.body.data.applied, true);
      assert.equal(cutoverExecute.body.data.config.standardizedRead.after, true);
      assert.equal(cutoverExecute.body.data.config.reconciliationGate.after, true);
    }

    const cutoverRuntimeStatusBeforeRollback = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        datasets: string[];
        config: {
          standardizedRead: {
            enabled: boolean;
            source: string;
            updatedAt: string | null;
          };
          reconciliationGate: {
            enabled: boolean;
            source: string;
            updatedAt: string | null;
          };
        };
        latestCutoverDecision: {
          decisionId: string;
          status: string;
          reportSnapshotId: string;
        } | null;
        rollbackDrillEvidence: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
        }>;
        summary: {
          standardizedReadEnabled: boolean;
          reconciliationGateEnabled: boolean;
          hasRecentRollbackEvidenceAllDatasets: boolean;
          latestDecisionApproved: boolean;
          recommendsRollback: boolean;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/runtime-status?datasets=SPOT_PRICE`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverRuntimeStatusBeforeRollback.status, 200);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.success, true);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.data.datasets.length, 1);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.data.datasets[0], 'SPOT_PRICE');

    const rollbackExecute = await fetchJson<{
      success: boolean;
      data: {
        executedAt: string;
        applied: boolean;
        datasets: string[];
        config: {
          standardizedRead: {
            before: boolean;
            after: boolean;
          };
          reconciliationGate: {
            before: boolean;
            after: boolean;
          };
        };
        rollbackDrills: Array<{
          drillId: string;
          dataset: string;
          status: string;
          storage: string;
          createdAt: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        datasets: ['SPOT_PRICE'],
        disableReconciliationGate: true,
        note: 'execute rollback gate',
        reason: 'stability drill',
      }),
    });
    assert.equal(rollbackExecute.status, 201);
    assert.equal(rollbackExecute.body.success, true);
    assert.ok(rollbackExecute.body.data.executedAt.length > 0);
    assert.equal(rollbackExecute.body.data.datasets.length, 1);
    assert.equal(rollbackExecute.body.data.datasets[0], 'SPOT_PRICE');
    assert.equal(rollbackExecute.body.data.config.standardizedRead.after, false);
    assert.equal(rollbackExecute.body.data.config.reconciliationGate.after, false);
    assert.equal(rollbackExecute.body.data.rollbackDrills.length, 1);
    assert.equal(rollbackExecute.body.data.rollbackDrills[0].dataset, 'SPOT_PRICE');
    assert.equal(rollbackExecute.body.data.rollbackDrills[0].status, 'PASSED');

    const cutoverRuntimeStatusAfterRollback = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        datasets: string[];
        config: {
          standardizedRead: {
            enabled: boolean;
          };
          reconciliationGate: {
            enabled: boolean;
          };
        };
        rollbackDrillEvidence: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
          drillId?: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/runtime-status?datasets=SPOT_PRICE`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverRuntimeStatusAfterRollback.status, 200);
    assert.equal(cutoverRuntimeStatusAfterRollback.body.success, true);
    assert.equal(
      cutoverRuntimeStatusAfterRollback.body.data.config.standardizedRead.enabled,
      false,
    );
    assert.equal(
      cutoverRuntimeStatusAfterRollback.body.data.config.reconciliationGate.enabled,
      false,
    );
    assert.ok(cutoverRuntimeStatusAfterRollback.body.data.rollbackDrillEvidence.length >= 1);
    const latestSpotRollbackEvidence =
      cutoverRuntimeStatusAfterRollback.body.data.rollbackDrillEvidence.find(
        (item) => item.dataset === 'SPOT_PRICE',
      );
    assert.ok(latestSpotRollbackEvidence);
    if (latestSpotRollbackEvidence) {
      assert.equal(latestSpotRollbackEvidence.exists, true);
      assert.equal(latestSpotRollbackEvidence.passed, true);
    }

    const cutoverAutopilot = await fetchJson<{
      success: boolean;
      data: {
        executedAt: string;
        action: string;
        dryRun: boolean;
        decision: {
          decisionId: string;
          status: string;
          reasonCodes: string[];
          reportSnapshotId: string;
        };
        cutover?: {
          applied: boolean;
          config: {
            standardizedRead: {
              before: boolean;
              after: boolean;
            };
            reconciliationGate: {
              before: boolean;
              after: boolean;
            };
          };
        };
        rollback?: {
          applied: boolean;
          datasets: string[];
          config: {
            standardizedRead: {
              before: boolean;
              after: boolean;
            };
            reconciliationGate: {
              before: boolean;
              after: boolean;
            };
          };
          rollbackDrills: Array<{
            drillId: string;
            dataset: string;
            status: string;
          }>;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/autopilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        onRejectedAction: 'ROLLBACK',
        disableReconciliationGate: true,
        rollbackReason: 'autopilot_rejected',
        note: 'autopilot gate execution',
      }),
    });
    assert.equal(cutoverAutopilot.status, 201);
    assert.equal(cutoverAutopilot.body.success, true);
    assert.ok(cutoverAutopilot.body.data.executedAt.length > 0);
    assert.equal(cutoverAutopilot.body.data.dryRun, false);
    assert.ok(cutoverAutopilot.body.data.decision.decisionId.length > 0);
    assert.ok(
      cutoverAutopilot.body.data.decision.status === 'APPROVED' ||
        cutoverAutopilot.body.data.decision.status === 'REJECTED',
    );
    assert.ok(
      cutoverAutopilot.body.data.action === 'CUTOVER' ||
        cutoverAutopilot.body.data.action === 'ROLLBACK' ||
        cutoverAutopilot.body.data.action === 'NONE',
    );
    if (cutoverAutopilot.body.data.action === 'CUTOVER') {
      assert.ok(cutoverAutopilot.body.data.cutover);
      if (cutoverAutopilot.body.data.cutover) {
        assert.equal(cutoverAutopilot.body.data.cutover.config.standardizedRead.after, true);
      }
    }
    if (cutoverAutopilot.body.data.action === 'ROLLBACK') {
      assert.ok(cutoverAutopilot.body.data.rollback);
      if (cutoverAutopilot.body.data.rollback) {
        assert.equal(cutoverAutopilot.body.data.rollback.config.standardizedRead.after, false);
        assert.ok(cutoverAutopilot.body.data.rollback.rollbackDrills.length >= 1);
      }
    }

    const cutoverAutopilotDryRun = await fetchJson<{
      success: boolean;
      data: {
        action: string;
        dryRun: boolean;
        decision: {
          decisionId: string;
          status: string;
        };
        cutover?: unknown;
        rollback?: unknown;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/autopilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        onRejectedAction: 'ROLLBACK',
        dryRun: true,
        note: 'autopilot dry run',
      }),
    });
    assert.equal(cutoverAutopilotDryRun.status, 201);
    assert.equal(cutoverAutopilotDryRun.body.success, true);
    assert.equal(cutoverAutopilotDryRun.body.data.action, 'NONE');
    assert.equal(cutoverAutopilotDryRun.body.data.dryRun, true);
    assert.ok(cutoverAutopilotDryRun.body.data.decision.decisionId.length > 0);
    assert.equal(cutoverAutopilotDryRun.body.data.cutover, undefined);
    assert.equal(cutoverAutopilotDryRun.body.data.rollback, undefined);

    const cutoverDecisionList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          decisionId: string;
          status: string;
          reportSnapshotId: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/decisions?page=1&pageSize=20`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverDecisionList.status, 200);
    assert.equal(cutoverDecisionList.body.success, true);
    assert.ok(cutoverDecisionList.body.data.total >= 1);
    assert.ok(
      cutoverDecisionList.body.data.items.some(
        (item) => item.decisionId === cutoverDecisionCreated.body.data.decisionId,
      ),
    );

    const cutoverDecisionDetail = await fetchJson<{
      success: boolean;
      data: {
        decisionId: string;
        status: string;
        reportSnapshotId: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/decisions/${cutoverDecisionCreated.body.data.decisionId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(cutoverDecisionDetail.status, 200);
    assert.equal(cutoverDecisionDetail.body.success, true);
    assert.equal(
      cutoverDecisionDetail.body.data.decisionId,
      cutoverDecisionCreated.body.data.decisionId,
    );

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
